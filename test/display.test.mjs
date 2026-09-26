import test from 'node:test';
import assert from 'node:assert/strict';
import GtfsRealtimeBindings from 'gtfs-realtime-bindings';
import { buildDisplayResponse, validateConfig } from '../src/display-contract.mjs';
import { hasValidBearerToken } from '../src/auth.mjs';
import { mergeScheduledDepartures } from '../src/schedule-data.mjs';
import { mergeTransportData, normaliseDepartures, parseGtfsRealtimeDepartures, parseSiriVmDepartures } from '../src/transport-data.mjs';

const data = { generatedAt: '2026-09-25T07:00:00Z', freshness: 'fixture', departures: [{ line: '2', destination: 'Rugby Gateway', scheduledTime: '07:13', expectedTime: '07:16', delayMinutes: 3, status: 'live', stopId: 's1', direction: 'Northbound' }, { line: '1', destination: 'Merlin Close', scheduledTime: '07:43', delayMinutes: 0, status: 'scheduled', stopId: 's1', direction: 'Northbound' }] };

test('builds the stable display contract and applies route configuration', () => {
  const result = buildDisplayResponse({ data, config: validateConfig({ deviceId: 'd1', stopId: 's1', stopName: 'Test stop', route: '2', direction: 'Northbound' }) });
  assert.equal(result.version, 1);
  assert.equal(result.stop.id, 's1');
  assert.match(result.attribution, /BODS/);
  assert.equal(result.departures.length, 1);
  assert.equal(result.departures[0].expectedTime, '07:16');
});

test('preserves stale state and fills missing expected time', () => {
  const result = buildDisplayResponse({ data: { stale: true, departures: [{ line: '1', destination: 'Town', scheduledTime: '08:00' }] }, config: validateConfig({ deviceId: 'd1', stopId: 's1', stopName: 'Test stop' }) });
  assert.equal(result.stale, true);
  assert.equal(result.departures[0].expectedTime, '08:00');
});

test('filters departures by configured stop and direction', () => {
  const result = buildDisplayResponse({
    data: { departures: [
      { line: '1', destination: 'Right stop', scheduledTime: '08:00', stopId: 's1', direction: 'Northbound' },
      { line: '1', destination: 'Wrong stop', scheduledTime: '08:01', stopId: 's2', direction: 'Northbound' },
      { line: '1', destination: 'Wrong direction', scheduledTime: '08:02', stopId: 's1', direction: 'Southbound' }
    ] },
    config: validateConfig({ deviceId: 'd1', stopId: 's1', stopName: 'Test stop', direction: 'Northbound' })
  });
  assert.deepEqual(result.departures.map((departure) => departure.destination), ['Right stop']);
});

test('rejects incomplete device configuration', () => {
  assert.throws(() => validateConfig({ deviceId: 'only-id' }), /stopId and stopName/);
});

test('normalises and merges bus and rail sources into one cache', () => {
  const result = mergeTransportData({
    bus: { departures: [{ route: '2', destinationName: 'Rugby Gateway', aimedDepartureTime: '07:13', predictedDepartureTime: '07:16' }] },
    rail: { departures: [{ serviceId: 'D', destination: 'London Euston', scheduledTime: '07:20', expectedTime: '07:20', platform: '4' }] }
  });
  assert.deepEqual(result.departures.map(({ mode, line }) => [mode, line]), [['bus', '2'], ['rail', 'D']]);
  assert.equal(result.departures[0].delayMinutes, 3);
  assert.equal(normaliseDepartures({ departures: [{ line: '1', scheduledTime: '08:00', cancelled: true }] })[0].status, 'cancelled');
});

test('normalises direction and stop metadata for display filtering', () => {
  const [departure] = normaliseDepartures({ departures: [{ route: '2', atcoCode: '4200F057700', directionName: 'Northbound', scheduledTime: '08:00' }] });
  assert.equal(departure.stopId, '4200F057700');
  assert.equal(departure.direction, 'Northbound');
});

test('accepts only an exact bearer token', () => {
  assert.equal(hasValidBearerToken({ authorization: 'Bearer secret-token' }, 'secret-token'), true);
  assert.equal(hasValidBearerToken({ authorization: 'Bearer wrong-token' }, 'secret-token'), false);
  assert.equal(hasValidBearerToken({}, 'secret-token'), false);
  assert.equal(hasValidBearerToken({ authorization: 'Bearer secret-token' }, ''), false);
});

test('parses a raw SIRI-VM stop visit', () => {
  const [departure] = parseSiriVmDepartures(`<?xml version="1.0"?><Siri><ServiceDelivery><StopMonitoringDelivery><MonitoredStopVisit><MonitoringRef>4200F057700</MonitoringRef><MonitoredVehicleJourney><LineRef>2</LineRef><PublishedLineName>2</PublishedLineName><DirectionRef>Northbound</DirectionRef><DestinationName>Rugby Gateway</DestinationName><VehicleJourneyRef>journey-2</VehicleJourneyRef><MonitoredCall><StopPointRef>4200F057700</StopPointRef><AimedDepartureTime>2026-09-27T07:13:00+01:00</AimedDepartureTime><ExpectedDepartureTime>2026-09-27T07:16:00+01:00</ExpectedDepartureTime></MonitoredCall></MonitoredVehicleJourney></MonitoredStopVisit></StopMonitoringDelivery></ServiceDelivery></Siri>`, '4200F057700');
  assert.deepEqual({ line: departure.line, destination: departure.destination, stopId: departure.stopId, direction: departure.direction }, { line: '2', destination: 'Rugby Gateway', stopId: '4200F057700', direction: 'Northbound' });
  assert.equal(departure.status, 'live');
});

test('parses a GTFS-RT trip update into a delayed departure', () => {
  const { FeedMessage } = GtfsRealtimeBindings.transit_realtime;
  const feed = FeedMessage.fromObject({
    header: { gtfsRealtimeVersion: '2.0', timestamp: 1760000000 },
    entity: [{ id: 'entity-1', tripUpdate: { trip: { tripId: 'trip-2', routeId: '2', directionId: 1 }, stopTimeUpdate: [{ stopId: '4200F057700', departure: { time: '1760000000', delay: 180 } }] } }]
  });
  const [departure] = parseGtfsRealtimeDepartures(FeedMessage.encode(feed).finish(), '4200F057700');
  assert.equal(departure.line, '2');
  assert.equal(departure.serviceId, 'trip-2');
  assert.equal(departure.delayMinutes, 3);
  assert.equal(departure.direction, '1');
});

test('matches live trip data to the static timetable and keeps unmatched services', () => {
  const result = mergeScheduledDepartures(
    { departures: [{ tripId: 'trip-2', route: '2', stopId: 's1', direction: 'Northbound', scheduledTime: '2026-09-27T07:13:00Z', expectedTime: '2026-09-27T07:16:00Z', delayMinutes: 3 }] },
    { departures: [
      { tripId: 'trip-2', route: '2', stopId: 's1', direction: 'Northbound', destination: 'Rugby Gateway', scheduledTime: '2026-09-27T07:13:00Z' },
      { route: '1', stopId: 's1', direction: 'Northbound', destination: 'Merlin Close', scheduledTime: '2026-09-27T07:43:00Z' }
    ] }
  );
  assert.equal(result.length, 2);
  assert.equal(result[0].destination, 'Rugby Gateway');
  assert.equal(result[0].delayMinutes, 3);
  assert.equal(result[1].status, 'scheduled');
});
