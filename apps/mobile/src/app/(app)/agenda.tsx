import type { Event } from "@nexus/shared";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { api } from "../../lib/api";
import { addToPhoneCalendar, listPhoneEvents, type PhoneEvent } from "../../lib/phoneCalendar";
import { colors } from "../../lib/theme";

interface Item {
  key: string;
  title: string;
  startAt: string;
  endAt: string | null;
  allDay: boolean;
  source: "nexus" | "phone";
  calendar?: string;
}

const DAYS = 7;
const DURATIONS = [15, 30, 45, 60];
const hhmm = (iso: string) => new Date(iso).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
const dayLabel = (d: Date) => {
  const today = new Date();
  const tomorrow = new Date(today.getTime() + 86_400_000);
  if (d.toDateString() === today.toDateString()) return "Hoy";
  if (d.toDateString() === tomorrow.toDateString()) return "Mañana";
  const s = d.toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long" });
  return s.charAt(0).toUpperCase() + s.slice(1);
};
const minuteKey = (iso: string) => Math.round(new Date(iso).getTime() / 60_000);
const norm = (t: string) => t.trim().toLowerCase();

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

/** "dd/mm" y "hh:mm" → Date local (año en curso, o el próximo si la fecha ya pasó). */
function parseWhen(day: string, time: string): Date | null {
  const dm = /^(\d{1,2})[/.-](\d{1,2})$/.exec(day.trim());
  const t = /^(\d{1,2})[:.](\d{2})$/.exec(time.trim());
  if (!dm || !t) return null;
  const now = new Date();
  const d = new Date(now.getFullYear(), Number(dm[2]) - 1, Number(dm[1]), Number(t[1]), Number(t[2]));
  if (Number.isNaN(d.getTime()) || d.getDate() !== Number(dm[1]) || Number(t[1]) > 23) return null;
  if (d.getTime() < now.getTime() - 86_400_000) d.setFullYear(d.getFullYear() + 1);
  return d;
}

/**
 * Agenda: turnos de Nexus de los próximos 7 días junto con los eventos del
 * calendario del teléfono (todas las cuentas: Google, iCloud, Exchange…).
 * "Nuevo turno" lo crea en Nexus y lo copia al calendario del teléfono.
 */
export default function AgendaScreen() {
  const [items, setItems] = useState<Item[] | null>(null);
  const [phoneAccess, setPhoneAccess] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [day, setDay] = useState("");
  const [time, setTime] = useState("");
  const [duration, setDuration] = useState(30);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    const from = startOfToday();
    const to = new Date(from.getTime() + DAYS * 86_400_000);
    const [nexus, phone] = await Promise.all([
      api.get<{ events: Event[] }>(`/events?from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(to.toISOString())}`).catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "No se pudo cargar la agenda de Nexus.");
        return { events: [] as Event[] };
      }),
      listPhoneEvents(from, to),
    ]);
    setPhoneAccess(phone !== null);
    const own: Item[] = nexus.events.map((e) => ({ key: `n-${e.id}`, title: e.title, startAt: e.startAt, endAt: e.endAt ?? null, allDay: Boolean(e.allDay), source: "nexus" }));
    // Lo que Nexus ya copió al teléfono aparece una sola vez.
    const seen = new Set(own.map((e) => `${minuteKey(e.startAt)}|${norm(e.title)}`));
    const fromPhone: Item[] = (phone ?? [])
      .filter((e: PhoneEvent) => !seen.has(`${minuteKey(e.startAt)}|${norm(e.title)}`))
      .map((e) => ({ key: `p-${e.id}-${e.startAt}`, title: e.title, startAt: e.startAt, endAt: e.endAt, allDay: e.allDay, source: "phone", calendar: e.calendar }));
    setItems([...own, ...fromPhone].sort((a, b) => a.startAt.localeCompare(b.startAt)));
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  async function create() {
    setNotice(null);
    const start = parseWhen(day, time);
    if (!title.trim()) return setNotice("Poné un título (usá iniciales para pacientes).");
    if (!start) return setNotice("Fecha u hora inválida: usá dd/mm y hh:mm.");
    const end = new Date(start.getTime() + duration * 60_000);
    setSaving(true);
    try {
      const { event } = await api.post<{ event: Event }>("/events", { title: title.trim(), startAt: start.toISOString(), endAt: end.toISOString() });
      const mirrored = await addToPhoneCalendar({ title: event.title, startAt: event.startAt, endAt: event.endAt ?? end.toISOString() });
      setNotice(mirrored ? "Turno creado en Nexus y en el calendario del teléfono." : "Turno creado en Nexus. Sin permiso al calendario del teléfono, no se copió.");
      setTitle("");
      setTime("");
      setFormOpen(false);
      await load();
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "No se pudo crear el turno.");
    } finally {
      setSaving(false);
    }
  }

  function openForm() {
    const now = new Date();
    setDay(`${now.getDate()}/${now.getMonth() + 1}`);
    setFormOpen((v) => !v);
  }

  const groups: { label: string; items: Item[] }[] = [];
  for (const item of items ?? []) {
    const label = dayLabel(new Date(item.startAt));
    const last = groups[groups.length - 1];
    if (last?.label === label) last.items.push(item);
    else groups.push({ label, items: [item] });
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl refreshing={refreshing} tintColor={colors.cyan} onRefresh={() => { setRefreshing(true); void load().finally(() => setRefreshing(false)); }} />}
    >
      <View style={styles.header}>
        <Text style={styles.title}>Agenda</Text>
        <Pressable onPress={openForm} style={styles.newButton}>
          <Ionicons name={formOpen ? "close" : "add"} size={18} color={colors.bg} />
          <Text style={styles.newText}>{formOpen ? "Cerrar" : "Nuevo turno"}</Text>
        </Pressable>
      </View>
      <Text style={styles.muted}>Próximos {DAYS} días: Nexus y el calendario de tu teléfono.</Text>

      {formOpen && (
        <View style={styles.card}>
          <TextInput value={title} onChangeText={setTitle} placeholder="Título (p. ej. Control J. P.)" placeholderTextColor={colors.muted} style={styles.input} />
          <View style={styles.row}>
            <TextInput value={day} onChangeText={setDay} placeholder="dd/mm" placeholderTextColor={colors.muted} keyboardType="numbers-and-punctuation" style={[styles.input, { flex: 1 }]} />
            <TextInput value={time} onChangeText={setTime} placeholder="hh:mm" placeholderTextColor={colors.muted} keyboardType="numbers-and-punctuation" style={[styles.input, { flex: 1 }]} />
          </View>
          <View style={styles.row}>
            {DURATIONS.map((d) => (
              <Pressable key={d} onPress={() => setDuration(d)} style={[styles.chip, duration === d && styles.chipOn]}>
                <Text style={[styles.chipText, duration === d && styles.chipTextOn]}>{d} min</Text>
              </Pressable>
            ))}
          </View>
          <Text style={styles.muted}>Para pacientes usá iniciales: el título se copia al calendario del teléfono.</Text>
          <Pressable onPress={() => void create()} disabled={saving} style={styles.primary}>
            {saving ? <ActivityIndicator color={colors.bg} /> : <Text style={styles.primaryText}>Crear turno</Text>}
          </Pressable>
        </View>
      )}
      {notice && <Text style={styles.note}>{notice}</Text>}
      {error && <Text style={styles.danger}>{error}</Text>}
      {!phoneAccess && <Text style={styles.warn}>Sin permiso al calendario del teléfono: se muestran solo los turnos de Nexus.</Text>}

      {items === null && <ActivityIndicator color={colors.cyan} />}
      {items?.length === 0 && <Text style={styles.muted}>Nada agendado esta semana.</Text>}
      {groups.map((g) => (
        <View key={g.label} style={styles.group}>
          <Text style={styles.sectionTitle}>{g.label.toUpperCase()}</Text>
          {g.items.map((e) => (
            <View key={e.key} style={styles.event}>
              <Text style={styles.time}>{e.allDay ? "Todo el día" : hhmm(e.startAt)}</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.item}>{e.title}</Text>
                <Text style={styles.source}>{e.source === "nexus" ? "Nexus" : `Teléfono${e.calendar ? ` · ${e.calendar}` : ""}`}</Text>
              </View>
              <Ionicons name={e.source === "nexus" ? "medkit-outline" : "phone-portrait-outline"} size={16} color={e.source === "nexus" ? colors.cyan : colors.muted} />
            </View>
          ))}
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 20, paddingTop: 60, gap: 12, paddingBottom: 40 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  title: { color: colors.text, fontSize: 22, fontWeight: "600" },
  newButton: { flexDirection: "row", gap: 6, alignItems: "center", backgroundColor: colors.cyan, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8 },
  newText: { color: colors.bg, fontWeight: "700" },
  muted: { color: colors.muted, fontSize: 13 },
  note: { color: colors.cyan, fontSize: 13 },
  warn: { color: colors.amber, fontSize: 13 },
  danger: { color: colors.danger },
  card: { backgroundColor: colors.panel, borderRadius: 12, padding: 12, gap: 10, borderColor: colors.border, borderWidth: 1 },
  input: { color: colors.text, backgroundColor: colors.bg, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15 },
  row: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  chip: { borderColor: colors.border, borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  chipOn: { borderColor: colors.cyan },
  chipText: { color: colors.muted, fontSize: 13 },
  chipTextOn: { color: colors.cyan },
  primary: { backgroundColor: colors.cyan, borderRadius: 12, paddingVertical: 12, alignItems: "center" },
  primaryText: { color: colors.bg, fontWeight: "700", fontSize: 15 },
  group: { gap: 6, marginTop: 6 },
  sectionTitle: { color: colors.muted, fontSize: 11, fontWeight: "600", letterSpacing: 1.5 },
  event: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: colors.panel, borderRadius: 10, padding: 12 },
  time: { color: colors.cyan, fontSize: 14, fontWeight: "600", width: 72 },
  item: { color: colors.text, fontSize: 15 },
  source: { color: colors.muted, fontSize: 12, marginTop: 2 },
});
