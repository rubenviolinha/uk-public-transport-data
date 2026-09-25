import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDisplayResponse, validateConfig } from '../src/display-contract.mjs';

const data = { generatedAt: '2026-09-25T07:00:00Z', freshness: 'fixture', departures: [{ line: '2', destination: 'Rugby Gateway', scheduledTime: '07:13', expectedTime: '07:16', delayMinutes: 3, status: 'live' }, { line: '1', destination: 'Merlin Close', scheduledTime: '07:43', delayMinutes: 0, status: 'scheduled' }] };

test('builds the stable display contract and applies route configuration', () => {
  const result = buildDisplayResponse({ data, config: validateConfig({ deviceId: 'd1', stopId: 's1', stopName: 'Test stop', route: '2', direction: 'Northbound' }) });
  assert.equal(result.version, 1);
  assert.equal(result.stop.id, 's1');
  assert.equal(result.departures.length, 1);
  assert.equal(result.departures[0].expectedTime, '07:16');
});

test('preserves stale state and fills missing expected time', () => {
  const result = buildDisplayResponse({ data: { stale: true, departures: [{ line: '1', destination: 'Town', scheduledTime: '08:00' }] }, config: validateConfig({ deviceId: 'd1', stopId: 's1', stopName: 'Test stop' }) });
  assert.equal(result.stale, true);
  assert.equal(result.departures[0].expectedTime, '08:00');
});

test('rejects incomplete device configuration', () => {
  assert.throws(() => validateConfig({ deviceId: 'only-id' }), /stopId and stopName/);
});
