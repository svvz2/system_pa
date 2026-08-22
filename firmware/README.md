# ESP32 firmware

1. Copy `include/secrets.example.h` to `include/secrets.h`.
2. Set the cloud function URL, current TLS root CA, and the derived device secret.
3. Build with `pio run` and start Wokwi with `Wokwi: Start Simulator`.

The Wokwi pushbuttons emulate active-low IR beams. For real HC-SR04 hardware, each 5V `ECHO` must pass through the documented 1kΩ/2kΩ voltage divider before the ESP32 GPIO. Power the SG90 and LEDs from a separate regulated 5V supply and connect all grounds together.

Generate the provisioned device key:

```powershell
$master = 'the-edge-function-master-secret'
$device = '30000000-0000-4000-8000-000000000001'
$hmac = [System.Security.Cryptography.HMACSHA256]::new([Text.Encoding]::UTF8.GetBytes($master))
([Convert]::ToHexString($hmac.ComputeHash([Text.Encoding]::UTF8.GetBytes($device)))).ToLower()
```

