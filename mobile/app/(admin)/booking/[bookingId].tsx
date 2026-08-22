import { router, useLocalSearchParams } from 'expo-router';
import { Alert, StyleSheet, Text } from 'react-native';
import { useState } from 'react';

import { AppButton, Card, Field, Muted, Screen, SectionTitle, Title } from '@/components/ui';
import { api } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import { colors } from '@/lib/theme';

type Details = Awaited<ReturnType<typeof api.adminBookingDetails>>;

export default function AdminBookingDetailsScreen() {
  const { bookingId } = useLocalSearchParams<{ bookingId: string }>();
  const [reason, setReason] = useState('مراجعة حجز المستخدم');
  const [details, setDetails] = useState<Details | null>(null);
  const [loading, setLoading] = useState(false);

  const reveal = async () => {
    setLoading(true);
    try { setDetails(await api.adminBookingDetails(bookingId, reason)); }
    catch (error) { Alert.alert('تعذر عرض البيانات', error instanceof Error ? error.message : 'خطأ غير معروف'); }
    finally { setLoading(false); }
  };

  return (
    <Screen>
      <Title>تفاصيل صاحب الحجز</Title>
      <Muted>عرض الهوية إجراء حساس ويُسجل مع السبب ووقت المشاهدة.</Muted>
      {!details ? (
        <Card><Field label="سبب عرض الهوية" value={reason} onChangeText={setReason} /><AppButton title="عرض التفاصيل" onPress={reveal} loading={loading} /></Card>
      ) : (
        <>
          <Card>
            <SectionTitle>{details.profile.full_name}</SectionTitle>
            <Row label="الهاتف" value={details.profile.phone} />
            <Row label="الهوية الوطنية" value={details.nationalId} sensitive />
          </Card>
          <Card>
            <SectionTitle>السيارة والموقف</SectionTitle>
            <Row label="اللوحة" value={details.vehicle.plate_number} />
            <Row label="السيارة" value={details.vehicle.make_model} />
            <Row label="اللون" value={details.vehicle.color} />
            <Row label="الموقف" value={details.slot.display_name} />
          </Card>
          <Card><Row label="البداية" value={formatDateTime(details.start_at)} /><Row label="النهاية" value={formatDateTime(details.end_at)} /><Row label="الحالة" value={details.status} /></Card>
        </>
      )}
      <AppButton title="رجوع" variant="secondary" onPress={() => router.back()} />
    </Screen>
  );
}

function Row({ label, value, sensitive = false }: { label: string; value: string; sensitive?: boolean }) {
  return <Text selectable={sensitive} style={[styles.row, sensitive && styles.sensitive]}>{label}: <Text style={styles.value}>{value}</Text></Text>;
}

const styles = StyleSheet.create({
  row: { color: colors.muted, textAlign: 'right', writingDirection: 'rtl', lineHeight: 26 },
  value: { color: colors.text, fontWeight: '800' },
  sensitive: { backgroundColor: '#FFF2D8', padding: 8, borderRadius: 8 },
});

