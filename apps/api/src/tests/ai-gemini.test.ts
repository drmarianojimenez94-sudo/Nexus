import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/env.js", () => ({ env: { aiProvider: "gemini", aiApiKey: "test-key", aiModel: "gemini-3.5-flash-lite" } }));
const { aiProvider } = await import("../lib/ai.js");
const context = { userName: "Mariano", now: new Date("2026-09-30T12:00:00Z") };
const intent = { intent: "navigate", title: "", when: null, target: "calendar", spokenReply: "Abro tu calendario." };
function reply(input: unknown) {
  return new Response(JSON.stringify({ choices: [{ message: { content: null, tool_calls: [{ function: { name: "record_intent", arguments: JSON.stringify(input) } }] } }] }), { status: 200 });
}
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("Gemini intent pipeline", () => {
  it("interprets a validated action, preserves history and uses only the Gemini endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue(reply(intent));
    vi.stubGlobal("fetch", fetchMock);
    expect(await aiProvider.interpretUtterance("abrime el calendario", { ...context, history: [{ role: "assistant", content: "¿Qué hacemos?" }] })).toEqual(intent);
    const [url, options] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions");
    const body = JSON.parse(options.body);
    expect(body.messages.slice(-2)).toEqual([{ role: "assistant", content: "¿Qué hacemos?" }, { role: "user", content: "abrime el calendario" }]);
    expect(body.tool_choice.function.name).toBe("record_intent");
    expect(body.model).toBe("gemini-3.5-flash-lite");
  });
  it("keeps conversation as conversation instead of creating a note", async () => {
    const conversation = { ...intent, intent: "conversation", target: null, spokenReply: "¿A qué hora querés el turno?" };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(reply(conversation)));
    expect(await aiProvider.interpretUtterance("agendá un turno", context)).toEqual(conversation);
  });
  it("rejects invalid model actions", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(reply({ ...intent, intent: "delete_account" })));
    expect(await aiProvider.interpretUtterance("hola", context)).toBeNull();
  });
  it("falls back on quota errors without retrying or using a paid provider", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("quota", { status: 429 }));
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal("fetch", fetchMock);
    expect(await aiProvider.interpretUtterance("hola", context)).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(log.mock.calls)).not.toContain("test-key");
  });
  it("falls back on interrupted requests and malformed JSON", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new DOMException("Timeout", "TimeoutError")));
    expect(await aiProvider.interpretUtterance("hola", context)).toBeNull();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("invalid", { status: 200 })));
    expect(await aiProvider.interpretUtterance("hola", context)).toBeNull();
  });
  it("generates the daily insight without requesting an action", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { content: "Reservá un momento para tu prioridad." } }] })));
    vi.stubGlobal("fetch", fetchMock);
    expect(await aiProvider.generateDailyInsight({ userName: "Mariano", overdueTaskCount: 0, openTaskTitles: [], upcomingDeadlines: [], eventsToday: 0, recentMemories: [], timeOfDay: "morning" })).toBe("Reservá un momento para tu prioridad.");
    expect(JSON.parse(fetchMock.mock.calls[0]![1].body).tools).toBeUndefined();
  });
});
