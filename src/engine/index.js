// Onyx's engine on the phone and in a browser: the PC's own code (hub, goals, the providers, sync),
// bundled by scripts/build-engine.js, so the phone works while the PC is off, and Onyx works in a
// browser with no PC at all. It is one more copy in Drive sync (cloud.js): it keeps what the PCs
// share, reads and writes Google and Outlook itself, and its changes reach the PCs through the
// same hidden Drive folder. Set up once from a PC (the hand-off, locked with the sync code).
//
// window.OnyxEngine: boot, on, info, join, leave, call, active, onChanged, syncNow.
'use strict';

const store = require('../main/store'); // the engine's own (src/engine/store.js), by the bundle's alias
const codec = require('./codec');
const { Buffer } = require('./shims/buffer');

const cloud = () => require('../main/cloud');
const sync = () => require('../main/sync');
const hub = () => require('../main/hub');
const api = () => require('../main/api');

const POLL_MS = 20000;
const listeners = new Set();
let booted = null;
let started = false;
let active = false;     // in use: the PC is out of reach (or there is no PC: the web app)
let poller = null;
let hooked = false;

const isOn = () => !!store.data.standalone?.on;
const tell = (what) => { for (const fn of listeners) { try { fn(what); } catch { /* one listener's problem */ } } };

/** Loads what is kept here; resolves to whether it is set up. */
async function boot() {
  booted ??= (async () => {
    await store.load();
    cloud().useCodec(codec);
    if (isOn()) start();
  })();
  await booted;
  return isOn();
}

/** Keeps in step with the PCs: what changes here goes up, what they change comes down. */
function start() {
  if (started) return;
  started = true;
  const s = sync();
  s.onChange((touched) => {
    if ([...touched].some((x) => x !== 'desktops')) hub().invalidate();
    if (touched.has('accounts') || touched.has('secrets.tokens')) hub().refreshCalendars().catch(() => {});
    tell({ changed: [...touched] });
  });
  s.replica.track();
  if (!hooked) store.onWrite(() => { if (started && s.replica.track()) cloud().changed(); });
  hooked = true;
  s.updateSelf();
  poller = setInterval(() => { if (active && visible()) cloud().syncNow().catch(() => {}); }, POLL_MS);
  poller.unref?.();
}
const visible = () => typeof document === 'undefined' || document.visibilityState !== 'hidden';

/** In use (or not): while it is, the others' changes are looked for every 20 seconds. */
async function setActive(on) {
  await boot();
  const was = active;
  active = !!on && isOn();
  if (active && !was) await cloud().syncNow().catch(() => {});
}

/** What the phone's settings show: on or off, the Drive account, when it last synced, the PCs it sees. */
async function info() {
  await boot();
  if (!isOn()) return { on: false };
  const c = cloud().info();
  return { on: true, since: store.data.standalone.since, account: c.account, state: c.state, error: c.error, last: c.last, pcs: c.peers.filter((p) => !/^(phone|web)-/.test(p.id)) };
}

const deviceId = () => `${globalThis.ONYX_WEB ? 'web' : 'phone'}-${require('./shims/crypto').randomBytes(6).toString('hex')}`;

/**
 * Sets up from a PC's hand-off (cloud.js handoff) and the sync code: the Drive account's sign-in comes
 * from it, everything else from the PCs' files in Drive. Ids that start with "phone-" (or "web-") sort
 * after every PC's, so a PC that is on keeps doing the once-only jobs (sync.js leads).
 */
async function join(blob, code) {
  await boot();
  const n = codec.normCode(code);
  if (n.length !== 16) throw new Error('The sync code is 16 letters and numbers, like ABCD-EFGH-JKLM-NPQR. It is in Onyx on your PC: Settings → Desktops.');
  const key = await codec.keyOf(n);
  let h;
  try {
    h = await codec.unseal(Buffer.from(String(blob).trim(), 'base64url'), key);
  } catch {
    throw new Error('That sync code does not match. Check it in Onyx on your PC: Settings → Desktops.');
  }
  if (!h?.account?.id || !h.token?.refresh) throw new Error('That setup is incomplete. Make a new one on the PC.');
  if (isOn()) await leave();
  const d = store.data;
  d.accounts = [h.account];
  d.secrets.tokens = { [h.account.id]: h.token };
  d.google = { ...(d.google || {}), clientId: h.google?.clientId || '' };
  d.secrets.googleClientSecret = h.clientSecret || '';
  d.secrets.cloudCode = n;
  d.secrets.cloudKey = key;
  d.sync = { device: deviceId(), cloud: { on: true, account: h.account.label, state: 'working', joined: false, peers: {} } };
  d.standalone = { on: true, since: Date.now() };
  await store.flush();
  start();
  await cloud().syncNow();
  const c = cloud().info();
  if (c.state !== 'ok') {
    const why = c.error || 'The first sync did not go through.';
    await leave();
    throw new Error(why);
  }
  hub().invalidate();
  await hub().refreshCalendars().catch(() => {});
  await store.flush();
  tell({ changed: ['all'] });
  return info();
}

/** Stops working on its own: its file leaves Drive, and what it kept here is forgotten. */
async function leave() {
  await boot();
  clearInterval(poller);
  poller = null;
  try { if (cloud().on()) await cloud().disable(); } catch { /* offline: the PCs drop its file once it is old */ }
  await store.reset();
  started = false;
  active = false;
  booted = null;
  return { on: false };
}

// What the window asks for, run here as the PC would. The PC's own extras (the link to it, linking
// desktops) are not in the phone's list (api.remote) anyway.
const STATEFUL = new Set(['state', 'refresh', 'settings', 'tag:color', 'tag:rename', 'tag:delete', 'local:add', 'local:remove', 'notion:connect', 'notion:disconnect', 'google:credentials', 'microsoft:client', 'feed:add', 'sheet:add', 'ai:key', 'magic:remember', 'calls:token']);
async function call(name, args = []) {
  await boot();
  if (!isOn()) throw new Error('This device is not set up to work on its own.');
  const fn = api().remote[name];
  if (!fn) throw new Error(require('./shims/pc-only').NEEDS_PC);
  let value = await fn(...args);
  if (value && typeof value === 'object' && STATEFUL.has(name)) value = { ...value, standalone: true };
  return value === undefined ? null : JSON.parse(JSON.stringify(value));
}

const can = (name) => !!api().remote[name];

module.exports = {
  boot, on: isOn, info, join, leave, call, can, active: setActive,
  onChanged: (fn) => { listeners.add(fn); return () => listeners.delete(fn); },
  syncNow: async () => { await boot(); if (isOn()) await cloud().syncNow(); return info(); },
};
if (typeof window !== 'undefined') window.OnyxEngine = module.exports;
