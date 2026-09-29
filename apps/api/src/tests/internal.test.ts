import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Set before the dynamic import below so lib/env.js picks it up fresh in
// this test file's isolated module registry — same trick as mocking a
// module, but for a plain env var env.js reads at import time.
process.env.INTERNAL_DISPATCH_SECRET = "test-internal-secret";

interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
}
const sendEmail = vi.fn<(input: SendEmailInput) => Promise<boolean>>();
vi.mock("../lib/email.js", () => ({
  isEmailConfigured: true,
  sendEmail,
}));

const { createApp } = await import("../app.js");

const app = createApp();
let agent: ReturnType<typeof request.agent>;

beforeEach(async () => {
  sendEmail.mockReset();
  sendEmail.mockResolvedValue(true);
  agent = request.agent(app);
  await agent.post("/auth/register").send({
    name: "Mariano",
    email: "mariano@example.com",
    password: "supersecret123",
  });
});

describe("internal/dispatch-reminders", () => {
  it("401s without the correct secret", async () => {
    const res = await request(app).post("/internal/dispatch-reminders");
    expect(res.status).toBe(401);
  });

  it("401s with the wrong secret", async () => {
    const res = await request(app)
      .post("/internal/dispatch-reminders")
      .set("X-Internal-Secret", "wrong");
    expect(res.status).toBe(401);
  });

  it("emails a due reminder and never resends it once fired", async () => {
    const past = new Date(Date.now() - 60_000).toISOString();
    await agent.post("/reminders").send({ title: "Llamar al dentista", remindAt: past });

    const res = await request(app)
      .post("/internal/dispatch-reminders")
      .set("X-Internal-Secret", "test-internal-secret");
    expect(res.status).toBe(200);
    expect(res.body.sent).toBe(1);
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(sendEmail.mock.calls[0]?.[0]?.to).toBe("mariano@example.com");

    const again = await request(app)
      .post("/internal/dispatch-reminders")
      .set("X-Internal-Secret", "test-internal-secret");
    expect(again.body.sent).toBe(0);
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });

  it("does not dispatch a reminder that isn't due yet", async () => {
    const future = new Date(Date.now() + 3_600_000).toISOString();
    await agent.post("/reminders").send({ title: "Todavía no", remindAt: future });

    const res = await request(app)
      .post("/internal/dispatch-reminders")
      .set("X-Internal-Secret", "test-internal-secret");
    expect(res.body.sent).toBe(0);
    expect(sendEmail).not.toHaveBeenCalled();
  });
});
