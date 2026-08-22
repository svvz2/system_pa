import { Link, router } from 'expo-router';
import { Alert, StyleSheet } from 'react-native';
import { useState } from 'react';

import { api } from '@/lib/api';
import { supabase } from '@/lib/supabase';
import { AppButton, Card, Field, Muted, Screen, Title } from '@/components/ui';

const initial = {
  fullName: '',
  email: '',
  password: '',
  phone: '',
  nationalId: '',
  plateNumber: '',
  makeModel: '',
  color: '',
};

export default function SignUpScreen() {
  const [form, setForm] = useState(initial);
  const [loading, setLoading] = useState(false);
  const set = (key: keyof typeof form) => (value: string) => setForm((current) => ({ ...current, [key]: value }));

  const submit = async () => {
    if (Object.values(form).some((value) => !value.trim())) {
      return Alert.alert('بيانات ناقصة', 'أكمل جميع الحقول قبل إنشاء الحساب');
    }
    if (form.password.length < 8) return Alert.alert('كلمة المرور', 'يجب أن تكون 8 محارف على الأقل');
    if (!/^\d{8,20}$/.test(form.nationalId)) return Alert.alert('رقم الهوية', 'أدخل من 8 إلى 20 رقماً');

    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signUp({
        email: form.email.trim(),
        password: form.password,
        options: { data: { full_name: form.fullName.trim(), phone: form.phone.trim() } },
      });
      if (error) throw error;
      if (!data.session) {
        Alert.alert('أكد بريدك', 'بعد تأكيد البريد، سجل الدخول ثم أكمل بيانات الهوية والسيارة من الملف الشخصي.');
        router.replace('/(auth)');
        return;
      }
      await api.registerProfile({
        fullName: form.fullName.trim(),
        phone: form.phone.trim(),
        nationalId: form.nationalId,
        plateNumber: form.plateNumber.trim(),
        makeModel: form.makeModel.trim(),
        color: form.color.trim(),
      });
      Alert.alert('تم إنشاء الحساب', 'اكتمل تسجيل المستخدم والسيارة بنجاح');
      router.replace('/(user)');
    } catch (error) {
      Alert.alert('تعذر إنشاء الحساب', error instanceof Error ? error.message : 'خطأ غير معروف');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen>
      <Title>إنشاء حساب</Title>
      <Muted>استخدم بيانات تجريبية فقط لرقم الهوية في نسخة مشروع التخرج.</Muted>
      <Card>
        <Field label="الاسم الكامل" value={form.fullName} onChangeText={set('fullName')} />
        <Field label="البريد الإلكتروني" value={form.email} onChangeText={set('email')} autoCapitalize="none" keyboardType="email-address" />
        <Field label="كلمة المرور" value={form.password} onChangeText={set('password')} secureTextEntry />
        <Field label="رقم الهاتف" value={form.phone} onChangeText={set('phone')} keyboardType="phone-pad" />
        <Field label="رقم الهوية الوطنية (تجريبي)" value={form.nationalId} onChangeText={set('nationalId')} keyboardType="number-pad" />
        <Field label="رقم لوحة السيارة" value={form.plateNumber} onChangeText={set('plateNumber')} />
        <Field label="نوع/موديل السيارة" value={form.makeModel} onChangeText={set('makeModel')} />
        <Field label="لون السيارة" value={form.color} onChangeText={set('color')} />
        <AppButton title="إنشاء الحساب" onPress={submit} loading={loading} />
      </Card>
      <Link href="/(auth)" style={styles.link}>لديك حساب؟ تسجيل الدخول</Link>
    </Screen>
  );
}

const styles = StyleSheet.create({ link: { textAlign: 'center', padding: 12, fontWeight: '800' } });
