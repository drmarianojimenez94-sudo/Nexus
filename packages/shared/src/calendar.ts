import { z } from "zod";

/** NEXUS calendar distinguishes these kinds on the same timeline (spec §23). */
export const CalendarItemType = {
  EVENT: "EVENT",
  TASK: "TASK",
  DEADLINE: "DEADLINE",
  REMINDER: "REMINDER",
} as const;
export type CalendarItemType = (typeof CalendarItemType)[keyof typeof CalendarItemType];

export const eventSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  title: z.string().min(1).max(300),
  description: z.string().max(5000).nullable(),
  location: z.string().max(300).nullable(),
  startAt: z.string().datetime(),
  endAt: z.string().datetime().nullable(),
  allDay: z.boolean(),
  projectId: z.string().uuid().nullable(),
  areaId: z.string().uuid().nullable(),
  externalSource: z.string().nullable(),
  externalId: z.string().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type Event = z.infer<typeof eventSchema>;

export const createEventSchema = z.object({
  title: z.string().min(1).max(300),
  description: z.string().max(5000).optional(),
  location: z.string().max(300).optional(),
  startAt: z.string().datetime(),
  endAt: z.string().datetime().optional(),
  allDay: z.boolean().optional(),
  projectId: z.string().uuid().optional(),
  areaId: z.string().uuid().optional(),
});
export type CreateEventInput = z.infer<typeof createEventSchema>;

export const updateEventSchema = createEventSchema.partial();
export type UpdateEventInput = z.infer<typeof updateEventSchema>;

export const reminderSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  taskId: z.string().uuid().nullable(),
  title: z.string().min(1).max(300),
  remindAt: z.string().datetime(),
  fired: z.boolean(),
  createdAt: z.string().datetime(),
});
export type Reminder = z.infer<typeof reminderSchema>;

export const createReminderSchema = z.object({
  title: z.string().min(1).max(300),
  remindAt: z.string().datetime(),
  taskId: z.string().uuid().optional(),
});
export type CreateReminderInput = z.infer<typeof createReminderSchema>;
