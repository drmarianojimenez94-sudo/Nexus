import { Link, router } from "expo-router";
import { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { NexusFace } from "../../components/NexusFace";
import { ServerField } from "../../components/ServerField";
import { ApiError } from "../../lib/api";
import { useAuth } from "../../lib/auth-context";
import { colors } from "../../lib/theme";

export default function LoginScreen() {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    setError(null);
    setSubmitting(true);
    try {
      await login(email.trim(), password);
      router.replace("/today");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo conectar. Probá de nuevo.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={styles.header}>
        <NexusFace size={56} />
        <Text style={styles.title}>Soy NEXUS</Text>
        <Text style={styles.subtitle}>Tu sistema operativo personal.</Text>
      </View>

      <View style={styles.form}>
        <ServerField />
        <TextInput
          value={email}
          onChangeText={setEmail}
          placeholder="Email"
          placeholderTextColor={colors.muted}
          autoCapitalize="none"
          keyboardType="email-address"
          style={styles.input}
        />
        <TextInput
          value={password}
          onChangeText={setPassword}
          placeholder="Contraseña"
          placeholderTextColor={colors.muted}
          secureTextEntry
          style={styles.input}
        />
        {error && <Text style={styles.error}>{error}</Text>}
        <Pressable
          onPress={() => void handleSubmit()}
          disabled={submitting || !email || !password}
          style={[styles.button, (submitting || !email || !password) && styles.buttonDisabled]}
        >
          <Text style={styles.buttonText}>{submitting ? "Entrando…" : "Entrar"}</Text>
        </Pressable>
        <Link href="/register" style={styles.link}>
          <Text style={styles.linkText}>¿No tenés cuenta? Creá una</Text>
        </Link>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  header: {
    alignItems: "center",
    gap: 8,
    marginBottom: 32,
  },
  title: {
    color: colors.text,
    fontSize: 22,
    fontWeight: "600",
  },
  subtitle: {
    color: colors.muted,
    fontSize: 14,
  },
  form: {
    gap: 12,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.panel,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: colors.text,
    fontSize: 15,
  },
  error: {
    color: colors.danger,
    fontSize: 13,
  },
  button: {
    backgroundColor: colors.cyan,
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: "center",
    marginTop: 4,
  },
  buttonDisabled: {
    opacity: 0.4,
  },
  buttonText: {
    color: colors.bg,
    fontWeight: "600",
    fontSize: 15,
  },
  link: {
    alignItems: "center",
    marginTop: 8,
  },
  linkText: {
    color: colors.cyan,
    fontSize: 13,
  },
});
