import { z } from "zod";

export const ProjectStatus = {
  IDEA: "IDEA",
  PLANNED: "PLANNED",
  ACTIVE: "ACTIVE",
  WAITING: "WAITING",
  COMPLETED: "COMPLETED",
  ARCHIVED: "ARCHIVED",
} as const;
export type ProjectStatus = (typeof ProjectStatus)[keyof typeof ProjectStatus];

export const projectSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  areaId: z.string().uuid().nullable(),
  name: z.string().trim().min(1).max(120),
  goal: z.string().max(10000).nullable(),
  status: z.nativeEnum(ProjectStatus),
  progress: z.number().min(0).max(100),
  deadline: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type Project = z.infer<typeof projectSchema>;

export const createProjectSchema = z.object({
  name: z.string().trim().min(1).max(120),
  areaId: z.string().uuid().optional(),
  goal: z.string().max(10000).optional(),
  status: z.nativeEnum(ProjectStatus).optional(),
  deadline: z.string().datetime().optional(),
  clientId: z.string().uuid().optional(),
  tasks: z.array(z.string().trim().min(1).max(300)).max(100).optional(),
});
export type CreateProjectInput = z.infer<typeof createProjectSchema>;

export const updateProjectSchema = createProjectSchema
  .omit({ clientId: true, tasks: true })
  .partial()
  .extend({
    progress: z.number().min(0).max(100).optional(),
  });
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;

export const milestoneSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  title: z.string().min(1).max(200),
  dueDate: z.string().datetime().nullable(),
  completedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
});
export type Milestone = z.infer<typeof milestoneSchema>;

export const createMilestoneSchema = z.object({
  title: z.string().min(1).max(200),
  dueDate: z.string().datetime().optional(),
});
export type CreateMilestoneInput = z.infer<typeof createMilestoneSchema>;

export const projectPlanSchema = z.object({
  text: z.string().trim().min(1).max(10000),
  useAI: z.boolean().default(false),
});
export const projectDraftSchema = z.object({
  name: z.string().trim().max(120),
  goal: z.string().max(10000),
  tasks: z.array(z.string().trim().min(1).max(300)).max(100),
});
export type ProjectDraft = z.infer<typeof projectDraftSchema>;
