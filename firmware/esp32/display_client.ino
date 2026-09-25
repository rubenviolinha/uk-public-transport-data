#include <ArduinoJson.h>
#include <HTTPClient.h>
#include <TFT_eSPI.h>
#include <WiFi.h>

const char *WIFI_SSID = "your-wifi";
const char *WIFI_PASSWORD = "your-password";
const char *DISPLAY_API = "http://192.168.1.10:8787/api/v1/display?deviceId=demo-display";
unsigned long lastRefresh = 0;
const unsigned long REFRESH_MS = 30000;
TFT_eSPI tft = TFT_eSPI();

void renderFallback(const char *message) {
  Serial.printf("DISPLAY: %s\n", message);
  tft.fillScreen(TFT_BLACK);
  tft.setTextColor(TFT_WHITE, TFT_BLACK);
  tft.setTextSize(2);
  tft.setCursor(12, 18);
  tft.println(message);
}

void renderDisplay(JsonDocument &document) {
  const char *stop = document["stop"]["name"] | "Unknown stop";
  bool stale = document["stale"] | true;
  tft.fillScreen(TFT_BLACK);
  tft.setTextSize(2);
  tft.setTextColor(TFT_CYAN, TFT_BLACK);
  tft.setCursor(12, 10);
  tft.println(stop);
  tft.setTextColor(stale ? TFT_YELLOW : TFT_GREEN, TFT_BLACK);
  tft.setCursor(12, 34);
  tft.println(stale ? "Data may be stale" : "Live departures");
  int y = 70;
  int shown = 0;
  Serial.printf("DISPLAY: %s%s\n", stop, stale ? " (stale)" : "");
  for (JsonObject departure : document["departures"].as<JsonArray>()) {
    const char *line = departure["line"] | "-";
    const char *destination = departure["destination"] | "Unknown";
    const char *expected = departure["expectedTime"] | "--:--";
    int delay = departure["delayMinutes"] | 0;
    Serial.printf("  %s  %s  %s  %s%d min\n", line, expected, destination, delay > 0 ? "+" : "", delay);
    if (shown++ == 5) break;
    tft.setTextColor(TFT_WHITE, TFT_BLACK);
    tft.setCursor(12, y);
    tft.printf("%s  %s", line, expected);
    tft.setTextSize(1);
    tft.setCursor(118, y + 4);
    tft.println(destination);
    if (delay > 0) { tft.setTextColor(TFT_ORANGE, TFT_BLACK); tft.setCursor(12, y + 20); tft.printf("+%d min", delay); }
    y += 42;
    tft.setTextSize(2);
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
  tft.init();
  tft.setRotation(1);
  renderFallback("Starting display...");
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
