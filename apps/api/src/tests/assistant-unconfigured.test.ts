import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../app.js";

// Separate file from assistant.test.ts on purpose: that file mocks
// ../lib/ai.js to force isAiConfigured true, so it can't also cover this
// path. AI_API_KEY is unset in the test env (vitest.config.ts) — same
// "never required" pattern as the rest of NEXUS's AI features.
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

describe("assistant/interpret without AI configured", () => {
  it("501s instead of pretending to understand", async () => {
    const res = await agent.post("/assistant/interpret").send({ text: "anotame algo" });
    expect(res.status).toBe(501);
  });
});
