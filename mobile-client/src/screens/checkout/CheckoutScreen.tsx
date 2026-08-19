import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { StripeProvider, useStripe } from '@stripe/stripe-react-native';

import { Button } from '@/components/ui';
import { COLORS, SPACING, FONTS, BORDER_RADIUS, SHADOWS } from '@/constants/theme';
import { apiClient } from '@/services/api';

export const CheckoutScreen: React.FC = () => {
  const router = useRouter();
  const { bookingId, amount } = useLocalSearchParams<{ bookingId: string; amount: string }>();
  const numericAmount = parseFloat(amount || '0');
  
  const { initPaymentSheet, presentPaymentSheet } = useStripe();
  const [isLoading, setIsLoading] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<'CARD' | 'CASH'>('CARD');

  // Mock booking data - in real app, fetch from API
  const booking = {
    id: bookingId,
    professionalName: 'John Martinez',
    serviceName: 'Electrical Installation',
    date: new Date().toLocaleDateString(),
    time: '10:00 AM',
    address: '123 Main St, City, State 12345',
  };

  const platformFee = numericAmount * 0.1;
  const total = numericAmount + platformFee;

  const handlePayment = async () => {
    if (paymentMethod === 'CASH') {
      // Handle cash payment
      try {
        await apiClient.createPaymentIntent(bookingId, total);
        Alert.alert('Success', 'Booking confirmed! Pay the professional in cash.');
        router.push(`/booking/${bookingId}`);
      } catch (error) {
        Alert.alert('Error', 'Failed to confirm booking');
      }
      return;
    }

    // Handle card payment with Stripe
    setIsLoading(true);
    try {
      // Fetch payment intent from backend
      const response = await apiClient.createPaymentIntent(bookingId, total);
      
      // Initialize payment sheet
      const { error: initError } = await initPaymentSheet({
        paymentIntentClientSecret: response.clientSecret,
        merchantDisplayName: 'ServicePro',
        returnURL: 'servicepro://checkout',
      });

      if (initError) {
        throw new Error(initError.message);
      }

      // Present payment sheet
      const { error: paymentError } = await presentPaymentSheet();

      if (paymentError) {
        throw new Error(paymentError.message);
      }

      // Payment successful
      Alert.alert('Success', 'Payment completed! Your booking is confirmed.');
      router.push(`/booking/${bookingId}`);
    } catch (error: any) {
      Alert.alert('Payment Failed', error.message || 'Please try again');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={COLORS.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Checkout</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Booking Summary */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Booking Summary</Text>
          <View style={styles.summaryCard}>
            <View style={styles.summaryRow}>
              <Ionicons name="person-outline" size={20} color={COLORS.primary} />
              <View style={styles.summaryInfo}>
                <Text style={styles.summaryLabel}>Professional</Text>
                <Text style={styles.summaryValue}>{booking.professionalName}</Text>
              </View>
            </View>
            <View style={styles.divider} />
            <View style={styles.summaryRow}>
              <Ionicons name="construct-outline" size={20} color={COLORS.primary} />
              <View style={styles.summaryInfo}>
                <Text style={styles.summaryLabel}>Service</Text>
                <Text style={styles.summaryValue}>{booking.serviceName}</Text>
              </View>
            </View>
            <View style={styles.divider} />
            <View style={styles.summaryRow}>
              <Ionicons name="calendar-outline" size={20} color={COLORS.primary} />
              <View style={styles.summaryInfo}>
                <Text style={styles.summaryLabel}>Date & Time</Text>
                <Text style={styles.summaryValue}>{booking.date} at {booking.time}</Text>
              </View>
            </View>
            <View style={styles.divider} />
            <View style={styles.summaryRow}>
              <Ionicons name="location-outline" size={20} color={COLORS.primary} />
              <View style={styles.summaryInfo}>
                <Text style={styles.summaryLabel}>Location</Text>
                <Text style={styles.summaryValue}>{booking.address}</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Payment Method */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Payment Method</Text>
          
          <TouchableOpacity
            style={[styles.paymentOption, paymentMethod === 'CARD' && styles.paymentOptionSelected]}
            onPress={() => setPaymentMethod('CARD')}
          >
            <View style={styles.paymentOptionLeft}>
              <Ionicons 
                name="card-outline" 
                size={24} 
                color={paymentMethod === 'CARD' ? COLORS.primary : COLORS.gray400} 
              />
              <Text style={[styles.paymentOptionText, paymentMethod === 'CARD' && styles.paymentOptionTextSelected]}>
                Credit/Debit Card
              </Text>
            </View>
            <Ionicons 
              name={paymentMethod === 'CARD' ? 'radio-button-on' : 'radio-button-off'} 
              size={24} 
              color={paymentMethod === 'CARD' ? COLORS.primary : COLORS.gray400} 
            />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.paymentOption, paymentMethod === 'CASH' && styles.paymentOptionSelected]}
            onPress={() => setPaymentMethod('CASH')}
          >
            <View style={styles.paymentOptionLeft}>
              <Ionicons 
                name="cash-outline" 
                size={24} 
                color={paymentMethod === 'CASH' ? COLORS.primary : COLORS.gray400} 
              />
              <Text style={[styles.paymentOptionText, paymentMethod === 'CASH' && styles.paymentOptionTextSelected]}>
                Cash on Delivery
              </Text>
            </View>
            <Ionicons 
              name={paymentMethod === 'CASH' ? 'radio-button-on' : 'radio-button-off'} 
              size={24} 
              color={paymentMethod === 'CASH' ? COLORS.primary : COLORS.gray400} 
            />
          </TouchableOpacity>
        </View>

        {/* Price Breakdown */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Price Details</Text>
          <View style={styles.priceCard}>
            <View style={styles.priceRow}>
              <Text style={styles.priceLabel}>Service Cost</Text>
              <Text style={styles.priceValue}>${numericAmount.toFixed(2)}</Text>
            </View>
            <View style={styles.priceRow}>
              <Text style={styles.priceLabel}>Platform Fee</Text>
              <Text style={styles.priceValue}>${platformFee.toFixed(2)}</Text>
            </View>
            <View style={styles.divider} />
            <View style={[styles.priceRow, styles.totalRow]}>
              <Text style={styles.totalLabel}>Total</Text>
              <Text style={styles.totalValue}>${total.toFixed(2)}</Text>
            </View>
          </View>
        </View>

        {/* Security Notice */}
        <View style={styles.securityNotice}>
          <Ionicons name="shield-checkmark" size={24} color={COLORS.success} />
          <Text style={styles.securityText}>
            Your payment is secure and encrypted. We don't store your card information.
          </Text>
        </View>

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Bottom Action Bar */}
      <View style={styles.bottomBar}>
        <View style={styles.totalContainer}>
          <Text style={styles.totalLabelSmall}>Total to pay:</Text>
          <Text style={styles.totalValueSmall}>${total.toFixed(2)}</Text>
        </View>
        <Button
          title={paymentMethod === 'CARD' ? 'Pay Now' : 'Confirm Booking'}
          onPress={handlePayment}
          disabled={isLoading}
          style={styles.payButton}
        />
      </View>

      {isLoading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color={COLORS.primary} />
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
  section: {
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.lg,
  },
  sectionTitle: {
    fontSize: FONTS.sizes.lg,
    fontWeight: FONTS.weights.bold,
    color: COLORS.textPrimary,
    marginBottom: SPACING.md,
  },
  summaryCard: {
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.lg,
    ...SHADOWS.sm,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.md,
  },
  summaryInfo: {
    marginLeft: SPACING.md,
    flex: 1,
  },
  summaryLabel: {
    fontSize: FONTS.sizes.xs,
    color: COLORS.textTertiary,
    marginBottom: SPACING.xxs,
  },
  summaryValue: {
    fontSize: FONTS.sizes.md,
    color: COLORS.textPrimary,
    fontWeight: FONTS.weights.medium,
  },
  divider: {
    height: 1,
    backgroundColor: COLORS.border,
  },
  paymentOption: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.lg,
    marginBottom: SPACING.md,
    borderWidth: 2,
    borderColor: COLORS.border,
  },
  paymentOptionSelected: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primaryTransparent,
  },
  paymentOptionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  paymentOptionText: {
    fontSize: FONTS.sizes.md,
    color: COLORS.textSecondary,
    fontWeight: FONTS.weights.medium,
    marginLeft: SPACING.md,
  },
  paymentOptionTextSelected: {
    color: COLORS.primary,
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
  totalRow: {
    marginTop: SPACING.md,
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
  securityNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.successTransparent,
    marginHorizontal: SPACING.lg,
    padding: SPACING.md,
    borderRadius: BORDER_RADIUS.md,
  },
  securityText: {
    fontSize: FONTS.sizes.sm,
    color: COLORS.success,
    marginLeft: SPACING.sm,
    flex: 1,
    lineHeight: 20,
  },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    backgroundColor: COLORS.surface,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  totalContainer: {
    flex: 1,
  },
  totalLabelSmall: {
    fontSize: FONTS.sizes.xs,
    color: COLORS.textTertiary,
  },
  totalValueSmall: {
    fontSize: FONTS.sizes.xl,
    fontWeight: FONTS.weights.bold,
    color: COLORS.textPrimary,
  },
  payButton: {
    flex: 2,
    marginLeft: SPACING.md,
  },
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(255,255,255,0.8)',
    justifyContent: 'center',
    alignItems: 'center',
  },
});
