// A sticky note's window (renderer/sticky.html) can only work on its own note (stickies.js).
const { contextBridge, ipcRenderer } = require('electron');

const call = (name, ...args) => ipcRenderer.invoke(`sticky:${name}`, ...args);
contextBridge.exposeInMainWorld('sticky', {
  load: () => call('load'),
  text: (text) => call('text', String(text)),
  color: (color) => call('color', String(color)),
  pin: (on) => call('pin', !!on),
  newNote: () => call('new'),
  remove: () => call('delete'),
  task: (selected) => call('task', String(selected || '')),
});
