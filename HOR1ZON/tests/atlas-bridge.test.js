const test = require('node:test');
const assert = require('node:assert/strict');
const { AtlasBridge } = require('../src/adapters/atlas/bridge');
const manifest = require('../manifest.json');

test('bridge connects through a transport contract without depending on Atlas internals', async () => {
  const bridge = new AtlasBridge({
    manifest,
    transport: {
      async getHostInfo() {
        return { name: 'Crimson Atlas', version: '1.0.0', protocol: { name: 'atlas-extension', version: 1 } };
      },
      async getCapabilities() {
        return ['settings.v1', 'overlay.v1'];
      }
    }
  });

  const state = await bridge.connect();
  assert.equal(state.status, 'CONNECTED');
  assert.deepEqual(state.capabilities, ['settings.v1', 'overlay.v1']);
});

test('bridge converts transport failure into explicit error state', async () => {
  const bridge = new AtlasBridge({
    manifest,
    transport: {
      async getHostInfo() { throw new Error('HOST_UNAVAILABLE'); },
      async getCapabilities() { return []; }
    }
  });

  const state = await bridge.connect();
  assert.equal(state.status, 'ERROR');
  assert.equal(state.reason, 'HOST_UNAVAILABLE');
});

test('bridge disconnects without destroying extension state', async () => {
  const bridge = new AtlasBridge({
    manifest,
    transport: {
      async getHostInfo() { return { name: 'Crimson Atlas', version: '1.0.0' }; },
      async getCapabilities() { return ['settings.v1']; }
    }
  });

  await bridge.connect();
  const state = bridge.disconnect('TEST_DISCONNECT');
  assert.equal(state.status, 'DISCONNECTED');
  assert.equal(state.reason, 'TEST_DISCONNECT');
});
