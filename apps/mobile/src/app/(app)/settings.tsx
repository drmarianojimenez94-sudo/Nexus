import { router } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { useAuth } from "../../lib/auth-context";
import { cancelDailySummary, enableDailySummary, getDailySummary, supported as notificationsSupported, type DailyTime } from "../../lib/notifications";
import { colors } from "../../lib/theme";
import { useVoice } from "../../lib/voice";

const pad = (n: number) => String(n).padStart(2, "0");
const STEP = 15;

/** Ajustes del teléfono: voz, resumen diario de Mi día y sesión. */
export default function SettingsScreen() {
  const { logout } = useAuth();
  const voice = useVoice();
  const [enabled, setEnabled] = useState(false);
  const [time, setTime] = useState<DailyTime>({ hour: 8, minute: 0 });
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    void getDailySummary().then((s) => {
      setEnabled(s.enabled);
      setTime(s.time);
    });
  }, []);

  async function apply(on: boolean, at: DailyTime) {
    setMessage(null);
    if (!on) {
      await cancelDailySummary();
      setEnabled(false);
      return;
    }
    const ok = await enableDailySummary(at);
    setEnabled(ok);
    setMessage(ok ? `Te aviso todos los días a las ${pad(at.hour)}:${pad(at.minute)}.` : "Sin permiso de notificaciones: activalas en los ajustes del teléfono.");
  }

  function shift(minutes: number) {
    const total = (time.hour * 60 + time.minute + minutes + 24 * 60) % (24 * 60);
    const next = { hour: Math.floor(total / 60), minute: total % 60 };
    setTime(next);
    if (enabled) void apply(true, next);
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Pressable onPress={() => router.back()}>
        <Text style={styles.link}>← Volver</Text>
      </Pressable>
      <Text style={styles.title}>Ajustes</Text>

      <View style={styles.card}>
        <View style={styles.row}>
          <Text style={styles.label}>Respuestas en voz alta</Text>
          <Switch value={!voice.muted} onValueChange={(on) => void voice.setMuted(!on)} />
        </View>
        <Text style={styles.muted}>
          {voice.provider === "neural" ? "Usando la voz neural del servidor." : "Usando la mejor voz en español de tu teléfono (o la neural si el servidor la tiene configurada)."}
        </Text>
      </View>

      <View style={styles.card}>
        <View style={styles.row}>
          <Text style={styles.label}>Resumen diario de Mi día</Text>
          <Switch value={enabled} disabled={!notificationsSupported} onValueChange={(on) => void apply(on, time)} />
        </View>
        <View style={styles.timeRow}>
          <Pressable onPress={() => shift(-STEP)} style={styles.step} accessibilityLabel="Más temprano"><Text style={styles.stepText}>−</Text></Pressable>
          <Text style={styles.time}>{pad(time.hour)}:{pad(time.minute)}</Text>
          <Pressable onPress={() => shift(STEP)} style={styles.step} accessibilityLabel="Más tarde"><Text style={styles.stepText}>+</Text></Pressable>
        </View>
        <Text style={styles.muted}>El aviso no muestra nombres de pacientes ni datos clínicos.</Text>
        {message && <Text style={styles.note}>{message}</Text>}
      </View>

      <Pressable onPress={() => router.navigate("/today")}>
        <Text style={styles.link}>Abrir Today (tareas y prioridades)</Text>
      </Pressable>
      <Pressable onPress={() => void logout()}>
        <Text style={styles.danger}>Cerrar sesión</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 20, paddingTop: 60, gap: 14 },
  title: { color: colors.text, fontSize: 22, fontWeight: "600" },
  card: { backgroundColor: colors.panel, borderRadius: 12, padding: 14, gap: 10, borderColor: colors.border, borderWidth: 1 },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 12 },
  label: { color: colors.text, fontSize: 15, flex: 1 },
  muted: { color: colors.muted, fontSize: 13 },
  note: { color: colors.cyan, fontSize: 13 },
  timeRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 24 },
  step: { width: 44, height: 44, borderRadius: 22, borderColor: colors.border, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  stepText: { color: colors.cyan, fontSize: 22 },
  time: { color: colors.text, fontSize: 32, fontWeight: "600", fontVariant: ["tabular-nums"] },
  link: { color: colors.cyan, fontSize: 14, paddingVertical: 6 },
  danger: { color: colors.danger, fontSize: 14, paddingVertical: 6 },
});
