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
