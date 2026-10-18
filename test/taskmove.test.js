// Dragging a task in the calendar: the due date in Google Tasks follows, and so does
// any date or time written in its name (which is what the Pi reads).
const test = require('node:test');
const assert = require('node:assert/strict');
const store = require('../src/main/store');
const google = require('../src/main/providers/google');
const hub = require('../src/main/hub');
const { parseName } = require('../src/main/taskname');

store.save = () => {};

const tasks = new Map();
const sent = [];
google.tasks = async (req, list) => [...tasks.values()].filter((t) => t.list === list && !t.done);
google.updateTask = async (req, list, id, d) => { sent.push(d); return Object.assign(tasks.get(id), d); };

function reset() {
  tasks.clear();
  sent.length = 0;
  const d = store.data;
  d.accounts = [{ id: 'g1', provider: 'google', label: 'me@example.com' }];
  d.calendars = { g1: [{ rawId: 'tasks', kind: 'tasklist', name: 'My Tasks', color: '#f5b83d', writable: true }] };
  d.piLinks = {};
  d.tags = {};
  d.settings.pi = { enabled: true, taskList: '', leadMinutes: 60, quietStart: '22:00', quietEnd: '07:00' };
  d.settings.calls = { method: 'pi' };
  hub.invalidate();
}
const add = (rawId, title, due = null) => tasks.set(rawId, { rawId, list: 'tasks', title, notes: '', due, done: false });

test('a task dropped on another day gets that due date and keeps its name', async () => {
  reset();
  add('a', 'Renew passport', '2026-10-14');
  const t = await hub.moveTask('g1/tl~tasks/a', { date: '2026-10-20' });
  assert.deepEqual(sent, [{ due: '2026-10-20' }]);
  assert.equal(t.date, '2026-10-20');
  assert.equal(tasks.get('a').title, 'Renew passport');
});

test('a date written in the name is taken out, so the due date wins', async () => {
  reset();
  add('b', 'Pay rent 2026-10-15', '2026-10-15');
  const t = await hub.moveTask('g1/tl~tasks/b', { date: '2026-10-18' });
  assert.equal(tasks.get('b').title, 'Pay rent');
  assert.equal(t.date, '2026-10-18');
});

test('dropped on a time, the name carries the new day and time', async () => {
  reset();
  add('c', 'Dentist 2026-10-15 15:00', '2026-10-15');
  const start = new Date(2026, 9, 17, 10, 30);
  const t = await hub.moveTask('g1/tl~tasks/c', { start: start.toISOString() });
  const p = parseName(tasks.get('c').title);
  assert.equal(p.spoken, 'Dentist');
  assert.equal(p.date, '2026-10-17');
  assert.deepEqual(p.time, [10, 30]);
  assert.equal(tasks.get('c').due, '2026-10-17');
  assert.equal(new Date(t.start).getTime(), start.getTime());
});

test('tasks that follow a calendar entry, and bad dates, are refused', async () => {
  reset();
  add('d', 'Standup 2026-10-15 09:00', '2026-10-15');
  store.data.piLinks = { 'x/event': { task: 'g1/tl~tasks/d' } };
  await assert.rejects(hub.moveTask('g1/tl~tasks/d', { date: '2026-10-16' }), /Move the entry instead/);
  store.data.piLinks = {};
  await assert.rejects(hub.moveTask('g1/tl~tasks/d', { date: 'soon' }), /not a date/);
  assert.equal(sent.length, 0);
});
