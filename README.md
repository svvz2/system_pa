# منظومة حجز كراج ذكي — مشروع تخرج

**الإصدار:** v1.0.0

![Wokwi Simulator Preview](docs/preview.jpg)

المستودع يحتوي تطبيق Expo للمستخدم والأدمن، Supabase/PostgreSQL، محاكي ESP32، Firmware PlatformIO، ودائرة Wokwi بستة مواقف.

## تشغيل الخادم محلياً

1. شغّل Docker Desktop.
2. انسخ `.env.example` إلى ملفات البيئة المناسبة، واستخدم أسراراً مختلفة وقوية.
3. شغّل:

```powershell
npx supabase start
npx supabase db reset
npx supabase functions serve --env-file supabase/.env.local
```

أنشئ `supabase/.env.local` وفيه `PII_ENCRYPTION_KEY` و`PII_HMAC_KEY` و`DEVICE_MASTER_SECRET`. بيئة Supabase المحلية للتطوير فقط ولا تُعرض للإنترنت.

## تشغيل تطبيق Expo

انسخ `mobile/.env.example` إلى `mobile/.env`، وخذ URL والمفتاح المنشور من `npx supabase status`، ثم:

```powershell
npm install
npm run mobile
```

على Android Emulator استخدم عنوان المضيف المناسب بدلاً من `127.0.0.1`، وعلى هاتف حقيقي استخدم IP اللابتوب داخل الشبكة. نسخة العرض النهائية تستخدم مشروع Supabase سحابياً.

## إنشاء الأدمن وQR

```powershell
$env:SUPABASE_URL='http://127.0.0.1:55321'
$env:SUPABASE_SECRET_KEY='local-secret-key-from-supabase-status'
$env:ADMIN_EMAIL='admin@example.com'
$env:ADMIN_PASSWORD='a-strong-demo-password'
npm run admin:create
npm run qr
```

ينتج QR في `docs/gate-entry-qr.svg` ويحمل معرّف البوابة فقط.

## تشغيل محاكي الجهاز

انسخ `simulator/.env.example` إلى `simulator/.env` واجعل `DEVICE_MASTER_SECRET` مطابقاً للخادم:

```powershell
npm run simulator
```

جرّب `slot 1 occupied` و`slot 1 free` و`entry` و`exit` و`offline` و`online`.

## Firmware وWokwi

راجع [تعليمات Firmware](firmware/README.md) و[التوصيل الكهربائي](docs/HARDWARE.md). بعد تثبيت PlatformIO:

```powershell
cd firmware
pio run
```

ثم افتح `firmware/diagram.json` بواسطة Wokwi. لا تضع مفتاح إنتاج داخل مشروع Wokwi عام.

## التحقق

```powershell
npm run typecheck
npm test
npx expo install --check
```

تفاصيل الثقة والبروتوكول في [ARCHITECTURE.md](docs/ARCHITECTURE.md). توجد تحذيرات `npm audit` داخل سلسلة أدوات Expo/Metro الحالية؛ اقتراح npm الآلي يرجع Expo إلى إصدار أقدم، لذلك يجب انتظار تحديث متوافق وعدم تشغيل `npm audit fix --force`.
