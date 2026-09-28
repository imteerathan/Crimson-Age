const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('horizon', {
  getManifest: () => ipcRenderer.invoke('horizon:manifest'),
  getSettings: () => ipcRenderer.invoke('horizon:settings:get'),
  setSettings: (patch) => ipcRenderer.invoke('horizon:settings:set', patch),
  resetSettings: () => ipcRenderer.invoke('horizon:settings:reset'),
  getHostStatus: () => ipcRenderer.invoke('horizon:host:status')
});
