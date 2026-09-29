import { env } from "./env.js";

/** Optional — reminder dispatch just skips sending (and logs why) until this is configured, same pattern as AI_API_KEY. */
export const isEmailConfigured = Boolean(env.resendApiKey);

interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
}

/**
 * Plain fetch against Resend's REST API instead of their SDK — one POST,
 * no extra dependency, same approach as lib/googleCalendar.ts. Resend's
 * free tier (100 emails/day) needs no domain verification to use the
 * sandbox sender (RESEND_FROM_EMAIL default), only to send from a custom
 * "from" address.
 */
export async function sendEmail({ to, subject, html }: SendEmailInput): Promise<boolean> {
  if (!env.resendApiKey) return false;

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from: env.resendFromEmail, to, subject, html }),
    });
    if (!res.ok) {
      console.error("sendEmail failed:", res.status, await res.text());
      return false;
    }
    return true;
  } catch (err) {
    console.error("sendEmail failed:", err);
    return false;
  }
}
