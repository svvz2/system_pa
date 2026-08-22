import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import QRCode from 'qrcode';

const gateId = process.env.GATE_PUBLIC_ID ?? '20000000-0000-4000-8000-000000000001';
const payload = `parking://gate/${gateId}?v=1&side=entry`;
await mkdir(new URL('../docs/', import.meta.url), { recursive: true });
await QRCode.toFile(fileURLToPath(new URL('../docs/gate-entry-qr.svg', import.meta.url)), payload, {
  type: 'svg',
  errorCorrectionLevel: 'H',
  margin: 3,
  color: { dark: '#10231D', light: '#FFFFFF' },
});
process.stdout.write(`Generated docs/gate-entry-qr.svg\nPayload: ${payload}\n`);
