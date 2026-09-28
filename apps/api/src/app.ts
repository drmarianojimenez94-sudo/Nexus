import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import { rateLimit } from "express-rate-limit";
import helmet from "helmet";
import { env } from "./lib/env.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { areasRouter } from "./routes/areas.js";
import { authRouter } from "./routes/auth.js";
import { connectorsRouter } from "./routes/connectors.js";
import { eventsRouter } from "./routes/events.js";
import { inboxRouter, quickCaptureRouter } from "./routes/inbox.js";
import { memoryRouter } from "./routes/memory.js";
import { preferencesRouter } from "./routes/preferences.js";
import { projectsRouter } from "./routes/projects.js";
import { remindersRouter } from "./routes/reminders.js";
import { tasksRouter } from "./routes/tasks.js";
import { todayRouter } from "./routes/today.js";

export function createApp() {
  const app = express();

  app.use(helmet());
  app.use(cors({ origin: env.corsOrigins, credentials: true }));
  app.use(express.json({ limit: "1mb" }));
  app.use(cookieParser());

  // Auth endpoints get a tighter limit to slow down credential stuffing.
  app.use(
    "/auth/login",
    rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: true, legacyHeaders: false })
  );
  app.use(
    "/",
    rateLimit({ windowMs: 60 * 1000, limit: 120, standardHeaders: true, legacyHeaders: false })
  );

  app.get("/health", (_req, res) => res.json({ status: "ok" }));

  app.use("/auth", authRouter);
  app.use("/areas", areasRouter);
  app.use("/projects", projectsRouter);
  app.use("/tasks", tasksRouter);
  app.use("/events", eventsRouter);
  app.use("/reminders", remindersRouter);
  app.use("/inbox", inboxRouter);
  app.use("/quick-capture", quickCaptureRouter);
  app.use("/today", todayRouter);
  app.use("/preferences", preferencesRouter);
  app.use("/memories", memoryRouter);
  app.use("/connectors", connectorsRouter);

  app.use(errorHandler);

  return app;
}
