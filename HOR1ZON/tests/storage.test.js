const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { ExtensionStateStore } = require('../src/services/storage/extension-state');

test('extension state persists launches and runtime markers', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'horizon-state-'));
  const store = new ExtensionStateStore(path.join(dir, 'extension-state.json'));
  store.load();
  const first = store.markStarted('2026-09-28T01:00:00.000Z');
  assert.equal(first.launchCount, 1);
  const second = store.markStarted('2026-09-28T02:00:00.000Z');
  assert.equal(second.launchCount, 2);
  store.setMigrationVersion(3);
  store.setHostStatus({ status: 'FALLBACK' });
  const reloaded = new ExtensionStateStore(path.join(dir, 'extension-state.json'));
  assert.equal(reloaded.load().launchCount, 2);
  assert.equal(reloaded.get().migrationVersion, 3);
  assert.equal(reloaded.get().lastHostStatus.status, 'FALLBACK');
});
