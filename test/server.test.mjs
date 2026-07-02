import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { findOpenPort, startServer, resolvePaths } from '../server.mjs';
import { readdir, mkdir as mkdirp, writeFile as writeFileP } from 'node:fs/promises';

test('resolvePaths returns expected file names', () => {
  const p = resolvePaths('/tmp/x');
  assert.ok(p.dataFile.endsWith('weikenlog-data.json'));
  assert.ok(p.backupsDir.endsWith('backups'));
  assert.equal(p.staticRoot, '/tmp/x');
});

test('findOpenPort returns a usable port >= start', async () => {
  const port = await findOpenPort(8900);
  assert.ok(port >= 8900);
});

test('server responds ok to /api/health', async () => {
  const port = await findOpenPort(8950);
  const server = startServer({ port, rootDir: process.cwd() });
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/health`);
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.equal(body.ok, true);
  } finally {
    server.close();
  }
});

test('readJSON returns fallback when file is missing', async () => {
  const { readJSON } = await import('../server.mjs');
  const val = await readJSON('/no/such/file.json', { fallback: true });
  assert.deepEqual(val, { fallback: true });
});

test('POST then GET /api/data roundtrips and writes to disk', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'wl-'));
  const port = await findOpenPort(9010);
  const server = startServer({ port, rootDir: dir });
  try {
    const payload = { schemaVersion: 1, note: '世界' };
    const post = await fetch(`http://127.0.0.1:${port}/api/data`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    assert.equal((await post.json()).ok, true);
    const got = await (await fetch(`http://127.0.0.1:${port}/api/data`)).json();
    assert.deepEqual(got, payload);
    const onDisk = JSON.parse(await readFile(path.join(dir, 'weikenlog-data.json'), 'utf8'));
    assert.deepEqual(onDisk, payload);
  } finally { server.close(); await rm(dir, { recursive: true, force: true }); }
});

test('GET /api/data returns null when no file yet', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'wl-'));
  const port = await findOpenPort(9060);
  const server = startServer({ port, rootDir: dir });
  try {
    const got = await (await fetch(`http://127.0.0.1:${port}/api/data`)).json();
    assert.equal(got, null);
  } finally { server.close(); await rm(dir, { recursive: true, force: true }); }
});

test('snapshotIfNeeded writes at most once per day', async () => {
  const { snapshotIfNeeded } = await import('../server.mjs');
  const dir = await mkdtemp(path.join(tmpdir(), 'wl-'));
  const backups = path.join(dir, 'backups');
  const first = await snapshotIfNeeded({ a: 1 }, backups, '2026-07-02');
  const second = await snapshotIfNeeded({ a: 2 }, backups, '2026-07-02');
  assert.equal(first, true);
  assert.equal(second, false);
  assert.deepEqual(await readdir(backups), ['2026-07-02.json']);
  await rm(dir, { recursive: true, force: true });
});

test('pruneBackups keeps only the newest N snapshots', async () => {
  const { pruneBackups } = await import('../server.mjs');
  const dir = await mkdtemp(path.join(tmpdir(), 'wl-'));
  const backups = path.join(dir, 'backups');
  await mkdirp(backups, { recursive: true });
  for (const d of ['2026-06-01', '2026-06-02', '2026-06-03', '2026-06-04']) {
    await writeFileP(path.join(backups, `${d}.json`), '{}', 'utf8');
  }
  const removed = await pruneBackups(backups, 2);
  assert.deepEqual(removed, ['2026-06-01', '2026-06-02']);
  assert.deepEqual((await readdir(backups)).sort(), ['2026-06-03.json', '2026-06-04.json']);
  await rm(dir, { recursive: true, force: true });
});
