import { errorResponse, json, options } from '../_shared/cors.ts';
import { authenticatedClient } from '../_shared/supabase.ts';

Deno.serve(async (req) => {
  const preflight = options(req); if (preflight) return preflight;
  try {
    const { client } = await authenticatedClient(req);
    const { vehicleId, startAt, endAt } = await req.json();
    if (!vehicleId || !startAt || !endAt) throw new Error('بيانات الحجز ناقصة');
    const { data, error } = await client.rpc('create_booking', {
      p_vehicle_id: vehicleId,
      p_start_at: startAt,
      p_end_at: endAt,
    });
    if (error) throw error;
    const row = Array.isArray(data) ? data[0] : data;
    const { data: booking, error: readError } = await client
      .from('bookings')
      .select('id,start_at,end_at,status,checked_in_at,checked_out_at,slot:parking_slots(slot_number,display_name),vehicle:vehicles(plate_number,make_model,color)')
      .eq('id', row.id)
      .single();
    if (readError) throw readError;
    return json({ booking });
  } catch (error) {
    return errorResponse(error);
  }
});

