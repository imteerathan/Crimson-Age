const test = require('node:test');
const assert = require('node:assert/strict');
const { WindowsGameFrameSource } = require('../src/services/overlay/game-frame-source');

function fakeImage() {
  return { getSize: () => ({ width: 480, height: 270 }) };
}

test('frame source prefers exact window handle', async () => {
  const source = new WindowsGameFrameSource({
    desktopCapturer: {
      getSources: async () => [
        { id: 'window:111:0', name: 'Other', thumbnail: fakeImage() },
        { id: 'window:222:0', name: 'Crimson Desert', thumbnail: fakeImage() }
      ]
    }
  });
  const result = await source.capture({ hwnd: 222, title: 'Crimson Desert' });
  assert.equal(result.sourceId, 'window:222:0');
  assert.equal(result.hwnd, 222);
});

test('frame source can use a unique title match when the handle is unavailable', async () => {
  const source = new WindowsGameFrameSource({
    desktopCapturer: {
      getSources: async () => [
        { id: 'window:333:0', name: 'Crimson Desert', thumbnail: fakeImage() }
      ]
    }
  });
  const result = await source.capture({ hwnd: 999, title: 'Crimson Desert' });
  assert.equal(result.sourceId, 'window:333:0');
});

test('frame source fails closed when capture source is ambiguous', async () => {
  const source = new WindowsGameFrameSource({
    desktopCapturer: {
      getSources: async () => [
        { id: 'window:333:0', name: 'Crimson Desert', thumbnail: fakeImage() },
        { id: 'window:444:0', name: 'Crimson Desert', thumbnail: fakeImage() }
      ]
    }
  });
  await assert.rejects(() => source.capture({ hwnd: 999, title: 'Crimson Desert' }), /capture source not found/i);
});
