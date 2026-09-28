const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { validateManifest, negotiateCapabilities } = require('../src/core/contracts/manifest');
const { EventBus } = require('../src/core/events/event-bus');
const { createUpdaterState, transition } = require('../src/services/updater/state-machine');
const { SettingsStore } = require('../src/services/settings/store');
const manifest = require('../manifest.json');

test('manifest validates and capability negotiation fails closed', () => {
  assert.equal(validateManifest(manifest), true);
  const result = negotiateCapabilities(manifest.capabilities, ['settings.v1', 'updater.v1', 'overlay.v1']);
  assert.deepEqual(result.negotiated, ['settings.v1', 'updater.v1', 'overlay.v1']);
  assert.ok(result.fallback.includes('telemetry.v1'));
});

test('event bus subscribes and unsubscribes', () => {
  const bus = new EventBus();
  let count = 0;
  const off = bus.on('demo', () => { count += 1; });
  assert.equal(bus.emit({event:'demo', version:1, timestamp:'now'}), 1);
  off();
  assert.equal(bus.emit({event:'demo', version:1, timestamp:'later'}), 0);
  assert.equal(count, 1);
});

test('updater state machine accepts valid path and rejects invalid path', () => {
  let state = createUpdaterState('0.1.0');
  state = transition(state, 'CHECKING');
  state = transition(state, 'AVAILABLE', { availableVersion: '0.2.0' });
  state = transition(state, 'DOWNLOADING', { progress: 42 });
  state = transition(state, 'READY', { progress: 100 });
  state = transition(state, 'INSTALLING');
  state = transition(state, 'RESTARTING');
  state = transition(state, 'UPDATED', { currentVersion: '0.2.0' });
  assert.equal(state.state, 'UPDATED');
  assert.throws(() => transition(state, 'INSTALLING'), /Invalid updater transition/);
});

test('settings store persists, merges and resets atomically', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'horizon-test-'));
  const file = path.join(dir, 'settings.json');
  const store = new SettingsStore(file);
  const initial = store.load();
  assert.equal(initial.overlay.enabled, true);
  const updated = store.set({ overlay: { enabled: false } });
  assert.equal(updated.overlay.enabled, false);
  const reloaded = new SettingsStore(file);
  assert.equal(reloaded.load().overlay.enabled, false);
  assert.equal(reloaded.reset().overlay.enabled, true);
});
