/**
 * NEXUS permission levels (spec §9).
 * Every tool NexusBrain can call declares one of these; the level decides
 * whether an action runs immediately, offers undo, or requires confirmation.
 */
export const PermissionLevel = {
  /** Conversation only, no external effect. */
  CONVERSATION: 0,
  /** Read-only query (e.g. "what's on my calendar"). Executes directly. */
  READ: 1,
  /** Reversible personal write (e.g. create a task). Executes + offers undo. */
  ACTION: 2,
  /** External communication (e.g. send an email). Requires explicit confirmation. */
  COMMUNICATION: 3,
  /** Financial / legal / medical / destructive. Always requires confirmation. */
  CRITICAL: 4,
} as const;

export type PermissionLevel = (typeof PermissionLevel)[keyof typeof PermissionLevel];
