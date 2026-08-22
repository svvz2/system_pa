import { encryptNationalId, hmacHex } from '../_shared/crypto.ts';
import { errorResponse, json, options } from '../_shared/cors.ts';
import { adminClient, authenticatedClient } from '../_shared/supabase.ts';

Deno.serve(async (req) => {
  const preflight = options(req); if (preflight) return preflight;
  try {
    const { user } = await authenticatedClient(req);
    const body = await req.json();
    const fullName = String(body.fullName ?? '').trim();
    const phone = String(body.phone ?? '').trim();
    const nationalId = String(body.nationalId ?? '').replace(/\s/g, '');
    const plateNumber = String(body.plateNumber ?? '').trim();
    const makeModel = String(body.makeModel ?? '').trim();
    const color = String(body.color ?? '').trim();
    if (!fullName || !phone || !plateNumber || !makeModel || !color) throw new Error('جميع بيانات المستخدم والسيارة مطلوبة');
    if (!/^\d{8,20}$/.test(nationalId)) throw new Error('رقم الهوية يجب أن يتكون من 8 إلى 20 رقماً');

    const encryptionKey = Deno.env.get('PII_ENCRYPTION_KEY');
    const hmacKey = Deno.env.get('PII_HMAC_KEY');
    if (!encryptionKey || !hmacKey) throw new Error('مفاتيح تشفير الهوية غير مضبوطة على الخادم');
    const encrypted = await encryptNationalId(nationalId, encryptionKey);
    const digest = await hmacHex(hmacKey, nationalId);
    const normalizedPlate = plateNumber.toUpperCase().replace(/[\s-]/g, '');
    const admin = adminClient();

    const { error: profileError } = await admin.from('profiles').upsert({
      id: user.id,
      full_name: fullName,
      phone,
      national_id_last4: nationalId.slice(-4),
      profile_complete: true,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'id' });
    if (profileError) throw profileError;

    const { error: privateError } = await admin.from('profile_private').upsert({
      user_id: user.id,
      national_id_ciphertext: encrypted.ciphertext,
      national_id_iv: encrypted.iv,
      national_id_hmac: digest,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' });
    if (privateError) throw privateError;

    await admin.from('vehicles').update({ is_primary: false }).eq('user_id', user.id);
    const { data: vehicle, error: vehicleError } = await admin.from('vehicles').upsert({
      user_id: user.id,
      plate_number: plateNumber,
      plate_normalized: normalizedPlate,
      make_model: makeModel,
      color,
      is_primary: true,
    }, { onConflict: 'user_id,plate_normalized' }).select('id').single();
    if (vehicleError) throw vehicleError;

    await admin.from('audit_logs').insert({ actor_user_id: user.id, action: 'profile.completed', target_type: 'profile', target_id: user.id });
    return json({ profileId: user.id, vehicleId: vehicle.id });
  } catch (error) {
    return errorResponse(error);
  }
});

