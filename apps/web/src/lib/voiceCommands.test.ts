import { beforeEach, describe, expect, it, vi } from "vitest";

const { post, get, queue } = vi.hoisted(() => ({ post: vi.fn(), get: vi.fn(), queue: vi.fn() }));
vi.mock("./api", () => ({
  api: { post, get },
  ApiError: class extends Error { constructor(public status: number, message: string) { super(message); } },
}));
vi.mock("./offlineQueue", () => ({ queueCapture: queue }));
import { ApiError } from "./api";
import { handleVoiceCommand } from "./voiceCommands";

beforeEach(() => vi.resetAllMocks());
describe("voice routing", () => {
  it("keeps project speech for review without an automatic write", async()=>{
    const setItem=vi.fn();vi.stubGlobal("sessionStorage",{setItem});
    try { const result=await handleVoiceCommand("crear un proyecto de consultorio con pendientes organizar turnos");
      expect(result.navigateTo).toBe("/projects");
      expect(setItem).toHaveBeenCalledWith("nexus_project_brief",expect.stringContaining("organizar turnos"));
      expect(post).not.toHaveBeenCalled();
    }finally{vi.unstubAllGlobals();}
  });
  it.each([
    ["abrime el calendario", "/calendar"],
    ["Nexus, abrí la agenda", "/calendar"],
    ["quiero que me abras el calendario", "/calendar"],
    ["Mostrá mis proyectos", "/projects"],
    ["por favor, abrí ajustes", "/settings"],
    ["mostrame las áreas, por favor", "/areas"],
    ["abrí mi panel", "/today"],
  ])("opens %s without calling the AI", async (command, path) => {
    post.mockRejectedValue(new ApiError(502, "AI unavailable"));
    expect((await handleVoiceCommand(command)).navigateTo).toBe(path);
    expect(post).not.toHaveBeenCalled();
  });
  it("preserves actions attached to a navigation request", async () => {
    post.mockResolvedValue({ speak: "Evento creado", navigateTo: "/calendar" });
    await handleVoiceCommand("abrí el calendario y agendá una reunión mañana");
    expect(post).toHaveBeenCalledWith("/assistant/interpret", { text: "abrí el calendario y agendá una reunión mañana", history: [] });
  });
  it("does not close or read today when those words occur in an action", async () => {
    post.mockResolvedValue({ speak: "Recordatorio creado", navigateTo: "/today" });
    await handleVoiceCommand("recordame hoy llamar al banco, gracias");
    expect(post).toHaveBeenCalledWith("/assistant/interpret", { text: "recordame hoy llamar al banco, gracias", history: [] });
    expect(get).not.toHaveBeenCalled();
  });
  it("passes recent turns for a follow-up question", async () => {
    post.mockResolvedValue({ speak: "¿A qué hora?" });
    const history = [{ role: "user" as const, content: "Agendá una reunión" }];
    await handleVoiceCommand("mañana", history);
    expect(post).toHaveBeenCalledWith("/assistant/interpret", { text: "mañana", history });
  });
  it("does not save a second note when the AI response fails after a possible write", async () => {
    post.mockRejectedValue(new ApiError(502, "error"));
    const result = await handleVoiceCommand("anotá una tarea");
    expect(result.speak).toContain("No pude confirmar");
    expect(post).toHaveBeenCalledTimes(1);
    expect(queue).not.toHaveBeenCalled();
  });
  it("does not silently save conversation when the AI is unconfigured", async () => {
    post.mockRejectedValue(new ApiError(501, "unconfigured"));
    const result = await handleVoiceCommand("hola, cómo estás");
    expect(result.speak).toContain("no está configurada");
    expect(post).toHaveBeenCalledTimes(1);
  });
  it("keeps explicit note capture available without AI", async () => {
    post.mockRejectedValueOnce(new ApiError(501, "unconfigured")).mockResolvedValueOnce({});
    const result = await handleVoiceCommand("anotá llamar mañana");
    expect(post).toHaveBeenLastCalledWith("/quick-capture", { rawText: "anotá llamar mañana", source: "VOICE" });
    expect(result.navigateTo).toBe("/inbox");
  });
  it("closes only an explicit goodbye", async () => {
    expect((await handleVoiceCommand("gracias")).close).toBe(true);
    expect(post).not.toHaveBeenCalled();
  });
});
