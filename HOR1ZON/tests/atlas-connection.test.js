const test = require('node:test');
const assert = require('node:assert/strict');
const { AtlasConnection } = require('../src/adapters/atlas/connection');
const manifest = require('../manifest.json');

test('atlas connection transitions to fallback when no host is present', () => {
  const connection = new AtlasConnection(manifest);
  const state = connection.evaluate(null, []);
  assert.equal(state.status, 'FALLBACK');
  assert.equal(state.connected, false);
});

test('atlas connection negotiates host capabilities', () => {
  const connection = new AtlasConnection(manifest);
  const state = connection.evaluate(
    { name: 'Crimson Atlas', version: '1.2.0' },
    ['settings.v1', 'updater.v1', 'overlay.v1']
  );
  assert.equal(state.status, 'NEGOTIATED');
  assert.equal(state.connected, true);
  assert.deepEqual(state.negotiated, ['settings.v1', 'updater.v1', 'overlay.v1']);
});
