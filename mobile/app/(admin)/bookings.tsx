import { useState } from 'react';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { BookingCard } from '@/components/booking-card';
import { AppButton, LoadingBlock, Muted, Screen, Title } from '@/components/ui';
import { useBookings } from '@/hooks/use-bookings';
import { colors } from '@/lib/theme';

const filters = ['all', 'confirmed', 'checked_in', 'overstayed', 'completed', 'cancelled'] as const;
const labels: Record<(typeof filters)[number], string> = {
  all: 'الكل', confirmed: 'مؤكد', checked_in: 'داخل', overstayed: 'متأخر', completed: 'مكتمل', cancelled: 'ملغي',
};

export default function AdminBookingsScreen() {
  const { bookings, loading, refresh } = useBookings(true);
  const [filter, setFilter] = useState<(typeof filters)[number]>('all');
  const visible = filter === 'all' ? bookings : bookings.filter((item) => item.status === filter);
  if (loading) return <Screen><LoadingBlock /></Screen>;
  return (
    <Screen>
      <Title>إدارة الحجوزات</Title>
      <View style={styles.filters}>{filters.map((item) => <Pressable key={item} onPress={() => setFilter(item)} style={[styles.filter, filter === item && styles.active]}><Text style={[styles.filterText, filter === item && styles.activeText]}>{labels[item]}</Text></Pressable>)}</View>
      {visible.length ? visible.map((booking) => <View key={booking.id} style={styles.bookingWrap}><BookingCard booking={booking} onChanged={refresh} /><AppButton title="تفاصيل المستخدم" variant="secondary" onPress={() => router.push(`/(admin)/booking/${booking.id}`)} /></View>) : <Muted>لا توجد نتائج.</Muted>}
    </Screen>
  );
}

const styles = StyleSheet.create({
  filters: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 7 },
  filter: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1, borderColor: colors.border, backgroundColor: '#fff' },
  active: { borderColor: colors.primary, backgroundColor: colors.primary },
  filterText: { color: colors.text, fontWeight: '700' },
  activeText: { color: '#fff' },
  bookingWrap: { gap: 6 },
});

