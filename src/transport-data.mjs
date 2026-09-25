import { readJson, writeJson } from './display-contract.mjs';

function asArray(value) {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.departures)) return value.departures;
  if (Array.isArray(value?.services)) return value.services;
  if (Array.isArray(value?.data)) return value.data;
  return [];
}

function minutesBetween(scheduled, expected) {
  const parse = (value) => { const match = String(value ?? '').match(/^(\d{1,2}):(\d{2})/); return match ? Number(match[1]) * 60 + Number(match[2]) : NaN; };
  const scheduledMinutes = parse(scheduled); const expectedMinutes = parse(expected);
  if (!Number.isFinite(scheduledMinutes) || !Number.isFinite(expectedMinutes)) return 0;
  let difference = expectedMinutes - scheduledMinutes;
  if (difference < -720) difference += 1440;
  if (difference > 720) difference -= 1440;
  return Math.round(difference);
}

export function normaliseDepartures(source, provider = 'bus') {
  return asArray(source).map((item) => {
    const scheduledTime = item.scheduledTime ?? item.scheduled ?? item.departureTime ?? item.aimedDepartureTime ?? null;
    const expectedTime = item.expectedTime ?? item.expected ?? item.predictedDepartureTime ?? item.estimatedDepartureTime ?? scheduledTime;
    const delayMinutes = Number.isFinite(Number(item.delayMinutes)) ? Number(item.delayMinutes) : minutesBetween(scheduledTime, expectedTime);
    return { mode: item.mode ?? provider, line: String(item.line ?? item.route ?? item.service ?? item.serviceId ?? '—'), serviceId: item.serviceId ?? null, destination: item.destination ?? item.destinationName ?? item.headsign ?? 'Unknown destination', scheduledTime, expectedTime, delayMinutes, status: item.status ?? (item.cancelled ? 'cancelled' : expectedTime !== scheduledTime ? 'live' : 'scheduled'), platform: item.platform ?? null, stopId: item.stopId ?? item.atcoCode ?? item.station ?? null };
  }).filter((item) => item.scheduledTime);
}

export function mergeTransportData({ bus, rail, generatedAt = new Date().toISOString() }) {
  const departures = [...normaliseDepartures(bus, 'bus'), ...normaliseDepartures(rail, 'rail')].sort((a, b) => String(a.scheduledTime).localeCompare(String(b.scheduledTime)));
  return { generatedAt, freshness: 'live-cache', stale: false, departures };
}

export function readDarwinBoard(file) {
  const board = readJson(file, { departures: [] });
  return { departures: board.departures ?? [], generatedAt: board.generatedAt };
}

export function writeDisplayCache(file, data) {
  writeJson(file, { ...data, generatedAt: data.generatedAt ?? new Date().toISOString() });
}
