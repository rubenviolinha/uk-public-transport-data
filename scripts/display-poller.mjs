import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadDotEnv } from '../src/env.mjs';
import { mergeScheduledDepartures } from '../src/schedule-data.mjs';
import { mergeTransportData, parseGtfsRealtimeDepartures, parseSiriVmDepartures, readDarwinBoard, writeDisplayCache } from '../src/transport-data.mjs';
import { readJson } from '../src/display-contract.mjs';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
loadDotEnv(join(root, '.env'));
const cacheFile = resolve(process.env.DISPLAY_DATA_FILE ?? join(root, 'data', 'cache', 'display.json'));
const darwinFile = resolve(process.env.DARWIN_BOARD_FILE ?? join(root, 'data', 'darwin', 'rugby-departures.json'));
const timetableFile = resolve(process.env.BODS_TIMETABLE_FILE ?? join(root, 'data', 'timetables', 'rugby.json'));
const busUrl = process.env.BODS_DEPARTURES_URL;
const bodsApiKey = process.env.BODS_API_KEY && process.env.BODS_API_KEY !== 'replace_me' ? process.env.BODS_API_KEY : undefined;

async function fetchBus() {
  if (!busUrl) return { departures: [] };
  const timeoutMs = Math.max(Number(process.env.BODS_FETCH_TIMEOUT_SECONDS ?? 10), 1) * 1000;
  const response = await fetch(busUrl, { signal: AbortSignal.timeout(timeoutMs), headers: bodsApiKey ? { 'x-api-key': bodsApiKey, authorization: `Bearer ${bodsApiKey}` } : undefined });
  if (!response.ok) throw new Error(`BODS request failed: ${response.status}`);
  const payload = Buffer.from(await response.arrayBuffer());
  const contentType = response.headers.get('content-type') ?? '';
  const text = payload.toString('utf8').trimStart();
  if (contentType.includes('json') || text.startsWith('{') || text.startsWith('[')) return JSON.parse(text);
  if (contentType.includes('xml') || text.startsWith('<')) return { departures: parseSiriVmDepartures(text, process.env.BODS_STOP_ID ?? null) };
  return { departures: parseGtfsRealtimeDepartures(payload, process.env.BODS_STOP_ID ?? null) };
}

async function poll() {
  try {
    const timetable = existsSync(timetableFile) ? readJson(timetableFile, { departures: [] }) : null;
    if (!busUrl && !existsSync(darwinFile) && !timetable) throw new Error('No transport sources configured; set BODS_DEPARTURES_URL, BODS_TIMETABLE_FILE, or run darwin:snapshot first');
    const bus = mergeScheduledDepartures(await fetchBus(), timetable ?? { departures: [] });
    const rail = existsSync(darwinFile) ? readDarwinBoard(darwinFile) : { departures: [] };
    const result = mergeTransportData({ bus, rail, generatedAt: new Date().toISOString() });
    writeDisplayCache(cacheFile, result);
    console.log(`Saved ${result.departures.length} departures to ${cacheFile}`);
    return result;
  } catch (error) {
    let existing = { generatedAt: new Date().toISOString(), freshness: 'unavailable', departures: [] };
    if (existsSync(cacheFile)) {
      try {
        existing = JSON.parse(readFileSync(cacheFile, 'utf8'));
      } catch {
        // Treat an empty or corrupt cache as unavailable, while still recording the cause below.
      }
    }
    const stale = { ...existing, stale: true, staleReason: error.message };
    writeDisplayCache(cacheFile, stale);
    console.error(`Display data is stale: ${error.message}`);
    return stale;
  }
}

const command = process.argv[2] ?? 'once';
if (command === 'once') await poll();
else if (command === 'watch') { const interval = Math.max(Number(process.env.LIVE_DATA_POLL_SECONDS ?? 20), 10) * 1000; await poll(); setInterval(() => poll().catch((error) => console.error(error.message)), interval); }
else throw new Error(`Unknown command: ${command}`);
