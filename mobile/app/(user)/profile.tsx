import { Alert, StyleSheet, Text } from 'react-native';
import { useState } from 'react';

import { AppButton, Card, Field, Muted, Screen, SectionTitle, Title } from '@/components/ui';
import { api } from '@/lib/api';
import { colors } from '@/lib/theme';
import { useSession } from '@/providers/session';

export default function ProfileScreen() {
  const { profile, vehicle, session, signOut, refreshProfile } = useSession();
  const [completion, setCompletion] = useState({ nationalId: '', plateNumber: '', makeModel: '', color: '' });
  const [saving, setSaving] = useState(false);
  const set = (key: keyof typeof completion) => (value: string) => setCompletion((current) => ({ ...current, [key]: value }));
  return (
    <Screen>
      <Title>حسابي</Title>
      <Card>
        <SectionTitle>{profile?.full_name ?? 'مستخدم'}</SectionTitle>
        <Row label="البريد" value={session?.user.email ?? ''} />
        <Row label="الهاتف" value={profile?.phone ?? ''} />
        <Row label="الهوية" value={profile?.national_id_last4 ? `•••• ${profile.national_id_last4}` : 'غير مكتملة'} />
      </Card>
      {!profile?.profile_complete ? (
        <Card>
          <SectionTitle>إكمال الملف</SectionTitle>
          <Muted>هذا النموذج يظهر بعد تأكيد البريد إذا لم تُحفظ بيانات التسجيل الأولى.</Muted>
          <Field label="رقم الهوية التجريبي" value={completion.nationalId} onChangeText={set('nationalId')} keyboardType="number-pad" />
          <Field label="رقم اللوحة" value={completion.plateNumber} onChangeText={set('plateNumber')} />
          <Field label="نوع/موديل السيارة" value={completion.makeModel} onChangeText={set('makeModel')} />
          <Field label="لون السيارة" value={completion.color} onChangeText={set('color')} />
          <AppButton title="حفظ وإكمال الملف" loading={saving} onPress={async () => {
            setSaving(true);
            try {
              await api.registerProfile({
                fullName: profile?.full_name ?? '',
                phone: profile?.phone ?? '',
                ...completion,
              });
              await refreshProfile();
              Alert.alert('تم', 'أصبح حسابك جاهزاً للحجز');
            } catch (error) {
              Alert.alert('تعذر الحفظ', error instanceof Error ? error.message : 'خطأ غير معروف');
            } finally { setSaving(false); }
          }} />
        </Card>
      ) : null}
      <Card>
        <SectionTitle>السيارة الرئيسية</SectionTitle>
        {vehicle ? (
          <>
            <Row label="رقم اللوحة" value={vehicle.plate_number} />
            <Row label="النوع" value={vehicle.make_model} />
            <Row label="اللون" value={vehicle.color} />
          </>
        ) : <Muted>لا توجد سيارة مسجلة.</Muted>}
      </Card>
      <AppButton title="تسجيل الخروج" variant="danger" onPress={() => Alert.alert('تسجيل الخروج', 'هل أنت متأكد؟', [{ text: 'رجوع' }, { text: 'خروج', style: 'destructive', onPress: signOut }])} />
    </Screen>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return <Text style={styles.row}><Text style={styles.value}>{value}</Text>  {label}</Text>;
}

const styles = StyleSheet.create({
  row: { color: colors.muted, textAlign: 'right', writingDirection: 'rtl', lineHeight: 26 },
  value: { color: colors.text, fontWeight: '700' },
});
