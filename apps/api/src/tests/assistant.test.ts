import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ParsedIntent } from "../lib/ai.js";

// AI_API_KEY is intentionally unset in the test env (vitest.config.ts) —
// same "never required" pattern as the rest of NEXUS's AI features — so
// isAiConfigured is mocked true here to exercise the intent-execution
// logic without a live Anthropic call. The "not configured" 501 path is
// covered separately with the real (unmocked) module.
const interpretUtterance = vi.fn<(text: string, ctx: unknown) => Promise<ParsedIntent | null>>();
vi.mock("../lib/ai.js", () => ({
  isAiConfigured: true,
  aiProvider: { interpretUtterance },
}));

const { createApp } = await import("../app.js");

const app = createApp();
let agent: ReturnType<typeof request.agent>;

beforeEach(async () => {
  interpretUtterance.mockReset();
  agent = request.agent(app);
  await agent.post("/auth/register").send({
    name: "Mariano",
    email: "mariano@example.com",
    password: "supersecret123",
  });
});

describe("assistant/interpret (NexusBrain)", () => {
  it("answers conversation without saving it to inbox", async () => {
    interpretUtterance.mockResolvedValue({ intent: "conversation", title: "", when: null, target: null, spokenReply: "¿A qué hora querés la reunión?" });
    const res = await agent.post("/assistant/interpret").send({ text: "agendá una reunión", history: [{ role: "assistant", content: "¿Qué necesitás?" }] });
    expect(res.status).toBe(200);
    expect(res.body.navigateTo).toBeUndefined();
    expect((await agent.get("/inbox")).body.items).toHaveLength(0);
    expect(interpretUtterance.mock.calls[0]?.[1]).toMatchObject({ history: [{ role: "assistant", content: "¿Qué necesitás?" }] });
  });

  it("rejects oversized histories before calling the provider", async () => {
    const res = await agent.post("/assistant/interpret").send({ text: "hola", history: Array.from({ length: 13 }, () => ({ role: "user", content: "hola" })) });
    expect(res.status).toBe(400);
    expect(interpretUtterance).not.toHaveBeenCalled();
  });

  it("requires authentication for AI status", async () => {
    expect((await request(app).get("/assistant/status")).status).toBe(401);
    expect((await agent.get("/assistant/status")).body.aiConfigured).toBe(true);
  });

  it("creates a real calendar event instead of just navigating there", async () => {
    interpretUtterance.mockResolvedValue({
      intent: "create_event",
      title: "Turno con el dentista",
      when: "2026-10-06T13:00:00.000Z",
      target: null,
      spokenReply: "Listo, agendé turno con el dentista para el martes a las 10.",
    });

    const res = await agent.post("/assistant/interpret").send({ text: "anotame en el calendario que tengo turno el martes a las 10" });
    expect(res.status).toBe(200);
    expect(res.body.navigateTo).toBe("/calendar");

    const events = await agent.get("/events");
    expect(events.body.events).toHaveLength(1);
    expect(events.body.events[0].title).toBe("Turno con el dentista");
  });

  it("creates a task", async () => {
    interpretUtterance.mockResolvedValue({
      intent: "create_task",
      title: "Llamar al banco",
      when: null,
      target: null,
      spokenReply: "Listo, lo agregué a tus tareas.",
    });

    const res = await agent.post("/assistant/interpret").send({ text: "tengo que llamar al banco" });
    expect(res.status).toBe(200);
    expect(res.body.navigateTo).toBe("/today");

    const tasks = await agent.get("/tasks");
    expect(tasks.body.tasks.some((t: { title: string }) => t.title === "Llamar al banco")).toBe(true);
  });

  it("creates a reminder with a resolved date", async () => {
    interpretUtterance.mockResolvedValue({
      intent: "create_reminder",
      title: "Llamar al dentista",
      when: "2026-10-06T12:00:00.000Z",
      target: null,
      spokenReply: "Listo, te aviso mañana a las 9.",
    });

    const res = await agent
      .post("/assistant/interpret")
      .send({ text: "avisame mañana a las 9 que llame al dentista" });
    expect(res.status).toBe(200);

    const reminders = await agent.get("/reminders");
    expect(reminders.body.reminders).toHaveLength(1);
    expect(reminders.body.reminders[0].title).toBe("Llamar al dentista");
  });

  it("saves a memory using the full original text, not the compressed title", async () => {
    interpretUtterance.mockResolvedValue({
      intent: "remember",
      title: "Hijo se llama Tomás",
      when: null,
      target: null,
      spokenReply: "Listo, lo voy a recordar.",
    });

    const res = await agent.post("/assistant/interpret").send({ text: "mi hijo se llama Tomás y juega al fútbol" });
    expect(res.status).toBe(200);
    expect(res.body.navigateTo).toBe("/memory");

    const memories = await agent.get("/memories");
    expect(memories.body.memories[0].content).toBe("mi hijo se llama Tomás y juega al fútbol");
  });

  it("falls back to inbox capture for a loose note", async () => {
    interpretUtterance.mockResolvedValue({
      intent: "note",
      title: "idea suelta",
      when: null,
      target: null,
      spokenReply: "Listo, lo anoté.",
    });

    const res = await agent.post("/assistant/interpret").send({ text: "se me ocurrió una idea para el proyecto" });
    expect(res.status).toBe(200);
    expect(res.body.navigateTo).toBe("/inbox");

    const inbox = await agent.get("/inbox");
    expect(inbox.body.items).toHaveLength(1);
  });

  it("falls back to inbox capture when create_event has no resolvable date", async () => {
    interpretUtterance.mockResolvedValue({
      intent: "create_event",
      title: "algo",
      when: null,
      target: null,
      spokenReply: "no debería pasar",
    });

    const res = await agent.post("/assistant/interpret").send({ text: "anotame algo en algún momento" });
    expect(res.status).toBe(200);
    expect(res.body.navigateTo).toBe("/inbox");

    const events = await agent.get("/events");
    expect(events.body.events).toHaveLength(0);
  });

  it("navigates without creating anything for a plain 'open X' request", async () => {
    interpretUtterance.mockResolvedValue({
      intent: "navigate",
      title: "",
      when: null,
      target: "calendar",
      spokenReply: "Listo, te muestro tu calendario.",
    });

    const res = await agent.post("/assistant/interpret").send({ text: "abrí el calendario" });
    expect(res.status).toBe(200);
    expect(res.body.navigateTo).toBe("/calendar");

    const events = await agent.get("/events");
    expect(events.body.events).toHaveLength(0);
  });

  it("returns 502 when the model call fails", async () => {
    interpretUtterance.mockResolvedValue(null);
    const res = await agent.post("/assistant/interpret").send({ text: "algo" });
    expect(res.status).toBe(502);
  });
});
