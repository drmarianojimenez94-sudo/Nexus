import { z } from "zod";

/**
 * Freeform, user-visible/editable/searchable memory (spec §6) — never a
 * black box. Anything NEXUS should carry between conversations lives here,
 * plainly readable and deletable, not buried in a vector store you can't see.
 */
export const MemorySource = {
  USER_EXPLICIT: "user_explicit",
  INFERRED_FROM_CONVERSATION: "inferred_from_conversation",
} as const;
export type MemorySource = (typeof MemorySource)[keyof typeof MemorySource];

export const memorySchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  content: z.string().min(1).max(2000),
  source: z.nativeEnum(MemorySource),
  entityId: z.string().uuid().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type Memory = z.infer<typeof memorySchema>;

export const createMemorySchema = z.object({
  content: z.string().min(1).max(2000),
  source: z.nativeEnum(MemorySource).default("user_explicit"),
});
export type CreateMemoryInput = z.infer<typeof createMemorySchema>;

export const updateMemorySchema = z.object({
  content: z.string().min(1).max(2000),
});
export type UpdateMemoryInput = z.infer<typeof updateMemorySchema>;
