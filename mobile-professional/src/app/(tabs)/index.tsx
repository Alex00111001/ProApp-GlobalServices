import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BookingCard } from '@/components/common/BookingCard';
import { COLORS, RADIUS, SPACING } from '@/constants/theme';
import { api, getApiError } from '@/services/api';
import { useAuthStore } from '@/store/authStore';
import type { Booking } from '@/types';

export default function HomeScreen() {
  const { user, profile } = useAuthStore();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    try { setError(null); setBookings((await api.bookings()).bookings); }
    catch (requestError) { setError(getApiError(requestError)); }
    finally { setLoading(false); setRefreshing(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  const upcoming = useMemo(() => bookings.filter((item) => ['PENDING', 'CONFIRMED', 'IN_PROGRESS'].includes(item.status) && new Date(item.scheduledDate) >= new Date()).slice(0, 3), [bookings]);
  const completedThisMonth = useMemo(() => bookings.filter((item) => item.status === 'COMPLETED' && new Date(item.scheduledDate).getMonth() === new Date().getMonth()), [bookings]);
  const monthEarnings = completedThisMonth.reduce((sum, item) => sum + Number(item.professionalEarnings || 0), 0);
  const pendingCount = bookings.filter((item) => item.status === 'PENDING').length;
  if (loading) return <View style={styles.center}><ActivityIndicator size="large" color={COLORS.primary} /></View>;
  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(); }} tintColor={COLORS.primary} />}>
        <View style={styles.header}><View><Text style={styles.eyebrow}>PANEL PROFESIONAL</Text><Text style={styles.greeting}>Hola, {user?.firstName || 'Profesional'}</Text><Text style={styles.date}>{new Date().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })}</Text></View><View style={styles.avatar}><Text style={styles.avatarText}>{user?.firstName?.[0]}{user?.lastName?.[0]}</Text></View></View>
        {profile?.status !== 'APPROVED' && <View style={styles.reviewBanner}><Ionicons name="time-outline" size={22} color={COLORS.warning} /><View style={styles.bannerCopy}><Text style={styles.bannerTitle}>Perfil en revisión</Text><Text style={styles.bannerText}>Podrás recibir nuevas solicitudes cuando tu cuenta sea aprobada.</Text></View></View>}
        {!!error && <View style={styles.errorBanner}><Ionicons name="cloud-offline-outline" size={21} color={COLORS.danger} /><Text style={styles.errorText}>{error}. Desliza hacia abajo para reintentar.</Text></View>}
        <Text style={styles.sectionTitle}>Resumen de este mes</Text>
        <View style={styles.metrics}>
          <View style={[styles.metric, styles.metricPrimary]}><View style={styles.metricIcon}><Ionicons name="wallet-outline" size={21} color={COLORS.primary} /></View><Text style={styles.metricValue}>€{monthEarnings.toFixed(2)}</Text><Text style={styles.metricLabel}>Ingresos netos</Text></View>
          <View style={styles.metric}><View style={[styles.metricIcon, styles.metricWarning]}><Ionicons name="notifications-outline" size={21} color={COLORS.warning} /></View><Text style={styles.metricValue}>{pendingCount}</Text><Text style={styles.metricLabel}>Por confirmar</Text></View>
          <View style={styles.metric}><View style={[styles.metricIcon, styles.metricSuccess]}><Ionicons name="checkmark-done-outline" size={21} color={COLORS.success} /></View><Text style={styles.metricValue}>{completedThisMonth.length}</Text><Text style={styles.metricLabel}>Completados</Text></View>
        </View>
        <View style={styles.sectionHeader}><Text style={styles.sectionTitle}>Próximos servicios</Text><Text style={styles.count}>{upcoming.length} próximos</Text></View>
        {upcoming.length ? upcoming.map((booking) => <BookingCard key={booking.id} booking={booking} />) : <View style={styles.empty}><View style={styles.emptyIcon}><Ionicons name="calendar-clear-outline" size={28} color={COLORS.primary} /></View><Text style={styles.emptyTitle}>Tu agenda está libre</Text><Text style={styles.emptyText}>Las reservas nuevas y confirmadas aparecerán aquí.</Text></View>}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.background }, center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.background }, content: { padding: SPACING.lg, paddingBottom: SPACING.xxl },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: SPACING.xl }, eyebrow: { color: COLORS.primary, fontSize: 11, fontWeight: '800', letterSpacing: 1.1 }, greeting: { color: COLORS.text, fontSize: 27, fontWeight: '800', marginTop: 4 }, date: { color: COLORS.muted, fontSize: 13, marginTop: 4, textTransform: 'capitalize' }, avatar: { width: 50, height: 50, borderRadius: RADIUS.full, backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center' }, avatarText: { color: COLORS.white, fontWeight: '800', fontSize: 17 },
  reviewBanner: { flexDirection: 'row', padding: SPACING.lg, borderRadius: RADIUS.md, backgroundColor: COLORS.warningSoft, marginBottom: SPACING.xl }, bannerCopy: { flex: 1, marginLeft: SPACING.md }, bannerTitle: { color: '#92400E', fontWeight: '800', fontSize: 14 }, bannerText: { color: '#A16207', fontSize: 12, lineHeight: 18, marginTop: 3 }, errorBanner: { flexDirection: 'row', padding: SPACING.md, borderRadius: RADIUS.md, backgroundColor: '#FEECEC', marginBottom: SPACING.lg }, errorText: { color: COLORS.danger, flex: 1, fontSize: 12, marginLeft: SPACING.sm },
  sectionTitle: { color: COLORS.text, fontSize: 18, fontWeight: '800', marginBottom: SPACING.md }, metrics: { flexDirection: 'row', gap: SPACING.sm, marginBottom: SPACING.xxl }, metric: { flex: 1, minWidth: 0, backgroundColor: COLORS.surface, borderRadius: RADIUS.md, padding: SPACING.md, borderWidth: 1, borderColor: COLORS.border }, metricPrimary: { borderColor: '#C7D7FE' }, metricIcon: { width: 36, height: 36, borderRadius: RADIUS.sm, backgroundColor: COLORS.primarySoft, alignItems: 'center', justifyContent: 'center', marginBottom: SPACING.md }, metricWarning: { backgroundColor: COLORS.warningSoft }, metricSuccess: { backgroundColor: COLORS.successSoft }, metricValue: { color: COLORS.text, fontSize: 18, fontWeight: '800' }, metricLabel: { color: COLORS.muted, fontSize: 11, marginTop: 3 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, count: { color: COLORS.primary, fontSize: 12, fontWeight: '700', marginBottom: SPACING.md }, empty: { backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.lg, padding: SPACING.xl, alignItems: 'center' }, emptyIcon: { width: 54, height: 54, borderRadius: RADIUS.full, backgroundColor: COLORS.primarySoft, alignItems: 'center', justifyContent: 'center' }, emptyTitle: { color: COLORS.text, fontWeight: '800', fontSize: 16, marginTop: SPACING.md }, emptyText: { color: COLORS.muted, fontSize: 13, textAlign: 'center', marginTop: 5 },
});

