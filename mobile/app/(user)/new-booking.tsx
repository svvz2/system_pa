import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { router } from 'expo-router';
import { Alert, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useMemo, useState } from 'react';

import { AppButton, Card, Muted, Screen, SectionTitle, Title } from '@/components/ui';
import { api } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import { scheduleBookingReminders } from '@/lib/notifications';
import { colors } from '@/lib/theme';
import { useSession } from '@/providers/session';

type Picker = { target: 'start' | 'end'; mode: 'date' | 'time' } | null;

function nextQuarter() {
  const date = new Date(Date.now() + 30 * 60_000);
  date.setMinutes(Math.ceil(date.getMinutes() / 15) * 15, 0, 0);
  return date;
}

export default function NewBookingScreen() {
  const { profile, vehicle } = useSession();
  const initialStart = useMemo(nextQuarter, []);
  const [start, setStart] = useState(initialStart);
  const [end, setEnd] = useState(new Date(initialStart.getTime() + 60 * 60_000));
  const [picker, setPicker] = useState<Picker>(null);
  const [loading, setLoading] = useState(false);

  const onChange = (event: DateTimePickerEvent, value?: Date) => {
    if (Platform.OS === 'android') setPicker(null);
    if (!value || event.type === 'dismissed' || !picker) return;
    const current = picker.target === 'start' ? start : end;
    const merged = new Date(current);
    if (picker.mode === 'date') merged.setFullYear(value.getFullYear(), value.getMonth(), value.getDate());
    else merged.setHours(value.getHours(), value.getMinutes(), 0, 0);
    if (picker.target === 'start') setStart(merged);
    else setEnd(merged);
  };

  const submit = async () => {
    if (!profile?.profile_complete || !vehicle) return Alert.alert('الملف غير مكتمل', 'أكمل الهوية والسيارة أولاً');
    if (end <= start) return Alert.alert('وقت غير صالح', 'وقت النهاية يجب أن يكون بعد البداية');
    setLoading(true);
    try {
      const result = await api.createBooking(vehicle.id, start.toISOString(), end.toISOString());
      await scheduleBookingReminders(result.booking.id, result.booking.start_at);
      Alert.alert('تم تأكيد الحجز', `موقفك هو ${result.booking.slot?.display_name ?? ''}`);
      router.replace('/(user)/bookings');
    } catch (error) {
      Alert.alert('تعذر الحجز', error instanceof Error ? error.message : 'خطأ غير معروف');
    } finally {
      setLoading(false);
    }
  };

  const DateRow = ({ target, value }: { target: 'start' | 'end'; value: Date }) => (
    <View style={styles.dateRow}>
      <Pressable style={styles.dateButton} onPress={() => setPicker({ target, mode: 'date' })}>
        <Text style={styles.dateText}>التاريخ</Text>
      </Pressable>
      <Pressable style={styles.dateButton} onPress={() => setPicker({ target, mode: 'time' })}>
        <Text style={styles.dateText}>الوقت</Text>
      </Pressable>
      <Text style={styles.value}>{formatDateTime(value)}</Text>
    </View>
  );

  return (
    <Screen>
      <Title>حجز موقف</Title>
      <Muted>سيختار النظام موقفاً متاحاً طوال الفترة بصورة تلقائية.</Muted>
      <Card>
        <SectionTitle>وقت البداية</SectionTitle>
        <DateRow target="start" value={start} />
        <SectionTitle>وقت النهاية</SectionTitle>
        <DateRow target="end" value={end} />
        {picker ? (
          <DateTimePicker value={picker.target === 'start' ? start : end} mode={picker.mode} minuteInterval={15} onChange={onChange} />
        ) : null}
      </Card>
      <Card>
        <SectionTitle>بيانات السيارة</SectionTitle>
        <Text style={styles.summary}>{vehicle ? `${vehicle.plate_number} · ${vehicle.make_model} · ${vehicle.color}` : 'الملف غير مكتمل'}</Text>
        <Text style={styles.summary}>المدة: {Math.round((end.getTime() - start.getTime()) / 60_000)} دقيقة</Text>
      </Card>
      <AppButton title="تأكيد الحجز" onPress={submit} loading={loading} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  dateRow: { gap: 8 },
  dateButton: { backgroundColor: '#E8F3EF', borderRadius: 10, padding: 10, alignItems: 'center' },
  dateText: { color: colors.primary, fontWeight: '800' },
  value: { color: colors.text, textAlign: 'right', fontSize: 16, fontWeight: '700' },
  summary: { color: colors.text, textAlign: 'right', writingDirection: 'rtl' },
});

