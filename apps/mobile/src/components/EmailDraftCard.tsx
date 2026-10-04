import { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { dismissDraft, sendPendingDraft, useSecretary } from "../lib/secretary";
import { colors } from "../lib/theme";

/** Borrador de mail que propuso la secretaria. Nunca se envía sin el toque en «Enviar». */
export function EmailDraftCard() {
  const { draft, notice } = useSecretary();
  const [sending, setSending] = useState(false);
  if (!draft) return notice ? <Text style={styles.danger}>{notice}</Text> : null;

  async function onSend() {
    setSending(true);
    await sendPendingDraft();
    setSending(false);
  }

  return (
    <View style={styles.card} accessibilityLabel="Borrador de mail">
      <Text style={styles.cardTitle}>Borrador de mail</Text>
      <Text style={styles.meta}>Para: <Text style={styles.item}>{draft.to}</Text></Text>
      <Text style={styles.meta}>Asunto: <Text style={styles.item}>{draft.subject}</Text></Text>
      <Text style={styles.body}>{draft.body}</Text>
      {draft.note && <Text style={styles.warn}>{draft.note}</Text>}
      <View style={styles.row}>
        {draft.connected && draft.id && draft.confirmationToken ? (
          <Pressable onPress={() => void onSend()} disabled={sending} style={styles.primary} accessibilityRole="button" accessibilityLabel="Enviar el mail">
            {sending ? <ActivityIndicator color={colors.bg} /> : <Text style={styles.primaryText}>Enviar</Text>}
          </Pressable>
        ) : null}
        <Pressable onPress={dismissDraft} style={styles.secondary} accessibilityRole="button">
          <Text style={styles.secondaryText}>{draft.connected ? "Dejar en borradores" : "Cerrar"}</Text>
        </Pressable>
      </View>
      {notice && <Text style={styles.danger}>{notice}</Text>}
      <Text style={styles.muted}>Nexus nunca envía un mail sin que toques «Enviar».</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.panel, borderRadius: 12, padding: 14, gap: 6, borderColor: colors.border, borderWidth: 1 },
  cardTitle: { color: colors.text, fontWeight: "600", fontSize: 15 },
  meta: { color: colors.muted, fontSize: 13 },
  item: { color: colors.text },
  body: { color: colors.text, fontSize: 14, lineHeight: 20, marginTop: 4 },
  row: { flexDirection: "row", gap: 10, marginTop: 6 },
  primary: { backgroundColor: colors.cyan, borderRadius: 10, minHeight: 48, paddingHorizontal: 20, alignItems: "center", justifyContent: "center" },
  primaryText: { color: colors.bg, fontWeight: "700", fontSize: 16 },
  secondary: { borderColor: colors.border, borderWidth: 1, borderRadius: 10, minHeight: 48, paddingHorizontal: 16, justifyContent: "center" },
  secondaryText: { color: colors.text },
  muted: { color: colors.muted, fontSize: 12 },
  warn: { color: colors.amber, fontSize: 13 },
  danger: { color: colors.danger },
});
