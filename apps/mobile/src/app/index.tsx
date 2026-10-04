import { Redirect } from "expo-router";
import { ActivityIndicator, View } from "react-native";
import { useAuth } from "../lib/auth-context";
import { colors } from "../lib/theme";

export default function Index() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg }}>
        <ActivityIndicator color={colors.cyan} />
      </View>
    );
  }

  // Con sesión, Nexus abre en Inicio: la secretaria que ya te está escuchando.
  return <Redirect href={user ? "/home" : "/login"} />;
}
