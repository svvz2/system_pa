export type UserRole = 'user' | 'admin';

export type BookingStatus =
  | 'confirmed'
  | 'checked_in'
  | 'overstayed'
  | 'completed'
  | 'cancelled'
  | 'no_show';

export type SlotState =
  | 'available'
  | 'reserved'
  | 'occupied'
  | 'unexpected_occupied'
  | 'sensor_fault'
  | 'disabled';

export type GateState =
  | 'closed'
  | 'opening'
  | 'open_entry'
  | 'open_exit'
  | 'closing'
  | 'blocked'
  | 'fault';

export interface Profile {
  id: string;
  full_name: string;
  phone: string;
  role: UserRole;
  national_id_last4: string | null;
  profile_complete: boolean;
  blocked: boolean;
}

export interface Vehicle {
  id: string;
  user_id: string;
  plate_number: string;
  make_model: string;
  color: string;
  is_primary: boolean;
}

export interface ParkingSlot {
  id: string;
  slot_number: number;
  display_name: string;
  state: SlotState;
  occupied: boolean;
  sensor_health: 'ok' | 'fault' | 'unknown';
  last_distance_cm: number | null;
  last_changed_at: string;
}

export interface Booking {
  id: string;
  start_at: string;
  end_at: string;
  status: BookingStatus;
  checked_in_at: string | null;
  checked_out_at: string | null;
  slot: { slot_number: number; display_name: string } | null;
  vehicle: { plate_number: string; make_model: string; color: string } | null;
}

export interface DeviceSummary {
  id: string;
  name: string;
  online: boolean;
  last_seen_at: string | null;
  firmware_version: string | null;
  gate_state: GateState;
}

