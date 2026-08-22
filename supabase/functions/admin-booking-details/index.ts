import { decryptNationalId } from '../_shared/crypto.ts';
import { errorResponse, json, options } from '../_shared/cors.ts';
import { adminClient, requireAdmin } from '../_shared/supabase.ts';

Deno.serve(async (req) => {
  const preflight = options(req); if (preflight) return preflight;
  try {
    const { user } = await requireAdmin(req);
    const { bookingId, reason } = await req.json();
    if (!bookingId) throw new Error('معرف الحجز مطلوب');
    if (String(reason ?? '').trim().length < 4) throw new Error('سبب عرض البيانات مطلوب');
    const admin = adminClient();
    const { data: booking, error } = await admin.from('bookings').select(
      'id,user_id,start_at,end_at,status,contact_snapshot,slot:parking_slots(slot_number,display_name),vehicle:vehicles(plate_number,make_model,color),profile:profiles(full_name,phone,national_id_last4)',
    ).eq('id', bookingId).single();
    if (error) throw error;
    const { data: privateRow, error: privateError } = await admin.from('profile_private').select('national_id_ciphertext,national_id_iv').eq('user_id', booking.user_id).single();
    if (privateError) throw privateError;
    const key = Deno.env.get('PII_ENCRYPTION_KEY');
    if (!key) throw new Error('مفتاح فك تشفير الهوية غير مضبوط');
    const nationalId = await decryptNationalId(privateRow.national_id_ciphertext, privateRow.national_id_iv, key);
    await admin.from('audit_logs').insert({
      actor_user_id: user.id,
      action: 'pii.national_id_revealed',
      target_type: 'booking',
      target_id: bookingId,
      metadata: { reason: String(reason).trim(), subjectUserId: booking.user_id },
    });
    return json({ ...booking, nationalId });
  } catch (error) {
    return errorResponse(error);
  }
});

