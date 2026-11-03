// The engine for the phone and the web app (src/engine): its stand-ins for Node give what Node gives,
// its lock opens the PCs' files (and theirs open its), and the bundle, run in a pretend browser, joins
// a PC through a pretend Google Drive: it sees what the PC has, and what it changes reaches the PC.
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const zlib = require('node:zlib');
const nodeCrypto = require('node:crypto');
const sync = require('../src/main/sync');
const cloud = require('../src/main/cloud');
const { build } = require('../scripts/build-engine');
const { Buffer: B } = require('../src/engine/shims/buffer');
const shimCrypto = require('../src/engine/shims/crypto');
const shimZlib = require('../src/engine/shims/zlib');
const codec = require('../src/engine/codec');

test('Buffer stand-in: encodings and readers as Node has them', () => {
  const text = 'Onyx ✓ مرحبا 🚀';
  for (const enc of ['utf8', 'base64', 'base64url', 'hex', 'latin1']) {
    assert.equal(B.from(text).toString(enc), Buffer.from(text).toString(enc), enc);
    const s = Buffer.from(text).toString(enc);
    if (enc !== 'latin1') assert.equal(B.from(s, enc).toString('utf8'), text, `from ${enc}`);
  }
  const bytes = nodeCrypto.randomBytes(300);
  const b = B.from(bytes);
  for (const o of [0, 7, 100, 296]) {
    assert.equal(b.readUInt32LE(o), bytes.readUInt32LE(o));
    assert.equal(b.readUInt16LE(o), bytes.readUInt16LE(o));
    assert.equal(b.readUInt32BE(o), bytes.readUInt32BE(o));
  }
  assert.ok(B.concat([B.from('ab'), B.from('cd')]).equals(B.from('abcd')));
  assert.ok(b.subarray(4, 8) instanceof B, 'a part of one is one too');
  assert.equal(b.subarray(4, 8).toString('hex'), bytes.subarray(4, 8).toString('hex'));
});

test('hashes and HMAC match Node; random bytes look random', () => {
  for (const msg of ['', 'abc', 'x'.repeat(55), 'y'.repeat(64), 'z'.repeat(1000), 'مرحبا']) {
    for (const alg of ['sha1', 'sha256']) {
      for (const enc of ['hex', 'base64', 'base64url']) assert.equal(shimCrypto.createHash(alg).update(msg).digest(enc), nodeCrypto.createHash(alg).update(msg).digest(enc), `${alg} ${enc} ${msg.length}`);
    }
    assert.equal(shimCrypto.createHmac('sha256', 'code').update(msg).digest('base64'), nodeCrypto.createHmac('sha256', 'code').update(msg).digest('base64'));
  }
  const big = nodeCrypto.randomBytes(5000);
  assert.equal(shimCrypto.createHash('sha1').update(B.from(big)).digest('hex'), nodeCrypto.createHash('sha1').update(big).digest('hex'));
  assert.notEqual(shimCrypto.randomBytes(8).toString('hex'), shimCrypto.randomBytes(8).toString('hex'));
  assert.match(shimCrypto.randomUUID(), /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});

test('inflate unpacks what zlib packs: stored, fixed and dynamic blocks, and gzip', () => {
  const samples = [
    Buffer.alloc(0), Buffer.from('a'), Buffer.from('hello hello hello hello'),
    Buffer.from('<row r="1"><c r="A1" t="s"><v>0</v></c></row>'.repeat(4000)),
    nodeCrypto.randomBytes(70000), // incompressible: stored blocks
    Buffer.from(Array.from({ length: 200000 }, (_, i) => String.fromCharCode(97 + ((i * 7919) % 23))).join('')),
  ];
  for (const s of samples) {
    for (const level of [0, 1, 9]) {
      assert.ok(shimZlib.inflateRawSync(zlib.deflateRawSync(s, { level })).equals(s), `raw, level ${level}, ${s.length} bytes`);
    }
    assert.ok(shimZlib.gunzipSync(zlib.gzipSync(s)).equals(s), `gzip, ${s.length} bytes`);
  }
  assert.throws(() => shimZlib.inflateRawSync(zlib.deflateRawSync(Buffer.alloc(5000)), { maxOutputLength: 100 }), /larger/);
});

test('the browser lock opens the PCs\' files, and the PCs open its', async () => {
  const code = 'ABCD-EFGH-JKLM-NPQR';
  const key = cloud.keyOf(code);
  assert.equal(await codec.keyOf(code), key, 'the same key from the same code');
  const body = { device: 'aaaa', entries: [['tags|t', 1, 'aaaa', ['study', 'مرحبا']]] };
  assert.deepEqual(await codec.unseal(cloud.seal(body, key), key), body);
  assert.deepEqual(cloud.unseal(Buffer.from(await codec.seal(body, key)), key), body);
  await assert.rejects(codec.unseal(cloud.seal(body, key), cloud.keyOf('ABCDEFGHJKLMNPQ2')));
});

// ---------------------------------------------------------------- the bundle, in a pretend browser

/** Google, as far as Onyx asks it: the token endpoint, the Drive app folder, empty calendars and task lists. */
function fakeGoogle(files) {
  let n = 100;
  const seen = [];
  const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  const parts = (buf, type) => {
    const boundary = /boundary=([^;]+)/.exec(type)[1];
    const text = Buffer.from(buf).toString('latin1');
    const chunks = text.split(`--${boundary}`).slice(1, -1).map((c) => c.slice(c.indexOf('\r\n\r\n') + 4, -2));
    return { meta: JSON.parse(Buffer.from(chunks[0], 'latin1').toString('utf8')), data: Buffer.from(chunks[1], 'latin1') };
  };
  async function fetchFake(url, init = {}) {
    const u = new URL(url);
    const method = (init.method || 'GET').toUpperCase();
    seen.push(`${method} ${u.hostname}${u.pathname}`);
    if (u.hostname === 'oauth2.googleapis.com') return json({ access_token: 'fresh', expires_in: 3600 });
    const m = /^\/(upload\/)?drive\/v3\/files(?:\/([^/]+))?$/.exec(u.pathname);
    if (m) {
      const [, upload, id] = m;
      const type = Object.entries(init.headers || {}).find(([k]) => k.toLowerCase() === 'content-type')?.[1] || '';
      if (method === 'GET' && !id) return json({ files: [...files.values()].map(({ data, ...f }) => f) });
      if (method === 'GET' && u.searchParams.get('alt') === 'media') return new Response(files.get(id).data);
      if (method === 'POST' && upload) { const p = parts(init.body, type); const fid = `f${++n}`; files.set(fid, { id: fid, name: p.meta.name, appProperties: p.meta.appProperties, modifiedTime: new Date().toISOString(), data: p.data }); return json({ id: fid }); }
      if (method === 'PATCH' && upload) { const p = parts(init.body, type); const f = files.get(id); Object.assign(f, { appProperties: { ...f.appProperties, ...p.meta.appProperties }, data: p.data, modifiedTime: new Date().toISOString() }); return json({ id }); }
      if (method === 'PATCH') { Object.assign(files.get(id).appProperties, JSON.parse(init.body).appProperties); return json({ id }); }
      if (method === 'DELETE') { files.delete(id); return new Response(null, { status: 204 }); }
    }
    if (/googleapis\.com$/.test(u.hostname)) return json({ items: [] });
    return json({ error: { message: 'not here' } }, 404);
  }
  return { fetchFake, seen };
}

function browser(fetchFake) {
  const ctx = {
    console, setTimeout, clearTimeout, setInterval, clearInterval, queueMicrotask, structuredClone,
    TextEncoder, TextDecoder, URL, URLSearchParams, atob, btoa, crypto: globalThis.crypto,
    Response, Blob, CompressionStream, DecompressionStream, AbortController, Promise, Date, Math, JSON,
    fetch: fetchFake,
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(build().text, ctx, { filename: 'engine.js' });
  // Its answers are made in the pretend browser's own world: compared here as plain JSON.
  const plain = (v) => (v == null ? v : JSON.parse(JSON.stringify(v)));
  const e = ctx.OnyxEngine;
  return { ...e, info: async () => plain(await e.info()), join: async (...a) => plain(await e.join(...a)), call: async (...a) => plain(await e.call(...a)) };
}

/** A PC with Drive sync on, kept apart from this process's own store (as cloud.test.js does). */
function pcWith(files) {
  const data = {
    settings: { hidden: {}, hour12: true, weekStart: 1, defaultCalendar: '', pi: { enabled: true }, magic: { start: '08:00', end: '21:00' } },
    accounts: [{ id: 'g-pc', provider: 'google', label: 'me@gmail.com' }], calendars: {}, google: { clientId: 'cid.apps.googleusercontent.com' }, microsoft: { clientId: '' },
    local: { calendars: [{ id: 'blocks', name: 'Time Blocks', color: '#8b7cff' }], events: [] },
    piLinks: {}, tags: { 'local/blocks/e1': ['study'] }, tagColors: {}, memos: {}, notes: [{ id: 'n1', title: 'From the PC', body: '' }], pins: [],
    notion: null, goals: [], repeats: {}, repeatSpawned: {}, pomodoro: {}, madeHere: {}, news: null, desktops: {},
    secrets: { googleClientSecret: 'secret', tokens: { 'g-pc': { access: 'a', refresh: 'r', expires: Date.now() + 3600e3 } }, mcpToken: 'x'.repeat(20), notionToken: '', group: null },
  };
  const r = sync.createReplica(() => data, () => {});
  r.meta().device = '0aaa';
  r.track();
  const drive = {
    list: async () => [...files.values()].map(({ data: d, ...f }) => structuredClone(f)),
    download: async (id) => files.get(id).data,
    create: async (meta, buf) => { const id = `p${files.size + 1}`; files.set(id, { id, name: meta.name, appProperties: meta.appProperties, modifiedTime: new Date().toISOString(), data: buf }); return { id }; },
    update: async (id, meta, buf) => { Object.assign(files.get(id), { appProperties: { ...files.get(id).appProperties, ...meta.appProperties }, data: buf, modifiedTime: new Date().toISOString() }); return { id }; },
    patch: async (id, meta) => { Object.assign(files.get(id).appProperties, meta.appProperties); return { id }; },
    remove: async (id) => { files.delete(id); },
  };
  const c = cloud.createCloud({ getData: () => data, save: () => {}, replica: r, adoptAccounts: sync.adoptAccounts, driveFor: () => drive, hostname: () => 'DESKTOP' });
  return { data, r, c };
}

test('the engine joins a PC through Drive, and their changes reach each other', async () => {
  const files = new Map();
  const pc = pcWith(files);
  await pc.c.enable('me@gmail.com');
  const code = pc.c.code();
  const blob = await pc.c.handoff();
  assert.ok(!Buffer.from(blob, 'base64url').toString('latin1').includes('secret'), 'the hand-off is locked');

  const google = fakeGoogle(files);
  const engine = browser(google.fetchFake);
  assert.equal(await engine.boot(), false, 'not set up yet');
  await assert.rejects(engine.join(blob, 'ABCD-EFGH-JKLM-NPQR'), /does not match/);

  const info = await engine.join(blob, code);
  assert.equal(info.on, true);
  assert.equal(info.account, 'me@gmail.com');
  assert.deepEqual(info.pcs.map((p) => p.name), ['DESKTOP']);
  assert.equal(files.size, 2, 'its own file went up beside the PC\'s');
  assert.ok([...files.values()].some((f) => /^onyx-sync-phone-[0-9a-f]{12}\.bin$/.test(f.name)));

  // What the PC keeps is here: its settings, notes and tags.
  const state = await engine.call('state');
  assert.equal(state.standalone, true);
  assert.equal(state.settings.weekStart, 1);
  assert.ok(state.calendars.some((c) => c.id === 'local/blocks'));
  assert.ok(JSON.stringify(await engine.call('globe')).includes('From the PC'), 'the PC\'s notes, on the globe');

  // A block made here, while the PC is off, reaches it through Drive.
  const start = new Date(Date.now() + 86400e3); start.setMinutes(0, 0, 0);
  const made = await engine.call('event:create', [{ title: 'Made on the phone', start: start.toISOString(), end: new Date(start.getTime() + 3600e3).toISOString(), calendarId: 'local/blocks', tags: ['phone'] }]);
  assert.equal(made.title, 'Made on the phone');
  await engine.syncNow();
  await pc.c.sync();
  assert.ok(pc.data.local.events.some((e) => e.title === 'Made on the phone'), 'the PC has the block');
  assert.deepEqual(pc.data.tags[made.id], ['phone'], 'and its tags');

  // And the other way: the PC's next change comes down.
  pc.data.tags['local/blocks/e9'] = ['from-pc'];
  await pc.c.sync();
  await engine.syncNow();
  const after = await engine.call('state');
  assert.ok(after.tags.some((t) => t.name === 'from-pc'), 'the PC\'s new tag is here');

  // Things only a PC can do say so.
  await assert.rejects(engine.call('news', [false]), /needs Onyx on your PC/);

  // Turned off: its file leaves Drive.
  await engine.leave();
  assert.equal(files.size, 1);
  assert.equal(await engine.boot(), false);
});

test('the PC only hands off with Drive sync on and the account signed in', async () => {
  const files = new Map();
  const pc = pcWith(files);
  await assert.rejects(pc.c.handoff(), /Turn on sync/);
  await pc.c.enable('me@gmail.com');
  delete pc.data.secrets.tokens['g-pc'].refresh;
  await assert.rejects(pc.c.handoff(), /Sign in to me@gmail.com again/);
});

// ---------------------------------------------------------------- set up with no PC at all

/** Google that also signs in: a code from its page is turned into a lasting sign-in, and renewals are seen. */
function signingGoogle(files, { lasts = 3600 } = {}) {
  const g = fakeGoogle(files);
  const posts = [];
  const idToken = (email) => ['e30', Buffer.from(JSON.stringify({ email })).toString('base64url'), 'sig'].join('.');
  const fetchFake = async (url, init = {}) => {
    const u = new URL(url);
    if (u.hostname === 'oauth2.googleapis.com') {
      const body = Object.fromEntries(new URLSearchParams(String(init.body)));
      posts.push(body);
      if (body.grant_type === 'authorization_code') {
        if (body.code !== 'good-code' || !body.code_verifier || !body.client_secret) return new Response(JSON.stringify({ error: 'invalid_grant' }), { status: 400 });
        return new Response(JSON.stringify({ access_token: 'first', refresh_token: 'lasting', expires_in: lasts, id_token: idToken('me@gmail.com'), scope: 'openid email' }), { status: 200 });
      }
    }
    return g.fetchFake(url, init);
  };
  return { fetchFake, posts };
}
const WEB_CLIENT = JSON.stringify({ web: { client_id: 'web123.apps.googleusercontent.com', client_secret: 'web-secret', redirect_uris: ['https://example.github.io/onyx/'] } });

async function signIn(engine, redirect = 'https://example.github.io/onyx/') {
  const url = new URL(await engine.signInStart({ client: WEB_CLIENT, redirect, back: 'web' }));
  assert.equal(url.hostname, 'accounts.google.com');
  assert.equal(url.searchParams.get('client_id'), 'web123.apps.googleusercontent.com');
  assert.equal(url.searchParams.get('redirect_uri'), redirect);
  assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
  assert.match(url.searchParams.get('scope'), /drive\.appdata/);
  const state = url.searchParams.get('state');
  assert.match(state, /^web\./);
  return JSON.parse(JSON.stringify(await engine.signInFinish({ code: 'good-code', state })));
}

test('with no PC: a browser starts it, a phone joins with its code, then a PC does too', async () => {
  const files = new Map();
  const google = signingGoogle(files);

  // The first device: signed in, it makes the sync code, and its file goes up.
  const web = browser(google.fetchFake);
  await assert.rejects(web.signInFinish({ code: 'good-code', state: 'web.nope' }), /not started here/);
  await assert.rejects(web.signInStart({ client: '{"web":{"client_id":"x"}}', redirect: 'https://example.github.io/onyx/' }), /client ID/);
  const first = await signIn(web);
  assert.equal(first.on, true);
  assert.equal(first.account, 'me@gmail.com');
  assert.match(first.code, /^[A-Z0-9]{4}(-[A-Z0-9]{4}){3}$/);
  assert.equal(files.size, 1);
  const exchange = google.posts.find((p) => p.grant_type === 'authorization_code');
  assert.equal(exchange.client_id, 'web123.apps.googleusercontent.com');
  assert.equal(exchange.redirect_uri, 'https://example.github.io/onyx/');

  const start = new Date(Date.now() + 86400e3); start.setMinutes(0, 0, 0);
  const made = await web.call('event:create', [{ title: 'Made on the web', start: start.toISOString(), end: new Date(start.getTime() + 3600e3).toISOString(), calendarId: 'local/blocks' }]);
  await web.syncNow();

  // A second device: signed in, it waits for the code; a wrong one is turned down, the right one opens it.
  const phone = browser(google.fetchFake);
  const second = await signIn(phone);
  assert.deepEqual([second.on, second.needsCode, second.account], [false, true, 'me@gmail.com']);
  assert.equal((await phone.info()).needsCode, true);
  await assert.rejects(phone.enterCode('ABCD-EFGH-JKLM-NPQR'), /does not open/);
  const joined = JSON.parse(JSON.stringify(await phone.enterCode(first.code)));
  assert.equal(joined.on, true);
  assert.equal(files.size, 2);
  const there = await phone.call('events', [new Date(Date.now() - 86400e3).toISOString(), new Date(Date.now() + 3 * 86400e3).toISOString()]);
  assert.ok(there.events.some((e) => e.title === 'Made on the web'), 'the browser\'s block is on the phone');

  // A PC, signed in with its own client, joins with the same code and gets it too.
  const pc = pcWith(files);
  await pc.c.enable('me@gmail.com');
  assert.equal(pc.c.info().state, 'needs-code');
  await pc.c.enterCode(first.code);
  assert.equal(pc.c.info().state, 'ok');
  assert.ok(pc.data.local.events.some((e) => e.id === made.id.split('/').pop() || e.title === 'Made on the web'), 'the PC has the block');
  for (const t of Object.values(pc.data.secrets.tokens)) {
    if (t.client) assert.equal(t.client.id, 'web123.apps.googleusercontent.com', 'a sign-in from the web carries its own client');
  }
});

test('a sign-in made in the browser is renewed with the client it was made with', async () => {
  const files = new Map();
  const google = signingGoogle(files, { lasts: 1 }); // its access runs out at once
  const web = browser(google.fetchFake);
  await signIn(web);
  const renewals = google.posts.filter((p) => p.grant_type === 'refresh_token');
  assert.ok(renewals.length > 0, 'renewed for the first sync');
  for (const r of renewals) assert.deepEqual([r.client_id, r.client_secret, r.refresh_token], ['web123.apps.googleusercontent.com', 'web-secret', 'lasting']);
});

test('Google saying no, and a sign-in that took too long, are said plainly', async () => {
  const google = signingGoogle(new Map());
  const web = browser(google.fetchFake);
  const url = new URL(await web.signInStart({ client: WEB_CLIENT, redirect: 'https://example.github.io/onyx/', back: 'app' }));
  const state = url.searchParams.get('state');
  assert.match(state, /^app\./, 'started in the phone app: the web page hands it back');
  await assert.rejects(web.signInFinish({ error: 'access_denied', state }), /cancelled/);
  assert.equal((await web.info()).on, false);
});
