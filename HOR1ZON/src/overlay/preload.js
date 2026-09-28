const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('horizonOverlay', {
  onState: (callback) => {
    if (typeof callback !== 'function') throw new TypeError('callback must be a function');
    return ipcRenderer.on('horizon:overlay:state', (_event, state) => callback(state));
  }
});
