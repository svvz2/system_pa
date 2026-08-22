import * as ExpoCrypto from 'expo-crypto';

import { supabase } from './supabase';
import type { Booking } from './types';

function createIdempotencyKey(): string {
  try {
    return ExpoCrypto.randomUUID();
  } catch {
    // randomUUID is unavailable in browsers served over a local HTTP address.
  }

  const cryptoApi = globalThis.crypto as
    | { getRandomValues?: (values: Uint8Array) => Uint8Array }
    | undefined;
  if (cryptoApi?.getRandomValues) {
    const bytes = cryptoApi.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = [...bytes].map((value) => value.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }

  // The key provides request deduplication, not authentication. Authentication
  // still comes from the Supabase session, so this last-resort unique value is safe.
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}

async function invoke<T>(name: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke(name, { body });
  if (error) throw new Error(error.message);
  if (data?.error) throw new Error(data.error);
  return data as T;
}

export const api = {
  registerProfile: (body: {
    fullName: string;
    phone: string;
    nationalId: string;
    plateNumber: string;
    makeModel: string;
    color: string;
  }) => invoke<{ profileId: string; vehicleId: string }>('register-profile', body),

  createBooking: (vehicleId: string, startAt: string, endAt: string) =>
    invoke<{ booking: Booking }>('create-booking', { vehicleId, startAt, endAt }),

  cancelBooking: (bookingId: string) =>
    invoke<{ bookingId: string; status: string }>('cancel-booking', { bookingId }),

  requestEntry: (bookingId: string, qrPayload: string) =>
    invoke<{ commandId: string; slotNumber: number; expiresAt: string }>('request-entry', {
      bookingId,
      qrPayload,
      idempotencyKey: createIdempotencyKey(),
    }),

  adminCommand: (type: string, reason: string, payload: Record<string, unknown> = {}) =>
    invoke<{ commandId: string }>('admin-command', {
      type,
      reason,
      payload,
      idempotencyKey: createIdempotencyKey(),
    }),

  adminBookingDetails: (bookingId: string, reason: string) =>
    invoke<{
      id: string;
      start_at: string;
      end_at: string;
      status: string;
      nationalId: string;
      profile: { full_name: string; phone: string };
      vehicle: { plate_number: string; make_model: string; color: string };
      slot: { display_name: string };
    }>('admin-booking-details', { bookingId, reason }),
};
