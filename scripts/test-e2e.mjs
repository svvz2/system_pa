import { createHmac, randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY;
const publishable = process.env.SUPABASE_PUBLISHABLE_KEY;
const master = process.env.DEVICE_MASTER_SECRET;
const deviceId = '30000000-0000-4000-8000-000000000001';
if (!url || !secret || !publishable || !master) throw new Error('Missing Supabase/device test environment');

const admin = createClient(url, secret, { auth: { persistSession: false } });
const client = createClient(url, publishable, { auth: { persistSession: false } });
const email = `e2e-${Date.now()}@example.test`;
const password = 'E2e-test-password-123!';
const nationalId = String(Date.now()).slice(-12);
let userId;
let adminUserId;
let seq = 0;
const bootId = randomUUID();
const deviceKey = createHmac('sha256', master).update(deviceId).digest();
let eventCounter = 0;
const slots = Array.from({ length: 6 }, (_, index) => ({ slotNumber: index + 1, distanceCm: 100, occupied: false, health: 'ok' }));

async function invokeWith(targetClient, name, body) {
  const { data, error } = await targetClient.functions.invoke(name, { body });
  if (error) {
    let detail = error.message;
    try { detail = JSON.stringify(await error.context.clone().json()); } catch { /* keep message */ }
    throw new Error(`${name}: ${detail}`);
  }
  return data;
}

const invoke = (name, body) => invokeWith(client, name, body);

async function deviceSync(events = [], commandResults = []) {
  const body = { deviceId, bootId, seq: seq++, firmwareVersion: 'e2e-test', gateState: 'closed', slots, events, commandResults };
  const raw = JSON.stringify(body);
  const signature = createHmac('sha256', deviceKey).update(`${bootId}.${body.seq}.${raw}`).digest('hex');
  const response = await fetch(`${url}/functions/v1/device-sync`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-device-signature': signature, apikey: publishable },
    body: raw,
  });
  const result = await response.json();
  if (!response.ok) throw new Error(`device-sync ${response.status}: ${JSON.stringify(result)}`);
  return result;
}

function event(type, extra = {}) {
  return { eventKey: `${bootId}:${eventCounter++}`, type, occurredAt: new Date().toISOString(), ...extra };
}

try {
  const { data: created, error: createError } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: 'E2E User', phone: '07000000000' } });
  if (createError) throw createError;
  userId = created.user.id;
  const { error: signInError } = await client.auth.signInWithPassword({ email, password });
  if (signInError) throw signInError;

  const registered = await invoke('register-profile', {
    fullName: 'E2E User', phone: '07000000000', nationalId, plateNumber: `E2E-${nationalId.slice(-4)}`, makeModel: 'Test Car', color: 'White',
  });

  const start = new Date(Date.now() + 60_000);
  start.setUTCSeconds(0, 0);
  start.setUTCMinutes(Math.ceil(start.getUTCMinutes() / 15) * 15);
  const end = new Date(start.getTime() + 30 * 60_000);
  const createdBooking = await invoke('create-booking', { vehicleId: registered.vehicleId, startAt: start.toISOString(), endAt: end.toISOString() });
  const booking = createdBooking.booking;

  await deviceSync();
  const qrPayload = 'parking://gate/20000000-0000-4000-8000-000000000001?v=1&side=entry';
  const entry = await invoke('request-entry', { bookingId: booking.id, qrPayload, idempotencyKey: randomUUID() });
  const commandBatch = await deviceSync();
  if (!commandBatch.commands.some((command) => command.id === entry.commandId)) throw new Error('Entry command was not delivered to the device');

  const slotNumber = entry.slotNumber;
  slots[slotNumber - 1].occupied = true;
  slots[slotNumber - 1].distanceCm = 12;
  await deviceSync([event('entry_passage', { commandId: entry.commandId }), event('slot_occupied', { slotNumber })], [{ commandId: entry.commandId, status: 'executed' }]);

  slots[slotNumber - 1].occupied = false;
  slots[slotNumber - 1].distanceCm = 100;
  await deviceSync([event('slot_freed', { slotNumber }), event('exit_passage')]);

  const { data: completed, error: readError } = await client.from('bookings').select('status,checked_in_at,checked_out_at').eq('id', booking.id).single();
  if (readError) throw readError;
  if (completed.status !== 'completed' || !completed.checked_in_at || !completed.checked_out_at) throw new Error(`Unexpected final booking state: ${JSON.stringify(completed)}`);

  const adminEmail = `admin-e2e-${Date.now()}@example.test`;
  const adminPassword = 'Admin-e2e-password-123!';
  const { data: createdAdmin, error: adminCreateError } = await admin.auth.admin.createUser({ email: adminEmail, password: adminPassword, email_confirm: true, app_metadata: { role: 'admin' }, user_metadata: { full_name: 'E2E Admin', phone: '07000000001' } });
  if (adminCreateError) throw adminCreateError;
  adminUserId = createdAdmin.user.id;
  await admin.from('profiles').update({ role: 'admin' }).eq('id', adminUserId);
  const adminSession = createClient(url, publishable, { auth: { persistSession: false } });
  const { error: adminSignInError } = await adminSession.auth.signInWithPassword({ email: adminEmail, password: adminPassword });
  if (adminSignInError) throw adminSignInError;
  const adminCommand = await invokeWith(adminSession, 'admin-command', { type: 'open_gate', reason: 'E2E administrative test', payload: {}, idempotencyKey: randomUUID() });
  const revealed = await invokeWith(adminSession, 'admin-booking-details', { bookingId: booking.id, reason: 'E2E identity audit test' });
  if (revealed.nationalId !== nationalId) throw new Error('Encrypted national ID did not decrypt to the original value');
  const adminBatch = await deviceSync();
  if (!adminBatch.commands.some((command) => command.id === adminCommand.commandId)) throw new Error('Administrative gate command was not delivered');
  await deviceSync([], [{ commandId: adminCommand.commandId, status: 'executed' }]);
  const { count: auditCount } = await admin.from('audit_logs').select('*', { count: 'exact', head: true }).eq('actor_user_id', adminUserId).eq('action', 'admin.open_gate');
  if (auditCount !== 1) throw new Error('Administrative audit log was not written');
  process.stdout.write(`PASS: registration → booking → QR → entry → slot → exit completed on P${slotNumber}; admin command and PII reveal audited\n`);
} finally {
  if (userId) {
    await admin.from('bookings').delete().eq('user_id', userId);
    await admin.auth.admin.deleteUser(userId);
  }
  if (adminUserId) await admin.auth.admin.deleteUser(adminUserId);
}
