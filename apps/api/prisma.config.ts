import path from "node:path";
import { config as loadEnv } from "dotenv";
import { defineConfig } from "prisma/config";

// A prisma.config.ts file disables Prisma's own .env auto-loading, so we
// load the repo-root .env ourselves — otherwise `pnpm db:migrate` would
// only work if DATABASE_URL happened to already be exported in the shell.
loadEnv({ path: path.join(import.meta.dirname, "..", "..", ".env") });

// The schema lives in the top-level database/ folder (spec §38) so it's
// discoverable as its own concern, separate from the API's own code.
export default defineConfig({
  schema: path.join(import.meta.dirname, "..", "..", "database", "schema.prisma"),
});
