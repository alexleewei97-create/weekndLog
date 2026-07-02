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

test('isoDate / parseDate roundtrip', () => {
  assert.equal(L.isoDate(new Date(2026, 6, 2)), '2026-07-02');
  assert.equal(L.isoDate(L.parseDate('2026-07-02')), '2026-07-02');
});

test('ISO weekId handles year boundary', () => {
  assert.equal(L.weekId(new Date(2026, 0, 1)), '2026-W01');   // Thu Jan 1 2026
  assert.equal(L.weekId(new Date(2025, 11, 29)), '2026-W01'); // Mon belongs to 2026-W01
});

test('month / quarter / half ids', () => {
  assert.equal(L.monthId(new Date(2026, 6, 2)), '2026-07');
  assert.equal(L.quarterId(new Date(2026, 6, 2)), '2026-Q3');
  assert.equal(L.halfId(new Date(2026, 6, 2)), '2026-H2');
  assert.equal(L.halfId(new Date(2026, 2, 2)), '2026-H1');
});

test('periodRange for each horizon', () => {
  assert.deepEqual(L.periodRange('week', '2026-W01'), { start: '2025-12-29', end: '2026-01-04' });
  assert.deepEqual(L.periodRange('month', '2026-02'), { start: '2026-02-01', end: '2026-02-28' });
  assert.deepEqual(L.periodRange('quarter', '2026-Q3'), { start: '2026-07-01', end: '2026-09-30' });
  assert.deepEqual(L.periodRange('half', '2026-H2'), { start: '2026-07-01', end: '2026-12-31' });
});

test('shiftPeriod navigates across boundaries', () => {
  assert.equal(L.shiftPeriod('month', '2026-01', -1), '2025-12');
  assert.equal(L.shiftPeriod('quarter', '2026-Q1', -1), '2025-Q4');
  assert.equal(L.shiftPeriod('half', '2026-H2', 1), '2027-H1');
  assert.equal(L.shiftPeriod('week', '2026-W01', -1), '2025-W52');
});

test('dateInPeriod', () => {
  assert.equal(L.dateInPeriod('2026-07-15', 'month', '2026-07'), true);
  assert.equal(L.dateInPeriod('2026-08-01', 'month', '2026-07'), false);
  assert.equal(L.dateInPeriod('2026-09-30', 'quarter', '2026-Q3'), true);
});
