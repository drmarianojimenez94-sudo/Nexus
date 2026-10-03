import * as LocalAuthentication from "expo-local-authentication";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";

/** Tras este tiempo en segundo plano, las fichas vuelven a bloquearse. */
const RELOCK_AFTER_MS = 60_000;

/**
 * Bloqueo biométrico para pantallas con datos de pacientes. Face ID / huella,
 * con el código del dispositivo como alternativa. Sin ningún método de
 * bloqueo configurado, la sección clínica no se abre.
 */
export function useAppLock() {
  const [unlocked, setUnlocked] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const backgroundAt = useRef<number | null>(null);

  const unlock = useCallback(async () => {
    setMessage(null);
    const level = await LocalAuthentication.getEnrolledLevelAsync();
    if (level === LocalAuthentication.SecurityLevel.NONE) {
      setMessage("Configurá un código, Face ID o huella en el teléfono para abrir las fichas de pacientes.");
      return;
    }
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: "Desbloquear pacientes",
      cancelLabel: "Cancelar",
      disableDeviceFallback: false,
    });
    if (result.success) setUnlocked(true);
    else setMessage("No se pudo verificar tu identidad.");
  }, []);

  useEffect(() => {
    void unlock();
    const sub = AppState.addEventListener("change", (state) => {
      if (state !== "active") backgroundAt.current = Date.now();
      else if (backgroundAt.current && Date.now() - backgroundAt.current > RELOCK_AFTER_MS) {
        setUnlocked(false);
        void unlock();
      }
    });
    return () => sub.remove();
  }, [unlock]);

  return { unlocked, message, unlock };
}
