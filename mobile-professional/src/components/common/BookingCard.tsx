import { Ionicons } from '@expo/vector-icons';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { COLORS, RADIUS, SHADOWS, SPACING } from '@/constants/theme';
import type { Booking, BookingStatus } from '@/types';

const statusMeta: Record<BookingStatus, { label: string; color: string; background: string }> = {
  PENDING: { label: 'Pendiente', color: COLORS.warning, background: COLORS.warningSoft },
  CONFIRMED: { label: 'Confirmada', color: COLORS.primary, background: COLORS.primarySoft },
  IN_PROGRESS: { label: 'En curso', color: COLORS.primaryDark, background: COLORS.primarySoft },
  COMPLETED: { label: 'Completada', color: COLORS.success, background: COLORS.successSoft },
  CANCELLED: { label: 'Cancelada', color: COLORS.danger, background: COLORS.dangerSoft },
};

export function BookingCard({ booking, actionLabel, secondaryActionLabel, actionBusy = false, onAction, onSecondaryAction }: {
  booking: Booking;
  actionLabel?: string;
  secondaryActionLabel?: string;
  actionBusy?: boolean;
  onAction?: () => void;
  onSecondaryAction?: () => void;
}) {
  const meta = statusMeta[booking.status];
  const clientName = `${booking.client.user.firstName} ${booking.client.user.lastName}`.trim();
  const service = booking.bookingServices[0]?.service.name || 'Servicio profesional';
  const date = new Date(booking.scheduledDate);
  return (
    <View style={styles.card} accessible accessibilityLabel={`${service}, ${clientName}, ${meta.label}`}>
      <View style={[styles.statusRail, { backgroundColor: meta.color }]} />
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
        <View style={styles.dateIcon}><Ionicons name="calendar-outline" size={17} color={COLORS.muted} /></View>
        <View style={styles.dateCopy}><Text style={styles.detailLabel}>Fecha y hora</Text><Text style={styles.detail}>{date.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })} · {date.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}</Text></View>
        <View style={styles.amountCopy}><Text style={styles.detailLabel}>Neto</Text><Text style={styles.amount}>€{Number(booking.professionalEarnings || booking.totalPrice).toFixed(2)}</Text></View>
      </View>
      {actionLabel && onAction ? (
        <View style={styles.actions}>
          {secondaryActionLabel && onSecondaryAction ? (
            <Pressable
              style={({ pressed }) => [styles.secondaryAction, pressed && styles.actionPressed, actionBusy && styles.actionDisabled]}
              onPress={onSecondaryAction}
              disabled={actionBusy}
              accessibilityRole="button"
              accessibilityState={{ disabled: actionBusy, busy: actionBusy }}
              accessibilityLabel={`${secondaryActionLabel}: ${service}`}
            >
              <Text style={styles.secondaryActionText}>{secondaryActionLabel}</Text>
            </Pressable>
          ) : null}
          <Pressable
            style={({ pressed }) => [styles.action, pressed && styles.actionPressed, actionBusy && styles.actionDisabled]}
            onPress={onAction}
            disabled={actionBusy}
            accessibilityRole="button"
            accessibilityState={{ disabled: actionBusy, busy: actionBusy }}
            accessibilityLabel={`${actionLabel}: ${service}`}
          >
            {actionBusy ? <ActivityIndicator color={COLORS.white} /> : <Text style={styles.actionText}>{actionLabel}</Text>}
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { overflow: 'hidden', backgroundColor: COLORS.surface, borderRadius: RADIUS.xl, padding: SPACING.lg, borderWidth: 1, borderColor: COLORS.border, marginBottom: SPACING.md, ...SHADOWS.sm },
  statusRail: { position: 'absolute', left: 0, top: 18, bottom: 18, width: 3, borderTopRightRadius: 3, borderBottomRightRadius: 3 },
  topRow: { flexDirection: 'row', alignItems: 'center' }, serviceIcon: { width: 44, height: 44, borderRadius: RADIUS.md, backgroundColor: COLORS.primarySoft, alignItems: 'center', justifyContent: 'center', marginRight: SPACING.md },
  copy: { flex: 1, minWidth: 0 }, service: { color: COLORS.text, fontWeight: '800', fontSize: 16 }, client: { color: COLORS.muted, fontSize: 13, marginTop: 3 },
  badge: { borderRadius: RADIUS.full, paddingHorizontal: 9, paddingVertical: 5, marginLeft: SPACING.sm }, badgeText: { fontSize: 11, fontWeight: '700' },
  divider: { height: 1, backgroundColor: COLORS.border, marginVertical: SPACING.md }, detailRow: { flexDirection: 'row', alignItems: 'center' }, dateIcon: { width: 34, height: 34, borderRadius: RADIUS.sm, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.surfaceMuted }, dateCopy: { flex: 1, minWidth: 0, marginLeft: SPACING.sm }, detailLabel: { color: COLORS.subtle, fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.4 }, detail: { color: COLORS.muted, fontSize: 13, marginTop: 2 }, amountCopy: { alignItems: 'flex-end', marginLeft: SPACING.sm }, amount: { color: COLORS.primary, fontSize: 16, fontWeight: '800', marginTop: 2 },
  actions: { flexDirection: 'row', gap: SPACING.sm, marginTop: SPACING.md },
  action: { minHeight: 46, flex: 1, borderRadius: RADIUS.md, backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center' },
  secondaryAction: { minHeight: 46, flex: 1, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.danger, alignItems: 'center', justifyContent: 'center' },
  actionPressed: { opacity: 0.85 }, actionDisabled: { opacity: 0.6 }, actionText: { color: COLORS.white, fontWeight: '800', fontSize: 14 }, secondaryActionText: { color: COLORS.danger, fontWeight: '800', fontSize: 14 },
});
