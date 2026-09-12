import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { BORDER_RADIUS, COLORS, FONTS, LAYOUT, SHADOWS, SPACING } from '@/constants/theme';
import { useAppStore } from '@/store/appStore';
import type { Booking } from '@/types';
import { useTranslation } from 'react-i18next';

// Componente temporal para mostrar reservas (puede ser reemplazado por un componente dedicado)
const BookingItem: React.FC<{ booking: Booking; onPress: () => void }> = ({ booking, onPress }) => {
  const { t, i18n } = useTranslation();
  const bookingData = booking as any;
  const scheduledDate = new Date(bookingData.scheduledDate);
  const serviceName = bookingData.bookingServices
    ?.map((item: any) => item.service?.name)
    .filter(Boolean)
    .join(', ') || t('common.services');
  const professionalName = [
    bookingData.professional?.user?.firstName,
    bookingData.professional?.user?.lastName,
  ].filter(Boolean).join(' ') || t('common.professional');
  const statusKey = booking.status.toLowerCase() as 'confirmed'|'pending'|'completed'|'cancelled';
  const statusStyle = {
    CONFIRMED: styles.statusconfirmed,
    PENDING: styles.statuspending,
    COMPLETED: styles.statuscompleted,
    CANCELLED: styles.statuscancelled,
  }[booking.status as 'CONFIRMED' | 'PENDING' | 'COMPLETED' | 'CANCELLED'] ?? styles.statuspending;

  return (
  <TouchableOpacity style={styles.bookingCard} onPress={onPress}>
    <View style={styles.bookingHeader}>
      <View style={styles.serviceInfo}>
        <Text style={styles.serviceName}>{serviceName}</Text>
        <Text style={styles.professionalName}>{professionalName}</Text>
      </View>
      <View style={[styles.statusBadge, statusStyle]}>
        <Text style={styles.statusText}>{t(`bookings.${statusKey}`, { defaultValue: booking.status })}</Text>
      </View>
    </View>
    
    <View style={styles.bookingDetails}>
      <View style={styles.detailRow}>
        <Ionicons name="calendar-outline" size={16} color={COLORS.textSecondary} />
        <Text style={styles.detailText}>{scheduledDate.toLocaleDateString(i18n.resolvedLanguage)}</Text>
      </View>
      <View style={styles.detailRow}>
        <Ionicons name="time-outline" size={16} color={COLORS.textSecondary} />
        <Text style={styles.detailText}>{scheduledDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text>
      </View>
    </View>
    
    <View style={styles.bookingFooter}>
      <Text style={styles.price}>{booking.totalPrice ? `€${booking.totalPrice}` : ''}</Text>
      <Ionicons name="chevron-forward" size={20} color={COLORS.textSecondary} />
    </View>
  </TouchableOpacity>
  );
};

export default function BookingsScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { bookings, isLoadingBookings, fetchBookings } = useAppStore();
  const [activeTab, setActiveTab] = useState<'upcoming' | 'past'>('upcoming');

  useEffect(() => {
    fetchBookings();
  }, []);

  const filteredBookings = bookings.filter((booking) => {
    const bookingDate = new Date(booking.scheduledDate);
    const now = new Date();
    const isUpcoming = bookingDate >= now;
    return activeTab === 'upcoming' ? isUpcoming : !isUpcoming;
  });

  const renderEmptyState = () => (
    <View style={styles.emptyState}>
      <Ionicons
        name={activeTab === 'upcoming' ? 'calendar-outline' : 'time-outline'}
        size={64}
        color={COLORS.textSecondary}
      />
      <Text style={styles.emptyTitle}>
        {t('bookings.empty')}
      </Text>
      <Text style={styles.emptySubtitle}>
        {activeTab === 'upcoming' ? t('home.subtitle') : t('bookings.history')}
      </Text>
      {activeTab === 'upcoming' && (
        <TouchableOpacity
          style={styles.browseButton}
          onPress={() => router.push('/(tabs)')}
        >
          <Text style={styles.browseButtonText}>{t('home.title')}</Text>
        </TouchableOpacity>
      )}
    </View>
  );

  const renderBookingItem = ({ item }: { item: Booking }) => (
    <BookingItem
      booking={item}
      onPress={() => router.push(`/booking/${item.id}`)}
    />
  );

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>{t('bookings.title')}</Text>
      </View>

      {/* Tabs */}
      <View style={styles.tabsContainer}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'upcoming' && styles.activeTab]}
          onPress={() => setActiveTab('upcoming')}
          accessibilityRole="tab"
          accessibilityState={{ selected: activeTab === 'upcoming' }}
        >
          <Text
            style={[
              styles.tabText,
              activeTab === 'upcoming' && styles.activeTabText,
            ]}
          >
            {t('bookings.upcoming')}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'past' && styles.activeTab]}
          onPress={() => setActiveTab('past')}
          accessibilityRole="tab"
          accessibilityState={{ selected: activeTab === 'past' }}
        >
          <Text
            style={[
              styles.tabText,
              activeTab === 'past' && styles.activeTabText,
            ]}
          >
            {t('bookings.history')}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Lista de reservas */}
      {isLoadingBookings ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      ) : filteredBookings.length === 0 ? (
        renderEmptyState()
      ) : (
        <FlatList
          data={filteredBookings}
          renderItem={renderBookingItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    width: '100%',
    maxWidth: LAYOUT.contentMaxWidth,
    alignSelf: 'center',
    paddingHorizontal: LAYOUT.screenPadding,
    paddingTop: SPACING.lg,
    paddingBottom: SPACING.md,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: COLORS.textPrimary,
    fontFamily: FONTS.bold,
  },
  tabsContainer: {
    flexDirection: 'row',
    width: 'auto',
    maxWidth: LAYOUT.contentMaxWidth - (LAYOUT.screenPadding * 2),
    marginHorizontal: LAYOUT.screenPadding,
    marginBottom: SPACING.lg,
    padding: 4,
    borderRadius: BORDER_RADIUS.full,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  tab: {
    flex: 1,
    minHeight: LAYOUT.touchTarget,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: BORDER_RADIUS.full,
  },
  activeTab: {
    backgroundColor: COLORS.ink,
  },
  tabText: {
    fontSize: 16,
    fontWeight: '500',
    color: COLORS.textSecondary,
  },
  activeTabText: {
    color: COLORS.white,
    fontWeight: '700',
  },
  listContent: {
    width: '100%',
    maxWidth: LAYOUT.contentMaxWidth,
    alignSelf: 'center',
    padding: LAYOUT.screenPadding,
    paddingTop: 0,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyState: {
    alignSelf: 'center',
    width: '90%',
    maxWidth: 520,
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING.xxl,
    marginTop: SPACING.xxl,
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.xl,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.textPrimary,
    marginTop: SPACING.lg,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 14,
    color: COLORS.textSecondary,
    marginTop: SPACING.sm,
    textAlign: 'center',
  },
  browseButton: {
    marginTop: SPACING.lg,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.xl,
    backgroundColor: COLORS.primary,
    minHeight: LAYOUT.touchTarget,
    justifyContent: 'center',
    borderRadius: BORDER_RADIUS.md,
  },
  browseButtonText: {
    color: COLORS.white,
    fontSize: 16,
    fontWeight: '600',
  },
  bookingCard: {
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.lg,
    marginBottom: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    ...SHADOWS.sm,
  },
  bookingHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: SPACING.sm,
  },
  serviceInfo: {
    flex: 1,
  },
  serviceName: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  professionalName: {
    fontSize: 14,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  statusBadge: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: 2,
    borderRadius: 12,
  },
  statusconfirmed: {
    backgroundColor: '#DCFCE7',
  },
  statuspending: {
    backgroundColor: '#FEF3C7',
  },
  statuscompleted: {
    backgroundColor: '#DBEAFE',
  },
  statuscancelled: {
    backgroundColor: '#FEE2E2',
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  bookingDetails: {
    flexDirection: 'row',
    gap: SPACING.lg,
    marginBottom: SPACING.sm,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  detailText: {
    fontSize: 14,
    color: COLORS.textSecondary,
  },
  bookingFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingTop: SPACING.sm,
  },
  price: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.primary,
  },
});
