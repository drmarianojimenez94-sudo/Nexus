import type { ClinicalEncounter, Patient } from "@nexus/shared";
import Ionicons from "@expo/vector-icons/Ionicons";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Linking, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { api } from "../../../lib/api";
import { colors } from "../../../lib/theme";

const SEX: Record<string, string> = { F: "Femenino", M: "Masculino", X: "X / no binario" };
const date = (iso: string) => new Date(iso).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" });
const ymd = (v: string) => v.split("-").reverse().join("/");

function age(birthDate: string): number | null {
  if (!birthDate) return null;
  const b = new Date(`${birthDate}T00:00:00`);
  const now = new Date();
  let years = now.getFullYear() - b.getFullYear();
  if (now.getMonth() < b.getMonth() || (now.getMonth() === b.getMonth() && now.getDate() < b.getDate())) years--;
  return years;
}

/** Ficha del paciente: datos y consultas (folio, fecha, plantilla, estado y campos). */
export default function PatientDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [patient, setPatient] = useState<Patient | null>(null);
  const [encounters, setEncounters] = useState<ClinicalEncounter[]>([]);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setError(null);
    try {
      const res = await api.get<{ patient: Patient; encounters: ClinicalEncounter[] }>(`/clinical/patients/${encodeURIComponent(id)}`);
      setPatient(res.patient);
      setEncounters(res.encounters);
      setOpen(new Set(res.encounters.slice(0, 1).map((e) => e.id)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo abrir la ficha.");
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  function toggle(encounterId: string) {
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(encounterId)) next.delete(encounterId);
      else next.add(encounterId);
      return next;
    });
  }

  const years = patient ? age(patient.birthDate) : null;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} tintColor={colors.cyan} onRefresh={() => { setRefreshing(true); void load().finally(() => setRefreshing(false)); }} />}
    >
      <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace("/patients"))}>
        <Text style={styles.link}>← Pacientes</Text>
      </Pressable>
      {!patient && !error && <ActivityIndicator color={colors.cyan} />}
      {error && <Text style={styles.danger}>{error}</Text>}
      {patient && (
        <>
          <Text style={styles.title}>{patient.name}</Text>
          <Text style={styles.muted}>
            {[patient.document && `DNI ${patient.document}`, patient.birthDate && `${ymd(patient.birthDate)}${years !== null ? ` (${years} años)` : ""}`, SEX[patient.sex]].filter(Boolean).join(" · ")}
          </Text>

          <Pressable
            onPress={() => router.navigate({ pathname: "/assistant", params: { subjectId: patient.id, subjectName: patient.name } })}
            style={styles.primary}
          >
            <Ionicons name="mic" size={20} color={colors.bg} />
            <Text style={styles.primaryText}>Dictar en esta ficha</Text>
          </Pressable>

          <View style={styles.card}>
            {patient.phone ? (
              <Pressable onPress={() => void Linking.openURL(`tel:${patient.phone.replace(/[^\d+]/g, "")}`)}>
                <Field label="Teléfono" value={patient.phone} link />
              </Pressable>
            ) : (
              <Field label="Teléfono" value="" />
            )}
            {patient.familyContact ? <Field label="Contacto familiar" value={patient.familyContact} /> : null}
            <Field label="Alergias" value={patient.allergies} warn={Boolean(patient.allergies)} />
            <Field label="Medicación habitual" value={patient.medication} />
            <Field label="Antecedentes" value={patient.history} />
          </View>

          <Text style={styles.sectionTitle}>CONSULTAS ({encounters.length})</Text>
          {encounters.length === 0 && <Text style={styles.muted}>Sin consultas todavía.</Text>}
          {encounters.map((e) => {
            const expanded = open.has(e.id);
            const fields = (e.template?.fields ?? []).filter((f) => e.fields[f.key]?.trim());
            return (
              <Pressable key={e.id} onPress={() => toggle(e.id)} style={styles.card}>
                <View style={styles.encounterHead}>
                  <Text style={styles.folio}>Folio {e.folio ?? "–"}</Text>
                  <Text style={[styles.badge, e.status === "FINAL" ? styles.badgeFinal : styles.badgeDraft]}>{e.status === "FINAL" ? "Validada" : "Borrador"}</Text>
                </View>
                <Text style={styles.item}>{date(e.occurredAt)} · {e.template?.name ?? e.templateId}</Text>
                {expanded &&
                  (fields.length > 0 ? (
                    fields.map((f) => <Field key={f.key} label={f.label} value={e.fields[f.key] ?? ""} />)
                  ) : (
                    <Text style={styles.muted}>Sin campos completados.</Text>
                  ))}
                {!expanded && fields.length > 0 && <Text style={styles.muted} numberOfLines={1}>{e.fields[fields[0]!.key]}</Text>}
              </Pressable>
            );
          })}
          <Text style={styles.muted}>Para validar o corregir una consulta, usá la web: la versión validada queda inalterable.</Text>
        </>
      )}
    </ScrollView>
  );
}

function Field({ label, value, warn, link }: { label: string; value: string; warn?: boolean; link?: boolean }) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <Text style={[styles.item, !value && styles.empty, warn && styles.warn, link && styles.linkText]}>{value || "—"}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 20, paddingTop: 60, gap: 12, paddingBottom: 40 },
  title: { color: colors.text, fontSize: 24, fontWeight: "600" },
  muted: { color: colors.muted, fontSize: 13 },
  link: { color: colors.cyan, fontSize: 14, paddingVertical: 4 },
  linkText: { color: colors.cyan },
  danger: { color: colors.danger },
  primary: { flexDirection: "row", gap: 8, justifyContent: "center", alignItems: "center", backgroundColor: colors.cyan, borderRadius: 12, paddingVertical: 14 },
  primaryText: { color: colors.bg, fontWeight: "700", fontSize: 16 },
  card: { backgroundColor: colors.panel, borderRadius: 12, padding: 14, gap: 8, borderColor: colors.border, borderWidth: 1 },
  sectionTitle: { color: colors.muted, fontSize: 11, fontWeight: "600", letterSpacing: 1.5, marginTop: 8 },
  encounterHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  folio: { color: colors.text, fontWeight: "600", fontSize: 15 },
  badge: { fontSize: 12, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3, overflow: "hidden" },
  badgeFinal: { color: colors.cyan, borderColor: colors.cyan, borderWidth: 1 },
  badgeDraft: { color: colors.amber, borderColor: colors.amber, borderWidth: 1 },
  field: { gap: 2 },
  fieldLabel: { color: colors.muted, fontSize: 12 },
  item: { color: colors.text, fontSize: 14, lineHeight: 20 },
  empty: { color: colors.muted },
  warn: { color: colors.amber },
});
