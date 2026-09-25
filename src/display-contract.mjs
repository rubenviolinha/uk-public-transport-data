import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export const defaultConfig = {
  deviceId: 'demo-display',
  stopId: '4200F057700',
  stopName: 'Rugby Rail Station (Adj)',
  route: null,
  direction: 'Northbound'
};

export function readJson(file, fallback) {
  if (!existsSync(file)) return fallback;
  return JSON.parse(readFileSync(file, 'utf8'));
}

export function writeJson(file, value) {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

export function loadConfigStore(file) {
  return readJson(file, { [defaultConfig.deviceId]: defaultConfig });
}

export function buildDisplayResponse({ data, config, now = new Date() }) {
  const departures = (data.departures ?? [])
    .filter((departure) => !config.route || departure.line === config.route || departure.serviceId === config.route)
    .map((departure) => ({
      line: departure.line ?? departure.serviceId ?? '—',
      destination: departure.destination ?? 'Unknown destination',
      scheduledTime: departure.scheduledTime,
      expectedTime: departure.expectedTime ?? departure.scheduledTime,
      delayMinutes: Number(departure.delayMinutes ?? 0),
      status: departure.status ?? (departure.expectedTime ? 'live' : 'scheduled'),
      platform: departure.platform ?? null
    }))
    .slice(0, 8);

  return {
    version: 1,
    generatedAt: data.generatedAt ?? now.toISOString(),
    freshness: data.freshness ?? 'fixture',
    stale: Boolean(data.stale),
    stop: { id: config.stopId, name: config.stopName, direction: config.direction },
    departures
  };
}

export function validateConfig(input) {
  const config = { ...input };
  if (!config.deviceId || !config.stopId || !config.stopName) throw new Error('deviceId, stopId and stopName are required');
  if (config.route !== null && config.route !== undefined && typeof config.route !== 'string') throw new Error('route must be a string or null');
  return { deviceId: String(config.deviceId), stopId: String(config.stopId), stopName: String(config.stopName), route: config.route ? String(config.route) : null, direction: String(config.direction ?? '') };
}
