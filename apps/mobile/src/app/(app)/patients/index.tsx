import type { Patient } from "@nexus/shared";
import Ionicons from "@expo/vector-icons/Ionicons";
import { router } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from "react-native";
import { api } from "../../../lib/api";
import { colors } from "../../../lib/theme";

interface PatientsPage {
  patients: Patient[];
  total: number;
  page: number;
}

/** Pacientes: búsqueda por nombre o DNI (el servidor busca por tokens cifrados), de a 30. */
export default function PatientsScreen() {
  const [query, setQuery] = useState("");
  const [patients, setPatients] = useState<Patient[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);

  const load = useCallback(async (q: string, nextPage: number) => {
    const id = ++requestId.current;
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<PatientsPage>(`/clinical/patients?q=${encodeURIComponent(q.trim())}&page=${nextPage}`);
      if (id !== requestId.current) return;
      setPatients((prev) => (nextPage === 1 ? res.patients : [...prev, ...res.patients]));
      setTotal(res.total);
      setPage(nextPage);
    } catch (err) {
      if (id === requestId.current) setError(err instanceof Error ? err.message : "No se pudieron cargar los pacientes.");
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => void load(query, 1), query ? 300 : 0);
    return () => clearTimeout(t);
  }, [query, load]);

  const hasMore = patients.length < total;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Pacientes</Text>
        <Pressable onPress={() => router.push("/patients/new")} style={styles.newButton} accessibilityLabel="Nuevo paciente">
          <Ionicons name="person-add-outline" size={18} color={colors.bg} />
          <Text style={styles.newText}>Nuevo</Text>
        </Pressable>
      </View>
      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder="Buscar por nombre o DNI"
        placeholderTextColor={colors.muted}
        autoCorrect={false}
        style={styles.search}
        clearButtonMode="while-editing"
      />
      {error && <Text style={styles.danger}>{error}</Text>}
      <FlatList
        data={patients}
        keyExtractor={(p) => p.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} tintColor={colors.cyan} onRefresh={() => { setRefreshing(true); void load(query, 1).finally(() => setRefreshing(false)); }} />}
        onEndReachedThreshold={0.4}
        onEndReached={() => {
          if (hasMore && !loading) void load(query, page + 1);
        }}
        renderItem={({ item }) => (
          <Pressable onPress={() => router.push({ pathname: "/patients/[id]", params: { id: item.id } })} style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{item.name}</Text>
              <Text style={styles.meta}>{[item.document && `DNI ${item.document}`, item.birthDate && `Nac. ${item.birthDate.split("-").reverse().join("/")}`].filter(Boolean).join(" · ") || "Sin documento"}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.muted} />
          </Pressable>
        )}
        ListEmptyComponent={loading ? null : <Text style={styles.muted}>{query ? "Sin resultados." : "Todavía no hay pacientes."}</Text>}
        ListFooterComponent={loading ? <ActivityIndicator color={colors.cyan} style={{ marginVertical: 16 }} /> : total > 0 ? <Text style={styles.footer}>{patients.length} de {total}</Text> : null}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, paddingTop: 60 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 20 },
  title: { color: colors.text, fontSize: 22, fontWeight: "600" },
  newButton: { flexDirection: "row", gap: 6, alignItems: "center", backgroundColor: colors.cyan, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8 },
  newText: { color: colors.bg, fontWeight: "700" },
  search: { color: colors.text, backgroundColor: colors.panel, borderRadius: 12, padding: 12, fontSize: 15, marginHorizontal: 20, marginTop: 14 },
  list: { padding: 20, gap: 8 },
  row: { flexDirection: "row", alignItems: "center", backgroundColor: colors.panel, borderRadius: 12, padding: 14, borderColor: colors.border, borderWidth: 1 },
  name: { color: colors.text, fontSize: 16, fontWeight: "600" },
  meta: { color: colors.muted, fontSize: 13, marginTop: 2 },
  muted: { color: colors.muted, textAlign: "center", marginTop: 20 },
  footer: { color: colors.muted, textAlign: "center", fontSize: 12, marginVertical: 12 },
  danger: { color: colors.danger, paddingHorizontal: 20, marginTop: 8 },
});
