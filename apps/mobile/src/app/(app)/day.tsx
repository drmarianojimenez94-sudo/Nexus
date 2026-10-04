import type { DayBrief } from "@nexus/verticals";
import { Link, router } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { loadDay } from "../../lib/clinicalCapture";
import { colors } from "../../lib/theme";
import { enableDailySummary, getDailySummary, supported as notificationsSupported } from "../../lib/notifications";
import { useVoice } from "../../lib/voice";

const hhmm = (iso: string) => new Date(iso).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Argentina/Buenos_Aires" });

/**
 * Mi día: lo primero que ve el médico al abrir Nexus. Turnos, vencidos,
 * resultados, borradores sin validar y sugerencias, leído en voz alta.
 */
export default function DayScreen() {
  const { speak, speaking } = useVoice();
  const [offerDaily, setOfferDaily] = useState(false);
  const [dailyNote, setDailyNote] = useState<string | null>(null);
  const [brief, setBrief] = useState<DayBrief | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const spoken = useRef(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      setBrief(await loadDay());
    } catch {
      setError("No se pudo cargar tu día.");
    }
  }, []);

  useEffect(() => {
    void load();
    if (notificationsSupported) void getDailySummary().then((s) => setOfferDaily(!s.enabled));
  }, [load]);

  async function activateDaily() {
    const ok = await enableDailySummary({ hour: 8, minute: 0 });
    setOfferDaily(!ok);
    setDailyNote(ok ? "Listo: te aviso todos los días a las 8:00. Cambiá la hora en Ajustes." : "Sin permiso de notificaciones: activalas en los ajustes del teléfono.");
  }
  useEffect(() => {
    if (brief && !spoken.current) {
      spoken.current = true;
      void speak(brief.spoken);
    }
  }, [brief, speak]);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load().finally(() => setRefreshing(false)); }} tintColor={colors.cyan} />}
    >
      <Link href="/assistant" asChild>
        <Pressable style={styles.dictate} accessibilityLabel="Dictar o anotar">
          <Text style={styles.dictateIcon}>🎙</Text>
          <Text style={styles.dictateText}>Dictar / anotar</Text>
        </Pressable>
      </Link>
      {offerDaily && (
        <View style={styles.offer}>
          <Text style={styles.item}>¿Querés que te avise cada mañana a las 8:00 para revisar tu día? (sin nombres de pacientes)</Text>
          <View style={styles.offerRow}>
            <Pressable onPress={() => void activateDaily()}><Text style={styles.link}>Activar</Text></Pressable>
            <Pressable onPress={() => router.push("/settings")}><Text style={styles.link}>Elegir hora</Text></Pressable>
            <Pressable onPress={() => setOfferDaily(false)}><Text style={styles.mutedLink}>Ahora no</Text></Pressable>
          </View>
        </View>
      )}
      {dailyNote && <Text style={styles.muted}>{dailyNote}</Text>}
      {!brief && !error && <ActivityIndicator color={colors.cyan} />}
      {error && <Text style={styles.danger}>{error}</Text>}
      {brief && (
        <>
          <Text style={styles.title}>{brief.greeting}</Text>
          <Text style={styles.muted}>{brief.date}</Text>
          <Pressable onPress={() => void speak(brief.spoken)}>
            <Text style={styles.link}>{speaking ? "Hablando…" : "🔊 Escuchar resumen"}</Text>
          </Pressable>

          {brief.suggestions.length > 0 && (
            <Section title="SUGERENCIAS">
              {brief.suggestions.map((s) => (
                <Text key={s.id + s.text} style={[styles.item, s.priority === 1 && styles.priority]}>• {s.text}</Text>
              ))}
            </Section>
          )}
          <Section title={`TURNOS (${brief.appointments.length})`}>
            {brief.appointments.length === 0 ? <Text style={styles.muted}>Sin turnos hoy.</Text> : brief.appointments.map((a) => (
              <Text key={a.id} style={[styles.item, brief.next?.id === a.id && styles.next]}>{hhmm(a.startAt)}  {a.title}{brief.next?.id === a.id ? "  ← próximo" : ""}</Text>
            ))}
          </Section>
          {brief.overdue.length > 0 && (
            <Section title="VENCIDOS">
              {brief.overdue.map((f) => <Text key={f.id} style={[styles.item, styles.priority]}>{f.subjectName}: {f.title} (hace {f.daysLate} d)</Text>)}
            </Section>
          )}
          {brief.dueToday.length > 0 && (
            <Section title="PARA HOY">
              {brief.dueToday.map((f) => <Text key={f.id} style={styles.item}>{f.subjectName}: {f.title}</Text>)}
            </Section>
          )}
          {brief.drafts.length > 0 && (
            <Section title="BORRADORES POR VALIDAR">
              {brief.drafts.map((d) => <Text key={d.id} style={styles.item}>{d.subjectName} — hace {d.hoursOld} h</Text>)}
              <Text style={styles.muted}>Validalos desde la web: la versión validada queda inalterable.</Text>
            </Section>
          )}
        </>
      )}
      <Link href="/today" style={styles.link}>Ir a Today</Link>
    </ScrollView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}


const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 24, paddingTop: 64, gap: 14 },
  dictate: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, backgroundColor: colors.panel, borderColor: colors.cyan, borderWidth: 1, borderRadius: 18, paddingVertical: 18 },
  dictateIcon: { fontSize: 26 },
  dictateText: { color: colors.cyan, fontSize: 18, fontWeight: "600" },
  title: { color: colors.text, fontSize: 24, fontWeight: "600" },
  muted: { color: colors.muted, fontSize: 14 },
  link: { color: colors.cyan, fontSize: 14, paddingVertical: 6 },
  mutedLink: { color: colors.muted, fontSize: 14, paddingVertical: 6 },
  offer: { backgroundColor: colors.panel, borderRadius: 12, padding: 12, gap: 4, borderColor: colors.border, borderWidth: 1 },
  offerRow: { flexDirection: "row", gap: 18 },
  danger: { color: colors.danger },
  section: { gap: 6, borderTopColor: colors.border, borderTopWidth: 1, paddingTop: 12 },
  sectionTitle: { color: colors.muted, fontSize: 11, fontWeight: "600", letterSpacing: 1.5 },
  item: { color: colors.text, fontSize: 15, lineHeight: 21 },
  priority: { color: colors.amber },
  next: { color: colors.cyan, fontWeight: "600" },
});
