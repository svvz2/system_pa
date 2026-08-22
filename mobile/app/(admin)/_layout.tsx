import { Tabs } from 'expo-router';

import { colors } from '@/lib/theme';

export default function AdminLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarLabelStyle: { fontWeight: '700', fontSize: 11 },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'لوحة الكراج' }} />
      <Tabs.Screen name="bookings" options={{ title: 'الحجوزات' }} />
      <Tabs.Screen name="system" options={{ title: 'النظام' }} />
      <Tabs.Screen name="audit" options={{ title: 'السجل' }} />
      <Tabs.Screen name="profile" options={{ title: 'الحساب' }} />
      <Tabs.Screen name="booking/[bookingId]" options={{ href: null }} />
    </Tabs>
  );
}
