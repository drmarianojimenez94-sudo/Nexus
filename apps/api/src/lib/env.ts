import "dotenv/config";

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

const aiProvider = process.env.AI_PROVIDER ?? (process.env.GEMINI_API_KEY ? "gemini" : process.env.AI_API_KEY ? "anthropic" : "gemini");
if (aiProvider !== "gemini" && aiProvider !== "anthropic") {
  throw new Error("AI_PROVIDER must be gemini or anthropic");
}

export const env = {
  databaseUrl: required("DATABASE_URL"),
  authSecret: required("AUTH_SECRET"),
  accessTokenTtl: process.env.AUTH_ACCESS_TOKEN_TTL ?? "15m",
  refreshTokenTtl: process.env.AUTH_REFRESH_TOKEN_TTL ?? "30d",
  // Most PaaS hosts (Render included) assign the port via `PORT` and
  // require the process to bind to it; API_PORT is the local-dev override.
  port: Number(process.env.PORT ?? process.env.API_PORT ?? 4000),
  corsOrigins: (process.env.API_CORS_ORIGINS ?? "http://localhost:3000")
    .split(",")
    .map((origin) => origin.trim()),
  nodeEnv: process.env.NODE_ENV ?? "development",
  // Optional: Phase 1 works fully without these (Today's insight falls
  // back to the rule-based version). Never required.
  aiProvider,
  aiApiKey: aiProvider === "gemini" ? process.env.GEMINI_API_KEY : process.env.AI_API_KEY,
  aiModel: process.env.AI_MODEL ?? (aiProvider === "gemini" ? "gemini-2.5-flash-lite" : "claude-haiku-4-5"),
  // Optional: Google connectors (Phase 4) are simply unavailable —
  // Settings shows "not configured" instead of a broken connect button —
  // until these are set. The rest of NEXUS never depends on them.
  googleClientId: process.env.GOOGLE_CLIENT_ID,
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET,
  googleRedirectUri: process.env.GOOGLE_REDIRECT_URI,
  // Optional: email reminders (spec §6, Reminder.remindAt) are simply
  // never dispatched — no crash, no broken feature — until this is set.
  resendApiKey: process.env.RESEND_API_KEY,
  // Resend's own sandbox sender, usable with zero setup (delivers to any
  // address) until a custom domain is verified — real domains eventually
  // replace this, but nothing here requires it up front.
  resendFromEmail: process.env.RESEND_FROM_EMAIL ?? "NEXUS <onboarding@resend.dev>",
  // Shared secret for POST /internal/dispatch-reminders — required only
  // when RESEND_API_KEY is also set, since that's the only thing this
  // guards. Never guessable via a default value.
  internalDispatchSecret: process.env.INTERNAL_DISPATCH_SECRET,
};
