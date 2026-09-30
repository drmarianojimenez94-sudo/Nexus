import { z } from "zod";

/**
 * Anything captured that NEXUS couldn't classify with enough confidence
 * lands here (spec §12). The user captures; NEXUS organizes later.
 */
export const InboxItemStatus = {
  PENDING: "PENDING",
  CLASSIFIED: "CLASSIFIED",
  DISMISSED: "DISMISSED",
} as const;
export type InboxItemStatus =
  (typeof InboxItemStatus)[keyof typeof InboxItemStatus];

export const InboxItemSource = {
  TEXT: "TEXT",
  VOICE: "VOICE",
} as const;
export type InboxItemSource =
  (typeof InboxItemSource)[keyof typeof InboxItemSource];

export const inboxItemSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  rawText: z.string().min(1).max(5000),
  source: z.nativeEnum(InboxItemSource),
  status: z.nativeEnum(InboxItemStatus),
  classifiedAsType: z.string().nullable(),
  classifiedAsId: z.string().uuid().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type InboxItem = z.infer<typeof inboxItemSchema>;

export const createInboxItemSchema = z.object({
  rawText: z.string().min(1).max(5000),
  source: z.nativeEnum(InboxItemSource).default("TEXT"),
});
export type CreateInboxItemInput = z.infer<typeof createInboxItemSchema>;

/** Quick Capture is the same primitive as an inbox item — capture first, classify later. */
export const quickCaptureSchema = createInboxItemSchema.extend({
  captureId: z.string().uuid().optional(),
  expectedOwnerId: z.string().uuid().optional(),
});
export type QuickCaptureInput = z.infer<typeof quickCaptureSchema>;
