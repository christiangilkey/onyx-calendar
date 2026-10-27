// Linked desktops: Onyx on several PCs keeps one shared copy of everything it stores
// itself — tags, notes, goals, memos, repeats, pins, settings, the Google credentials
// and the sign-ins — so any of them (and the phone, through any of them) shows the
// same thing. Google and Outlook data needs no copying: it lives with Google and Microsoft.
//
// Every piece of shared data (one tag list, one note, one setting...) carries when it
// last changed and on which PC; the newest change wins. PCs swap whatever the other has
// not seen yet over the same port the phone uses, encrypted with a key only linked PCs
// hold. A PC joins with a one-time code shown on a PC that is already linked: the two
// agree a key over the network (X25519), and the code proves neither side is an impostor.

const crypto = require('crypto');
const os = require('os');
const zlib = require('zlib');
const store = require('./store');

const VALUE = 0, MAP = 1, LIST = 2;
// What is shared, and how each part splits into pieces: a whole value, one piece per
// key of an object, or one piece per item (by id) of a list.
const SECTIONS = {
  tags: MAP, tagColors: MAP, backburner: MAP, doneEvents: MAP, stoppedSeries: MAP, memos: MAP, leaveBy: MAP, repeats: MAP, repeatSpawned: MAP, pomodoro: MAP, blockTasks: MAP, blockLinks: MAP, blockTicks: MAP, eventColors: MAP, opsDone: MAP, madeHere: MAP, piLinks: MAP, inboxItems: MAP, inboxLists: MAP, taskMinutes: MAP, linkedTasks: MAP,
  calendars: MAP, notes: LIST, goals: LIST, pins: LIST, accounts: LIST,
  'local.calendars': LIST, 'local.events': LIST,
  'settings.hidden': MAP, 'settings.hour12': VALUE, 'settings.weekStart': VALUE, 'settings.defaultCalendar': VALUE, 'settings.pi': VALUE, 'settings.magic': VALUE,
  google: VALUE, microsoft: VALUE, notion: VALUE, news: VALUE,
  'secrets.googleClientSecret': VALUE, 'secrets.notionToken': VALUE, 'secrets.anthropicKey': VALUE, 'secrets.twilioToken': VALUE, 'secrets.mcpToken': VALUE, 'secrets.tokens': MAP,
  desktops: MAP, // device id -> { name, addresses, version }: each PC keeps its own entry
};
// Files and folders pinned from one PC's disk mean nothing on another.
const shared = (section, item) => section !== 'pins' || item.source !== 'local';
const TOMBSTONE_MS = 120 * 86400000; // how long a deletion is remembered, for PCs that were off
const ONLINE_MS = 90000;
const LEADER_MS = 120000;
const SYNC_EVERY_MS = 20000;
const PUSH_AFTER_MS = 1500;
const INVITE_MS = 10 * 60000;
const MAX_SYNC_BODY = 64 * 1024 * 1024;
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 32: no 0/O, 1/I

const at = (obj, path) => path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
function put(obj, path, value) {
  const keys = path.split('.');
  const last = keys.pop();
  let o = obj;
  for (const k of keys) o = o[k] && typeof o[k] === 'object' ? o[k] : (o[k] = {});
  o[last] = value;
  return value;
}
const hash = (v) => crypto.createHash('sha1').update(JSON.stringify(v)).digest('base64').slice(0, 12);
const blank = (v) => v == null || v === '' || (typeof v === 'object' && Object.values(v).every(blank));
const sectionOf = (key) => key.slice(0, key.indexOf('|'));

/**
 * The bookkeeping over one copy of the data: `getData()` returns the store's object,
 * `save()` asks for it to be written. Kept apart from the network so tests can run two.
 */
function createReplica(getData, save, now = Date.now) {
  function meta() {
    const d = getData();
    if (!d.sync || typeof d.sync !== 'object') d.sync = {};
    const m = d.sync;
    if (!m.device) m.device = crypto.randomBytes(6).toString('hex');
    m.seq ??= 0; m.lastT ??= 0; m.clock ??= {}; m.peers ??= {};
    return m;
  }

  /** Every shared piece as it is now: key -> value. Keys are "<section>|<key or id>". */
  function current() {
    const d = getData();
    const out = new Map();
    for (const [section, kind] of Object.entries(SECTIONS)) {
      const v = at(d, section);
      if (kind === VALUE) {
        if (v !== undefined) out.set(`${section}|`, v);
      } else if (kind === MAP) {
        if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) if (x !== undefined) out.set(`${section}|${k}`, x);
      } else if (Array.isArray(v)) {
        for (const x of v) if (x && x.id != null && shared(section, x)) out.set(`${section}|${x.id}`, x);
      }
    }
    return out;
  }

  function read(key) {
    const section = sectionOf(key), sub = key.slice(section.length + 1);
    const v = at(getData(), section);
    if (SECTIONS[section] === VALUE) return v;
    if (SECTIONS[section] === MAP) return v && typeof v === 'object' ? v[sub] : undefined;
    return Array.isArray(v) ? v.find((x) => x && String(x.id) === sub && shared(section, x)) : undefined;
  }

  function write(key, value) {
    const d = getData();
    const section = sectionOf(key), sub = key.slice(section.length + 1);
    const kind = SECTIONS[section];
    if (kind === VALUE) {
      if (value !== undefined) put(d, section, value);
    } else if (kind === MAP) {
      let o = at(d, section);
      if (!o || typeof o !== 'object' || Array.isArray(o)) o = put(d, section, {});
      if (value === undefined) delete o[sub]; else o[sub] = value;
    } else {
      let list = at(d, section);
      if (!Array.isArray(list)) list = put(d, section, []);
      const i = list.findIndex((x) => x && String(x.id) === sub);
      if (value === undefined) { if (i >= 0) list.splice(i, 1); } else if (i >= 0) list[i] = value; else list.push(value);
    }
  }

  function stamp(m, key, h) {
    m.seq += 1;
    m.lastT = Math.max(now(), m.lastT + 1);
    m.clock[key] = [m.lastT, m.device, m.seq, h];
  }

  /** Notes what changed since last time (new, edited or gone). Returns how many pieces. */
  function track() {
    const m = meta();
    const cur = current();
    let changed = 0;
    for (const [key, v] of cur) {
      const h = hash(v);
      if (m.clock[key]?.[3] !== h) { stamp(m, key, h); changed++; }
    }
    const old = now() - TOMBSTONE_MS;
    for (const [key, e] of Object.entries(m.clock)) {
      if (e[3] !== null && !cur.has(key)) { stamp(m, key, null); changed++; }
      else if (e[3] === null && e[0] < old) delete m.clock[key];
    }
    return changed;
  }

  /** The pieces that changed here after `seq`, ready to send: [key, time, device, value?] (no value: deleted). */
  function since(seq, skip) {
    const out = [];
    for (const [key, [t, dev, s, h]] of Object.entries(meta().clock)) {
      if (s <= seq || skip?.has(key)) continue;
      if (h === null) { out.push([key, t, dev]); continue; }
      const v = read(key);
      if (v !== undefined) out.push([key, t, dev, v]);
    }
    return out;
  }

  function valid(key, value) {
    const section = sectionOf(key), sub = key.slice(section.length + 1);
    if (!(section in SECTIONS)) return false;
    if (value === undefined) return SECTIONS[section] !== VALUE;
    if (SECTIONS[section] === LIST) return value && typeof value === 'object' && String(value.id) === sub && shared(section, value);
    if (section === 'secrets.mcpToken') return typeof value === 'string' && value.length >= 16; // never lock the phone out
    return true;
  }

  /**
   * Takes in pieces from another PC; the newer of each wins. `force` (the first sync
   * after joining) takes the other PC's copy whatever its time, except that an empty
   * value never replaces a filled-in one here. Returns { touched: sections, keys }.
   */
  function apply(list, { force = false } = {}) {
    const m = meta();
    const touched = new Set();
    const keys = new Set();
    for (const e of Array.isArray(list) ? list : []) {
      if (!Array.isArray(e)) continue;
      const [key, t, dev] = e;
      const value = e.length > 3 ? e[3] : undefined;
      if (typeof key !== 'string' || !Number.isFinite(t) || typeof dev !== 'string' || !valid(key, value)) continue;
      m.lastT = Math.max(m.lastT, t);
      const mine = m.clock[key];
      if (!force && mine && (mine[0] > t || (mine[0] === t && mine[1] >= dev))) continue;
      keys.add(key);
      const h = value === undefined ? null : hash(value);
      if (mine && mine[3] === h) { m.clock[key] = [t, dev, mine[2], h]; continue; }
      if (force) {
        const here = read(key);
        if (blank(value) && !blank(here)) { stamp(m, key, hash(here)); continue; } // keep it, and pass it on
      }
      write(key, value);
      m.seq += 1;
      m.clock[key] = [t, dev, m.seq, h];
      touched.add(sectionOf(key));
    }
    if (touched.size || keys.size) save();
    return { touched, keys };
  }

  /** Drops pieces from the bookkeeping without recording them as deleted. */
  function forget(prefix) {
    const m = meta();
    for (const key of Object.keys(m.clock)) if (key.startsWith(prefix)) delete m.clock[key];
  }

  return { meta, track, since, apply, read, forget };
}

/**
 * An account signed in on both PCs got a different id on each. Before the first sync,
 * this PC's copy takes the other's id everywhere it appears (entry ids start with the
 * account id), so the two merge instead of showing everything twice.
 */
function adoptAccounts(data, incoming) {
  const theirs = incoming.filter((e) => Array.isArray(e) && typeof e[0] === 'string' && e[0].startsWith('accounts|') && e[3]).map((e) => e[3]);
  for (const mine of [...(data.accounts || [])]) {
    const match = theirs.find((a) => a.provider === mine.provider && a.label === mine.label && a.id !== mine.id);
    if (!match) continue;
    const from = mine.id, to = match.id;
    const swap = (s) => (s === from ? to : s.startsWith(from + '/') ? to + s.slice(from.length) : s);
    const walk = (v) => {
      if (typeof v === 'string') return swap(v);
      if (Array.isArray(v)) return v.map(walk);
      if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [swap(k), walk(x)]));
      return v;
    };
    for (const k of Object.keys(data)) if (k !== 'sync') data[k] = walk(data[k]);
    const seen = new Set();
    data.accounts = data.accounts.filter((a) => !seen.has(a.id) && seen.add(a.id));
  }
}

// ---------------------------------------------------------------- this PC

const replica = createReplica(() => store.data, () => store.save());
let onRemote = () => {};
let invite = null;   // { code, expires, tries } while a link code is shown
let timer = null;
let pushTimer = null;
let ticking = null;

const group = () => store.data.secrets.group || null; // { id, key }
const device = () => replica.meta().device;

function seal(obj, key, aad) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', Buffer.from(key, 'base64'), iv);
  c.setAAD(Buffer.from(aad));
  const data = Buffer.concat([c.update(zlib.gzipSync(JSON.stringify(obj))), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), data]);
}
function unseal(buf, key, aad) {
  const d = crypto.createDecipheriv('aes-256-gcm', Buffer.from(key, 'base64'), buf.subarray(0, 12));
  d.setAAD(Buffer.from(aad));
  d.setAuthTag(buf.subarray(12, 28));
  return JSON.parse(zlib.gunzipSync(Buffer.concat([d.update(buf.subarray(28)), d.final()])).toString('utf8'));
}

/** This PC's entry in the shared list of desktops. */
function selfEntry() {
  const m = require('./mcp').info();
  return {
    name: os.hostname(),
    addresses: m.running && m.lan ? m.addresses.map((a) => `${a}:${m.port}`) : [],
    version: require('../../package.json').version,
  };
}

function updateSelf() {
  if (!group()) return;
  const d = store.data;
  d.desktops ??= {};
  const mine = selfEntry();
  if (JSON.stringify(d.desktops[device()]) !== JSON.stringify(mine)) { d.desktops[device()] = mine; store.save(); }
}

function others() {
  const m = replica.meta();
  const ids = new Set([...Object.keys(store.data.desktops || {}), ...Object.keys(m.peers)]);
  ids.delete(m.device);
  return [...ids];
}
const addressesOf = (id) => [...new Set([...(store.data.desktops?.[id]?.addresses || []), ...(replica.meta().peers[id]?.addresses || [])])];

async function post(address, path, body, headers, ms) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    return await fetch(`http://${address}${path}`, { method: 'POST', headers, body, signal: ctl.signal });
  } finally {
    clearTimeout(t);
  }
}

/** Swaps changes with one desktop. Returns true when it answered. */
async function exchange(id, { force = false } = {}) {
  const g = group();
  if (!g) return false;
  replica.track();
  const m = replica.meta();
  const p = (m.peers[id] ??= { have: 0, sent: 0 });
  // The first sync after joining only takes: this PC's own pieces go on the next one, once
  // the group's have replaced its defaults (or they would overwrite the group's).
  const body = { from: m.device, to: id, seq: m.seq, have: force ? 0 : p.have, entries: force ? [] : replica.since(p.sent), nonce: crypto.randomBytes(9).toString('base64') };
  const order = [p.last, ...addressesOf(id).filter((a) => a !== p.last)].filter(Boolean);
  for (const address of order) {
    let reply;
    try {
      const res = await post(address, '/sync', seal(body, g.key, `req:${g.id}`), { 'Content-Type': 'application/octet-stream', 'X-Onyx-Group': g.id }, force ? 60000 : 15000);
      if (res.status === 403) { p.error = 'It is not linked to this desktop any more.'; continue; }
      if (!res.ok) { p.error = res.status === 404 ? 'It runs an older Onyx. Update it.' : `It answered ${res.status}.`; continue; }
      reply = unseal(Buffer.from(await res.arrayBuffer()), g.key, `res:${g.id}`);
    } catch (err) {
      p.error = err.name === 'AbortError' ? 'Not answering.' : 'Not reachable.';
      continue;
    }
    if (reply.nonce !== body.nonce || reply.from !== id) continue;
    if (force) adoptAccounts(store.data, reply.entries);
    const { touched } = replica.apply(reply.entries, { force });
    Object.assign(p, { have: reply.seq, sent: force ? 0 : body.seq, last: address, seen: Date.now(), ok: true, error: '' });
    store.save();
    if (touched.size) { onRemote(touched); if (others().length > 1) schedule(); }
    return true;
  }
  p.ok = false;
  return false;
}

/** Another desktop's side of exchange(). */
function serve(msg) {
  const m = replica.meta();
  replica.track();
  const p = (m.peers[msg.from] ??= { have: 0, sent: 0 });
  const { touched, keys } = replica.apply(msg.entries);
  Object.assign(p, { have: msg.seq, sent: msg.have, seen: Date.now(), ok: true, error: '' });
  store.save();
  if (touched.size) { onRemote(touched); schedule(); } // and pass it on to the others
  return { from: m.device, seq: m.seq, entries: replica.since(msg.have, keys), nonce: msg.nonce };
}

function readRaw(req, max) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > max) { reject(new Error('too large')); req.destroy(); } else chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

const sendJson = (res, code, body) => {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
};

/** POST /sync from another linked desktop (mcp.js). */
async function handleSync(req, res) {
  const g = group();
  if (!g || req.headers['x-onyx-group'] !== g.id) return sendJson(res, 403, { error: 'Not linked.' });
  let msg;
  try {
    msg = unseal(await readRaw(req, MAX_SYNC_BODY), g.key, `req:${g.id}`);
  } catch {
    return sendJson(res, 403, { error: 'Not linked.' });
  }
  if (msg.to && msg.to !== device()) return sendJson(res, 409, { error: 'A different desktop answers at this address now.' });
  const out = serve(msg);
  res.writeHead(200, { 'Content-Type': 'application/octet-stream' });
  res.end(seal(out, g.key, `res:${g.id}`));
}

const normCode = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const fmtCode = (c) => `${c.slice(0, 4)}-${c.slice(4)}`;
const mac = (code, ...parts) => crypto.createHmac('sha256', code).update(parts.join('|')).digest('base64');
const sameMac = (a, b) => typeof b === 'string' && a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
const pubOf = (keyObj) => keyObj.export({ format: 'der', type: 'spki' }).toString('base64');
const keyFrom = (b64) => crypto.createPublicKey({ key: Buffer.from(String(b64), 'base64'), format: 'der', type: 'spki' });
const joinKey = (privateKey, theirPub, code) => Buffer.from(crypto.hkdfSync('sha256', crypto.diffieHellman({ privateKey, publicKey: keyFrom(theirPub) }), code, 'onyx-join', 32)).toString('base64');

/** Shows a one-time code another desktop can join with (and links this one, if it isn't yet). */
function newInvite() {
  if (!group()) {
    store.data.secrets.group = { id: crypto.randomBytes(9).toString('base64url'), key: crypto.randomBytes(32).toString('base64') };
    store.save();
  }
  updateSelf();
  invite = { code: Array.from(crypto.randomBytes(8), (b) => CODE_CHARS[b & 31]).join(''), expires: Date.now() + INVITE_MS, tries: 0 };
  return info();
}

function cancelInvite() {
  invite = null;
  return info();
}

/** POST /sync/join from a desktop that was given the code (mcp.js). */
async function handleJoin(req, res) {
  let body;
  try {
    body = JSON.parse((await readRaw(req, 64 * 1024)).toString('utf8'));
  } catch {
    return sendJson(res, 400, { error: 'Bad request.' });
  }
  if (!invite || invite.expires < Date.now() || !group()) {
    return sendJson(res, 410, { error: 'No link code is waiting on that desktop. On it, open Settings → Desktops and choose "Show a link code".' });
  }
  if (++invite.tries > 5) { invite = null; return sendJson(res, 429, { error: 'Too many wrong codes. Make a new code and try again.' }); }
  if (!sameMac(mac(invite.code, 'join1', body.pub), body.mac)) return sendJson(res, 403, { error: 'Wrong code. Check it and try again.' });
  let reply;
  try {
    const { publicKey, privateKey } = crypto.generateKeyPairSync('x25519');
    const pub = pubOf(publicKey);
    const box = seal({ group: group(), token: store.data.secrets.mcpToken, host: { id: device(), ...selfEntry() } }, joinKey(privateKey, body.pub, invite.code), 'join');
    reply = { pub, mac: mac(invite.code, 'join2', pub, body.pub), box: box.toString('base64') };
  } catch {
    return sendJson(res, 400, { error: 'Bad request.' });
  }
  invite = null;
  sendJson(res, 200, reply);
  onRemote(new Set(['desktops']));
}

const cleanAddress = (a) => {
  const s = String(a || '').trim().replace(/^https?:\/\//i, '').replace(/\/.*$/, '');
  return /:\d+$/.test(s) ? s : `${s}:4747`;
};

/** Joins the linked desktops through the one at `address`, with the code it shows. */
async function join(address, code) {
  code = normCode(code);
  if (code.length !== 8) throw new Error('The code is 8 letters and numbers, like ABCD-2345.');
  if (!String(address || '').trim()) throw new Error('Enter the other desktop\'s address.');
  address = cleanAddress(address);
  if (group() && others().length) throw new Error('This desktop is already linked. Unlink it first.');
  const { publicKey, privateKey } = crypto.generateKeyPairSync('x25519');
  const pub = pubOf(publicKey);
  let res;
  try {
    res = await post(address, '/sync/join', JSON.stringify({ pub, mac: mac(code, 'join1', pub) }), { 'Content-Type': 'application/json' }, 10000);
  } catch {
    throw new Error(`Can't reach Onyx at ${address}. Check the address, that Onyx is open there, and that both PCs are on the same network (or both on Tailscale).`);
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(res.status === 404 ? 'That desktop runs an older Onyx. Update it first.' : body.error || `That desktop answered ${res.status}.`);
  if (!sameMac(mac(code, 'join2', body.pub, pub), body.mac)) throw new Error('The answer did not match the code. Make a new code and try again.');
  const box = unseal(Buffer.from(body.box, 'base64'), joinKey(privateKey, body.pub, code), 'join');

  const d = store.data;
  d.secrets.group = box.group;
  d.secrets.mcpToken = box.token; // one token for every linked desktop, so the phone can use any of them
  const m = replica.meta();
  replica.forget('desktops|');
  d.desktops = {};
  m.peers = { [box.host.id]: { have: 0, sent: 0, addresses: [address, ...(box.host.addresses || [])] } };
  updateSelf();
  store.save();
  const ok = (await exchange(box.host.id, { force: true })) && (await exchange(box.host.id));
  start();
  if (!ok) throw new Error(`Linked with ${box.host.name || 'the other desktop'}, but the first sync did not go through. It will keep trying.`);
  onRemote(new Set(['accounts', 'desktops']));
  return info();
}

/** Stops sharing with the other desktops. This PC keeps its copy of everything. */
async function leave() {
  if (!group()) return info();
  const d = store.data;
  delete d.desktops?.[device()];
  store.save();
  await Promise.all(others().map((id) => exchange(id).catch(() => false))); // tells them
  d.secrets.group = null;
  replica.forget('desktops|');
  d.desktops = {};
  replica.meta().peers = {};
  invite = null;
  store.save();
  return info();
}

/** Takes a desktop that is gone off the list. One still linked comes back when it next syncs. */
function forget(id) {
  if (id === device()) throw new Error('That is this desktop. Use Unlink instead.');
  delete store.data.desktops?.[id];
  delete replica.meta().peers[id];
  store.save();
  schedule();
  return info();
}

/** Syncs straight away (the phone may ask too, so no link code in the answer). */
async function syncNow() {
  await tick();
  return { ...info(), invite: null };
}

function info() {
  const m = replica.meta();
  const now = Date.now();
  const list = Object.entries(store.data.desktops || {}).map(([id, e]) => {
    const p = m.peers[id] || {};
    const self = id === m.device;
    return {
      id, self, name: e.name || 'Desktop', version: e.version || '', addresses: e.addresses || [],
      online: self || (!!p.ok && now - (p.seen || 0) < ONLINE_MS), seen: self ? now : p.seen || null, error: self || p.ok ? '' : p.error || '',
    };
  });
  // A desktop just joined through, before its own entry has arrived.
  for (const [id, p] of Object.entries(m.peers)) {
    if (!list.some((x) => x.id === id) && p.addresses?.length) list.push({ id, self: false, name: p.addresses[0], version: '', addresses: p.addresses, online: false, seen: p.seen || null, error: p.error || '' });
  }
  list.sort((a, b) => (b.self - a.self) || a.name.localeCompare(b.name));
  return {
    linked: !!group(), device: m.device, name: os.hostname(), desktops: list,
    invite: invite && invite.expires > now ? { code: fmtCode(invite.code), expires: invite.expires, addresses: selfEntry().addresses } : null,
  };
}

/** The other desktops' addresses, for the phone (any of them can answer it). */
const peerAddresses = () => (group() ? [...new Set(others().flatMap(addressesOf))] : []);

/**
 * Whether this PC does the jobs that must happen once, not once per PC (adding the
 * next copy of a repeating task done in Google): the one with the lowest id among the
 * desktops seen lately.
 */
function leads() {
  if (!group()) return true;
  const m = replica.meta();
  const now = Date.now();
  return !Object.entries(m.peers).some(([id, p]) => p.ok && now - (p.seen || 0) < LEADER_MS && id < m.device);
}

async function tick() {
  if (ticking) return ticking;
  ticking = (async () => {
    try {
      if (!group()) return;
      updateSelf();
      await Promise.all(others().map((id) => exchange(id).catch((err) => console.error('onyx: sync failed:', err.message))));
    } finally {
      ticking = null;
    }
  })();
  return ticking;
}

function schedule() {
  if (!group()) return;
  clearTimeout(pushTimer);
  pushTimer = setTimeout(tick, PUSH_AFTER_MS);
}

/** Starts syncing (main.js). `changed(sections)` is told when another desktop changed something. */
function start(changed) {
  if (changed) onRemote = changed;
  replica.track();
  if (!timer) {
    store.onWrite(() => { if (replica.track() && group()) schedule(); });
    timer = setInterval(tick, SYNC_EVERY_MS);
    timer.unref?.();
  }
  schedule();
}

module.exports = {
  start, info, newInvite, cancelInvite, join, leave, forget, syncNow, leads, peerAddresses,
  handleSync, handleJoin,
  // for tests
  createReplica, adoptAccounts, SECTIONS,
};
