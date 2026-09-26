import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadDotEnv } from '../src/env.mjs';
import { mergeTransportData, readDarwinBoard, writeDisplayCache } from '../src/transport-data.mjs';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
loadDotEnv(join(root, '.env'));
const cacheFile = resolve(process.env.DISPLAY_DATA_FILE ?? join(root, 'data', 'cache', 'display.json'));
const darwinFile = resolve(process.env.DARWIN_BOARD_FILE ?? join(root, 'data', 'darwin', 'rugby-departures.json'));
const busUrl = process.env.BODS_DEPARTURES_URL;

async function fetchBus() {
  if (!busUrl) return { departures: [] };
  const response = await fetch(busUrl, { headers: process.env.BODS_API_KEY ? { 'x-api-key': process.env.BODS_API_KEY, authorization: `Bearer ${process.env.BODS_API_KEY}` } : undefined });
  if (!response.ok) throw new Error(`BODS request failed: ${response.status}`);
  return response.json();
}

async function poll() {
  try {
    if (!busUrl && !existsSync(darwinFile)) throw new Error('No transport sources configured; set BODS_DEPARTURES_URL or run darwin:snapshot first');
    const bus = await fetchBus();
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
