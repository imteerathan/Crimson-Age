const test = require('node:test');
const assert = require('node:assert/strict');
const { DEFAULTS } = require('../src/services/settings/store');
const { validateSettings } = require('../src/services/settings/schema');

test('default settings satisfy Horizon schema', () => {
  assert.equal(validateSettings(DEFAULTS), true);
});

test('invalid overlay mode is rejected', () => {
  const invalid = structuredClone(DEFAULTS);
  invalid.overlay.mode = 'UNKNOWN';
  assert.throws(() => validateSettings(invalid), /overlay.mode is invalid/);
});
