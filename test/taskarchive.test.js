// Adding a task with a picked date, and the Archived tab: completed tasks read back by
// the local day they were done on.
const test = require('node:test');
const assert = require('node:assert/strict');
const store = require('../src/main/store');
const google = require('../src/main/providers/google');
const hub = require('../src/main/hub');
const { parseName } = require('../src/main/taskname');

store.save = () => {};

const created = [];
google.createTask = async (req, list, d) => { created.push(d); return { rawId: 'n1', notes: '', done: false, ...d }; };

function reset() {
  created.length = 0;
  const d = store.data;
  d.accounts = [{ id: 'g1', provider: 'google', label: 'me@example.com' }];
  d.calendars = { g1: [{ rawId: 'tasks', kind: 'tasklist', name: 'My Tasks', color: '#f5b83d', writable: true }] };
  d.piLinks = {};
  d.tags = {};
  d.settings.pi = { enabled: true, taskList: '', leadMinutes: 60, quietStart: '22:00', quietEnd: '07:00' };
  hub.invalidate();
}

test('a picked date is sent as the due date', async () => {
  reset();
  const t = await hub.createTask({ title: 'Renew passport', due: '2026-10-20' });
  assert.deepEqual(created, [{ title: 'Renew passport', due: '2026-10-20' }]);
  assert.equal(t.date, '2026-10-20');
});

test('a picked date wins over one typed in the name, keeping the time', async () => {
  reset();
  await hub.createTask({ title: 'Dentist 2026-10-15 15:00', due: '2026-10-18' });
  const p = parseName(created[0].title);
  assert.equal(p.spoken, 'Dentist');
  assert.equal(p.date, '2026-10-18');
  assert.deepEqual(p.time, [15, 0]);
  assert.equal(created[0].due, '2026-10-18');
});

test('the Archived tab asks for one local day and sorts newest first', async () => {
  reset();
  let asked;
  google.completedTasks = async (req, list, from, to) => {
    asked = { from, to };
    return [
      { rawId: 'a', title: 'Pay bill', notes: '', due: null, done: true, completed: '2026-10-14T09:00:00.000Z' },
      { rawId: 'b', title: 'Book dentist', notes: '', due: '2026-10-14', done: true, completed: '2026-10-14T15:00:00.000Z' },
    ];
  };
  const res = await hub.archivedTasks('2026-10-14');
  assert.equal(new Date(asked.from).getTime(), new Date(2026, 9, 14).getTime());
  assert.equal(new Date(asked.to).getTime(), new Date(2026, 9, 15).getTime());
  assert.deepEqual(res.tasks.map((t) => t.label), ['Book dentist', 'Pay bill']);
  assert.ok(res.tasks.every((t) => t.done && t.completed));
  await assert.rejects(hub.archivedTasks('yesterday'), /not a date/);
});
