import { Client } from 'ssh2';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { mkdir, rename } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { connect as connectTls } from 'node:tls';
import { gunzipSync } from 'node:zlib';
import { mergeDarwinDepartures, parseDarwinDepartures } from '../src/darwin-data.mjs';
import { loadDotEnv } from '../src/env.mjs';

const projectRoot = process.cwd();
const outputDirectory = join(projectRoot, 'data', 'darwin');
const snapshotFile = join(outputDirectory, 'snapshot.gz');
const boardFile = join(outputDirectory, 'rugby-departures.json');
const topicStatusFile = join(outputDirectory, 'live-topic-status.json');
const station = process.env.DARWIN_STATION ?? 'RUGBY';

function requireEnv(...names) {
  const missing = names.filter((name) => !process.env[name] || process.env[name] === 'replace_me');
  if (missing.length) throw new Error(`Missing environment values: ${missing.join(', ')}`);
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
  const departures = parseDarwinDepartures(xml, station);
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
  let board = { station, departures: [] };
  if (existsSync(boardFile)) {
    try {
      board = JSON.parse(readFileSync(boardFile, 'utf8'));
    } catch {
      // Start from an empty board if the previous cache is corrupt.
    }
  }
  let appliedUpdateCount = 0;
  let parseErrorCount = 0;
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
          try {
            const message = body.subarray(0, 2).equals(Buffer.from([0x1f, 0x8b])) ? gunzipSync(body) : body;
            const updates = parseDarwinDepartures(message.toString('utf8'), station);
            if (updates.length) {
              board.departures = mergeDarwinDepartures(board.departures ?? [], updates);
              board.generatedAt = new Date().toISOString();
              appliedUpdateCount += updates.length;
            }
          } catch {
            parseErrorCount += 1;
          }
        }
      }
    });
    socket.on('error', (error) => { clearTimeout(timer); reject(error); });
    socket.on('close', () => { if (!connected) reject(new Error('Darwin topic closed before STOMP connected')); });
  });
  status.appliedUpdateCount = appliedUpdateCount;
  status.parseErrorCount = parseErrorCount;
  status.finishedAt = new Date().toISOString();
  if (appliedUpdateCount) writeFileSync(boardFile, `${JSON.stringify(board, null, 2)}\n`);
  writeFileSync(topicStatusFile, `${JSON.stringify(status, null, 2)}\n`);
  console.log(`Darwin topic: ${status.messageCount} messages in ${durationMs / 1000}s`);
  return status;
}

loadDotEnv(join(projectRoot, '.env'));
const command = process.argv[2] ?? 'snapshot';
if (command === 'snapshot') await downloadSnapshot();
else if (command === 'topic') await listenToTopic(Number(process.env.DARWIN_TOPIC_TEST_SECONDS ?? 60) * 1000);
else if (command === 'watch') {
  const intervalMs = Math.max(Number(process.env.DARWIN_SNAPSHOT_INTERVAL_SECONDS ?? 60), 30) * 1000;
  await downloadSnapshot();
  await listenToTopic(intervalMs - 1000);
  setInterval(() => downloadSnapshot().catch((error) => console.error(error.message)), intervalMs);
} else throw new Error(`Unknown command: ${command}`);
