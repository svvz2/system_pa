import { Link } from 'expo-router';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { useState } from 'react';

import { AppButton, Card, Field, Muted, Screen, Title } from '@/components/ui';
import { colors } from '@/lib/theme';
import { supabase } from '@/lib/supabase';

export default function SignInScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const signIn = async () => {
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setLoading(false);
    if (error) Alert.alert('تعذر تسجيل الدخول', error.message);
  };

  const resetPassword = async () => {
    if (!email.trim()) return Alert.alert('أدخل البريد أولاً');
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim());
    Alert.alert(error ? 'تعذر الإرسال' : 'تم الإرسال', error?.message ?? 'راجع بريدك الإلكتروني');
  };

  return (
    <Screen style={styles.wrap}>
      <View style={styles.logo}>
        <Text style={styles.logoText}>P</Text>
      </View>
      <Title>الكراج الذكي</Title>
      <Muted>احجز موقفك واعرف مكان الركن قبل الوصول</Muted>
      <Card>
        <Field label="البريد الإلكتروني" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" />
        <Field label="كلمة المرور" value={password} onChangeText={setPassword} secureTextEntry />
        <AppButton title="تسجيل الدخول" onPress={signIn} loading={loading} />
        <AppButton title="نسيت كلمة المرور" variant="secondary" onPress={resetPassword} />
      </Card>
      <Link href="/(auth)/sign-up" style={styles.link}>
        إنشاء حساب مستخدم جديد
      </Link>
    </Screen>
  );
}

const styles = StyleSheet.create({
  wrap: { justifyContent: 'center' },
  logo: { alignSelf: 'center', width: 84, height: 84, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary },
  logoText: { color: '#fff', fontSize: 52, fontWeight: '900' },
  link: { color: colors.primary, textAlign: 'center', fontWeight: '800', padding: 12 },
});

