// Linked desktops: the bookkeeping (two copies of the data, swapping changes), and a real
// join and sync between this process and a second one over HTTP.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { fork } = require('child_process');
const store = require('../src/main/store');
const sync = require('../src/main/sync');

store.save = () => {};

const blankData = () => ({
  settings: { hidden: {}, hour12: true, weekStart: 0, defaultCalendar: '', pi: { enabled: true } },
  accounts: [], calendars: {}, google: { clientId: '' }, microsoft: { clientId: '' },
  local: { calendars: [], events: [] }, piLinks: {}, tags: {}, tagColors: {}, memos: {}, notes: [], pins: [],
  notion: null, goals: [], repeats: {}, repeatSpawned: {}, pomodoro: {}, madeHere: {}, news: null, desktops: {},
  secrets: { googleClientSecret: '', tokens: {}, mcpToken: 'x'.repeat(20), notionToken: '', group: null },
});

function pair() {
  let clock = 1000;
  const now = () => (clock += 10);
  const a = { data: blankData() }, b = { data: blankData() };
  a.r = sync.createReplica(() => a.data, () => {}, now);
  b.r = sync.createReplica(() => b.data, () => {}, now);
  a.r.meta().device = 'aaaa'; b.r.meta().device = 'bbbb';
  a.r.track(); b.r.track(); // as each does when it starts
  // One round trip, the way exchange() and serve() use since()/apply().
  const swap = (from, to) => { from.r.track(); to.r.track(); to.r.apply(from.r.since(0)); from.r.apply(to.r.since(0)); };
  return { a, b, swap };
}

test('changes on one desktop reach the other, deletions too', () => {
  const { a, b, swap } = pair();
  a.data.tags['g1/tl~x/t1'] = ['study'];
  a.data.notes.push({ id: 'n1', title: 'Plan', body: '' });
  a.data.google = { clientId: 'cid.apps.googleusercontent.com' };
  a.data.secrets.googleClientSecret = 'shh';
  swap(a, b);
  assert.deepEqual(b.data.tags['g1/tl~x/t1'], ['study']);
  assert.equal(b.data.notes[0].title, 'Plan');
  assert.equal(b.data.google.clientId, 'cid.apps.googleusercontent.com');
  assert.equal(b.data.secrets.googleClientSecret, 'shh');

  b.data.notes = [];
  delete b.data.tags['g1/tl~x/t1'];
  swap(b, a);
  assert.equal(a.data.notes.length, 0);
  assert.equal(a.data.tags['g1/tl~x/t1'], undefined);
});

test('the newer change wins, whichever desktop it came from', () => {
  const { a, b, swap } = pair();
  a.data.memos.e1 = 'first';
  swap(a, b);
  a.r.track();
  b.data.memos.e1 = 'second';
  b.r.track(); // later
  a.data.memos.e1 = 'third';
  a.r.track(); // later still
  swap(b, a);
  assert.equal(a.data.memos.e1, 'third');
  assert.equal(b.data.memos.e1, 'third');
});

test('files pinned from one PC stay on it; web pins are shared', () => {
  const { a, b, swap } = pair();
  a.data.pins.push({ id: 'local/abc', source: 'local', path: 'C:\\x.pdf', title: 'x.pdf' }, { id: 'w1', source: 'web', url: 'https://a.b', title: 'A' });
  b.data.pins.push({ id: 'local/def', source: 'local', path: 'D:\\y', title: 'y' });
  swap(a, b);
  assert.deepEqual(b.data.pins.map((p) => p.id).sort(), ['local/def', 'w1']);
  assert.deepEqual(a.data.pins.map((p) => p.id).sort(), ['local/abc', 'w1']);
});

test('joining takes the other copy, but never an empty value over a filled one', () => {
  const { a, b } = pair();
  b.data.settings.hour12 = false;      // the joining PC's own choice...
  b.data.google = { clientId: 'mine' }; // ...and credentials the group lacks
  b.r.track();
  a.data.settings.hour12 = true;
  a.r.track();
  a.data.settings.hour12 = true; // stamped earlier than b's
  const { touched } = b.r.apply(a.r.since(0), { force: true });
  assert.equal(b.data.settings.hour12, true, 'the group wins');
  assert.equal(b.data.google.clientId, 'mine', 'blank does not win');
  assert.ok(touched.has('settings.hour12'));
  // ...and the kept value is passed back on.
  a.r.apply(b.r.since(0));
  assert.equal(a.data.google.clientId, 'mine');
});

test('a sign-in on both desktops is merged under one id', () => {
  const data = blankData();
  data.accounts = [{ id: 'gmine', provider: 'google', label: 'me@gmail.com' }];
  data.secrets.tokens.gmine = { refresh: 'r' };
  data.tags['gmine/tl~list/t1'] = ['work'];
  data.settings.pi = { taskList: 'gmine/tl~list' };
  sync.adoptAccounts(data, [['accounts|gtheirs', 1, 'aaaa', { id: 'gtheirs', provider: 'google', label: 'me@gmail.com' }]]);
  assert.equal(data.accounts[0].id, 'gtheirs');
  assert.ok(data.secrets.tokens.gtheirs);
  assert.deepEqual(data.tags['gtheirs/tl~list/t1'], ['work']);
  assert.equal(data.settings.pi.taskList, 'gtheirs/tl~list');
});

test('a token that would lock the phone out is never taken', () => {
  const { a, b } = pair();
  b.r.apply([['secrets.mcpToken|', 1e15, 'zzzz', '']]);
  assert.equal(b.data.secrets.mcpToken, 'x'.repeat(20));
});

// ---------------------------------------------------------------- over the network

test('a second desktop joins with the code, gets everything, and keeps in step', async (t) => {
  const mcp = require('../src/main/mcp');
  const d = store.data;
  d.settings.mcp = { enabled: true, port: 48911, lan: false };
  d.secrets.mcpToken = 'host-token-host-token-1234';
  d.google.clientId = 'host-client.apps.googleusercontent.com';
  d.secrets.googleClientSecret = 'host-secret';
  d.accounts = [{ id: 'ghost1', provider: 'google', label: 'me@gmail.com' }];
  d.secrets.tokens = { ghost1: { access: 'a', refresh: 'host-refresh', expires: 0 } };
  d.tags = { 'ghost1/tl~list/t9': ['arabic'] };
  await mcp.start(() => {});
  sync.start(() => {});
  t.after(() => mcp.stop());
  const { invite } = sync.newInvite();
  assert.match(invite.code, /^[A-Z2-9]{4}-[A-Z2-9]{4}$/);

  const peer = fork(path.join(__dirname, 'fixtures', 'sync-peer.js'), [], { stdio: ['ignore', 'inherit', 'inherit', 'ipc'] });
  t.after(() => peer.kill());
  const ask = (msg) => new Promise((resolve, reject) => {
    peer.once('message', (m) => (m.error ? reject(new Error(m.error)) : resolve(m)));
    peer.send(msg);
  });

  await assert.rejects(ask({ do: 'join', address: '127.0.0.1:48911', code: 'AAAA-AAAA' }), /Wrong code/);
  const joined = await ask({ do: 'join', address: '127.0.0.1:48911', code: invite.code.toLowerCase() });
  assert.equal(joined.google.clientId, 'host-client.apps.googleusercontent.com');
  assert.equal(joined.secret, 'host-secret');
  assert.equal(joined.token, 'host-token-host-token-1234', 'one token for both, so the phone can use either');
  assert.deepEqual(joined.accounts, ['ghost1'], 'the same Google account, once');
  assert.equal(joined.refresh, 'host-refresh');
  assert.deepEqual(joined.tags['ghost1/tl~list/t9'], ['arabic']);
  assert.deepEqual(joined.tags['ghost1/tl~list/t1'], ['peer-tag'], 'its own tag, moved to the shared account id');
  assert.deepEqual(store.data.tags['ghost1/tl~list/t1'], ['peer-tag'], 'and the host has it too');
  assert.equal(sync.info().invite, null, 'the code works once');

  // A change here reaches the other desktop on its next sync.
  store.data.notes.push({ id: 'n-host', title: 'From the host', body: '' });
  const after = await ask({ do: 'sync' });
  assert.ok(after.notes.some((n) => n.id === 'n-host'));
  assert.equal(after.desktops.length, 2);
  assert.ok(after.desktops.find((x) => !x.self).online);
  // Exactly one of the two does the once-only jobs.
  assert.notEqual(sync.leads(), after.leads);
});
