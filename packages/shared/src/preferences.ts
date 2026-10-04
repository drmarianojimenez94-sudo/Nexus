import { z } from "zod";

/**
 * Freeform per-user settings (spec: sincronizadas entre dispositivos, no
 * en localStorage). Today's only real consumer is the onboarding tour
 * flag, but the shape is generic so any future toggle reuses it instead
 * of growing a new table.
 */
export const preferenceSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  key: z.string(),
  value: z.unknown(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type Preference = z.infer<typeof preferenceSchema>;

export const setPreferenceSchema = z.object({
  value: z.unknown(),
});
export type SetPreferenceInput = z.infer<typeof setPreferenceSchema>;

export const PREFERENCE_KEYS = {
  ONBOARDING_COMPLETED: "onboarding_completed",
  VOICE_AUTO_START: "voice_auto_start",
  CLINICAL_PROFILE: "clinical_profile",
} as const;
