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
    pi: { enabled: true, taskList: '', leadMinutes: 60, quietStart: '22:00', quietEnd: '07:00' },
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
  tags: {},              // event or task id -> ['tag', ...]. Kept only in Onyx, never sent to Google or Microsoft.
  tagColors: {},         // tag -> colour
  memos: {},             // event id -> your own notes on an entry Onyx cannot write to (read-only calendars). Kept only in Onyx.
  notes: [],             // { id, title, body, created, updated } written in Onyx, shown on the globe
  pins: [],              // { id, source: 'notion' | 'drive', ref, title, url, kind, added, notes } pinned to the globe
  notion: null,          // { name, workspace } of the connected Notion integration
  news: null,            // { channels: [{ id, name, on, live?, custom? }] } for the News panel (news.js)
  secrets: { googleClientSecret: '', tokens: {}, mcpToken: '', notionToken: '' },
};

let file = '';
let data = structuredClone(DEFAULTS);
let timer = null;

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

module.exports = { load, save, flush, get data() { return data; } };
