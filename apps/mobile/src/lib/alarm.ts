import * as IntentLauncher from "expo-intent-launcher";
import { Platform } from "react-native";
import { scheduleAlarmNotification } from "./notifications";

const DAY_MS = 24 * 60 * 60_000;

export type AlarmResult = "clock" | "notification" | "failed";

/**
 * Alarma del teléfono.
 * - Android: abre el Reloj del sistema con `ACTION_SET_ALARM` (hora,
 *   minutos, etiqueta, sin pasar por su pantalla). Requiere el permiso
 *   `com.android.alarm.permission.SET_ALARM`. Esa alarma solo lleva hora:
 *   si falta más de un día, se programa un aviso con sonido en su lugar.
 * - iPhone: no existe una API pública para crear alarmas en el Reloj; se
 *   programa una notificación local con sonido a esa hora.
 */
export async function setPhoneAlarm(at: Date, title: string): Promise<AlarmResult> {
  if (Platform.OS === "android" && at.getTime() - Date.now() < DAY_MS) {
    // La promesa resuelve recién cuando el usuario vuelve del Reloj (con SKIP_UI, enseguida):
    // si en 1,5 s no falló, el Reloj la recibió.
    const launched = IntentLauncher.startActivityAsync("android.intent.action.SET_ALARM", {
      extra: {
        "android.intent.extra.alarm.HOUR": at.getHours(),
        "android.intent.extra.alarm.MINUTES": at.getMinutes(),
        "android.intent.extra.alarm.MESSAGE": title.slice(0, 80),
        "android.intent.extra.alarm.SKIP_UI": true,
      },
    }).then(
      () => true,
      () => false, // sin app de Reloj compatible: aviso con sonido
    );
    const ok = await Promise.race([launched, new Promise<boolean>((resolve) => setTimeout(() => resolve(true), 1500))]);
    if (ok) return "clock";
  }
  try {
    return (await scheduleAlarmNotification(at, title)) ? "notification" : "failed";
  } catch {
    return "failed";
  }
}
