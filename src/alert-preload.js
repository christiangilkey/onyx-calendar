// The on-screen popup window (renderer/alert.html) can only say which button was pressed.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('onyxAlert', {
  act: (action) => ipcRenderer.send('alert:act', String(action)),
});
