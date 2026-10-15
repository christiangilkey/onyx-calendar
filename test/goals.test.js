// Goals (steps that are real tasks, one bar on the calendar) and repeating tasks, run
// against an in-memory stand-in for Google Tasks.
const test = require('node:test');
const assert = require('node:assert/strict');
const store = require('../src/main/store');
const google = require('../src/main/providers/google');
const hub = require('../src/main/hub');
const goals = require('../src/main/goals');
const repeat = require('../src/main/repeat');

store.save = () => {};

let tasks;
let seq;
google.tasks = async () => [...tasks.values()].filter((t) => !t.done).map((t) => ({ ...t }));
google.getTask = async (req, list, id) => (tasks.has(id) ? { ...tasks.get(id) } : null);
google.createTask = async (req, list, d) => {
  const t = { rawId: `t${++seq}`, title: d.title, notes: d.notes || '', due: d.due || null, done: false };
  tasks.set(t.rawId, t);
  return { ...t };
};
google.updateTask = async (req, list, id, d) => {
  if (!tasks.has(id)) throw Object.assign(new Error('gone'), { status: 404 });
  return { ...Object.assign(tasks.get(id), d) };
};
google.deleteTask = async (req, list, id) => { tasks.delete(id); };

const LIST = 'g1/tl~tasks';
const tid = (raw) => `${LIST}/${raw}`;

function reset() {
  tasks = new Map();
  seq = 0;
  const d = store.data;
  d.accounts = [{ id: 'g1', provider: 'google', label: 'me@example.com' }];
  d.calendars = { g1: [{ rawId: 'tasks', kind: 'tasklist', name: 'My Tasks', color: '#f5b83d', writable: true }] };
  Object.assign(d, { piLinks: {}, tags: {}, goals: [], repeats: {}, repeatSpawned: {} });
  d.settings.hidden = {};
  d.settings.pi = { enabled: false, taskList: '', leadMinutes: 60, quietStart: '22:00', quietEnd: '07:00' };
  hub.invalidate();
}

test('a goal makes one task per step and one bar on the calendar', async () => {
  reset();
  const g = await goals.create({
    title: 'Run a half marathon', start: '2026-10-14', end: '2026-12-31', tags: ['health'],
    steps: [{ title: 'Run 5k', due: '2026-10-20' }, { title: 'Run 10k', due: '2026-11-15' }, { title: 'Buy shoes' }],
  });
  assert.equal(tasks.size, 3);
  assert.deepEqual(g.progress, { done: 0, total: 3, percent: 0 });
  const { tasks: open } = await hub.getTasks({ force: true });
  const step = open.find((t) => t.title === 'Run 5k');
  assert.deepEqual(step.goal, { id: g.id, title: 'Run a half marathon', color: g.color });
  assert.match(step.notes, /A step toward: Run a half marathon/);

  const { events } = await hub.getEvents(new Date(2026, 9, 12).toISOString(), new Date(2026, 9, 19).toISOString());
  const bars = events.filter((e) => e.kind === 'goal');
  assert.equal(bars.length, 1);
  assert.deepEqual([bars[0].start, bars[0].end, bars[0].tags], ['2026-10-14', '2027-01-01', ['health']]);

  store.data.settings.hidden[g.id] = true;
  const hidden = await hub.getEvents(new Date(2026, 9, 12).toISOString(), new Date(2026, 9, 19).toISOString());
  assert.equal(hidden.events.filter((e) => e.kind === 'goal').length, 0);
});

test('steps follow their tasks: done in Onyx, done or moved in Google', async () => {
  reset();
  const g = await goals.create({ title: 'Learn Arabic', end: '2027-06-01', steps: [{ title: 'Alphabet' }, { title: 'Numbers' }, { title: 'Greetings' }] });
  const [a, b, c] = g.steps;
  await hub.updateTask(a.taskId, { done: true });                 // ticked off in Onyx
  tasks.get(b.taskId.split('/').pop()).done = true;               // ticked off in Google
  tasks.get(c.taskId.split('/').pop()).due = '2026-11-02';        // moved in Google
  hub.invalidate();
  const [after] = await goals.list({ force: true });
  assert.deepEqual(after.steps.map((s) => [s.done, s.due]), [[true, null], [true, null], [false, '2026-11-02']]);
  assert.equal(after.progress.percent, 67);
});

test('editing a goal adds, changes and removes the steps\' tasks', async () => {
  reset();
  const g = await goals.create({ title: 'Ship the app', end: '2026-12-01', steps: [{ title: 'Design' }, { title: 'Build' }] });
  const [design, build] = g.steps;
  const edited = await goals.update(g.id, {
    title: 'Ship Onyx 2', steps: [{ id: design.id, title: 'Design it', due: '2026-10-30', done: false }, { title: 'Test' }],
  });
  assert.deepEqual(edited.steps.map((s) => s.title), ['Design it', 'Test']);
  assert.equal(tasks.get(design.taskId.split('/').pop()).title, 'Design it');
  assert.equal(tasks.get(design.taskId.split('/').pop()).due, '2026-10-30');
  assert.equal(tasks.has(build.taskId.split('/').pop()), false, 'the removed step\'s task is deleted');
  await assert.rejects(goals.update(g.id, { end: '2020-01-01' }), /before the start/);
  await goals.remove(g.id);
  assert.equal(tasks.size, 0);
  assert.equal(store.data.goals.length, 0);
});

test('repeat dates never land in the past and keep the day of the month', () => {
  const today = new Date(2026, 9, 14); // Wed 14 Oct 2026
  assert.equal(repeat.nextDate('daily', '2026-10-14', today), '2026-10-15');
  assert.equal(repeat.nextDate('daily', '2026-10-10', today), '2026-10-15');
  assert.equal(repeat.nextDate('weekdays', '2026-10-16', new Date(2026, 9, 16)), '2026-10-19'); // Fri -> Mon
  assert.equal(repeat.nextDate('weekly', '2026-10-12', today), '2026-10-19');
  assert.equal(repeat.nextDate('biweekly', '2026-10-14', today), '2026-10-28');
  assert.equal(repeat.nextDate('monthly', '2027-01-31', new Date(2027, 0, 31)), '2027-02-28');
  assert.equal(repeat.nextDate('monthly', '2027-02-28', new Date(2027, 1, 28), 31), '2027-03-31');
  assert.equal(repeat.nextDate('yearly', '2026-10-14', today), '2027-10-14');
});

test('a repeating task done in Onyx brings the next one, and Undo takes it back', async () => {
  reset();
  const t = await hub.createTask({ title: 'Water plants', due: '2026-10-14' });
  const set = await hub.setRepeat(t.id, 'weekly');
  assert.equal(set.repeat, 'weekly');
  const done = await hub.updateTask(t.id, { done: true });
  assert.ok(done.next, 'the next one is added');
  assert.equal(done.next.title, 'Water plants');
  assert.ok(done.next.date > '2026-10-14');
  assert.equal(store.data.repeats[t.id], undefined);
  assert.equal(store.data.repeats[done.next.id].rule, 'weekly');

  await hub.updateTask(t.id, { done: false }); // Undo
  assert.equal(tasks.has(done.next.id.split('/').pop()), false);
  assert.equal(store.data.repeats[t.id].rule, 'weekly');
});

test('a repeating task done in Google gets its next one on the next look; deleted ones stop', async () => {
  reset();
  const t = await hub.createTask({ title: 'Pay rent 2026-10-01 09:00', due: '2026-10-01' });
  await hub.setRepeat(t.id, 'monthly');
  tasks.get(t.id.split('/').pop()).done = true;
  hub.invalidate();
  const { tasks: open } = await hub.getTasks({ force: true });
  const next = open.find((x) => x.label === 'Pay rent');
  assert.ok(next, 'the next month\'s task is there');
  assert.equal(next.repeat, 'monthly');
  assert.match(next.title, /^Pay rent \d{4}-\d{2}-01 09:00$/, 'the date in the name moves too');
  const again = await hub.getTasks({ force: true });
  assert.equal(again.tasks.filter((x) => x.label === 'Pay rent').length, 1, 'only one next task');

  tasks.delete(next.id.split('/').pop()); // deleted in Google
  hub.invalidate();
  await hub.getTasks({ force: true });
  assert.equal(Object.keys(store.data.repeats).length, 0);
});
