import Ionicons from "@expo/vector-icons/Ionicons";
import { router } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { EmailDraftCard } from "../../components/EmailDraftCard";
import { useGlobalMic } from "../../components/GlobalMic";
import { NexusFace, type FaceState } from "../../components/NexusFace";
import { handleUtterance, useSecretary } from "../../lib/secretary";
import { colors } from "../../lib/theme";
import { useVoice } from "../../lib/voice";

/**
 * Inicio: la secretaria. El micrófono grande abre el dictado global: escucha
 * hasta que tocás «Listo» (no arranca solo ni corta cuando respirás). Lo que
 * dictás va a `/assistant/interpret` y se resuelve en el teléfono: alarma en
 * el Reloj (Android) o aviso con sonido (iPhone), turno en el calendario del
 * teléfono, borrador de mail que solo se envía con tu toque, y navegación a
 * las pestañas. Si suena clínico, arma la ficha en Dictar.
 */
export default function HomeScreen() {
  const voice = useVoice();
  const mic = useGlobalMic();
  const { turns, busy } = useSecretary();
  const [typed, setTyped] = useState("");

  function onTyped() {
    const text = typed;
    setTyped("");
    void handleUtterance(text);
  }

  const listening = mic.phase === "listening";
  const face: FaceState = listening ? "listening" : busy ? "thinking" : voice.speaking ? "speaking" : "idle";
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
          onPress={() => {
            voice.stop();
            mic.open();
          }}
          style={({ pressed }) => [styles.mic, pressed && styles.micPressed]}
          accessibilityRole="button"
          accessibilityLabel="Hablarle a Nexus: tocá y hablá. Escucho hasta que toques Listo."
        >
          <Ionicons name="mic" size={72} color={colors.bg} />
          <Text style={styles.micText}>Tocá y hablá</Text>
        </Pressable>
        <Text style={styles.status}>
          {busy
            ? "Pensando…"
            : voice.speaking
              ? "Hablando… (tocá el micrófono para interrumpir)"
              : "Hablá tranquilo, las pausas no cortan: escucho hasta que toques «Listo». Pedime «poneme una alarma a las 7», «agendá un turno mañana a las 10» o dictá una consulta."}
        </Text>
        {busy && <ActivityIndicator color={colors.cyan} />}
        {voice.muted && <Text style={styles.warn}>La voz está silenciada: te respondo solo por escrito.</Text>}
      </View>

      <Pressable
        onPress={() => router.push("/brain")}
        style={styles.brain}
        accessibilityRole="button"
        accessibilityLabel="Lo que aprendí: ver y borrar lo que Nexus aprendió de vos"
      >
        <Text style={styles.brainIcon}>🧠</Text>
        <View style={styles.brainBody}>
          <Text style={styles.brainTitle}>Lo que aprendí de vos</Text>
          <Text style={styles.brainText}>Tus conductas habituales, lo que me pediste que recuerde y cómo te escucho.</Text>
        </View>
        <Ionicons name="chevron-forward" size={22} color={colors.cyan} />
      </Pressable>

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
        <Pressable onPress={onTyped} disabled={!typed.trim() || busy} style={styles.sendIcon} accessibilityRole="button" accessibilityLabel="Enviar">
          <Ionicons name="arrow-up-circle" size={34} color={typed.trim() ? colors.cyan : colors.muted} />
        </Pressable>
      </View>

      <EmailDraftCard />

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
  content: { padding: 20, paddingTop: 60, gap: 16, paddingBottom: 60 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  headerActions: { flexDirection: "row", gap: 18 },
  brand: { color: colors.text, fontSize: 16, fontWeight: "700", letterSpacing: 4 },
  hero: { alignItems: "center", gap: 16, paddingVertical: 8 },
  mic: { width: 170, height: 170, borderRadius: 85, borderWidth: 4, borderColor: colors.text, alignItems: "center", justifyContent: "center", backgroundColor: colors.cyan, gap: 2 },
  micPressed: { opacity: 0.8 },
  micText: { color: colors.bg, fontSize: 16, fontWeight: "800" },
  status: { color: colors.text, fontSize: 16, lineHeight: 23, textAlign: "center", paddingHorizontal: 8 },
  inputRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  input: { flex: 1, color: colors.text, backgroundColor: colors.panel, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15 },
  sendIcon: { padding: 6, minWidth: 48, minHeight: 48, alignItems: "center", justifyContent: "center" },
  brain: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: colors.panel, borderColor: colors.violet, borderWidth: 1, borderRadius: 14, padding: 14, minHeight: 72 },
  brainIcon: { fontSize: 30 },
  brainBody: { flex: 1, gap: 2 },
  brainTitle: { color: colors.text, fontSize: 16, fontWeight: "700" },
  brainText: { color: colors.muted, fontSize: 13, lineHeight: 18 },
  warn: { color: colors.amber, fontSize: 13, textAlign: "center" },
  history: { gap: 8 },
  sectionTitle: { color: colors.muted, fontSize: 11, fontWeight: "600", letterSpacing: 1.5 },
  bubble: { borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, maxWidth: "88%" },
  bubbleUser: { alignSelf: "flex-end", backgroundColor: "rgba(79, 216, 255, 0.12)" },
  bubbleNexus: { alignSelf: "flex-start", backgroundColor: colors.panel },
  bubbleText: { color: colors.text, fontSize: 14, lineHeight: 20 },
});
