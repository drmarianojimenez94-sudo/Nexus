import { beforeEach, describe, expect, it, vi } from "vitest";

const { post, get, queue } = vi.hoisted(() => ({ post: vi.fn(), get: vi.fn(), queue: vi.fn() }));
vi.mock("./api", () => ({
  api: { post, get },
  ApiError: class extends Error { constructor(public status: number, message: string) { super(message); } },
}));
vi.mock("./offlineQueue", () => ({ queueCapture: queue }));
import { ApiError } from "./api";
import { handleVoiceCommand, resolveSpokenTime, shortTitle } from "./voiceCommands";

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
  it.each([
    ["pacientes", "/patients"],
    ["Pacientes.", "/patients"],
    ["abrí pacientes", "/patients"],
    ["abrime los pacientes", "/patients"],
    ["mostrame mis pacientes", "/patients"],
    ["ir a pacientes", "/patients"],
    ["Nexus, andá a pacientes", "/patients"],
    ["nuevo paciente", "/patients/new"],
    ["crear un paciente nuevo", "/patients/new"],
    ["cargar paciente", "/patients/capture"],
    ["cargar un paciente", "/patients/capture"],
    ["dictar consulta", "/patients/capture"],
    ["dictá una consulta", "/patients/capture"],
    ["quiero dictar un paciente", "/patients/capture"],
    ["mi día", "/patients/day"],
    ["abrí mi día médico", "/patients/day"],
    ["seguimientos", "/patients/followups"],
    ["mostrame los seguimientos", "/patients/followups"],
    ["agenda", "/calendar"],
    ["calendario", "/calendar"],
    ["abrí el mail", "/settings#google"],
    ["correo", "/settings#google"],
    ["ajustes", "/settings"],
    ["ir a ajustes", "/settings"],
  ])("understands the natural phrase %s", async (command, path) => {
    post.mockRejectedValue(new ApiError(501, "unconfigured"));
    const result = await handleVoiceCommand(command);
    expect(result.navigateTo).toBe(path);
    expect(result.speak).toMatch(/^Abriendo /);
    expect(post).not.toHaveBeenCalled();
  });
  it("speaks a short confirmation when opening a section", async () => {
    expect((await handleVoiceCommand("abrime el calendario")).speak).toBe("Abriendo calendario.");
    expect((await handleVoiceCommand("pacientes")).speak).toBe("Abriendo pacientes.");
  });
  it("does not treat dictated patient content as navigation", async () => {
    const setItem = vi.fn(); vi.stubGlobal("sessionStorage", { setItem });
    try {
      const text = "dictar paciente Juan Pérez con fiebre de tres días";
      const result = await handleVoiceCommand(text);
      expect(result.navigateTo).toBe("/patients/capture?auto=1");
      expect(setItem).toHaveBeenCalledWith("nexus.clinicalHandoff", text);
      // Intención clínica explícita: no pasa por la IA general.
      expect(post).not.toHaveBeenCalled();
    } finally { vi.unstubAllGlobals(); }
  });
  it("passes alarms, events and email drafts from the assistant", async () => {
    const emailDraft = { to: "pedro@example.com", subject: "Turno", body: "Hola", id: "d1", confirmationToken: "t", connected: true };
    post.mockResolvedValue({ speak: "Te redacté el mail.", emailDraft, alarm: { at: "2026-10-05T09:30:00.000Z", title: "Guardia" } });
    const result = await handleVoiceCommand("mandale un mail a Pedro diciendo hola");
    expect(result.emailDraft).toEqual(emailDraft);
    expect(result.alarm?.title).toBe("Guardia");
    expect(result.navigateTo).toBeUndefined();
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
  it("hands patient data to the clinical assistant instead of the inbox when AI is unconfigured", async () => {
    const setItem = vi.fn(); vi.stubGlobal("sessionStorage", { setItem });
    try {
      post.mockRejectedValueOnce(new ApiError(501, "unconfigured"));
      const text = "anotá paciente Juan Pérez DNI 30123456 consulta por fiebre";
      const result = await handleVoiceCommand(text);
      expect(result.navigateTo).toBe("/patients/capture?auto=1");
      expect(setItem).toHaveBeenCalledWith("nexus.clinicalHandoff", text);
      expect(post).toHaveBeenCalledTimes(1);
      expect(post).not.toHaveBeenCalledWith("/quick-capture", expect.anything());
      expect(queue).not.toHaveBeenCalled();
    } finally { vi.unstubAllGlobals(); }
  });
  it("hands patient data off locally when offline", async () => {
    const setItem = vi.fn(); vi.stubGlobal("sessionStorage", { setItem });
    try {
      post.mockRejectedValueOnce(new TypeError("Failed to fetch"));
      const result = await handleVoiceCommand("anotá paciente Ana Gómez tiene fiebre y tos, control en una semana");
      expect(result.navigateTo).toBe("/patients/capture?auto=1");
      expect(setItem).toHaveBeenCalledWith("nexus.clinicalHandoff", expect.stringContaining("Ana Gómez"));
      expect(queue).not.toHaveBeenCalled();
    } finally { vi.unstubAllGlobals(); }
  });
  it("follows the server handoff for clinical text", async () => {
    const setItem = vi.fn(); vi.stubGlobal("sessionStorage", { setItem });
    try {
      post.mockResolvedValue({ speak: "Lo paso al asistente clínico.", navigateTo: "/patients/capture", handoff: { vertical: "medicine", text: "paciente X" } });
      const result = await handleVoiceCommand("paciente X con fiebre");
      expect(result).toEqual({ speak: "Lo paso al asistente clínico.", navigateTo: "/patients/capture?auto=1" });
      expect(setItem).toHaveBeenCalledWith("nexus.clinicalHandoff", "paciente X");
    } finally { vi.unstubAllGlobals(); }
  });
  it("closes only an explicit goodbye", async () => {
    expect((await handleVoiceCommand("gracias")).close).toBe(true);
    expect(post).not.toHaveBeenCalled();
  });
});

describe("cerebro", () => {
  it("abre lo que Nexus aprendió", async () => {
    const { navigationCommand } = await import("./voiceCommands");
    expect(navigationCommand("abrí lo que aprendiste")?.path).toBe("/brain");
    expect(navigationCommand("mostrame tu cerebro")?.path).toBe("/brain");
  });
});

describe("secretario sin IA", () => {
  // 3 de octubre de 2026, 15:00 en Buenos Aires (UTC-3).
  const now = new Date("2026-10-03T18:00:00Z");
  it("resuelve la hora dicha: hoy si no pasó, mañana si ya pasó", () => {
    expect(resolveSpokenTime("a las 18", now)?.at.toISOString()).toBe("2026-10-03T21:00:00.000Z");
    expect(resolveSpokenTime("a las 9 y media", now)?.at.toISOString()).toBe("2026-10-04T12:30:00.000Z");
    expect(resolveSpokenTime("a las 8 de la noche", now)?.at.toISOString()).toBe("2026-10-03T23:00:00.000Z");
    expect(resolveSpokenTime("comprar pan", now)).toBeNull();
  });
  it("arma un título breve sin verbo ni fecha", () => {
    expect(shortTitle("agendame ateneo el jueves a las 12", "Evento")).toBe("Ateneo");
    expect(shortTitle("poneme una alarma mañana a las 6:30", "Alarma")).toBe("Alarma");
    expect(shortTitle("recordame llamar al laboratorio a las 17", "Recordatorio")).toBe("Llamar al laboratorio");
  });
  it("crea la alarma aunque la IA no esté configurada", async () => {
    post.mockImplementation(async (path: string) => {
      if (path === "/reminders") return { reminder: { id: "r1" } };
      throw new ApiError(501, "unconfigured");
    });
    const result = await handleVoiceCommand("poneme una alarma mañana a las 6:30");
    expect(post).toHaveBeenCalledWith("/reminders", expect.objectContaining({ title: "Alarma" }));
    expect(result.alarm?.title).toBe("Alarma");
    expect(result.speak).toMatch(/^Listo, alarma/);
  });
  it("agenda un evento sin IA", async () => {
    post.mockImplementation(async (path: string, body: { title: string; startAt: string }) => {
      if (path === "/events") return { event: { id: "e1", title: body.title, startAt: body.startAt, endAt: null } };
      throw new ApiError(501, "unconfigured");
    });
    const result = await handleVoiceCommand("agendame ateneo mañana a las 10");
    expect(post).toHaveBeenCalledWith("/events", expect.objectContaining({ title: expect.stringMatching(/ateneo/i) }));
    expect(result.event?.id).toBe("e1");
    expect(result.speak).toMatch(/^Agendado/);
  });
});
