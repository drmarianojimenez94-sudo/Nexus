import type { Patient } from "@nexus/shared";
import { uuid } from "@nexus/verticals";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Contact } from "expo-contacts";
import { router } from "expo-router";
import { useRef, useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { api } from "../../../lib/api";
import { colors } from "../../../lib/theme";

const SEXES = [
  { id: "F", label: "Femenino" },
  { id: "M", label: "Masculino" },
  { id: "X", label: "X" },
] as const;

/** "dd/mm/aaaa" → "aaaa-mm-dd" (o null si no es una fecha válida y pasada). */
function parseBirthDate(input: string): string | null | "" {
  const v = input.trim();
  if (!v) return "";
  const m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(v);
  if (!m) return null;
  const iso = `${m[3]}-${m[2]!.padStart(2, "0")}-${m[1]!.padStart(2, "0")}`;
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== iso || iso > new Date().toISOString().slice(0, 10)) return null;
  return iso;
}

/** Alta de paciente. El teléfono puede venir del selector de contactos del sistema (no lee la agenda completa). */
export default function NewPatient() {
  const [name, setName] = useState("");
  const [document, setDocument] = useState("");
  const [birth, setBirth] = useState("");
  const [sex, setSex] = useState<"" | "F" | "M" | "X">("");
  const [phone, setPhone] = useState("");
  const [allergies, setAllergies] = useState("");
  const [medication, setMedication] = useState("");
  const [history, setHistory] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Mismo intento → mismo clientId: un reintento no duplica la ficha.
  const clientId = useRef(uuid());

  async function pickContact() {
    setError(null);
    try {
      const contact = await Contact.presentPicker();
      if (!contact) return;
      const number = (await contact.getPhones())[0]?.number;
      if (!number) return setError("Ese contacto no tiene teléfono.");
      setPhone(number);
    } catch {
      setError("No se pudo abrir el selector de contactos.");
    }
  }

  async function save() {
    setError(null);
    if (name.trim().length < 2) return setError("Completá el nombre y apellido.");
    const birthDate = parseBirthDate(birth);
    if (birthDate === null) return setError("Fecha de nacimiento inválida: usá dd/mm/aaaa.");
    setBusy(true);
    try {
      const res = await api.post<{ patient: Patient }>("/clinical/patients", {
        clientId: clientId.current,
        name: name.trim(),
        document: document.trim(),
        birthDate,
        sex,
        phone: phone.trim(),
        allergies: allergies.trim(),
        medication: medication.trim(),
        history: history.trim(),
      });
      router.replace({ pathname: "/patients/[id]", params: { id: res.patient.id } });
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar la ficha.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Pressable onPress={() => router.back()}>
          <Text style={styles.link}>← Cancelar</Text>
        </Pressable>
        <Text style={styles.title}>Nuevo paciente</Text>

        <Input label="Nombre y apellido *" value={name} onChangeText={setName} autoCapitalize="words" />
        <Input label="DNI" value={document} onChangeText={setDocument} keyboardType="number-pad" />
        <Input label="Fecha de nacimiento (dd/mm/aaaa)" value={birth} onChangeText={setBirth} keyboardType="numbers-and-punctuation" placeholder="31/12/1980" />

        <Text style={styles.label}>Sexo</Text>
        <View style={styles.row}>
          {SEXES.map((s) => (
            <Pressable key={s.id} onPress={() => setSex(sex === s.id ? "" : s.id)} style={[styles.chip, sex === s.id && styles.chipOn]}>
              <Text style={[styles.chipText, sex === s.id && styles.chipTextOn]}>{s.label}</Text>
            </Pressable>
          ))}
        </View>

        <Text style={styles.label}>Teléfono</Text>
        <View style={styles.phoneRow}>
          <TextInput value={phone} onChangeText={setPhone} keyboardType="phone-pad" style={[styles.input, { flex: 1 }]} placeholderTextColor={colors.muted} />
          <Pressable onPress={() => void pickContact()} style={styles.contactButton} accessibilityLabel="Elegir de contactos">
            <Ionicons name="person-circle-outline" size={22} color={colors.cyan} />
            <Text style={styles.contactText}>Contactos</Text>
          </Pressable>
        </View>

        <Input label="Alergias" value={allergies} onChangeText={setAllergies} multiline />
        <Input label="Medicación habitual" value={medication} onChangeText={setMedication} multiline />
        <Input label="Antecedentes" value={history} onChangeText={setHistory} multiline />

        {error && <Text style={styles.danger}>{error}</Text>}
        <Pressable onPress={() => void save()} disabled={busy} style={styles.primary}>
          {busy ? <ActivityIndicator color={colors.bg} /> : <Text style={styles.primaryText}>Guardar ficha</Text>}
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Input({ label, multiline, ...props }: { label: string } & React.ComponentProps<typeof TextInput>) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={styles.label}>{label}</Text>
      <TextInput {...props} multiline={multiline} placeholderTextColor={colors.muted} style={[styles.input, multiline && styles.multiline]} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 20, paddingTop: 60, gap: 12, paddingBottom: 60 },
  title: { color: colors.text, fontSize: 22, fontWeight: "600" },
  label: { color: colors.muted, fontSize: 13 },
  input: { color: colors.text, backgroundColor: colors.panel, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15 },
  multiline: { minHeight: 70, textAlignVertical: "top" },
  row: { flexDirection: "row", gap: 8 },
  chip: { borderColor: colors.border, borderWidth: 1, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 7 },
  chipOn: { borderColor: colors.cyan, backgroundColor: colors.panel },
  chipText: { color: colors.muted },
  chipTextOn: { color: colors.cyan },
  phoneRow: { flexDirection: "row", gap: 8, alignItems: "center" },
  contactButton: { flexDirection: "row", alignItems: "center", gap: 4, borderColor: colors.border, borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 9 },
  contactText: { color: colors.cyan, fontSize: 13 },
  primary: { backgroundColor: colors.cyan, borderRadius: 12, paddingVertical: 14, alignItems: "center", marginTop: 8 },
  primaryText: { color: colors.bg, fontWeight: "700", fontSize: 16 },
  link: { color: colors.cyan, fontSize: 14, paddingVertical: 4 },
  danger: { color: colors.danger },
});
