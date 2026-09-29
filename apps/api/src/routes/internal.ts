import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { HttpError } from "../middleware/errorHandler.js";
import { env } from "../lib/env.js";
import { isEmailConfigured, sendEmail } from "../lib/email.js";

export const internalRouter = Router();

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * POST /internal/dispatch-reminders — not tied to a user session (there is
 * no logged-in "system"), protected instead by a shared secret header.
 * Meant to be pinged on a schedule by something external (a GitHub Actions
 * cron in this repo, see .github/workflows/dispatch-reminders.yml) since
 * Render's free tier sleeps the app after 15 minutes idle and has no
 * built-in cron — the external ping doubles as the wake-up call.
 *
 * Each due Reminder is "claimed" (fired: false -> true) via a conditional
 * update before sending, so two overlapping dispatch calls can't double-
 * send the same reminder.
 */
internalRouter.post(
  "/dispatch-reminders",
  asyncHandler(async (req, res) => {
    if (!env.internalDispatchSecret || req.get("x-internal-secret") !== env.internalDispatchSecret) {
      throw new HttpError(401, "Missing or invalid internal secret.");
    }
    if (!isEmailConfigured) {
      res.json({ checked: 0, sent: 0, note: "RESEND_API_KEY not configured — nothing to dispatch." });
      return;
    }

    const now = new Date();
    const due = await prisma.reminder.findMany({
      where: { fired: false, remindAt: { lte: now } },
      include: { user: { select: { email: true, name: true } } },
      take: 200,
    });

    let sent = 0;
    for (const reminder of due) {
      const claim = await prisma.reminder.updateMany({
        where: { id: reminder.id, fired: false },
        data: { fired: true },
      });
      if (claim.count === 0) continue;

      const firstName = reminder.user.name.split(" ")[0] ?? reminder.user.name;
      const ok = await sendEmail({
        to: reminder.user.email,
        subject: `NEXUS: ${reminder.title}`,
        html: `<p>Hola ${escapeHtml(firstName)},</p><p>NEXUS te recuerda:</p><p><strong>${escapeHtml(reminder.title)}</strong></p>`,
      });
      if (ok) sent++;
    }

    res.json({ checked: due.length, sent });
  })
);
