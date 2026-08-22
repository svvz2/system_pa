import { createHmac, randomUUID } from 'node:crypto';

export interface SlotReport {
  slotNumber: number;
  distanceCm: number | null;
  occupied: boolean;
  health: 'ok' | 'fault' | 'unknown';
}

export interface DeviceEvent {
  eventKey: string;
  type: string;
  slotNumber?: number;
  commandId?: string;
  occurredAt: string;
  metadata?: Record<string, unknown>;
}

export interface CommandResult {
  commandId: string;
  status: 'acknowledged' | 'executed' | 'failed';
  reason?: string;
}

export interface SyncBody {
  deviceId: string;
  bootId: string;
  seq: number;
  firmwareVersion: string;
  gateState: string;
  slots: SlotReport[];
  events: DeviceEvent[];
  commandResults: CommandResult[];
}

export function deriveDeviceSecret(masterSecret: string, deviceId: string) {
  return createHmac('sha256', masterSecret).update(deviceId.toLowerCase()).digest();
}

export function signSyncBody(masterSecret: string, body: SyncBody) {
  const rawBody = JSON.stringify(body);
  const message = `${body.bootId}.${body.seq}.${rawBody}`;
  const signature = createHmac('sha256', deriveDeviceSecret(masterSecret, body.deviceId)).update(message).digest('hex');
  return { rawBody, signature };
}

export function eventKey(bootId: string, counter: number) {
  return `${bootId}:${counter}`;
}

export function newBootId() {
  return randomUUID();
}

