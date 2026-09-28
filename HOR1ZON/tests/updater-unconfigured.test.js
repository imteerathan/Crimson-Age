const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { UpdaterService } = require('../src/services/updater/service');

test('packaged updater with no feed stays unconfigured and never calls updater APIs', async () => {
  const fake = new EventEmitter();
  let checks = 0;
  let downloads = 0;
  let installs = 0;
  fake.checkForUpdates = async () => { checks += 1; };
  fake.downloadUpdate = async () => { downloads += 1; };
  fake.quitAndInstall = () => { installs += 1; };

  const service = new UpdaterService({ updater: fake, version: '0.1.0', isPackaged: true, configured: false });
  assert.equal(service.getState().state, 'UNCONFIGURED');
  await service.check();
  assert.equal(service.getState().state, 'UNCONFIGURED');
  assert.equal(checks, 0);
  const downloadState = await service.download();
  assert.equal(downloadState.state, 'UNCONFIGURED');
  assert.equal(downloads, 0);
  assert.equal(service.install(), false);
  assert.equal(installs, 0);
});
