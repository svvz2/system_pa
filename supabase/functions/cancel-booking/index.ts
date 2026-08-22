import { errorResponse, json, options } from '../_shared/cors.ts';
import { authenticatedClient } from '../_shared/supabase.ts';

Deno.serve(async (req) => {
  const preflight = options(req); if (preflight) return preflight;
  try {
    const { client } = await authenticatedClient(req);
    const { bookingId } = await req.json();
    if (!bookingId) throw new Error('معرف الحجز مطلوب');
    const { data, error } = await client.rpc('cancel_booking', { p_booking_id: bookingId });
    if (error) throw error;
    const row = Array.isArray(data) ? data[0] : data;
    return json({ bookingId: row.id, status: row.status });
  } catch (error) {
    return errorResponse(error);
  }
});

