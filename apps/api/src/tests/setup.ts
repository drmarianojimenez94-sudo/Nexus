import { beforeEach } from "vitest";
import { prisma } from "../lib/prisma.js";

// Wipe user-owned tables before every test so tests never leak state into
// each other. Order matters: children before parents.
const TABLES = [
  "audit_log",
  "ai_actions",
  "ai_conversations",
  "notifications",
  "integrations",
  "attachments",
  "trips",
  "health_logs",
  "food_logs",
  "workouts",
  "debts",
  "financial_transactions",
  "preferences",
  "memories",
  "relationships",
  "entities",
  "contacts",
  "inbox_items",
  "notes",
  "reminders",
  "events",
  "subtasks",
  "tasks",
  "project_milestones",
  "projects",
  "areas",
  "refresh_tokens",
  "devices",
  "users",
];

beforeEach(async () => {
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${TABLES.map((t) => `"${t}"`).join(", ")} CASCADE`);
});
