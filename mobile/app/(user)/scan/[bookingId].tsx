import { CameraView, useCameraPermissions } from 'expo-camera';
import { router, useLocalSearchParams } from 'expo-router';
import { Alert, Platform, StyleSheet, Text, View } from 'react-native';
import { useState } from 'react';

import { AppButton, Screen } from '@/components/ui';
import { api } from '@/lib/api';
import { colors } from '@/lib/theme';

export default function ScanScreen() {
  const { bookingId } = useLocalSearchParams<{ bookingId: string }>();
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const webCameraBlocked =
    Platform.OS === 'web' && typeof window !== 'undefined' && !window.isSecureContext;

  const handleQr = async (data: string) => {
    if (scanned) return;
    setFeedback(null);
    setScanned(true);
    if (!data.startsWith('parking://gate/') || !data.includes('side=entry')) {
      const message = 'هذا الرمز لا يخص مدخل الكراج';
      if (Platform.OS === 'web') setFeedback({ kind: 'error', text: message });
      else Alert.alert('QR غير صحيح', message);
      setScanned(false);
      return;
    }
    try {
      const result = await api.requestEntry(bookingId, data);
      if (Platform.OS === 'web') {
        setFeedback({
          kind: 'success',
          text: `تم إرسال أمر فتح البوابة. توجه إلى الموقف P${result.slotNumber}`,
        });
        setScanned(false);
      }
      else {
        Alert.alert('تم قبول الدخول', `توجه إلى الموقف P${result.slotNumber}`, [
          { text: 'تم', onPress: () => router.replace('/(user)') },
        ]);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'خطأ غير معروف';
      if (Platform.OS === 'web') setFeedback({ kind: 'error', text: message });
      else Alert.alert('لم تفتح البوابة', message);
      setScanned(false);
    }
  };

  if (webCameraBlocked) {
    return (
      <Screen style={styles.center}>
        <Text style={styles.message}>
          Safari يمنع الكاميرا على عنوان HTTP محلي. استخدم زر المحاكاة لفحص دورة الدخول، أو افتح التطبيق من Expo Go لاستخدام الكاميرا الحقيقية.
        </Text>
        <AppButton
          title="محاكاة مسح QR الصحيح"
          loading={scanned}
          disabled={feedback?.kind === 'success'}
          onPress={() => handleQr('parking://gate/20000000-0000-4000-8000-000000000001?v=1&side=entry')}
        />
        {feedback ? (
          <Text style={[styles.feedback, feedback.kind === 'success' ? styles.feedbackSuccess : styles.feedbackError]}>
            {feedback.text}
          </Text>
        ) : null}
        <AppButton title="رجوع" variant="secondary" onPress={() => router.back()} />
      </Screen>
    );
  }

  if (!permission) return <Screen />;
  if (!permission.granted) {
    return <Screen style={styles.center}><Text style={styles.message}>نحتاج إذن الكاميرا لمسح QR الموجود عند مدخل الكراج.</Text><AppButton title="السماح بالكاميرا" onPress={requestPermission} /></Screen>;
  }

  return (
    <View style={styles.cameraWrap}>
      <CameraView
        style={StyleSheet.absoluteFill}
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        onBarcodeScanned={scanned ? undefined : ({ data }) => void handleQr(data)}
      />
      <View style={styles.overlay}>
        <Text style={styles.scanText}>ضع رمز QR داخل الإطار</Text>
        <View style={styles.frame} />
        <AppButton title="رجوع" variant="secondary" onPress={() => router.back()} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  cameraWrap: { flex: 1, backgroundColor: '#000' },
  overlay: { flex: 1, justifyContent: 'space-around', alignItems: 'center', padding: 30, backgroundColor: '#00000033' },
  frame: { width: 260, height: 260, borderWidth: 4, borderColor: colors.accent, borderRadius: 24 },
  scanText: { color: '#fff', fontSize: 20, fontWeight: '800', backgroundColor: '#0009', padding: 12, borderRadius: 10 },
  center: { justifyContent: 'center' },
  message: { color: colors.text, textAlign: 'center', fontSize: 18, lineHeight: 28 },
  feedback: { textAlign: 'center', fontSize: 16, fontWeight: '800', lineHeight: 24, padding: 12, borderRadius: 10 },
  feedbackSuccess: { color: colors.success, backgroundColor: '#E9F9F1' },
  feedbackError: { color: colors.danger, backgroundColor: '#FFF0F0' },
});
