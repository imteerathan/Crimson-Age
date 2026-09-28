const test = require('node:test');
const assert = require('node:assert/strict');
const { createUpdaterState, transition } = require('../src/services/updater/state-machine');

test('unconfigured updater remains safe until a feed exists', () => {
  const state = createUpdaterState('0.1.0', false);
  assert.equal(state.state, 'UNCONFIGURED');
  assert.throws(() => transition(state, 'AVAILABLE'), /Invalid updater transition/);
  assert.deepEqual(Object.keys(state).sort(), [
    'availableVersion',
    'checkedAt',
    'currentVersion',
    'downloadedAt',
    'error',
    'progress',
    'state',
    'updatedAt'
  ]);
});
