export const PAYMENT_CURRENCY = process.env.EXPO_PUBLIC_PAYMENT_CURRENCY || (__DEV__ ? 'EUR' : '');

if (!PAYMENT_CURRENCY) {
  throw new Error('EXPO_PUBLIC_PAYMENT_CURRENCY must be configured for production builds');
}
