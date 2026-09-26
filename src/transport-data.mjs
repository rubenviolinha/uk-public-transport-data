import { readJson, writeJson } from './display-contract.mjs';
import GtfsRealtimeBindings from 'gtfs-realtime-bindings';

const FeedMessage = GtfsRealtimeBindings.transit_realtime.FeedMessage;

function asArray(value) {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.departures)) return value.departures;
  if (Array.isArray(value?.services)) return value.services;
  if (Array.isArray(value?.data)) return value.data;
  return [];
}

function decodeXml(value) {
  return value.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'");
}

function xmlText(block, name) {
  const match = block.match(new RegExp(`<(?:[A-Za-z0-9_.-]+:)?${name}\\b[^>]*>([\\s\\S]*?)</(?:[A-Za-z0-9_.-]+:)?${name}>`));
  return match ? decodeXml(match[1].trim()) : null;
}

function xmlBlock(block, name) {
  const match = block.match(new RegExp(`<(?:[A-Za-z0-9_.-]+:)?${name}\\b[^>]*>([\\s\\S]*?)</(?:[A-Za-z0-9_.-]+:)?${name}>`));
  return match?.[1] ?? '';
}

export function parseSiriVmDepartures(xml, stopId = null) {
  const visits = [...xml.matchAll(/<(?:[A-Za-z0-9_.-]+:)?MonitoredStopVisit\b[^>]*>([\s\S]*?)<\/(?:[A-Za-z0-9_.-]+:)?MonitoredStopVisit>/g)];
  return visits.map((visit) => {
    const body = visit[1];
    const journey = xmlBlock(body, 'MonitoredVehicleJourney');
    const call = xmlBlock(journey, 'MonitoredCall');
    const currentStopId = xmlText(call, 'StopPointRef') ?? xmlText(body, 'MonitoringRef');
    const scheduledTime = xmlText(call, 'AimedDepartureTime') ?? xmlText(call, 'AimedArrivalTime');
    const expectedTime = xmlText(call, 'ExpectedDepartureTime') ?? xmlText(call, 'ExpectedArrivalTime') ?? scheduledTime;
    return {
      mode: 'bus',
      line: xmlText(journey, 'PublishedLineName') ?? xmlText(journey, 'LineRef') ?? '—',
      serviceId: xmlText(journey, 'VehicleJourneyRef'),
      destination: xmlText(journey, 'DestinationName') ?? 'Unknown destination',
      scheduledTime,
      expectedTime,
      delayMinutes: minutesBetween(scheduledTime, expectedTime),
      status: expectedTime !== scheduledTime ? 'live' : 'scheduled',
      stopId: currentStopId,
      direction: xmlText(journey, 'DirectionRef')
    };
  }).filter((departure) => departure.scheduledTime && (!stopId || departure.stopId === stopId));
}

function epochSecondsToIso(value) {
  const seconds = Number(value);
  return Number.isFinite(seconds) ? new Date(seconds * 1000).toISOString() : null;
}

export function parseGtfsRealtimeDepartures(buffer, stopId = null) {
  const feed = FeedMessage.decode(buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer));
  const departures = [];
  for (const entity of feed.entity ?? []) {
    const update = entity.tripUpdate;
    if (!update) continue;
    const trip = update.trip ?? {};
    for (const stopTime of update.stopTimeUpdate ?? []) {
      if (stopId && stopTime.stopId !== stopId) continue;
      const event = stopTime.departure ?? stopTime.arrival;
      if (!event?.time) continue;
      const expectedEpoch = Number(event.time);
      const delaySeconds = Number(event.delay ?? 0);
      const scheduledEpoch = expectedEpoch - delaySeconds;
      const expectedTime = epochSecondsToIso(expectedEpoch);
      const scheduledTime = epochSecondsToIso(scheduledEpoch);
      departures.push({
        mode: 'bus',
        line: trip.routeId ?? '—',
        serviceId: trip.tripId ?? null,
        destination: 'Unknown destination',
        scheduledTime,
        expectedTime,
        delayMinutes: Math.round(delaySeconds / 60),
        status: 'live',
        stopId: stopTime.stopId ?? null,
        direction: trip.directionId == null ? null : String(trip.directionId)
      });
    }
  }
  return departures.filter((departure) => departure.scheduledTime);
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
    return { mode: item.mode ?? provider, line: String(item.line ?? item.route ?? item.service ?? item.serviceId ?? item.tripId ?? '—'), serviceId: item.serviceId ?? item.tripId ?? null, destination: item.destination ?? item.destinationName ?? item.headsign ?? 'Unknown destination', scheduledTime, expectedTime, delayMinutes, status: item.status ?? (item.cancelled ? 'cancelled' : expectedTime !== scheduledTime ? 'live' : 'scheduled'), platform: item.platform ?? null, stopId: item.stopId ?? item.atcoCode ?? item.station ?? null, direction: item.direction ?? item.directionName ?? null };
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
