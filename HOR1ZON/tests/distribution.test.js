const test = require('node:test');
const assert = require('node:assert/strict');
const packageJson = require('../package.json');

test('Windows distribution is self-contained and updater endpoint remains external', () => {
  assert.equal(packageJson.build.appId, 'com.crimsonatlas.horizon');
  assert.equal(packageJson.build.productName, 'Crimson Atlas Horizon');
  assert.deepEqual(packageJson.build.win.target.map(target => target.target), ['nsis']);
  assert.equal(packageJson.build.directories.output, 'dist');
  assert.equal(packageJson.build.publish, undefined);
});
