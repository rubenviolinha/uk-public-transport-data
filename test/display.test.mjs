import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDisplayResponse, validateConfig } from '../src/display-contract.mjs';
import { hasValidBearerToken } from '../src/auth.mjs';
import { mergeTransportData, normaliseDepartures } from '../src/transport-data.mjs';

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
