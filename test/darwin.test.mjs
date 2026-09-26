import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeDarwinDepartures, parseDarwinDepartures } from '../src/darwin-data.mjs';

const snapshot = `<?xml version="1.0"?><schedule rid="run-1" toc="VT" trainId="2"><OR tpl="COVENTRY"/><DT tpl="RUGBY"/></schedule>
<?xml version="1.0"?><TS rid="run-1" uid="journey-1"><ns5:Location tpl="RUGBY" ptd="2026-09-27T08:00:00Z"><ns5:dep et="2026-09-27T08:05:00Z"/><ns5:plat>4</ns5:plat></ns5:Location></TS>`;

test('parses a Darwin departure and schedule metadata', () => {
  const [departure] = parseDarwinDepartures(snapshot, 'RUGBY');
  assert.equal(departure.runId, 'run-1');
  assert.equal(departure.destination, 'RUGBY');
  assert.equal(departure.expectedTime, '2026-09-27T08:05:00Z');
  assert.equal(departure.platform, '4');
});

test('merges a Darwin update without losing snapshot fields', () => {
  const existing = [{ runId: 'run-1', journeyId: 'journey-1', scheduledTime: '2026-09-27T08:00:00Z', destination: 'RUGBY', platform: '3' }];
  const update = [{ runId: 'run-1', expectedTime: '2026-09-27T08:07:00Z', platform: '4' }];
  assert.deepEqual(mergeDarwinDepartures(existing, update), [{ ...existing[0], ...update[0] }]);
});
