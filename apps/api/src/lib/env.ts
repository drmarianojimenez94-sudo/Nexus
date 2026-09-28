import "dotenv/config";

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
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
  aiApiKey: process.env.AI_API_KEY,
  aiModel: process.env.AI_MODEL ?? "claude-haiku-4-5",
};
