(function (root) {
  'use strict';
  const L = root.WeikenLogic;
  const Store = root.WeikenStore;

  const TABS = [
    { id: 'today', label: '今日', icon: '📅' }, { id: 'backlog', label: '待办', icon: '✅' },
    { id: 'planning', label: '规划', icon: '🎯' }, { id: 'collection', label: '收集', icon: '💡' },
    { id: 'report', label: '汇报', icon: '📊' }, { id: 'archive', label: '档案', icon: '📚' },
    { id: 'settings', label: '设置', icon: '⚙️' },
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

  function projectColor(id) {
    const p = state.projects.find((x) => x.id === id);
    const c = p && p.color;
    return (typeof c === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(c)) ? c : 'var(--border-strong)';
  }
  function projectChip(id) {
    const p = state.projects.find((x) => x.id === id);
    if (!p) return '';
    return `<span class="chip"><span class="dot" style="background:${projectColor(id)}"></span>${esc(p.name)}</span>`;
  }
  const STATUS_PILL = {
    task: { todo: ['muted', '待办'], doing: ['doing', '进行中'], done: ['ok', '已完成'] },
    goal: { planned: ['muted', '计划中'], inProgress: ['doing', '进行中'], done: ['ok', '已完成'], dropped: ['muted', '已放弃'] },
  };
  function statusPill(kind, value) {
    const m = (STATUS_PILL[kind] || {})[value]; if (!m) return '';
    return `<span class="pill pill--${m[0]}">${m[1]}</span>`;
  }
  function emptyState(text, ico) {
    return `<div class="empty">${ico ? `<span class="ico">${esc(ico)}</span>` : ''}${esc(text)}</div>`;
  }
  function sectionTitle(text, count) {
    return `<div class="section-title"><h3>${esc(text)}</h3>${count != null ? `<span class="count">${count}</span>` : ''}</div>`;
  }

  function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      try { await Store.save(state); } catch (e) { toast('保存失败：' + (Store.lastError || e)); }
    }, 700);
  }

  function applyTheme(theme) {
    const t = theme === 'dark' ? 'dark' : 'light';
    const el = document.documentElement;
    if (el && el.setAttribute) el.setAttribute('data-theme', t);
    const btn = document.getElementById('theme-toggle');
    if (btn) btn.textContent = t === 'dark' ? '☀️' : '🌙';
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
  function dayLabel(iso) {
    const wd = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][L.parseDate(iso).getDay()];
    return `${iso} ${wd}`;
  }
  function renderDayNav() {
    const isToday = selectedDate === L.isoDate(new Date());
    return `<section class="pad">
      <div class="daynav">
        <span class="date">📅 ${esc(dayLabel(selectedDate))}</span>
        <button class="mini" data-action="dayPrev">← 前一天</button>
        <button class="mini" data-action="dayNext">后一天 →</button>
        <input type="date" value="${esc(selectedDate)}" data-change="dayPick" />
        ${isToday ? '<span class="muted today-flag">· 今天</span>' : '<button class="mini" data-action="dayToday">· 回到今天</button>'}
      </div>
    </section>`;
  }
  function renderTodayCapture() {
    const pending = state.captureItems.filter((c) => c.status === 'pending');
    return `<section class="pad">
      <div class="capture"><input id="capture-input" data-submit="addCapture"
        placeholder="随手记一条…（回车存入收件箱）" /></div>
      ${sectionTitle('收件箱', pending.length)}
      ${pending.length ? pending.map(renderCaptureRow).join('') : emptyState('暂无待整理条目', '📥')}
    </section>`;
  }
  function renderAccRow(e) {
    return `<div class="card" data-id="${e.id}" style="border-left-color:${projectColor(e.projectId)}">
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
    const items = state.logEntries.filter((e) => e.date === selectedDate);
    return `<section class="pad">
      ${sectionTitle('成果', items.length)}
      <div class="addrow"><input id="acc-input" data-submit="addAccomplishment"
        placeholder="记一条这天的成果…（回车添加）" /></div>
      ${items.length ? items.map(renderAccRow).join('') : emptyState('这天还没有成果记录', '📝')}
    </section>`;
  }
  function renderTodayTasks() {
    const today = L.isoDate(new Date());
    const isToday = selectedDate === today;
    const todays = state.tasks.filter((t) => t.status !== 'done' && (t.dueDate === selectedDate || (isToday && t.isWeekFocus)));
    const overdue = isToday ? L.unfinishedBefore(state, today) : [];
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
      ${projectChip(t.projectId)}
      ${isToday && t.isWeekFocus ? '<span class="badge">本周重点</span>' : ''}
    </div>`).join('') : emptyState(isToday ? '今天没有安排任务，可到"待办"设置截止日或标为本周重点' : '这天没有到期任务', '✅');
    return `<section class="pad">${overdueHtml}${sectionTitle(isToday ? '今日待办' : '当天待办', todays.length)}${tasksHtml}</section>`;
  }

  function goalOptions(selectedId) {
    const H = { week: '周', month: '月', quarter: '季', half: '半年' };
    return ['<option value="">（不关联目标）</option>'].concat(
      state.goals.map((g) => `<option value="${g.id}"${g.id === selectedId ? ' selected' : ''}>[${H[g.horizon]}] ${esc(g.title)}</option>`)
    ).join('');
  }
  function renderTaskRow(t) {
    return `<div class="card" data-id="${t.id}" style="border-left-color:${projectColor(t.projectId)}">
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
        <label class="muted">截止<input type="date" value="${esc(t.dueDate || '')}" data-change="editTaskDue" data-id="${t.id}" /></label>
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
      ${list.length ? list.map(renderTaskRow).join('') : emptyState('没有匹配的待办', '📋')}
    </section>`;
  }

  let planSel = null;
  let selectedDate = null;
  let planMode = 'view';
  function currentPeriods() {
    const now = new Date();
    return { week: L.weekId(now), month: L.monthId(now), quarter: L.quarterId(now), half: L.halfId(now) };
  }
  function renderGoalRow(g) {
    return `<div class="card" data-id="${g.id}" style="border-left-color:${projectColor(g.projectId)}">
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
  function renderGoalReadCard(g) {
    return `<div class="card" style="border-left-color:${projectColor(g.projectId)}">
      <div class="line">
        <span class="grow"><b>${esc(g.title || '（未命名目标）')}</b></span>
        ${statusPill('goal', g.status)}
      </div>
      <div class="meta">
        ${projectChip(g.projectId)}
        ${g.progressNote ? `<span class="muted">${esc(g.progressNote)}</span>` : ''}
      </div>
    </div>`;
  }
  function renderHorizonView(h, label) {
    const pid = planSel[h];
    const goals = L.goalsFor(state, h, pid);
    return `<section class="pad">
      ${sectionTitle(label, goals.length)}
      <div class="filters"><span class="muted">${esc(L.periodLabel(h, pid))}</span>
        <button class="mini" data-action="planPrev" data-h="${h}">←</button>
        <button class="mini" data-action="planNext" data-h="${h}">→</button></div>
      ${goals.length ? goals.map(renderGoalReadCard).join('')
        : `${emptyState('本周期还没有规划', '🎯')}<div class="addrow"><button class="mini" data-action="planGotoEdit" data-h="${h}">＋ 去添加</button></div>`}
    </section>`;
  }
  function planSeg() {
    return `<div class="seg">
      <button class="${planMode === 'view' ? 'on' : ''}" data-action="planMode" data-mode="view">查看</button>
      <button class="${planMode === 'edit' ? 'on' : ''}" data-action="planMode" data-mode="edit">编辑</button>
    </div>`;
  }
  function renderHorizon(h, label) {
    const pid = planSel[h];
    const goals = L.goalsFor(state, h, pid);
    return `<section class="pad">
      ${sectionTitle(label, goals.length)}
      <div class="filters"><span class="muted">${esc(L.periodLabel(h, pid))}</span>
        <button class="mini" data-action="planPrev" data-h="${h}">←</button>
        <button class="mini" data-action="planNext" data-h="${h}">→</button></div>
      <div class="addrow"><input data-submit="addGoal" data-h="${h}" placeholder="新增${esc(label)}目标…（回车）" /></div>
      ${goals.length ? goals.map(renderGoalRow).join('') : emptyState('暂无目标', '🎯')}
    </section>`;
  }
  function renderPlanning() {
    if (!planSel) planSel = currentPeriods();
    const horizons = [['week', '本周重点'], ['month', '月度'], ['quarter', '季度'], ['half', '半年度']];
    const head = `<section class="pad"><h2>规划</h2>
      <p class="subtitle">四个层级的目标一屏概览；日常待办可在"待办"里关联到这些目标。</p>
      ${planSeg()}</section>`;
    const body = planMode === 'view'
      ? horizons.map(([h, label]) => renderHorizonView(h, label)).join('')
      : horizons.map(([h, label]) => renderHorizon(h, label)).join('');
    return head + body;
  }

  let colFilter = { type: '', query: '' };
  function renderColRow(c) {
    const isIdea = c.type === 'idea';
    return `<div class="card" data-id="${c.id}" style="border-left-color:${projectColor(c.projectId)}">
      <div class="line">
        <span class="badge">${isIdea ? '灵感' : '笔记'}</span>
        <input class="grow" value="${esc(c.text)}" data-change="editColText" data-id="${c.id}" />
        ${isIdea && c.ideaStatus !== 'converted' ? `<button class="mini" data-action="ideaToTask" data-id="${c.id}">转待办</button>` : ''}
        ${isIdea && c.ideaStatus === 'converted' ? '<span class="muted">已转待办</span>' : ''}
        <button class="mini danger" data-action="deleteEntry" data-key="collectionItems" data-id="${c.id}">删除</button>
      </div>
      <div class="meta">
        <select data-change="editColProject" data-id="${c.id}">${projectOptions(c.projectId)}</select>
        <input class="tags" placeholder="标签" value="${esc((c.tags || []).join(', '))}" data-change="editColTags" data-id="${c.id}" />
        ${isIdea ? `<select data-change="editIdeaStatus" data-id="${c.id}">
          <option value="raw"${c.ideaStatus === 'raw' ? ' selected' : ''}>原始</option>
          <option value="incubating"${c.ideaStatus === 'incubating' ? ' selected' : ''}>孵化中</option>
          <option value="converted"${c.ideaStatus === 'converted' ? ' selected' : ''}>已转任务</option>
          <option value="archived"${c.ideaStatus === 'archived' ? ' selected' : ''}>归档</option>
        </select>` : ''}
      </div>
    </div>`;
  }
  function renderCollection() {
    const q = (colFilter.query || '').toLowerCase();
    const list = state.collectionItems.filter((c) => {
      if (colFilter.type && c.type !== colFilter.type) return false;
      if (q && !(c.text || '').toLowerCase().includes(q) && !(c.tags || []).some((t) => t.toLowerCase().includes(q))) return false;
      return true;
    });
    return `<section class="pad">
      <h2>收集</h2>
      <div class="addrow">
        <input id="col-input" class="grow" data-submit="addNote" placeholder="记一条笔记…（回车添加为笔记）" />
        <button class="mini" data-action="addIdeaBtn">+ 存为灵感</button>
      </div>
      <div class="filters">
        <select data-change="colType">
          <option value="">全部</option>
          <option value="note"${colFilter.type === 'note' ? ' selected' : ''}>笔记</option>
          <option value="idea"${colFilter.type === 'idea' ? ' selected' : ''}>灵感</option>
        </select>
        <input placeholder="搜索（回车）" value="${esc(colFilter.query)}" data-change="colQuery" />
      </div>
      ${list.length ? list.map(renderColRow).join('') : emptyState('还没有收集条目', '💡')}
    </section>`;
  }

  function renderProjectsSettings() {
    return `<section class="pad">${sectionTitle('项目 / 游戏')}
      <div class="addrow"><input data-submit="addProject" placeholder="新增项目…（回车）" /></div>
      ${state.projects.length ? state.projects.map((p) => `<div class="row" data-id="${p.id}">
        <input class="grow" value="${esc(p.name)}" data-change="editProjectName" data-id="${p.id}" />
        <input type="color" value="${esc(p.color || '#3b6ef5')}" data-change="editProjectColor" data-id="${p.id}" />
        <button class="mini" data-action="toggleProjectArchive" data-id="${p.id}">${p.archived ? '取消归档' : '归档'}</button>
        <button class="mini danger" data-action="deleteEntry" data-key="projects" data-id="${p.id}">删除</button>
      </div>`).join('') : emptyState('还没有项目', '🎮')}
    </section>`;
  }
  function renderWorkTypesSettings() {
    return `<section class="pad">${sectionTitle('工作类型')}
      <div class="addrow"><input data-submit="addWorkType" placeholder="新增工作类型…（回车）" /></div>
      ${state.workTypes.map((w) => `<div class="row" data-id="${w.id}">
        <input class="grow" value="${esc(w.name)}" data-change="editWorkTypeName" data-id="${w.id}" />
        <button class="mini" data-action="toggleWorkTypeArchive" data-id="${w.id}">${w.archived ? '取消归档' : '归档'}</button>
        <button class="mini danger" data-action="deleteEntry" data-key="workTypes" data-id="${w.id}">删除</button>
      </div>`).join('')}
    </section>`;
  }
  function renderBackupStatus() {
    if (Store.mode === 'server') {
      return `<p class="muted">✅ 自动保存已开启（本地助手模式）：改动即写入 <b>weikenlog-data.json</b>，并每日快照到 <b>backups/</b>。把整个 威肯Log 文件夹放进 OneDrive 即获得自动云备份。</p>`;
    }
    const last = state.settings.lastBackupAt ? state.settings.lastBackupAt.slice(0, 10) : '从未';
    return `<p class="muted">⚠ 纯文件模式：数据仅存于本浏览器 localStorage，<b>不会自动备份</b>。上次导出：${last}。建议定期点上面的"导出 JSON 备份"，或改用 威肯Log.cmd 启动以开启自动备份。</p>`;
  }

  function renderDataSettings() {
    return `<section class="pad">${sectionTitle('数据备份')}
      ${renderBackupStatus()}
      <div class="addrow">
        <button class="mini" data-action="exportData">导出 JSON 备份</button>
        <button class="mini" data-action="importData">从 JSON 导入</button>
        <input type="file" id="import-file" accept="application/json,.json" data-change="importFileChange" style="display:none" />
      </div>
      <label class="muted">快照保留份数
        <input type="number" min="1" value="${state.settings.backupRetention || 30}" data-change="editRetention" style="width:70px" /></label>
    </section>`;
  }
  function renderHelpSettings() {
    return `<section class="pad">${sectionTitle('帮助')}
      <p><a href="使用手册.html" target="_blank" rel="noopener">📖 打开《威肯Log 使用手册》</a></p>
    </section>`;
  }
  function renderSettings() {
    return `<section class="pad"><h2>设置</h2></section>`
      + renderProjectsSettings() + renderWorkTypesSettings() + renderDataSettings() + renderHelpSettings();
  }

  const renderers = {
    today: () => renderDayNav() + renderTodayCapture() + renderTodayAccomplishments() + renderTodayTasks(),
    backlog: renderBacklog,
    planning: renderPlanning,
    collection: renderCollection,
    settings: renderSettings,
  };
  const actions = {};
  const afterRender = {};

  let archiveQuery = '';
  function renderDay(d) {
    const rows = [];
    for (const e of d.entries) rows.push(`<div class="row"><span class="badge">成果</span><span class="grow">${e.isHighlight ? '⭐ ' : ''}${esc(e.text)}</span></div>`);
    for (const t of d.tasksDone) rows.push(`<div class="row"><span class="badge">完成</span><span class="grow">${esc(t.text)}</span></div>`);
    for (const c of d.collection) rows.push(`<div class="row"><span class="badge">${c.type === 'idea' ? '灵感' : '笔记'}</span><span class="grow">${esc(c.text)}</span></div>`);
    return `<div class="day"><h4 class="muted">${esc(d.label)}</h4>${rows.join('')}</div>`;
  }
  function renderWeek(w) { return `<details class="fold"><summary>${esc(w.label)}</summary>${w.days.map(renderDay).join('')}</details>`; }
  function renderMonth(m) { return `<details class="fold pad" open><summary>${esc(m.label)}</summary>${m.weeks.map(renderWeek).join('')}</details>`; }
  function renderArchive() {
    const tl = L.buildTimeline(state, { query: archiveQuery });
    return `<section class="pad">
      <h2>档案 · 个人编年史</h2>
      <div class="filters"><input class="grow" placeholder="全文搜索所有记录（回车）" value="${esc(archiveQuery)}" data-change="archiveSearch" /></div>
      ${tl.months.length ? tl.months.map(renderMonth).join('') : '<p class="muted">还没有可回溯的记录</p>'}
    </section>`;
  }
  renderers.archive = renderArchive;
  actions.archiveSearch = (el) => { archiveQuery = el.value; render(); };
  actions.toggleTheme = () => {
    const cur = (state.settings && state.settings.theme) || 'light';
    const next = cur === 'dark' ? 'light' : 'dark';
    state = { ...state, settings: { ...state.settings, theme: next } };
    applyTheme(next); save();
  };

  let reportSel = { type: 'week', week: null, month: null };
  function renderReport() {
    if (!reportSel.week) reportSel.week = L.weekId(new Date());
    if (!reportSel.month) reportSel.month = L.monthId(new Date());
    const type = reportSel.type;
    const pid = type === 'week' ? reportSel.week : reportSel.month;
    const text = L.generateReport(state, type, pid);
    const H = (state.settings.reportTemplates && state.settings.reportTemplates.headings) || {};
    return `<section class="pad">
      <h2>汇报</h2>
      <div class="filters">
        <select data-change="reportType">
          <option value="week"${type === 'week' ? ' selected' : ''}>周报</option>
          <option value="month"${type === 'month' ? ' selected' : ''}>月报</option>
        </select>
        <span class="muted">${esc(L.periodLabel(type, pid))}</span>
        <button class="mini" data-action="reportPrev">← 上一期</button>
        <button class="mini" data-action="reportNext">下一期 →</button>
        <button class="mini" data-action="reportRegen">重新生成</button>
      </div>
      <textarea id="report-text" class="report">${esc(text)}</textarea>
      <div class="addrow"><button class="primary" data-action="reportCopy">复制到剪贴板</button>
        <span class="muted">生成后可在上面手动微调，复制的是你当前编辑的内容。</span></div>
      <details class="fold"><summary>自定义模板标题</summary><div class="meta">
        <label>进展<input value="${esc(H.progress || '重点进展')}" data-change="tplProgress" /></label>
        <label>产出<input value="${esc(H.output || '具体产出')}" data-change="tplOutput" /></label>
        <label>风险<input value="${esc(H.risk || '问题与风险')}" data-change="tplRisk" /></label>
        <label>计划<input value="${esc(H.plan || '下阶段计划')}" data-change="tplPlan" /></label>
      </div></details>
    </section>`;
  }
  renderers.report = renderReport;

  function setHeading(key, val) {
    const rt = state.settings.reportTemplates || {};
    const headings = { ...(rt.headings || {}), [key]: val };
    state = { ...state, settings: { ...state.settings, reportTemplates: { ...rt, headings } } };
    save();
  }
  actions.reportType = (el) => { reportSel.type = el.value; render(); };
  actions.reportPrev = () => { const t = reportSel.type; reportSel[t] = L.shiftPeriod(t, reportSel[t], -1); render(); };
  actions.reportNext = () => { const t = reportSel.type; reportSel[t] = L.shiftPeriod(t, reportSel[t], 1); render(); };
  actions.reportRegen = () => { render(); };
  actions.reportCopy = async () => {
    const ta = document.getElementById('report-text');
    try { await navigator.clipboard.writeText(ta.value); }
    catch (e) { ta.select(); document.execCommand('copy'); }
    toast('已复制到剪贴板');
  };
  actions.tplProgress = (el) => setHeading('progress', el.value);
  actions.tplOutput = (el) => setHeading('output', el.value);
  actions.tplRisk = (el) => setHeading('risk', el.value);
  actions.tplPlan = (el) => setHeading('plan', el.value);

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
    if (target === 'log') state = L.triageCapture(state, id, 'log', { date: selectedDate });
    else if (target === 'task') state = L.triageCapture(state, id, 'task', {});
    else if (target === 'idea') state = L.triageCapture(state, id, 'collection', { type: 'idea' });
    else if (target === 'note') state = L.triageCapture(state, id, 'collection', { type: 'note' });
    save(); render();
    toast('已整理到' + ({ log: '成果', task: '待办', idea: '灵感', note: '笔记' }[target]));
  };

  actions.addAccomplishment = (el) => {
    const text = el.value.trim(); if (!text) return;
    state = L.addLogEntry(state, { text, date: selectedDate });
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
    state = L.removeEntity(state, key, id); save(); render();
    if (item) offerUndo(key, item); else toast('已删除');
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
  actions.dayPrev = () => { selectedDate = L.shiftDate(selectedDate, -1); render(); };
  actions.dayNext = () => { selectedDate = L.shiftDate(selectedDate, 1); render(); };
  actions.dayPick = (el) => { if (el.value) { selectedDate = el.value; render(); } };
  actions.dayToday = () => { selectedDate = L.isoDate(new Date()); render(); };

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
  actions.planMode = (el) => { planMode = el.dataset.mode === 'edit' ? 'edit' : 'view'; render(); };
  actions.planGotoEdit = (el) => {
    planMode = 'edit'; render();
    const inp = document.querySelector(`[data-submit="addGoal"][data-h="${el.dataset.h}"]`);
    if (inp) inp.focus();
  };
  actions.addGoal = (el) => { const title = el.value.trim(); if (!title) return; const h = el.dataset.h; state = L.addGoal(state, { horizon: h, period: planSel[h], title }); el.value = ''; save(); render(); };
  actions.editGoalTitle = (el) => { state = L.updateEntity(state, 'goals', el.dataset.id, { title: el.value }); save(); };
  actions.editGoalStatus = (el) => { state = L.updateEntity(state, 'goals', el.dataset.id, { status: el.value }); save(); render(); };
  actions.editGoalProject = (el) => { state = L.updateEntity(state, 'goals', el.dataset.id, { projectId: el.value || null }); save(); };
  actions.editGoalNote = (el) => { state = L.updateEntity(state, 'goals', el.dataset.id, { progressNote: el.value }); save(); };

  actions.addNote = (el) => { const text = el.value.trim(); if (!text) return; state = L.addCollection(state, { type: 'note', text }); el.value = ''; save(); render(); };
  actions.addIdeaBtn = () => { const inp = document.getElementById('col-input'); const text = (inp && inp.value.trim()) || ''; if (!text) { toast('先在输入框写点灵感内容'); return; } state = L.addCollection(state, { type: 'idea', text }); inp.value = ''; save(); render(); };
  actions.ideaToTask = (el) => { state = L.convertIdeaToTask(state, el.dataset.id, new Date().toISOString()).state; save(); render(); toast('已转为待办'); };
  actions.editColText = (el) => { state = L.updateEntity(state, 'collectionItems', el.dataset.id, { text: el.value }); save(); };
  actions.editColProject = (el) => { state = L.updateEntity(state, 'collectionItems', el.dataset.id, { projectId: el.value || null }); save(); };
  actions.editColTags = (el) => { state = L.updateEntity(state, 'collectionItems', el.dataset.id, { tags: parseTags(el.value) }); save(); };
  actions.editIdeaStatus = (el) => { state = L.updateEntity(state, 'collectionItems', el.dataset.id, { ideaStatus: el.value }); save(); render(); };
  actions.colType = (el) => { colFilter.type = el.value; render(); };
  actions.colQuery = (el) => { colFilter.query = el.value; render(); };

  actions.addProject = (el) => { const name = el.value.trim(); if (!name) return; state = L.addProject(state, { name }); el.value = ''; save(); render(); };
  actions.editProjectName = (el) => { state = L.updateEntity(state, 'projects', el.dataset.id, { name: el.value }); save(); };
  actions.editProjectColor = (el) => { state = L.updateEntity(state, 'projects', el.dataset.id, { color: el.value }); save(); };
  actions.toggleProjectArchive = (el) => { const p = state.projects.find((x) => x.id === el.dataset.id); state = L.updateEntity(state, 'projects', el.dataset.id, { archived: !p.archived }); save(); render(); };
  actions.addWorkType = (el) => { const name = el.value.trim(); if (!name) return; state = L.addWorkType(state, { name }); el.value = ''; save(); render(); };
  actions.editWorkTypeName = (el) => { state = L.updateEntity(state, 'workTypes', el.dataset.id, { name: el.value }); save(); };
  actions.toggleWorkTypeArchive = (el) => { const w = state.workTypes.find((x) => x.id === el.dataset.id); state = L.updateEntity(state, 'workTypes', el.dataset.id, { archived: !w.archived }); save(); render(); };

  actions.exportData = () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `weikenlog-${L.isoDate(new Date())}.json`;
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    state = { ...state, settings: { ...state.settings, lastBackupAt: new Date().toISOString() } };
    save(); render(); toast('已导出备份');
  };
  actions.importData = () => { const inp = document.getElementById('import-file'); if (inp) inp.click(); };
  actions.importFileChange = (el) => {
    const file = el.files && el.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      let obj;
      try { obj = JSON.parse(reader.result); } catch (e) { toast('导入失败：不是有效的 JSON'); return; }
      const v = L.validateState(obj);
      if (!v.ok) { toast('导入失败：' + v.errors[0]); return; }
      if (!confirm('导入将覆盖当前所有数据，确定继续？')) return;
      state = v.state; save(); render(); toast('导入成功');
    };
    reader.readAsText(file);
  };
  actions.editRetention = (el) => {
    const n = parseInt(el.value, 10) || 30;
    state = { ...state, settings: { ...state.settings, backupRetention: n } };
    save();
  };

  function renderTabs() {
    document.getElementById('tabs').innerHTML = TABS.map((t) =>
      `<button class="tab${t.id === activeTab ? ' active' : ''}" data-action="tab" data-tab="${t.id}"><span class="tico">${t.icon}</span>${esc(t.label)}</button>`
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

  function maybeRemindBackup() {
    if (Store.mode !== 'local') return;
    const hasData = state.logEntries.length || state.tasks.length || state.collectionItems.length;
    if (!hasData) return;
    const d = Store.overdueDays(state);
    if (d === null || d >= 7) {
      toastAction('提醒：数据已多日未备份', '去导出', () => { activeTab = 'settings'; render(); });
    }
  }

  async function boot() {
    await Store.init();
    let loaded;
    try { loaded = await Store.load(); }
    catch (e) {
      const v = document.getElementById('view');
      if (v) v.innerHTML = '<section class="pad"><h2>⚠ 无法加载数据</h2>'
        + '<p>' + esc('无法读取数据文件 weikenlog-data.json。为避免覆盖你的数据，应用暂不加载。请关闭后用 威肯Log.cmd 重新启动；若反复出现，请检查该文件是否损坏（可从 backups/ 恢复）。') + '</p>'
        + (Store.lastError || (e && e.message) ? '<p class="muted">' + esc('详情：' + (Store.lastError || e.message)) + '</p>' : '')
        + '</section>';
      return;
    }
    state = loaded;
    if (!state || !state.schemaVersion) state = L.createEmptyState();
    applyTheme(state.settings && state.settings.theme);
    selectedDate = L.isoDate(new Date());
    document.addEventListener('click', onClick);
    document.addEventListener('keydown', onKeydown);
    document.addEventListener('change', onChange);
    renderBanner();
    render();
    if (Store.lastError) toast(Store.lastError);
    maybeRemindBackup();
  }

  // Expose shared helpers to later same-file tasks via closure (they edit this file directly).
  root.WeikenUI = { boot, render, save };
  // The following are file-scoped and referenced directly by later tasks:
  root.WeikenUI._internal = { get state() { return state; }, esc, toast, toastAction, offerUndo,
    projectOptions, workTypeOptions, parseTags, renderers, actions, afterRender };
})(typeof window !== 'undefined' ? window : this);
