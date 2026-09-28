import type { NextFunction, Request, Response } from "express";
import { verifyAccessToken } from "../lib/auth.js";

declare global {
  // Augmenting Express's own global namespace is the only way to extend
  // Request; there is no ES module equivalent for this.
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      userId?: string;
    }
  }
}

/**
 * Requires a valid access token cookie. NEXUS never accepts credentials in
 * the request body/query — only the httpOnly cookie set at login.
 */
export function authenticate(req: Request, res: Response, next: NextFunction): void {
  const token = req.cookies?.nexus_access_token as string | undefined;
  if (!token) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  try {
    const payload = verifyAccessToken(token);
    req.userId = payload.sub;
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired session" });
  }
}
