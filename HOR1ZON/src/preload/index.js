const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('horizon', {
  getManifest: () => ipcRenderer.invoke('horizon:manifest'),
  getSettings: () => ipcRenderer.invoke('horizon:settings:get'),
  setSettings: (patch) => ipcRenderer.invoke('horizon:settings:set', patch),
  resetSettings: () => ipcRenderer.invoke('horizon:settings:reset'),
  getHostStatus: () => ipcRenderer.invoke('horizon:host:status'),
  getLoaderStatus: () => ipcRenderer.invoke('horizon:loader:status'),
  simulateHandshake: (hostInfo, hostCapabilities) => ipcRenderer.invoke('horizon:host:simulate-handshake', hostInfo, hostCapabilities),
  getUpdaterState: () => ipcRenderer.invoke('horizon:updater:get'),
  checkForUpdates: () => ipcRenderer.invoke('horizon:updater:check'),
  downloadUpdate: () => ipcRenderer.invoke('horizon:updater:download'),
  installUpdate: () => ipcRenderer.invoke('horizon:updater:install'),
  onUpdaterState: (callback) => {
    if (typeof callback !== 'function') throw new TypeError('callback must be a function');
    return ipcRenderer.on('horizon:updater:state', (_event, state) => callback(state));
  }
});
