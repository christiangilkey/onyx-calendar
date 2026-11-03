// Onyx's engine on the phone and in a browser: the PC's own code (hub, goals, the providers, sync),
// bundled by scripts/build-engine.js, so the phone works while the PC is off, and Onyx works in a
// browser with no PC at all. It is one more copy in Drive sync (cloud.js): it keeps what the PCs
// share, reads and writes Google and Outlook itself, and its changes reach the PCs through the
// same hidden Drive folder. Set up once: from a PC (the hand-off, locked with the sync code), or with
// no PC at all, by signing in to Google here (signInStart/signInFinish, then enterCode if others exist).
//
// window.OnyxEngine: boot, on, info, join, leave, call, active, onChanged, syncNow, signInStart,
// signInFinish, enterCode, handoff.
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
  const own = store.data.standalone || {};
  // Not set up: whether it waits for the sync code (signed in already), and whether a Google client is kept.
  if (!isOn()) return { on: false, needsCode: !!own.joining, account: own.joining ? cloud().info().account : '', hasClient: !!own.client };
  const c = cloud().info();
  return {
    on: true, since: own.since, account: c.account, state: c.state, error: c.error, last: c.last, code: cloud().code(),
    pcs: c.peers.filter((p) => !/^(phone|web)-/.test(p.id)), others: c.peers.filter((p) => /^(phone|web)-/.test(p.id)),
  };
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

// ---------------------------------------------------------------- set up with no PC at all
// Signing in to Google here, with the person's own Google client of the "Web application" kind
// (Google Cloud → Credentials). Its sign-in page sends the browser back to the redirect address
// with a code; the code, the client and the PKCE secret make the sign-in, kept here. The first
// device makes the sync code; any later one (a PC, a phone, a browser) types it in.

/** Kept now, through a reload (the trip to Google's page): the store writes only what it was told changed. */
const keep = () => { store.save(); return store.flush(); };
const GOOGLE_AUTH = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN = 'https://oauth2.googleapis.com/token';

/** The Google client from its downloaded file (client_secret_….json), or { id, secret }. */
function readClient(given) {
  let v = given;
  if (typeof v === 'string') {
    try { v = JSON.parse(v); } catch { throw new Error('That is not a Google client file. Download it from Google Cloud → Credentials (the download button by your Web client).'); }
  }
  const c = v?.web || v?.installed || v || {};
  const id = String(c.client_id || c.id || '').trim();
  const secret = String(c.client_secret || c.secret || '').trim();
  if (!/\.apps\.googleusercontent\.com$/.test(id)) throw new Error('The client ID ends in .apps.googleusercontent.com. Copy it from Google Cloud → Credentials.');
  if (!secret) throw new Error('Add the client secret too (it is next to the client ID in Google Cloud).');
  return { id, secret };
}

/**
 * The address of Google's sign-in page for this device. `back` is 'web' (this page) or 'app' (the
 * phone app: the web page it comes back to hands the answer on to the app). What is needed to
 * finish is kept here until the answer comes.
 */
async function signInStart({ client, redirect, back = 'web' } = {}) {
  await boot();
  const c = client ? readClient(client) : store.data.standalone?.client;
  if (!c) throw new Error('Add your Google client first.');
  if (!/^https:\/\/|^http:\/\/(localhost|127\.0\.0\.1)[:/]/.test(String(redirect || ''))) throw new Error('No address for Google to come back to.');
  const rnd = require('./shims/crypto');
  const verifier = rnd.randomBytes(48).toString('base64url');
  const challenge = rnd.createHash('sha256').update(verifier).digest('base64url');
  const state = `${back === 'app' ? 'app' : 'web'}.${rnd.randomBytes(16).toString('base64url')}`;
  store.data.standalone = { on: false, ...(store.data.standalone || {}), client: c, pending: { state, verifier, redirect, at: Date.now() } };
  await keep();
  return `${GOOGLE_AUTH}?${new URLSearchParams({
    client_id: c.id, redirect_uri: redirect, response_type: 'code', scope: require('../main/accounts').GOOGLE_SCOPE,
    code_challenge: challenge, code_challenge_method: 'S256', state, access_type: 'offline', prompt: 'consent',
  })}`;
}

/**
 * Google's answer ({ code, state } or { error }). The account is signed in here; on a device not set
 * up yet, sync through its Drive starts: { on: true } when this is the first device (the sync code is
 * made here), or { needsCode: true } when others are there already (enterCode next).
 */
async function signInFinish({ code, state, error } = {}) {
  await boot();
  const s = store.data.standalone || {};
  const p = s.pending;
  if (!p || p.state !== state) throw new Error('That sign-in was not started here. Start it again.');
  delete s.pending;
  await keep();
  if (error) throw new Error(error === 'access_denied' ? 'Google sign-in was cancelled.' : `Google sign-in failed: ${error}`);
  if (Date.now() - p.at > 15 * 60 * 1000) throw new Error('That sign-in took too long. Start it again.');
  const tokens = await require('../main/oauth').postForm(GOOGLE_TOKEN, {
    code, client_id: s.client.id, client_secret: s.client.secret, redirect_uri: p.redirect,
    grant_type: 'authorization_code', code_verifier: p.verifier,
  });
  if (!tokens.refresh_token) throw new Error('Google did not give Onyx a lasting sign-in. Try again.');
  let label = 'Google';
  try { label = JSON.parse(Buffer.from(tokens.id_token.split('.')[1], 'base64url').toString('utf8')).email || label; } catch { /* no id token */ }

  const d = store.data;
  let acct = d.accounts.find((a) => a.provider === 'google' && a.label === label);
  if (!acct) {
    acct = { id: `g${require('./shims/crypto').randomBytes(4).toString('hex')}`, provider: 'google', label };
    d.accounts.push(acct);
  }
  // The client goes with the sign-in: whichever device renews it later uses the client it was made with.
  d.secrets.tokens[acct.id] = {
    access: tokens.access_token, refresh: tokens.refresh_token, expires: Date.now() + (tokens.expires_in || 3600) * 1000,
    ...(tokens.scope ? { granted: tokens.scope } : {}), client: { id: s.client.id, secret: s.client.secret },
  };
  if (isOn()) { // one more account on a device already set up
    await keep();
    hub().invalidate();
    await hub().refreshCalendars().catch(() => {});
    tell({ changed: ['accounts'] });
    return info();
  }
  d.secrets.cloudCode = '';
  delete d.secrets.cloudKey;
  d.sync = { device: deviceId(), cloud: { on: true, account: label, state: 'working', joined: false, peers: {} } };
  d.standalone = { on: false, client: s.client, joining: true };
  await keep();
  start();
  await cloud().syncNow();
  return settle(true);
}

/** After a first sync: on (the first device, or the code fit), the code still needed, or why not. */
async function settle(leaveOnError) {
  const c = cloud().info();
  if (c.state === 'needs-code') return { on: false, needsCode: true, account: c.account };
  if (c.state !== 'ok') {
    const why = c.error || 'The first sync did not go through.';
    if (leaveOnError) await leave();
    throw new Error(why);
  }
  store.data.standalone = { on: true, since: Date.now(), client: store.data.standalone?.client };
  await keep();
  hub().invalidate();
  await hub().refreshCalendars().catch(() => {});
  await keep();
  tell({ changed: ['all'] });
  return info();
}

/** The sync code from another device (a PC, a phone, a browser), after signing in here. */
async function enterCode(code) {
  await boot();
  if (!store.data.standalone?.joining) throw new Error('Sign in with Google first.');
  try {
    await cloud().enterCode(code);
  } catch (err) {
    throw new Error(/does not open/.test(err.message) ? 'That code does not open your other devices\' copies. Check it in Onyx on one of them: Settings → Desktops (on a PC) or Connection (on the phone or the web).' : err.message);
  }
  return settle(false);
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
  boot, on: isOn, info, join, leave, call, can, active: setActive, signInStart, signInFinish, enterCode, readClient,
  handoff: async () => { await boot(); if (!isOn()) throw new Error('Set this device up first.'); return cloud().handoff(); },
  onChanged: (fn) => { listeners.add(fn); return () => listeners.delete(fn); },
  syncNow: async () => { await boot(); if (isOn()) await cloud().syncNow(); return info(); },
};
if (typeof window !== 'undefined') window.OnyxEngine = module.exports;
