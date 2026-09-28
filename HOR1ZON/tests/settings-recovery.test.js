const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { SettingsStore } = require('../src/services/settings/store');

test('corrupt settings recover to defaults and preserve evidence', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'horizon-recovery-'));
  const file = path.join(dir, 'settings.json');
  fs.writeFileSync(file, '{"overlay":', 'utf8');

  const store = new SettingsStore(file);
  const settings = store.load();

  assert.equal(settings.overlay.enabled, true);
  assert.equal(fs.existsSync(file), true);
  assert.equal(fs.existsSync(path.join(dir, 'settings.corrupt.json')), true);
});


test('legacy update channel is removed during settings load', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'horizon-channel-migration-'));
  const file = path.join(dir, 'settings.json');
  fs.writeFileSync(file, JSON.stringify({ updates: { channel: 'beta', checkOnLaunch: true } }), 'utf8');

  const store = new SettingsStore(file);
  const settings = store.load();
  assert.equal(settings.updates.channel, undefined);
  assert.equal(settings.updates.checkOnLaunch, true);
});
