import { Router } from "express";
import type { CookieOptions, Response } from "express";
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

function toPublicUser(user: { id: string; name: string; email: string; createdAt: Date }): PublicUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    createdAt: user.createdAt.toISOString(),
  };
}

async function issueSession(res: Response, userId: string) {
  const accessToken = signAccessToken(userId);
  const refreshToken = generateRefreshToken();
  const refreshTokenHash = hashRefreshToken(refreshToken);
  const expiresAt = new Date(Date.now() + parseDurationMs(env.refreshTokenTtl));

  await prisma.refreshToken.create({
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
}

authRouter.post(
  "/register",
  asyncHandler(async (req, res) => {
    const input = registerSchema.parse(req.body);
    const existing = await prisma.user.findUnique({ where: { email: input.email } });
    if (existing) {
      throw new HttpError(409, "An account with this email already exists");
    }

    const passwordHash = await hashPassword(input.password);
    const user = await prisma.user.create({
      data: { name: input.name, email: input.email, passwordHash },
    });

    await recordAudit({ userId: user.id, action: "auth.register", entityType: "user", entityId: user.id });
    await issueSession(res, user.id);
    res.status(201).json({ user: toPublicUser(user) });
  })
);

authRouter.post(
  "/login",
  asyncHandler(async (req, res) => {
    const input = loginSchema.parse(req.body);
    const user = await prisma.user.findUnique({ where: { email: input.email } });
    if (!user || !(await verifyPassword(input.password, user.passwordHash))) {
      throw new HttpError(401, "Invalid email or password");
    }

    await recordAudit({ userId: user.id, action: "auth.login", entityType: "user", entityId: user.id });
    await issueSession(res, user.id);
    res.json({ user: toPublicUser(user) });
  })
);

authRouter.post(
  "/logout",
  asyncHandler(async (req, res) => {
    const refreshToken = req.cookies?.nexus_refresh_token as string | undefined;
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
  })
);

authRouter.post(
  "/refresh",
  asyncHandler(async (req, res) => {
    const refreshToken = req.cookies?.nexus_refresh_token as string | undefined;
    if (!refreshToken) {
      throw new HttpError(401, "Missing refresh token");
    }
    const tokenHash = hashRefreshToken(refreshToken);
    const stored = await prisma.refreshToken.findUnique({ where: { tokenHash } });
    if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
      throw new HttpError(401, "Refresh token expired or revoked");
    }

    await prisma.refreshToken.update({ where: { id: stored.id }, data: { revokedAt: new Date() } });
    await issueSession(res, stored.userId);
    res.status(204).send();
  })
);

authRouter.get(
  "/me",
  authenticate,
  asyncHandler(async (req, res) => {
    const user = await prisma.user.findUniqueOrThrow({ where: { id: req.userId } });
    res.json({ user: toPublicUser(user) });
  })
);
