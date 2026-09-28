const test = require('node:test');
const assert = require('node:assert/strict');
const { handshake, compareSemver } = require('../src/adapters/atlas/handshake');
const manifest = require('../manifest.json');

test('host handshake falls back when Atlas is unavailable', () => {
  const result = handshake({ manifest });
  assert.equal(result.state, 'FALLBACK');
  assert.equal(result.connected, false);
  assert.equal(result.reason, 'HOST_NOT_FOUND');
});

test('host handshake rejects incompatible host versions', () => {
  const result = handshake({
    manifest,
    hostInfo: { name: 'Crimson Atlas', version: '0.9.9' },
    hostCapabilities: manifest.capabilities
  });
  assert.equal(result.state, 'FALLBACK');
  assert.equal(result.reason, 'HOST_VERSION_UNSUPPORTED');
});

test('host handshake negotiates supported capabilities', () => {
  const result = handshake({
    manifest,
    hostInfo: { name: 'Crimson Atlas', version: '1.2.0' },
    hostCapabilities: ['settings.v1', 'updater.v1', 'overlay.v1']
  });
  assert.equal(result.state, 'NEGOTIATED');
  assert.equal(result.connected, true);
  assert.deepEqual(result.negotiated, ['settings.v1', 'updater.v1', 'overlay.v1']);
  assert.ok(result.fallback.includes('telemetry.v1'));
});

test('host handshake reaches running state when everything is compatible', () => {
  const result = handshake({
    manifest,
    hostInfo: { name: 'Crimson Atlas', version: '1.2.0' },
    hostCapabilities: manifest.capabilities
  });
  assert.equal(result.state, 'RUNNING');
  assert.equal(result.fallback.length, 0);
  assert.equal(compareSemver('1.10.0', '1.2.0') > 0, true);
});
