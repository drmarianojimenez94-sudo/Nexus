import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useAppLock } from "../lib/useAppLock";
import { colors } from "../lib/theme";

/** Muestra el contenido clínico solo después de Face ID / huella / código. */
export function LockGate({ children }: { children: ReactNode }) {
  const { unlocked, message, unlock } = useAppLock();
  if (unlocked) return <>{children}</>;
  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>Pacientes protegidos</Text>
      <Text style={styles.body}>{message ?? "Verificando tu identidad…"}</Text>
      <Pressable onPress={() => void unlock()} style={styles.button}>
        <Text style={styles.buttonText}>Desbloquear</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32, gap: 16, backgroundColor: colors.bg },
  title: { color: colors.text, fontSize: 20, fontWeight: "600" },
  body: { color: colors.muted, textAlign: "center", fontSize: 15, lineHeight: 21 },
  button: { borderColor: colors.cyan, borderWidth: 1, borderRadius: 12, paddingHorizontal: 20, paddingVertical: 10 },
  buttonText: { color: colors.cyan, fontWeight: "600" },
});
