// The MCP tool magic_add: another app hands over a day's tasks and Magic add fits them around what is
// already there, either waiting for the user's review (the default) or placed at once. Run against a
// stand-in Google with no Claude key, so the plan comes from the words.

const test = require('node:test');
const assert = require('node:assert/strict');
const store = require('../src/main/store');
const google = require('../src/main/providers/google');
const hub = require('../src/main/hub');
const magic = require('../src/main/magic');
const plan = require('../src/main/magic-plan');
const mcp = require('../src/main/mcp');

store.save = () => {};

const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const day = (offset, h = 0, m = 0) => { const t = new Date(); return new Date(t.getFullYear(), t.getMonth(), t.getDate() + offset, h, m); };
const hm = (iso) => { const d = new Date(iso); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };

const fake = { tasks: new Map(), events: new Map(), seq: 0 };
google.tasks = async (req, list) => [...fake.tasks.values()].filter((t) => t.list === list && !t.done);
google.getTask = async (req, list, id) => fake.tasks.get(id) || null;
google.createTask = async (req, list, d) => {
  const t = { rawId: `t${++fake.seq}`, list, notes: '', due: null, done: false, ...d };
  fake.tasks.set(t.rawId, t);
  return t;
};
google.updateTask = async (req, list, id, d) => Object.assign(fake.tasks.get(id), d);
google.events = async (req, cal, start, end) => [...fake.events.values()].filter((e) => e.cal === cal && new Date(e.end) > new Date(start) && new Date(e.start) < new Date(end));
google.createEvent = async (req, cal, d) => {
  const e = { rawId: `e${++fake.seq}`, cal, notes: '', location: '', ...d };
  fake.events.set(e.rawId, e);
  return e;
};
google.deleteEvent = async (req, cal, id) => { fake.events.delete(id); };

function reset({ incoming } = {}) {
  fake.tasks.clear();
  fake.events.clear();
  const d = store.data;
  d.accounts = [{ id: 'g1', provider: 'google', label: 'me@example.com' }];
  d.calendars = { g1: [
    { rawId: 'primary', kind: 'calendar', name: 'Personal', color: '#4aa8ff', writable: true },
    { rawId: 'tasks', kind: 'tasklist', name: 'My Tasks', color: '#f5b83d', writable: true },
  ] };
  d.local.events = [];
  Object.assign(d, { piLinks: {}, madeHere: {}, inboxItems: {}, inboxLists: {}, taskMinutes: {}, leaveBy: {}, pomodoro: {}, backburner: {}, linkedTasks: {}, magicSent: {} });
  d.settings.hidden = {};
  d.settings.pi.enabled = false;
  d.settings.magic = { home: 'Home', mode: 'drive', start: '08:00', end: '21:00', lunch: true, ...(incoming ? { incoming } : {}) };
  d.secrets.anthropicKey = '';
  hub.invalidate();
  d.settings.defaultCalendar = hub.calendars().find((c) => c.name === 'Personal').id; // new blocks go to the stand-in Google
}

/** Calls magic_add the way another app does: JSON-RPC tools/call. Returns the parsed result, or throws its error text. */
async function magicAdd(args) {
  const reply = await mcp.rpc({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'magic_add', arguments: args } });
  const text = reply.result.content[0].text;
  if (reply.result.isError) throw new Error(text);
  return JSON.parse(text);
}

const busy = (title, from, to) => fake.events.set(title, { rawId: title, cal: 'primary', title, start: from.toISOString(), end: to.toISOString(), allDay: false, location: '', notes: '' });

// ---------------------------------------------------------------- the planner

test('a time of its own: kept when free, as near as fits when not', () => {
  const d = new Date(2026, 9, 19);
  const at = (h, m = 0) => new Date(2026, 9, 19, h, m).getTime();
  const tasks = plan.normalizeTasks([
    { title: 'Dinner', minutes: 45, kind: 'meal', preferred: '18:30', ref: 'a' },
    { title: 'Lunch', minutes: 30, kind: 'meal', preferred: '12:30', ref: 'b' },
    { title: 'Groceries', minutes: 45, kind: 'errand', place: 'Grocery store', ref: 'c' },
  ]);
  const r = plan.schedule([{ start: at(18), end: at(19), title: 'Call' }], tasks, { day: d, from: at(8), to: at(21), home: 'Home', lunch: true });
  const of = (t) => r.blocks.find((b) => b.title === t);
  assert.equal(r.unplaced.length, 0);
  assert.equal(hm(of('Lunch').start), '12:30', 'a meal is not pushed off lunch time by "keep lunch free"');
  assert.ok(of('Dinner').start >= at(19) && of('Dinner').start <= at(19, 10), `dinner moves just past the 18:00-19:00 call (got ${hm(of('Dinner').start)})`);
  assert.ok(of('Groceries').end <= at(18) || of('Groceries').start >= at(19, 45));
});

test('only the timed tasks from other apps widen the day; the rest keep to the chosen hours', () => {
  const d = new Date(2026, 9, 19);
  const at = (h, m = 0) => new Date(2026, 9, 19, h, m).getTime();
  const tasks = plan.normalizeTasks([
    { title: 'Lights out', minutes: 20, preferred: '22:30', ref: 'a' },
    { title: 'Prep oats', minutes: 10, ref: 'b' },
  ]);
  const span = plan.anchorSpan(tasks, d);
  assert.deepEqual(span, [at(22, 30), at(22, 50)]);
  // Busy all day: the untimed one cannot use the widened evening.
  const r = plan.schedule([{ start: at(8), end: at(21) }], tasks, { day: d, from: at(8), to: span[1], core: { from: at(8), to: at(21) }, home: 'Home' });
  assert.equal(hm(r.blocks.find((b) => b.title === 'Lights out').start), '22:30');
  assert.deepEqual(r.unplaced.map((u) => u.task.title), ['Prep oats']);
});

test('one line is one task: commas and dashes in a name do not split it, and meals get a time of day', () => {
  const t = plan.readLine('Dinner - lentil soup, rice and salad');
  assert.equal(t.title, 'Dinner - lentil soup, rice and salad');
  assert.deepEqual([t.kind, t.when], ['meal', 'evening']);
  assert.equal(plan.readLine('Breakfast: oats').when, 'morning');
  assert.equal(plan.readLine('Wind down').when, 'evening');
});

// ---------------------------------------------------------------- the tool

test('magic_add is listed next to the tools that were already there', async () => {
  const reply = await mcp.rpc({ jsonrpc: '2.0', id: 1, method: 'tools/list' });
  const names = reply.result.tools.map((t) => t.name);
  for (const n of ['get_agenda', 'create_time_block', 'create_task', 'find_free_time', 'magic_add']) assert.ok(names.includes(n), n);
  const schema = reply.result.tools.find((t) => t.name === 'magic_add').inputSchema;
  assert.deepEqual(schema.required, ['date', 'items']);
});

test('by default they wait in Magic add for review, with their lengths and times, and are planned around the day', async () => {
  reset();
  await hub.getTasks({ force: true }); // the list has been read once before
  const date = ymd(day(1));
  busy('Team sync', day(1, 18), day(1, 19));
  const r = await magicAdd({ date, source: 'food-planner', items: [
    { title: 'Dinner: lentil soup', minutes: 45, preferred: '18:30', id: 'meal-1', tags: ['food-planner'] },
    { title: 'Buy lentils', minutes: 20 },
  ] });
  assert.equal(r.mode, 'review');
  assert.equal(r.queued.length, 2);
  assert.match(r.message, /Magic add/);
  assert.equal(fake.events.size, 1, 'nothing is put in the calendar yet');

  const { tasks, inbox } = await hub.getTasks({ force: true });
  assert.equal(inbox.length, 2, 'both wait in the Magic add inbox');
  const dinner = tasks.find((t) => t.title === 'Dinner: lentil soup');
  assert.deepEqual([dinner.from, dinner.date, dinner.minutes, dinner.tags], ['food-planner', date, 45, ['food-planner']]);
  assert.deepEqual(store.data.inboxItems[dinner.id].limits, { preferred: '18:30' });

  // What the user sees on opening Magic add for that day: the dinner just after the meeting, at its own length.
  const p = await magic.planDay('', date, {}, inbox);
  const b = p.blocks.find((x) => x.ref === dinner.id);
  assert.equal(b.minutes, 45);
  assert.ok(hm(b.start) >= '19:00' && hm(b.start) <= '19:10', `fitted around the meeting (got ${hm(b.start)})`);

  // Sent again with the same id: the waiting task is brought up to date, not doubled.
  const again = await magicAdd({ date, source: 'food-planner', items: [{ title: 'Dinner: lentil stew', minutes: 50, preferred: '19:30', id: 'meal-1' }] });
  assert.equal(again.queued[0].id, dinner.id);
  const after = await hub.getTasks({ force: true });
  assert.equal(after.tasks.filter((t) => /Dinner/.test(t.title)).length, 1);
  assert.equal(after.tasks.find((t) => t.id === dinner.id).minutes, 50);
  assert.deepEqual(store.data.inboxItems[dinner.id].limits, { preferred: '19:30' });
});

test('with "place them right away" they become time blocks around what is there, and the window is told for its undo', async () => {
  reset({ incoming: 'auto' });
  const date = ymd(day(1));
  busy('Dentist', day(1, 12), day(1, 13));
  let told = null;
  magic.onPlaced((d) => { told = d; });
  const r = await magicAdd({ date, source: 'food-planner', items: [
    { title: 'Lunch', minutes: 30, preferred: '12:15', id: 'meal-2' },
    { title: 'Dinner', minutes: 40, preferred: '18:00', id: 'meal-3' },
    { title: 'Lights out', minutes: 15, preferred: '22:45', id: 'sleep-1' },
    { title: 'Grocery run', minutes: 300 },
  ] });
  assert.equal(r.mode, 'placed');
  assert.equal(r.estimated_by, 'words', 'no Claude key: planned from the words');
  const at = (t) => r.placed.find((p) => p.title === t);
  assert.ok(at('Lunch').start.includes('T13:'), `lunch moves past the dentist (got ${at('Lunch').start})`);
  assert.ok(at('Dinner').start.includes('T18:00'), at('Dinner').start);
  assert.ok(at('Lights out').start.includes('T22:45'), 'a time past the chosen hours is kept for a timed one');
  assert.match(at('Dinner').start, /[+-]\d{2}:\d{2}$/, 'local times with their offset, like the other tools');
  assert.ok(r.placed.every((p) => p.id), 'each block has its event id');
  assert.ok(r.unplaced.some((u) => u.title === 'Grocery run') || r.placed.some((p) => /Grocery run/.test(p.title)));
  assert.equal(told.date, date);
  assert.equal(told.source, 'food-planner');
  assert.equal(told.events.length, r.placed.length);
  assert.ok(told.events[0].fields.calendarId, 'enough to put it back after an undo');
  const made = [...fake.events.values()].filter((e) => e.title !== 'Dentist');
  assert.equal(made.length, r.placed.length);

  // The same ids again: the blocks stay where they are, none is added.
  const again = await magicAdd({ date, source: 'food-planner', items: [{ title: 'Lunch', minutes: 30, preferred: '12:15', id: 'meal-2' }] });
  assert.equal(again.placed.length, 1);
  assert.equal(again.placed[0].kept, true);
  assert.equal(again.placed[0].id, at('Lunch').id);
  assert.equal([...fake.events.values()].length, made.length + 1);
  // Deleted in the meantime (or undone): it is planned again.
  fake.events.delete(again.placed[0].id.split('/').pop().replace(/^ev~/, ''));
  hub.invalidate();
  const third = await magicAdd({ date, source: 'food-planner', items: [{ title: 'Lunch', minutes: 30, preferred: '12:15', id: 'meal-2' }] });
  assert.ok(!third.placed[0].kept);
  magic.onPlaced(() => {});
});

test('nothing is placed in the past: a time already gone today is reported back', async () => {
  reset({ incoming: 'auto' });
  if (new Date().getHours() < 1) return; // just after midnight nothing has passed yet
  const r = await magicAdd({ date: ymd(new Date()), items: [{ title: 'Breakfast', minutes: 15, preferred: '00:05' }] });
  assert.deepEqual(r.unplaced, [{ title: 'Breakfast', reason: 'Its time today has already passed' }]);
  assert.equal(r.placed.length, 0);
});

test('what cannot be used is refused with a reason, and nothing is made', async () => {
  reset();
  const date = ymd(day(1));
  await assert.rejects(() => magicAdd({ date: 'tomorrow', items: [{ title: 'x' }] }), /YYYY-MM-DD/);
  await assert.rejects(() => magicAdd({ date, items: [] }), /at least one/);
  await assert.rejects(() => magicAdd({ date, items: [{ minutes: 10 }] }), /items\[0\] needs a title/);
  await assert.rejects(() => magicAdd({ date, items: [{ title: 'Tea', preferred: '7pm' }] }), /preferred must be a time/);
  await assert.rejects(() => magicAdd({ date, items: Array.from({ length: 31 }, (_, i) => ({ title: `Item ${i}` })) }), /at most 30/);
  await assert.rejects(() => magicAdd({ date, source: 'Food Planner!', items: [{ title: 'Tea' }] }), /source must be/);
  assert.equal(fake.tasks.size, 0);
});
