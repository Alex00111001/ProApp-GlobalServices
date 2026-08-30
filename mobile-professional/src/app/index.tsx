import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { Redirect } from 'expo-router';
import { COLORS } from '@/constants/theme';
import { useAuthStore } from '@/store/authStore';

export default function Entry() {
  const initialized = useAuthStore((state) => state.initialized);
  const user = useAuthStore((state) => state.user);
  if (!initialized) return <View style={styles.loading}><ActivityIndicator size="large" color={COLORS.primary} /></View>;
  return <Redirect href={user ? '/(tabs)' : '/auth/login'} />;
}

const styles = StyleSheet.create({ loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.background } });

