#include <ArduinoJson.h>
#include <HTTPClient.h>
#include <WiFi.h>

const char *WIFI_SSID = "your-wifi";
const char *WIFI_PASSWORD = "your-password";
const char *DISPLAY_API = "http://192.168.1.10:8787/api/v1/display?deviceId=demo-display";
unsigned long lastRefresh = 0;
const unsigned long REFRESH_MS = 30000;

void renderFallback(const char *message) { Serial.printf("DISPLAY: %s\n", message); }

void renderDisplay(JsonDocument &document) {
  const char *stop = document["stop"]["name"] | "Unknown stop";
  bool stale = document["stale"] | true;
  Serial.printf("DISPLAY: %s%s\n", stop, stale ? " (stale)" : "");
  for (JsonObject departure : document["departures"].as<JsonArray>()) {
    const char *line = departure["line"] | "-";
    const char *destination = departure["destination"] | "Unknown";
    const char *expected = departure["expectedTime"] | "--:--";
    int delay = departure["delayMinutes"] | 0;
    Serial.printf("  %s  %s  %s  %s%d min\n", line, expected, destination, delay > 0 ? "+" : "", delay);
  }
}

bool refreshDisplay() {
  if (WiFi.status() != WL_CONNECTED) return false;
  HTTPClient http;
  http.setTimeout(8000);
  if (!http.begin(DISPLAY_API)) return false;
  int status = http.GET();
  if (status != HTTP_CODE_OK) { http.end(); return false; }
  JsonDocument document;
  DeserializationError error = deserializeJson(document, http.getString());
  http.end();
  if (error) return false;
  renderDisplay(document);
  return true;
}

void setup() {
  Serial.begin(115200);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  renderFallback("Connecting to Wi-Fi...");
  unsigned long started = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - started < 15000) delay(250);
  if (WiFi.status() != WL_CONNECTED) renderFallback("Wi-Fi unavailable; retrying");
  else refreshDisplay();
}

void loop() {
  if (millis() - lastRefresh < REFRESH_MS) { delay(100); return; }
  lastRefresh = millis();
  if (!refreshDisplay()) renderFallback("Keeping last good display state; retrying");
}
