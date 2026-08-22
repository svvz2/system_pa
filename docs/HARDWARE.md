# Hardware assembly checklist

| Function | ESP32 GPIO |
|---|---:|
| HC-SR04 TRIG P1–P6 | 13, 14, 16, 17, 18, 19 |
| HC-SR04 ECHO P1–P6 | 32, 33, 34, 35, 36, 39 |
| LCD SDA/SCL | 21/22 |
| SG90 signal | 25 |
| WS2812B data | 26 |
| Outer/inner IR | 27/23 |
| Protected override | 4 |

- Every HC-SR04 ECHO line: `ECHO — 1kΩ — GPIO node — 2kΩ — GND`.
- Use a regulated 5V/2A or stronger supply for servo, LEDs, and sensors. Do not power the servo from 3.3V.
- Connect ESP32, sensor, LED and servo grounds.
- Add 330Ω in series with WS2812 data and 1000µF across the LED 5V input.
- If a real IR module emits 5V logic, level-shift it before the ESP32 input.
- Mount the six ultrasonic sensors so adjacent cones do not face each other; firmware reads them sequentially.

Bench order: power only → one sensor → six sensors → display/LEDs → servo on external power → direction beams → complete integration.

