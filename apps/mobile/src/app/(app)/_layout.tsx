import Ionicons from "@expo/vector-icons/Ionicons";
import { Redirect, router } from "expo-router";
import { Tabs } from "expo-router/js-tabs";
import { useEffect, type ComponentProps } from "react";
import { ActivityIndicator, View, type ColorValue } from "react-native";
import { GlobalMicProvider } from "../../components/GlobalMic";
import { LockGate } from "../../components/LockGate";
import { useAuth } from "../../lib/auth-context";
import { onNotificationOpen } from "../../lib/notifications";
import { colors } from "../../lib/theme";

type IconName = ComponentProps<typeof Ionicons>["name"];
const icon = (name: IconName) =>
  function TabIcon({ color, size }: { color: ColorValue; size: number }) {
    return <Ionicons name={name} color={color} size={size} />;
  };

const OPENABLE = new Set(["/home", "/day", "/agenda", "/patients", "/assistant", "/brain"]);

/**
 * Pestañas de la secretaria: Inicio (consola de voz), Pacientes, Dictar,
 * Mi día y Agenda. Todo queda detrás del bloqueo biométrico una sola vez
 * (no en cada pestaña). Today, Ajustes y «Lo que aprendí» existen como
 * rutas sin pestaña. El micrófono grande global flota sobre la barra de
 * pestañas en todas las pantallas.
 */
export default function AppLayout() {
  const { user, loading } = useAuth();

  useEffect(() => {
    if (!user) return;
    return onNotificationOpen((url) => {
      if (OPENABLE.has(url)) router.navigate(url as "/home");
    });
  }, [user]);

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg }}>
        <ActivityIndicator color={colors.cyan} />
      </View>
    );
  }

  if (!user) return <Redirect href="/login" />;

  return (
    <LockGate>
      <GlobalMicProvider>
      <Tabs
        initialRouteName="home"
        backBehavior="history"
        screenOptions={{
          headerShown: false,
          sceneStyle: { backgroundColor: colors.bg },
          tabBarStyle: { backgroundColor: colors.panel, borderTopColor: colors.border },
          tabBarActiveTintColor: colors.cyan,
          tabBarInactiveTintColor: colors.muted,
        }}
      >
        <Tabs.Screen name="home" options={{ title: "Inicio", tabBarIcon: icon("mic-circle-outline") }} />
        <Tabs.Screen name="patients" options={{ title: "Pacientes", tabBarIcon: icon("people-outline") }} />
        <Tabs.Screen name="assistant" options={{ title: "Dictar", tabBarIcon: icon("create-outline") }} />
        <Tabs.Screen name="day" options={{ title: "Mi día", tabBarIcon: icon("today-outline") }} />
        <Tabs.Screen name="agenda" options={{ title: "Agenda", tabBarIcon: icon("calendar-outline") }} />
        <Tabs.Screen name="today" options={{ href: null }} />
        <Tabs.Screen name="settings" options={{ href: null }} />
        <Tabs.Screen name="brain" options={{ href: null }} />
      </Tabs>
      </GlobalMicProvider>
    </LockGate>
  );
}
