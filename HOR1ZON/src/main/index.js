const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { autoUpdater } = require('electron-updater');
const { SettingsStore } = require('../services/settings/store');
const { UpdaterService } = require('../services/updater/service');
const { EventBus } = require('../core/events/event-bus');
const { validateManifest } = require('../core/contracts/manifest');
const { AtlasConnection } = require('../adapters/atlas/connection');
const { createLoader } = require('../adapters/atlas/loader');
const { ExtensionStateStore } = require('../services/storage/extension-state');
const { DiagnosticsService } = require('../services/diagnostics/service');
const { MigrationService } = require('../services/migration/service');
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
  ipcMain.handle('horizon:settings:set', (_event, patch) => settings.set(patch));
  ipcMain.handle('horizon:settings:reset', () => settings.reset());

  ipcMain.handle('horizon:host:status', () => atlas.getState());
  ipcMain.handle('horizon:state:get', () => extensionState.get());
  ipcMain.handle('horizon:diagnostics:recent', (_event, limit = 50) => diagnostics.listRecent(limit));
  ipcMain.handle('horizon:loader:status', () => atlasLoader.getState());
  ipcMain.handle('horizon:host:simulate-handshake', (_event, hostInfo, hostCapabilities) => {
    const state = atlas.evaluate(hostInfo, hostCapabilities);
    extensionState.setHostStatus(state);
    recordDiagnostic('horizon.host.state', state);
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
  const feedUrl = process.env.HORIZON_UPDATE_FEED_URL || '';
  if (app.isPackaged && feedUrl) {
    autoUpdater.setFeedURL({ provider: 'generic', url: feedUrl });
  }

  updater = new UpdaterService({
    updater: autoUpdater,
    version: app.getVersion(),
    isPackaged: app.isPackaged,
    configured: Boolean(feedUrl) || !app.isPackaged,
    emit: sendUpdaterState
  });

  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.allowDowngrade = false;

  registerIpc();
  atlas.evaluate(null, []);
  atlasLoader.unload('HOST_NOT_FOUND');
  createWindow();
  sendUpdaterState(updater.getState());

  events.emit({
    event: 'horizon.lifecycle.started',
    version: 1,
    timestamp: new Date().toISOString(),
    source: 'horizon'
  });
});

app.on('before-quit', () => {
  const timestamp = new Date().toISOString();
  if (extensionState) extensionState.markShutdown(timestamp);
  recordDiagnostic('horizon.lifecycle.shutdown', { timestamp });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
