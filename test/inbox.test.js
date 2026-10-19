// Tasks that arrive from outside Onyx wait in the Magic add inbox; planning one sets the real
// task's time, length and travel (no copy), and undo puts it back. Run against a stand-in Google.

const test = require('node:test');
const assert = require('node:assert/strict');
const store = require('../src/main/store');
const google = require('../src/main/providers/google');
const hub = require('../src/main/hub');
const magic = require('../src/main/magic');

store.save = () => {};

const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const day = (offset, h = 0, m = 0) => { const t = new Date(); return new Date(t.getFullYear(), t.getMonth(), t.getDate() + offset, h, m); };
const gone = () => Object.assign(new Error('Not found'), { status: 404 });

const fake = { tasks: new Map(), seq: 0 };
google.events = async () => [];
google.tasks = async (req, list) => [...fake.tasks.values()].filter((t) => t.list === list && !t.done);
google.createTask = async (req, list, d) => {
  const t = { rawId: `t${++fake.seq}`, list, notes: '', due: null, done: false, ...d };
  fake.tasks.set(t.rawId, t);
  return t;
};
google.updateTask = async (req, list, id, d) => {
  if (!fake.tasks.has(id)) throw gone();
  return Object.assign(fake.tasks.get(id), d);
};
google.deleteTask = async (req, list, id) => { fake.tasks.delete(id); };
google.getTask = async (req, list, id) => fake.tasks.get(id) || null;

/** Somebody else's app adds a task to the list (not through Onyx). */
const arrives = (title, extra = {}) => {
  const t = { rawId: `x${++fake.seq}`, list: 'tasks', title, notes: '', due: null, done: false, ...extra };
  fake.tasks.set(t.rawId, t);
  return t;
};
const inbox = async () => (await hub.getTasks({ force: true })).inbox;
const titleOf = async (id) => (await hub.getTasks({ force: true })).tasks.find((t) => t.id === id)?.title;

function reset() {
  fake.tasks.clear();
  const d = store.data;
  d.accounts = [{ id: 'g1', provider: 'google', label: 'me@example.com' }];
  d.calendars = { g1: [
    { rawId: 'primary', kind: 'calendar', name: 'Personal', color: '#4aa8ff', writable: true },
    { rawId: 'tasks', kind: 'tasklist', name: 'My Tasks', color: '#f5b83d', writable: true },
  ] };
  d.local.events = [];
  d.piLinks = {};
  d.madeHere = {};
  d.inboxItems = {};
  d.inboxLists = {};
  d.taskMinutes = {};
  d.leaveBy = {};
  d.pomodoro = {};
  d.backburner = {};
  d.settings.hidden = {};
  d.settings.magic = { home: 'Home', mode: 'drive', start: '08:00', end: '21:00', lunch: true };
  d.secrets.anthropicKey = '';
  hub.invalidate();
}

test('the first read of a list only learns what is there; later arrivals wait in the inbox', async () => {
  reset();
  arrives('Old backlog item');
  assert.deepEqual(await inbox(), [], 'what was already there is not new');
  const fresh = arrives('Buy stamps');
  const ids = await inbox();
  assert.equal(ids.length, 1);
  assert.match(ids[0], /^g1\/tl~tasks\//);
  const tasks = (await hub.getTasks({ force: true })).tasks;
  assert.equal(tasks.find((t) => t.id === ids[0]).title, fresh.title);
  assert.deepEqual(await inbox(), ids, 'it stays until it is dealt with');
});

test('tasks made in Onyx, ones with a time already, and Pi copies are not for the inbox; another app\'s through MCP is', async () => {
  reset();
  await inbox();
  await hub.createTask({ title: 'Typed in Onyx' });
  arrives('Dentist 3pm', { due: ymd(day(1)) });
  const viaMcp = await hub.createTask({ title: 'From an assistant', inbox: 'mcp' });
  const ids = await inbox();
  assert.deepEqual(ids, [viaMcp.id]);
});

test('a thought parked with "Not now" in Hyperfocus waits in the Magic add inbox, saying where it came from', async () => {
  reset();
  await inbox();
  const parked = await hub.createTask({ title: 'Look up the landlord\'s email', inbox: 'hyperfocus' });
  assert.deepEqual(await inbox(), [parked.id]);
  assert.equal(store.data.inboxItems[parked.id].from, 'hyperfocus');
});

test('dismissing leaves the inbox for good, and finishing or deleting a task tidies it away', async () => {
  reset();
  await inbox();
  const a = arrives('Call plumber'), b = arrives('Email Sam');
  let ids = await inbox();
  assert.equal(ids.length, 2);
  hub.dismissInbox(ids[0]);
  ids = await inbox();
  assert.equal(ids.length, 1);
  fake.tasks.delete(b.rawId);
  ids = await inbox();
  assert.deepEqual(ids, []);
  assert.equal(Object.keys(store.data.inboxItems).some((k) => k.endsWith(`/${Buffer.from(b.rawId).toString('base64url')}`)), false, 'the deleted one is forgotten');
  void a;
});

test('planning a task sets its time, length and travel on the task itself; undo puts it back', async () => {
  reset();
  await inbox();
  arrives('Pick up parcel', { due: ymd(day(1)) });
  const [id] = await inbox();
  const start = day(1, 15, 0);
  const { task, prev } = await hub.planTask(id, { start: start.toISOString(), minutes: 45, leaveBy: 15 });
  assert.equal(task.minutes, 45);
  assert.equal(task.leaveBy, 15);
  assert.match(await titleOf(id), /3(:00)? ?pm|15:00/i, 'its time is in its name, as when it is dragged on the calendar');
  assert.deepEqual(await inbox(), [], 'planned: out of the inbox');

  // On the calendar it is one block, as long as it was planned, with its travel.
  const { events } = await hub.getEvents(day(1).toISOString(), day(2).toISOString());
  const block = events.find((e) => e.id === id);
  assert.ok(block && !block.allDay);
  assert.equal((new Date(block.end) - new Date(block.start)) / 60000, 45);
  assert.equal(block.leaveBy, 15);
  assert.equal(events.filter((e) => /Pick up parcel/.test(e.title)).length, 1, 'no second copy');

  await hub.unplanTask(id, prev);
  assert.equal(await titleOf(id), 'Pick up parcel');
  assert.equal(store.data.taskMinutes[id], undefined);
  assert.equal(store.data.leaveBy[id], undefined);
  assert.deepEqual(await inbox(), [id], 'back in the inbox');
});

test('a timed task can be resized: new start and length', async () => {
  reset();
  await inbox();
  const t = await hub.createTask({ title: 'Write report', due: ymd(day(1)) });
  await hub.moveTask(t.id, { start: day(1, 10, 0).toISOString() });
  const out = await hub.resizeTask(t.id, { start: day(1, 9, 30).toISOString(), minutes: 90 });
  assert.equal(out.minutes, 90);
  const { events } = await hub.getEvents(day(1).toISOString(), day(2).toISOString());
  const block = events.find((e) => e.id === t.id);
  assert.equal(new Date(block.start).getHours() * 60 + new Date(block.start).getMinutes(), 9 * 60 + 30);
  assert.equal((new Date(block.end) - new Date(block.start)) / 60000, 90);
});

test('Magic add plans the picked inbox tasks along with what was typed, each keeping its task id', async () => {
  reset();
  await inbox();
  arrives('Buy stamps'); arrives('Call the bank');
  const picked = await inbox();
  const r = await magic.planDay('Laundry', ymd(day(2)), {}, picked);
  assert.equal(r.source, 'local');
  assert.equal(r.blocks.length, 3);
  const refs = r.blocks.map((b) => b.ref).filter(Boolean).sort();
  assert.deepEqual(refs, [...picked].sort());
  // only inbox tasks, nothing typed, is fine too
  const only = await magic.planDay('', ymd(day(2)), {}, picked);
  assert.equal(only.blocks.length, 2);
  await assert.rejects(() => magic.planDay('', ymd(day(2)), {}, []), /Describe what/);
});

test('Magic add with Claude: arrived tasks are tagged, and mapped back to their ids', async () => {
  reset();
  store.data.secrets.anthropicKey = 'sk-ant-test-key-0000000000000000';
  await inbox();
  arrives('Buy stamps'); arrives('Call the bank');
  const picked = await inbox();
  const real = global.fetch;
  let sent = '';
  global.fetch = async (url, init) => {
    sent = JSON.parse(init.body).messages[0].content;
    return { ok: true, status: 200, json: async () => ({ content: [{ type: 'text', text: JSON.stringify({
      tasks: [
        { title: 'Call the bank', minutes: 10, place: null, when: 'any', kind: 'call', ref: 't2', why: 'Quick call' },
        { title: 'Buy stamps', minutes: 15, place: 'Post office', when: 'afternoon', kind: 'errand', ref: 't1', why: 'Short stop' },
        { title: 'Invented', minutes: 15, place: null, when: 'any', kind: 'other', ref: 't9' },
      ], travel: [{ from: 'Home', to: 'Post office', minutes: 10 }],
    }) }] }) };
  };
  try {
    const r = await magic.planDay('', ymd(day(2)), {}, picked);
    assert.match(sent, /\[t1\] Buy stamps/);
    assert.match(sent, /\[t2\] Call the bank/);
    assert.equal(r.source, 'claude');
    const byTitle = Object.fromEntries(r.blocks.map((b) => [b.title, b.ref]));
    assert.equal(byTitle['Buy stamps'], picked[0]);
    assert.equal(byTitle['Call the bank'], picked[1]);
    assert.equal(byTitle.Invented, undefined, 'a tag Claude made up is not a task of yours');
  } finally { global.fetch = real; }
});

// ---- onyx://task: another app hands over a task (Tamkeen's review, say)
const { parseTaskLink } = require('../src/main/deeplink');
const link = (q) => `onyx://task?${new URLSearchParams(q)}`;

test('a task link is read strictly: title needed, minutes 1-600, a real day, a safe id and app name', () => {
  const ok = parseTaskLink('onyx://task?title=Tamkeen%20review%3A%2042%20cards&minutes=18&due=2026-10-18&id=tamkeen-review-2026-10-18&from=tamkeen&n=123');
  assert.deepEqual(ok, { title: 'Tamkeen review: 42 cards', minutes: 18, due: '2026-10-18', notes: '', id: 'tamkeen-review-2026-10-18', from: 'tamkeen' });
  assert.equal(parseTaskLink('onyx://task?minutes=5'), null, 'no title');
  assert.equal(parseTaskLink('onyx://pair?a=1&t=2'), null, 'not a task link');
  assert.equal(parseTaskLink('https://example.com/?title=x'), null);
  const odd = parseTaskLink(link({ title: `  ${'x'.repeat(300)}  `, minutes: '9999', due: '2026-13-45', id: 'bad id!', from: 'Evil App', notes: 'n'.repeat(5000) }));
  assert.equal(odd.title.length, 120);
  assert.equal(odd.minutes, 600);
  assert.equal(odd.due, null);
  assert.equal(odd.id, null);
  assert.equal(odd.from, 'app');
  assert.equal(odd.notes.length, 1000);
  assert.equal(parseTaskLink(link({ title: 'x', minutes: '0' })).minutes, null);
  assert.equal(parseTaskLink(link({ title: 'x', minutes: 'abc' })).minutes, null);
  assert.equal(parseTaskLink('onyx://task/?title=Slash').title, 'Slash', 'a trailing slash is fine');
});

test('a task link makes a task for Magic add with the length given; the same id again updates it', async () => {
  reset();
  await inbox();
  const a = await hub.receiveTask(link({ title: 'Tamkeen review: 42 cards', minutes: '18', due: ymd(day(0)), id: 'tamkeen-review-1', from: 'tamkeen' }));
  assert.equal(a.created, true);
  assert.equal(a.minutes, 18);
  assert.deepEqual(await inbox(), [a.taskId]);
  const tasks = (await hub.getTasks({ force: true })).tasks;
  const t = tasks.find((x) => x.id === a.taskId);
  assert.equal(t.minutes, 18);
  assert.equal(t.from, 'tamkeen');
  assert.equal(t.date, ymd(day(0)));

  // sent again (more cards due): the same task, updated, not a second one
  const b = await hub.receiveTask(link({ title: 'Tamkeen review: 60 cards', minutes: '25', id: 'tamkeen-review-1', from: 'tamkeen' }));
  assert.equal(b.created, false);
  assert.equal(b.taskId, a.taskId);
  const after = (await hub.getTasks({ force: true })).tasks.filter((x) => /Tamkeen review/.test(x.title));
  assert.equal(after.length, 1);
  assert.equal(after[0].title, 'Tamkeen review: 60 cards');
  assert.equal(after[0].minutes, 25);

  // "Not now", then sent again: it is wanted again
  hub.dismissInbox(a.taskId);
  assert.deepEqual(await inbox(), []);
  await hub.receiveTask(link({ title: 'Tamkeen review: 60 cards', minutes: '25', id: 'tamkeen-review-1', from: 'tamkeen' }));
  assert.deepEqual(await inbox(), [a.taskId]);

  // no id: each send is its own task
  const c = await hub.receiveTask(link({ title: 'Loose task', from: 'tamkeen' })), d = await hub.receiveTask(link({ title: 'Loose task', from: 'tamkeen' }));
  assert.notEqual(c.taskId, d.taskId);
});

test('Magic add plans a link task for the length it was given, and once planned a resend leaves its time alone', async () => {
  reset();
  await inbox();
  const sent = await hub.receiveTask(link({ title: 'Tamkeen review: 42 cards', minutes: '18', due: ymd(day(2)), id: 'r1', from: 'tamkeen' }));
  const r = await magic.planDay('', ymd(day(2)), {}, [sent.taskId]);
  assert.equal(r.blocks.length, 1);
  assert.equal(r.blocks[0].ref, sent.taskId);
  assert.equal(r.blocks[0].minutes, 20, '18 minutes, to the 5');
  assert.equal(r.blocks[0].start === r.blocks[0].end, false);

  await hub.planTask(sent.taskId, { start: r.blocks[0].start, minutes: 20, leaveBy: 0 });
  const again = await hub.receiveTask(link({ title: 'Tamkeen review: 42 cards', minutes: '18', due: ymd(day(5)), id: 'r1', from: 'tamkeen' }));
  assert.equal(again.created, false);
  const t = (await hub.getTasks({ force: true })).tasks.find((x) => x.id === sent.taskId);
  assert.ok(t.start, 'still planned at its time');
  assert.equal(t.date, ymd(day(2)), 'the day it was planned for');
});

test('too many links at once are held back', async () => {
  reset();
  await inbox();
  let failed = 0;
  for (let i = 0; i < 20; i++) {
    try { await hub.receiveTask(link({ title: `Spam ${i}`, from: 'spammer' })); } catch (err) { if (/Too many/.test(err.message)) failed++; }
  }
  assert.ok(failed >= 6, `held back ${failed}`);
});
