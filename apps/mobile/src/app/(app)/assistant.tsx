import { assignSubject, PlanExecutionError, type CapturePlan, type PlanStep } from "@nexus/verticals";
import { Contact } from "expo-contacts";
import { useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import { ClinicalAssistPanel } from "../../components/ClinicalAssistPanel";
import { api } from "../../lib/api";
import {
  assist,
  confirmPlan,
  DEFAULT_TEMPLATE_ID,
  interpret,
  learnHabits,
  vertical,
  type AssistResult,
  type CaptureMode,
} from "../../lib/clinicalCapture";
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

/** Campos propuestos para la consulta (paso create_record), como `{ clave: valor }`. */
function recordFields(steps: PlanStep[]): Record<string, string> {
  const record = steps.find((s) => s.kind === "create_record");
  return Object.fromEntries((record?.fields ?? []).filter((f) => f.value.trim()).map((f) => [f.key, f.value]));
}

/**
 * Dictar: asistente clínico nativo. Al entrar a la pestaña ya escucha
 * (modo "Dicto yo", sin el paciente): dictás, Nexus propone ficha, consulta
 * (plantilla "visit"), seguimientos y turnos, y no guarda nada hasta que
 * confirmás. La interpretación es determinística en el servidor; el
 * asistente clínico IA trabaja aparte sobre el caso desidentificado.
 */
export default function AssistantScreen() {
  const params = useLocalSearchParams<{ subjectId?: string; subjectName?: string; text?: string }>();
  const dictation = useDictation({ contextualStrings: vertical.vocabulary.domainTerms });
  const [mode, setMode] = useState<CaptureMode>("dictated");
  const [consent, setConsent] = useState(false);
  const [text, setText] = useState("");
  const [subject, setSubject] = useState<{ id: string; name: string } | null>(null);
  const [plan, setPlan] = useState<CapturePlan | null>(null);
  const [steps, setSteps] = useState<PlanStep[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [chosenId, setChosenId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<PatientHit[]>([]);
  const [help, setHelp] = useState<AssistResult | null>(null);
  const [helpLoading, setHelpLoading] = useState(false);
  const [helpError, setHelpError] = useState<string | null>(null);
  const dictationRef = useRef(dictation);
  dictationRef.current = dictation;
  const stateRef = useRef({ mode, text, plan });
  stateRef.current = { mode, text, plan };

  // Desde Pacientes ("Dictar en esta ficha") o derivado por la secretaria (texto ya dicho).
  useEffect(() => {
    if (params.subjectId) {
      setSubject({ id: params.subjectId, name: params.subjectName ?? "Paciente" });
      setPlan(null);
      setDone(null);
    }
  }, [params.subjectId, params.subjectName]);
  useEffect(() => {
    if (params.text) {
      setText(params.text);
      dictationRef.current.reset(params.text);
      setPlan(null);
      setDone(null);
    }
  }, [params.text]);

  // "Apenas entrando": escucha al tomar foco (modo dictado, sin plan pendiente) y suelta el micrófono al salir.
  useFocusEffect(
    useCallback(() => {
      const d = dictationRef.current;
      const s = stateRef.current;
      if (d.available && s.mode === "dictated" && !s.plan && !d.listening) void d.start();
      return () => dictationRef.current.stop();
    }, []),
  );
  useEffect(() => {
    if (dictation.text) setText(dictation.text);
  }, [dictation.text]);

  const canListen = dictation.available && mode !== "typed" && (mode !== "ambient" || consent);

  async function loadAssist(nextSteps: PlanStep[], subjectId: string | undefined) {
    const fields = recordFields(nextSteps);
    if (Object.keys(fields).length === 0) {
      setHelp(null);
      return;
    }
    const created = nextSteps.find((s) => s.kind === "create_subject");
    const newName = typeof created?.request.body?.name === "string" ? created.request.body.name : "";
    setHelpLoading(true);
    setHelpError(null);
    try {
      setHelp(await assist({ fields, subjectId, subject: !subjectId && newName ? { name: newName, age: null, sex: "" } : undefined }));
    } catch (e) {
      setHelpError(e instanceof Error ? e.message : "El asistente clínico no respondió.");
    } finally {
      setHelpLoading(false);
    }
  }

  async function onInterpret() {
    if (dictation.listening) dictation.stop();
    setBusy(true);
    setError(null);
    setDone(null);
    setHelp(null);
    setChosenId(null);
    try {
      const p = await interpret(text, { captureMode: mode, consentConfirmed: consent, subjectId: subject?.id, templateId: DEFAULT_TEMPLATE_ID });
      setPlan(p);
      setSteps(p.steps);
      setSelected(new Set(p.steps.map((s) => s.id)));
      void loadAssist(p.steps, subject?.id);
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
      const created = await confirmPlan({ ...plan, steps }, ids);
      const record = steps.find((s) => s.kind === "create_record" && selected.has(s.id));
      if (record) {
        // Aprende diagnóstico → tratamiento de lo que efectivamente guardaste.
        const subjectStep = steps.find((s) => s.kind === "create_subject" || s.kind === "find_subject");
        const subjectId = subject?.id ?? chosenId ?? (subjectStep ? created[subjectStep.id] : undefined);
        void learnHabits(recordFields([record]), subjectId).catch(() => undefined);
      }
      setDone(`Guardado: ${ids.length} paso${ids.length === 1 ? "" : "s"}. Revisá y validá el borrador antes de cerrarlo.`);
      setPlan(null);
      setHelp(null);
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
    try {
      const res = await api.get<{ patients: PatientHit[] }>(`/clinical/patients?q=${encodeURIComponent(q)}`);
      setHits(res.patients);
    } catch {
      setHits([]);
    }
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
    setChosenId(patient.id);
    void loadAssist(rebound, patient.id);
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
      <Text style={styles.title}>Dictar consulta</Text>
      <Text style={styles.muted}>Nada se guarda hasta que confirmes. Nexus no diagnostica ni prescribe.</Text>

      {subject && (
        <View style={styles.subject}>
          <Text style={styles.subjectText}>Ficha: {subject.name}</Text>
          <Pressable onPress={() => setSubject(null)} hitSlop={10}>
            <Text style={styles.link}>Quitar</Text>
          </Pressable>
        </View>
      )}

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
      <Text style={styles.hint}>Decí: «motivo de consulta…, enfermedad actual…, examen…, diagnóstico presuntivo…, tratamiento…, observaciones…»</Text>

      <TextInput
        value={text}
        onChangeText={(v) => { setText(v); dictation.reset(v); }}
        multiline
        placeholder={subject ? "Motivo de consulta: cefalea de 3 días. Enfermedad actual: … Tratamiento: … Observaciones: …" : "Ej.: Paciente nuevo Juan Pérez, DNI 30.123.456, motivo de consulta cefalea… Control en 2 semanas."}
        placeholderTextColor={colors.muted}
        style={styles.input}
      />
      <Pressable disabled={busy || text.trim().length < 2} onPress={() => void onInterpret()} style={[styles.primary, (busy || text.trim().length < 2) && styles.disabled]}>
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

          <ClinicalAssistPanel result={help} loading={helpLoading} error={helpError} />

          <Pressable disabled={busy || selected.size === 0} onPress={() => void onConfirm()} style={[styles.primary, (busy || selected.size === 0) && styles.disabled]}>
            <Text style={styles.primaryText}>Confirmar y guardar ({selected.size})</Text>
          </Pressable>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 20, paddingTop: 60, gap: 12, paddingBottom: 60 },
  title: { color: colors.text, fontSize: 22, fontWeight: "600" },
  muted: { color: colors.muted, fontSize: 13 },
  hint: { color: colors.muted, fontSize: 13, fontStyle: "italic" },
  subject: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", backgroundColor: colors.panel, borderColor: colors.cyan, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 6 },
  subjectText: { color: colors.text, fontWeight: "600", fontSize: 15, flex: 1 },
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
  disabled: { opacity: 0.5 },
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
