import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { BookingCard } from '@/components/booking-card';
import { Card, LoadingBlock, Muted, Screen, SectionTitle, StatusPill, Title } from '@/components/ui';
import { useBookings } from '@/hooks/use-bookings';
import { useGarage } from '@/hooks/use-garage';
import { colors } from '@/lib/theme';
import { useSession } from '@/providers/session';

export default function HomeScreen() {
  const { profile } = useSession();
  const { slots, device, loading } = useGarage();
  const { bookings, refresh } = useBookings();
  const active = bookings.find((item) => ['confirmed', 'checked_in', 'overstayed'].includes(item.status));
  const available = slots.filter((slot) => slot.state === 'available').length;

  if (loading) return <Screen><LoadingBlock /></Screen>;
  return (
    <Screen>
      <Title>هلا {profile?.full_name?.split(' ')[0] ?? ''}</Title>
      <Muted>حالة الكراج تتحدث مباشرة من الحساسات</Muted>
      <View style={styles.stats}>
        <Card style={styles.statCard}>
          <Text style={styles.statNumber}>{available}</Text>
          <Text style={styles.statLabel}>مواقف متاحة</Text>
        </Card>
        <Card style={styles.statCard}>
          <StatusPill label={device?.online ? 'الجهاز متصل' : 'الجهاز غير متصل'} color={device?.online ? colors.success : colors.danger} />
          <Text style={styles.statLabel}>بوابة الكراج</Text>
        </Card>
      </View>
      {!profile?.profile_complete ? (
        <Card style={styles.warning}>
          <SectionTitle>الملف غير مكتمل</SectionTitle>
          <Muted>أكمل بيانات الهوية والسيارة قبل إنشاء حجز.</Muted>
        </Card>
      ) : null}
      <SectionTitle>الحجز النشط</SectionTitle>
      {active ? (
        <BookingCard
          booking={active}
          onChanged={refresh}
          onScan={() => router.push(`/(user)/scan/${active.id}`)}
        />
      ) : (
        <Card><Muted>لا يوجد حجز نشط حالياً. انتقل إلى “حجز جديد”.</Muted></Card>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  stats: { flexDirection: 'row-reverse', gap: 10 },
  statCard: { flex: 1, minHeight: 115, justifyContent: 'center', alignItems: 'center' },
  statNumber: { color: colors.primary, fontSize: 42, fontWeight: '900' },
  statLabel: { color: colors.muted, fontWeight: '700', textAlign: 'center' },
  warning: { borderColor: colors.warning, backgroundColor: '#FFF9E9' },
});

