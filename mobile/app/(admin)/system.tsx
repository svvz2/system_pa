import { Alert, StyleSheet, Text, View } from 'react-native';
import { useState } from 'react';

import { AppButton, Card, Field, Muted, Screen, SectionTitle, StatusPill, Title } from '@/components/ui';
import { useGarage } from '@/hooks/use-garage';
import { api } from '@/lib/api';
import { formatDateTime, gateStateLabel } from '@/lib/format';
import { colors } from '@/lib/theme';

export default function SystemScreen() {
  const { device, slots } = useGarage();
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);

  const command = async (type: string, payload: Record<string, unknown> = {}) => {
    if (reason.trim().length < 4) return Alert.alert('السبب مطلوب', 'اكتب سبباً واضحاً لا يقل عن أربعة أحرف');
    setLoading(true);
    try {
      await api.adminCommand(type, reason.trim(), payload);
      Alert.alert('تم إرسال الأمر', 'سينفذه ESP32 عند المزامنة التالية');
      setReason('');
    } catch (error) {
      Alert.alert('تعذر إرسال الأمر', error instanceof Error ? error.message : 'خطأ غير معروف');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen>
      <Title>حالة النظام والتحكم</Title>
      <Card>
        <View style={styles.row}><StatusPill label={device?.online ? 'متصل' : 'غير متصل'} color={device?.online ? colors.success : colors.danger} /><SectionTitle>{device?.name ?? 'ESP32 الرئيسي'}</SectionTitle></View>
        <Text style={styles.item}>حالة البوابة: {gateStateLabel[device?.gate_state ?? 'closed']}</Text>
        <Text style={styles.item}>آخر اتصال: {device?.last_seen_at ? formatDateTime(device.last_seen_at) : 'لا يوجد'}</Text>
        <Text style={styles.item}>Firmware: {device?.firmware_version ?? '—'}</Text>
      </Card>
      <Card>
        <SectionTitle>أمر إداري</SectionTitle>
        <Muted>كل أمر يحتاج سبباً ويُحفظ في سجل التدقيق.</Muted>
        <Field label="سبب الأمر" value={reason} onChangeText={setReason} />
        <AppButton title="فتح البوابة يدوياً" onPress={() => command('open_gate')} loading={loading} />
      </Card>
      <Card>
        <SectionTitle>معايرة وتعطيل المواقف</SectionTitle>
        {slots.map((slot) => (
          <View key={slot.id} style={styles.slotRow}>
            <Text style={styles.slotName}>{slot.display_name}</Text>
            <View style={styles.slotButtons}>
              <AppButton title="معايرة" variant="secondary" onPress={() => command('calibrate_slot', { slotId: slot.id })} />
              <AppButton title={slot.state === 'disabled' ? 'تفعيل' : 'تعطيل'} variant="secondary" onPress={() => command('toggle_slot', { slotId: slot.id })} />
            </View>
          </View>
        ))}
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  item: { color: colors.text, textAlign: 'right', writingDirection: 'rtl' },
  slotRow: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 10, gap: 8 },
  slotName: { color: colors.text, fontWeight: '900', textAlign: 'right' },
  slotButtons: { gap: 7 },
});

