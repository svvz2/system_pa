#include <Arduino.h>
#include <ArduinoJson.h>
#include <ESP32Servo.h>
#include <FastLED.h>
#include <HTTPClient.h>
#include <LiquidCrystal_I2C.h>
#include <Preferences.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <Wire.h>
#include <mbedtls/md.h>

#if __has_include("secrets.h")
#include "secrets.h"
#else
#define WIFI_SSID "Wokwi-GUEST"
#define WIFI_PASSWORD ""
#define WIFI_CHANNEL 6
#define DEVICE_ID "30000000-0000-4000-8000-000000000001"
#define DEVICE_SECRET_HEX ""
#define DEVICE_SYNC_URL ""
#define SERVER_ROOT_CA ""
#define ALLOW_WOKWI_LOCAL_HTTP 0
#endif

#ifndef WIFI_CHANNEL
#define WIFI_CHANNEL 0
#endif

#ifndef ALLOW_WOKWI_LOCAL_HTTP
#define ALLOW_WOKWI_LOCAL_HTTP 0
#endif

namespace Config {
constexpr uint8_t SLOT_COUNT = 6;
constexpr uint8_t TRIG_PINS[SLOT_COUNT] = {13, 14, 16, 17, 18, 19};
constexpr uint8_t ECHO_PINS[SLOT_COUNT] = {32, 33, 34, 35, 36, 39};
constexpr uint8_t SERVO_PIN = 25;
constexpr uint8_t LED_PIN = 26;
constexpr uint8_t OUTER_BEAM_PIN = 27;
constexpr uint8_t INNER_BEAM_PIN = 23;
constexpr uint8_t OVERRIDE_PIN = 4;
constexpr uint8_t SERVO_CLOSED = 0;
constexpr uint8_t SERVO_OPEN = 90;
#if ALLOW_WOKWI_LOCAL_HTTP
constexpr uint32_t SYNC_INTERVAL_MS = 250;
#else
constexpr uint32_t SYNC_INTERVAL_MS = 1000;
#endif
constexpr uint32_t HEARTBEAT_INTERVAL_MS = 10000;
constexpr uint32_t CLEAR_BEFORE_CLOSE_MS = 2000;
constexpr uint32_t GATE_TIMEOUT_MS = 20000;
constexpr float DEFAULT_OCCUPIED_CM = 20.0f;
constexpr float DEFAULT_FREE_CM = 25.0f;
}  // namespace Config

enum class GateState { CLOSED, OPENING, OPEN_ENTRY, OPEN_EXIT, CLOSING, BLOCKED, FAULT };
enum class PassageStage { NONE, FIRST_BEAM, SECOND_BEAM };

struct SlotReading {
  float distanceCm = 100.0f;
  bool occupied = false;
  bool fault = false;
  uint8_t stableCount = 0;
  float occupiedThreshold = Config::DEFAULT_OCCUPIED_CM;
  float freeThreshold = Config::DEFAULT_FREE_CM;
};

struct EventItem {
  String key;
  String type;
  int slotNumber = 0;
  String commandId;
  String metadata = "{}";
};

struct CommandResult {
  String commandId;
  String status;
  String reason;
};

LiquidCrystal_I2C lcd(0x27, 20, 4);
Servo barrierServo;
CRGB leds[Config::SLOT_COUNT];
Preferences preferences;
SlotReading slots[Config::SLOT_COUNT];
std::vector<EventItem> eventQueue;
std::vector<CommandResult> commandResults;

GateState gateState = GateState::CLOSED;
PassageStage passageStage = PassageStage::NONE;
String activeCommandId;
String lastExecutedCommandId;
String bootId;
uint64_t sequenceNumber = 0;
uint32_t eventCounter = 0;
uint32_t gateOpenedAt = 0;
uint32_t gateActionAt = 0;
uint32_t beamsClearSince = 0;
uint32_t lastSyncAt = 0;
uint32_t lastHeartbeatAt = 0;
uint8_t nextSensor = 0;

void acknowledgeCommand(const String& id, const String& status, const String& reason);

String gateStateName() {
  switch (gateState) {
    case GateState::CLOSED: return "closed";
    case GateState::OPENING: return "opening";
    case GateState::OPEN_ENTRY: return "open_entry";
    case GateState::OPEN_EXIT: return "open_exit";
    case GateState::CLOSING: return "closing";
    case GateState::BLOCKED: return "blocked";
    default: return "fault";
  }
}

String randomUuid() {
  const char* hex = "0123456789abcdef";
  String value;
  value.reserve(36);
  for (int i = 0; i < 32; ++i) {
    if (i == 8 || i == 12 || i == 16 || i == 20) value += '-';
    value += hex[esp_random() & 0x0f];
  }
  value.setCharAt(14, '4');
  return value;
}

bool beamsClear() {
  return digitalRead(Config::OUTER_BEAM_PIN) == HIGH && digitalRead(Config::INNER_BEAM_PIN) == HIGH;
}

bool outerBlocked() { return digitalRead(Config::OUTER_BEAM_PIN) == LOW; }
bool innerBlocked() { return digitalRead(Config::INNER_BEAM_PIN) == LOW; }

void persistEvents() {
  JsonDocument doc;
  JsonArray array = doc.to<JsonArray>();
  for (const auto& event : eventQueue) {
    JsonObject item = array.add<JsonObject>();
    item["key"] = event.key;
    item["type"] = event.type;
    if (event.slotNumber > 0) item["slot"] = event.slotNumber;
    if (!event.commandId.isEmpty()) item["command"] = event.commandId;
  }
  String serialized;
  serializeJson(doc, serialized);
  preferences.putString("events", serialized);
}

void loadEvents() {
  String serialized = preferences.getString("events", "[]");
  JsonDocument doc;
  if (deserializeJson(doc, serialized)) return;
  for (JsonObject item : doc.as<JsonArray>()) {
    EventItem event;
    event.key = item["key"] | "";
    event.type = item["type"] | "unknown";
    event.slotNumber = item["slot"] | 0;
    event.commandId = item["command"] | "";
    if (!event.key.isEmpty()) eventQueue.push_back(event);
  }
}

void emitEvent(const String& type, int slotNumber = 0, const String& commandId = "") {
  if (eventQueue.size() >= 20) eventQueue.erase(eventQueue.begin());
  EventItem event;
  event.key = bootId + ":" + String(eventCounter++);
  event.type = type;
  event.slotNumber = slotNumber;
  event.commandId = commandId;
  eventQueue.push_back(event);
  persistEvents();
  Serial.printf("EVENT %s slot=%d command=%s\n", type.c_str(), slotNumber, commandId.c_str());
}

void setGate(GateState state) {
  gateState = state;
  if (state == GateState::OPENING) {
    barrierServo.write(Config::SERVO_OPEN);
    gateOpenedAt = millis();
    beamsClearSince = 0;
  } else if (state == GateState::CLOSING) {
    barrierServo.write(Config::SERVO_CLOSED);
  }
  gateActionAt = millis();
}

void openForEntry(const String& commandId) {
  if (gateState != GateState::CLOSED) return;
  activeCommandId = commandId;
  passageStage = PassageStage::NONE;
  setGate(GateState::OPENING);
  gateState = GateState::OPEN_ENTRY;
}

void openForExit() {
  if (gateState != GateState::CLOSED) return;
  activeCommandId = "";
  passageStage = PassageStage::FIRST_BEAM;
  setGate(GateState::OPENING);
  gateState = GateState::OPEN_EXIT;
  emitEvent("exit_opened_locally");
}

void updateGateStateMachine() {
  if (gateState == GateState::CLOSING) {
    if (millis() - gateActionAt >= 500) gateState = GateState::CLOSED;
    return;
  }
  if (gateState == GateState::CLOSED) {
    if (innerBlocked()) openForExit();
    if (digitalRead(Config::OVERRIDE_PIN) == LOW) {
      openForEntry("");
      emitEvent("manual_override");
    }
    return;
  }

  if (gateState == GateState::OPEN_ENTRY) {
    if (passageStage == PassageStage::NONE && outerBlocked()) passageStage = PassageStage::FIRST_BEAM;
    if (passageStage == PassageStage::FIRST_BEAM && innerBlocked()) passageStage = PassageStage::SECOND_BEAM;
  } else if (gateState == GateState::OPEN_EXIT) {
    if (passageStage == PassageStage::FIRST_BEAM && outerBlocked()) passageStage = PassageStage::SECOND_BEAM;
  }

  if (beamsClear() && passageStage == PassageStage::SECOND_BEAM) {
    if (beamsClearSince == 0) beamsClearSince = millis();
    if (millis() - beamsClearSince >= Config::CLEAR_BEFORE_CLOSE_MS) {
      if (gateState == GateState::OPEN_ENTRY) emitEvent("entry_passage", 0, activeCommandId);
      else if (gateState == GateState::OPEN_EXIT) emitEvent("exit_passage");
      setGate(GateState::CLOSING);
      passageStage = PassageStage::NONE;
      activeCommandId = "";
    }
  } else {
    beamsClearSince = 0;
  }

  if (millis() - gateOpenedAt > Config::GATE_TIMEOUT_MS) {
    if (!beamsClear()) {
      gateState = GateState::BLOCKED;
      barrierServo.write(Config::SERVO_OPEN);
      emitEvent("gate_blocked");
      gateOpenedAt = millis();
    } else if (passageStage != PassageStage::SECOND_BEAM) {
      if (!activeCommandId.isEmpty()) acknowledgeCommand(activeCommandId, "failed", "passage timeout");
      emitEvent("gate_passage_timeout", 0, activeCommandId);
      setGate(GateState::CLOSING);
      passageStage = PassageStage::NONE;
      activeCommandId = "";
    }
  }
}

float readDistance(uint8_t index) {
  digitalWrite(Config::TRIG_PINS[index], LOW);
  delayMicroseconds(2);
  digitalWrite(Config::TRIG_PINS[index], HIGH);
  delayMicroseconds(10);
  digitalWrite(Config::TRIG_PINS[index], LOW);
  const uint32_t duration = pulseIn(Config::ECHO_PINS[index], HIGH, 30000);
  if (duration == 0) return NAN;
  return duration / 58.0f;
}

void scanNextSlot() {
  SlotReading& slot = slots[nextSensor];
  const float distance = readDistance(nextSensor);
  const bool newFault = isnan(distance) || distance < 2 || distance > 400;
  bool desiredOccupied = slot.occupied;
  if (!newFault) {
    if (!slot.occupied && distance <= slot.occupiedThreshold) desiredOccupied = true;
    if (slot.occupied && distance >= slot.freeThreshold) desiredOccupied = false;
  }
  const bool candidateChanged = newFault != slot.fault || desiredOccupied != slot.occupied;
  slot.stableCount = candidateChanged ? slot.stableCount + 1 : 0;
  slot.distanceCm = newFault ? slot.distanceCm : distance;
  if (slot.stableCount >= 3) {
    const bool wasOccupied = slot.occupied;
    slot.fault = newFault;
    slot.occupied = desiredOccupied;
    slot.stableCount = 0;
    if (newFault) emitEvent("sensor_fault", nextSensor + 1);
    else if (wasOccupied != desiredOccupied) emitEvent(desiredOccupied ? "slot_occupied" : "slot_freed", nextSensor + 1);
  }
  nextSensor = (nextSensor + 1) % Config::SLOT_COUNT;
}

void updateIndicators() {
  int available = 0;
  for (uint8_t i = 0; i < Config::SLOT_COUNT; ++i) {
    if (slots[i].fault) leds[i] = CRGB::Yellow;
    else if (slots[i].occupied) leds[i] = CRGB::Red;
    else { leds[i] = CRGB::Green; available++; }
  }
  FastLED.show();
  static uint32_t lastLcd = 0;
  if (millis() - lastLcd < 500) return;
  lastLcd = millis();
  lcd.setCursor(0, 0); lcd.printf("Available: %02d       ", available);
  lcd.setCursor(0, 1); lcd.printf("Gate: %-13s", gateStateName().c_str());
  lcd.setCursor(0, 2); lcd.printf("WiFi: %-13s", WiFi.status() == WL_CONNECTED ? "ONLINE" : "OFFLINE");
  lcd.setCursor(0, 3); lcd.printf("Events: %-11d", static_cast<int>(eventQueue.size()));
}

bool hexToBytes(const String& hex, uint8_t* output, size_t outputLength) {
  if (hex.length() != outputLength * 2) return false;
  for (size_t i = 0; i < outputLength; ++i) {
    char pair[3] = {hex[i * 2], hex[i * 2 + 1], 0};
    char* end = nullptr;
    output[i] = static_cast<uint8_t>(strtoul(pair, &end, 16));
    if (*end != 0) return false;
  }
  return true;
}

String hmacSha256(const String& message) {
  uint8_t key[32];
  if (!hexToBytes(DEVICE_SECRET_HEX, key, sizeof(key))) return "";
  uint8_t output[32];
  mbedtls_md_context_t ctx;
  mbedtls_md_init(&ctx);
  const mbedtls_md_info_t* info = mbedtls_md_info_from_type(MBEDTLS_MD_SHA256);
  mbedtls_md_setup(&ctx, info, 1);
  mbedtls_md_hmac_starts(&ctx, key, sizeof(key));
  mbedtls_md_hmac_update(&ctx, reinterpret_cast<const uint8_t*>(message.c_str()), message.length());
  mbedtls_md_hmac_finish(&ctx, output);
  mbedtls_md_free(&ctx);
  String result;
  for (uint8_t byte : output) { if (byte < 16) result += '0'; result += String(byte, HEX); }
  return result;
}

void acknowledgeCommand(const String& id, const String& status, const String& reason = "") {
  CommandResult result;
  result.commandId = id;
  result.status = status;
  result.reason = reason;
  commandResults.push_back(result);
}

void handleCommand(JsonObject command) {
  String id = command["id"] | "";
  String type = command["type"] | "";
  if (id.isEmpty() || id == lastExecutedCommandId) return;
  acknowledgeCommand(id, "acknowledged");
  if (type == "open_entry") {
    openForEntry(id);
    JsonObject payload = command["payload"];
    int slotNumber = payload["slotNumber"] | 0;
    lcd.clear(); lcd.setCursor(0, 0); lcd.print("WELCOME"); lcd.setCursor(0, 1); lcd.printf("PARK AT P%d", slotNumber);
  } else if (type == "open_gate") {
    openForEntry(id);
    acknowledgeCommand(id, "executed");
  } else if (type == "calibrate_slot") {
    JsonObject payload = command["payload"];
    String slotId = payload["slotId"] | "";
    // Slot UUID ends with its seeded number; the server remains authoritative.
    int number = slotId.substring(slotId.length() - 1).toInt();
    if (number >= 1 && number <= 6 && !slots[number - 1].fault) {
      slots[number - 1].freeThreshold = max(5.0f, slots[number - 1].distanceCm - 2.0f);
      slots[number - 1].occupiedThreshold = max(2.0f, slots[number - 1].freeThreshold - 5.0f);
      emitEvent("calibration_completed", number, id);
      acknowledgeCommand(id, "executed");
    } else acknowledgeCommand(id, "failed", "invalid slot or sensor fault");
  } else if (type == "toggle_slot") acknowledgeCommand(id, "executed");
  else acknowledgeCommand(id, "failed", "unsupported command");
  lastExecutedCommandId = id;
  preferences.putString("lastCmd", id);
}

template <typename ClientType>
void postDeviceSync(ClientType& client, const String& url, const String& rawBody, const String& signature) {
  HTTPClient http;
  if (!http.begin(client, url)) {
    Serial.println("Sync begin failed");
    return;
  }
  http.addHeader("Content-Type", "application/json");
  http.addHeader("x-device-signature", signature);
  const int status = http.POST(rawBody);
  const String responseBody = http.getString();
  if (status == 200) {
    JsonDocument response;
    if (!deserializeJson(response, responseBody)) {
      eventQueue.clear();
      commandResults.clear();
      persistEvents();
      for (JsonObject command : response["commands"].as<JsonArray>()) handleCommand(command);
    }
  } else Serial.printf("Sync HTTP %d: %s\n", status, responseBody.c_str());
  http.end();
}

void syncDevice() {
  if (WiFi.status() != WL_CONNECTED || String(DEVICE_SYNC_URL).isEmpty() || String(DEVICE_SECRET_HEX).length() != 64) return;
  JsonDocument doc;
  doc["deviceId"] = DEVICE_ID;
  doc["bootId"] = bootId;
  doc["seq"] = sequenceNumber++;
  doc["firmwareVersion"] = "1.0.0";
  doc["gateState"] = gateStateName();
  JsonArray slotArray = doc["slots"].to<JsonArray>();
  for (uint8_t i = 0; i < Config::SLOT_COUNT; ++i) {
    JsonObject item = slotArray.add<JsonObject>();
    item["slotNumber"] = i + 1;
    if (!slots[i].fault) item["distanceCm"] = serialized(String(slots[i].distanceCm, 2));
    else item["distanceCm"] = nullptr;
    item["occupied"] = slots[i].occupied;
    item["health"] = slots[i].fault ? "fault" : "ok";
  }
  JsonArray events = doc["events"].to<JsonArray>();
  for (const auto& queued : eventQueue) {
    JsonObject item = events.add<JsonObject>();
    item["eventKey"] = queued.key;
    item["type"] = queued.type;
    if (queued.slotNumber > 0) item["slotNumber"] = queued.slotNumber;
    if (!queued.commandId.isEmpty()) item["commandId"] = queued.commandId;
    item["occurredAt"] = serialized("null");
  }
  JsonArray results = doc["commandResults"].to<JsonArray>();
  for (const auto& queued : commandResults) {
    JsonObject item = results.add<JsonObject>();
    item["commandId"] = queued.commandId;
    item["status"] = queued.status;
    if (!queued.reason.isEmpty()) item["reason"] = queued.reason;
  }
  String rawBody;
  serializeJson(doc, rawBody);
  String message = bootId + "." + String(doc["seq"].as<uint64_t>()) + "." + rawBody;
  String signature = hmacSha256(message);
  if (signature.isEmpty()) return;

  const String url = DEVICE_SYNC_URL;
  if (url.startsWith("https://")) {
    WiFiClientSecure client;
    client.setCACert(SERVER_ROOT_CA);
    postDeviceSync(client, url, rawBody, signature);
    return;
  }
#if ALLOW_WOKWI_LOCAL_HTTP
  if (url.startsWith("http://host.wokwi.internal:")) {
    WiFiClient client;
    postDeviceSync(client, url, rawBody, signature);
    return;
  }
#endif
  Serial.println("Rejected non-TLS sync URL");
}

void connectWifi() {
  WiFi.mode(WIFI_STA);
  if (WIFI_CHANNEL > 0) WiFi.begin(WIFI_SSID, WIFI_PASSWORD, WIFI_CHANNEL);
  else WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  Serial.printf("Connecting to %s", WIFI_SSID);
  const uint32_t started = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - started < 15000) { delay(250); Serial.print('.'); }
  Serial.println(WiFi.status() == WL_CONNECTED ? " connected" : " offline mode");
}

void setup() {
  Serial.begin(115200);
  preferences.begin("parking", false);
  bootId = randomUuid();
  lastExecutedCommandId = preferences.getString("lastCmd", "");
  loadEvents();
  for (uint8_t i = 0; i < Config::SLOT_COUNT; ++i) {
    pinMode(Config::TRIG_PINS[i], OUTPUT);
    pinMode(Config::ECHO_PINS[i], INPUT);
  }
  pinMode(Config::OUTER_BEAM_PIN, INPUT_PULLUP);
  pinMode(Config::INNER_BEAM_PIN, INPUT_PULLUP);
  pinMode(Config::OVERRIDE_PIN, INPUT_PULLUP);
  Wire.begin(21, 22);
  lcd.init(); lcd.backlight(); lcd.clear(); lcd.print("Smart Parking Boot");
  barrierServo.setPeriodHertz(50); barrierServo.attach(Config::SERVO_PIN, 500, 2400); barrierServo.write(Config::SERVO_CLOSED);
  FastLED.addLeds<NEOPIXEL, Config::LED_PIN>(leds, Config::SLOT_COUNT); FastLED.setBrightness(80);
  connectWifi();
  emitEvent("device_boot");
}

void loop() {
  scanNextSlot();
  updateGateStateMachine();
  updateIndicators();
  if (WiFi.status() != WL_CONNECTED && millis() - lastHeartbeatAt > 10000) { lastHeartbeatAt = millis(); connectWifi(); }
  if (millis() - lastSyncAt >= Config::SYNC_INTERVAL_MS) { lastSyncAt = millis(); syncDevice(); }
  delay(10);
}
