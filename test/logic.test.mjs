import { test } from 'node:test';
import assert from 'node:assert/strict';
import L from '../src/logic.js';

test('createEmptyState has schemaVersion, default work types, settings', () => {
  const s = L.createEmptyState();
  assert.equal(s.schemaVersion, 1);
  assert.deepEqual(s.workTypes.map((w) => w.name),
    ['策划', '研发协调', '美术', '会议', '评审', '对外沟通', '杂务']);
  assert.equal(s.settings.backupRetention, 30);
  assert.equal(s.settings.lastBackupAt, null);
  for (const key of ['projects','captureItems','logEntries','tasks','goals','collectionItems']) {
    assert.ok(Array.isArray(s[key]), `${key} is array`);
  }
});

test('uid produces unique prefixed ids', () => {
  const a = L.uid('task');
  const b = L.uid('task');
  assert.notEqual(a, b);
  assert.ok(a.startsWith('task_'));
});
