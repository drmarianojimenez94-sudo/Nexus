import type { Memory } from "@nexus/shared";
import type { Habit } from "@nexus/verticals";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { api } from "../../lib/api";
import { vertical } from "../../lib/clinicalCapture";
import { colors } from "../../lib/theme";
import { setSilenceMs, SILENCE_OPTIONS, useSilenceMs } from "../../lib/useDictation";

/**
 * «Lo que aprendí»: el cerebro de Nexus en un solo lugar, a la vista y
 * editable (igual que /brain en la web). Conductas clínicas aprendidas de
 * las consultas validadas, lo que le pediste que recuerde y cómo te escucha.
 */
export default function BrainScreen() {
  const [habits, setHabits] = useState<Habit[] | null>(null);
  const [memories, setMemories] = useState<Memory[] | null>(null);
  const [habitsError, setHabitsError] = useState<string | null>(null);
  const [memoriesError, setMemoriesError] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const silence = useSilenceMs();

  const load = useCallback(async () => {
    setHabitsError(null);
    setMemoriesError(null);
    await Promise.all([
      api
        .get<{ habits: Habit[] }>(`/verticals/${vertical.id}/habits`)
        .then((r) => setHabits(r.habits))
        .catch(() => setHabitsError("No pude cargar lo aprendido. Revisá la conexión.")),
      api
        .get<{ memories: Memory[] }>("/memories")
        .then((r) => setMemories(r.memories))
        .catch(() => setMemoriesError("No pude cargar tus recuerdos.")),
    ]);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  async function onRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  async function forget(habit: Habit) {
    setBusyKey(habit.key);
    setHabitsError(null);
    try {
      await api.delete(`/verticals/${vertical.id}/habits/${encodeURIComponent(habit.key)}`);
      setHabits((prev) => prev?.filter((h) => h.key !== habit.key) ?? null);
    } catch {
      setHabitsError("No pude borrarlo. Probá de nuevo.");
    } finally {
      setBusyKey(null);
    }
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} tintColor={colors.cyan} />}
    >
      <Pressable onPress={() => (router.canGoBack() ? router.back() : router.navigate("/home"))} style={styles.back} accessibilityRole="button" accessibilityLabel="Volver">
        <Text style={styles.link}>← Volver</Text>
      </Pressable>

      <View style={styles.header}>
        <Text style={styles.kicker}>NEXUS · CEREBRO</Text>
        <Text style={styles.title} accessibilityRole="header">🧠 Lo que aprendí de vos</Text>
        <Text style={styles.lead}>
          Aprendo de dos formas: de cada consulta que validás o confirmás (para cada cuadro, qué conducta solés indicar) y de lo que me
          pedís que recuerde («recordá que los martes atiendo en el hospital»). Lo uso para mostrarte «Tu conducta habitual» mientras
          dictás. Todo se ve acá y lo podés borrar. Nunca guardo en lo aprendido el nombre, el documento ni otros datos que identifiquen
          a un paciente.
        </Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle} accessibilityRole="header">Tu conducta habitual</Text>
        {!habits && !habitsError && <ActivityIndicator color={colors.cyan} />}
        {habitsError && <Text style={styles.danger} accessibilityRole="alert">{habitsError}</Text>}
        {habits && habits.length === 0 && (
          <Text style={styles.muted}>Todavía no aprendí nada. Confirmá una consulta con diagnóstico y tratamiento y va a aparecer acá.</Text>
        )}
        {habits?.map((habit) => (
          <View key={habit.key} style={styles.item}>
            <View style={styles.itemBody}>
              <Text style={styles.itemTitle}>{habit.label}</Text>
              {habit.treatments.slice(0, 3).map((t) => (
                <Text key={t.text} style={styles.itemText}>
                  • {t.text} <Text style={styles.muted}>· {t.count} {t.count === 1 ? "vez" : "veces"}</Text>
                </Text>
              ))}
            </View>
            <Pressable
              onPress={() => void forget(habit)}
              disabled={busyKey === habit.key}
              style={[styles.forget, busyKey === habit.key && styles.disabled]}
              accessibilityRole="button"
              accessibilityLabel={`Olvidar ${habit.label}`}
            >
              <Text style={styles.forgetText}>{busyKey === habit.key ? "Borrando…" : "Olvidar"}</Text>
            </Pressable>
          </View>
        ))}
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle} accessibilityRole="header">Lo que me pediste que recuerde</Text>
        {!memories && !memoriesError && <ActivityIndicator color={colors.cyan} />}
        {memoriesError && <Text style={styles.danger} accessibilityRole="alert">{memoriesError}</Text>}
        {memories && memories.length === 0 && (
          <Text style={styles.muted}>Todavía nada. Tocá el micrófono y decime: «recordá que los martes atiendo en el hospital».</Text>
        )}
        {memories?.slice(0, 30).map((m) => (
          <View key={m.id} style={styles.memory}>
            <Text style={styles.itemText}>{m.content}</Text>
          </View>
        ))}
        {memories && memories.length > 0 && <Text style={styles.muted}>Para editarlos o borrarlos, entrá a Memoria en la web de Nexus.</Text>}
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle} accessibilityRole="header">Cómo te escucho</Text>
        <Text style={styles.muted}>
          El micrófono sigue escuchando mientras respirás o pensás. Se detiene cuando tocás «Listo» o después de esta pausa sin hablar:
        </Text>
        <View style={styles.options} accessibilityRole="radiogroup">
          {SILENCE_OPTIONS.map((o) => {
            const on = silence === o.ms;
            return (
              <Pressable
                key={o.ms}
                onPress={() => void setSilenceMs(o.ms)}
                style={[styles.option, on && styles.optionOn]}
                accessibilityRole="radio"
                accessibilityState={{ checked: on }}
                accessibilityLabel={`Detener tras ${o.label}`}
              >
                <Text style={[styles.optionText, on && styles.optionTextOn]}>{o.label}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 20, paddingTop: 56, gap: 14, paddingBottom: 140 },
  back: { minHeight: 44, justifyContent: "center", alignSelf: "flex-start" },
  link: { color: colors.cyan, fontSize: 16 },
  header: { gap: 6 },
  kicker: { color: colors.cyan, fontSize: 11, letterSpacing: 3 },
  title: { color: colors.text, fontSize: 24, fontWeight: "700" },
  lead: { color: colors.muted, fontSize: 15, lineHeight: 22 },
  card: { backgroundColor: colors.panel, borderRadius: 14, padding: 14, gap: 10, borderColor: colors.border, borderWidth: 1 },
  cardTitle: { color: colors.text, fontSize: 18, fontWeight: "700" },
  item: { flexDirection: "row", gap: 10, alignItems: "flex-start", borderColor: colors.border, borderWidth: 1, borderRadius: 12, padding: 12 },
  itemBody: { flex: 1, gap: 4 },
  itemTitle: { color: colors.text, fontSize: 16, fontWeight: "600" },
  itemText: { color: colors.text, fontSize: 15, lineHeight: 21 },
  memory: { borderColor: colors.border, borderWidth: 1, borderRadius: 12, padding: 12 },
  forget: { minHeight: 44, minWidth: 80, paddingHorizontal: 12, borderRadius: 10, borderColor: colors.danger, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  forgetText: { color: colors.danger, fontWeight: "600" },
  disabled: { opacity: 0.5 },
  muted: { color: colors.muted, fontSize: 13, lineHeight: 19 },
  danger: { color: colors.danger },
  options: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  option: { minHeight: 48, paddingHorizontal: 16, borderRadius: 999, borderColor: colors.border, borderWidth: 1, justifyContent: "center" },
  optionOn: { backgroundColor: colors.cyan, borderColor: colors.cyan },
  optionText: { color: colors.text, fontSize: 15 },
  optionTextOn: { color: colors.bg, fontWeight: "700" },
});
