import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import { deriveDeviceSecret, signSyncBody, type SyncBody } from '../src/protocol.js';

describe('device protocol', () => {
  it('derives a different device key per id', () => {
    expect(deriveDeviceSecret('master', 'device-a').toString('hex')).not.toBe(deriveDeviceSecret('master', 'device-b').toString('hex'));
  });

  it('signs boot id, sequence and exact raw body', () => {
    const body: SyncBody = { deviceId: 'device-a', bootId: 'boot-a', seq: 7, firmwareVersion: 'test', gateState: 'closed', slots: [], events: [], commandResults: [] };
    const result = signSyncBody('master', body);
    const expected = createHmac('sha256', deriveDeviceSecret('master', body.deviceId)).update(`${body.bootId}.${body.seq}.${result.rawBody}`).digest('hex');
    expect(result.signature).toBe(expected);
    expect(result.signature).toHaveLength(64);
  });
});
