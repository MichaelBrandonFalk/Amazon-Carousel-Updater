const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('updater', {
  action: (command, input) => ipcRenderer.invoke('updater:action', command, input),
  onState: callback => { ipcRenderer.on('updater:state', (_event, state) => callback(state)); }
});
