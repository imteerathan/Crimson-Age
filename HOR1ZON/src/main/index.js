const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { SettingsStore } = require('../services/settings/store');
const { EventBus } = require('../core/events/event-bus');
const { validateManifest } = require('../core/contracts/manifest');
const manifest = require('../../manifest.json');

let win;
let settings;
const events = new EventBus();

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
  ipcMain.handle('horizon:host:status', () => ({ mode: 'STANDALONE_FALLBACK', connected: false }));
}

app.whenReady().then(() => {
  validateManifest(manifest);
  const dataDir = path.join(app.getPath('userData'), 'data');
  settings = new SettingsStore(path.join(dataDir, 'horizon-settings.json'));
  settings.load();
  registerIpc();
  createWindow();
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
