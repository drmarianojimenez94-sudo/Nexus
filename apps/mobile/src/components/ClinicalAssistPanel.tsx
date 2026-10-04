import { router } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import type { AssistResult } from "../lib/clinicalCapture";
import { colors } from "../lib/theme";

const AI_STATUS: Record<AssistResult["aiStatus"], string | null> = {
  ok: null,
  not_configured: "La IA no está configurada en el servidor: se muestran solo guías, prevención y tu conducta habitual.",
  disabled: "Sin suficiente texto clínico para pedir sugerencias a la IA.",
  error: "La IA no respondió esta vez. Las guías y recordatorios siguen disponibles.",
};

/**
 * Asistente clínico IA (POST /verticals/medicine/assist): recordatorios de
 * guías con fuentes, prevención por edad y sexo, conducta habitual del
 * profesional y sugerencias de IA sobre el caso desidentificado. Todo es
 * ayuda para el profesional: no se guarda ni se aplica solo.
 */
export function ClinicalAssistPanel({ result, loading, error }: { result: AssistResult | null; loading: boolean; error: string | null }) {
  const [showSent, setShowSent] = useState(false);
  if (!loading && !result && !error) return null;
  const ai = result?.ai;
  return (
    <View style={styles.panel}>
      <Text style={styles.title}>Asistente clínico IA</Text>
      {loading && <ActivityIndicator color={colors.violet} />}
      {error && <Text style={styles.warn}>{error}</Text>}
      {result && (
        <>
          {result.guidelines.length > 0 && (
            <Section title="Recordatorios de guías">
              {result.guidelines.map((g) => (
                <View key={g.id} style={styles.block}>
                  <Text style={styles.label}>{g.label}</Text>
                  {g.checks.map((c) => <Text key={c} style={styles.item}>• {c}</Text>)}
                  {g.approach.map((a) => <Text key={a} style={styles.item}>→ {a}</Text>)}
                  {g.sources.length > 0 && <Text style={styles.source}>Fuentes: {g.sources.join("; ")}</Text>}
                </View>
              ))}
            </Section>
          )}
          {result.prevention.length > 0 && (
            <Section title="Prevención">
              {result.prevention.map((p) => <Text key={p} style={styles.item}>• {p}</Text>)}
            </Section>
          )}
          {result.habits.length > 0 && (
            <Section title="Tu conducta habitual">
              {result.habits.map((h) => (
                <View key={h.key} style={styles.block}>
                  <Text style={styles.label}>{h.label}</Text>
                  {h.treatments.slice(0, 3).map((t) => (
                    <Text key={t.text} style={styles.item}>• {t.text} <Text style={styles.source}>({t.count} {t.count === 1 ? "vez" : "veces"})</Text></Text>
                  ))}
                </View>
              ))}
              <Pressable onPress={() => router.push("/brain")} style={styles.brainLink} accessibilityRole="link" accessibilityLabel="Ver y borrar lo que Nexus aprendió de vos">
                <Text style={styles.toggle}>🧠 Ver lo que aprendí de vos →</Text>
              </Pressable>
            </Section>
          )}
          {ai && (
            <Section title="Sugerencias para el profesional — verificar">
              {ai.summary ? <Text style={styles.item}>{ai.summary}</Text> : null}
              <List title="Señales de alarma" items={ai.redFlags} danger />
              <List title="Considerar" items={ai.considerations} />
              <List title="Estudios" items={ai.workup} />
              {ai.treatmentOptions.length > 0 && (
                <View style={styles.block}>
                  <Text style={styles.label}>Opciones terapéuticas</Text>
                  {ai.treatmentOptions.map((t) => (
                    <Text key={t.option} style={styles.item}>
                      • {t.option}
                      {t.rationale ? ` — ${t.rationale}` : ""}
                      {t.source ? <Text style={styles.source}> ({t.source})</Text> : null}
                    </Text>
                  ))}
                </View>
              )}
              <List title="Controles de seguimiento" items={ai.followupChecks} />
              <List title="Preguntas para completar" items={ai.questions} />
              <Text style={styles.source}>Generado por IA{result.aiProvider ? ` (${result.aiProvider})` : ""} sobre el caso sin datos identificatorios. No reemplaza tu criterio.</Text>
            </Section>
          )}
          {AI_STATUS[result.aiStatus] && <Text style={styles.muted}>{AI_STATUS[result.aiStatus]}</Text>}
          <Pressable onPress={() => setShowSent((v) => !v)}>
            <Text style={styles.toggle}>{showSent ? "▾" : "▸"} Qué se envió a la IA (sin nombre ni DNI)</Text>
          </Pressable>
          {showSent && (
            <View style={styles.sent}>
              <Text style={styles.mono}>Edad: {result.sent.age ?? "—"} · Sexo: {result.sent.sex || "—"}</Text>
              {result.sent.allergies ? <Text style={styles.mono}>Alergias: {result.sent.allergies}</Text> : null}
              {result.sent.medication ? <Text style={styles.mono}>Medicación: {result.sent.medication}</Text> : null}
              {result.sent.history ? <Text style={styles.mono}>Antecedentes: {result.sent.history}</Text> : null}
              {Object.entries(result.sent.fields).map(([k, v]) => <Text key={k} style={styles.mono}>{k}: {v}</Text>)}
              {result.sent.habits.map((h) => <Text key={h} style={styles.mono}>Hábito: {h}</Text>)}
              {result.aiStatus !== "ok" && <Text style={styles.muted}>En esta consulta no se envió nada: la IA no se usó.</Text>}
            </View>
          )}
        </>
      )}
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title.toUpperCase()}</Text>
      {children}
    </View>
  );
}

function List({ title, items, danger }: { title: string; items: string[]; danger?: boolean }) {
  if (items.length === 0) return null;
  return (
    <View style={styles.block}>
      <Text style={[styles.label, danger && styles.danger]}>{title}</Text>
      {items.map((i) => <Text key={i} style={[styles.item, danger && styles.danger]}>• {i}</Text>)}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { backgroundColor: colors.panel, borderRadius: 12, padding: 14, gap: 10, borderColor: colors.violet, borderWidth: 1 },
  title: { color: colors.violet, fontWeight: "700", fontSize: 16 },
  section: { gap: 6, borderTopColor: colors.border, borderTopWidth: 1, paddingTop: 10 },
  sectionTitle: { color: colors.muted, fontSize: 11, fontWeight: "600", letterSpacing: 1.2 },
  block: { gap: 3 },
  label: { color: colors.text, fontWeight: "600", fontSize: 14 },
  item: { color: colors.text, fontSize: 14, lineHeight: 20 },
  source: { color: colors.muted, fontSize: 12, fontStyle: "italic" },
  muted: { color: colors.muted, fontSize: 13 },
  warn: { color: colors.amber, fontSize: 13 },
  danger: { color: colors.danger },
  toggle: { color: colors.cyan, fontSize: 13, paddingVertical: 4 },
  brainLink: { minHeight: 44, justifyContent: "center" },
  sent: { gap: 4, backgroundColor: colors.bg, borderRadius: 8, padding: 10 },
  mono: { color: colors.muted, fontSize: 12, fontFamily: Platform.select({ ios: "Courier", default: "monospace" }) },
});
