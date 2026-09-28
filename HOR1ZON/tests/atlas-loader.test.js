const test = require('node:test');
const assert = require('node:assert/strict');
const { createLoader, PROTOCOL_NAME, PROTOCOL_VERSION } = require('../src/adapters/atlas/loader');
const manifest = require('../manifest.json');

test('loader falls back cleanly when Atlas is absent', () => {
  const loader = createLoader({ manifest });
  const state = loader.load(null);
  assert.equal(state.loaded, false);
  assert.equal(state.reason, 'HOST_NOT_FOUND');
  assert.deepEqual(state.fallback, manifest.capabilities);
});

test('loader validates protocol and negotiates capabilities without touching host internals', () => {
  let loaded = null;
  const loader = createLoader({ manifest });
  const state = loader.load({
    info: { name: 'Crimson Atlas', version: '1.2.0', protocol: { name: PROTOCOL_NAME, version: PROTOCOL_VERSION } },
    capabilities: ['settings.v1', 'overlay.v1'],
    onLoad: payload => { loaded = payload; }
  });

  assert.equal(state.loaded, true);
  assert.deepEqual(state.negotiated, ['settings.v1', 'overlay.v1']);
  assert.equal(state.fallback.includes('map.v1'), true);
  assert.equal(loaded.manifest.id, manifest.id);
});

test('loader rejects an incompatible protocol before loading', () => {
  const loader = createLoader({ manifest });
  assert.throws(
    () => loader.load({ info: { name: 'Crimson Atlas', version: '1.2.0', protocol: { name: 'wrong', version: 1 } }, capabilities: [] }),
    /Unsupported host protocol/
  );
});
