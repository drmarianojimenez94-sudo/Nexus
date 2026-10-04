import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { getPref, setPref } from "./prefs";

/**
 * Notificaciones locales (expo-notifications, sin push ni servidor):
 * resumen diario de "Mi día" y alarmas en iPhone. El texto nunca lleva
 * nombres de pacientes ni datos clínicos: se ve en la pantalla bloqueada.
 */

const CHANNEL_ID = "nexus";
const DAILY_ID_KEY = "daily_summary_id";
const DAILY_TIME_KEY = "daily_summary_time";
const DAILY_ON_KEY = "daily_summary_on";

export const supported = Platform.OS === "ios" || Platform.OS === "android";

if (supported) {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
  });
}

/** Pide permiso recién cuando hace falta (Android 13+ requiere el canal antes del pedido). */
export async function ensureNotificationPermission(): Promise<boolean> {
  if (!supported) return false;
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: "Avisos de Nexus",
      importance: Notifications.AndroidImportance.HIGH,
      sound: "default",
      vibrationPattern: [0, 250, 250, 250],
    });
  }
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  if (!current.canAskAgain) return false;
  const asked = await Notifications.requestPermissionsAsync();
  return asked.granted;
}

export interface DailyTime {
  hour: number;
  minute: number;
}

export async function getDailySummary(): Promise<{ enabled: boolean; time: DailyTime }> {
  const [on, raw] = await Promise.all([getPref(DAILY_ON_KEY), getPref(DAILY_TIME_KEY)]);
  const [hour, minute] = (raw ?? "8:00").split(":").map(Number);
  return { enabled: on === "1", time: { hour: hour ?? 8, minute: minute ?? 0 } };
}

/** Programa (o reprograma) el aviso diario de "Mi día". Devuelve false si no hay permiso. */
export async function enableDailySummary(time: DailyTime): Promise<boolean> {
  if (!(await ensureNotificationPermission())) return false;
  await cancelDailySummary(false);
  const id = await Notifications.scheduleNotificationAsync({
    content: {
      title: "Mi día",
      body: "Tu resumen está listo: turnos, pendientes y borradores por validar.",
      sound: "default",
      data: { url: "/day" },
    },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DAILY, hour: time.hour, minute: time.minute, channelId: CHANNEL_ID },
  });
  await Promise.all([setPref(DAILY_ID_KEY, id), setPref(DAILY_TIME_KEY, `${time.hour}:${time.minute}`), setPref(DAILY_ON_KEY, "1")]);
  return true;
}

export async function cancelDailySummary(markOff = true): Promise<void> {
  const id = await getPref(DAILY_ID_KEY);
  if (id && supported) await Notifications.cancelScheduledNotificationAsync(id).catch(() => undefined);
  await setPref(DAILY_ID_KEY, null);
  if (markOff) await setPref(DAILY_ON_KEY, "0");
}

/** Aviso con sonido a una hora puntual (la "alarma" posible en iPhone). */
export async function scheduleAlarmNotification(at: Date, title: string): Promise<boolean> {
  if (!(await ensureNotificationPermission())) return false;
  await Notifications.scheduleNotificationAsync({
    content: { title: "Alarma de Nexus", body: title, sound: "default", data: { url: "/home" } },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: at, channelId: CHANNEL_ID },
  });
  return true;
}

/** Al tocar un aviso, abre la pantalla que indica (`data.url`). */
export function onNotificationOpen(handler: (url: string) => void): () => void {
  if (!supported) return () => undefined;
  const open = (response: Notifications.NotificationResponse | null) => {
    const url = response?.notification.request.content.data?.url;
    if (typeof url !== "string") return;
    Notifications.clearLastNotificationResponse();
    handler(url);
  };
  open(Notifications.getLastNotificationResponse());
  const sub = Notifications.addNotificationResponseReceivedListener(open);
  return () => sub.remove();
}
