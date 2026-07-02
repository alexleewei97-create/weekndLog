(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.WeikenLogic = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const SCHEMA_VERSION = 1;
  const DEFAULT_WORK_TYPES = ['策划', '研发协调', '美术', '会议', '评审', '对外沟通', '杂务'];

  let _counter = 0;
  function uid(prefix) {
    _counter = (_counter + 1) % 1e6;
    return `${prefix || 'id'}_${Date.now().toString(36)}_${_counter.toString(36)}`;
  }

  function defaultTemplates() {
    return { headings: { progress: '重点进展', output: '具体产出', risk: '问题与风险', plan: '下阶段计划' } };
  }

  function createEmptyState() {
    return {
      schemaVersion: SCHEMA_VERSION,
      projects: [],
      workTypes: DEFAULT_WORK_TYPES.map((name) => ({ id: uid('wt'), name, archived: false })),
      captureItems: [],
      logEntries: [],
      tasks: [],
      goals: [],
      collectionItems: [],
      settings: {
        lastBackupAt: null,
        backupRetention: 30,
        theme: 'light',
        reportTemplates: defaultTemplates(),
      },
    };
  }

  function pad2(n) { return String(n).padStart(2, '0'); }

  function isoDate(date) {
    date = date || new Date();
    return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
  }

  function parseDate(str) {
    const [y, m, d] = str.split('-').map(Number);
    return new Date(y, m - 1, d);
  }

  function weekId(date) {
    const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const day = (d.getDay() + 6) % 7;      // Mon=0..Sun=6
    d.setDate(d.getDate() - day + 3);       // Thursday of this ISO week
    const isoYear = d.getFullYear();
    const jan4 = new Date(isoYear, 0, 4);
    const jan4day = (jan4.getDay() + 6) % 7;
    const week1Thursday = new Date(isoYear, 0, 4 - jan4day + 3);
    const week = 1 + Math.round((d - week1Thursday) / 604800000);
    return `${isoYear}-W${pad2(week)}`;
  }

  function isoWeekStart(isoYear, week) {
    const jan4 = new Date(isoYear, 0, 4);
    const jan4day = (jan4.getDay() + 6) % 7;
    const monday = new Date(isoYear, 0, 4 - jan4day);
    monday.setDate(monday.getDate() + (week - 1) * 7);
    return monday;
  }

  function monthId(date) { return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}`; }
  function quarterId(date) { return `${date.getFullYear()}-Q${Math.floor(date.getMonth() / 3) + 1}`; }
  function halfId(date) { return `${date.getFullYear()}-H${date.getMonth() < 6 ? 1 : 2}`; }

  function periodRange(horizon, periodId) {
    if (horizon === 'week') {
      const [y, w] = periodId.split('-W').map(Number);
      const start = isoWeekStart(y, w);
      const end = new Date(start); end.setDate(start.getDate() + 6);
      return { start: isoDate(start), end: isoDate(end) };
    }
    if (horizon === 'month') {
      const [y, m] = periodId.split('-').map(Number);
      const start = new Date(y, m - 1, 1);
      const end = new Date(y, m, 0);
      return { start: isoDate(start), end: isoDate(end) };
    }
    if (horizon === 'quarter') {
      const [y, q] = periodId.split('-Q').map(Number);
      const sm = (q - 1) * 3;
      return { start: isoDate(new Date(y, sm, 1)), end: isoDate(new Date(y, sm + 3, 0)) };
    }
    if (horizon === 'half') {
      const [y, h] = periodId.split('-H').map(Number);
      const sm = (h - 1) * 6;
      return { start: isoDate(new Date(y, sm, 1)), end: isoDate(new Date(y, sm + 6, 0)) };
    }
    throw new Error('unknown horizon: ' + horizon);
  }

  function periodLabel(horizon, periodId) {
    const { start, end } = periodRange(horizon, periodId);
    const md = (s) => s.slice(5).replace('-', '/');
    if (horizon === 'week') return `${periodId}（${md(start)}–${md(end)}）`;
    if (horizon === 'month') { const [y, m] = periodId.split('-'); return `${y}年${m}月`; }
    if (horizon === 'quarter') { const [y, q] = periodId.split('-Q'); return `${y} Q${q}（${md(start)}–${md(end)}）`; }
    if (horizon === 'half') { const [y, h] = periodId.split('-H'); return `${y} ${h === '1' ? '上半年' : '下半年'}`; }
    return periodId;
  }

  function shiftPeriod(horizon, periodId, delta) {
    if (horizon === 'week') {
      const [y, w] = periodId.split('-W').map(Number);
      const monday = isoWeekStart(y, w);
      monday.setDate(monday.getDate() + delta * 7);
      return weekId(monday);
    }
    if (horizon === 'month') {
      const [y, m] = periodId.split('-').map(Number);
      return monthId(new Date(y, m - 1 + delta, 1));
    }
    if (horizon === 'quarter') {
      const [y, q] = periodId.split('-Q').map(Number);
      return quarterId(new Date(y, (q - 1) * 3 + delta * 3, 1));
    }
    if (horizon === 'half') {
      const [y, h] = periodId.split('-H').map(Number);
      return halfId(new Date(y, (h - 1) * 6 + delta * 6, 1));
    }
    throw new Error('unknown horizon: ' + horizon);
  }

  function dateInPeriod(dateStr, horizon, periodId) {
    const { start, end } = periodRange(horizon, periodId);
    return dateStr >= start && dateStr <= end;
  }

  function addCapture(state, text, nowIso) {
    const item = { id: uid('cap'), text, createdAt: nowIso, status: 'pending' };
    return { state: { ...state, captureItems: [...state.captureItems, item] }, item };
  }
  function updateEntity(state, key, id, patch) {
    return { ...state, [key]: state[key].map((x) => (x.id === id ? { ...x, ...patch } : x)) };
  }
  function removeEntity(state, key, id) {
    return { ...state, [key]: state[key].filter((x) => x.id !== id) };
  }

  function addLogEntry(state, fields) {
    const e = { id: uid('log'), date: fields.date || isoDate(new Date()), text: fields.text || '',
      projectId: fields.projectId || null, workType: fields.workType || null, tags: fields.tags || [],
      isHighlight: !!fields.isHighlight, createdAt: fields.createdAt || new Date().toISOString() };
    return { ...state, logEntries: [...state.logEntries, e] };
  }
  function addTask(state, fields) {
    const t = { id: uid('task'), text: fields.text || '', projectId: fields.projectId || null,
      workType: fields.workType || null, tags: fields.tags || [], status: fields.status || 'todo',
      isWeekFocus: !!fields.isWeekFocus, linkedGoalId: fields.linkedGoalId || null,
      dueDate: fields.dueDate || null, createdAt: fields.createdAt || new Date().toISOString(),
      completedAt: null, carryOverCount: 0 };
    return { ...state, tasks: [...state.tasks, t] };
  }
  function addCollection(state, fields) {
    const isIdea = fields.type === 'idea';
    const c = { id: uid('col'), type: isIdea ? 'idea' : 'note', text: fields.text || '',
      projectId: fields.projectId || null, tags: fields.tags || [],
      ideaStatus: isIdea ? (fields.ideaStatus || 'raw') : null, convertedTaskId: null,
      createdAt: fields.createdAt || new Date().toISOString() };
    return { ...state, collectionItems: [...state.collectionItems, c] };
  }
  function triageCapture(state, captureId, target, payload) {
    const cap = state.captureItems.find((c) => c.id === captureId);
    if (!cap) return state;
    let s = state;
    if (target === 'log') s = addLogEntry(s, { text: cap.text, ...payload });
    else if (target === 'task') s = addTask(s, { text: cap.text, ...payload });
    else if (target === 'collection') s = addCollection(s, { text: cap.text, ...payload });
    return removeEntity(s, 'captureItems', captureId);
  }

  function unfinishedBefore(state, dateStr) {
    return state.tasks.filter((t) => {
      if (t.status === 'done') return false;
      const ref = t.dueDate || (t.createdAt ? t.createdAt.slice(0, 10) : dateStr);
      return ref < dateStr;
    });
  }
  function carryOverTask(state, taskId, toDate) {
    return { ...state, tasks: state.tasks.map((t) => (t.id === taskId
      ? { ...t, dueDate: toDate, carryOverCount: (t.carryOverCount || 0) + 1 } : t)) };
  }

  function filterTasks(state, opts) {
    opts = opts || {};
    const q = (opts.query || '').toLowerCase();
    return state.tasks.filter((t) => {
      if (opts.projectId && t.projectId !== opts.projectId) return false;
      if (opts.status && t.status !== opts.status) return false;
      if (opts.weekFocus && !t.isWeekFocus) return false;
      if (opts.tag && !(t.tags || []).includes(opts.tag)) return false;
      if (q && !(t.text || '').toLowerCase().includes(q)) return false;
      return true;
    });
  }

  function addGoal(state, fields) {
    const g = { id: uid('goal'), horizon: fields.horizon, period: fields.period, title: fields.title || '',
      projectId: fields.projectId || null, status: fields.status || 'planned',
      progressNote: fields.progressNote || '', createdAt: fields.createdAt || new Date().toISOString() };
    return { ...state, goals: [...state.goals, g] };
  }
  function goalsFor(state, horizon, periodId) {
    return state.goals.filter((g) => g.horizon === horizon && g.period === periodId);
  }

  function convertIdeaToTask(state, collectionId, nowIso) {
    const item = state.collectionItems.find((c) => c.id === collectionId);
    if (!item) return { state, task: null };
    const s1 = addTask(state, { text: item.text, projectId: item.projectId, tags: item.tags, createdAt: nowIso });
    const task = s1.tasks[s1.tasks.length - 1];
    const s2 = updateEntity(s1, 'collectionItems', collectionId, { ideaStatus: 'converted', convertedTaskId: task.id });
    return { state: s2, task };
  }

  function addProject(state, fields) {
    const p = { id: uid('proj'), name: fields.name || '未命名项目', color: fields.color || '#3b6ef5', archived: false };
    return { ...state, projects: [...state.projects, p] };
  }
  function addWorkType(state, fields) {
    const w = { id: uid('wt'), name: fields.name || '未命名', archived: false };
    return { ...state, workTypes: [...state.workTypes, w] };
  }

  function projectName(state, id) { const p = state.projects.find((x) => x.id === id); return p ? p.name : '未归类'; }

  function generateReport(state, type, periodId) {
    const horizon = type; // 'week' | 'month'
    const { start, end } = periodRange(horizon, periodId);
    const inPeriod = (d) => d >= start && d <= end;
    const H = (state.settings.reportTemplates && state.settings.reportTemplates.headings) ||
      { progress: '重点进展', output: '具体产出', risk: '问题与风险', plan: '下阶段计划' };
    const typeLabel = type === 'week' ? '周报' : '月报';

    // 1) Progress: goals for this horizon+period; for month, also the containing quarter.
    const goals = goalsFor(state, horizon, periodId).slice();
    if (type === 'month') {
      const qid = quarterId(parseDate(start));
      for (const g of goalsFor(state, 'quarter', qid)) goals.push(g);
    }
    const goalLines = goals.length
      ? goals.map((g) => `- ${g.projectId ? `[${projectName(state, g.projectId)}] ` : ''}${g.title}${g.progressNote ? ` —— ${g.progressNote}` : ''}`).join('\n')
      : '（暂无重点目标）';

    // 2) Outputs: log entries + tasks completed in period, grouped by project, highlights first.
    const logs = state.logEntries.filter((e) => inPeriod(e.date));
    const doneTasks = state.tasks.filter((t) => t.status === 'done' && t.completedAt && inPeriod(t.completedAt.slice(0, 10)));
    const byProject = {};
    const push = (pid, line, hl) => { const k = pid || ''; (byProject[k] = byProject[k] || []).push({ line, hl }); };
    for (const e of logs) push(e.projectId, `${e.workType ? `[${e.workType}] ` : ''}${e.text}`, e.isHighlight);
    for (const t of doneTasks) push(t.projectId, `${t.workType ? `[${t.workType}] ` : ''}${t.text}（已完成）`, false);
    const keys = Object.keys(byProject);
    const outputLines = keys.length
      ? keys.map((k) => {
          const name = k ? projectName(state, k) : '未归类';
          const items = byProject[k].slice().sort((a, b) => (b.hl ? 1 : 0) - (a.hl ? 1 : 0));
          return `### ${name}\n` + items.map((it) => `- ${it.hl ? '⭐ ' : ''}${it.line}`).join('\n');
        }).join('\n\n')
      : '（本期暂无产出记录）';

    // 3) Risks: items tagged 风险 / #风险 in period.
    const isRisk = (x) => (x.tags || []).some((t) => t === '风险' || t === '#风险');
    const risks = logs.filter(isRisk).map((e) => e.text);
    const riskLines = risks.length ? risks.map((r) => `- ${r}`).join('\n') : '（可手动补充）';

    // 4) Plan: next-period goals + undone week-focus tasks.
    const nextId = shiftPeriod(horizon, periodId, 1);
    const planItems = [
      ...goalsFor(state, horizon, nextId).map((g) => `- ${g.projectId ? `[${projectName(state, g.projectId)}] ` : ''}${g.title}`),
      ...state.tasks.filter((t) => t.status !== 'done' && t.isWeekFocus).map((t) => `- ${t.projectId ? `[${projectName(state, t.projectId)}] ` : ''}${t.text}`),
    ];
    const planLines = planItems.length ? planItems.join('\n') : '（待补充）';

    return [
      `# ${typeLabel} ${periodLabel(horizon, periodId)}`, '',
      `## ${H.progress}`, goalLines, '',
      `## ${H.output}`, outputLines, '',
      `## ${H.risk}`, riskLines, '',
      `## ${H.plan}`, planLines, '',
    ].join('\n');
  }

  function buildTimeline(state, opts) {
    opts = opts || {};
    const q = (opts.query || '').toLowerCase();
    const match = (txt) => !q || String(txt || '').toLowerCase().includes(q);
    const matchItem = (x) => match(x.text) || (x.tags || []).some(match);
    const dayMap = {};
    const add = (date, bucket, item) => {
      if (!date) return;
      (dayMap[date] = dayMap[date] || { entries: [], tasksDone: [], collection: [] })[bucket].push(item);
    };
    for (const e of state.logEntries) if (matchItem(e)) add(e.date, 'entries', e);
    for (const t of state.tasks) if (t.completedAt && matchItem(t)) add(t.completedAt.slice(0, 10), 'tasksDone', t);
    for (const c of state.collectionItems) if (matchItem(c)) add((c.createdAt || '').slice(0, 10), 'collection', c);

    const months = [];
    const mIndex = {};
    for (const date of Object.keys(dayMap).sort().reverse()) {
      const d = parseDate(date);
      const mId = monthId(d), wId = weekId(d);
      let m = mIndex[mId];
      if (!m) { m = { monthId: mId, label: `${mId.replace('-', '年')}月`, weeks: [], _wi: {} }; mIndex[mId] = m; months.push(m); }
      let w = m._wi[wId];
      if (!w) { w = { weekId: wId, label: periodLabel('week', wId), days: [] }; m._wi[wId] = w; m.weeks.push(w); }
      w.days.push({ date, label: date, ...dayMap[date] });
    }
    for (const m of months) delete m._wi;
    return { months };
  }

  // ---- Additional functions are appended by later tasks, ABOVE this return. ----

  return {
    SCHEMA_VERSION,
    DEFAULT_WORK_TYPES,
    uid,
    createEmptyState,
    isoDate, parseDate, weekId, monthId, quarterId, halfId,
    periodRange, periodLabel, shiftPeriod, dateInPeriod,
    addCapture, updateEntity, removeEntity,
    addLogEntry, addTask, addCollection, triageCapture,
    unfinishedBefore, carryOverTask, filterTasks,
    addGoal, goalsFor,
    convertIdeaToTask,
    addProject, addWorkType,
    generateReport,
    buildTimeline,
  };
});
