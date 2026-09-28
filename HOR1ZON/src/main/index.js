const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { autoUpdater } = require('electron-updater');
const { SettingsStore } = require('../services/settings/store');
const { UpdaterService } = require('../services/updater/service');
const { EventBus } = require('../core/events/event-bus');
const { validateManifest } = require('../core/contracts/manifest');
const { handshake } = require('../adapters/atlas/handshake');
const manifest = require('../../manifest.json');

let win;
let settings;
let updater;
const events = new EventBus();

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
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 640,
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
  ipcMain.handle('horizon:host:status', () => handshake({ manifest }));
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

  updater = new UpdaterService({
    updater: autoUpdater,
    version: app.getVersion(),
    isPackaged: app.isPackaged,
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
