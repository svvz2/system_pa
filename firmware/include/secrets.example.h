#pragma once

// Copy this file to include/secrets.h. Never commit the real file.
#define WIFI_SSID "Wokwi-GUEST"
#define WIFI_PASSWORD ""
#define WIFI_CHANNEL 6
#define DEVICE_ID "30000000-0000-4000-8000-000000000001"

// Provision this as hex(HMAC-SHA256(DEVICE_MASTER_SECRET, lower-case DEVICE_ID)).
#define DEVICE_SECRET_HEX "replace-with-64-hex-characters"
#define DEVICE_SYNC_URL "https://YOUR_PROJECT.supabase.co/functions/v1/device-sync"

// Root CA that validates the hostname in DEVICE_SYNC_URL.
// Obtain the current root certificate from your hosting provider.
#define SERVER_ROOT_CA R"CERT(
-----BEGIN CERTIFICATE-----
REPLACE_WITH_CURRENT_ROOT_CA
-----END CERTIFICATE-----
)CERT"

// Keep 0 for real hardware/production. Set to 1 only in an ignored local
// secrets.h when Wokwi for VS Code connects to host.wokwi.internal.
#define ALLOW_WOKWI_LOCAL_HTTP 0
