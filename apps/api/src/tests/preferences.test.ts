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

describe("preferences", () => {
  it("starts empty and round-trips a value", async () => {
    const before = await agent.get("/preferences");
    expect(before.body.preferences).toEqual({});

    const put = await agent.put("/preferences/onboarding_completed").send({ value: true });
    expect(put.status).toBe(200);

    const after = await agent.get("/preferences");
    expect(after.body.preferences.onboarding_completed).toBe(true);
  });

  it("upserts on repeated writes instead of erroring", async () => {
    await agent.put("/preferences/onboarding_completed").send({ value: true });
    const second = await agent.put("/preferences/onboarding_completed").send({ value: false });
    expect(second.status).toBe(200);

    const res = await agent.get("/preferences");
    expect(res.body.preferences.onboarding_completed).toBe(false);
  });
});
