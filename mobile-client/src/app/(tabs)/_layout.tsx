import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { COLORS, LAYOUT, SHADOWS } from '@/constants/theme';

export default function TabLayout() {
  const { t } = useTranslation();
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: COLORS.primary,
        tabBarInactiveTintColor: COLORS.textTertiary,
        headerShown: false,
        tabBarHideOnKeyboard: true,
        tabBarStyle: {
          height: LAYOUT.tabBarHeight,
          paddingTop: 8,
          paddingBottom: 8,
          backgroundColor: COLORS.surface,
          borderTopColor: COLORS.border,
          ...SHADOWS.sm,
        },
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: '600',
        },
        tabBarItemStyle: {
          minHeight: LAYOUT.touchTarget,
        },
      }}
    >
      <Tabs.Screen
        name="index" // Apunta a src/app/(tabs)/index.tsx (Home)
        options={{
          title: t('tabs.home'),
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? 'home' : 'home-outline'} size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="search" // Debes crear src/app/(tabs)/search.tsx
        options={{
          title: t('tabs.search'),
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? 'search' : 'search-outline'} size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="bookings" // Debes crear src/app/(tabs)/bookings.tsx
        options={{
          title: t('tabs.bookings'),
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? 'calendar' : 'calendar-outline'} size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile" // Debes crear src/app/(tabs)/profile.tsx
        options={{
          title: t('tabs.profile'),
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? 'person' : 'person-outline'} size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
