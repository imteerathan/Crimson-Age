const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('crimsonAge', {
  getState: () => ipcRenderer.invoke('db:getState'),
  setState: (s) => ipcRenderer.invoke('db:setState', s),
  dbInfo: () => ipcRenderer.invoke('db:info'),
  pickSave: () => ipcRenderer.invoke('save:pick'),\n  analyzeSaveStructure: (p) => ipcRenderer.invoke('save:analyzeStructure', p),
  listBaselines: () => ipcRenderer.invoke('save:listBaselines'),
  updaterStatus: () => ipcRenderer.invoke('updater:status'),
  checkForUpdates: () => ipcRenderer.invoke('updater:check'),
  downloadUpdate: () => ipcRenderer.invoke('updater:download'),
  installUpdate: () => ipcRenderer.invoke('updater:install'),
  onUpdaterState: (callback) => {
    ipcRenderer.on('updater:state', (_event, state) => callback(state));
  }
});
