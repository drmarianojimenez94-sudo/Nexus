import { z } from "zod";

/** Areas are user-defined top-level life categories (spec §15). Not hardcoded. */
export const areaSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  name: z.string().min(1).max(60),
  icon: z.string().max(8).nullable(),
  color: z.string().max(20).nullable(),
  sortOrder: z.number().int(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type Area = z.infer<typeof areaSchema>;

export const createAreaSchema = z.object({
  name: z.string().min(1).max(60),
  icon: z.string().max(8).optional(),
  color: z.string().max(20).optional(),
});
export type CreateAreaInput = z.infer<typeof createAreaSchema>;

export const updateAreaSchema = createAreaSchema.partial().extend({
  sortOrder: z.number().int().optional(),
});
export type UpdateAreaInput = z.infer<typeof updateAreaSchema>;

/** Seeded for new accounts during onboarding; the user can rename/delete/add freely. */
export const DEFAULT_AREAS: CreateAreaInput[] = [
  { name: "Trabajo", icon: "\u{1F3E5}" },
  { name: "Consultorio", icon: "\u{1FA7A}" },
  { name: "Videojuegos", icon: "\u{1F3AE}" },
  { name: "Finanzas", icon: "\u{1F4B0}" },
  { name: "Salud y entrenamiento", icon: "\u{1F3C3}" },
  { name: "Formación", icon: "\u{1F4DA}" },
  { name: "Viajes", icon: "✈️" },
  { name: "Personal", icon: "\u{1F3E0}" },
  { name: "Ideas", icon: "\u{1F4A1}" },
];
