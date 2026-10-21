// Everything the app remembers, in one JSON file in the user-data folder.
// Sign-in tokens and the Google client secret are kept in `secrets`, which is
// encrypted with the Windows account (Electron safeStorage) before it is written.

const { app, safeStorage } = require('electron');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const DEFAULTS = {
  settings: {
    hidden: {},          // calendar id -> true when switched off in the sidebar
    view: 'timeGridWeek',
    hour12: true,
    weekStart: 0,        // 0 = Sunday
    tasksPanel: true,
    newsPanel: false,    // the News tab on the right is open
    closeToTray: true,
    launchAtLogin: false,
    defaultCalendar: '', // where new time blocks are saved
    // checkEvery: how often the Pi looks (its cron), so a call asked for at 2:15 comes at the last look before
    pi: { enabled: true, taskList: '', leadMinutes: 60, quietStart: '22:00', quietEnd: '07:00', checkEvery: 30 },
    // How reminders reach you (caller.js): alarm (the phone), ntfy (push), twilio (a call), pi. '' = pick for me.
    calls: { method: '', ntfyServer: 'https://ntfy.sh', ntfyTopic: '', twilioSid: '', twilioFrom: '', callTo: '' },
    // Magic add: where you set off from, how you get around, the hours to plan in, keep lunch free.
    magic: { home: '', mode: 'drive', start: '08:00', end: '21:00', lunch: true },
    mcp: { enabled: true, port: 4747, lan: true },
  },
  accounts: [],          // { id, provider: 'google' | 'microsoft' | 'ics', label, url? }
  calendars: {},         // account id -> last known calendar list
  google: { clientId: '' },
  microsoft: { clientId: '' },
  local: {
    calendars: [{ id: 'blocks', name: 'Time Blocks', color: '#8b7cff' }],
    events: [],          // { id, calendar, title, start, end, allDay, notes, location }
  },
  piLinks: {},           // event id -> id of the Google Task the Pi phones about
  leaveBy: {},           // event id -> minutes before its start to set off (hub.js)
  tags: {},              // event or task id -> ['tag', ...]. Kept only in Onyx, never sent to Google or Microsoft.
  backburner: {},
  doneEvents: {},        // event id -> 'YYYY-MM-DD' it was ticked off: calendars have no "done", so Onyx keeps it
  stoppedSeries: {},     // series key -> { at, until, label }: a Google Tasks repeat stopped with Stop all (series.js)        // task id -> true: an unscheduled task kept for later (hub.js), until it gets a date
  tagColors: {},         // tag -> colour
  memos: {},             // event id -> your own notes on an entry Onyx cannot write to (read-only calendars). Kept only in Onyx.
  notes: [],             // { id, title, body, created, updated } written in Onyx, shown on the globe
  pins: [],              // { id, source: 'notion' | 'drive', ref, title, url, kind, added, notes } pinned to the globe
  notion: null,          // { name, workspace } of the connected Notion integration
  goals: [],             // long-term goals: { id, title, notes, start, end, color, listId, steps: [{ id, title, due, done, taskId }] } (goals.js)
  repeats: {},           // task id -> { rule, day } for tasks that repeat; Onyx adds the next one when it is done (repeat.js)
  repeatSpawned: {},
  pomodoro: {},          // event or task id -> { work, rest, minutes? }: split into work and rest chunks (hub.js)
  blockTasks: {},        // event id (a repeat's: the series') -> [{ id, text }]: what to get done within the block (hub.js)
  eventColors: {},       // event id (a repeat's: the series') -> '#rrggbb': a colour of its own, in place of its calendar's
  blockTicks: {},        // event id (each day of a repeat on its own) -> [task id, ...]: which of them are ticked off
  inboxItems: {},        // task id -> { at, state, from? }: tasks that arrived from outside, waiting for Magic add (inbox.js)
  inboxLists: {},        // task list id -> true once read, so its first read only learns what is there
  linkedTasks: {},       // "app:id" from an onyx://task link -> the task it made, so a second send updates it
  taskMinutes: {},       // task id -> how long its block is on the calendar (Google Tasks and To Do have no length)
  focusSessions: [],     // Hyperfocus sessions, oldest first: what each was for, when it ran, how it ended (focus.js)
  madeHere: {},          // event or task id -> date it was added from Onyx (so a window can say where it came from)     // completed task id -> the task added after it, so Undo can take that back
  news: null,          // { channels: [{ id, name, on, live?, custom? }] } for the News panel (news.js)
  desktops: {},          // linked desktops: device id -> { name, addresses, version } (sync.js)
  sync: null,            // this PC's sync bookkeeping: its id, when each shared piece changed, what each desktop has seen (sync.js)
  // group: the id and key shared by linked desktops (sync.js)
  secrets: { googleClientSecret: '', tokens: {}, mcpToken: '', notionToken: '', anthropicKey: '', twilioToken: '', group: null },
  callsFired: {},        // reminder key -> when this PC sent it (caller.js), so each goes once
};

let file = '';
let data = structuredClone(DEFAULTS);
let timer = null;
const writeHooks = []; // run just before each write (sync.js notes what changed)

function merge(base, saved) {
  if (Array.isArray(base) || typeof base !== 'object' || base === null) return saved === undefined ? base : saved;
  const out = { ...base };
  for (const [k, v] of Object.entries(saved || {})) out[k] = k in base ? merge(base[k], v) : v;
  return out;
}

function load() {
  file = path.join(app.getPath('userData'), 'onyx.json');
  let saved = {};
  try {
    saved = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    if (err.code !== 'ENOENT') console.error('onyx: settings file unreadable, starting fresh:', err.message);
  }
  let secrets;
  if (saved.secretsEnc) {
    try {
      secrets = JSON.parse(safeStorage.decryptString(Buffer.from(saved.secretsEnc, 'base64')));
    } catch (err) {
      console.error('onyx: could not unlock saved sign-ins, you will need to sign in again:', err.message);
    }
  }
  delete saved.secretsEnc;
  data = merge(structuredClone(DEFAULTS), saved);
  data.secrets = merge(structuredClone(DEFAULTS.secrets), secrets || saved.secrets || {});
  if (!data.secrets.mcpToken) {
    data.secrets.mcpToken = crypto.randomBytes(24).toString('base64url');
    save();
  }
  return data;
}

function writeNow() {
  timer = null;
  for (const fn of writeHooks) {
    try { fn(); } catch (err) { console.error('onyx:', err.message); }
  }
  const out = { ...data };
  if (safeStorage.isEncryptionAvailable()) {
    out.secretsEnc = safeStorage.encryptString(JSON.stringify(data.secrets)).toString('base64');
    delete out.secrets;
  }
  const tmp = file + '.tmp';
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(tmp, JSON.stringify(out, null, 2), 'utf8');
  fs.renameSync(tmp, file);
}

function save() {
  if (!timer) timer = setTimeout(writeNow, 150);
}

function flush() {
  if (timer) { clearTimeout(timer); writeNow(); }
}

module.exports = { load, save, flush, onWrite: (fn) => writeHooks.push(fn), get data() { return data; } };
