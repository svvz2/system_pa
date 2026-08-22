import { Alert, StyleSheet, Text, View } from 'react-native';

import { AppButton, Card, StatusPill } from './ui';
import { api } from '@/lib/api';
import { bookingStatusLabel, formatDateTime } from '@/lib/format';
import { colors } from '@/lib/theme';
import type { Booking } from '@/lib/types';

const statusColor: Record<string, string> = {
  confirmed: colors.info,
  checked_in: colors.success,
  overstayed: colors.warning,
  completed: colors.muted,
  cancelled: colors.danger,
  no_show: colors.disabled,
};

export function BookingCard({
  booking,
  onChanged,
  onScan,
  compact = false,
}: {
  booking: Booking;
  onChanged?: () => void;
  onScan?: () => void;
  compact?: boolean;
}) {
  const cancellable = booking.status === 'confirmed';
  return (
    <Card>
      <View style={styles.row}>
        <StatusPill
          label={bookingStatusLabel[booking.status] ?? booking.status}
          color={statusColor[booking.status] ?? colors.muted}
        />
        <Text style={styles.slot}>{booking.slot?.display_name ?? 'لم يحدد'}</Text>
      </View>
      <Text style={styles.time}>من {formatDateTime(booking.start_at)}</Text>
      <Text style={styles.time}>إلى {formatDateTime(booking.end_at)}</Text>
      {!compact && booking.vehicle ? (
        <Text style={styles.vehicle}>
          {booking.vehicle.plate_number} · {booking.vehicle.make_model} · {booking.vehicle.color}
        </Text>
      ) : null}
      {onScan && booking.status === 'confirmed' ? (
        <AppButton title="مسح QR والدخول" onPress={onScan} />
      ) : null}
      {!compact && cancellable && onChanged ? (
        <AppButton
          title="إلغاء الحجز"
          variant="secondary"
          onPress={() =>
            Alert.alert('إلغاء الحجز', 'هل تريد إلغاء هذا الحجز؟', [
              { text: 'رجوع', style: 'cancel' },
              {
                text: 'إلغاء الحجز',
                style: 'destructive',
                onPress: async () => {
                  try {
                    await api.cancelBooking(booking.id);
                    onChanged();
                  } catch (error) {
                    Alert.alert('تعذر الإلغاء', error instanceof Error ? error.message : 'خطأ غير معروف');
                  }
                },
              },
            ])
          }
        />
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  slot: { color: colors.text, fontSize: 24, fontWeight: '900' },
  time: { color: colors.text, textAlign: 'right', writingDirection: 'rtl' },
  vehicle: { color: colors.muted, textAlign: 'right', writingDirection: 'rtl' },
});

