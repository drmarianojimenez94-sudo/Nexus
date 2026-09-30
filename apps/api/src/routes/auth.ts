import { Router } from "express";
import type { CookieOptions, Response } from "express";
import type { Prisma } from "@prisma/client";
import { loginSchema, registerSchema, type PublicUser } from "@nexus/shared";
import { prisma } from "../lib/prisma.js";
import {
  generateRefreshToken,
  hashPassword,
  hashRefreshToken,
  signAccessToken,
  verifyPassword,
} from "../lib/auth.js";
import { parseDurationMs } from "../lib/duration.js";
import { env } from "../lib/env.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { authenticate } from "../middleware/authenticate.js";
import { HttpError } from "../middleware/errorHandler.js";
import { recordAudit } from "../lib/audit.js";

export const authRouter = Router();

const baseCookieOptions: CookieOptions = {
  httpOnly: true,
  secure: env.nodeEnv === "production",
  sameSite: "lax",
  path: "/",
};

function toPublicUser(user: {
  id: string;
  name: string;
  email: string;
  createdAt: Date;
}): PublicUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    createdAt: user.createdAt.toISOString(),
  };
}

/**
 * Sets the same httpOnly cookies the web app has always used, and always
 * returns the raw tokens too — the native app (apps/mobile) has no browser
 * cookie jar, so it reads them from the response body and stores them
 * itself in expo-secure-store, sending the access token back as
 * `Authorization: Bearer` and the refresh token in the /auth/refresh body.
 * Returning them costs the web client nothing; it just never reads them.
 */
async function issueSession(
  res: Response,
  userId: string,
  database: Prisma.TransactionClient = prisma,
): Promise<{ accessToken: string; refreshToken: string }> {
  const accessToken = signAccessToken(userId);
  const refreshToken = generateRefreshToken();
  const refreshTokenHash = hashRefreshToken(refreshToken);
  const expiresAt = new Date(Date.now() + parseDurationMs(env.refreshTokenTtl));

  await database.refreshToken.create({
    data: { userId, tokenHash: refreshTokenHash, expiresAt },
  });

  res.cookie("nexus_access_token", accessToken, {
    ...baseCookieOptions,
    maxAge: parseDurationMs(env.accessTokenTtl),
  });
  res.cookie("nexus_refresh_token", refreshToken, {
    ...baseCookieOptions,
    maxAge: parseDurationMs(env.refreshTokenTtl),
  });

  return { accessToken, refreshToken };
}

/**
 * True only for the native app, which sends this on every auth call since
 * it has no cookie jar. Gated behind an explicit header (never guessed from
 * User-Agent) so the web client's login/register responses never carry a
 * JS-readable token — the whole point of httpOnly cookies is that page JS,
 * including anything an XSS bug might inject, can't read the access token;
 * unconditionally echoing it back in the JSON body would quietly undo that.
 */
function isMobileClient(req: {
  get(name: string): string | undefined;
}): boolean {
  return req.get("x-nexus-client") === "mobile";
}

authRouter.post(
  "/register",
  asyncHandler(async (req, res) => {
    const input = registerSchema.parse(req.body);
    const existing = await prisma.user.findUnique({
      where: { email: input.email },
    });
    if (existing) {
      throw new HttpError(409, "An account with this email already exists");
    }

    const passwordHash = await hashPassword(input.password);
    const user = await prisma.user.create({
      data: { name: input.name, email: input.email, passwordHash },
    });

    await recordAudit({
      userId: user.id,
      action: "auth.register",
      entityType: "user",
      entityId: user.id,
    });
    const tokens = await issueSession(res, user.id);
    res
      .status(201)
      .json({
        user: toPublicUser(user),
        ...(isMobileClient(req) ? tokens : {}),
      });
  }),
);

authRouter.post(
  "/login",
  asyncHandler(async (req, res) => {
    const input = loginSchema.parse(req.body);
    const user = await prisma.user.findUnique({
      where: { email: input.email },
    });
    if (!user || !(await verifyPassword(input.password, user.passwordHash))) {
      throw new HttpError(401, "Invalid email or password");
    }

    await recordAudit({
      userId: user.id,
      action: "auth.login",
      entityType: "user",
      entityId: user.id,
    });
    const tokens = await issueSession(res, user.id);
    res.json({
      user: toPublicUser(user),
      ...(isMobileClient(req) ? tokens : {}),
    });
  }),
);

authRouter.post(
  "/logout",
  asyncHandler(async (req, res) => {
    const refreshToken =
      (req.cookies?.nexus_refresh_token as string | undefined) ??
      (typeof req.body?.refreshToken === "string"
        ? req.body.refreshToken
        : undefined);
    if (refreshToken) {
      await prisma.refreshToken
        .updateMany({
          where: { tokenHash: hashRefreshToken(refreshToken), revokedAt: null },
          data: { revokedAt: new Date() },
        })
        .catch(() => undefined);
    }
    res.clearCookie("nexus_access_token", baseCookieOptions);
    res.clearCookie("nexus_refresh_token", baseCookieOptions);
    res.status(204).send();
  }),
);

authRouter.post(
  "/refresh",
  asyncHandler(async (req, res) => {
    // Mobile has no cookie jar — it sends the refresh token it stored in
    // expo-secure-store back explicitly in the body instead.
    const refreshToken =
      (req.cookies?.nexus_refresh_token as string | undefined) ??
      (typeof req.body?.refreshToken === "string"
        ? req.body.refreshToken
        : undefined);
    if (!refreshToken) {
      throw new HttpError(401, "Missing refresh token");
    }
    const tokenHash = hashRefreshToken(refreshToken);
    const stored = await prisma.refreshToken.findUnique({
      where: { tokenHash },
    });
    if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
      throw new HttpError(401, "Refresh token expired or revoked");
    }

    // Claim the token once and create its successor in the same transaction.
    // A second request that read the old row before rotation must lose this
    // conditional update, rather than create another valid successor.
    const tokens = await prisma.$transaction(async (tx) => {
      const claimed = await tx.refreshToken.updateMany({
        where: {
          id: stored.id,
          revokedAt: null,
          expiresAt: { gt: new Date() },
        },
        data: { revokedAt: new Date() },
      });
      if (!claimed.count)
        throw new HttpError(401, "Refresh token expired or revoked");
      return issueSession(res, stored.userId, tx);
    });
    if (isMobileClient(req)) {
      res.json(tokens);
    } else {
      res.status(204).send();
    }
  }),
);

authRouter.get(
  "/me",
  authenticate,
  asyncHandler(async (req, res) => {
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: req.userId },
    });
    res.json({ user: toPublicUser(user) });
  }),
);
