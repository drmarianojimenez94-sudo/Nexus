import { z } from "zod";

export const TaskStatus = {
  TODO: "TODO",
  IN_PROGRESS: "IN_PROGRESS",
  DONE: "DONE",
  CANCELLED: "CANCELLED",
} as const;
export type TaskStatus = (typeof TaskStatus)[keyof typeof TaskStatus];

export const TaskPriority = {
  LOW: "LOW",
  MEDIUM: "MEDIUM",
  HIGH: "HIGH",
  URGENT: "URGENT",
} as const;
export type TaskPriority = (typeof TaskPriority)[keyof typeof TaskPriority];

export const taskSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  projectId: z.string().uuid().nullable(),
  areaId: z.string().uuid().nullable(),
  title: z.string().min(1).max(300),
  description: z.string().max(5000).nullable(),
  priority: z.nativeEnum(TaskPriority),
  status: z.nativeEnum(TaskStatus),
  startDate: z.string().datetime().nullable(),
  deadline: z.string().datetime().nullable(),
  estimatedMinutes: z.number().int().positive().nullable(),
  completedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type Task = z.infer<typeof taskSchema>;

/**
 * A task can be created with just a title (spec §13: "Comprar leche" is valid).
 * Everything else is optional structure layered on top later.
 */
export const createTaskSchema = z.object({
  title: z.string().min(1).max(300),
  description: z.string().max(5000).optional(),
  projectId: z.string().uuid().optional(),
  areaId: z.string().uuid().optional(),
  priority: z.nativeEnum(TaskPriority).optional(),
  startDate: z.string().datetime().optional(),
  deadline: z.string().datetime().optional(),
  estimatedMinutes: z.number().int().positive().optional(),
});
export type CreateTaskInput = z.infer<typeof createTaskSchema>;

export const updateTaskSchema = createTaskSchema.partial().extend({
  status: z.nativeEnum(TaskStatus).optional(),
});
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;

export const subtaskSchema = z.object({
  id: z.string().uuid(),
  taskId: z.string().uuid(),
  title: z.string().min(1).max(300),
  done: z.boolean(),
  sortOrder: z.number().int(),
  createdAt: z.string().datetime(),
});
export type Subtask = z.infer<typeof subtaskSchema>;

export const createSubtaskSchema = z.object({
  title: z.string().min(1).max(300),
});
export type CreateSubtaskInput = z.infer<typeof createSubtaskSchema>;
