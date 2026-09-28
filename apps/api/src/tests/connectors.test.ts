import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../app.js";

const app = createApp();
let agent: ReturnType<typeof request.agent>;

beforeEach(async () => {
  agent = request.agent(app);
  await agent.post("/auth/register").send({
    name: "Mariano",
    email: "mariano@example.com",
    password: "supersecret123",
  });
});

// GOOGLE_CLIENT_ID/SECRET are intentionally unset in the test env
// (vitest.config.ts) — same "never required" pattern as AI_API_KEY. These
// tests cover the "not configured on this server" path; the live OAuth
// exchange needs real Google credentials and isn't testable here.
describe("connectors", () => {
  it("reports Google as not configured and no integrations by default", async () => {
    const res = await agent.get("/connectors/status");
    expect(res.status).toBe(200);
    expect(res.body.googleConfigured).toBe(false);
    expect(res.body.integrations).toEqual([]);
  });

  it("refuses to start Google OAuth when the server has no client credentials", async () => {
    const res = await agent.get("/connectors/google/authorize");
    expect(res.status).toBe(501);
  });

  it("404s disconnecting a provider that was never connected", async () => {
    const res = await agent.post("/connectors/google_calendar/disconnect");
    expect(res.status).toBe(404);
  });

  it("refuses to sync a provider that was never connected", async () => {
    const res = await agent.post("/connectors/google/sync");
    expect(res.status).toBe(400);
  });
});
