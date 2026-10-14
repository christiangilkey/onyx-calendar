const { contextBridge, ipcRenderer } = require('electron');

async function call(name, ...args) {
  const res = await ipcRenderer.invoke(name, ...args);
  if (!res.ok) throw new Error(res.error);
  return res.value;
}

// The only things the window can ask the app to do.
contextBridge.exposeInMainWorld('onyx', {
  state: () => call('state'),
  refresh: () => call('refresh'),
  events: (start, end, force) => call('events', start, end, force),
  createEvent: (data) => call('event:create', data),
  updateEvent: (id, patch) => call('event:update', id, patch),
  deleteEvent: (id) => call('event:delete', id),
  setCall: (event, on) => call('event:call', event, on),
  tasks: (force) => call('tasks', force),
  createTask: (data) => call('task:create', data),
  updateTask: (id, patch) => call('task:update', id, patch),
  deleteTask: (id) => call('task:delete', id),
  setTags: (id, tags) => call('tags:set', id, tags),
  setTagColor: (tag, color) => call('tag:color', tag, color),
  renameTag: (from, to) => call('tag:rename', from, to),
  deleteTag: (tag) => call('tag:delete', tag),
  pairing: () => call('pairing'),
  globe: () => call('globe'),
  createNote: (data) => call('note:create', data),
  updateNote: (id, patch) => call('note:update', id, patch),
  deleteNote: (id) => call('note:delete', id),
  addPin: (item) => call('pin:add', item),
  updatePin: (id, patch) => call('pin:update', id, patch),
  removePin: (id) => call('pin:remove', id),
  searchNotion: (query) => call('notion:search', query),
  connectNotion: (key) => call('notion:connect', key),
  disconnectNotion: () => call('notion:disconnect'),
  searchDrive: (query) => call('drive:search', query),
  settings: (patch) => call('settings', patch),
  loadGoogleCredentials: () => call('google:load'),
  connectGoogle: () => call('google:connect'),
  connectMicrosoft: (clientId) => call('microsoft:connect', clientId),
  addFeed: (feed) => call('feed:add', feed),
  removeAccount: (id) => call('account:remove', id),
  addLocalCalendar: (name, color) => call('local:add', name, color),
  removeLocalCalendar: (id) => call('local:remove', id),
  open: (url) => call('open', url),
  copy: (text) => call('copy', text),
  onChanged: (fn) => ipcRenderer.on('changed', () => fn()),
});
