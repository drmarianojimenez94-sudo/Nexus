import { defineConfig } from "vitest/config";

// Local-dev placeholder credentials only (mirrors .env.example) — tests run
// against the disposable nexus_test database, never against dev/prod data.
export default defineConfig({
  test: {
    environment: "node",
    hookTimeout: 30_000,
    testTimeout: 30_000,
    setupFiles: ["./src/tests/setup.ts"],
    // All test files share one physical Postgres test database and fixture
    // emails, so they must not run concurrently against it.
    fileParallelism: false,
    env: {
      // CI sets DATABASE_URL/AUTH_SECRET itself (one ephemeral DB for the
      // whole run); local dev falls back to the disposable nexus_test db.
      DATABASE_URL:
        process.env.DATABASE_URL ?? "postgresql://nexus:nexus_dev_password@localhost:5432/nexus_test",
      AUTH_SECRET: process.env.AUTH_SECRET ?? "test-secret-do-not-use-in-production",
      AUTH_ACCESS_TOKEN_TTL: "15m",
      AUTH_REFRESH_TOKEN_TTL: "30d",
      API_CORS_ORIGINS: "http://localhost:3000",
      NODE_ENV: "test",
    },
  },
});
