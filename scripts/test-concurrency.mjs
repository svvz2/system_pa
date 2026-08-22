import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
const publishable = process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_ANON_KEY;
if (!url || !secret || !publishable) throw new Error('Set SUPABASE_URL, SUPABASE_SECRET_KEY and SUPABASE_PUBLISHABLE_KEY');

const admin = createClient(url, secret, { auth: { persistSession: false } });
const createdUsers = [];
const start = new Date();
start.setUTCMinutes(0, 0, 0);
start.setUTCHours(start.getUTCHours() + 3);
const end = new Date(start.getTime() + 60 * 60_000);

try {
  const clients = [];
  for (let index = 0; index < 20; index++) {
    const email = `concurrency-${Date.now()}-${index}@example.test`;
    const password = `Test-password-${index}-123!`;
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: `Test ${index}`, phone: `0700000${String(index).padStart(3, '0')}` },
    });
    if (error) throw error;
    createdUsers.push(data.user.id);
    await admin.from('profiles').update({ profile_complete: true }).eq('id', data.user.id);
    const { data: vehicle, error: vehicleError } = await admin.from('vehicles').insert({
      user_id: data.user.id,
      plate_number: `TEST-${index}`,
      plate_normalized: `TEST${index}`,
      make_model: 'Simulator',
      color: 'White',
      is_primary: true,
    }).select('id').single();
    if (vehicleError) throw vehicleError;
    const client = createClient(url, publishable, { auth: { persistSession: false } });
    const { error: signInError } = await client.auth.signInWithPassword({ email, password });
    if (signInError) throw signInError;
    clients.push({ client, vehicleId: vehicle.id });
  }

  const results = await Promise.all(clients.map(({ client, vehicleId }) => client.rpc('create_booking', {
    p_vehicle_id: vehicleId,
    p_start_at: start.toISOString(),
    p_end_at: end.toISOString(),
  })));
  const successful = results.filter((result) => !result.error);
  const slotIds = successful.map((result) => (Array.isArray(result.data) ? result.data[0] : result.data)?.slot_id);
  const uniqueSlots = new Set(slotIds);
  if (successful.length !== 6 || uniqueSlots.size !== 6) {
    throw new Error(`Expected 6 unique successful bookings, got success=${successful.length}, uniqueSlots=${uniqueSlots.size}`);
  }
  process.stdout.write(`PASS: 20 concurrent requests produced exactly 6 unique bookings for ${start.toISOString()}\n`);
} finally {
  if (createdUsers.length) await admin.from('bookings').delete().in('user_id', createdUsers);
  for (const userId of createdUsers) await admin.auth.admin.deleteUser(userId);
}
