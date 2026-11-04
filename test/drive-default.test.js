// Sync through Google Drive, on by default: it turns itself on with a Google account (cloud.js auto),
// stays off once turned off, and asks once when the sign-in is from before Drive. A paired phone sets
// itself up to sync that way too (phone-setup.js on the PC, autoSetUp in remote.js): it asks with a key
// of its own, you allow it on the PC, and the hand-off and the code come back locked to that key.
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('fs');
const path = require('path');
const sync = require('../src/main/sync');
const cloud = require('../src/main/cloud');
const setup = require('../src/main/phone-setup');

const DRIVE = 'openid email https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/drive.appdata';

const blankData = (granted) => ({
  settings: { hidden: {}, hour12: true, weekStart: 0, defaultCalendar: '', pi: { enabled: true } },
  accounts: [{ id: 'g-here', provider: 'google', label: 'me@gmail.com' }], calendars: {}, google: { clientId: 'cid' }, microsoft: { clientId: '' },
  local: { calendars: [], events: [] }, piLinks: {}, tags: {}, tagColors: {}, memos: {}, notes: [], pins: [],
  notion: null, goals: [], repeats: {}, repeatSpawned: {}, pomodoro: {}, madeHere: {}, news: null, desktops: {},
  secrets: { googleClientSecret: 's', tokens: { 'g-here': { access: 'a', refresh: 'r', ...(granted ? { granted } : {}) } }, mcpToken: 'x'.repeat(20), notionToken: '', group: null },
});

function fakeDrive() {
  const files = new Map();
  let n = 0;
  const api = {
    files, calls: [], denied: false,
    list: async () => { api.calls.push('list'); if (api.denied) throw Object.assign(new Error('scope'), { code: 'scope' }); return [...files.values()].map(({ data, ...f }) => structuredClone(f)); },
    download: async (id) => files.get(id).data,
    create: async (meta, data) => { const id = `f${++n}`; files.set(id, { id, name: meta.name, appProperties: meta.appProperties, modifiedTime: new Date().toISOString(), data }); return { id }; },
    update: async (id, meta, data) => { Object.assign(files.get(id), { appProperties: { ...files.get(id).appProperties, ...meta.appProperties }, data }); return { id }; },
    patch: async (id, meta) => { Object.assign(files.get(id).appProperties, meta.appProperties); return { id }; },
    remove: async (id) => { files.delete(id); },
  };
  return api;
}

let clock = 5_000_000;
const now = () => (clock += 10);
function pc(drive, data) {
  const me = { data };
  me.r = sync.createReplica(() => me.data, () => {}, now);
  me.r.meta().device = 'aaaa';
  me.r.track();
  me.c = cloud.createCloud({ getData: () => me.data, save: () => {}, replica: me.r, adoptAccounts: sync.adoptAccounts, driveFor: () => drive, hostname: () => 'PC', now });
  return me;
}

test('Drive sync turns itself on with a Google account that has Drive, and stays off once turned off', async () => {
  const drive = fakeDrive();
  const a = pc(drive, blankData(DRIVE));
  assert.equal(await a.c.auto(), true);
  assert.equal(a.c.info().state, 'ok');
  assert.equal(a.c.info().account, 'me@gmail.com');
  assert.ok(a.c.code(), 'the first device makes the sync code');
  await a.c.disable();
  assert.equal(await a.c.auto(), false, 'turned off by hand: off it stays');
  assert.equal(a.c.info().on, false);
  await a.c.enable('me@gmail.com');
  assert.equal(a.c.info().on, true, 'and on again by hand');

  const none = pc(fakeDrive(), { ...blankData(DRIVE), accounts: [] });
  assert.equal(await none.c.auto(), false, 'no Google account: nothing to turn on with');
});

test('a sign-in from before Drive: asked for once, and Google is not asked every round', async () => {
  const drive = fakeDrive();
  const old = pc(drive, blankData('openid email https://www.googleapis.com/auth/calendar'));
  assert.equal(await old.c.auto(), false);
  assert.equal(old.c.info().on, false);
  assert.equal(old.c.info().ask, 'me@gmail.com', 'the window asks for Google\'s OK');
  assert.equal(drive.calls.length, 0, 'Drive is not even tried');

  // Nothing kept about what Google agreed to: tried once; a no turns into the same ask, and no more tries.
  const unknown = fakeDrive();
  unknown.denied = true;
  const b = pc(unknown, blankData(null));
  assert.equal(await b.c.auto(), false);
  assert.equal(b.c.info().ask, 'me@gmail.com');
  const tries = unknown.calls.length;
  assert.equal(await b.c.auto(), false);
  assert.equal(unknown.calls.length, tries, 'not tried again while the ask waits');

  // A new sign-in with Drive: it turns on by itself, and the ask is gone.
  b.data.secrets.tokens['g-here'].granted = DRIVE;
  unknown.denied = false;
  assert.equal(await b.c.auto(), true);
  assert.equal(b.c.info().ask, '');
  // "Don't sync" on the ask: off for good.
  const c = pc(fakeDrive(), blankData('openid'));
  await c.c.auto();
  await c.c.disable();
  c.data.secrets.tokens['g-here'].granted = DRIVE;
  assert.equal(await c.c.auto(), false);
  assert.equal(c.c.info().ask, '');
});

// ---------------------------------------------------------------- the phone's ask, on the PC

const subtle = globalThis.crypto.subtle;
const ECDH = { name: 'ECDH', namedCurve: 'P-256' };
const enc = (s) => new TextEncoder().encode(s);

/** What the phone does with WebCrypto (as remote.js does): its key, and opening what the PC sends. */
async function phoneKey() {
  const pair = await subtle.generateKey(ECDH, true, ['deriveBits']);
  return { pair, pub: Buffer.from(await subtle.exportKey('raw', pair.publicKey)).toString('base64url') };
}
async function phoneOpen(priv, token, v) {
  const theirs = await subtle.importKey('raw', Buffer.from(v.pub, 'base64url'), ECDH, false, []);
  const shared = await subtle.deriveBits({ name: 'ECDH', public: theirs }, priv, 256);
  const hk = await subtle.importKey('raw', shared, 'HKDF', false, ['deriveKey']);
  const key = await subtle.deriveKey({ name: 'HKDF', hash: 'SHA-256', salt: enc(token), info: enc('onyx-phone-setup-v1') }, hk, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
  const box = Buffer.from(v.box, 'base64url');
  return JSON.parse(Buffer.from(await subtle.decrypt({ name: 'AES-GCM', iv: box.subarray(0, 12), additionalData: enc('onyx-phone-setup') }, key, box.subarray(12))).toString('utf8'));
}

function pcSide(info = { on: true, state: 'ok', hasCode: true }) {
  const kept = {};
  const me = { kept, told: [], info, t: 1_000_000 };
  setup.use({
    asks: () => kept, save: () => {}, token: () => 'pair-token', now: () => me.t,
    cloud: { info: () => me.info, handoff: async () => 'HANDOFF-BLOB', code: () => 'ABCD-EFGH-JKLM-NPQR' },
  });
  setup.onAsk((asks) => me.told.push(asks));
  return me;
}

test('the phone waits for your OK on the PC, then gets the hand-off and the code, readable only with its key', async () => {
  const me = pcSide({ on: false, state: 'off' });
  const { pair, pub } = await phoneKey();
  const ask = { id: 'ph-abcdefgh12', pub, name: 'Pixel 8' };
  assert.deepEqual(await setup.request(ask), { ready: false }, 'Drive sync not on here yet: asked again later');
  me.info = { on: true, state: 'ok', hasCode: true };
  assert.deepEqual(await setup.request(ask), { waiting: true });
  assert.deepEqual(setup.pending().map((a) => a.name), ['Pixel 8']);
  assert.equal(me.told.length, 1, 'the window is told once');
  assert.deepEqual(await setup.request(ask), { waiting: true });
  assert.equal(me.told.length, 1, 'asking again while it waits tells nobody again');

  setup.answer(ask.id, true);
  assert.deepEqual(setup.pending(), []);
  const v = await setup.request(ask);
  assert.ok(v.box && v.pub);
  assert.doesNotMatch(Buffer.from(v.box, 'base64url').toString('latin1'), /HANDOFF-BLOB|ABCD/, 'nothing readable crosses the network');
  assert.deepEqual(await phoneOpen(pair.privateKey, 'pair-token', v), { handoff: 'HANDOFF-BLOB', code: 'ABCD-EFGH-JKLM-NPQR' });
  await assert.rejects(phoneOpen((await phoneKey()).pair.privateKey, 'pair-token', v), 'another key cannot open it');

  // The same phone with a new key (reinstalled): asked again, not handed over.
  const again = await phoneKey();
  assert.deepEqual(await setup.request({ ...ask, pub: again.pub }), { waiting: true });
  assert.equal(me.told.length, 2);
});

test('a no is kept; bad asks are refused; asks are few and expire', async () => {
  const me = pcSide();
  const { pub } = await phoneKey();
  await setup.request({ id: 'ph-said-no-1', pub, name: 'Phone' });
  setup.answer('ph-said-no-1', false);
  assert.deepEqual(await setup.request({ id: 'ph-said-no-1', pub, name: 'Phone' }), { declined: true });
  await assert.rejects(setup.request({ id: 'x', pub }), /incomplete/);
  await assert.rejects(setup.request({ id: 'ph-fine-id-1', pub: Buffer.alloc(65, 1).toString('base64url') }), /incomplete/);
  assert.throws(() => setup.answer('ph-nobody-11', true), /no longer asking/);
  for (let i = 0; i < 6; i++) { me.t += 1; await setup.request({ id: `ph-flood-${i}0`, pub, name: `<b>Flood ${i}</b>` }); }
  assert.equal(setup.pending().length, 3, 'only the newest few wait');
  assert.equal(setup.pending()[0].name, 'bFlood 5/b', 'names lose their markup');
  me.t += setup.KEEP_MS + 1;
  assert.deepEqual(setup.pending(), [], 'a week later they are gone');
});

test('the answer is the PC\'s alone, and the engine never carries the setup', () => {
  const api = fs.readFileSync(path.join(__dirname, '../src/main/api.js'), 'utf8');
  const main = fs.readFileSync(path.join(__dirname, '../src/main/main.js'), 'utf8');
  assert.doesNotMatch(api, /phone:answer|phone:asks/, 'the phone cannot allow itself');
  assert.match(main, /'phone:answer': \(id, yes\) => require\('\.\/phone-setup'\)\.answer/);
  assert.ok(require('../src/main/api').remote['phone:setup'], 'the phone can ask');
  assert.match(fs.readFileSync(path.join(__dirname, '../scripts/build-engine.js'), 'utf8'), /\[main\('phone-setup\.js'\)\]: pcOnly/);
  assert.match(main, /cloud\.autoOn\(\)/, 'a Google sign-in turns it on too');
});

// ---------------------------------------------------------------- the phone's side (remote.js)

test('a paired phone sets itself up once you allow it on the PC: no code typed', async () => {
  const me = pcSide();
  const code = fs.readFileSync(path.join(__dirname, '../src/renderer/remote.js'), 'utf8');
  const kept = new Map([['onyx.connection', JSON.stringify({ addresses: ['127.0.0.1:9'], token: 'pair-token', last: '' })]]);
  let t = Date.now();
  class FakeDate extends Date { static now() { return t; } }
  const joined = [];
  const told = [];
  const unref = (fn) => (...a) => { const x = fn(...a); x.unref?.(); return x; };
  const ctx = {
    console, URL, URLSearchParams, AbortController, Promise, JSON, Math, Date: FakeDate,
    TextEncoder, TextDecoder, btoa, atob, crypto: globalThis.crypto,
    navigator: { userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8 Build/AP2A.240805.005; wv) AppleWebKit/537.36' },
    setTimeout: unref(setTimeout), clearTimeout, setInterval: unref(setInterval), clearInterval,
    location: { search: '' },
    localStorage: { getItem: (k) => kept.get(k) ?? null, setItem: (k, v) => kept.set(k, String(v)), removeItem: (k) => kept.delete(k) },
    document: { documentElement: { classList: { toggle() {} }, style: { setProperty() {} }, dataset: {} }, visibilityState: 'visible', addEventListener() {} },
    addEventListener() {},
    Capacitor: { isNativePlatform: () => true, Plugins: {} },
    // The PC: the real phone-setup.js answers phone:setup.
    fetch: async (url, opts) => {
      const { name, args } = JSON.parse(opts.body);
      const value = name === 'phone:setup' ? await setup.request(args[0]) : name === 'state' ? { settings: {}, calendars: [] } : true;
      return { status: 200, json: async () => ({ ok: true, value }) };
    },
    OnyxEngine: {
      boot: async () => false, can: () => true, active() {}, onChanged() {}, info: async () => ({ on: false }),
      join: async (handoff, c) => { joined.push([handoff, c]); return { on: true }; },
      call: async () => true,
    },
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(code, ctx);
  const onyx = ctx.onyx;
  onyx.onOutbox((o) => { if (o.setUp) told.push(o); });
  const settle = () => new Promise((r) => setTimeout(r, 60));

  await onyx.state(); // the PC answers: the phone asks
  await settle();
  assert.deepEqual(setup.pending().map((a) => a.name), ['Pixel 8'], 'the PC asks you, naming the phone');
  assert.equal(onyx.standalone.auto().state, 'waiting');
  assert.equal(joined.length, 0);

  setup.answer(setup.pending()[0].id, true);
  t += 21000; // its next ask
  await onyx.state();
  await settle();
  assert.deepEqual(joined, [['HANDOFF-BLOB', 'ABCD-EFGH-JKLM-NPQR']], 'joined with the PC\'s hand-off and code');
  assert.equal(onyx.standalone.auto().state, 'done');
  assert.equal(told.length, 1, 'the window says so');
  assert.equal(onyx.connection().standalone, true);
  assert.ok(!JSON.parse(kept.get('onyx.setup')).jwk, 'its key is dropped once used');
  void me;
});
