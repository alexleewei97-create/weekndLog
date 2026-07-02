(function (root) {
  'use strict';
  const L = root.WeikenLogic;
  const Store = root.WeikenStore;

  const TABS = [
    { id: 'today', label: '今日' }, { id: 'backlog', label: '待办' },
    { id: 'planning', label: '规划' }, { id: 'collection', label: '收集' },
    { id: 'report', label: '汇报' }, { id: 'archive', label: '档案' },
    { id: 'settings', label: '设置' },
  ];

  let state = null;
  let activeTab = 'today';
  let saveTimer = null;
  let undoRef = null;
  let backlogFilter = { projectId: '', status: '', weekFocus: false, query: '' };

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g,
      (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function showToast(msg, label, cb) {
    const t = document.getElementById('toast');
    t.innerHTML = esc(msg) + (label ? ` <button class="link" id="toast-action">${esc(label)}</button>` : '');
    t.classList.add('show');
    if (label && cb) document.getElementById('toast-action').onclick = () => { cb(); t.classList.remove('show'); };
    clearTimeout(t._timer);
    t._timer = setTimeout(() => t.classList.remove('show'), label ? 5000 : 2200);
  }
  function toast(msg) { showToast(msg, null, null); }
  function toastAction(msg, label, cb) { showToast(msg, label, cb); }

  function offerUndo(key, item) {
    undoRef = { key, item };
    toastAction('已删除', '撤销', () => { state[undoRef.key].push(undoRef.item); save(); render(); });
  }

  function projectOptions(selectedId) {
    return ['<option value="">（无项目）</option>'].concat(
      state.projects.filter((p) => !p.archived || p.id === selectedId)
        .map((p) => `<option value="${p.id}"${p.id === selectedId ? ' selected' : ''}>${esc(p.name)}</option>`)
    ).join('');
  }
  function workTypeOptions(selected) {
    return ['<option value="">（无类型）</option>'].concat(
      state.workTypes.filter((w) => !w.archived || w.name === selected)
        .map((w) => `<option value="${esc(w.name)}"${w.name === selected ? ' selected' : ''}>${esc(w.name)}</option>`)
    ).join('');
  }
  function parseTags(str) { return String(str || '').split(/[,，]/).map((s) => s.trim()).filter(Boolean); }

  function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      try { await Store.save(state); } catch (e) { toast('保存失败：' + (Store.lastError || e)); }
    }, 700);
  }

  function todayStr() { return L.isoDate(new Date()); }

  function renderCaptureRow(c) {
    return `<div class="row" data-id="${c.id}">
      <span class="grow">${esc(c.text)}</span>
      <span class="triage">
        <button class="mini" data-action="triage" data-id="${c.id}" data-target="log">成果</button>
        <button class="mini" data-action="triage" data-id="${c.id}" data-target="task">待办</button>
        <button class="mini" data-action="triage" data-id="${c.id}" data-target="idea">灵感</button>
        <button class="mini" data-action="triage" data-id="${c.id}" data-target="note">笔记</button>
        <button class="mini danger" data-action="triage" data-id="${c.id}" data-target="delete">删除</button>
      </span>
    </div>`;
  }
  function renderTodayCapture() {
    const pending = state.captureItems.filter((c) => c.status === 'pending');
    return `<section class="pad">
      <h2>今日 · ${todayStr()}</h2>
      <div class="capture"><input id="capture-input" data-submit="addCapture"
        placeholder="随手记一条…（回车存入收件箱）" /></div>
      <h3>收件箱 <span class="muted">${pending.length}</span></h3>
      ${pending.length ? pending.map(renderCaptureRow).join('') : '<p class="muted">暂无待整理条目</p>'}
    </section>`;
  }
  function renderAccRow(e) {
    return `<div class="card" data-id="${e.id}">
      <div class="line">
        <button class="star${e.isHighlight ? ' on' : ''}" data-action="toggleHighlight" data-id="${e.id}" title="标为亮点">★</button>
        <input class="grow" value="${esc(e.text)}" data-change="editAccText" data-id="${e.id}" />
        <button class="mini danger" data-action="deleteEntry" data-key="logEntries" data-id="${e.id}">删除</button>
      </div>
      <div class="meta">
        <select data-change="editAccProject" data-id="${e.id}">${projectOptions(e.projectId)}</select>
        <select data-change="editAccType" data-id="${e.id}">${workTypeOptions(e.workType)}</select>
        <input class="tags" placeholder="标签，逗号分隔" value="${esc((e.tags || []).join(', '))}" data-change="editAccTags" data-id="${e.id}" />
      </div>
    </div>`;
  }
  function renderTodayAccomplishments() {
    const today = L.isoDate(new Date());
    const items = state.logEntries.filter((e) => e.date === today);
    return `<section class="pad">
      <h3>今日成果 <span class="muted">${items.length}</span></h3>
      <div class="addrow"><input id="acc-input" data-submit="addAccomplishment"
        placeholder="直接记一条今日成果…（回车添加）" /></div>
      ${items.length ? items.map(renderAccRow).join('') : '<p class="muted">今天还没有成果记录</p>'}
    </section>`;
  }
  function renderTodayTasks() {
    const today = L.isoDate(new Date());
    const todays = state.tasks.filter((t) => t.status !== 'done' && (t.dueDate === today || t.isWeekFocus));
    const overdue = L.unfinishedBefore(state, today);
    const overdueHtml = overdue.length ? `<div class="notice">
      昨日及更早未完成 <b>${overdue.length}</b> 项
      <button class="mini" data-action="carryAll">全部带入今天</button>
      ${overdue.map((t) => `<div class="row" data-id="${t.id}">
        <span class="grow">${esc(t.text)}${t.carryOverCount ? ` <span class="muted">·结转${t.carryOverCount}次</span>` : ''}</span>
        <button class="mini" data-action="carryOne" data-id="${t.id}">带入</button>
      </div>`).join('')}</div>` : '';
    const tasksHtml = todays.length ? todays.map((t) => `<div class="row" data-id="${t.id}">
      <input type="checkbox" data-action="completeTask" data-id="${t.id}" />
      <span class="grow">${esc(t.text)}</span>
      ${t.isWeekFocus ? '<span class="badge">本周重点</span>' : ''}
    </div>`).join('') : '<p class="muted">今天没有安排任务，可到"待办"设置截止日或标为本周重点</p>';
    return `<section class="pad">${overdueHtml}<h3>今日待办 <span class="muted">${todays.length}</span></h3>${tasksHtml}</section>`;
  }

  function goalOptions(selectedId) {
    const H = { week: '周', month: '月', quarter: '季', half: '半年' };
    return ['<option value="">（不关联目标）</option>'].concat(
      state.goals.map((g) => `<option value="${g.id}"${g.id === selectedId ? ' selected' : ''}>[${H[g.horizon]}] ${esc(g.title)}</option>`)
    ).join('');
  }
  function renderTaskRow(t) {
    return `<div class="card" data-id="${t.id}">
      <div class="line">
        <input class="grow" value="${esc(t.text)}" data-change="editTaskText" data-id="${t.id}" />
        <button class="mini" data-action="toggleFocus" data-id="${t.id}">${t.isWeekFocus ? '★本周重点' : '标为本周重点'}</button>
        <button class="mini danger" data-action="deleteEntry" data-key="tasks" data-id="${t.id}">删除</button>
      </div>
      <div class="meta">
        <select data-change="editTaskStatus" data-id="${t.id}">
          <option value="todo"${t.status === 'todo' ? ' selected' : ''}>待办</option>
          <option value="doing"${t.status === 'doing' ? ' selected' : ''}>进行中</option>
          <option value="done"${t.status === 'done' ? ' selected' : ''}>已完成</option>
        </select>
        <select data-change="editTaskProject" data-id="${t.id}">${projectOptions(t.projectId)}</select>
        <select data-change="editTaskType" data-id="${t.id}">${workTypeOptions(t.workType)}</select>
        <label class="muted">截止<input type="date" value="${t.dueDate || ''}" data-change="editTaskDue" data-id="${t.id}" /></label>
        <select data-change="editTaskGoal" data-id="${t.id}">${goalOptions(t.linkedGoalId)}</select>
        <input class="tags" placeholder="标签" value="${esc((t.tags || []).join(', '))}" data-change="editTaskTags" data-id="${t.id}" />
        ${t.carryOverCount ? `<span class="muted">结转${t.carryOverCount}次</span>` : ''}
      </div>
    </div>`;
  }
  function renderBacklog() {
    const list = L.filterTasks(state, backlogFilter);
    const projFilterOpts = ['<option value="">全部项目</option>'].concat(
      state.projects.map((p) => `<option value="${p.id}"${backlogFilter.projectId === p.id ? ' selected' : ''}>${esc(p.name)}</option>`)).join('');
    return `<section class="pad">
      <h2>待办</h2>
      <div class="addrow"><input id="task-input" data-submit="addTaskInput" placeholder="新增待办…（回车添加）" /></div>
      <div class="filters">
        <select data-change="filterProject">${projFilterOpts}</select>
        <select data-change="filterStatus">
          <option value="">全部状态</option>
          <option value="todo"${backlogFilter.status === 'todo' ? ' selected' : ''}>待办</option>
          <option value="doing"${backlogFilter.status === 'doing' ? ' selected' : ''}>进行中</option>
          <option value="done"${backlogFilter.status === 'done' ? ' selected' : ''}>已完成</option>
        </select>
        <label><input type="checkbox" data-change="filterFocus"${backlogFilter.weekFocus ? ' checked' : ''} /> 仅本周重点</label>
        <input placeholder="搜索（回车）" value="${esc(backlogFilter.query)}" data-change="filterQuery" />
      </div>
      ${list.length ? list.map(renderTaskRow).join('') : '<p class="muted">没有匹配的待办</p>'}
    </section>`;
  }

  let planSel = null;
  function currentPeriods() {
    const now = new Date();
    return { week: L.weekId(now), month: L.monthId(now), quarter: L.quarterId(now), half: L.halfId(now) };
  }
  function renderGoalRow(g) {
    return `<div class="card" data-id="${g.id}">
      <div class="line">
        <input class="grow" value="${esc(g.title)}" data-change="editGoalTitle" data-id="${g.id}" />
        <select data-change="editGoalStatus" data-id="${g.id}">
          <option value="planned"${g.status === 'planned' ? ' selected' : ''}>计划中</option>
          <option value="inProgress"${g.status === 'inProgress' ? ' selected' : ''}>进行中</option>
          <option value="done"${g.status === 'done' ? ' selected' : ''}>已完成</option>
          <option value="dropped"${g.status === 'dropped' ? ' selected' : ''}>已放弃</option>
        </select>
        <button class="mini danger" data-action="deleteEntry" data-key="goals" data-id="${g.id}">删除</button>
      </div>
      <div class="meta">
        <select data-change="editGoalProject" data-id="${g.id}">${projectOptions(g.projectId)}</select>
        <input class="grow" placeholder="进展备注（汇报用）" value="${esc(g.progressNote)}" data-change="editGoalNote" data-id="${g.id}" />
      </div>
    </div>`;
  }
  function renderHorizon(h, label) {
    const pid = planSel[h];
    const goals = L.goalsFor(state, h, pid);
    return `<div class="pad">
      <h3>${label} · <span class="muted">${esc(L.periodLabel(h, pid))}</span>
        <button class="mini" data-action="planPrev" data-h="${h}">←</button>
        <button class="mini" data-action="planNext" data-h="${h}">→</button></h3>
      <div class="addrow"><input data-submit="addGoal" data-h="${h}" placeholder="新增${label}目标…（回车）" /></div>
      ${goals.length ? goals.map(renderGoalRow).join('') : '<p class="muted">暂无目标</p>'}
    </div>`;
  }
  function renderPlanning() {
    if (!planSel) planSel = currentPeriods();
    const horizons = [['week', '本周重点'], ['month', '月度'], ['quarter', '季度'], ['half', '半年度']];
    return `<section class="pad"><h2>规划</h2><p class="muted">给每层目标关联项目，日常待办可在"待办"里关联到这些目标。</p></section>`
      + horizons.map(([h, label]) => renderHorizon(h, label)).join('');
  }

  const renderers = {
    today: () => renderTodayCapture() + renderTodayAccomplishments() + renderTodayTasks(),
    backlog: renderBacklog,
    planning: renderPlanning,
    collection: () => '<section class="pad"><h2>收集</h2><p class="muted">（建设中）</p></section>',
    report: () => '<section class="pad"><h2>汇报</h2><p class="muted">（建设中）</p></section>',
    archive: () => '<section class="pad"><h2>档案</h2><p class="muted">（建设中）</p></section>',
    settings: () => '<section class="pad"><h2>设置</h2><p class="muted">（建设中）</p></section>',
  };
  const actions = {};
  const afterRender = {};

  afterRender.today = () => { const i = document.getElementById('capture-input'); if (i) i.focus(); };

  actions.addCapture = (el) => {
    const text = el.value.trim(); if (!text) return;
    state = L.addCapture(state, text, new Date().toISOString()).state;
    el.value = ''; save(); render();
  };
  actions.triage = (el) => {
    const id = el.dataset.id, target = el.dataset.target;
    if (target === 'delete') {
      const item = state.captureItems.find((c) => c.id === id);
      state = L.triageCapture(state, id, 'delete', {});
      save(); render();
      if (item) offerUndo('captureItems', item); else toast('已删除');
      return;
    }
    if (target === 'log') state = L.triageCapture(state, id, 'log', { date: L.isoDate(new Date()) });
    else if (target === 'task') state = L.triageCapture(state, id, 'task', {});
    else if (target === 'idea') state = L.triageCapture(state, id, 'collection', { type: 'idea' });
    else if (target === 'note') state = L.triageCapture(state, id, 'collection', { type: 'note' });
    save(); render();
    toast('已整理到' + ({ log: '成果', task: '待办', idea: '灵感', note: '笔记' }[target]));
  };

  actions.addAccomplishment = (el) => {
    const text = el.value.trim(); if (!text) return;
    state = L.addLogEntry(state, { text, date: L.isoDate(new Date()) });
    el.value = ''; save(); render();
  };
  actions.toggleHighlight = (el) => {
    const e = state.logEntries.find((x) => x.id === el.dataset.id);
    state = L.updateEntity(state, 'logEntries', el.dataset.id, { isHighlight: !e.isHighlight });
    save(); render();
  };
  actions.editAccText = (el) => { state = L.updateEntity(state, 'logEntries', el.dataset.id, { text: el.value }); save(); };
  actions.editAccProject = (el) => { state = L.updateEntity(state, 'logEntries', el.dataset.id, { projectId: el.value || null }); save(); };
  actions.editAccType = (el) => { state = L.updateEntity(state, 'logEntries', el.dataset.id, { workType: el.value || null }); save(); };
  actions.editAccTags = (el) => { state = L.updateEntity(state, 'logEntries', el.dataset.id, { tags: parseTags(el.value) }); save(); };
  actions.deleteEntry = (el) => {
    const key = el.dataset.key, id = el.dataset.id;
    const item = state[key].find((x) => x.id === id);
    state = L.removeEntity(state, key, id); save(); render(); offerUndo(key, item);
  };

  actions.carryOne = (el) => { state = L.carryOverTask(state, el.dataset.id, L.isoDate(new Date())); save(); render(); };
  actions.carryAll = () => {
    const today = L.isoDate(new Date());
    for (const t of L.unfinishedBefore(state, today)) state = L.carryOverTask(state, t.id, today);
    save(); render(); toast('已全部带入今天');
  };
  actions.completeTask = (el) => {
    state = L.updateEntity(state, 'tasks', el.dataset.id, { status: 'done', completedAt: new Date().toISOString() });
    save(); render(); toast('已完成 🎉');
  };

  actions.addTaskInput = (el) => { const text = el.value.trim(); if (!text) return; state = L.addTask(state, { text }); el.value = ''; save(); render(); };
  actions.toggleFocus = (el) => { const t = state.tasks.find((x) => x.id === el.dataset.id); state = L.updateEntity(state, 'tasks', el.dataset.id, { isWeekFocus: !t.isWeekFocus }); save(); render(); };
  actions.editTaskText = (el) => { state = L.updateEntity(state, 'tasks', el.dataset.id, { text: el.value }); save(); };
  actions.editTaskStatus = (el) => { const patch = { status: el.value }; if (el.value === 'done') patch.completedAt = new Date().toISOString(); state = L.updateEntity(state, 'tasks', el.dataset.id, patch); save(); render(); };
  actions.editTaskProject = (el) => { state = L.updateEntity(state, 'tasks', el.dataset.id, { projectId: el.value || null }); save(); };
  actions.editTaskType = (el) => { state = L.updateEntity(state, 'tasks', el.dataset.id, { workType: el.value || null }); save(); };
  actions.editTaskDue = (el) => { state = L.updateEntity(state, 'tasks', el.dataset.id, { dueDate: el.value || null }); save(); };
  actions.editTaskGoal = (el) => { state = L.updateEntity(state, 'tasks', el.dataset.id, { linkedGoalId: el.value || null }); save(); };
  actions.editTaskTags = (el) => { state = L.updateEntity(state, 'tasks', el.dataset.id, { tags: parseTags(el.value) }); save(); };
  actions.filterProject = (el) => { backlogFilter.projectId = el.value; render(); };
  actions.filterStatus = (el) => { backlogFilter.status = el.value; render(); };
  actions.filterFocus = (el) => { backlogFilter.weekFocus = el.checked; render(); };
  actions.filterQuery = (el) => { backlogFilter.query = el.value; render(); };

  actions.planPrev = (el) => { const h = el.dataset.h; planSel[h] = L.shiftPeriod(h, planSel[h], -1); render(); };
  actions.planNext = (el) => { const h = el.dataset.h; planSel[h] = L.shiftPeriod(h, planSel[h], 1); render(); };
  actions.addGoal = (el) => { const title = el.value.trim(); if (!title) return; const h = el.dataset.h; state = L.addGoal(state, { horizon: h, period: planSel[h], title }); el.value = ''; save(); render(); };
  actions.editGoalTitle = (el) => { state = L.updateEntity(state, 'goals', el.dataset.id, { title: el.value }); save(); };
  actions.editGoalStatus = (el) => { state = L.updateEntity(state, 'goals', el.dataset.id, { status: el.value }); save(); render(); };
  actions.editGoalProject = (el) => { state = L.updateEntity(state, 'goals', el.dataset.id, { projectId: el.value || null }); save(); };
  actions.editGoalNote = (el) => { state = L.updateEntity(state, 'goals', el.dataset.id, { progressNote: el.value }); save(); };

  function renderTabs() {
    document.getElementById('tabs').innerHTML = TABS.map((t) =>
      `<button class="tab${t.id === activeTab ? ' active' : ''}" data-action="tab" data-tab="${t.id}">${esc(t.label)}</button>`
    ).join('');
  }
  function renderBanner() {
    const b = document.getElementById('mode-banner');
    if (Store.mode === 'local') { b.className = 'warn'; b.textContent = '⚠ 备份已关闭（纯文件模式），建议用 威肯Log.cmd 启动'; }
    else { b.className = ''; b.textContent = ''; }
  }
  function render() {
    renderTabs();
    document.getElementById('view').innerHTML = (renderers[activeTab] || renderers.today)();
    if (afterRender[activeTab]) afterRender[activeTab]();
  }

  function onClick(e) {
    const el = e.target.closest('[data-action]'); if (!el) return;
    const a = el.dataset.action;
    if (a === 'tab') { activeTab = el.dataset.tab; render(); return; }
    if (actions[a]) actions[a](el, e);
  }
  function onKeydown(e) {
    const el = e.target.closest('[data-submit]');
    if (el && e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (actions[el.dataset.submit]) actions[el.dataset.submit](el, e); }
  }
  function onChange(e) {
    const el = e.target.closest('[data-change]');
    if (el && actions[el.dataset.change]) actions[el.dataset.change](el, e);
  }

  async function boot() {
    await Store.init();
    state = await Store.load();
    if (!state || !state.schemaVersion) state = L.createEmptyState();
    document.addEventListener('click', onClick);
    document.addEventListener('keydown', onKeydown);
    document.addEventListener('change', onChange);
    renderBanner();
    render();
  }

  // Expose shared helpers to later same-file tasks via closure (they edit this file directly).
  root.WeikenUI = { boot, render, save };
  // The following are file-scoped and referenced directly by later tasks:
  root.WeikenUI._internal = { get state() { return state; }, esc, toast, toastAction, offerUndo,
    projectOptions, workTypeOptions, parseTags, renderers, actions, afterRender };
})(typeof window !== 'undefined' ? window : this);
