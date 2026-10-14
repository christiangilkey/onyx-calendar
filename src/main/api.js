// The commands the calendar window can run. The desktop window reaches them
// through Electron IPC (main.js); the Android app reaches the `remote` subset
// over the network (mcp.js, /app/rpc).

const store = require('./store');
const hub = require('./hub');
const mcp = require('./mcp');
const pairing = require('./pairing');
const library = require('./library');
const notion = require('./providers/notion');
const drive = require('./providers/drive');
const { version } = require('../../package.json');

let afterSettings = async () => {};

function state() {
  const d = store.data;
  return {
    version,
    settings: d.settings,
    accounts: d.accounts.map(({ id, provider, label, url }) => ({ id, provider, label, url })),
    calendars: hub.calendars(),
    tags: hub.allTags(),
    google: { ready: !!d.google.clientId },
    microsoft: { clientId: d.microsoft.clientId },
    mcp: mcp.info(),
    notion: notion.info(),
  };
}

function mergeInto(target, patch) {
  for (const [k, v] of Object.entries(patch)) {
    if (v && typeof v === 'object' && !Array.isArray(v) && target[k] && typeof target[k] === 'object' && k !== 'hidden') mergeInto(target[k], v);
    else target[k] = v;
  }
}

async function changeSettings(patch) {
  const s = store.data.settings;
  const before = structuredClone({ mcp: s.mcp, pi: s.pi, launchAtLogin: s.launchAtLogin });
  mergeInto(s, patch);
  s.mcp.port = Math.min(Math.max(parseInt(s.mcp.port, 10) || 4747, 1024), 65535);
  s.pi.leadMinutes = Math.min(Math.max(parseInt(s.pi.leadMinutes, 10) || 60, 5), 720);
  store.save();
  if (JSON.stringify(s.mcp) !== JSON.stringify(before.mcp)) await mcp.start();
  if (JSON.stringify(s.pi) !== JSON.stringify(before.pi)) hub.invalidate();
  await afterSettings(before, s);
  return state();
}

const withState = (fn) => async (...args) => { await fn(...args); return state(); };

const handlers = {
  state,
  refresh: async () => { hub.invalidate(); const { errors } = await hub.refreshCalendars(); return { ...state(), errors }; },
  events: (start, end, force) => hub.getEvents(start, end, { force: !!force }),
  'event:create': (data) => hub.createEvent(data),
  'event:update': (id, patch) => hub.updateEvent(id, patch),
  'event:delete': (id) => hub.deleteEvent(id),
  'event:call': async (event, on) => ({ piCall: await hub.setPiCall(event, !!on) }),
  tasks: (force) => hub.getTasks({ force: !!force }),
  'task:create': (data) => hub.createTask(data),
  'task:update': (id, patch) => hub.updateTask(id, patch),
  'task:delete': (id) => hub.deleteTask(id),
  'tags:set': (id, tags) => hub.setTags(id, tags),
  'tag:color': withState((tag, color) => hub.setTagColor(tag, color)),
  'tag:rename': withState((from, to) => hub.renameTag(from, to)),
  'tag:delete': withState((tag) => hub.deleteTag(tag)),
  settings: changeSettings,
  'local:add': withState((name, color) => hub.addLocalCalendar(name, color)),
  'local:remove': withState((id) => hub.removeLocalCalendar(id)),
  pairing: () => pairing.info(),
  // The globe's notes and pinned Notion pages / Drive files.
  globe: () => library.globeItems(),
  'note:create': (data) => library.createNote(data),
  'note:update': (id, patch) => library.updateNote(id, patch),
  'note:delete': (id) => library.deleteNote(id),
  'pin:add': (item) => library.addPin(item),
  'pin:update': (id, patch) => library.updatePin(id, patch),
  'pin:remove': (id) => library.removePin(id),
  'notion:search': (query) => notion.search(query),
  'notion:connect': withState((key) => notion.connect(key)),
  'notion:disconnect': withState(() => notion.disconnect()),
  'drive:search': (query) => drive.search(query),
};

// What the phone may run. Signing in to accounts, and the settings that could
// cut the phone off (the server itself, start-up behaviour), stay on the PC.
const PHONE_SETTINGS = ['hidden', 'hour12', 'weekStart', 'defaultCalendar', 'pi'];
const PC_ONLY = new Set(['pairing', 'notion:connect', 'notion:disconnect']);
const remote = Object.fromEntries(Object.entries(handlers).filter(([name]) => !PC_ONLY.has(name)));
remote.settings = (patch) => changeSettings(Object.fromEntries(Object.entries(patch || {}).filter(([k]) => PHONE_SETTINGS.includes(k))));

module.exports = { handlers, remote, state, onSettingsChanged: (fn) => { afterSettings = fn; } };
