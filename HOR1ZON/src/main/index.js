const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { autoUpdater } = require('electron-updater');
const { SettingsStore } = require('../services/settings/store');
const { UpdaterService } = require('../services/updater/service');
const { resolveFeedUrl } = require('../services/updater/feed');
const { EventBus } = require('../core/events/event-bus');
const { validateManifest } = require('../core/contracts/manifest');
const { AtlasConnection } = require('../adapters/atlas/connection');
const { createLoader } = require('../adapters/atlas/loader');
const { ExtensionStateStore } = require('../services/storage/extension-state');
const { DiagnosticsService } = require('../services/diagnostics/service');
const { MigrationService } = require('../services/migration/service');
const { OverlayManager } = require('../services/overlay/manager');
const { OverlayRuntimeGuard } = require('../services/overlay/runtime-guard');
const { createWindowsGameWindowResolver, createWindowsForegroundResolver, createWindowsForegroundUiResolver, WindowDisplayTracker, GameUiHeuristicDetector } = require('../services/overlay/window-display');
const manifest = require('../../manifest.json');

let win;
let settings;
let updater;
let extensionState;
let diagnostics;
let migrations;
const events = new EventBus();
const atlas = new AtlasConnection(manifest);
const atlasLoader = createLoader({ manifest, onEvent: event => events.emit(event) });
let overlay;
let runtimeGuard;
let displayTracker;
let gameUiDetector;

function recordDiagnostic(event, payload) {
  if (diagnostics) diagnostics.record(event, payload);
}

function sendUpdaterState(state) {
  events.emit({
    event: 'horizon.updater.state',
    version: 1,
    timestamp: new Date().toISOString(),
    source: 'horizon.updater',
    payload: state
  });
  recordDiagnostic('horizon.updater.state', state);
  if (extensionState) extensionState.setUpdaterState(state);
  if (win && !win.isDestroyed()) win.webContents.send('horizon:updater:state', state);
  if (overlay) overlay.setData({ updaterState: state.state, currentVersion: state.currentVersion || app.getVersion(), version: app.getVersion() });
}

function createOverlay() {
  overlay = new OverlayManager({
    BrowserWindowClass: BrowserWindow,
    screenApi: require('electron').screen,
    pathModule: path,
    overlayHtmlPath: path.join(__dirname, '../overlay/index.html'),
    overlayPreloadPath: path.join(__dirname, '../overlay/preload.js'),
    onState: state => {
      recordDiagnostic('horizon.overlay.state', state);
    },
    onPositionChange: position => {
      if (settings) settings.set({ overlay: { position } });
    }
  });
  overlay.configure(settings.get().overlay);
  overlay.setData({
    version: app.getVersion(),
    currentVersion: app.getVersion(),
    host: 'Standalone',
    hostState: atlas.getState().status,
    updaterState: updater ? updater.getState().state : 'IDLE'
  });
  runtimeGuard = new OverlayRuntimeGuard({
    overlay,
    getSettings: () => settings.get()
  });

  if (process.platform === 'win32') {
    const processResolver = createWindowsGameWindowResolver({
      processNames: ['CrimsonDesert', 'CrimsonDesert-Win64-Shipping']
    });
    const foregroundResolver = createWindowsForegroundResolver();
    const resolver = callback => {
      processResolver((error, windowInfo) => {
        if (!error && windowInfo) return callback(null, windowInfo);
        foregroundResolver((foregroundError, foregroundWindow) => callback(foregroundError, foregroundWindow));
      });
    };
    displayTracker = new WindowDisplayTracker({
      resolveWindow: resolver,
      screenApi: require('electron').screen,
      ownProcessNames: [
        'Crimson-Atlas-Horizon',
        'Crimson Atlas Horizon',
        'electron'
      ],
      ownPids: [process.pid],
      trackedProcessNames: [
        'CrimsonDesert',
        'CrimsonDesert-Win64-Shipping'
      ],
      onDisplay: (display, windowInfo) => {
        overlay.setTargetDisplay(display);
        overlay.setData({
          targetDisplayId: String(display.id),
          targetWindow: {
            pid: windowInfo.pid,
            processName: windowInfo.processName,
            title: windowInfo.title
          }
        });
        recordDiagnostic('horizon.overlay.target-display', {
          displayId: display.id,
          window: {
            pid: windowInfo.pid,
            processName: windowInfo.processName,
            title: windowInfo.title
          }
        });
      }
    });
    displayTracker.start();

    gameUiDetector = new GameUiHeuristicDetector({
      resolveUi: createWindowsForegroundUiResolver(),
      trackedProcessNames: ['CrimsonDesert', 'CrimsonDesert-Win64-Shipping'],
      onState: (state, windowInfo) => {
        const current = runtimeGuard.getState().state;
        if (state === 'GAME_UI_HEURISTIC' && ['GAMEPLAY', 'GAME_UI_HEURISTIC'].includes(current)) {
          runtimeGuard.setState('GAME_UI_HEURISTIC', {
            reason: 'game-cursor-visible',
            window: windowInfo?.title || null
          });
        } else if (state === 'GAMEPLAY' && current === 'GAME_UI_HEURISTIC') {
          runtimeGuard.setState('GAMEPLAY', { reason: 'game-cursor-hidden' });
        }
      }
    });
    gameUiDetector.start();
  }
}
  
function syncOverlay() {
  if (!overlay) return;
  const hostState = atlas.getState();
  const updaterState = updater?.getState() || {};
  overlay.configure(settings.get().overlay);
  overlay.setData({
    version: app.getVersion(),
    currentVersion: updaterState.currentVersion || app.getVersion(),
    host: hostState.host?.name || 'Standalone',
    hostState: hostState.status,
    updaterState: updaterState.state || 'IDLE'
  });
}

function createWindow() {
  win = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 1080,
    minHeight: 700,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  win.loadFile(path.join(__dirname, '../renderer/index.html'));
}

function registerIpc() {
  ipcMain.handle('horizon:manifest', () => manifest);
  ipcMain.handle('horizon:settings:get', () => settings.get());
  ipcMain.handle('horizon:settings:set', (_event, patch) => {
    const next = settings.set(patch);
    if (app.isPackaged) {
      const channel = next.updates.channel || manifest.updater.channel || 'stable';
      autoUpdater.setFeedURL({ provider: 'generic', url: resolveFeedUrl(manifest.updater.feedBase, channel) });
    }
    syncOverlay();
    return next;
  });
  ipcMain.handle('horizon:settings:reset', () => {
    const next = settings.reset();
    if (app.isPackaged) {
      const channel = next.updates.channel || manifest.updater.channel || 'stable';
      autoUpdater.setFeedURL({ provider: 'generic', url: resolveFeedUrl(manifest.updater.feedBase, channel) });
    }
    syncOverlay();
    return next;
  });

  ipcMain.handle('horizon:host:status', () => atlas.getState());
  ipcMain.handle('horizon:state:get', () => extensionState.get());
  ipcMain.handle('horizon:diagnostics:recent', (_event, limit = 50) => diagnostics.listRecent(limit));
  ipcMain.handle('horizon:loader:status', () => atlasLoader.getState());
  ipcMain.handle('horizon:host:simulate-handshake', (_event, hostInfo, hostCapabilities) => {
    const state = atlas.evaluate(hostInfo, hostCapabilities);
    extensionState.setHostStatus(state);
    recordDiagnostic('horizon.host.state', state);
    if (overlay) syncOverlay();
    if (state.connected) {
      atlasLoader.load({
        info: { name: hostInfo.name, version: hostInfo.version, protocol: hostInfo.protocol },
        capabilities: hostCapabilities || []
      });
    } else {
      atlasLoader.unload(state.reason || 'HOST_UNAVAILABLE');
    }
    return state;
  });

  ipcMain.handle('horizon:updater:get', () => updater.getState());
  ipcMain.handle('horizon:updater:check', () => updater.check());
  ipcMain.handle('horizon:updater:download', () => updater.download());
  ipcMain.handle('horizon:updater:install', () => updater.install());
  ipcMain.handle('horizon:overlay:get', () => overlay?.getState() || { visible: false, ...settings.get().overlay });
  ipcMain.handle('horizon:overlay:show', () => overlay.show('ipc-show'));
  ipcMain.handle('horizon:overlay:hide', () => overlay.hide('ipc-hide'));
  ipcMain.handle('horizon:overlay:toggle', () => overlay.toggle('ipc-toggle'));
  ipcMain.handle('horizon:overlay:edit-toggle', () => overlay.setEditMode(!overlay.getState().editMode));
  ipcMain.handle('horizon:overlay:set-position', (_event, position) => overlay.setPosition(position));
  ipcMain.handle('horizon:overlay:runtime-state', (_event, state, reason) => runtimeGuard.setState(state, { reason }));
  ipcMain.handle('horizon:overlay:notify', (_event, message, duration = 3000) => overlay.notify(message, duration));
}

app.whenReady().then(() => {
  validateManifest(manifest);

  const dataDir = path.join(app.getPath('userData'), 'data');
  settings = new SettingsStore(path.join(dataDir, 'horizon-settings.json'));
  settings.load();

  extensionState = new ExtensionStateStore(path.join(dataDir, 'extension-state.json'));
  const savedState = extensionState.load();
  migrations = new MigrationService({ currentVersion: 1, migrations: [{ version: 1, up: () => {} }] });
  const migrationResult = migrations.run(savedState.migrationVersion);
  extensionState.setMigrationVersion(migrationResult.version);
  diagnostics = new DiagnosticsService(path.join(dataDir, 'diagnostics.jsonl'), {
    retentionDays: settings.get().privacy.diagnosticRetentionDays
  });
  diagnostics.prune();
  extensionState.markStarted(new Date().toISOString());
  recordDiagnostic('horizon.lifecycle.boot', { version: app.getVersion(), migrationVersion: migrationResult.version });
  const envFeedUrl = process.env.HORIZON_UPDATE_FEED_URL || '';
  const configureUpdaterFeed = () => {
    const channel = settings.get().updates.channel || manifest.updater.channel || 'stable';
    const feedUrl = envFeedUrl || resolveFeedUrl(manifest.updater.feedBase, channel);
    if (app.isPackaged && feedUrl) {
      autoUpdater.setFeedURL({ provider: 'generic', url: feedUrl });
    }
    return Boolean(feedUrl);
  };

  const updaterConfigured = configureUpdaterFeed();

  updater = new UpdaterService({
    updater: autoUpdater,
    version: app.getVersion(),
    isPackaged: app.isPackaged,
    configured: updaterConfigured || !app.isPackaged,
    emit: sendUpdaterState
  });

  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.allowDowngrade = false;

  registerIpc();
  atlas.evaluate(null, []);
  createOverlay();
  atlasLoader.unload('HOST_NOT_FOUND');
  createWindow();
  sendUpdaterState(updater.getState());
  syncOverlay();
  if (globalShortcut.register('CommandOrControl+Shift+H', () => overlay?.toggle('global-shortcut')) === false) {
    recordDiagnostic('horizon.overlay.shortcut-unavailable', { shortcut: 'CommandOrControl+Shift+H' });
  }

  events.emit({
    event: 'horizon.lifecycle.started',
    version: 1,
    timestamp: new Date().toISOString(),
    source: 'horizon'
  });
});

const { globalShortcut } = require('electron');

app.on('before-quit', () => {
  if (displayTracker) displayTracker.stop();
  if (gameUiDetector) gameUiDetector.stop();
  if (overlay) overlay.destroy();
  globalShortcut.unregister('CommandOrControl+Shift+H');
  const timestamp = new Date().toISOString();
  if (extensionState) extensionState.markShutdown(timestamp);
  recordDiagnostic('horizon.lifecycle.shutdown', { timestamp });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
