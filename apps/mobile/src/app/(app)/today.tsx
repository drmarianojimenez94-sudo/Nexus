import type { Event, Task } from "@nexus/shared";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { NexusFace, type FaceState } from "../../components/NexusFace";
import { api } from "../../lib/api";
import { useAuth } from "../../lib/auth-context";
import { colors } from "../../lib/theme";
import { useVoice } from "../../lib/voice";

interface TodayResponse {
  now: Event | null;
  priorities: Task[];
  timeline: Event[];
  attention: string[];
  insight: string | null;
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
}

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Buenos días";
  if (hour < 20) return "Buenas tardes";
  return "Buenas noches";
}

function buildSpokenSummary(name: string | undefined, data: TodayResponse): string {
  const parts: string[] = [`${greeting()}${name ? `, ${name}` : ""}.`];
  parts.push(
    data.now
      ? `Lo próximo es "${data.now.title}" a las ${formatTime(data.now.startAt)}.`
      : "No tenés nada agendado próximamente."
  );
  if (data.priorities.length > 0) {
    parts.push(`Tus prioridades: ${data.priorities.map((t) => t.title).join(", ")}.`);
  }
  if (data.attention.length > 0) {
    parts.push(`Atención: ${data.attention.join(". ")}.`);
  }
  if (data.insight) parts.push(data.insight);
  return parts.join(" ");
}

const { height: SCREEN_HEIGHT } = Dimensions.get("window");

/**
 * The hero screen (spec feedback: "tiene que sentirse como un secretario
 * conectado a mi celular, no como una app móvil") — NEXUS talks the moment
 * this loads, with no tap required, and what it said IS the screen, not a
 * caption under a card dashboard. The underlying NOW/PRIORIDADES/TIMELINE/
 * ATTENTION/INSIGHT data still exists below for anyone who wants to read
 * instead of listen, but it's reachable by scrolling down, not the first
 * thing the eye lands on. Tapping the Face replays the summary — the Face
 * is the one interactive element, same convention as the web app.
 */
export default function TodayScreen() {
  const { user, logout } = useAuth();
  const { speak, speaking } = useVoice();
  const [data, setData] = useState<TodayResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const spokenOnLoadRef = useRef(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await api.get<TodayResponse>("/today");
      setData(res);
    } catch {
      setError("No se pudo cargar Today.");
    }
  }, []);

  useEffect(() => {
    void load().finally(() => setLoading(false));
  }, [load]);

  useEffect(() => {
    if (data && !spokenOnLoadRef.current) {
      spokenOnLoadRef.current = true;
      void speak(buildSpokenSummary(user?.name.split(" ")[0], data));
    }
  }, [data, user, speak]);

  async function onRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  function replay() {
    if (data) void speak(buildSpokenSummary(user?.name.split(" ")[0], data));
  }

  const faceState: FaceState = speaking
    ? "speaking"
    : data && data.attention.length > 0
      ? "action-required"
      : "idle";

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} tintColor={colors.cyan} />}
    >
      <View style={[styles.hero, { minHeight: SCREEN_HEIGHT * 0.6 }]}>
        <Pressable onPress={replay} hitSlop={24}>
          <NexusFace state={faceState} size={148} />
        </Pressable>

        {loading && <ActivityIndicator color={colors.cyan} style={{ marginTop: 24 }} />}
        {error && <Text style={styles.error}>{error}</Text>}

        {data && (
          <Text style={styles.spokenText}>{buildSpokenSummary(user?.name.split(" ")[0], data)}</Text>
        )}

        {!speaking && data && (
          <Pressable onPress={replay} style={styles.replayHint}>
            <Text style={styles.replayHintText}>Tocá el Face para escuchar de nuevo</Text>
          </Pressable>
        )}
      </View>

      {data && (
        <View style={styles.details}>
          <Text style={styles.detailsLabel}>DETALLE</Text>

          <View style={styles.detailRow}>
            <Text style={styles.detailKey}>Timeline</Text>
            {data.timeline.length === 0 ? (
              <Text style={styles.muted}>Sin eventos para hoy.</Text>
            ) : (
              data.timeline.map((event) => (
                <Text key={event.id} style={styles.detailValue}>
                  {formatTime(event.startAt)}  {event.title}
                </Text>
              ))
            )}
          </View>

          <View style={styles.detailRow}>
            <Text style={styles.detailKey}>Prioridades</Text>
            {data.priorities.length === 0 ? (
              <Text style={styles.muted}>Sin prioridades pendientes.</Text>
            ) : (
              data.priorities.map((task) => (
                <Text key={task.id} style={styles.detailValue}>
                  • {task.title}
                </Text>
              ))
            )}
          </View>
        </View>
      )}

      <Pressable onPress={() => void logout()} style={styles.logout}>
        <Text style={styles.logoutText}>Cerrar sesión</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  content: {
    paddingBottom: 48,
  },
  hero: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
    gap: 20,
  },
  spokenText: {
    color: colors.text,
    fontSize: 19,
    lineHeight: 27,
    textAlign: "center",
  },
  replayHint: {
    marginTop: -4,
  },
  replayHintText: {
    color: colors.muted,
    fontSize: 12,
  },
  error: {
    color: colors.danger,
    textAlign: "center",
  },
  details: {
    paddingHorizontal: 24,
    gap: 20,
  },
  detailsLabel: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 1.5,
    textAlign: "center",
    marginBottom: 4,
  },
  detailRow: {
    gap: 4,
  },
  detailKey: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 1,
    marginBottom: 2,
  },
  detailValue: {
    color: colors.text,
    fontSize: 14,
  },
  muted: {
    color: colors.muted,
    fontSize: 14,
  },
  logout: {
    alignItems: "center",
    marginTop: 32,
  },
  logoutText: {
    color: colors.muted,
    fontSize: 12,
  },
});
