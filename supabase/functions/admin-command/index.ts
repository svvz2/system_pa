import { errorResponse, json, options } from '../_shared/cors.ts';
import { adminClient, requireAdmin } from '../_shared/supabase.ts';

const allowed = new Set(['open_gate', 'calibrate_slot', 'toggle_slot']);

Deno.serve(async (req) => {
  const preflight = options(req); if (preflight) return preflight;
  try {
    const { user } = await requireAdmin(req);
    const { type, reason, payload = {}, idempotencyKey } = await req.json();
    if (!allowed.has(type)) throw new Error('نوع الأمر غير مسموح');
    if (String(reason ?? '').trim().length < 4) throw new Error('سبب الأمر مطلوب');
    const admin = adminClient();
    const { data: device, error: deviceError } = await admin.from('devices').select('id').eq('enabled', true).order('created_at').limit(1).single();
    if (deviceError) throw deviceError;

    if (type === 'toggle_slot' && payload.slotId) {
      const { data: slot, error: slotError } = await admin.from('parking_slots').select('enabled').eq('id', payload.slotId).single();
      if (slotError) throw slotError;
      await admin.from('parking_slots').update({ enabled: !slot.enabled, last_changed_at: new Date().toISOString() }).eq('id', payload.slotId);
    }

    const { data: command, error } = await admin.from('device_commands').insert({
      device_id: device.id,
      type,
      payload,
      requested_by: user.id,
      reason: String(reason).trim(),
      idempotency_key: idempotencyKey,
      expires_at: new Date(Date.now() + 30_000).toISOString(),
    }).select('id').single();
    if (error) throw error;
    await admin.from('audit_logs').insert({
      actor_user_id: user.id,
      action: `admin.${type}`,
      target_type: payload.slotId ? 'parking_slot' : 'device',
      target_id: payload.slotId ?? device.id,
      metadata: { reason, commandId: command.id, payload },
    });
    return json({ commandId: command.id });
  } catch (error) {
    return errorResponse(error);
  }
});

