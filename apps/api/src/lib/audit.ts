import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma.js";

export interface AuditEntry {
  userId: string;
  action: string;
  entityType?: string;
  entityId?: string;
  metadata?: Prisma.InputJsonValue;
}

/**
 * Every NEXUS tool call that reads or writes user data records itself here
 * (spec §46). Write-only; mutations include audit in their transaction.
 */
export async function recordAudit(
  entry: AuditEntry,
  database: Prisma.TransactionClient = prisma,
): Promise<void> {
  await database.auditLog.create({
    data: {
      userId: entry.userId,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId,
      metadata: entry.metadata ?? {},
    },
  });
}
