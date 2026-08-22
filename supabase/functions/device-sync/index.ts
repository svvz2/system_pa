import { verifyDeviceSignature } from '../_shared/crypto.ts';
import { errorResponse, json, options } from '../_shared/cors.ts';
import { adminClient } from '../_shared/supabase.ts';

type SlotReport = {
  slotNumber: number;
  distanceCm: number | null;
  occupied: boolean;
  health: 'ok' | 'fault' | 'unknown';
};

type DeviceEvent = {
  eventKey?: string;
  type: string;
  slotNumber?: number;
  commandId?: string;
  occurredAt?: string;
  metadata?: Record<string, unknown>;
};

type CommandResult = {
  commandId: string;
  status: 'acknowledged' | 'executed' | 'failed';
  reason?: string;
};

Deno.serve(async (req) => {
  const preflight = options(req); if (preflight) return preflight;
  try {
    if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
    const rawBody = await req.text();
    const body = JSON.parse(rawBody);
    const deviceId = String(body.deviceId ?? '').toLowerCase();
    const bootId = String(body.bootId ?? '').toLowerCase();
    const seq = Number(body.seq);
    const signature = req.headers.get('x-device-signature')?.toLowerCase() ?? '';
    if (!/^[0-9a-f-]{36}$/.test(deviceId) || !/^[0-9a-f-]{36}$/.test(bootId) || !Number.isSafeInteger(seq) || seq < 0) {
      throw new Error('هوية الجهاز أو التسلسل غير صالح');
    }
    const master = Deno.env.get('DEVICE_MASTER_SECRET');
    if (!master) throw new Error('DEVICE_MASTER_SECRET غير مضبوط');
    const signedMessage = `${bootId}.${seq}.${rawBody}`;
    if (!/^[0-9a-f]{64}$/.test(signature) || !(await verifyDeviceSignature(master, deviceId, signedMessage, signature))) {
      throw new Error('توقيع الجهاز غير صالح');
    }

    const admin = adminClient();
    const { data: accepted, error: seqError } = await admin.rpc('accept_device_sequence', {
      p_device_id: deviceId,
      p_boot_id: bootId,
      p_seq: seq,
    });
    if (seqError) throw seqError;
    if (!accepted) return json({ error: 'تسلسل مكرر أو جهاز متوقف' }, 409);

    const now = new Date().toISOString();
    const { data: device, error: deviceError } = await admin
      .from('devices')
      .update({
        last_seen_at: now,
        firmware_version: String(body.firmwareVersion ?? 'unknown').slice(0, 40),
        gate_state: body.gateState ?? 'fault',
      })
      .eq('id', deviceId)
      .eq('enabled', true)
      .select('id,garage_id')
      .single();
    if (deviceError) throw deviceError;

    const { data: slotRows, error: slotsError } = await admin
      .from('parking_slots')
      .select('id,slot_number,occupied,sensor_health,last_distance_cm')
      .eq('device_id', deviceId);
    if (slotsError) throw slotsError;
    const slotByNumber = new Map<number, (typeof slotRows)[number]>(slotRows.map((slot) => [slot.slot_number, slot]));

    for (const report of (body.slots ?? []) as SlotReport[]) {
      const slot = slotByNumber.get(Number(report.slotNumber));
      if (!slot) continue;
      const changed = slot.occupied !== Boolean(report.occupied) || slot.sensor_health !== report.health;
      const update: Record<string, unknown> = {
        occupied: Boolean(report.occupied),
        sensor_health: ['ok', 'fault', 'unknown'].includes(report.health) ? report.health : 'fault',
        last_distance_cm: Number.isFinite(report.distanceCm) ? report.distanceCm : null,
      };
      if (changed) update.last_changed_at = now;
      const { error } = await admin.from('parking_slots').update(update).eq('id', slot.id);
      if (error) throw error;
    }

    for (const result of (body.commandResults ?? []) as CommandResult[]) {
      if (!result.commandId || !['acknowledged', 'executed', 'failed'].includes(result.status)) continue;
      const patch: Record<string, unknown> = { status: result.status };
      if (result.status === 'acknowledged') patch.acknowledged_at = now;
      if (result.status === 'executed') patch.executed_at = now;
      if (result.status === 'failed') patch.failure_reason = String(result.reason ?? 'device failure').slice(0, 300);
      await admin.from('device_commands').update(patch).eq('id', result.commandId).eq('device_id', deviceId);
    }

    const incomingEvents = (body.events ?? []) as DeviceEvent[];
    for (let index = 0; index < incomingEvents.length; index++) {
      const event = incomingEvents[index];
      const slot = event.slotNumber ? slotByNumber.get(Number(event.slotNumber)) : undefined;
      let bookingId: string | null = null;
      if (event.commandId) {
        const { data: command } = await admin
          .from('device_commands')
          .select('booking_id')
          .eq('id', event.commandId)
          .eq('device_id', deviceId)
          .maybeSingle();
        bookingId = command?.booking_id ?? null;
      }
      const { error: eventError } = await admin.from('device_events').insert({
        device_id: deviceId,
        boot_id: bootId,
        seq,
        event_index: index,
        event_key: event.eventKey ?? `${bootId}:${seq}:${index}`,
        event_type: String(event.type ?? 'unknown').slice(0, 80),
        slot_id: slot?.id ?? null,
        booking_id: bookingId,
        metadata: { ...(event.metadata ?? {}), commandId: event.commandId ?? null, slotNumber: event.slotNumber ?? null },
        occurred_at: event.occurredAt ?? now,
      });
      if (eventError && eventError.code !== '23505') throw eventError;

      if (event.type === 'entry_passage' && bookingId) {
        await admin.from('bookings').update({ status: 'checked_in', checked_in_at: now, updated_at: now }).eq('id', bookingId).eq('status', 'confirmed');
        await admin.from('device_commands').update({ status: 'executed', executed_at: now }).eq('id', event.commandId);
        await admin.from('audit_logs').insert({ actor_device_id: deviceId, action: 'gate.entry_confirmed', target_type: 'booking', target_id: bookingId });
      }
    }

    if (incomingEvents.some((event) => event.type === 'exit_passage')) {
      const twoMinutesAgo = new Date(Date.now() - 120_000).toISOString();
      const { data: freedEvents } = await admin
        .from('device_events')
        .select('slot_id')
        .eq('device_id', deviceId)
        .eq('event_type', 'slot_freed')
        .gte('occurred_at', twoMinutesAgo);
      const candidateSlotIds = [...new Set((freedEvents ?? []).map((event) => event.slot_id).filter(Boolean))] as string[];
      const { data: candidateBookings } = candidateSlotIds.length
        ? await admin.from('bookings').select('id,slot_id').in('slot_id', candidateSlotIds).in('status', ['checked_in', 'overstayed'])
        : { data: [] as { id: string; slot_id: string }[] };
      if (candidateBookings?.length === 1) {
        const booking = candidateBookings[0];
        await admin.from('bookings').update({ status: 'completed', checked_out_at: now, updated_at: now }).eq('id', booking.id);
        await admin.from('audit_logs').insert({ actor_device_id: deviceId, action: 'gate.exit_confirmed', target_type: 'booking', target_id: booking.id });
      } else {
        await admin.from('audit_logs').insert({
          actor_device_id: deviceId,
          action: 'gate.unresolved_exit',
          target_type: 'device',
          target_id: deviceId,
          metadata: { candidateSlotIds, candidateBookingIds: candidateBookings?.map((item) => item.id) ?? [] },
        });
      }
    }

    await admin.from('device_commands').update({ status: 'expired', failure_reason: 'command expired' }).eq('device_id', deviceId).in('status', ['queued', 'acknowledged']).lt('expires_at', now);
    await admin.rpc('refresh_booking_states');

    const { data: commands, error: commandError } = await admin
      .from('device_commands')
      .select('id,type,payload,booking_id,expires_at')
      .eq('device_id', deviceId)
      .eq('status', 'queued')
      .gt('expires_at', now)
      .order('created_at')
      .limit(5);
    if (commandError) throw commandError;

    return json({
      serverTime: now,
      commands: commands.map((command) => ({
        id: command.id,
        type: command.type,
        payload: command.payload,
        bookingId: command.booking_id,
        expiresAt: command.expires_at,
      })),
    });
  } catch (error) {
    return errorResponse(error);
  }
});
