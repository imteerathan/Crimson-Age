const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('horizon', {
  getManifest: () => ipcRenderer.invoke('horizon:manifest'),
  getSettings: () => ipcRenderer.invoke('horizon:settings:get'),
  setSettings: (patch) => ipcRenderer.invoke('horizon:settings:set', patch),
  resetSettings: () => ipcRenderer.invoke('horizon:settings:reset'),
  getHostStatus: () => ipcRenderer.invoke('horizon:host:status'),
  getLoaderStatus: () => ipcRenderer.invoke('horizon:loader:status'),
  getExtensionState: () => ipcRenderer.invoke('horizon:state:get'),
  getRecentDiagnostics: (limit) => ipcRenderer.invoke('horizon:diagnostics:recent', limit),
  simulateHandshake: (hostInfo, hostCapabilities) => ipcRenderer.invoke('horizon:host:simulate-handshake', hostInfo, hostCapabilities),
  getUpdaterState: () => ipcRenderer.invoke('horizon:updater:get'),
  checkForUpdates: () => ipcRenderer.invoke('horizon:updater:check'),
  downloadUpdate: () => ipcRenderer.invoke('horizon:updater:download'),
  installUpdate: () => ipcRenderer.invoke('horizon:updater:install'),
  getOverlayState: () => ipcRenderer.invoke('horizon:overlay:get'),
  getOverlayDetectionState: () => ipcRenderer.invoke('horizon:overlay:detection'),
  showOverlay: () => ipcRenderer.invoke('horizon:overlay:show'),
  hideOverlay: () => ipcRenderer.invoke('horizon:overlay:hide'),
  toggleOverlay: () => ipcRenderer.invoke('horizon:overlay:toggle'),
  toggleOverlayEditMode: () => ipcRenderer.invoke('horizon:overlay:edit-toggle'),
  setOverlayRuntimeState: (state, reason) => ipcRenderer.invoke('horizon:overlay:runtime-state', state, reason),
  notifyOverlay: (message, duration) => ipcRenderer.invoke('horizon:overlay:notify', message, duration),
  onUpdaterState: (callback) => {
    if (typeof callback !== 'function') throw new TypeError('callback must be a function');
    return ipcRenderer.on('horizon:updater:state', (_event, state) => callback(state));
  }
});
