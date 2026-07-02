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

  const renderers = {
    today: () => '<section class="pad"><h2>今日</h2><p class="muted">（建设中）</p></section>',
    backlog: () => '<section class="pad"><h2>待办</h2><p class="muted">（建设中）</p></section>',
    planning: () => '<section class="pad"><h2>规划</h2><p class="muted">（建设中）</p></section>',
    collection: () => '<section class="pad"><h2>收集</h2><p class="muted">（建设中）</p></section>',
    report: () => '<section class="pad"><h2>汇报</h2><p class="muted">（建设中）</p></section>',
    archive: () => '<section class="pad"><h2>档案</h2><p class="muted">（建设中）</p></section>',
    settings: () => '<section class="pad"><h2>设置</h2><p class="muted">（建设中）</p></section>',
  };
  const actions = {};
  const afterRender = {};

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
