// The only bridge between the window and the app. The page gets these functions and nothing else.
const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('beatcut', {
  pathFor: file => webUtils.getPathForFile(file),
  pick: kind => ipcRenderer.invoke('files:pick', kind),
  describe: paths => ipcRenderer.invoke('files:describe', paths),
  make: request => ipcRenderer.invoke('edit:make', request),
  save: () => ipcRenderer.invoke('edit:save'),
  onStage: listener => {
    const handler = (_event, stage) => listener(stage);
    ipcRenderer.on('edit:stage', handler);
    return () => ipcRenderer.off('edit:stage', handler);
  },
});
