const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { UpdaterService } = require('../src/services/updater/service');

test('updater service reacts to package events and exposes install path', async () => {
  const fake = new EventEmitter();
  fake.checkForUpdates = async () => fake.emit('update-available', { version: '0.2.0' });
  fake.downloadUpdate = async () => {
    fake.emit('download-progress', { percent: 50 });
    fake.emit('download-progress', { percent: 100 });
    fake.emit('update-downloaded', { version: '0.2.0' });
  };
  let installed = false;
  fake.quitAndInstall = () => { installed = true; };

  const service = new UpdaterService({ updater: fake, version: '0.1.0' });
  await service.check();
  assert.equal(service.getState().state, 'AVAILABLE');
  await service.download();
  assert.equal(service.getState().state, 'READY');
  assert.equal(service.install(), true);
  assert.equal(installed, true);
  assert.equal(service.getState().state, 'RESTARTING');
});
