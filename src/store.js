(function (root) {
  'use strict';
  const LS_KEY = 'weikenlog.data';

  const store = {
    mode: null,
    lastError: null,

    async init() {
      try {
        const res = await fetch('/api/health', { cache: 'no-store' });
        if (res.ok) { this.mode = 'server'; return; }
      } catch (e) { /* unreachable → local */ }
      this.mode = 'local';
    },

    async load() {
      if (this.mode === 'server') {
        // A read ERROR must not silently yield empty state — the first save would
        // then overwrite the real data file. Only a successful null body (fresh
        // install) maps to an empty state.
        const res = await fetch('/api/data', { cache: 'no-store' });
        if (!res.ok) throw new Error('读取数据失败: HTTP ' + res.status);
        const data = await res.json();
        return data || root.WeikenLogic.createEmptyState();
      }
      const raw = localStorage.getItem(LS_KEY);
      if (raw) {
        try { return JSON.parse(raw); }
        catch (e) { this.lastError = '本地数据损坏，已载入空白数据'; }
      }
      return root.WeikenLogic.createEmptyState();
    },

    async save(state) {
      if (this.mode === 'server') {
        const res = await fetch('/api/data', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(state),
        });
        const out = await res.json();
        if (!out.ok) { this.lastError = out.error || '保存失败'; throw new Error(this.lastError); }
        this.lastError = null;
        return;
      }
      try {
        localStorage.setItem(LS_KEY, JSON.stringify(state));
        this.lastError = null;
      } catch (e) { this.lastError = '本地存储已满，请到"设置"导出备份'; throw e; }
    },

    overdueDays(state) {
      if (this.mode !== 'local') return null;
      const last = state && state.settings && state.settings.lastBackupAt;
      if (!last) return null;
      return Math.floor((Date.now() - new Date(last).getTime()) / 86400000);
    },
  };

  root.WeikenStore = store;
})(typeof window !== 'undefined' ? window : this);
