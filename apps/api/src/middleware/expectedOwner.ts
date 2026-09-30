import type { Request, Response, NextFunction } from "express";
export function expectedOwner(req: Request, res: Response, next: NextFunction) {
  res.set("Cache-Control", "no-store, private");
  const owner = req.get("X-Nexus-Owner");
  if (owner && owner !== req.userId) {
    res
      .status(409)
      .json({
        error: "La cuenta cambió. Volvé a ingresar antes de continuar.",
      });
    return;
  }
  next();
}
