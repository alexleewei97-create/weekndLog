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

test('addCapture appends a pending capture item', () => {
  const s = L.createEmptyState();
  const r = L.addCapture(s, '写关卡文档', '2026-07-02T09:00:00.000Z');
  assert.equal(r.state.captureItems.length, 1);
  assert.equal(r.item.status, 'pending');
  assert.equal(r.item.text, '写关卡文档');
});

test('updateEntity patches and removeEntity removes', () => {
  let s = L.createEmptyState();
  const r = L.addCapture(s, 'x', '2026-07-02T09:00:00.000Z'); s = r.state;
  s = L.updateEntity(s, 'captureItems', r.item.id, { status: 'triaged' });
  assert.equal(s.captureItems[0].status, 'triaged');
  s = L.removeEntity(s, 'captureItems', r.item.id);
  assert.equal(s.captureItems.length, 0);
});

test('addLogEntry / addTask / addCollection set correct defaults', () => {
  let s = L.createEmptyState();
  s = L.addLogEntry(s, { text: '做了A', date: '2026-07-02' });
  assert.equal(s.logEntries[0].isHighlight, false);
  s = L.addTask(s, { text: 'B' });
  assert.equal(s.tasks[0].status, 'todo');
  assert.equal(s.tasks[0].carryOverCount, 0);
  s = L.addCollection(s, { type: 'idea', text: 'C' });
  assert.equal(s.collectionItems[0].ideaStatus, 'raw');
});

test('triageCapture routes and removes the capture', () => {
  let s = L.createEmptyState();
  let r = L.addCapture(s, '做了A', '2026-07-02T09:00:00.000Z'); s = r.state;
  s = L.triageCapture(s, r.item.id, 'log', { date: '2026-07-02', isHighlight: true });
  assert.equal(s.captureItems.length, 0);
  assert.equal(s.logEntries[0].isHighlight, true);
  r = L.addCapture(s, '要做B', '2026-07-02T09:05:00.000Z'); s = r.state;
  s = L.triageCapture(s, r.item.id, 'task', {});
  assert.equal(s.tasks[0].text, '要做B');
  r = L.addCapture(s, '灵感C', '2026-07-02T09:06:00.000Z'); s = r.state;
  s = L.triageCapture(s, r.item.id, 'collection', { type: 'idea' });
  assert.equal(s.collectionItems[0].type, 'idea');
});

test('unfinishedBefore finds overdue undone tasks only', () => {
  let s = L.createEmptyState();
  s = L.addTask(s, { text: '昨天的', dueDate: '2026-07-01' });
  s = L.addTask(s, { text: '今天的', dueDate: '2026-07-02' });
  s = L.addTask(s, { text: '已完成的', dueDate: '2026-07-01', status: 'done' });
  assert.deepEqual(L.unfinishedBefore(s, '2026-07-02').map((t) => t.text), ['昨天的']);
});

test('carryOverTask sets dueDate and increments carryOverCount', () => {
  let s = L.createEmptyState();
  s = L.addTask(s, { text: 'x', dueDate: '2026-07-01' });
  const id = s.tasks[0].id;
  s = L.carryOverTask(s, id, '2026-07-02');
  assert.equal(s.tasks[0].dueDate, '2026-07-02');
  assert.equal(s.tasks[0].carryOverCount, 1);
});

test('filterTasks by status, project, weekFocus, query', () => {
  let s = L.createEmptyState();
  s = L.addTask(s, { text: '关卡设计', status: 'todo', isWeekFocus: true });
  s = L.addTask(s, { text: '数值调整', status: 'done' });
  assert.equal(L.filterTasks(s, { status: 'todo' }).length, 1);
  assert.equal(L.filterTasks(s, { weekFocus: true }).length, 1);
  assert.equal(L.filterTasks(s, { query: '数值' })[0].text, '数值调整');
  assert.equal(L.filterTasks(s, {}).length, 2);
});

test('addGoal and goalsFor scope by horizon+period', () => {
  let s = L.createEmptyState();
  s = L.addGoal(s, { horizon: 'quarter', period: '2026-Q3', title: '上线 Beta' });
  s = L.addGoal(s, { horizon: 'month', period: '2026-07', title: '完成关卡 1-5' });
  assert.equal(L.goalsFor(s, 'quarter', '2026-Q3').length, 1);
  assert.equal(L.goalsFor(s, 'quarter', '2026-Q2').length, 0);
  assert.equal(L.goalsFor(s, 'month', '2026-07')[0].title, '完成关卡 1-5');
});

test('convertIdeaToTask creates a task and marks idea converted', () => {
  let s = L.createEmptyState();
  s = L.addCollection(s, { type: 'idea', text: '双人合作模式', tags: ['玩法'] });
  const id = s.collectionItems[0].id;
  const r = L.convertIdeaToTask(s, id, '2026-07-02T10:00:00.000Z');
  assert.equal(r.task.text, '双人合作模式');
  assert.equal(r.state.tasks.length, 1);
  assert.equal(r.state.collectionItems[0].ideaStatus, 'converted');
  assert.equal(r.state.collectionItems[0].convertedTaskId, r.task.id);
});

test('addProject and addWorkType append with defaults', () => {
  let s = L.createEmptyState();
  const before = s.workTypes.length;
  s = L.addProject(s, { name: '梦幻消消乐' });
  s = L.addWorkType(s, { name: '直播' });
  assert.equal(s.projects[0].name, '梦幻消消乐');
  assert.equal(s.projects[0].archived, false);
  assert.equal(s.workTypes.length, before + 1);
});

test('generateReport groups outputs by project with headings and highlights', () => {
  let s = L.createEmptyState();
  s = L.addProject(s, { name: '消消乐' });
  const pid = s.projects[0].id;
  s = L.addLogEntry(s, { text: '完成关卡1', date: '2026-07-02', projectId: pid, workType: '策划', isHighlight: true });
  s = L.addLogEntry(s, { text: '开策划会', date: '2026-07-03', workType: '会议' });
  const wid = L.weekId(L.parseDate('2026-07-02'));
  s = L.addGoal(s, { horizon: 'week', period: wid, title: '关卡1-5 定稿' });
  const out = L.generateReport(s, 'week', wid);
  assert.match(out, /^# 周报/m);
  assert.match(out, /## 重点进展/);
  assert.match(out, /### 消消乐/);
  assert.match(out, /⭐ \[策划\] 完成关卡1/);
  assert.match(out, /### 未归类/);
  assert.match(out, /关卡1-5 定稿/);
});

test('buildTimeline groups by month/week/day newest-first', () => {
  let s = L.createEmptyState();
  s = L.addLogEntry(s, { text: '六月的事', date: '2026-06-15' });
  s = L.addLogEntry(s, { text: '七月的事', date: '2026-07-02' });
  const tl = L.buildTimeline(s, {});
  assert.equal(tl.months[0].monthId, '2026-07');
  assert.equal(tl.months[1].monthId, '2026-06');
  assert.equal(tl.months[0].weeks[0].days[0].entries[0].text, '七月的事');
});

test('buildTimeline filters by query across sources', () => {
  let s = L.createEmptyState();
  s = L.addLogEntry(s, { text: '关卡设计', date: '2026-07-02' });
  s = L.addLogEntry(s, { text: '数值调整', date: '2026-07-03' });
  const tl = L.buildTimeline(s, { query: '关卡' });
  const days = tl.months.flatMap((m) => m.weeks.flatMap((w) => w.days));
  assert.equal(days.length, 1);
  assert.equal(days[0].entries[0].text, '关卡设计');
});
