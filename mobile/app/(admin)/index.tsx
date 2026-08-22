import { StyleSheet, Text, View } from 'react-native';

import { Card, LoadingBlock, Muted, Screen, StatusPill, Title } from '@/components/ui';
import { useGarage } from '@/hooks/use-garage';
import { gateStateLabel } from '@/lib/format';
import { colors, slotColors } from '@/lib/theme';
import type { ParkingSlot } from '@/lib/types';

const slotLabel: Record<string, string> = {
  available: 'متاح',
  reserved: 'محجوز',
  occupied: 'مشغول',
  unexpected_occupied: 'إشغال غير متوقع',
  sensor_fault: 'عطل حساس',
  disabled: 'متوقف',
};

export default function AdminDashboard() {
  const { slots, device, loading } = useGarage();
  if (loading) return <Screen><LoadingBlock /></Screen>;
  return (
    <Screen>
      <Title>التوأم الرقمي للكراج</Title>
      <Card style={styles.gateCard}>
        <View style={styles.row}>
          <StatusPill label={device?.online ? 'ESP32 متصل' : 'ESP32 غير متصل'} color={device?.online ? colors.success : colors.danger} />
          <Text style={styles.gate}>البوابة: {gateStateLabel[device?.gate_state ?? 'closed']}</Text>
        </View>
        <Muted>إصدار البرنامج: {device?.firmware_version ?? 'غير معروف'}</Muted>
      </Card>
      <View style={styles.garage}>
        <View style={styles.slots}>
          {slots.map((slot) => <SlotTile key={slot.id} slot={slot} />)}
        </View>
        <View style={styles.road}><Text style={styles.arrow}>←   ←   ←</Text></View>
        <View style={styles.barrier}><Text style={styles.barrierText}>بوابة واحدة للدخول والخروج</Text></View>
      </View>
      <Card>
        <Text style={styles.legend}>🟢 متاح   🔵 محجوز   🔴 مشغول   🟡 تعارض   ⚫ عطل/متوقف</Text>
      </Card>
    </Screen>
  );
}

function SlotTile({ slot }: { slot: ParkingSlot }) {
  const color = slotColors[slot.state] ?? colors.disabled;
  return (
    <View style={[styles.slot, { borderColor: color, backgroundColor: `${color}18` }]}>
      <Text style={[styles.slotNumber, { color }]}>{slot.display_name}</Text>
      <Text style={styles.slotState}>{slotLabel[slot.state]}</Text>
      <Text style={styles.distance}>{slot.last_distance_cm == null ? '—' : `${slot.last_distance_cm.toFixed(1)} cm`}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  gateCard: { borderColor: colors.primary },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  gate: { color: colors.text, fontWeight: '800', textAlign: 'right' },
  garage: { borderWidth: 3, borderColor: '#424B47', borderRadius: 18, padding: 10, backgroundColor: '#CBD2CF', gap: 12 },
  slots: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 8 },
  slot: { width: '31%', minHeight: 112, borderWidth: 3, borderRadius: 12, alignItems: 'center', justifyContent: 'center', padding: 6 },
  slotNumber: { fontWeight: '900', fontSize: 22 },
  slotState: { color: colors.text, fontSize: 11, fontWeight: '700', textAlign: 'center' },
  distance: { color: colors.muted, fontSize: 10 },
  road: { height: 55, justifyContent: 'center', backgroundColor: '#6C7471', borderRadius: 8 },
  arrow: { color: '#fff', textAlign: 'center', fontSize: 28, fontWeight: '900' },
  barrier: { alignSelf: 'center', borderWidth: 4, borderColor: '#C93737', backgroundColor: '#fff', padding: 8, borderRadius: 8 },
  barrierText: { color: colors.text, fontWeight: '800' },
  legend: { color: colors.text, textAlign: 'center', writingDirection: 'rtl', lineHeight: 24 },
});

