import { Client } from 'ssh2';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { mkdir, rename } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { connect as connectTls } from 'node:tls';
import { gunzipSync } from 'node:zlib';

const projectRoot = process.cwd();
const outputDirectory = join(projectRoot, 'data', 'darwin');
const snapshotFile = join(outputDirectory, 'snapshot.gz');
const boardFile = join(outputDirectory, 'rugby-departures.json');
const topicStatusFile = join(outputDirectory, 'live-topic-status.json');
const station = process.env.DARWIN_STATION ?? 'RUGBY';

function loadEnv() {
  const file = join(projectRoot, '.env');
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
  }
}

function requireEnv(...names) {
  const missing = names.filter((name) => !process.env[name] || process.env[name] === 'replace_me');
  if (missing.length) throw new Error(`Missing environment values: ${missing.join(', ')}`);
}

function attributes(markup) {
  return Object.fromEntries([...markup.matchAll(/([A-Za-z0-9_]+)="([^"]*)"/g)].map((match) => [match[1], match[2]]));
}

function parseSchedules(xml) {
  const schedules = new Map();
  for (const document of xml.split(/(?=<\?xml )/)) {
    const match = document.match(/<schedule\s+([^>]+)>([\s\S]*?)<\/schedule>/);
    if (!match) continue;
    const service = attributes(match[1]);
    const locations = [...match[2].matchAll(/<(?:ns2:)?(?:OR|IP|DT)\s+([^>]+)\/>/g)].map((item) => attributes(item[1]));
    schedules.set(service.rid, {
      operator: service.toc ?? null,
      serviceId: service.trainId ?? null,
      origin: locations[0]?.tpl ?? null,
      destination: locations.at(-1)?.tpl ?? null
    });
  }
  return schedules;
}

function parseDepartures(xml, stationCode) {
  const schedules = parseSchedules(xml);
  const departures = [];
  for (const document of xml.split(/(?=<\?xml )/)) {
    const trainStatus = document.match(/<TS\s+([^>]+)>([\s\S]*?)<\/TS>/);
    if (!trainStatus) continue;
    const train = attributes(trainStatus[1]);
    const locationPattern = new RegExp(`<ns5:Location\\s+([^>]*\\btpl="${stationCode}"[^>]*)>([\\s\\S]*?)<\\/ns5:Location>`, 'g');
    for (const locationMatch of trainStatus[2].matchAll(locationPattern)) {
      const location = attributes(locationMatch[1]);
      const departure = locationMatch[2].match(/<ns5:dep\s+([^/>]*)\/>/);
      if (!location.ptd || !departure) continue;
      const prediction = attributes(departure[1]);
      const platform = locationMatch[2].match(/<ns5:plat[^>]*>([^<]+)<\/ns5:plat>/)?.[1] ?? null;
      departures.push({
        station: stationCode,
        scheduledTime: location.ptd,
        expectedTime: prediction.et ?? prediction.at ?? null,
        platform,
        predictionSource: prediction.src ?? null,
        runId: train.rid,
        journeyId: train.uid,
        ...schedules.get(train.rid)
      });
    }
  }
  return departures.sort((a, b) => a.scheduledTime.localeCompare(b.scheduledTime));
}

async function downloadSnapshot() {
  requireEnv('DARWIN_SFTP_HOST', 'DARWIN_SFTP_PORT', 'DARWIN_SFTP_USERNAME', 'DARWIN_SFTP_PASSWORD', 'DARWIN_SFTP_SNAPSHOT_DIRECTORY');
  await mkdir(outputDirectory, { recursive: true });
  const temporaryFile = `${snapshotFile}.part`;
  const remoteFile = `${process.env.DARWIN_SFTP_SNAPSHOT_DIRECTORY.replace(/\/$/, '')}/snapshot.gz`;
  await new Promise((resolve, reject) => {
    const client = new Client();
    client.on('ready', () => client.sftp((error, sftp) => {
      if (error) return reject(error);
      client.on('close', resolve);
      sftp.fastGet(remoteFile, temporaryFile, (downloadError) => {
        if (downloadError) reject(downloadError);
        else client.end();
      });
    })).on('error', reject).connect({
      host: process.env.DARWIN_SFTP_HOST,
      port: Number(process.env.DARWIN_SFTP_PORT),
      username: process.env.DARWIN_SFTP_USERNAME,
      password: process.env.DARWIN_SFTP_PASSWORD
    });
  });
  await rename(temporaryFile, snapshotFile);
  const xml = gunzipSync(readFileSync(snapshotFile)).toString('utf8');
  const departures = parseDepartures(xml, station);
  const board = { generatedAt: new Date().toISOString(), station, departures };
  writeFileSync(boardFile, `${JSON.stringify(board, null, 2)}\n`);
  console.log(`Saved ${departures.length} ${station} departures to ${boardFile}`);
  return board;
}

function stompEscape(value) {
  return value.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/:/g, '\\c');
}

async function listenToTopic(durationMs) {
  requireEnv('DARWIN_MESSAGING_HOST', 'DARWIN_STOMP_PORT', 'DARWIN_TOPIC_USERNAME', 'DARWIN_TOPIC_PASSWORD', 'DARWIN_LIVE_FEED_TOPIC');
  await mkdir(outputDirectory, { recursive: true });
  const topic = process.env.DARWIN_LIVE_FEED_TOPIC.startsWith('/topic/')
    ? process.env.DARWIN_LIVE_FEED_TOPIC
    : `/topic/${process.env.DARWIN_LIVE_FEED_TOPIC}`;
  const status = { startedAt: new Date().toISOString(), topic, messageCount: 0, compressedMessageCount: 0, lastMessageAt: null };
  await new Promise((resolve, reject) => {
    const socket = connectTls({ host: process.env.DARWIN_MESSAGING_HOST, port: Number(process.env.DARWIN_STOMP_PORT), rejectUnauthorized: true });
    let connected = false;
    let buffer = Buffer.alloc(0);
    const finish = () => { socket.end(); resolve(); };
    const timer = setTimeout(finish, durationMs);
    socket.on('secureConnect', () => socket.write(`CONNECT\naccept-version:1.2\nhost:${stompEscape(process.env.DARWIN_MESSAGING_HOST)}\nlogin:${stompEscape(process.env.DARWIN_TOPIC_USERNAME)}\npasscode:${stompEscape(process.env.DARWIN_TOPIC_PASSWORD)}\nheart-beat:0,0\n\n\0`));
    socket.on('data', (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);
      while (true) {
        const split = buffer.indexOf(Buffer.from('\n\n'));
        if (split === -1) return;
        const header = buffer.subarray(0, split).toString('utf8');
        const length = Number(header.match(/(?:^|\n)content-length:(\d+)/)?.[1]);
        const bodyStart = split + 2;
        const end = Number.isFinite(length) ? bodyStart + length : buffer.indexOf(0, bodyStart);
        if (end === -1 || buffer.length <= end) return;
        const body = buffer.subarray(bodyStart, end);
        buffer = buffer.subarray(end + 1);
        if (header.startsWith('CONNECTED')) {
          connected = true;
          socket.write(`SUBSCRIBE\nid:darwin-rugby-poller\ndestination:${topic}\nack:auto\n\n\0`);
        } else if (header.startsWith('MESSAGE')) {
          status.messageCount += 1;
          status.lastMessageAt = new Date().toISOString();
          if (body.subarray(0, 2).equals(Buffer.from([0x1f, 0x8b]))) status.compressedMessageCount += 1;
        }
      }
    });
    socket.on('error', (error) => { clearTimeout(timer); reject(error); });
    socket.on('close', () => { if (!connected) reject(new Error('Darwin topic closed before STOMP connected')); });
  });
  status.finishedAt = new Date().toISOString();
  writeFileSync(topicStatusFile, `${JSON.stringify(status, null, 2)}\n`);
  console.log(`Darwin topic: ${status.messageCount} messages in ${durationMs / 1000}s`);
  return status;
}

loadEnv();
const command = process.argv[2] ?? 'snapshot';
if (command === 'snapshot') await downloadSnapshot();
else if (command === 'topic') await listenToTopic(Number(process.env.DARWIN_TOPIC_TEST_SECONDS ?? 60) * 1000);
else if (command === 'watch') {
  const intervalMs = Math.max(Number(process.env.DARWIN_SNAPSHOT_INTERVAL_SECONDS ?? 60), 30) * 1000;
  await downloadSnapshot();
  await listenToTopic(intervalMs - 1000);
  setInterval(() => downloadSnapshot().catch((error) => console.error(error.message)), intervalMs);
} else throw new Error(`Unknown command: ${command}`);
