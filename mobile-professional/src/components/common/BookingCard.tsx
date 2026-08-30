import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';
import { COLORS, RADIUS, SPACING } from '@/constants/theme';
import type { Booking, BookingStatus } from '@/types';

const statusMeta: Record<BookingStatus, { label: string; color: string; background: string }> = {
  PENDING: { label: 'Pendiente', color: COLORS.warning, background: COLORS.warningSoft },
  CONFIRMED: { label: 'Confirmada', color: COLORS.primary, background: COLORS.primarySoft },
  IN_PROGRESS: { label: 'En curso', color: COLORS.primaryDark, background: COLORS.primarySoft },
  COMPLETED: { label: 'Completada', color: COLORS.success, background: COLORS.successSoft },
  CANCELLED: { label: 'Cancelada', color: COLORS.danger, background: '#FEECEC' },
};

export function BookingCard({ booking }: { booking: Booking }) {
  const meta = statusMeta[booking.status];
  const clientName = `${booking.client.user.firstName} ${booking.client.user.lastName}`.trim();
  const service = booking.bookingServices[0]?.service.name || 'Servicio profesional';
  const date = new Date(booking.scheduledDate);
  return (
    <View style={styles.card}>
      <View style={styles.topRow}>
        <View style={styles.serviceIcon}><Ionicons name="construct-outline" size={20} color={COLORS.primary} /></View>
        <View style={styles.copy}>
          <Text style={styles.service} numberOfLines={1}>{service}</Text>
          <Text style={styles.client}>{clientName}</Text>
        </View>
        <View style={[styles.badge, { backgroundColor: meta.background }]}><Text style={[styles.badgeText, { color: meta.color }]}>{meta.label}</Text></View>
      </View>
      <View style={styles.divider} />
      <View style={styles.detailRow}>
        <Ionicons name="calendar-outline" size={17} color={COLORS.muted} />
        <Text style={styles.detail}>{date.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })} · {date.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}</Text>
        <Text style={styles.amount}>€{Number(booking.professionalEarnings || booking.totalPrice).toFixed(2)}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, padding: SPACING.lg, borderWidth: 1, borderColor: COLORS.border, marginBottom: SPACING.md },
  topRow: { flexDirection: 'row', alignItems: 'center' }, serviceIcon: { width: 42, height: 42, borderRadius: RADIUS.md, backgroundColor: COLORS.primarySoft, alignItems: 'center', justifyContent: 'center', marginRight: SPACING.md },
  copy: { flex: 1, minWidth: 0 }, service: { color: COLORS.text, fontWeight: '700', fontSize: 16 }, client: { color: COLORS.muted, fontSize: 13, marginTop: 3 },
  badge: { borderRadius: RADIUS.full, paddingHorizontal: 9, paddingVertical: 5, marginLeft: SPACING.sm }, badgeText: { fontSize: 11, fontWeight: '700' },
  divider: { height: 1, backgroundColor: COLORS.border, marginVertical: SPACING.md }, detailRow: { flexDirection: 'row', alignItems: 'center' }, detail: { color: COLORS.muted, fontSize: 13, marginLeft: SPACING.sm, flex: 1 }, amount: { color: COLORS.text, fontSize: 15, fontWeight: '700' },
});
