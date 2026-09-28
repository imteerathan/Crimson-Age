const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('crimsonAge', {
  getState: () => ipcRenderer.invoke('db:getState'),
  setState: (s) => ipcRenderer.invoke('db:setState', s),
  dbInfo: () => ipcRenderer.invoke('db:info'),
  pickSave: () => ipcRenderer.invoke('save:pick'),
  analyzeSaveStructure: (p) => ipcRenderer.invoke('save:analyzeStructure', p),
  analyzeSaveContainer: (p) => ipcRenderer.invoke('save:analyzeContainer', p),
  compareDecodedSaves: (a, b) => ipcRenderer.invoke('save:compareDecoded', a, b),
  compareSaves: (firstPath, secondPath) => ipcRenderer.invoke('save:compare', firstPath, secondPath),
  listBaselines: () => ipcRenderer.invoke('save:listBaselines'),
  exportFieldTestData: () => ipcRenderer.invoke('save:exportData'),
  updaterStatus: () => ipcRenderer.invoke('updater:status'),
  checkForUpdates: () => ipcRenderer.invoke('updater:check'),
  downloadUpdate: () => ipcRenderer.invoke('updater:download'),
  installUpdate: () => ipcRenderer.invoke('updater:install'),
  getHorizonGameState: () => ipcRenderer.invoke('horizon:getGameState'),
  refreshHorizonGameState: () => ipcRenderer.invoke('horizon:refresh'),
  toggleHorizonOverlay: () => ipcRenderer.invoke('horizon:toggleOverlay'),
  setHorizonOverlayVisible: (visible) => ipcRenderer.invoke('horizon:setOverlayVisible', visible),
  onHorizonGameState: (callback) => {
    ipcRenderer.on('horizon:game-state', (_event, state) => callback(state));
  },
  onHorizonOverlayVisibility: (callback) => {
    ipcRenderer.on('horizon:overlay-visibility', (_event, state) => callback(state));
  },
  onUpdaterState: (callback) => {
    ipcRenderer.on('updater:state', (_event, state) => callback(state));
  }
});
