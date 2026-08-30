import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BookingCard } from '@/components/common/BookingCard';
import { COLORS, SPACING } from '@/constants/theme';
import { api, getApiError } from '@/services/api';
import type { Booking } from '@/types';

export default function BookingsScreen() {
  const [items, setItems] = useState<Booking[]>([]); const [loading, setLoading] = useState(true); const [refreshing, setRefreshing] = useState(false); const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => { try { setError(null); setItems((await api.bookings()).bookings); } catch (e) { setError(getApiError(e)); } finally { setLoading(false); setRefreshing(false); } }, []);
  useEffect(() => { void load(); }, [load]);
  return <SafeAreaView style={styles.safe} edges={['top']}><View style={styles.header}><Text style={styles.title}>Mis reservas</Text><Text style={styles.subtitle}>Tu agenda profesional completa</Text></View>{loading ? <View style={styles.center}><ActivityIndicator size="large" color={COLORS.primary} /></View> : <FlatList data={items} keyExtractor={(item) => item.id} renderItem={({ item }) => <BookingCard booking={item} />} contentContainerStyle={styles.list} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(); }} />} ListHeaderComponent={error ? <Text style={styles.error}>{error}</Text> : null} ListEmptyComponent={<Text style={styles.empty}>Todavía no tienes reservas.</Text>} />}</SafeAreaView>;
}
const styles = StyleSheet.create({ safe: { flex: 1, backgroundColor: COLORS.background }, header: { paddingHorizontal: SPACING.lg, paddingTop: SPACING.md }, title: { color: COLORS.text, fontSize: 27, fontWeight: '800' }, subtitle: { color: COLORS.muted, marginTop: 4 }, center: { flex: 1, alignItems: 'center', justifyContent: 'center' }, list: { padding: SPACING.lg, flexGrow: 1 }, error: { color: COLORS.danger, marginBottom: SPACING.md }, empty: { color: COLORS.muted, textAlign: 'center', marginTop: SPACING.xxl } });

