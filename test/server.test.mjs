import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findOpenPort, startServer, resolvePaths } from '../server.mjs';

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
