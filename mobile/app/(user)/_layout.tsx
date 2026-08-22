import { Tabs } from 'expo-router';

import { colors } from '@/lib/theme';

export default function UserLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarLabelStyle: { fontWeight: '700', fontSize: 12 },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'الرئيسية' }} />
      <Tabs.Screen name="new-booking" options={{ title: 'حجز جديد' }} />
      <Tabs.Screen name="bookings" options={{ title: 'حجوزاتي' }} />
      <Tabs.Screen name="profile" options={{ title: 'حسابي' }} />
      <Tabs.Screen name="scan/[bookingId]" options={{ href: null }} />
    </Tabs>
  );
}

