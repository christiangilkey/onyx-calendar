// Sync through Google Drive: several PCs against a pretend Drive app folder. Each keeps
// one locked file; the others read it and keep the newest of every piece.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const store = require('../src/main/store');
const sync = require('../src/main/sync');
const cloud = require('../src/main/cloud');

store.save = () => {};

const blankData = () => ({
  settings: { hidden: {}, hour12: true, weekStart: 0, defaultCalendar: '', pi: { enabled: true } },
  accounts: [{ id: 'g-here', provider: 'google', label: 'me@gmail.com' }], calendars: {}, google: { clientId: 'cid' }, microsoft: { clientId: '' },
  local: { calendars: [], events: [] }, piLinks: {}, tags: {}, tagColors: {}, memos: {}, notes: [], pins: [],
  notion: null, goals: [], repeats: {}, repeatSpawned: {}, pomodoro: {}, madeHere: {}, news: null, desktops: {},
  secrets: { googleClientSecret: 's', tokens: {}, mcpToken: 'x'.repeat(20), notionToken: '', group: null },
});

/** A Drive app folder in memory, shared by every PC in a test. */
function fakeDrive() {
  const files = new Map();
  let n = 0;
  const api = {
    files, calls: [], denied: false,
    list: async () => { api.calls.push('list'); if (api.denied) throw Object.assign(new Error('scope'), { code: 'scope' }); return [...files.values()].map(({ data, ...f }) => structuredClone(f)); },
    download: async (id) => { api.calls.push('download'); return files.get(id).data; },
    create: async (meta, data) => { api.calls.push('create'); const id = `f${++n}`; files.set(id, { id, name: meta.name, appProperties: meta.appProperties, modifiedTime: new Date().toISOString(), data }); return { id }; },
    update: async (id, meta, data) => { api.calls.push('update'); Object.assign(files.get(id), { appProperties: { ...files.get(id).appProperties, ...meta.appProperties }, data, modifiedTime: new Date().toISOString() }); return { id }; },
    patch: async (id, meta) => { api.calls.push('patch'); Object.assign(files.get(id).appProperties, meta.appProperties); return { id }; },
    remove: async (id) => { api.calls.push('remove'); files.delete(id); },
  };
  return api;
}

let clock = 1_000_000;
const now = () => (clock += 10);

function pc(name, drive, data = blankData()) {
  const me = { data, notified: [] };
  me.r = sync.createReplica(() => me.data, () => {}, now);
  me.r.meta().device = name;
  me.r.track();
  me.c = cloud.createCloud({
    getData: () => me.data, save: () => {}, replica: me.r, adoptAccounts: sync.adoptAccounts,
    driveFor: () => drive, notify: (t) => me.notified.push(t), hostname: () => name.toUpperCase(), now,
  });
  return me;
}

test('the first PC makes a sync code; the files are unreadable without it', async () => {
  const drive = fakeDrive();
  const a = pc('aaaa', drive);
  a.data.tags.t1 = ['study'];
  a.data.secrets.anthropicKey = 'sk-ant-secret';
  await a.c.enable('me@gmail.com');
  assert.equal(a.c.info().state, 'ok');
  assert.match(a.c.code(), /^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
  assert.equal(drive.files.size, 1);
  const file = [...drive.files.values()][0];
  assert.equal(file.name, 'onyx-sync-aaaa.bin');
  assert.ok(!file.data.toString('latin1').includes('sk-ant-secret'), 'locked, not plain');
  assert.throws(() => cloud.unseal(file.data, cloud.keyOf('ABCDEFGHJKLMNPQR')));
  assert.equal(cloud.unseal(file.data, cloud.keyOf(a.c.code())).entries.find((e) => e[0] === 'tags|t1')[3][0], 'study');
});

test('a second PC asks for the code, then joins and takes the first PC\'s copy', async () => {
  const drive = fakeDrive();
  const a = pc('aaaa', drive);
  a.data.tags.t1 = ['study'];
  a.data.settings.hour12 = false;
  a.data.goals.push({ id: 'goal1', title: 'Learn Arabic' });
  await a.c.enable('me@gmail.com');

  const b = pc('bbbb', drive);
  b.data.notes.push({ id: 'nb', title: 'Only on B', body: '' });
  await b.c.enable('me@gmail.com');
  assert.equal(b.c.info().state, 'needs-code');
  assert.equal(drive.files.size, 1, 'nothing goes up before joining');

  await assert.rejects(b.c.enterCode('ABCD-EFGH-JKLM-NPQR'), /does not open/);
  assert.equal(b.data.secrets.cloudKey, undefined);
  await b.c.enterCode(a.c.code().toLowerCase());
  assert.equal(b.c.info().state, 'ok');
  assert.deepEqual(b.data.tags.t1, ['study']);
  assert.equal(b.data.settings.hour12, false, 'the group\'s setting wins on joining');
  assert.equal(b.data.goals[0].title, 'Learn Arabic');
  assert.ok(b.notified.length, 'the window is told');

  await a.c.sync();
  assert.equal(a.data.notes.find((n) => n.id === 'nb')?.title, 'Only on B', 'what only B had reaches A');
  assert.deepEqual(a.c.info().peers.map((p) => p.name), ['BBBB']);
});

test('later changes and deletions go both ways; the newest wins', async () => {
  const drive = fakeDrive();
  const a = pc('aaaa', drive), b = pc('bbbb', drive);
  await a.c.enable('me@gmail.com');
  await b.c.enable('me@gmail.com');
  await b.c.enterCode(a.c.code());
  await a.c.sync();

  a.data.memos.m1 = 'from A';
  a.data.tags.gone = ['x'];
  await a.c.sync();
  await b.c.sync();
  assert.equal(b.data.memos.m1, 'from A');

  delete b.data.tags.gone;
  b.data.memos.m1 = 'B edited it later';
  await b.c.sync();
  await a.c.sync();
  assert.equal(a.data.memos.m1, 'B edited it later');
  assert.equal(a.data.tags.gone, undefined, 'the deletion arrived');
});

test('a third PC joins through the files of both others, and nothing loops', async () => {
  const drive = fakeDrive();
  const a = pc('aaaa', drive), b = pc('bbbb', drive), c = pc('cccc', drive);
  await a.c.enable('me@gmail.com');
  await b.c.enable('me@gmail.com');
  await b.c.enterCode(a.c.code());
  b.data.memos.fromB = 'yes';
  await b.c.sync();
  await c.c.enable('me@gmail.com');
  await c.c.enterCode(a.c.code());
  assert.equal(c.data.memos.fromB, 'yes');
  // Settled: one more round on each changes nothing and uploads nothing.
  await a.c.sync(); await b.c.sync(); await c.c.sync();
  await a.c.sync(); await b.c.sync(); await c.c.sync();
  drive.calls.length = 0;
  await a.c.sync(); await b.c.sync(); await c.c.sync();
  assert.ok(!drive.calls.includes('update') && !drive.calls.includes('download'), drive.calls.join(','));
});

test('joining keeps this PC\'s own sign-in to the sync account', async () => {
  const drive = fakeDrive();
  const a = pc('aaaa', drive);
  a.data.accounts = [{ id: 'g-A', provider: 'google', label: 'me@gmail.com' }];
  a.data.secrets.tokens['g-A'] = { access: 'old', refresh: 'old-refresh-without-drive' };
  await a.c.enable('me@gmail.com');
  const b = pc('bbbb', drive);
  b.data.accounts = [{ id: 'g-B', provider: 'google', label: 'me@gmail.com' }];
  b.data.secrets.tokens['g-B'] = { access: 'new', refresh: 'new-refresh-with-drive' };
  await b.c.enable('me@gmail.com');
  await b.c.enterCode(a.c.code());
  assert.deepEqual(b.data.accounts.map((x) => x.id), ['g-A'], 'one account, A\'s id');
  assert.equal(b.data.secrets.tokens['g-A'].refresh, 'new-refresh-with-drive');
  await a.c.sync();
  assert.equal(a.data.secrets.tokens['g-A'].refresh, 'new-refresh-with-drive', 'and A takes the newer sign-in');
});

test('no permission yet, no account, and turning it off', async () => {
  const drive = fakeDrive();
  const a = pc('aaaa', drive);
  drive.denied = true;
  await a.c.enable('me@gmail.com');
  assert.equal(a.c.info().state, 'needs-permission');
  drive.denied = false;
  await a.c.sync();
  assert.equal(a.c.info().state, 'ok');
  await assert.rejects(a.c.enable('nobody@gmail.com'), /Choose one/);
  a.data.accounts = [];
  await a.c.sync();
  assert.equal(a.c.info().state, 'no-account');
  a.data.accounts = [{ id: 'g-here', provider: 'google', label: 'me@gmail.com' }];
  await a.c.disable();
  assert.equal(a.c.info().on, false);
  assert.equal(drive.files.size, 0, 'its file is taken out');
  assert.ok(a.data.secrets.cloudCode, 'the code is kept for turning it back on');
});

test('the code travels with linked desktops, and Drive sync is wired in', () => {
  assert.equal(sync.SECTIONS['secrets.cloudCode'], 0);
  const main = fs.readFileSync(path.join(__dirname, '../src/main/accounts.js'), 'utf8');
  assert.match(main, /auth\/drive\.appdata'/);
  const s = fs.readFileSync(path.join(__dirname, '../src/main/sync.js'), 'utf8');
  assert.match(s, /cloud\(\)\.changed\(\);/);
  assert.match(fs.readFileSync(path.join(__dirname, '../src/renderer/app.js'), 'utf8'), /'Sync through Google Drive'/);
  // The code is never something the phone can ask for.
  assert.match(fs.readFileSync(path.join(__dirname, '../src/main/main.js'), 'utf8'), /'cloud:show-code': \(\) => cloud\.code\(\)/);
  assert.doesNotMatch(fs.readFileSync(path.join(__dirname, '../src/main/api.js'), 'utf8'), /cloud:show-code/);
});
