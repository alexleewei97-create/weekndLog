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
  function renderTodayAccomplishments() { return '<section class="pad"><h3>今日成果</h3><p class="muted">（Task 10）</p></section>'; }
  function renderTodayTasks() { return '<section class="pad"><h3>今日待办</h3><p class="muted">（Task 11）</p></section>'; }

  const renderers = {
    today: () => renderTodayCapture() + renderTodayAccomplishments() + renderTodayTasks(),
    backlog: () => '<section class="pad"><h2>待办</h2><p class="muted">（建设中）</p></section>',
    planning: () => '<section class="pad"><h2>规划</h2><p class="muted">（建设中）</p></section>',
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
