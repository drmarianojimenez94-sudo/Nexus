import { PrismaClient } from "@prisma/client";

declare global {
  var __nexusPrisma: PrismaClient | undefined;
}

export const prisma = globalThis.__nexusPrisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalThis.__nexusPrisma = prisma;
}
