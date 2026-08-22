const encoder = new TextEncoder();

function bytesToHex(bytes: Uint8Array) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(value: string) {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function sha256(value: string) {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value)));
}

async function importHmacKey(key: Uint8Array | string) {
  return crypto.subtle.importKey(
    'raw',
    typeof key === 'string' ? encoder.encode(key) : key,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
}

export async function hmacHex(key: Uint8Array | string, value: string) {
  const signature = await crypto.subtle.sign('HMAC', await importHmacKey(key), encoder.encode(value));
  return bytesToHex(new Uint8Array(signature));
}

export async function deriveDeviceKey(masterSecret: string, deviceId: string) {
  const hex = await hmacHex(masterSecret, deviceId.toLowerCase());
  return new Uint8Array(hex.match(/.{2}/g)!.map((pair) => Number.parseInt(pair, 16)));
}

export async function verifyDeviceSignature(masterSecret: string, deviceId: string, message: string, actual: string) {
  const expected = await hmacHex(await deriveDeviceKey(masterSecret, deviceId), message);
  if (expected.length !== actual.length) return false;
  let difference = 0;
  for (let index = 0; index < expected.length; index++) difference |= expected.charCodeAt(index) ^ actual.charCodeAt(index);
  return difference === 0;
}

export async function encryptNationalId(value: string, encryptionSecret: string) {
  const keyBytes = await sha256(encryptionSecret);
  const key = await crypto.subtle.importKey('raw', keyBytes, 'AES-GCM', false, ['encrypt']);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoder.encode(value));
  return { ciphertext: bytesToBase64(new Uint8Array(encrypted)), iv: bytesToBase64(iv) };
}

export async function decryptNationalId(ciphertext: string, iv: string, encryptionSecret: string) {
  const keyBytes = await sha256(encryptionSecret);
  const key = await crypto.subtle.importKey('raw', keyBytes, 'AES-GCM', false, ['decrypt']);
  const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: base64ToBytes(iv) }, key, base64ToBytes(ciphertext));
  return new TextDecoder().decode(decrypted);
}
