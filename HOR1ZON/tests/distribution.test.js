const test = require('node:test');
const assert = require('node:assert/strict');
const packageJson = require('../package.json');
const manifest = require('../manifest.json');

test('Windows distribution is self-contained and updater endpoint remains external', () => {
  assert.equal(packageJson.build.appId, 'com.crimsonatlas.horizon');
  assert.equal(packageJson.build.productName, 'Crimson Atlas Horizon');
  assert.deepEqual(packageJson.build.win.target.map(target => target.target), ['nsis']);
  assert.equal(packageJson.build.directories.output, 'dist');
  assert.equal(packageJson.version, '0.1.5');
  assert.equal(manifest.version, packageJson.version);
  assert.deepEqual(packageJson.build.publish, [{
    provider: 'generic',
    url: 'https://raw.githubusercontent.com/imteerathan/Crimson-Age/hor1zon-foundation/updates/stable/'
  }]);
  assert.equal(manifest.updater.provider, 'generic');
  assert.equal(manifest.updater.feedBase.startsWith('https://'), true);
});
