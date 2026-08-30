import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, ActivityIndicator, Alert, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';

import { Button } from '@/components/ui';
import { COLORS, SPACING, FONTS, BORDER_RADIUS, SHADOWS } from '@/constants/theme';
import { apiClient } from '@/services/api';

interface ServiceItem {
  id: string;
  name: string;
  price: number;
  duration: number;
  quantity: number;
}

export const BookingFlowScreen: React.FC = () => {
  const router = useRouter();
  const params = useLocalSearchParams<{ professionalId?: string; serviceId?: string }>();
  const { professionalId, serviceId } = params;

  const [step, setStep] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  
  // Step 1: Service Selection
  const [selectedServices, setSelectedServices] = useState<ServiceItem[]>([]);

  useEffect(() => {
    if (!professionalId) return;

    apiClient.getProfessionalById(professionalId)
      .then((professional: any) => {
        const availableServices = (professional.services ?? []).map((service: any) => ({
          id: service.id,
          name: service.name,
          price: Number(service.price ?? service.basePrice ?? 0),
          duration: Number(service.duration ?? 0),
          quantity: 1,
        }));
        const selected = availableServices.find((service: ServiceItem) => service.id === serviceId)
          ?? availableServices[0];
        setSelectedServices(selected ? [selected] : []);
      })
      .catch(error => console.error('Error loading professional services:', error));
  }, [professionalId, serviceId]);

  // Step 2: Date & Time
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [selectedTime, setSelectedTime] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);

  // Step 3: Location
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [zipCode, setZipCode] = useState('');
  const [notes, setNotes] = useState('');

  // Calculations
  const subtotal = selectedServices.reduce((sum, s) => sum + s.price * s.quantity, 0);
  const platformFee = subtotal * 0.1; // 10% platform fee
  const total = subtotal + platformFee;

  const handleNext = () => {
    if (step === 1) {
      if (selectedServices.length === 0) {
        Alert.alert('Error', 'Please select at least one service');
        return;
      }
      setStep(2);
    } else if (step === 2) {
      setStep(3);
    } else if (step === 3) {
      if (!address || !city || !state || !zipCode) {
        Alert.alert('Error', 'Please fill in all address fields');
        return;
      }
      createBooking();
    }
  };

  const createBooking = async () => {
    if (!professionalId) {
      Alert.alert('Error', 'No se ha seleccionado un profesional.');
      return;
    }

    setIsLoading(true);
    try {
      const bookingData = {
        professionalId,
        services: selectedServices.map(s => ({ serviceId: s.id, quantity: s.quantity })),
        scheduledDate: selectedDate.toISOString(),
        scheduledTime: selectedTime.toTimeString().slice(0, 5),
        address,
        city,
        state,
        zipCode,
        notes,
      };

      const response = await apiClient.createBooking(bookingData);
      
      // Navigate to checkout
      router.push(`/checkout?bookingId=${response.id}&amount=${total}`);
    } catch (error) {
      Alert.alert('Error', 'Failed to create booking. Please try again.');
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  const renderStepIndicator = () => (
    <View style={styles.stepIndicator}>
      {[1, 2, 3].map((s) => (
        <React.Fragment key={s}>
          <View style={[styles.stepCircle, step >= s && styles.stepCircleActive]}>
            <Text style={[styles.stepNumber, step >= s && styles.stepNumberActive]}>
              {s}
            </Text>
          </View>
          {s < 3 && <View style={[styles.stepLine, step > s && styles.stepLineActive]} />}
        </React.Fragment>
      ))}
    </View>
  );

  const renderServiceSelection = () => (
    <View style={styles.stepContent}>
      <Text style={styles.stepTitle}>Select Services</Text>
      {selectedServices.map((service, index) => (
        <View key={index} style={styles.serviceCard}>
          <View style={styles.serviceHeader}>
            <Text style={styles.serviceName}>{service.name}</Text>
            <Text style={styles.servicePrice}>${service.price}</Text>
          </View>
          <Text style={styles.serviceDuration}>{service.duration} min</Text>
          <View style={styles.quantityControl}>
            <TouchableOpacity
              style={styles.quantityButton}
              onPress={() => {
                const newServices = [...selectedServices];
                newServices[index].quantity = Math.max(1, newServices[index].quantity - 1);
                setSelectedServices(newServices);
              }}
            >
              <Ionicons name="remove" size={20} color={COLORS.primary} />
            </TouchableOpacity>
            <Text style={styles.quantityText}>{service.quantity}</Text>
            <TouchableOpacity
              style={styles.quantityButton}
              onPress={() => {
                const newServices = [...selectedServices];
                newServices[index].quantity += 1;
                setSelectedServices(newServices);
              }}
            >
              <Ionicons name="add" size={20} color={COLORS.primary} />
            </TouchableOpacity>
          </View>
        </View>
      ))}
      <TouchableOpacity style={styles.addServiceButton}>
        <Ionicons name="add-circle-outline" size={24} color={COLORS.primary} />
        <Text style={styles.addServiceText}>Add Another Service</Text>
      </TouchableOpacity>
    </View>
  );

  const renderDateTimeSelection = () => (
    <View style={styles.stepContent}>
      <Text style={styles.stepTitle}>Choose Date & Time</Text>
      
      <TouchableOpacity
        style={styles.dateTimeCard}
        onPress={() => setShowDatePicker(true)}
      >
        <Ionicons name="calendar-outline" size={24} color={COLORS.primary} />
        <View style={styles.dateTimeInfo}>
          <Text style={styles.dateTimeLabel}>Date</Text>
          <Text style={styles.dateTimeValue}>
            {selectedDate.toLocaleDateString('en-US', { 
              weekday: 'long', 
              year: 'numeric', 
              month: 'long', 
              day: 'numeric' 
            })}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={24} color={COLORS.gray400} />
      </TouchableOpacity>

      {showDatePicker && Platform.OS !== 'web' && (
        <DateTimePicker
          value={selectedDate}
          mode="date"
          display="default"
          minimumDate={new Date()}
          onChange={(event, date) => {
            setShowDatePicker(false);
            if (date) setSelectedDate(date);
          }}
        />
      )}

      {Platform.OS === 'web' && showDatePicker && (
        <input
          type="date"
          value={selectedDate.toISOString().split('T')[0]}
          onChange={(e) => {
            const newDate = new Date(e.target.value);
            if (!isNaN(newDate.getTime())) setSelectedDate(newDate);
            setShowDatePicker(false);
          }}
          style={{ marginTop: 10 }}
        />
      )}

      <TouchableOpacity
        style={styles.dateTimeCard}
        onPress={() => setShowTimePicker(true)}
      >
        <Ionicons name="time-outline" size={24} color={COLORS.primary} />
        <View style={styles.dateTimeInfo}>
          <Text style={styles.dateTimeLabel}>Time</Text>
          <Text style={styles.dateTimeValue}>
            {selectedTime.toLocaleTimeString('en-US', { 
              hour: '2-digit', 
              minute: '2-digit' 
            })}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={24} color={COLORS.gray400} />
      </TouchableOpacity>

      {showTimePicker && Platform.OS !== 'web' && (
        <DateTimePicker
          value={selectedTime}
          mode="time"
          display="default"
          onChange={(event, time) => {
            setShowTimePicker(false);
            if (time) setSelectedTime(time);
          }}
        />
      )}

      {Platform.OS === 'web' && showTimePicker && (
        <input
          type="time"
          value={selectedTime.toTimeString().slice(0, 5)}
          onChange={(e) => {
            const [hours, minutes] = e.target.value.split(':');
            const newTime = new Date();
            newTime.setHours(parseInt(hours, 10));
            newTime.setMinutes(parseInt(minutes, 10));
            setSelectedTime(newTime);
            setShowTimePicker(false);
          }}
          style={{ marginTop: 10 }}
        />
      )}
    </View>
  );

  const renderLocationForm = () => (
    <View style={styles.stepContent}>
      <Text style={styles.stepTitle}>Service Location</Text>
      
      <TextInput
        style={styles.input}
        placeholder="Street Address"
        value={address}
        onChangeText={setAddress}
        placeholderTextColor={COLORS.gray400}
      />
      
      <View style={styles.row}>
        <TextInput
          style={[styles.input, styles.halfInput]}
          placeholder="City"
          value={city}
          onChangeText={setCity}
          placeholderTextColor={COLORS.gray400}
        />
        
        <TextInput
          style={[styles.input, styles.halfInput]}
          placeholder="State"
          value={state}
          onChangeText={setState}
          placeholderTextColor={COLORS.gray400}
        />
      </View>

      <TextInput
        style={styles.input}
        placeholder="ZIP Code"
        value={zipCode}
        onChangeText={setZipCode}
        keyboardType="number-pad"
        placeholderTextColor={COLORS.gray400}
      />

      <TextInput
        style={[styles.input, styles.notesInput]}
        placeholder="Additional Notes (optional)"
        value={notes}
        onChangeText={setNotes}
        multiline
        numberOfLines={4}
        textAlignVertical="top"
        placeholderTextColor={COLORS.gray400}
      />

      {/* Order Summary */}
      <View style={styles.summaryCard}>
        <Text style={styles.summaryTitle}>Order Summary</Text>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Subtotal</Text>
          <Text style={styles.summaryValue}>${subtotal.toFixed(2)}</Text>
        </View>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Platform Fee</Text>
          <Text style={styles.summaryValue}>${platformFee.toFixed(2)}</Text>
        </View>
        <View style={[styles.summaryRow, styles.totalRow]}>
          <Text style={styles.totalLabel}>Total</Text>
          <Text style={styles.totalValue}>${total.toFixed(2)}</Text>
        </View>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => (step > 1 ? setStep(step - 1) : router.back())}>
          <Ionicons name="arrow-back" size={24} color={COLORS.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Book Service</Text>
        <View style={{ width: 40 }} />
      </View>

      {renderStepIndicator()}

      <ScrollView showsVerticalScrollIndicator={false}>
        {step === 1 && renderServiceSelection()}
        {step === 2 && renderDateTimeSelection()}
        {step === 3 && renderLocationForm()}
      </ScrollView>

      {/* Bottom Action Bar */}
      <View style={styles.bottomBar}>
        {step < 3 && (
          <View style={styles.totalContainer}>
            <Text style={styles.totalLabel}>Total:</Text>
            <Text style={styles.totalValue}>${total.toFixed(2)}</Text>
          </View>
        )}
        <Button
          title={step === 3 ? 'Continue to Payment' : 'Continue'}
          onPress={handleNext}
          disabled={isLoading}
          style={styles.continueButton}
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
  stepIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.lg,
    backgroundColor: COLORS.surface,
  },
  stepCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: COLORS.gray200,
    justifyContent: 'center',
    alignItems: 'center',
  },
  stepCircleActive: {
    backgroundColor: COLORS.primary,
  },
  stepNumber: {
    fontSize: FONTS.sizes.sm,
    fontWeight: FONTS.weights.semibold,
    color: COLORS.textTertiary,
  },
  stepNumberActive: {
    color: COLORS.white,
  },
  stepLine: {
    flex: 1,
    height: 2,
    backgroundColor: COLORS.gray200,
    marginHorizontal: SPACING.sm,
  },
  stepLineActive: {
    backgroundColor: COLORS.primary,
  },
  stepContent: {
    padding: SPACING.lg,
  },
  stepTitle: {
    fontSize: FONTS.sizes.xl,
    fontWeight: FONTS.weights.bold,
    color: COLORS.textPrimary,
    marginBottom: SPACING.lg,
  },
  serviceCard: {
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.lg,
    marginBottom: SPACING.md,
    ...SHADOWS.sm,
  },
  serviceHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.xs,
  },
  serviceName: {
    fontSize: FONTS.sizes.md,
    fontWeight: FONTS.weights.semibold,
    color: COLORS.textPrimary,
  },
  servicePrice: {
    fontSize: FONTS.sizes.lg,
    fontWeight: FONTS.weights.bold,
    color: COLORS.primary,
  },
  serviceDuration: {
    fontSize: FONTS.sizes.sm,
    color: COLORS.textSecondary,
    marginBottom: SPACING.md,
  },
  quantityControl: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  quantityButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.primaryTransparent,
    justifyContent: 'center',
    alignItems: 'center',
  },
  quantityText: {
    fontSize: FONTS.sizes.lg,
    fontWeight: FONTS.weights.semibold,
    color: COLORS.textPrimary,
    marginHorizontal: SPACING.lg,
  },
  addServiceButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: SPACING.lg,
    borderWidth: 2,
    borderColor: COLORS.primary,
    borderStyle: 'dashed',
    borderRadius: BORDER_RADIUS.md,
    marginTop: SPACING.md,
  },
  addServiceText: {
    fontSize: FONTS.sizes.md,
    color: COLORS.primary,
    fontWeight: FONTS.weights.medium,
    marginLeft: SPACING.sm,
  },
  dateTimeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.lg,
    marginBottom: SPACING.md,
    ...SHADOWS.sm,
  },
  dateTimeInfo: {
    flex: 1,
    marginLeft: SPACING.md,
  },
  dateTimeLabel: {
    fontSize: FONTS.sizes.xs,
    color: COLORS.textTertiary,
    marginBottom: SPACING.xxs,
  },
  dateTimeValue: {
    fontSize: FONTS.sizes.md,
    fontWeight: FONTS.weights.semibold,
    color: COLORS.textPrimary,
  },
  input: {
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
    fontSize: FONTS.sizes.md,
    color: COLORS.textPrimary,
    marginBottom: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  row: {
    flexDirection: 'row',
    gap: SPACING.md,
  },
  halfInput: {
    flex: 1,
  },
  notesInput: {
    height: 100,
  },
  summaryCard: {
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.lg,
    marginTop: SPACING.lg,
    ...SHADOWS.sm,
  },
  summaryTitle: {
    fontSize: FONTS.sizes.lg,
    fontWeight: FONTS.weights.bold,
    color: COLORS.textPrimary,
    marginBottom: SPACING.md,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: SPACING.sm,
  },
  summaryLabel: {
    fontSize: FONTS.sizes.md,
    color: COLORS.textSecondary,
  },
  summaryValue: {
    fontSize: FONTS.sizes.md,
    fontWeight: FONTS.weights.semibold,
    color: COLORS.textPrimary,
  },
  totalRow: {
    marginTop: SPACING.md,
    paddingTop: SPACING.md,
    borderTopWidth: 1,
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
  bottomBar: {
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
  continueButton: {
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
