import Ionicons from "@expo/vector-icons/Ionicons";
import { looksSensitive, medicineVertical } from "@nexus/verticals";
import { router, usePathname } from "expo-router";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ActivityIndicator, Keyboard, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { clinicalParams, handleUtterance } from "../lib/secretary";
import { colors } from "../lib/theme";
import { useDictation } from "../lib/useDictation";
import { speak, stopSpeaking } from "../lib/voice";
import { EmailDraftCard } from "./EmailDraftCard";

type Phase = "idle" | "listening" | "working" | "done";

const TERMS = medicineVertical.vocabulary.domainTerms;
const PATIENT = /^\/patients\/([^/]+)$/;
/** Pantallas con su propio botón grande de dictado (el flotante no hace falta). */
const OWN_BUTTON = new Set(["/home", "/assistant"]);

/** ¿Lo dictado es clínico? En pacientes o en Dictar, siempre. */
export function isClinicalDictation(text: string, path: string): boolean {
  return path.startsWith("/patients") || path.startsWith("/assistant") || looksSensitive(text, medicineVertical);
}

interface GlobalMicApi {
  /** Abre la hoja de dictado y empieza a escuchar. */
  open: () => void;
  phase: Phase;
}
const GlobalMicContext = createContext<GlobalMicApi>({ open: () => undefined, phase: "idle" });
export const useGlobalMic = () => useContext(GlobalMicContext);

/**
 * Micrófono grande, siempre a mano en todas las pestañas. Escucha hasta que
 * tocás «Listo» (las pausas para respirar no cortan) o hasta la pausa larga
 * que elegiste en «Lo que aprendí», y después decide: una consulta va a
 * Dictar y arma la ficha sola; un turno, una alarma o un mail va a la
 * secretaria y la respuesta se ve acá.
 */
export function GlobalMicProvider({ children }: { children: ReactNode }) {
  const dictation = useDictation({ contextualStrings: TERMS });
  const path = usePathname() || "";
  const insets = useSafeAreaInsets();
  const [phase, setPhase] = useState<Phase>("idle");
  const [heard, setHeard] = useState("");
  const [reply, setReply] = useState<string | null>(null);
  const [keyboard, setKeyboard] = useState(false);
  const startDictation = dictation.start;
  const pathRef = useRef(path);
  pathRef.current = path;

  useEffect(() => {
    const show = Keyboard.addListener("keyboardDidShow", () => setKeyboard(true));
    const hide = Keyboard.addListener("keyboardDidHide", () => setKeyboard(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  const process = useCallback(async (text: string) => {
    setHeard(text);
    if (!text.trim()) {
      setReply("No te escuché nada. Tocá «Hablar de nuevo» y probá otra vez.");
      setPhase("done");
      return;
    }
    const current = pathRef.current;
    if (isClinicalDictation(text, current)) {
      const patient = PATIENT.exec(current)?.[1];
      setPhase("idle");
      router.navigate({ pathname: "/assistant", params: clinicalParams(text, patient && patient !== "new" ? patient : undefined) });
      void speak("Armando la ficha.");
      return;
    }
    setPhase("working");
    const outcome = await handleUtterance(text);
    if (outcome?.route && !outcome.draft) {
      setPhase("idle");
      return;
    }
    setReply(outcome?.spoken ?? null);
    setPhase("done");
  }, []);

  const startListening = useCallback(async () => {
    stopSpeaking();
    setReply(null);
    setHeard("");
    setPhase("listening");
    const ok = await startDictation({ onAutoStop: (text) => void process(text) });
    if (!ok) setPhase("done");
  }, [startDictation, process]);

  async function onDone() {
    setPhase("working");
    const text = await dictation.stop();
    await process(text);
  }

  function onCancel() {
    dictation.cancel();
    setPhase("idle");
    setReply(null);
  }

  const api = useMemo<GlobalMicApi>(() => ({ open: () => void startListening(), phase }), [startListening, phase]);
  const showFab = phase === "idle" && !keyboard && !OWN_BUTTON.has(path) && path !== "/";

  return (
    <GlobalMicContext.Provider value={api}>
      <View style={styles.fill}>
        {children}
        {showFab && (
          <Pressable
            onPress={() => void startListening()}
            style={({ pressed }) => [styles.fab, { bottom: insets.bottom + 64 }, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel="Dictar: tocá y hablá. Escucho hasta que toques Listo."
          >
            <Ionicons name="mic" size={40} color={colors.bg} />
            <Text style={styles.fabText}>Dictar</Text>
          </Pressable>
        )}
      </View>

      <Modal visible={phase !== "idle"} transparent animationType="slide" onRequestClose={onCancel} statusBarTranslucent>
        <View style={styles.backdrop}>
          <View style={[styles.sheet, { paddingBottom: insets.bottom + 20 }]} accessibilityViewIsModal>
            {phase === "listening" && (
              <>
                <View style={styles.headRow}>
                  <View style={styles.dot} />
                  <Text style={styles.head} accessibilityRole="header">Te escucho</Text>
                </View>
                <Text style={styles.hint}>
                  Hablá tranquilo, las pausas no cortan. Podés dictar una consulta, un turno, una alarma o un mail. Tocá «Listo» al terminar.
                </Text>
                <ScrollView style={styles.live} contentContainerStyle={styles.liveContent}>
                  <Text style={styles.liveText} accessibilityLiveRegion="polite">{dictation.text || "…"}</Text>
                </ScrollView>
                {dictation.onDevice && <Text style={styles.small}>Reconociendo en el teléfono: el audio no sale del dispositivo.</Text>}
                <Pressable onPress={() => void onDone()} style={styles.done} accessibilityRole="button" accessibilityLabel="Listo: terminar de dictar">
                  <Text style={styles.doneText}>■ Listo</Text>
                </Pressable>
                <Pressable onPress={onCancel} style={styles.cancel} accessibilityRole="button" accessibilityLabel="Cancelar el dictado">
                  <Text style={styles.cancelText}>Cancelar</Text>
                </Pressable>
              </>
            )}
            {phase === "working" && (
              <View style={styles.working} accessibilityLiveRegion="polite">
                <ActivityIndicator color={colors.cyan} size="large" />
                <Text style={styles.hint}>Armando lo que dijiste…</Text>
              </View>
            )}
            {phase === "done" && (
              <ScrollView contentContainerStyle={styles.doneContent}>
                {dictation.error && <Text style={styles.warn} accessibilityRole="alert">{dictation.error}</Text>}
                {heard ? <Text style={styles.small}>Dijiste: «{heard}»</Text> : null}
                {reply && <Text style={styles.reply} accessibilityLiveRegion="polite">{reply}</Text>}
                <EmailDraftCard />
                <Pressable onPress={() => void startListening()} style={styles.again} accessibilityRole="button" accessibilityLabel="Hablar de nuevo">
                  <Ionicons name="mic" size={26} color={colors.bg} />
                  <Text style={styles.againText}>Hablar de nuevo</Text>
                </Pressable>
                <Pressable onPress={onCancel} style={styles.cancel} accessibilityRole="button">
                  <Text style={styles.cancelText}>Cerrar</Text>
                </Pressable>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </GlobalMicContext.Provider>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  fab: {
    position: "absolute",
    right: 16,
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: colors.cyan,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 3,
    borderColor: colors.text,
    elevation: 8,
    shadowColor: "#000",
    shadowOpacity: 0.5,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
  pressed: { opacity: 0.8 },
  fabText: { color: colors.bg, fontSize: 13, fontWeight: "800", marginTop: -2 },
  backdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.6)" },
  sheet: { backgroundColor: colors.panel, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, gap: 14, maxHeight: "88%", borderColor: colors.border, borderWidth: 1 },
  headRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  dot: { width: 14, height: 14, borderRadius: 7, backgroundColor: colors.danger },
  head: { color: colors.text, fontSize: 22, fontWeight: "700" },
  hint: { color: colors.muted, fontSize: 15, lineHeight: 21 },
  live: { maxHeight: 220, minHeight: 90, backgroundColor: colors.bg, borderRadius: 12 },
  liveContent: { padding: 14 },
  liveText: { color: colors.text, fontSize: 18, lineHeight: 26 },
  small: { color: colors.muted, fontSize: 13 },
  done: { backgroundColor: colors.danger, borderRadius: 18, minHeight: 80, alignItems: "center", justifyContent: "center" },
  doneText: { color: "#ffffff", fontSize: 26, fontWeight: "800" },
  cancel: { minHeight: 52, alignItems: "center", justifyContent: "center", borderRadius: 14, borderWidth: 1, borderColor: colors.border },
  cancelText: { color: colors.text, fontSize: 17 },
  working: { alignItems: "center", gap: 12, paddingVertical: 30 },
  doneContent: { gap: 14 },
  reply: { color: colors.text, fontSize: 18, lineHeight: 26 },
  warn: { color: colors.amber, fontSize: 15 },
  again: { flexDirection: "row", gap: 10, backgroundColor: colors.cyan, borderRadius: 18, minHeight: 72, alignItems: "center", justifyContent: "center" },
  againText: { color: colors.bg, fontSize: 20, fontWeight: "800" },
});
