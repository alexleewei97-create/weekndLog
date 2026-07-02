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
    return {
      week: { title: '周报' },
      month: { title: '月报' },
    };
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

  // ---- Additional functions are appended by later tasks, ABOVE this return. ----

  return {
    SCHEMA_VERSION,
    DEFAULT_WORK_TYPES,
    uid,
    createEmptyState,
  };
});
