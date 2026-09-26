import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildDisplayResponse, defaultConfig, loadConfigStore, readJson, validateConfig, writeJson } from './display-contract.mjs';
import { hasValidBearerToken } from './auth.mjs';
import { loadDotEnv } from './env.mjs';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
loadDotEnv(join(root, '.env'));
const port = Number(process.env.PORT ?? 8787);
const fixtureFile = resolve(process.env.DISPLAY_DATA_FILE ?? (existsSync(join(root, 'data', 'cache', 'display.json')) ? join(root, 'data', 'cache', 'display.json') : join(root, 'data', 'fixtures', 'display.json')));
const configFile = resolve(process.env.DISPLAY_CONFIG_FILE ?? join(root, 'data', 'config', 'devices.json'));
const staticRoot = join(root, 'web');
const adminToken = process.env.DISPLAY_ADMIN_TOKEN;
let configs = loadConfigStore(configFile);

function json(response, status, body) {
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-security-policy': "default-src 'none'; frame-ancestors 'none'",
    'referrer-policy': 'no-referrer',
    'x-content-type-options': 'nosniff',
    'x-frame-options': 'DENY'
  });
  response.end(`${JSON.stringify(body)}\n`);
}

function requireAdmin(request) {
  if (process.env.NODE_ENV !== 'production' && !adminToken) return;
  if (!hasValidBearerToken(request.headers, adminToken)) {
    const error = new Error('admin authentication required');
    error.statusCode = 401;
    throw error;
  }
}

function body(request) {
  return new Promise((resolveBody, reject) => {
    let value = '';
    request.on('data', (chunk) => { value += chunk; if (value.length > 100_000) reject(new Error('request too large')); });
    request.on('end', () => resolveBody(value ? JSON.parse(value) : {}));
    request.on('error', reject);
  });
}

async function serveStatic(request, response, pathname) {
  const requested = pathname === '/' ? '/index.html' : pathname;
  const file = resolve(join(staticRoot, requested.slice(1)));
  if (!file.startsWith(`${staticRoot}/`)) return json(response, 403, { error: 'forbidden' });
  try {
    const content = await readFile(file);
    const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };
    response.writeHead(200, { 'content-type': types[extname(file)] ?? 'application/octet-stream' });
    response.end(content);
  } catch { json(response, 404, { error: 'not found' }); }
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host ?? 'localhost'}`);
  try {
    if (url.pathname === '/health') return json(response, 200, { ok: true });
    if (url.pathname === '/api/v1/display' && request.method === 'GET') {
      const deviceId = url.searchParams.get('deviceId') ?? defaultConfig.deviceId;
      const config = configs[deviceId];
      if (!config) return json(response, 404, { error: 'unknown device' });
      return json(response, 200, buildDisplayResponse({ data: readJson(fixtureFile, { departures: [], stale: true }), config }));
    }
    const configMatch = url.pathname.match(/^\/api\/v1\/devices\/([^/]+)\/config$/);
    if (configMatch && request.method === 'GET') {
      requireAdmin(request);
      const config = configs[configMatch[1]];
      return config ? json(response, 200, config) : json(response, 404, { error: 'unknown device' });
    }
    if (configMatch && request.method === 'PUT') {
      requireAdmin(request);
      const next = validateConfig({ ...(await body(request)), deviceId: configMatch[1] });
      configs[next.deviceId] = next;
      writeJson(configFile, configs);
      return json(response, 200, next);
    }
    if (url.pathname === '/api/v1/provision' && request.method === 'POST') {
      requireAdmin(request);
      const next = validateConfig(await body(request));
      configs[next.deviceId] = next;
      writeJson(configFile, configs);
      return json(response, 201, next);
    }
    return serveStatic(request, response, url.pathname);
  } catch (error) {
    return json(response, error.statusCode ?? 400, { error: error.message });
  }
});

server.listen(port, () => console.log(`Display server listening on http://localhost:${port}`));
