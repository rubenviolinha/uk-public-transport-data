import { appendFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const url = process.env.DISPLAY_URL ?? 'http://127.0.0.1:8787/api/v1/display?deviceId=demo-display';
const intervalMs = Math.max(Number(process.env.VALIDATION_INTERVAL_SECONDS ?? 30), 1) * 1000;
const durationMs = Math.max(Number(process.env.VALIDATION_DURATION_SECONDS ?? 0), 0) * 1000;
const reportFile = resolve(process.env.VALIDATION_REPORT_FILE ?? 'data/validation/display-samples.jsonl');
mkdirSync(dirname(reportFile), { recursive: true });
if (!existsSync(reportFile) || process.env.VALIDATION_APPEND !== 'true') writeFileSync(reportFile, '');

const startedAt = Date.now();
const sample = async () => {
  const requestedAt = Date.now();
  const record = { requestedAt: new Date(requestedAt).toISOString(), url };
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
    const body = await response.json();
    record.ok = response.ok && Array.isArray(body.departures);
    record.statusCode = response.status;
    record.latencyMs = Date.now() - requestedAt;
    record.stale = Boolean(body.stale);
    record.departureCount = body.departures?.length ?? 0;
    record.stop = body.stop?.name ?? null;
    if (!response.ok) record.error = body.error ?? `HTTP ${response.status}`;
  } catch (error) {
    record.ok = false;
    record.latencyMs = Date.now() - requestedAt;
    record.error = error.message;
  }
  appendFileSync(reportFile, `${JSON.stringify(record)}\n`);
  console.log(`${record.ok ? 'OK' : 'FAIL'} ${record.latencyMs}ms${record.stale ? ' stale' : ''}${record.error ? ` — ${record.error}` : ''}`);
};

await sample();
if (durationMs > 0) {
  while (Date.now() - startedAt + intervalMs <= durationMs) {
    await new Promise((resolveWait) => setTimeout(resolveWait, intervalMs));
    await sample();
  }
}

