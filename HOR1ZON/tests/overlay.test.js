const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { OverlayManager } = require('../src/services/overlay/manager');

function fakeWindowFactory() {
  class FakeWebContents {
    constructor() { this.loading = false; this.listeners = {}; this.sent = []; }
    on(event, callback) { this.listeners[event] = callback; }
    isLoading() { return this.loading; }
    send(channel, payload) { this.sent.push({ channel, payload }); }
  }

  return class FakeWindow {
    constructor(options) {
      this.options = options;
      this.webContents = new FakeWebContents();
      this.listeners = {};
      this.visible = false;
      this.destroyed = false;
      this.bounds = null;
    }
    setAlwaysOnTop() {}
    setIgnoreMouseEvents(value) { this.ignoreMouseEvents = value; }
    setFocusable(value) { this.focusable = value; }
    on(event, cb) { this.listeners[event] = cb; }
    setBounds(bounds) { this.bounds = bounds; }
    loadFile() {}
    showInactive() { this.visible = true; }
    hide() { this.visible = false; }
    isDestroyed() { return this.destroyed; }
    destroy() { this.destroyed = true; this.listeners.closed?.(); }
  };
}

test('overlay remains hidden until explicitly shown', () => {
  const ManagerWindow = fakeWindowFactory();
  const manager = new OverlayManager({
    BrowserWindowClass: ManagerWindow,
    screenApi: {
      getCursorScreenPoint: () => ({ x: 20, y: 20 }),
      getDisplayNearestPoint: () => ({ workArea: { x: 0, y: 0, width: 1920, height: 1080 } })
    },
    pathModule: path,
    overlayHtmlPath: '/overlay/index.html',
    overlayPreloadPath: '/overlay/preload.js'
  });

  assert.equal(manager.getState().visible, false);
  manager.show();
  assert.equal(manager.getState().visible, true);
  assert.equal(manager.window.visible, false);
  manager.window.webContents.listeners['did-finish-load']();
  assert.equal(manager.window.visible, true);
  manager.hide();
  assert.equal(manager.getState().visible, false);
});

test('manual hide policy prevents showing the overlay', () => {
  const ManagerWindow = fakeWindowFactory();
  const manager = new OverlayManager({
    BrowserWindowClass: ManagerWindow,
    screenApi: {
      getCursorScreenPoint: () => ({ x: 0, y: 0 }),
      getDisplayNearestPoint: () => ({ workArea: { x: 0, y: 0, width: 1280, height: 720 } })
    },
    pathModule: path,
    overlayHtmlPath: '/overlay/index.html',
    overlayPreloadPath: '/overlay/preload.js'
  });

  manager.configure({ manualHide: true });
  manager.show();
  assert.equal(manager.getState().visible, false);
});


test('overlay position is persisted through position callback and edit mode enables pointer input', () => {
  const ManagerWindow = fakeWindowFactory();
  let savedPosition = null;
  const manager = new OverlayManager({
    BrowserWindowClass: ManagerWindow,
    screenApi: {
      getCursorScreenPoint: () => ({ x: 0, y: 0 }),
      getDisplayNearestPoint: () => ({ workArea: { x: 0, y: 0, width: 1280, height: 720 } })
    },
    pathModule: path,
    overlayHtmlPath: '/overlay/index.html',
    overlayPreloadPath: '/overlay/preload.js',
    onPositionChange: position => { savedPosition = position; }
  });
  manager.show();
  manager.setEditMode(true);
  assert.equal(manager.getState().editMode, true);
  manager.setPosition({ x: 0.25, y: 0.75 });
  assert.deepEqual(savedPosition, { x: 0.25, y: 0.75 });
  assert.equal(manager.getState().position.x, 0.25);
  assert.equal(manager.getState().position.y, 0.75);
});

test('runtime suppression hides overlay but notifications remain visible for their duration', async () => {
  const ManagerWindow = fakeWindowFactory();
  const manager = new OverlayManager({
    BrowserWindowClass: ManagerWindow,
    screenApi: {
      getCursorScreenPoint: () => ({ x: 0, y: 0 }),
      getDisplayNearestPoint: () => ({ workArea: { x: 0, y: 0, width: 1280, height: 720 } })
    },
    pathModule: path,
    overlayHtmlPath: '/overlay/index.html',
    overlayPreloadPath: '/overlay/preload.js'
  });
  manager.show();
  manager.setRuntimeSuppressed(true, 'fullscreen-ui');
  assert.equal(manager.getState().visible, false);
  manager.notify('UI notification', 25);
  assert.equal(manager.getState().visible, true);
  assert.equal(manager.getState().data.notification.message, 'UI notification');
  await new Promise(resolve => setTimeout(resolve, 520));
  assert.equal(manager.getState().visible, false);
  assert.equal(manager.getState().data.notification, null);
});
