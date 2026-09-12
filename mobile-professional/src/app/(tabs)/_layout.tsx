import { Redirect, Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, LAYOUT, SHADOWS } from '@/constants/theme';
import { useAuthStore } from '@/store/authStore';

export default function TabsLayout() {
  const user = useAuthStore((state) => state.user);
  if (!user) return <Redirect href="/auth/login" />;
  return (
    <Tabs screenOptions={{
      headerShown: false,
      tabBarHideOnKeyboard: true,
      tabBarActiveTintColor: COLORS.primary,
      tabBarInactiveTintColor: COLORS.subtle,
      tabBarStyle: { height: LAYOUT.tabBarHeight, paddingTop: 8, paddingBottom: 8, borderTopColor: COLORS.border, backgroundColor: COLORS.surface, ...SHADOWS.sm },
      tabBarLabelStyle: { fontSize: 12, fontWeight: '600' },
      tabBarItemStyle: { minHeight: LAYOUT.touchTarget },
    }}>
      <Tabs.Screen name="index" options={{ title: 'Inicio', tabBarIcon: ({ color, size, focused }) => <Ionicons name={focused ? 'home' : 'home-outline'} color={color} size={size} /> }} />
      <Tabs.Screen name="bookings" options={{ title: 'Reservas', tabBarIcon: ({ color, size, focused }) => <Ionicons name={focused ? 'calendar' : 'calendar-outline'} color={color} size={size} /> }} />
      <Tabs.Screen name="profile" options={{ title: 'Perfil', tabBarIcon: ({ color, size, focused }) => <Ionicons name={focused ? 'person' : 'person-outline'} color={color} size={size} /> }} />
    </Tabs>
  );
}
