import { assignSubject, PlanExecutionError, type CapturePlan, type PlanStep } from "@nexus/verticals";
import { Contact } from "expo-contacts";
import { Link } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import { LockGate } from "../../components/LockGate";
import { api } from "../../lib/api";
import { confirmPlan, interpret, vertical, type CaptureMode } from "../../lib/clinicalCapture";
import { colors } from "../../lib/theme";
import { useDictation } from "../../lib/useDictation";

interface PatientHit {
  id: string;
  name: string;
  document: string;
}

const MODES: { id: CaptureMode; label: string }[] = [
  { id: "dictated", label: "Dicto yo" },
  { id: "ambient", label: "Con el paciente" },
  { id: "typed", label: "Escribo" },
];

/**
 * Asistente clínico nativo. Al entrar ya escucha (modo "Dicto yo", sin el
 * paciente): dictás, Nexus propone ficha, borrador de consulta, seguimientos
 * y turnos, y no guarda nada hasta que confirmás. La interpretación es
 * determinística en el servidor de Nexus: no usa IA externa.
 */
function AssistantScreen() {
  const dictation = useDictation({ contextualStrings: vertical.vocabulary.domainTerms });
  const [mode, setMode] = useState<CaptureMode>("dictated");
  const [consent, setConsent] = useState(false);
  const [text, setText] = useState("");
  const [plan, setPlan] = useState<CapturePlan | null>(null);
  const [steps, setSteps] = useState<PlanStep[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<PatientHit[]>([]);
  const started = useRef(false);

  // "Apenas entrando": empieza a escuchar sola en modo dictado del profesional.
  useEffect(() => {
    if (!started.current && dictation.available && mode === "dictated") {
      started.current = true;
      void dictation.start();
    }
  }, [dictation, mode]);
  useEffect(() => {
    if (dictation.text) setText(dictation.text);
  }, [dictation.text]);

  const canListen = dictation.available && mode !== "typed" && (mode !== "ambient" || consent);

  async function onInterpret() {
    if (dictation.listening) dictation.stop();
    setBusy(true);
    setError(null);
    setDone(null);
    try {
      const p = await interpret(text, { captureMode: mode, consentConfirmed: consent });
      setPlan(p);
      setSteps(p.steps);
      setSelected(new Set(p.steps.map((s) => s.id)));
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo interpretar.");
    } finally {
      setBusy(false);
    }
  }

  async function onConfirm() {
    if (!plan) return;
    setBusy(true);
    setError(null);
    try {
      const ids = steps.filter((s) => selected.has(s.id)).map((s) => s.id);
      await confirmPlan({ ...plan, steps }, ids);
      setDone(`Guardado: ${ids.length} paso${ids.length === 1 ? "" : "s"}. Revisá y validá el borrador antes de cerrarlo.`);
      setPlan(null);
      setText("");
      dictation.reset();
    } catch (e) {
      if (e instanceof PlanExecutionError) {
        // Lo ya creado no se repite: se desmarca y se informa.
        setSelected((prev) => new Set([...prev].filter((id) => !(id in e.completed))));
        setError(e.message);
        if (e.code === "ambiguous_subject") setHits(e.candidates as PatientHit[]);
      } else setError(e instanceof Error ? e.message : "No se pudo guardar.");
    } finally {
      setBusy(false);
    }
  }

  async function search(q: string) {
    setQuery(q);
    if (q.trim().length < 2) return setHits([]);
    const res = await api.get<{ patients: PatientHit[] }>(`/clinical/patients?q=${encodeURIComponent(q)}`);
    setHits(res.patients);
  }

  function choose(patient: PatientHit) {
    // La ficha elegida reemplaza la búsqueda o el "$subject" pendiente.
    const withoutLookup = steps.filter((s) => s.kind !== "find_subject");
    const rebound = assignSubject(
      withoutLookup.map((s) => (s.bind && Object.values(s.bind).some((ref) => steps.some((x) => x.kind === "find_subject" && ref === `$${x.id}`)) ? { ...s, bind: Object.fromEntries(Object.entries(s.bind).map(([k]) => [k, "$subject"])) } : s)),
      patient.id,
    );
    setSteps(rebound);
    setSelected(new Set(rebound.map((s) => s.id)));
    setHits([]);
    setQuery(patient.name);
  }

  async function attachContact() {
    const contact = await Contact.presentPicker();
    if (!contact) return;
    const phone = (await contact.getPhones())[0]?.number;
    if (!phone) return setError("Ese contacto no tiene teléfono.");
    setSteps((prev) => prev.map((s) => (s.kind === "create_subject" ? { ...s, request: { ...s.request, body: { ...s.request.body, phone } }, summary: `${s.summary} · tel. ${phone}` } : s)));
  }

  const flags = plan?.safety.redFlags.filter((r) => !r.negated) ?? [];
  const needsSubject = steps.some((s) => s.kind === "find_subject" || Object.values(s.bind ?? {}).includes("$subject"));

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Text style={styles.title}>Asistente clínico</Text>
      <Text style={styles.muted}>Nada se guarda hasta que confirmes. Nexus no diagnostica ni prescribe.</Text>

      <View style={styles.row}>
        {MODES.map((m) => (
          <Pressable key={m.id} onPress={() => { setMode(m.id); if (dictation.listening) dictation.stop(); }} style={[styles.chip, mode === m.id && styles.chipOn]}>
            <Text style={[styles.chipText, mode === m.id && styles.chipTextOn]}>{m.label}</Text>
          </Pressable>
        ))}
      </View>
      {mode === "ambient" && (
        <View style={styles.consent}>
          <Switch value={consent} onValueChange={setConsent} />
          <Text style={styles.consentText}>{vertical.consent.recording.statement}</Text>
        </View>
      )}

      {canListen && (
        <Pressable onPress={() => (dictation.listening ? dictation.stop() : void dictation.start())} style={[styles.mic, dictation.listening && styles.micOn]}>
          <Text style={styles.micText}>{dictation.listening ? "■ Detener" : "🎙 Dictar"}</Text>
        </Pressable>
      )}
      {dictation.listening && <Text style={styles.muted}>Escuchando{dictation.onDevice ? " (en el dispositivo)" : ""}…</Text>}
      {!dictation.available && mode !== "typed" && <Text style={styles.muted}>Dictado no disponible en este dispositivo: escribí la nota.</Text>}
      {dictation.error && <Text style={styles.warn}>{dictation.error}</Text>}

      <TextInput
        value={text}
        onChangeText={(v) => { setText(v); dictation.reset(v); }}
        multiline
        placeholder="Ej.: Paciente nuevo Juan Pérez, DNI 30.123.456, consulta por cefalea… Control en 2 semanas."
        placeholderTextColor={colors.muted}
        style={styles.input}
      />
      <Pressable disabled={busy || text.trim().length < 2} onPress={() => void onInterpret()} style={styles.primary}>
        {busy ? <ActivityIndicator color={colors.bg} /> : <Text style={styles.primaryText}>Interpretar</Text>}
      </Pressable>

      {error && <Text style={styles.danger}>{error}</Text>}
      {done && <Text style={styles.ok}>{done}</Text>}

      {plan && (
        <View style={styles.plan}>
          {flags.map((f) => (
            <Text key={f.id} style={styles.flag}>⚠ {f.label}: {f.escalation}</Text>
          ))}
          {plan.warnings.filter((w) => !w.startsWith("⚠")).map((w) => (
            <Text key={w} style={styles.warn}>{w}</Text>
          ))}
          {needsSubject && (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Elegí la ficha</Text>
              <TextInput value={query} onChangeText={(q) => void search(q)} placeholder="Buscar por nombre o DNI" placeholderTextColor={colors.muted} style={styles.search} />
              {hits.map((h) => (
                <Pressable key={h.id} onPress={() => choose(h)}>
                  <Text style={styles.item}>{h.name}{h.document ? ` · ${h.document}` : ""}</Text>
                </Pressable>
              ))}
            </View>
          )}
          {steps.map((s) => (
            <Pressable key={s.id} onPress={() => setSelected((prev) => { const next = new Set(prev); if (next.has(s.id)) next.delete(s.id); else next.add(s.id); return next; })} style={[styles.card, !selected.has(s.id) && styles.cardOff]}>
              <Text style={styles.cardTitle}>{selected.has(s.id) ? "☑" : "☐"} {s.summary}</Text>
              {s.fields?.map((f) => (
                <View key={f.key} style={styles.field}>
                  <Text style={styles.fieldLabel}>{f.label}{f.provisional ? " · presuntivo" : ""}</Text>
                  <Text style={styles.item}>{f.value}</Text>
                  <Text style={styles.evidence}>Dijiste: «{f.evidence.map((e) => e.text).join(" … ")}»</Text>
                </View>
              ))}
              {s.warnings.map((w) => <Text key={w} style={styles.warn}>{w}</Text>)}
            </Pressable>
          ))}
          {steps.some((s) => s.kind === "create_subject") && (
            <Pressable onPress={() => void attachContact()}>
              <Text style={styles.link}>📇 Completar teléfono desde contactos</Text>
            </Pressable>
          )}
          <Pressable disabled={busy || selected.size === 0} onPress={() => void onConfirm()} style={styles.primary}>
            <Text style={styles.primaryText}>Confirmar y guardar ({selected.size})</Text>
          </Pressable>
        </View>
      )}
      <Link href="/day" style={styles.link}>← Mi día</Link>
    </ScrollView>
  );
}

export default function Assistant() {
  return (
    <LockGate>
      <AssistantScreen />
    </LockGate>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 20, paddingTop: 60, gap: 12, paddingBottom: 60 },
  title: { color: colors.text, fontSize: 22, fontWeight: "600" },
  muted: { color: colors.muted, fontSize: 13 },
  row: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  chip: { borderColor: colors.border, borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  chipOn: { borderColor: colors.cyan, backgroundColor: colors.panel },
  chipText: { color: colors.muted, fontSize: 13 },
  chipTextOn: { color: colors.cyan },
  consent: { flexDirection: "row", gap: 10, alignItems: "center" },
  consentText: { color: colors.text, fontSize: 13, flex: 1 },
  mic: { alignItems: "center", paddingVertical: 16, borderRadius: 16, borderWidth: 1, borderColor: colors.cyan },
  micOn: { backgroundColor: colors.panel, borderColor: colors.danger },
  micText: { color: colors.text, fontSize: 18, fontWeight: "600" },
  input: { minHeight: 140, color: colors.text, backgroundColor: colors.panel, borderRadius: 12, padding: 12, fontSize: 15, textAlignVertical: "top" },
  search: { color: colors.text, borderColor: colors.border, borderWidth: 1, borderRadius: 8, padding: 8 },
  primary: { backgroundColor: colors.cyan, borderRadius: 12, paddingVertical: 14, alignItems: "center" },
  primaryText: { color: colors.bg, fontWeight: "700", fontSize: 16 },
  plan: { gap: 10 },
  flag: { color: colors.danger, fontWeight: "600", fontSize: 14 },
  warn: { color: colors.amber, fontSize: 13 },
  danger: { color: colors.danger },
  ok: { color: colors.cyan },
  card: { backgroundColor: colors.panel, borderRadius: 12, padding: 12, gap: 6, borderColor: colors.border, borderWidth: 1 },
  cardOff: { opacity: 0.45 },
  cardTitle: { color: colors.text, fontWeight: "600", fontSize: 15 },
  field: { gap: 2, marginTop: 4 },
  fieldLabel: { color: colors.muted, fontSize: 12 },
  item: { color: colors.text, fontSize: 14 },
  evidence: { color: colors.muted, fontSize: 12, fontStyle: "italic" },
  link: { color: colors.cyan, fontSize: 14, paddingVertical: 8 },
});
