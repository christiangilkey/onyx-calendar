// The commands the calendar window can run. The desktop window reaches them
// through Electron IPC (main.js); the Android app reaches the `remote` subset
// over the network (mcp.js, /app/rpc).

const store = require('./store');
const hub = require('./hub');
const mcp = require('./mcp');
const pairing = require('./pairing');
const accounts = require('./accounts');
const library = require('./library');
const notion = require('./providers/notion');
const drive = require('./providers/drive');
const news = require('./news');
const goals = require('./goals');
const sync = require('./sync');
const ai = require('./ai');
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
    // `peers`: the other linked desktops, which the phone can use when this one is off.
    mcp: { ...mcp.info(), peers: sync.peerAddresses() },
    desktops: { ...sync.info(), invite: null }, // a link code only ever comes from 'desktops', on the PC itself
    notion: notion.info(),
    ai: ai.info(),
    calls: require('./caller').info(),
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

/**
 * Saves the Google client id and secret from the text of a credentials file: a
 * downloaded OAuth client ("installed"/"web"), or a saved sign-in that carries one.
 * Used by the PC's file picker and by the phone (which sends the file's text).
 */
function setGoogleClient(text) {
  let json;
  try {
    json = JSON.parse(String(text));
  } catch {
    throw new Error('That is not a Google credentials (.json) file.');
  }
  const client = json.installed || json.web || json;
  if (!client.client_id || !client.client_secret) throw new Error('No client_id and client_secret found in that file.');
  store.data.google.clientId = client.client_id;
  store.data.secrets.googleClientSecret = client.client_secret;
  store.save();
}

async function afterAccountChange() {
  hub.invalidate();
  const { errors } = await hub.refreshCalendars();
  return { ...state(), errors };
}

const handlers = {
  state,
  refresh: async () => { hub.invalidate(); const { errors } = await hub.refreshCalendars(); return { ...state(), errors }; },
  events: (start, end, force) => hub.getEvents(start, end, { force: !!force }),
  'event:create': (data) => hub.createEvent(data),
  'event:update': (id, patch) => hub.updateEvent(id, patch),
  'event:delete': (id, opts) => hub.deleteEvent(id, opts || {}),
  'event:call': async (event, on, before, mode) => ({ piCall: await hub.setPiCall(event, !!on, before, mode), callBefore: store.data.piLinks[event.id]?.before ?? null }),
  'event:leaveby': (id, minutes) => hub.setLeaveBy(id, minutes),
  'event:ack': (id) => hub.ackPiCall(id),
  'event:done': (id, done) => hub.setEventDone(id, !!done),
  tasks: (force) => hub.getTasks({ force: !!force }),
  'task:create': (data) => hub.createTask(data),
  'task:update': (id, patch) => hub.updateTask(id, patch),
  'task:backburner': (id, on) => hub.setBackburner(id, !!on),
  'task:move': (id, to) => hub.moveTask(id, to),
  'task:resize': (id, to) => hub.resizeTask(id, to),
  // Magic add: plan a task that arrived from outside into a block of the day, take that back, or leave it for later.
  'task:plan': (id, to) => hub.planTask(id, to),
  'task:unplan': (id, prev) => hub.unplanTask(id, prev),
  'inbox:dismiss': (id) => hub.dismissInbox(id),
  // Another app hands over a task: onyx://task?title=…&minutes=…&due=…&id=…&from=… (deeplink.js)
  'link:task': (link) => hub.receiveTask(link),
  'tasks:archived': (from, to) => hub.archivedTasks(from, to),
  'task:delete': (id) => hub.deleteTask(id),
  'task:repeat': (id, rule) => hub.setRepeat(id, rule),
  'series:update': (key, data) => require('./series').update(hub, key, data),
  'series:clear': (key) => require('./series').clearOverdue(hub, key),
  'series:stop': (key) => require('./series').stopAll(hub, key),
  goals: (force) => goals.list({ force: !!force }),
  'goal:create': (data) => goals.create(data),
  'goal:update': (id, data) => goals.update(id, data),
  'goal:delete': (id, keepTasks) => goals.remove(id, { keepTasks: !!keepTasks }),
  'goal:step': (id, stepId, done) => goals.setStep(id, stepId, !!done),
  'tags:set': (id, tags) => hub.setTags(id, tags),
  'memo:set': (id, text) => hub.setMemo(id, text),
  'pomodoro:set': (id, cfg) => hub.setPomodoro(id, cfg),
  'tag:color': withState((tag, color) => hub.setTagColor(tag, color)),
  'tag:rename': withState((from, to) => hub.renameTag(from, to)),
  'tag:delete': withState((tag) => hub.deleteTag(tag)),
  settings: changeSettings,
  'local:add': withState((name, color) => hub.addLocalCalendar(name, color)),
  'local:remove': withState((id) => hub.removeLocalCalendar(id)),
  pairing: () => pairing.info(),
  // The globe's notes and pinned Notion pages / Drive files.
  globe: () => library.globeItems(),
  // Starred Gmail and flagged Outlook emails received in a range, for the globe.
  emails: (start, end) => require('./providers/mail').list(start, end),
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
  // The News panel: YouTube news channels, shared by the PC and the phone.
  // mode 'tamkeen': news in the language Tamkeen on this PC teaches.
  news: (force, mode) => news.list(!!force, { tamkeen: mode === 'tamkeen' }),
  'news:add': (input) => news.addChannel(input),
  'news:set': (id, on) => news.setChannel(id, on),
  'news:remove': (id) => news.removeChannel(id),
  'news:reset': () => news.resetChannels(),
  // Keys and links, from either the PC or the phone; they are stored once, on the PC.
  'google:credentials': withState((text) => setGoogleClient(text)),
  'microsoft:client': withState((id) => { store.data.microsoft.clientId = String(id || '').trim(); store.save(); }),
  'feed:add': (feed) => { accounts.addFeed(feed.name, feed.url); return afterAccountChange(); },
  // Other PCs running Onyx, sharing everything it keeps (sync.js).
  desktops: () => sync.info(),
  'desktops:invite': () => sync.newInvite(),
  'desktops:cancel': () => sync.cancelInvite(),
  'desktops:join': async (address, code) => { await sync.join(address, code); return afterAccountChange(); },
  'desktops:leave': () => sync.leave(),
  'desktops:forget': (id) => sync.forget(id),
  'desktops:sync': () => sync.syncNow(),
  // Breakdown (the hammer): a task split into steps, 1 (broad) to 5 (micro-steps).
  'ai:breakdown': (title, opts) => ai.breakdown(title, opts),
  'ai:key': withState((key) => ai.setKey(key)),
  // Hyperfocus: a finished session goes in the log (focus.js); the log is read back by date.
  'focus:log': (session) => require('./focus').logSession(session),
  'focus:sessions': (range) => require('./focus').sessions(range),
  // The session running now: its stop can reach the phone until it is answered.
  'focus:start': (session) => require('./focus').startActive(session),
  'focus:end': () => require('./focus').endActive(),
  // What the log shows (the best hours), and what to do next for a change of pace.
  'focus:insights': () => require('./focus').insights(),
  'focus:next': (info) => require('./focus').suggestions(info),
  // Magic add: describe the day's tasks, get them placed in the free time (replan: the same tasks, changed).
  'magic:plan': (text, date, opts, inboxIds) => require('./magic').planDay(text, date, opts, inboxIds),
  'magic:replan': (tasks, travel, date, opts) => require('./magic').replan(tasks, travel, date, opts),
  'magic:remember': withState((opts) => require('./magic').remember(opts)),
  // Calls & alerts: the Twilio auth token (kept with the secrets), and a test call or push.
  'calls:token': withState((token) => require('./caller').setTwilioToken(token)),
  'calls:test': (kind) => require('./caller').test(kind),
};

// What the phone may run. Signing in to accounts, and the settings that could
// cut the phone off (the server itself, start-up behaviour), stay on the PC.
const PHONE_SETTINGS = ['hidden', 'hour12', 'weekStart', 'defaultCalendar', 'pi', 'magic'];
const PC_ONLY = new Set(['pairing', 'desktops', 'desktops:invite', 'desktops:cancel', 'desktops:join', 'desktops:leave', 'desktops:forget']);
const remote = Object.fromEntries(Object.entries(handlers).filter(([name]) => !PC_ONLY.has(name)));
remote.events = async (start, end, force) => {
  const res = await handlers.events(start, end, force);
  const extra = require('./focus').phoneItems(start, end);
  return extra.length ? { ...res, events: [...res.events, ...extra] } : res;
};
remote.settings = (patch) => changeSettings(Object.fromEntries(Object.entries(patch || {}).filter(([k]) => PHONE_SETTINGS.includes(k))));

module.exports = { handlers, remote, state, setGoogleClient, afterAccountChange, onSettingsChanged: (fn) => { afterSettings = fn; } };
