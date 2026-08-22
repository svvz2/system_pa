import { errorResponse, json, options } from '../_shared/cors.ts';
import { authenticatedClient } from '../_shared/supabase.ts';

Deno.serve(async (req) => {
  const preflight = options(req); if (preflight) return preflight;
  try {
    const { client } = await authenticatedClient(req);
    const { bookingId, qrPayload, idempotencyKey } = await req.json();
    if (!bookingId || !qrPayload || !idempotencyKey) throw new Error('طلب الدخول ناقص');
    let parsed: URL;
    try { parsed = new URL(String(qrPayload)); } catch { throw new Error('QR غير صالح'); }
    const gateId = parsed.pathname.replace(/^\//, '');
    if (parsed.protocol !== 'parking:' || parsed.hostname !== 'gate' || parsed.searchParams.get('v') !== '1' || parsed.searchParams.get('side') !== 'entry') {
      throw new Error('QR لا يخص مدخل الكراج');
    }
    const { data, error } = await client.rpc('request_entry', {
      p_booking_id: bookingId,
      p_gate_public_id: gateId,
      p_idempotency_key: idempotencyKey,
    });
    if (error) throw error;
    const row = Array.isArray(data) ? data[0] : data;
    return json({ commandId: row.command_id, slotNumber: row.slot_number, expiresAt: row.expires_at });
  } catch (error) {
    return errorResponse(error);
  }
});

