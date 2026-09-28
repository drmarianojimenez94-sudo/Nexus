import crypto from "node:crypto";
import { Router } from "express";
import type { CookieOptions } from "express";
import { prisma } from "../lib/prisma.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { authenticate } from "../middleware/authenticate.js";
import { HttpError } from "../middleware/errorHandler.js";
import { recordAudit } from "../lib/audit.js";
import { env } from "../lib/env.js";
import {
  buildGoogleAuthUrl,
  exchangeGoogleCode,
  fetchGoogleCalendarEvents,
  isGoogleConfigured,
  refreshGoogleAccessToken,
  revokeGoogleToken,
} from "../lib/googleCalendar.js";
import { decryptToken, encryptToken } from "../lib/tokenCrypto.js";

export const connectorsRouter = Router();
connectorsRouter.use(authenticate);

const OAUTH_STATE_COOKIE = "nexus_oauth_state";
// path:"/" (not scoped to /connectors/*) because the browser only ever sees
// requests under /api/* — Next.js rewrites that to this server without
// rewriting Set-Cookie Path attributes, so anything narrower than "/" would
// silently never come back on the callback request.
const stateCookieOptions: CookieOptions = {
  httpOnly: true,
  secure: env.nodeEnv === "production",
  sameSite: "lax",
  path: "/",
  maxAge: 10 * 60 * 1000,
};

/**
 * GET /connectors/status — what Settings → Integrations reads. Distinguishes
 * "not configured on this server" (no GOOGLE_CLIENT_ID) from "configured but
 * this user hasn't connected it" so the UI can explain instead of guessing.
 */
connectorsRouter.get(
  "/status",
  asyncHandler(async (req, res) => {
    const integrations = await prisma.integration.findMany({
      where: { userId: req.userId },
      select: { provider: true, status: true, errorMessage: true, updatedAt: true },
    });
    res.json({ googleConfigured: isGoogleConfigured, integrations });
  })
);

connectorsRouter.get(
  "/google/authorize",
  asyncHandler(async (req, res) => {
    if (!isGoogleConfigured) {
      throw new HttpError(501, "Google no está configurado en este servidor todavía.");
    }
    const state = crypto.randomBytes(24).toString("hex");
    res.cookie(OAUTH_STATE_COOKIE, state, stateCookieOptions);
    res.json({ authUrl: buildGoogleAuthUrl(state) });
  })
);

/**
 * GET /connectors/google/callback — Google redirects the browser here
 * directly (not a fetch call), so this responds with a redirect back into
 * the app rather than JSON. Protected by `authenticate` same as any other
 * route: the session cookie rides along on this same-origin navigation.
 */
connectorsRouter.get(
  "/google/callback",
  asyncHandler(async (req, res) => {
    const { code, state, error } = req.query as { code?: string; state?: string; error?: string };
    const expectedState = req.cookies?.[OAUTH_STATE_COOKIE] as string | undefined;
    res.clearCookie(OAUTH_STATE_COOKIE, { path: "/" });

    if (error) {
      res.redirect(303, "/settings?google=denied");
      return;
    }
    if (!code || !state || !expectedState || state !== expectedState) {
      res.redirect(303, "/settings?google=error");
      return;
    }

    try {
      const tokens = await exchangeGoogleCode(code);
      const existing = await prisma.integration.findUnique({
        where: { userId_provider: { userId: req.userId!, provider: "google_calendar" } },
      });
      await prisma.integration.upsert({
        where: { userId_provider: { userId: req.userId!, provider: "google_calendar" } },
        create: {
          userId: req.userId!,
          provider: "google_calendar",
          status: "CONNECTED",
          accessToken: encryptToken(tokens.access_token),
          refreshToken: tokens.refresh_token ? encryptToken(tokens.refresh_token) : null,
          expiresAt: new Date(Date.now() + tokens.expires_in * 1000),
          scopes: tokens.scope,
          errorMessage: null,
        },
        update: {
          status: "CONNECTED",
          accessToken: encryptToken(tokens.access_token),
          // Google only returns a refresh_token on the very first consent
          // unless prompt=consent forces a fresh one each time (which we
          // pass) — but keep the old one as a fallback just in case.
          refreshToken: tokens.refresh_token ? encryptToken(tokens.refresh_token) : existing?.refreshToken,
          expiresAt: new Date(Date.now() + tokens.expires_in * 1000),
          scopes: tokens.scope,
          errorMessage: null,
        },
      });
      await recordAudit({
        userId: req.userId!,
        action: "connector.google_calendar.connect",
        entityType: "integration",
        entityId: "google_calendar",
      });
      res.redirect(303, "/settings?connected=google_calendar");
    } catch (err) {
      console.error("Google OAuth callback failed:", err);
      res.redirect(303, "/settings?google=error");
    }
  })
);

connectorsRouter.post(
  "/:provider/disconnect",
  asyncHandler(async (req, res) => {
    const provider = req.params.provider!;
    const existing = await prisma.integration.findUnique({
      where: { userId_provider: { userId: req.userId!, provider } },
    });
    if (!existing) throw new HttpError(404, "No hay una integración conectada para desconectar.");

    if (provider === "google_calendar" && existing.accessToken) {
      await revokeGoogleToken(decryptToken(existing.accessToken));
    }
    await prisma.integration.delete({ where: { id: existing.id } });
    await recordAudit({
      userId: req.userId!,
      action: `connector.${provider}.disconnect`,
      entityType: "integration",
      entityId: provider,
    });
    res.status(204).send();
  })
);

/**
 * POST /connectors/google/sync — pulls events from Google Calendar into the
 * local `events` table (spec: Today/Calendar should never show "two
 * calendars in parallel"). Manual trigger for V1, not automatic on every
 * Today load — predictable API usage, no surprise background calls.
 */
connectorsRouter.post(
  "/google/sync",
  asyncHandler(async (req, res) => {
    const integration = await prisma.integration.findUnique({
      where: { userId_provider: { userId: req.userId!, provider: "google_calendar" } },
    });
    if (!integration || integration.status !== "CONNECTED" || !integration.accessToken) {
      throw new HttpError(400, "Google Calendar no está conectado.");
    }

    let accessToken = decryptToken(integration.accessToken);
    try {
      if (integration.expiresAt && integration.expiresAt.getTime() < Date.now() + 60_000) {
        if (!integration.refreshToken) throw new Error("No refresh token stored");
        const refreshed = await refreshGoogleAccessToken(decryptToken(integration.refreshToken));
        accessToken = refreshed.access_token;
        await prisma.integration.update({
          where: { id: integration.id },
          data: {
            accessToken: encryptToken(refreshed.access_token),
            expiresAt: new Date(Date.now() + refreshed.expires_in * 1000),
          },
        });
      }

      const googleEvents = await fetchGoogleCalendarEvents(accessToken);
      let imported = 0;
      for (const ev of googleEvents) {
        const allDay = Boolean(ev.start.date && !ev.start.dateTime);
        const startAt = new Date(ev.start.dateTime ?? `${ev.start.date}T00:00:00`);
        const endRaw = ev.end?.dateTime ?? (ev.end?.date ? `${ev.end.date}T00:00:00` : undefined);
        await prisma.event.upsert({
          where: {
            userId_externalSource_externalId: {
              userId: req.userId!,
              externalSource: "google_calendar",
              externalId: ev.id,
            },
          },
          create: {
            userId: req.userId!,
            title: ev.summary ?? "(Sin título)",
            description: ev.description ?? null,
            location: ev.location ?? null,
            startAt,
            endAt: endRaw ? new Date(endRaw) : null,
            allDay,
            externalSource: "google_calendar",
            externalId: ev.id,
          },
          update: {
            title: ev.summary ?? "(Sin título)",
            description: ev.description ?? null,
            location: ev.location ?? null,
            startAt,
            endAt: endRaw ? new Date(endRaw) : null,
            allDay,
          },
        });
        imported++;
      }

      await recordAudit({
        userId: req.userId!,
        action: "connector.google_calendar.sync",
        entityType: "integration",
        entityId: "google_calendar",
      });
      res.json({ imported });
    } catch (err) {
      console.error("Google Calendar sync failed:", err);
      await prisma.integration.update({
        where: { id: integration.id },
        data: { status: "ERROR", errorMessage: err instanceof Error ? err.message : "Sync failed" },
      });
      throw new HttpError(502, "No se pudo sincronizar con Google Calendar. Puede que haya que reconectar.");
    }
  })
);
