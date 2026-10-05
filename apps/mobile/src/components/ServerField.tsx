import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { getServerUrl, serverReady, setServerUrl } from "../lib/api";
import { colors } from "../lib/theme";

/**
 * Dirección de tu Nexus en la pantalla de ingreso: la misma que usás en el
 * navegador. Si ya está configurada se muestra resumida con «Cambiar».
 */
export function ServerField() {
  const [ready, setReady] = useState(false);
  const [url, setUrl] = useState("");
  const [editing, setEditing] = useState(false);
  const [checking, setChecking] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    void serverReady.then(() => {
      setUrl(getServerUrl());
      setEditing(!getServerUrl());
      setReady(true);
    });
  }, []);

  async function save() {
    setChecking(true);
    setMessage(null);
    const error = await setServerUrl(url);
    setChecking(false);
    if (error) setMessage(error);
    else {
      setUrl(getServerUrl());
      setEditing(false);
      setMessage("✓ Conectado a tu Nexus.");
    }
  }

  if (!ready) return null;
  if (!editing)
    return (
      <View style={styles.row}>
        <Text style={styles.small} numberOfLines={1}>
          Servidor: {url.replace(/^https?:\/\//, "")}
        </Text>
        <Pressable onPress={() => setEditing(true)} accessibilityRole="button" style={styles.change}>
          <Text style={styles.link}>Cambiar</Text>
        </Pressable>
        {message && <Text style={styles.ok}>{message}</Text>}
      </View>
    );
  return (
    <View style={styles.box}>
      <Text style={styles.label}>Dirección de tu Nexus</Text>
      <Text style={styles.small}>La misma que abrís en el navegador, por ejemplo nexus-xxxx.onrender.com.</Text>
      <TextInput
        value={url}
        onChangeText={setUrl}
        placeholder="nexus-xxxx.onrender.com"
        placeholderTextColor={colors.muted}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
        style={styles.input}
        accessibilityLabel="Dirección de tu Nexus"
      />
      {message && <Text style={message.startsWith("✓") ? styles.ok : styles.error}>{message}</Text>}
      <Pressable onPress={() => void save()} disabled={checking || !url.trim()} style={[styles.button, (checking || !url.trim()) && styles.disabled]} accessibilityRole="button">
        {checking ? <ActivityIndicator color={colors.bg} /> : <Text style={styles.buttonText}>Probar y guardar</Text>}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 8 },
  box: { gap: 8, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.panel },
  label: { color: colors.text, fontSize: 15, fontWeight: "600" },
  small: { color: colors.muted, fontSize: 13, flexShrink: 1 },
  change: { minHeight: 44, justifyContent: "center", paddingHorizontal: 8 },
  link: { color: colors.cyan, fontSize: 14 },
  input: { borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bg, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, color: colors.text, fontSize: 15 },
  error: { color: colors.danger, fontSize: 13 },
  ok: { color: colors.cyan, fontSize: 13 },
  button: { backgroundColor: colors.cyan, borderRadius: 12, minHeight: 48, alignItems: "center", justifyContent: "center" },
  buttonText: { color: colors.bg, fontWeight: "700", fontSize: 15 },
  disabled: { opacity: 0.4 },
});
