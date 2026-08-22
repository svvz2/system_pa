import { Alert } from 'react-native';

import { AppButton, Card, Muted, Screen, SectionTitle, Title } from '@/components/ui';
import { useSession } from '@/providers/session';

export default function AdminProfileScreen() {
  const { profile, session, signOut } = useSession();
  return (
    <Screen>
      <Title>حساب الأدمن</Title>
      <Card><SectionTitle>{profile?.full_name ?? 'مدير النظام'}</SectionTitle><Muted>{session?.user.email}</Muted><Muted>صلاحية الإدارة تُحدد من الخادم ولا يمكن تغييرها من التطبيق.</Muted></Card>
      <AppButton title="تسجيل الخروج" variant="danger" onPress={() => Alert.alert('تسجيل الخروج', 'هل أنت متأكد؟', [{ text: 'رجوع' }, { text: 'خروج', style: 'destructive', onPress: signOut }])} />
    </Screen>
  );
}

