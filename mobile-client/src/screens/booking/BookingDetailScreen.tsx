import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert, Image, ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import MapView, { Marker } from 'react-native-maps';

import { Button } from '@/components/ui';
import { COLORS, SPACING, FONTS, BORDER_RADIUS, SHADOWS } from '@/constants/theme';
import { apiClient } from '@/services/api';

interface BookingService {
  id: string;
  serviceId: string;
  quantity: number;
  price: number;
  subtotal: number;
  service: {
    id: string;
    name: string;
    description?: string;
  };
}

interface Booking {
  id: string;
  status: 'PENDING' | 'CONFIRMED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
  scheduledDate: string;
  address: string;
  city: string;
  state: string;
  postalCode: string;
  notes?: string;
  totalPrice: number;
  professionalEarnings: number;
  platformFee: number;
  client: {
    id: string;
    user: {
      name: string;
      phone: string;
      avatar?: string;
    };
  };
  professional?: {
    id: string;
    user: {
      name: string;
      phone: string;
      avatar?: string;
    };
    rating: number;
  };
  bookingServices: BookingService[];
  payment?: {
    id: string;
    amount: number;
    status: string;
    method: string;
  };
  review?: {
    id: string;
    rating: number;
    comment?: string;
  };
  createdAt: string;
}

export const BookingDetailScreen: React.FC = () => {
  const router = useRouter();
  const { bookingId } = useLocalSearchParams<{ bookingId: string }>();

  const [booking, setBooking] = useState<Booking | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadBooking();
  }, [bookingId]);

  const loadBooking = async () => {
    setIsLoading(true);
    try {
      // In real app, fetch booking details from API
      // const data = await apiClient.getBookingById(bookingId);
      // setBooking(data);
      
      // Mock data for now
      setBooking({
        id: bookingId,
        status: 'CONFIRMED',
        scheduledDate: new Date().toISOString(),
        address: '123 Main Street',
        city: 'Mexico City',
        state: 'CDMX',
        postalCode: '12345',
        notes: 'Please call when you arrive',
        totalPrice: 225,
        professionalEarnings: 200,
        platformFee: 25,
        client: {
          id: '1',
          user: {
            name: 'John Doe',
            phone: '+52 55 1234 5678',
            avatar: 'https://via.placeholder.com/100',
          },
        },
        professional: {
          id: '2',
          user: {
            name: 'Maria Garcia',
            phone: '+52 55 8765 4321',
            avatar: 'https://via.placeholder.com/100',
          },
          rating: 4.8,
        },
        bookingServices: [
          {
            id: '1',
            serviceId: '1',
            quantity: 1,
            price: 150,
            subtotal: 150,
            service: {
              id: '1',
              name: 'Electrical Installation',
              description: 'Complete electrical installation',
            },
          },
          {
            id: '2',
            serviceId: '2',
            quantity: 1,
            price: 75,
            subtotal: 75,
            service: {
              id: '2',
              name: 'Safety Inspection',
              description: 'Safety check and testing',
            },
          },
        ],
        payment: {
          id: '1',
          amount: 225,
          status: 'COMPLETED',
          method: 'STRIPE',
        },
        createdAt: new Date().toISOString(),
      });
    } catch (error) {
      console.error('Error loading booking:', error);
      Alert.alert('Error', 'Failed to load booking details');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancelBooking = () => {
    Alert.alert(
      'Cancel Booking',
      'Are you sure you want to cancel this booking?',
      [
        { text: 'No', style: 'cancel' },
        {
          text: 'Yes, Cancel',
          style: 'destructive',
          onPress: async () => {
            try {
              await apiClient.cancelBooking(bookingId);
              Alert.alert('Success', 'Booking cancelled');
              loadBooking();
            } catch (error) {
              Alert.alert('Error', 'Failed to cancel booking');
            }
          },
        },
      ]
    );
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'PENDING':
        return COLORS.warning;
      case 'CONFIRMED':
        return COLORS.primary;
      case 'IN_PROGRESS':
        return COLORS.info;
      case 'COMPLETED':
        return COLORS.success;
      case 'CANCELLED':
        return COLORS.error;
      default:
        return COLORS.gray400;
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'PENDING':
        return 'Pending Confirmation';
      case 'CONFIRMED':
        return 'Confirmed';
      case 'IN_PROGRESS':
        return 'In Progress';
      case 'COMPLETED':
        return 'Completed';
      case 'CANCELLED':
        return 'Cancelled';
      default:
        return status;
    }
  };

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  if (!booking) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.emptyContainer}>
          <Ionicons name="calendar-outline" size={64} color={COLORS.gray400} />
          <Text style={styles.emptyText}>Booking not found</Text>
          <Button title="Go Back" onPress={() => router.back()} />
        </View>
      </SafeAreaView>
    );
  }

  const renderStars = (rating: number) => {
    return Array.from({ length: 5 }, (_, index) => (
      <Ionicons
        key={index}
        name={index < Math.floor(rating) ? 'star' : 'star-outline'}
        size={14}
        color={COLORS.warning}
      />
    ));
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={COLORS.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Booking Details</Text>
        <TouchableOpacity>
          <Ionicons name="share-outline" size={24} color={COLORS.textPrimary} />
        </TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Status Banner */}
        <View style={[styles.statusBanner, { backgroundColor: `${getStatusColor(booking.status)}15` }]}>
          <View style={[styles.statusDot, { backgroundColor: getStatusColor(booking.status) }]} />
          <Text style={[styles.statusText, { color: getStatusColor(booking.status) }]}>
            {getStatusText(booking.status)}
          </Text>
        </View>

        {/* Professional Info */}
        {booking.professional && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Professional</Text>
            <TouchableOpacity
              style={styles.professionalCard}
              onPress={() => router.push(`/professional/${booking.professional!.id}`)}
            >
              <Image
                source={{ uri: booking.professional.user.avatar || 'https://via.placeholder.com/100' }}
                style={styles.avatar}
              />
              <View style={styles.professionalInfo}>
                <Text style={styles.professionalName}>{booking.professional.user.name}</Text>
                <View style={styles.ratingRow}>
                  <View style={styles.stars}>{renderStars(booking.professional.rating)}</View>
                  <Text style={styles.ratingText}>{booking.professional.rating.toFixed(1)}</Text>
                </View>
              </View>
              <TouchableOpacity style={styles.callButton}>
                <Ionicons name="call" size={20} color={COLORS.primary} />
              </TouchableOpacity>
            </TouchableOpacity>
          </View>
        )}

        {/* Services */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Services</Text>
          {booking.bookingServices.map((bs) => (
            <View key={bs.id} style={styles.serviceItem}>
              <View style={styles.serviceIcon}>
                <Ionicons name="construct-outline" size={20} color={COLORS.primary} />
              </View>
              <View style={styles.serviceInfo}>
                <Text style={styles.serviceName}>{bs.service.name}</Text>
                <Text style={styles.serviceQuantity}>Qty: {bs.quantity}</Text>
              </View>
              <Text style={styles.servicePrice}>${bs.subtotal}</Text>
            </View>
          ))}
        </View>

        {/* Date & Time */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Date & Time</Text>
          <View style={styles.infoCard}>
            <Ionicons name="calendar-outline" size={20} color={COLORS.primary} />
            <Text style={styles.infoText}>
              {new Date(booking.scheduledDate).toLocaleDateString('en-US', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              })}
            </Text>
          </View>
        </View>

        {/* Location */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Location</Text>
          <View style={styles.infoCard}>
            <Ionicons name="location-outline" size={20} color={COLORS.primary} />
            <Text style={styles.infoText}>
              {booking.address}, {booking.city}, {booking.state} {booking.postalCode}
            </Text>
          </View>
          {/* Map placeholder */}
          <View style={styles.mapContainer}>
            <View style={styles.mapPlaceholder}>
              <Ionicons name="map-outline" size={48} color={COLORS.gray400} />
              <Text style={styles.mapPlaceholderText}>Map View</Text>
            </View>
          </View>
        </View>

        {/* Payment Info */}
        {booking.payment && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Payment</Text>
            <View style={styles.priceCard}>
              <View style={styles.priceRow}>
                <Text style={styles.priceLabel}>Subtotal</Text>
                <Text style={styles.priceValue}>${(booking.totalPrice - booking.platformFee).toFixed(2)}</Text>
              </View>
              <View style={styles.priceRow}>
                <Text style={styles.priceLabel}>Platform Fee</Text>
                <Text style={styles.priceValue}>${booking.platformFee.toFixed(2)}</Text>
              </View>
              <View style={styles.divider} />
              <View style={[styles.priceRow, styles.totalRow]}>
                <Text style={styles.totalLabel}>Total Paid</Text>
                <Text style={styles.totalValue}>${booking.totalPrice.toFixed(2)}</Text>
              </View>
              <View style={styles.paymentMethod}>
                <Ionicons
                  name={booking.payment.method === 'STRIPE' ? 'card' : 'cash'}
                  size={16}
                  color={COLORS.success}
                />
                <Text style={styles.paymentStatus}>
                  {booking.payment.status} via {booking.payment.method}
                </Text>
              </View>
            </View>
          </View>
        )}

        {/* Notes */}
        {booking.notes && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Notes</Text>
            <View style={styles.notesCard}>
              <Text style={styles.notesText}>{booking.notes}</Text>
            </View>
          </View>
        )}

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Action Buttons */}
      {(booking.status === 'CONFIRMED' || booking.status === 'PENDING') && (
        <View style={styles.bottomBar}>
          <Button
            title="Cancel Booking"
            onPress={handleCancelBooking}
            variant="outline"
            style={styles.cancelButton}
          />
          <Button
            title="Contact Professional"
            onPress={() => {}}
            style={styles.contactButton}
          />
        </View>
      )}

      {booking.status === 'COMPLETED' && !booking.review && (
        <View style={styles.bottomBar}>
          <Button
            title="Write a Review"
            onPress={() => {}}
            style={styles.reviewButton}
          />
        </View>
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    backgroundColor: COLORS.surface,
  },
  headerTitle: {
    fontSize: FONTS.sizes.lg,
    fontWeight: FONTS.weights.bold,
    color: COLORS.textPrimary,
  },
  statusBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: SPACING.md,
  } as ViewStyle,
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: SPACING.sm,
  },
  statusText: {
    fontSize: FONTS.sizes.md,
    fontWeight: FONTS.weights.semibold,
  },
  section: {
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.lg,
  },
  sectionTitle: {
    fontSize: FONTS.sizes.md,
    fontWeight: FONTS.weights.bold,
    color: COLORS.textPrimary,
    marginBottom: SPACING.md,
  },
  professionalCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md,
    ...SHADOWS.sm,
  },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: BORDER_RADIUS.full,
  },
  professionalInfo: {
    flex: 1,
    marginLeft: SPACING.md,
  },
  professionalName: {
    fontSize: FONTS.sizes.md,
    fontWeight: FONTS.weights.semibold,
    color: COLORS.textPrimary,
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: SPACING.xxs,
  },
  stars: {
    flexDirection: 'row',
  },
  ratingText: {
    fontSize: FONTS.sizes.xs,
    color: COLORS.textTertiary,
    marginLeft: SPACING.xs,
  },
  callButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.primaryTransparent,
    justifyContent: 'center',
    alignItems: 'center',
  },
  serviceItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
  },
  serviceIcon: {
    width: 40,
    height: 40,
    borderRadius: BORDER_RADIUS.sm,
    backgroundColor: COLORS.primaryTransparent,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: SPACING.md,
  },
  serviceInfo: {
    flex: 1,
  },
  serviceName: {
    fontSize: FONTS.sizes.md,
    fontWeight: FONTS.weights.medium,
    color: COLORS.textPrimary,
  },
  serviceQuantity: {
    fontSize: FONTS.sizes.xs,
    color: COLORS.textTertiary,
  },
  servicePrice: {
    fontSize: FONTS.sizes.md,
    fontWeight: FONTS.weights.semibold,
    color: COLORS.primary,
  },
  infoCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
  },
  infoText: {
    fontSize: FONTS.sizes.md,
    color: COLORS.textSecondary,
    marginLeft: SPACING.md,
    flex: 1,
  },
  mapContainer: {
    marginTop: SPACING.md,
    height: 150,
    borderRadius: BORDER_RADIUS.md,
    overflow: 'hidden',
  },
  mapPlaceholder: {
    flex: 1,
    backgroundColor: COLORS.gray100,
    justifyContent: 'center',
    alignItems: 'center',
  },
  mapPlaceholderText: {
    fontSize: FONTS.sizes.sm,
    color: COLORS.textTertiary,
    marginTop: SPACING.sm,
  },
  priceCard: {
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.lg,
    ...SHADOWS.sm,
  },
  priceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: SPACING.sm,
  },
  priceLabel: {
    fontSize: FONTS.sizes.md,
    color: COLORS.textSecondary,
  },
  priceValue: {
    fontSize: FONTS.sizes.md,
    fontWeight: FONTS.weights.semibold,
    color: COLORS.textPrimary,
  },
  divider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginVertical: SPACING.md,
  },
  totalRow: {
    paddingTop: SPACING.md,
    borderTopWidth: 2,
    borderTopColor: COLORS.border,
  },
  totalLabel: {
    fontSize: FONTS.sizes.lg,
    fontWeight: FONTS.weights.bold,
    color: COLORS.textPrimary,
  },
  totalValue: {
    fontSize: FONTS.sizes.xl,
    fontWeight: FONTS.weights.bold,
    color: COLORS.primary,
  },
  paymentMethod: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: SPACING.md,
    paddingTop: SPACING.md,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  paymentStatus: {
    fontSize: FONTS.sizes.sm,
    color: COLORS.success,
    fontWeight: FONTS.weights.medium,
    marginLeft: SPACING.xs,
  },
  notesCard: {
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
  },
  notesText: {
    fontSize: FONTS.sizes.md,
    color: COLORS.textSecondary,
    lineHeight: 22,
  },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    backgroundColor: COLORS.surface,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  cancelButton: {
    flex: 1,
    marginRight: SPACING.md,
  },
  contactButton: {
    flex: 2,
  },
  reviewButton: {
    flex: 1,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: SPACING.xl,
  },
  emptyText: {
    fontSize: FONTS.sizes.lg,
    color: COLORS.textSecondary,
    marginTop: SPACING.md,
    marginBottom: SPACING.xl,
  },
});
