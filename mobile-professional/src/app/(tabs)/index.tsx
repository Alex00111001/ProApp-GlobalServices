import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BookingCard } from '@/components/common/BookingCard';
import { COLORS, LAYOUT, RADIUS, SHADOWS, SPACING } from '@/constants/theme';
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
        <View style={styles.header}><View style={styles.headerCopy}><View style={styles.brandRow}><View style={styles.brandMark}><Ionicons name="briefcase" size={15} color={COLORS.white} /></View><Text style={styles.eyebrow}>PANEL PROFESIONAL</Text></View><Text style={styles.greeting}>Hola, {user?.firstName || 'Profesional'}</Text><Text style={styles.date}>{new Date().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })}</Text></View><View style={styles.avatar}><Text style={styles.avatarText}>{user?.firstName?.[0]}{user?.lastName?.[0]}</Text><View style={styles.onlineDot} /></View></View>
        {profile?.status !== 'APPROVED' && <View style={styles.reviewBanner}><Ionicons name="time-outline" size={22} color={COLORS.warning} /><View style={styles.bannerCopy}><Text style={styles.bannerTitle}>Perfil en revisión</Text><Text style={styles.bannerText}>Podrás recibir nuevas solicitudes cuando tu cuenta sea aprobada.</Text></View></View>}
        {!!error && <View style={styles.errorBanner}><Ionicons name="cloud-offline-outline" size={21} color={COLORS.danger} /><Text style={styles.errorText}>{error}. Desliza hacia abajo para reintentar.</Text></View>}
        <Text style={styles.sectionEyebrow}>TU ACTIVIDAD</Text>
        <Text style={styles.sectionTitle}>Resumen de este mes</Text>
        <View style={styles.earningsCard}>
          <View style={styles.earningsGlow} />
          <View style={styles.earningsTop}><View style={styles.walletIcon}><Ionicons name="wallet" size={22} color={COLORS.white} /></View><View style={styles.securePill}><Ionicons name="shield-checkmark" size={14} color={COLORS.successSoft} /><Text style={styles.secureText}>Proyección segura</Text></View></View>
          <Text style={styles.earningsLabel}>Ingresos netos estimados</Text>
          <Text style={styles.earningsValue}>€{monthEarnings.toFixed(2)}</Text>
          <Text style={styles.earningsHint}>Calculados a partir de servicios completados</Text>
        </View>
        <View style={styles.metrics}>
          <View style={styles.metric}><View style={[styles.metricIcon, styles.metricWarning]}><Ionicons name="notifications-outline" size={20} color={COLORS.warning} /></View><View><Text style={styles.metricValue}>{pendingCount}</Text><Text style={styles.metricLabel}>Por confirmar</Text></View></View>
          <View style={styles.metric}><View style={[styles.metricIcon, styles.metricSuccess]}><Ionicons name="checkmark-done-outline" size={20} color={COLORS.success} /></View><View><Text style={styles.metricValue}>{completedThisMonth.length}</Text><Text style={styles.metricLabel}>Completados</Text></View></View>
        </View>
        <View style={styles.sectionHeader}><View><Text style={styles.sectionEyebrow}>TU AGENDA</Text><Text style={styles.sectionTitle}>Próximos servicios</Text></View><View style={styles.countPill}><Text style={styles.count}>{upcoming.length} próximos</Text></View></View>
        {upcoming.length ? upcoming.map((booking) => <BookingCard key={booking.id} booking={booking} />) : <View style={styles.empty}><View style={styles.emptyIcon}><Ionicons name="calendar-clear-outline" size={28} color={COLORS.primary} /></View><Text style={styles.emptyTitle}>Tu agenda está libre</Text><Text style={styles.emptyText}>Las reservas nuevas y confirmadas aparecerán aquí.</Text></View>}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.background }, center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.background }, content: { width: '100%', maxWidth: LAYOUT.contentMaxWidth, alignSelf: 'center', padding: LAYOUT.screenPadding, paddingBottom: SPACING.xxxl },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: SPACING.xl }, headerCopy: { flex: 1, minWidth: 0 }, brandRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm }, brandMark: { width: 28, height: 28, borderRadius: 9, backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center' }, eyebrow: { color: COLORS.primary, fontSize: 11, fontWeight: '800', letterSpacing: 1.1 }, greeting: { color: COLORS.text, fontSize: 29, lineHeight: 35, fontWeight: '800', marginTop: SPACING.sm }, date: { color: COLORS.muted, fontSize: 13, marginTop: 4, textTransform: 'capitalize' }, avatar: { width: 52, height: 52, borderRadius: RADIUS.full, backgroundColor: COLORS.ink, alignItems: 'center', justifyContent: 'center', marginLeft: SPACING.md }, avatarText: { color: COLORS.white, fontWeight: '800', fontSize: 17 }, onlineDot: { position: 'absolute', right: 0, bottom: 1, width: 13, height: 13, borderRadius: 7, backgroundColor: COLORS.success, borderWidth: 3, borderColor: COLORS.background },
  reviewBanner: { flexDirection: 'row', padding: SPACING.lg, borderRadius: RADIUS.lg, backgroundColor: COLORS.warningSoft, marginBottom: SPACING.xl, borderWidth: 1, borderColor: '#F2D7A3' }, bannerCopy: { flex: 1, marginLeft: SPACING.md }, bannerTitle: { color: '#7A4108', fontWeight: '800', fontSize: 14 }, bannerText: { color: '#84520D', fontSize: 12, lineHeight: 18, marginTop: 3 }, errorBanner: { flexDirection: 'row', padding: SPACING.md, borderRadius: RADIUS.md, backgroundColor: COLORS.dangerSoft, marginBottom: SPACING.lg }, errorText: { color: COLORS.danger, flex: 1, fontSize: 12, marginLeft: SPACING.sm },
  sectionEyebrow: { color: COLORS.success, fontSize: 11, fontWeight: '800', letterSpacing: 1, marginBottom: 3 }, sectionTitle: { color: COLORS.text, fontSize: 20, fontWeight: '800', marginBottom: SPACING.md },
  earningsCard: { overflow: 'hidden', backgroundColor: COLORS.ink, borderRadius: RADIUS.xl, padding: SPACING.xl, marginBottom: SPACING.md, ...SHADOWS.md }, earningsGlow: { position: 'absolute', width: 180, height: 180, borderRadius: 90, right: -70, top: -95, backgroundColor: 'rgba(92,133,234,0.22)' }, earningsTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, walletIcon: { width: 42, height: 42, borderRadius: 14, backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center' }, securePill: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 6, borderRadius: RADIUS.full, backgroundColor: 'rgba(255,255,255,0.10)' }, secureText: { color: COLORS.successSoft, fontSize: 11, fontWeight: '700' }, earningsLabel: { color: '#CFE0E8', fontSize: 12, marginTop: SPACING.xl }, earningsValue: { color: COLORS.white, fontSize: 34, fontWeight: '800', marginTop: 2 }, earningsHint: { color: '#AAC0CA', fontSize: 11, marginTop: SPACING.xs },
  metrics: { flexDirection: 'row', gap: SPACING.md, marginBottom: SPACING.xxxl }, metric: { flex: 1, minWidth: 0, minHeight: 84, flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, padding: SPACING.md, borderWidth: 1, borderColor: COLORS.border, ...SHADOWS.sm }, metricIcon: { width: 38, height: 38, borderRadius: RADIUS.md, alignItems: 'center', justifyContent: 'center', marginRight: SPACING.sm }, metricWarning: { backgroundColor: COLORS.warningSoft }, metricSuccess: { backgroundColor: COLORS.successSoft }, metricValue: { color: COLORS.text, fontSize: 19, fontWeight: '800' }, metricLabel: { color: COLORS.muted, fontSize: 11, marginTop: 2 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, countPill: { paddingHorizontal: SPACING.md, paddingVertical: 7, borderRadius: RADIUS.full, backgroundColor: COLORS.primarySoft, marginBottom: SPACING.md }, count: { color: COLORS.primary, fontSize: 12, fontWeight: '700' }, empty: { backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.xl, padding: SPACING.xl, alignItems: 'center', ...SHADOWS.sm }, emptyIcon: { width: 56, height: 56, borderRadius: 18, backgroundColor: COLORS.primarySoft, alignItems: 'center', justifyContent: 'center' }, emptyTitle: { color: COLORS.text, fontWeight: '800', fontSize: 16, marginTop: SPACING.md }, emptyText: { color: COLORS.muted, fontSize: 13, textAlign: 'center', lineHeight: 19, marginTop: 5 },
});

