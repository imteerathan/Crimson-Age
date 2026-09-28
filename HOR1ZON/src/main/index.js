const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { autoUpdater } = require('electron-updater');
const { SettingsStore } = require('../services/settings/store');
const { UpdaterService } = require('../services/updater/service');
const { EventBus } = require('../core/events/event-bus');
const { validateManifest } = require('../core/contracts/manifest');
const { AtlasConnection } = require('../adapters/atlas/connection');
const { createLoader } = require('../adapters/atlas/loader');
const manifest = require('../../manifest.json');

let win;
let settings;
let updater;
const events = new EventBus();
const atlas = new AtlasConnection(manifest);
const atlasLoader = createLoader({ manifest, onEvent: event => events.emit(event) });

function sendUpdaterState(state) {
  events.emit({
    event: 'horizon.updater.state',
    version: 1,
    timestamp: new Date().toISOString(),
    source: 'horizon.updater',
    payload: state
  });
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
  ipcMain.handle('horizon:loader:status', () => atlasLoader.getState());
  ipcMain.handle('horizon:host:simulate-handshake', (_event, hostInfo, hostCapabilities) => {
    const state = atlas.evaluate(hostInfo, hostCapabilities);
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
  createWindow();
  sendUpdaterState(updater.getState());

  events.emit({
    event: 'horizon.lifecycle.started',
    version: 1,
    timestamp: new Date().toISOString(),
    source: 'horizon'
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
