import Ionicons from "@expo/vector-icons/Ionicons";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { NexusFace, type FaceState } from "../../components/NexusFace";
import { setPhoneAlarm } from "../../lib/alarm";
import { addToPhoneCalendar } from "../../lib/phoneCalendar";
import {
  fallbackRoute,
  interpretUtterance,
  nativeRouteFor,
  NO_AI_REPLY,
  sendEmailDraft,
  type ChatTurn,
  type InterpretResult,
  type NativeRoute,
} from "../../lib/secretary";
import { colors } from "../../lib/theme";
import { useDictation } from "../../lib/useDictation";
import { speak, useVoice } from "../../lib/voice";

type EmailDraft = NonNullable<InterpretResult["emailDraft"]>;
interface Turn extends ChatTurn {
  id: number;
}

const hhmm = (d: Date) => d.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });

/**
 * Inicio: la secretaria. Al abrir la app ya escucha una frase, la manda a
 * `/assistant/interpret` y resuelve en el teléfono lo que el servidor
 * propone: alarma en el Reloj (Android) o aviso con sonido (iPhone), turno
 * en el calendario del teléfono, borrador de mail que solo se envía con tu
 * toque, y navegación a las pestañas. Todo lo que responde, lo dice en voz.
 */
export default function HomeScreen() {
  const voice = useVoice();
  const dictation = useDictation({ continuous: false });
  const [turns, setTurns] = useState<Turn[]>([]);
  const [busy, setBusy] = useState(false);
  const [typed, setTyped] = useState("");
  const [draft, setDraft] = useState<EmailDraft | null>(null);
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const heard = useRef("");
  const awaiting = useRef(false);
  const wasListening = useRef(false);
  const openedOnce = useRef(false);
  const turnsRef = useRef<Turn[]>([]);
  const nextId = useRef(1);
  const dictationRef = useRef(dictation);
  dictationRef.current = dictation;

  const listen = useCallback(async () => {
    const d = dictationRef.current;
    if (!d.available) return;
    heard.current = "";
    d.reset();
    awaiting.current = await d.start();
  }, []);

  function push(role: Turn["role"], content: string) {
    const turn = { id: nextId.current++, role, content };
    turnsRef.current = [...turnsRef.current, turn].slice(-20);
    setTurns(turnsRef.current);
  }

  const handle = useCallback(async (text: string) => {
    const utterance = text.trim();
    if (!utterance) return;
    const history: ChatTurn[] = turnsRef.current.map(({ role, content }) => ({ role, content }));
    push("user", utterance);
    setBusy(true);
    setNotice(null);
    let reply = "";
    const extras: string[] = [];
    let route: NativeRoute | null = null;
    try {
      const result = await interpretUtterance(utterance, history);
      if (!result) {
        route = fallbackRoute(utterance);
        reply = route ? route.spoken : NO_AI_REPLY;
      } else {
        reply = result.speak;
        if (result.alarm) {
          const at = new Date(result.alarm.at);
          const how = await setPhoneAlarm(at, result.alarm.title);
          extras.push(
            how === "clock"
              ? "Te puse la alarma en el Reloj."
              : how === "notification"
                ? Platform.OS === "ios"
                  ? `El iPhone no deja que otras apps creen alarmas en el Reloj: te programé un aviso con sonido a las ${hhmm(at)}.`
                  : `Te programé un aviso con sonido para el ${at.toLocaleDateString("es-AR", { weekday: "long", day: "numeric" })} a las ${hhmm(at)}.`
                : "No pude programar la alarma en el teléfono; quedó como recordatorio en Nexus.",
          );
        }
        if (result.event) {
          const added = await addToPhoneCalendar({ title: result.event.title, startAt: result.event.startAt, endAt: result.event.endAt });
          extras.push(added ? "Agendado en tu calendario." : "Quedó agendado en Nexus; para copiarlo al teléfono dame permiso al calendario.");
        }
        if (result.emailDraft) setDraft(result.emailDraft);
        // Solo se navega cuando el pedido fue ir a algún lado o derivar al dictado clínico.
        if (result.handoff) route = nativeRouteFor("/patients/capture", result.handoff.text);
        else if (result.target) route = nativeRouteFor(result.navigateTo);
      }
    } catch (err) {
      reply = err instanceof Error && err.message ? `No pude resolverlo: ${err.message}` : "No pude comunicarme con Nexus. Revisá la conexión.";
    } finally {
      setBusy(false);
    }
    const spoken = [reply, ...extras].filter(Boolean).join(" ");
    push("assistant", spoken);
    if (route) router.navigate({ pathname: route.pathname, params: route.params });
    await speak(spoken);
    // Si Nexus preguntó algo, vuelve a escuchar la respuesta.
    if (!route && spoken.trim().endsWith("?")) void listen();
  }, [listen]);

  // Escucha al abrir (la primera vez que la pestaña toma foco) y suelta el micrófono al salir.
  useFocusEffect(
    useCallback(() => {
      if (!openedOnce.current && dictationRef.current.available) {
        openedOnce.current = true;
        void listen();
      }
      return () => {
        awaiting.current = false;
        dictationRef.current.stop();
      };
    }, [listen]),
  );

  useEffect(() => {
    if (dictation.text) heard.current = dictation.text;
  }, [dictation.text]);

  // Fin de la frase: el reconocedor se detiene solo tras una pausa.
  useEffect(() => {
    if (wasListening.current && !dictation.listening && awaiting.current) {
      awaiting.current = false;
      const text = heard.current;
      heard.current = "";
      if (text.trim()) void handle(text);
    }
    wasListening.current = dictation.listening;
  }, [dictation.listening, handle]);

  function onMic() {
    if (dictation.listening) {
      dictation.stop();
      return;
    }
    voice.stop();
    void listen();
  }

  function onTyped() {
    const text = typed;
    setTyped("");
    void handle(text);
  }

  async function onSend() {
    if (!draft?.id || !draft.confirmationToken) return;
    setSending(true);
    try {
      await sendEmailDraft(draft.id, draft.confirmationToken);
      setDraft(null);
      push("assistant", "Mail enviado.");
      void voice.speak("Listo, mail enviado.");
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "No se pudo enviar el mail.");
    } finally {
      setSending(false);
    }
  }

  const face: FaceState = dictation.listening ? "listening" : busy ? "thinking" : voice.speaking ? "speaking" : "idle";
  const recent = turns.slice(-8);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <View style={styles.header}>
        <Text style={styles.brand}>NEXUS</Text>
        <View style={styles.headerActions}>
          <Pressable onPress={() => void voice.setMuted(!voice.muted)} hitSlop={12} accessibilityLabel={voice.muted ? "Activar la voz" : "Silenciar la voz"}>
            <Ionicons name={voice.muted ? "volume-mute" : "volume-high"} size={24} color={voice.muted ? colors.amber : colors.muted} />
          </Pressable>
          <Pressable onPress={() => router.push("/settings")} hitSlop={12} accessibilityLabel="Ajustes">
            <Ionicons name="settings-outline" size={24} color={colors.muted} />
          </Pressable>
        </View>
      </View>

      <View style={styles.hero}>
        <NexusFace state={face} size={96} />
        <Pressable
          onPress={onMic}
          disabled={!dictation.available}
          style={[styles.mic, dictation.listening && styles.micOn, !dictation.available && styles.micOff]}
          accessibilityLabel={dictation.listening ? "Dejar de escuchar" : "Hablarle a Nexus"}
        >
          <Ionicons name={dictation.listening ? "stop" : "mic"} size={64} color={dictation.listening ? colors.danger : colors.cyan} />
        </Pressable>
        <Text style={styles.status}>
          {dictation.listening
            ? dictation.text || "Te escucho…"
            : busy
              ? "Pensando…"
              : voice.speaking
                ? "Hablando… (tocá el micrófono para interrumpir)"
                : dictation.available
                  ? "Tocá el micrófono y pedime algo: «poneme una alarma a las 7», «agendá un turno mañana a las 10», «abrí pacientes»."
                  : "El dictado no está disponible en este dispositivo: escribime abajo."}
        </Text>
        {busy && <ActivityIndicator color={colors.cyan} />}
        {dictation.error && <Text style={styles.warn}>{dictation.error}</Text>}
        {voice.muted && <Text style={styles.warn}>La voz está silenciada: te respondo solo por escrito.</Text>}
      </View>

      <View style={styles.inputRow}>
        <TextInput
          value={typed}
          onChangeText={setTyped}
          onSubmitEditing={onTyped}
          placeholder="O escribile a Nexus…"
          placeholderTextColor={colors.muted}
          returnKeyType="send"
          style={styles.input}
        />
        <Pressable onPress={onTyped} disabled={!typed.trim() || busy} style={styles.sendIcon} accessibilityLabel="Enviar">
          <Ionicons name="arrow-up-circle" size={34} color={typed.trim() ? colors.cyan : colors.muted} />
        </Pressable>
      </View>

      {draft && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Borrador de mail</Text>
          <Text style={styles.meta}>Para: <Text style={styles.item}>{draft.to}</Text></Text>
          <Text style={styles.meta}>Asunto: <Text style={styles.item}>{draft.subject}</Text></Text>
          <Text style={styles.body}>{draft.body}</Text>
          {draft.note && <Text style={styles.warn}>{draft.note}</Text>}
          <View style={styles.row}>
            {draft.connected && draft.id && draft.confirmationToken ? (
              <Pressable onPress={() => void onSend()} disabled={sending} style={styles.primary}>
                {sending ? <ActivityIndicator color={colors.bg} /> : <Text style={styles.primaryText}>Enviar</Text>}
              </Pressable>
            ) : null}
            <Pressable onPress={() => setDraft(null)} style={styles.secondary}>
              <Text style={styles.secondaryText}>{draft.connected ? "Dejar en borradores" : "Cerrar"}</Text>
            </Pressable>
          </View>
          <Text style={styles.muted}>Nexus nunca envía un mail sin que toques «Enviar».</Text>
        </View>
      )}
      {notice && <Text style={styles.danger}>{notice}</Text>}

      {recent.length > 0 && (
        <View style={styles.history}>
          <Text style={styles.sectionTitle}>CONVERSACIÓN</Text>
          {recent.map((t) => (
            <View key={t.id} style={[styles.bubble, t.role === "user" ? styles.bubbleUser : styles.bubbleNexus]}>
              <Text style={styles.bubbleText}>{t.content}</Text>
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 20, paddingTop: 60, gap: 16, paddingBottom: 40 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  headerActions: { flexDirection: "row", gap: 18 },
  brand: { color: colors.text, fontSize: 16, fontWeight: "700", letterSpacing: 4 },
  hero: { alignItems: "center", gap: 16, paddingVertical: 8 },
  mic: { width: 150, height: 150, borderRadius: 75, borderWidth: 2, borderColor: colors.cyan, alignItems: "center", justifyContent: "center", backgroundColor: colors.panel },
  micOn: { borderColor: colors.danger },
  micOff: { opacity: 0.4 },
  status: { color: colors.text, fontSize: 16, lineHeight: 23, textAlign: "center", paddingHorizontal: 8 },
  inputRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  input: { flex: 1, color: colors.text, backgroundColor: colors.panel, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15 },
  sendIcon: { padding: 2 },
  card: { backgroundColor: colors.panel, borderRadius: 12, padding: 14, gap: 6, borderColor: colors.border, borderWidth: 1 },
  cardTitle: { color: colors.text, fontWeight: "600", fontSize: 15 },
  meta: { color: colors.muted, fontSize: 13 },
  item: { color: colors.text },
  body: { color: colors.text, fontSize: 14, lineHeight: 20, marginTop: 4 },
  row: { flexDirection: "row", gap: 10, marginTop: 6 },
  primary: { backgroundColor: colors.cyan, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 18, alignItems: "center" },
  primaryText: { color: colors.bg, fontWeight: "700" },
  secondary: { borderColor: colors.border, borderWidth: 1, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 14 },
  secondaryText: { color: colors.muted },
  muted: { color: colors.muted, fontSize: 12 },
  warn: { color: colors.amber, fontSize: 13, textAlign: "center" },
  danger: { color: colors.danger },
  history: { gap: 8 },
  sectionTitle: { color: colors.muted, fontSize: 11, fontWeight: "600", letterSpacing: 1.5 },
  bubble: { borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, maxWidth: "88%" },
  bubbleUser: { alignSelf: "flex-end", backgroundColor: "rgba(79, 216, 255, 0.12)" },
  bubbleNexus: { alignSelf: "flex-start", backgroundColor: colors.panel },
  bubbleText: { color: colors.text, fontSize: 14, lineHeight: 20 },
});
