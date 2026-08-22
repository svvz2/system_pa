# Architecture and protocol

## Trust boundaries

- The Expo client may read rows allowed by RLS, but all booking, entry and privileged mutations go through server functions.
- The static QR contains only the public gate UUID. The authenticated booking and server checks are the authority.
- ESP32 never receives names, phone numbers or national IDs. It receives command ID, type, expiry and slot number.
- Device requests are TLS protected and HMAC signed. The server derives a per-device key from `DEVICE_MASTER_SECRET` and the device UUID.

## Device signature

1. Provision `deviceKey = HMAC-SHA256(masterSecret, lowerCase(deviceId))` as 32 bytes represented by 64 hex characters.
2. Serialize the JSON body once without reformatting.
3. Calculate `signature = hex(HMAC-SHA256(deviceKey, bootId + "." + seq + "." + rawBody))`.
4. Send it in `x-device-signature`.
5. A new random `bootId` is generated after each restart. `seq` increases for every attempt.
6. Queued events have stable `eventKey` values so a lost HTTP response cannot create duplicate events.

## Main API contracts

- `register-profile`: authenticated PII/vehicle registration; encrypts the national ID.
- `create-booking`: `{ vehicleId, startAt, endAt }`.
- `cancel-booking`: `{ bookingId }`.
- `request-entry`: `{ bookingId, qrPayload, idempotencyKey }`.
- `admin-command`: `{ type, reason, payload, idempotencyKey }`.
- `device-sync`: the signed device report documented in `firmware/src/main.cpp` and `simulator/src/protocol.ts`.

## Booking lifecycle

`confirmed → checked_in → completed`, with `no_show`, `cancelled`, and `overstayed` side states. GiST exclusion constraints protect both slot and user time ranges. The allocation includes early-entry and turnover buffers.

## Known physical limitations

The selected static QR does not prove proximity. Tailgating and license-plate verification need dynamic proximity proof, RFID, or ANPR and remain outside this prototype.

