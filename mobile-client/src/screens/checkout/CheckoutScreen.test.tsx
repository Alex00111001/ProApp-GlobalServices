/// <reference types="jest" />

import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

jest.mock('expo-router', () => {
  const router = { back: jest.fn(), push: jest.fn() };
  return {
    useRouter: () => router,
    useLocalSearchParams: () => ({ bookingId: 'booking-1', amount: '120' }),
  };
});

jest.mock('@stripe/stripe-react-native', () => {
  const stripe = {
    initPaymentSheet: jest.fn(),
    presentPaymentSheet: jest.fn(),
  };
  return { useStripe: () => stripe };
});

jest.mock('@expo/vector-icons', () => ({
  Ionicons: () => require('react').createElement(require('react-native').View),
}));

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => (
    require('react').createElement(require('react-native').View, null, children)
  ),
}));

jest.mock('@/components/ui', () => ({
  Button: ({ title, onPress }: { title: string; onPress: () => void }) => (
    require('react').createElement(require('react-native').Text, {
      accessibilityRole: 'button',
      onPress,
    }, title)
  ),
}));

jest.mock('@/services/api', () => ({
  apiClient: {
    getBookingById: jest.fn(),
    createPaymentIntent: jest.fn(),
    confirmPayment: jest.fn(),
  },
}));

import { CheckoutScreen } from './CheckoutScreen';

const mockRouter = jest.requireMock('expo-router').useRouter();
const mockStripe = jest.requireMock('@stripe/stripe-react-native').useStripe();
const mockApiClient = jest.requireMock('@/services/api').apiClient;

describe('CheckoutScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockApiClient.getBookingById.mockResolvedValue({
      totalPrice: 120,
      platformFee: 20,
      professional: { user: { firstName: 'Ana', lastName: 'López' } },
      bookingServices: [{ service: { name: 'Limpieza' } }],
      scheduledDate: '2026-09-18T10:00:00.000Z',
      address: 'Calle Uno',
      city: 'Madrid',
      postalCode: '28001',
    });
    mockApiClient.createPaymentIntent.mockResolvedValue({
      clientSecret: 'test-client-secret',
      paymentIntentId: 'payment-intent-1',
    });
    mockApiClient.confirmPayment.mockResolvedValue({ success: true });
    mockStripe.initPaymentSheet.mockResolvedValue({ error: undefined });
    mockStripe.presentPaymentSheet.mockResolvedValue({ error: undefined });
  });

  it('offers only card payment and completes through the provider-backed flow', async () => {
    const screen = await render(<CheckoutScreen />);

    await waitFor(() => expect(screen.getByText('Credit/Debit Card')).toBeTruthy());
    expect(screen.getByLabelText('Payment method: credit or debit card')).toBeTruthy();
    expect(screen.queryByText('Cash on Delivery')).toBeNull();

    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Pay Now' }));
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    await waitFor(() => expect(mockApiClient.createPaymentIntent).toHaveBeenCalledWith('booking-1'));
    expect(mockStripe.initPaymentSheet).toHaveBeenCalledWith(expect.objectContaining({
      paymentIntentClientSecret: 'test-client-secret',
    }));
    expect(mockStripe.presentPaymentSheet).toHaveBeenCalledTimes(1);
    expect(mockApiClient.confirmPayment).toHaveBeenCalledWith('booking-1', 'payment-intent-1');
    await waitFor(() => expect(mockRouter.push).toHaveBeenCalledWith('/booking/booking-1'));
    await Promise.resolve();
  });
});
