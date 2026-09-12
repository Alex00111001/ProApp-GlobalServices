import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BookingCard } from '@/components/common/BookingCard';
import { COLORS, LAYOUT, RADIUS, SPACING } from '@/constants/theme';
import { api, getApiError } from '@/services/api';
import type { Booking, BookingStatus } from '@/types';

type Filter = 'ALL' | BookingStatus;

const filters: Array<{ key: Filter; label: string }> = [
  { key: 'ALL', label: 'Todas' },
  { key: 'PENDING', label: 'Pendientes' },
  { key: 'CONFIRMED', label: 'Confirmadas' },
  { key: 'IN_PROGRESS', label: 'En curso' },
  { key: 'COMPLETED', label: 'Completadas' },
];

const actionFor = (status: BookingStatus) => ({
  PENDING: { label: 'Confirmar solicitud', run: api.confirmBooking, secondary: { label: 'Rechazar', run: api.rejectBooking } },
  CONFIRMED: { label: 'Iniciar servicio', run: api.startBooking },
  IN_PROGRESS: { label: 'Completar servicio', run: api.completeBooking },
} as const)[status as 'PENDING' | 'CONFIRMED' | 'IN_PROGRESS'];

export default function BookingsScreen() {
  const [items, setItems] = useState<Booking[]>([]);
  const [filter, setFilter] = useState<Filter>('ALL');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [processingId, setProcessingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      setItems((await api.bookings()).bookings);
    } catch (requestError) {
      setError(getApiError(requestError));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const visibleItems = useMemo(
    () => filter === 'ALL' ? items : items.filter((item) => item.status === filter),
    [filter, items],
  );

  const transition = useCallback(async (booking: Booking, secondary = false) => {
    const available = actionFor(booking.status);
    if (!available) return;
    const action = secondary ? ('secondary' in available ? available.secondary : null) : available;
    if (!action) return;
    try {
      setError(null);
      setProcessingId(booking.id);
      await action.run(booking.id);
      await load();
    } catch (requestError) {
      setError(getApiError(requestError));
    } finally {
      setProcessingId(null);
    }
  }, [load]);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.eyebrow}>AGENDA PROFESIONAL</Text>
        <Text style={styles.title}>Mis reservas</Text>
        <Text style={styles.subtitle}>Prioriza solicitudes y consulta tu trabajo con claridad.</Text>
      </View>

      <View style={styles.filterWrap}>
        <FlatList
          horizontal
          data={filters}
          keyExtractor={(item) => item.key}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filters}
          renderItem={({ item }) => {
            const active = filter === item.key;
            const count = item.key === 'ALL' ? items.length : items.filter((booking) => booking.status === item.key).length;
            return (
              <Pressable
                style={[styles.filter, active && styles.filterActive]}
                onPress={() => setFilter(item.key)}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
              >
                <Text style={[styles.filterText, active && styles.filterTextActive]}>{item.label}</Text>
                <View style={[styles.filterCount, active && styles.filterCountActive]}><Text style={[styles.filterCountText, active && styles.filterCountTextActive]}>{count}</Text></View>
              </Pressable>
            );
          }}
        />
      </View>

      {loading ? (
        <View style={styles.center} accessibilityRole="progressbar"><ActivityIndicator size="large" color={COLORS.primary} /><Text style={styles.loadingText}>Cargando agenda…</Text></View>
      ) : (
        <FlatList
          data={visibleItems}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => {
            const action = actionFor(item.status);
            const secondary = action && 'secondary' in action ? action.secondary : undefined;
            return <BookingCard booking={item} actionLabel={action?.label} secondaryActionLabel={secondary?.label} actionBusy={processingId === item.id} onAction={action ? () => { void transition(item); } : undefined} onSecondaryAction={secondary ? () => { void transition(item, true); } : undefined} />;
          }}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(); }} tintColor={COLORS.primary} />}
          ListHeaderComponent={error ? <View style={styles.error}><Ionicons name="cloud-offline-outline" size={18} color={COLORS.danger} /><Text style={styles.errorText}>{error}</Text></View> : null}
          ListEmptyComponent={<View style={styles.empty}><View style={styles.emptyIcon}><Ionicons name="calendar-clear-outline" size={28} color={COLORS.primary} /></View><Text style={styles.emptyTitle}>No hay reservas en este estado</Text><Text style={styles.emptyText}>Cambia el filtro o desliza hacia abajo para actualizar.</Text></View>}
          showsVerticalScrollIndicator={false}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.background },
  header: { width: '100%', maxWidth: LAYOUT.contentMaxWidth, alignSelf: 'center', paddingHorizontal: LAYOUT.screenPadding, paddingTop: SPACING.lg },
  eyebrow: { color: COLORS.success, fontSize: 11, fontWeight: '800', letterSpacing: 1 },
  title: { color: COLORS.text, fontSize: 29, lineHeight: 35, fontWeight: '800', marginTop: SPACING.xs },
  subtitle: { color: COLORS.muted, marginTop: SPACING.xs, lineHeight: 20 },
  filterWrap: { marginTop: SPACING.xl },
  filters: { paddingHorizontal: LAYOUT.screenPadding, gap: SPACING.sm },
  filter: { minHeight: LAYOUT.touchTarget, flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, paddingHorizontal: SPACING.md, borderRadius: RADIUS.full, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border },
  filterActive: { backgroundColor: COLORS.ink, borderColor: COLORS.ink },
  filterText: { color: COLORS.muted, fontWeight: '700', fontSize: 13 },
  filterTextActive: { color: COLORS.white },
  filterCount: { minWidth: 22, height: 22, paddingHorizontal: 5, alignItems: 'center', justifyContent: 'center', borderRadius: RADIUS.full, backgroundColor: COLORS.surfaceMuted },
  filterCountActive: { backgroundColor: 'rgba(255,255,255,0.14)' },
  filterCountText: { color: COLORS.muted, fontSize: 11, fontWeight: '800' },
  filterCountTextActive: { color: COLORS.white },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loadingText: { color: COLORS.muted, marginTop: SPACING.md },
  list: { width: '100%', maxWidth: LAYOUT.contentMaxWidth, alignSelf: 'center', padding: LAYOUT.screenPadding, flexGrow: 1, paddingBottom: SPACING.xxxl },
  error: { flexDirection: 'row', alignItems: 'center', padding: SPACING.md, backgroundColor: COLORS.dangerSoft, borderRadius: RADIUS.md, marginBottom: SPACING.md, gap: SPACING.sm },
  errorText: { flex: 1, color: COLORS.danger, fontSize: 13 },
  empty: { marginTop: SPACING.xl, alignItems: 'center', padding: SPACING.xl, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.xl, backgroundColor: COLORS.surface },
  emptyIcon: { width: 58, height: 58, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.primarySoft },
  emptyTitle: { color: COLORS.text, fontSize: 16, fontWeight: '800', marginTop: SPACING.md, textAlign: 'center' },
  emptyText: { color: COLORS.muted, fontSize: 13, lineHeight: 19, marginTop: SPACING.xs, textAlign: 'center' },
});
