// Sync through Google Drive: every PC running Onyx keeps one file in the hidden app
// folder of the user's own Google Drive (only Onyx can see it), holding everything that
// PC knows, locked with a sync code. Each PC reads the others' files and keeps the
// newest of every piece (the same bookkeeping as linked desktops, sync.js), so PCs stay
// the same from any network, without Tailscale, and without having to be on together.
//
// The sync code is made on the first PC and typed once on each other one. The files
// hold sign-ins and keys, so without the code they are unreadable, even to Google.

const crypto = require('crypto');
const os = require('os');
const zlib = require('zlib');

const SCOPE = 'https://www.googleapis.com/auth/drive.appdata';
const PREFIX = 'onyx-sync-';
const POLL_MS = 20000;      // how often the others' files are checked
const PUSH_AFTER_MS = 3000; // a change goes up this long after the last edit
const BEAT_MS = 60000;      // "still here", for the list of desktops and who leads
const ONLINE_MS = 150000;
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 32: no 0/O, 1/I
const MAGIC = Buffer.from('ONX1');

const normCode = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const fmtCode = (c) => c.match(/.{1,4}/g).join('-');
function newCode() {
  const bytes = crypto.randomBytes(16);
  return [...bytes].map((b) => CODE_CHARS[b & 31]).join('');
}
/** The key the files are locked with, from the code. PBKDF2, so a browser can make it too. */
const keyOf = (code) => crypto.pbkdf2Sync(normCode(code), 'onyx-cloud-sync-v1', 310000, 32, 'sha256').toString('base64');

function seal(obj, key) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', Buffer.from(key, 'base64'), iv);
  c.setAAD(MAGIC);
  const data = Buffer.concat([c.update(zlib.gzipSync(JSON.stringify(obj))), c.final()]);
  return Buffer.concat([MAGIC, iv, c.getAuthTag(), data]);
}
function unseal(buf, key) {
  if (!buf.subarray(0, 4).equals(MAGIC)) throw new Error('Not an Onyx sync file.');
  const d = crypto.createDecipheriv('aes-256-gcm', Buffer.from(key, 'base64'), buf.subarray(4, 16));
  d.setAAD(MAGIC);
  d.setAuthTag(buf.subarray(16, 32));
  return JSON.parse(zlib.gunzipSync(Buffer.concat([d.update(buf.subarray(32)), d.final()])).toString('utf8'));
}

/** Of several PCs' pieces, the newest of each (the order sync.js uses: time, then device). */
function newest(lists) {
  const best = new Map();
  for (const list of lists) for (const e of Array.isArray(list) ? list : []) {
    if (!Array.isArray(e) || typeof e[0] !== 'string') continue;
    const b = best.get(e[0]);
    if (!b || e[1] > b[1] || (e[1] === b[1] && e[2] > b[2])) best.set(e[0], e);
  }
  return [...best.values()];
}

// ---------------------------------------------------------------- Google Drive

class ScopeError extends Error {
  constructor() { super('Onyx needs permission to keep its sync file in your Google Drive.'); this.code = 'scope'; }
}

/** The few Drive calls sync needs, for one Google account (accounts.js gives the token). */
function googleDrive(acct, accessToken) {
  const API = 'https://www.googleapis.com/drive/v3/files';
  const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files';
  async function call(url, { method = 'GET', body, headers = {}, raw = false } = {}) {
    for (let attempt = 0; ; attempt++) {
      const token = await accessToken(acct, attempt > 0);
      const res = await fetch(url, { method, body, headers: { Authorization: `Bearer ${token}`, ...headers } });
      if (res.status === 401 && attempt === 0) continue;
      if (res.status === 204) return null;
      if (!res.ok) {
        const text = await res.text();
        if (res.status === 403 && /insufficient|scope/i.test(text)) throw new ScopeError();
        let msg = '';
        try { msg = JSON.parse(text).error.message; } catch { /* not JSON */ }
        const err = new Error(`Google Drive: ${msg || `HTTP ${res.status}`}`);
        err.status = res.status;
        throw err;
      }
      return raw ? Buffer.from(await res.arrayBuffer()) : res.json();
    }
  }
  const multipart = (meta, buf) => {
    const b = `onyx${crypto.randomBytes(8).toString('hex')}`;
    return {
      headers: { 'Content-Type': `multipart/related; boundary=${b}` },
      body: Buffer.concat([
        Buffer.from(`--${b}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n--${b}\r\nContent-Type: application/octet-stream\r\n\r\n`),
        buf, Buffer.from(`\r\n--${b}--`),
      ]),
    };
  };
  return {
    async list() {
      const q = new URLSearchParams({ spaces: 'appDataFolder', q: `name contains '${PREFIX}' and trashed = false`, fields: 'files(id,name,modifiedTime,appProperties)', pageSize: '100' });
      return (await call(`${API}?${q}`)).files || [];
    },
    download: (id) => call(`${API}/${id}?alt=media`, { raw: true }),
    create: (meta, buf) => call(`${UPLOAD}?uploadType=multipart&fields=id`, { method: 'POST', ...multipart({ ...meta, parents: ['appDataFolder'] }, buf) }),
    update: (id, meta, buf) => call(`${UPLOAD}/${id}?uploadType=multipart&fields=id`, { method: 'PATCH', ...multipart(meta, buf) }),
    patch: (id, meta) => call(`${API}/${id}?fields=id`, { method: 'PATCH', body: JSON.stringify(meta), headers: { 'Content-Type': 'application/json' } }),
    remove: (id) => call(`${API}/${id}`, { method: 'DELETE' }),
  };
}

// ---------------------------------------------------------------- one PC's side

/**
 * Sync for one copy of the data. `getData()`/`save()` are the store, `replica` is
 * sync.js's bookkeeping over it, `driveFor(label)` gives the Drive calls for that Google
 * account, `notify(sections)` is told when another PC changed something. Kept apart
 * from Electron so tests can run several against a pretend Drive.
 */
function createCloud({ getData, save, replica, driveFor, notify = () => {}, adoptAccounts = () => {}, hostname = os.hostname, version = '', now = Date.now, beforeRound = () => {} }) {
  let running = null;
  let again = false;

  const cfg = () => {
    const m = replica.meta();
    if (!m.cloud || typeof m.cloud !== 'object') m.cloud = { on: false };
    m.cloud.peers ??= {};
    return m.cloud;
  };
  const on = () => !!cfg().on;
  const secrets = () => getData().secrets;
  const googleLabels = () => (getData().accounts || []).filter((a) => a.provider === 'google').map((a) => a.label);
  const fileName = () => `${PREFIX}${replica.meta().device}.bin`;

  function info() {
    const c = cfg();
    const t = now();
    return {
      on: !!c.on, state: c.on ? c.state || 'working' : 'off', error: c.on ? c.error || '' : '',
      account: c.account || '', accounts: googleLabels(), last: c.last || null, hasCode: !!secrets().cloudCode,
      peers: Object.entries(c.peers).map(([id, p]) => ({ id, name: p.name || 'Desktop', seen: p.seen || null, online: !!p.seen && t - p.seen < ONLINE_MS })),
    };
  }

  /** Other PCs seen through Drive lately: device id -> when. For sync.js (list, leader). */
  const seen = () => Object.fromEntries(Object.entries(cfg().peers).map(([id, p]) => [id, p.seen || 0]));

  function fail(c, err) {
    c.state = err.code === 'scope' ? 'needs-permission' : err.code === 'code' ? 'needs-code' : err.code === 'account' ? 'no-account' : 'error';
    c.error = err.message;
  }

  async function round() {
    const c = cfg();
    if (!c.on) return;
    beforeRound();
    const m = replica.meta();
    let s = secrets();
    let drive;
    try {
      if (!c.account || !googleLabels().includes(c.account)) {
        const err = new Error('Sign in to a Google account in Settings → Calendars, then choose it here.');
        err.code = 'account';
        throw err;
      }
      drive = driveFor(c.account);
      const files = (await drive.list()).filter((f) => f.name?.startsWith(PREFIX));
      const deviceOf = (f) => f.appProperties?.device || f.name.slice(PREFIX.length).replace(/\.bin$/, '');
      const mine = files.find((f) => deviceOf(f) === m.device);
      const others = files.filter((f) => deviceOf(f) !== m.device);

      // A code that came from a linked desktop is tried first.
      if (!s.cloudKey && s.cloudCode) s.cloudKey = keyOf(s.cloudCode);
      if (!s.cloudKey) {
        if (!others.length) { // the first PC: make the code
          s.cloudCode = newCode();
          s.cloudKey = keyOf(s.cloudCode);
          c.joined = true;
          c.state = 'ok';
        } else {
          const err = new Error('Enter the sync code from one of your other PCs (Settings → Desktops on it).');
          err.code = 'code';
          throw err;
        }
      }

      const read = async (f) => {
        const buf = await drive.download(f.id);
        try {
          return unseal(buf, s.cloudKey);
        } catch {
          const err = new Error(`The sync code doesn't open ${f.appProperties?.name || 'another PC'}'s copy. Enter the code shown on that PC.`);
          err.code = 'code';
          throw err;
        }
      };
      const touched = new Set();
      const note = (id, f, body) => {
        const p = (c.peers[id] ??= {});
        p.v = f.appProperties?.v || f.modifiedTime;
        p.name = body?.name || f.appProperties?.name || p.name;
        p.file = f.id;
        p.seen = Math.max(Number(f.appProperties?.seen) || 0, Date.parse(f.modifiedTime) || 0);
      };

      if (!c.joined) {
        // Joining: what the others have replaces this PC's starting copy (as when linking
        // desktops), except the sign-in to the sync account, which this PC just made.
        const bodies = [];
        for (const f of others) bodies.push([f, await read(f)]);
        const merged = newest(bodies.map(([, b]) => b.entries));
        adoptAccounts(getData(), merged);
        s = secrets(); // adopting rebuilds the data objects
        const acct = (getData().accounts || []).find((a) => a.provider === 'google' && a.label === c.account);
        const keep = new Set(acct && s.tokens?.[acct.id] ? [`secrets.tokens|${acct.id}`] : []);
        for (const k of replica.apply(merged, { force: true, keep }).touched) touched.add(k);
        for (const [f, b] of bodies) note(deviceOf(f), f, b);
        c.joined = true;
      } else {
        for (const f of others) {
          const id = deviceOf(f);
          const v = f.appProperties?.v || f.modifiedTime;
          if (c.peers[id]?.v === v) { note(id, f); continue; }
          const body = await read(f);
          for (const k of replica.apply(body.entries).touched) touched.add(k);
          note(id, f, body);
        }
      }
      // PCs whose files are gone (taken off the list, or turned off) are forgotten here too.
      for (const id of Object.keys(c.peers)) if (!others.some((f) => deviceOf(f) === id)) delete c.peers[id];

      replica.track();
      const t = now();
      const meta = { name: fileName(), appProperties: { device: m.device, v: `${m.seq}`, seen: `${t}`, name: hostname(), version } };
      if (!mine || c.file !== mine.id || c.sent !== m.seq) {
        const buf = seal({ device: m.device, name: hostname(), version, at: t, entries: replica.since(0) }, s.cloudKey);
        const { name, ...changes } = meta;
        const res = mine ? await drive.update(mine.id, changes, buf) : await drive.create(meta, buf);
        c.file = res?.id || mine?.id;
        c.sent = m.seq;
        c.beat = t;
      } else if (t - (c.beat || 0) >= BEAT_MS) {
        await drive.patch(mine.id, { appProperties: { seen: `${t}` } });
        c.beat = t;
      }
      Object.assign(c, { state: 'ok', error: '', last: t });
      save();
      if (touched.size) notify(touched);
    } catch (err) {
      fail(c, err);
      save();
    }
  }

  /** One sync round; a request during one runs another right after. */
  function sync() {
    if (running) { again = true; return running; }
    running = (async () => {
      try {
        do { again = false; await round(); } while (again && on());
      } finally {
        running = null;
      }
    })();
    return running;
  }

  /** Turns Drive sync on with that Google account. */
  async function enable(account) {
    const c = cfg();
    if (!googleLabels().includes(account)) throw new Error('Choose one of your Google accounts.');
    if (c.on && c.account !== account) Object.assign(c, { joined: false, file: null, sent: null, peers: {} });
    Object.assign(c, { on: true, account, state: 'working', error: '' });
    save();
    await sync();
    return info();
  }

  /** The code from another PC: opens their files, and this PC joins them. */
  async function enterCode(code) {
    const n = normCode(code);
    if (n.length !== 16) throw new Error('The sync code is 16 letters and numbers, like ABCD-EFGH-JKLM-NPQR.');
    const s = secrets();
    const before = [s.cloudCode, s.cloudKey];
    s.cloudCode = n;
    s.cloudKey = keyOf(n);
    const c = cfg();
    Object.assign(c, { joined: false, sent: null, peers: {}, state: 'working', error: '' });
    save();
    await sync();
    if (c.state === 'needs-code') {
      if (before[0]) s.cloudCode = before[0]; else delete s.cloudCode;
      if (before[1]) s.cloudKey = before[1]; else delete s.cloudKey;
      save();
      throw new Error('That code does not open your other PCs\' copies. Check it and try again.');
    }
    return info();
  }

  /** Stops syncing through Drive. This PC keeps what it has; its file is taken out. */
  async function disable() {
    const c = cfg();
    if (c.on && c.file && c.account && googleLabels().includes(c.account)) {
      try { await driveFor(c.account).remove(c.file); } catch { /* gone already, or offline */ }
    }
    replica.meta().cloud = { on: false };
    const s = secrets();
    delete s.cloudKey; // the code stays, shared, for turning it back on
    save();
    return info();
  }

  /** Takes another PC's file out of Drive (a PC that is gone). It comes back if that PC still syncs. */
  async function forget(id) {
    const c = cfg();
    const p = c.peers[id];
    if (p?.file && c.account) { try { await driveFor(c.account).remove(p.file); } catch { /* gone */ } }
    delete c.peers[id];
    save();
  }

  /** The code, to type on another PC. Only ever shown on the PC itself. */
  const code = () => (secrets().cloudCode ? fmtCode(secrets().cloudCode) : '');

  return { info, seen, sync, enable, enterCode, disable, forget, code, on };
}

// ---------------------------------------------------------------- this PC

let instance = null;
let timer = null;
let pushTimer = null;

function get() {
  if (instance) return instance;
  const store = require('./store');
  const sync = require('./sync');
  const accounts = require('./accounts');
  instance = createCloud({
    getData: () => store.data,
    save: () => store.save(),
    replica: sync.replica,
    adoptAccounts: sync.adoptAccounts,
    notify: (touched) => sync.notify(touched),
    beforeRound: () => sync.updateSelf(),
    version: require('../../package.json').version,
    driveFor: (label) => {
      const acct = store.data.accounts.find((a) => a.provider === 'google' && a.label === label);
      if (!acct) throw Object.assign(new Error('That Google account is not signed in here.'), { code: 'account' });
      return googleDrive(acct, accounts.accessToken);
    },
  });
  return instance;
}

/** Starts the regular checks (sync.start calls this). */
function start() {
  if (timer) return;
  timer = setInterval(() => { if (get().on()) get().sync(); }, POLL_MS);
  timer.unref?.();
  if (get().on()) get().sync();
}

/** Something changed here: send it up shortly. */
function changed() {
  if (!get().on()) return;
  clearTimeout(pushTimer);
  pushTimer = setTimeout(() => get().sync(), PUSH_AFTER_MS);
  pushTimer.unref?.();
}

module.exports = {
  start, changed,
  info: () => get().info(),
  seen: () => get().seen(),
  on: () => get().on(),
  syncNow: async () => { await get().sync(); return get().info(); },
  enable: (account) => get().enable(account),
  enterCode: (code) => get().enterCode(code),
  disable: () => get().disable(),
  forget: (id) => get().forget(id),
  code: () => get().code(),
  SCOPE,
  // for tests
  createCloud, seal, unseal, keyOf, newest, normCode,
};
