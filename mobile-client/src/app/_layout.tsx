import { Slot } from 'expo-router';
import { StripeProvider } from '@stripe/stripe-react-native';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import * as SplashScreen from 'expo-splash-screen';

// Configura tu clave pública de Stripe desde variables de entorno
const STRIPE_PUBLISHABLE_KEY = process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY || '';

if (!STRIPE_PUBLISHABLE_KEY) {
  console.warn('STRIPE_PUBLISHABLE_KEY no está configurada. Las funcionalidades de pago no estarán disponibles.');
}

export default function RootLayout() {
  useEffect(() => {
    // Mantener la pantalla de splash visible mientras se cargan los recursos
    SplashScreen.preventAutoHideAsync().catch(() => {
      /* ignorar errores */
    });
  }, []);

  return (
    <StripeProvider publishableKey={STRIPE_PUBLISHABLE_KEY}>
      <StatusBar style="dark" />
      <Slot />
    </StripeProvider>
  );
}
