const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('horizon', {
  getManifest: () => ipcRenderer.invoke('horizon:manifest'),
  getSettings: () => ipcRenderer.invoke('horizon:settings:get'),
  setSettings: (patch) => ipcRenderer.invoke('horizon:settings:set', patch),
  resetSettings: () => ipcRenderer.invoke('horizon:settings:reset'),
  getHostStatus: () => ipcRenderer.invoke('horizon:host:status'),
  getUpdaterState: () => ipcRenderer.invoke('horizon:updater:get'),
  checkForUpdates: () => ipcRenderer.invoke('horizon:updater:check'),
  downloadUpdate: () => ipcRenderer.invoke('horizon:updater:download'),
  installUpdate: () => ipcRenderer.invoke('horizon:updater:install'),
  onUpdaterState: (callback) => ipcRenderer.on('horizon:updater:state', (_event, state) => callback(state))
});
