// The master calendar and the Raspberry Pi bridge, run against a stand-in for
// Google (an in-memory calendar and task list) so no account is needed.

const test = require('node:test');
const assert = require('node:assert/strict');
const store = require('../src/main/store');
const google = require('../src/main/providers/google');
const hub = require('../src/main/hub');
const { parseName } = require('../src/main/taskname');

store.save = () => {}; // nothing is written to disk in tests

const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const day = (offset, h = 0, m = 0) => { const t = new Date(); return new Date(t.getFullYear(), t.getMonth(), t.getDate() + offset, h, m); };
const settle = () => new Promise((r) => setTimeout(r, 20));
const gone = () => Object.assign(new Error('Not found'), { status: 404 });

const fake = { events: new Map(), tasks: new Map(), seq: 0 };
google.events = async (req, cal, start, end) => [...fake.events.values()]
  .filter((e) => e.cal === cal && new Date(e.end) > new Date(start) && new Date(e.start) < new Date(end));
google.createEvent = async (req, cal, d) => {
  const e = { rawId: `ev${++fake.seq}`, cal, notes: '', location: '', ...d };
  fake.events.set(e.rawId, e);
  return e;
};
google.updateEvent = async (req, cal, id, d) => {
  if (!fake.events.has(id)) throw gone();
  return Object.assign(fake.events.get(id), d);
};
google.deleteEvent = async (req, cal, id) => { fake.events.delete(id); };
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
google.deleteTask = async (req, list, id) => {
  if (!fake.tasks.has(id)) throw gone();
  fake.tasks.delete(id);
};

function reset() {
  fake.events.clear();
  fake.tasks.clear();
  const d = store.data;
  d.accounts = [{ id: 'g1', provider: 'google', label: 'me@example.com' }];
  d.calendars = { g1: [
    { rawId: 'primary', kind: 'calendar', name: 'Personal', color: '#4aa8ff', writable: true },
    { rawId: 'tasks', kind: 'tasklist', name: 'My Tasks', color: '#f5b83d', writable: true },
  ] };
  d.local.events = [];
  d.piLinks = {};
  d.settings.hidden = {};
  d.settings.defaultCalendar = '';
  d.settings.pi = { enabled: true, taskList: '', leadMinutes: 60, quietStart: '22:00', quietEnd: '07:00' };
  hub.invalidate();
}

const week = () => [day(-1).toISOString(), day(7).toISOString()];
const mirrors = () => [...fake.tasks.values()];
/** What the Pi would make of a task: [date, "HH:MM"]. */
const piReads = (task) => { const p = parseName(task.title); return [p.date || task.due, `${pad(p.time[0])}:${pad(p.time[1])}`]; };

test('a phone reminder on a Google event keeps a matching task for the Pi', async () => {
  reset();
  const start = day(1, 15, 0);
  const ev = await hub.createEvent({ calendarId: 'g1/primary', title: 'Dentist', start, end: day(1, 16, 0), allDay: false, piCall: true });
  assert.equal(ev.piCall, true);
  assert.equal(ev.warning, '');
  assert.equal(mirrors().length, 1);
  assert.equal(mirrors()[0].title, `Dentist ${ymd(start)} 15:00`);
  assert.equal(mirrors()[0].due, ymd(start));
  assert.deepEqual(piReads(mirrors()[0]), [ymd(start), '15:00']);

  // Moving the event moves the same task rather than adding a second one.
  const moved = await hub.updateEvent(ev.id, { start: day(2, 9, 30), end: day(2, 10, 0), allDay: false });
  assert.equal(moved.piCall, true);
  assert.equal(mirrors().length, 1);
  assert.deepEqual(piReads(mirrors()[0]), [ymd(day(2)), '09:30']);

  // The matching task is bookkeeping: it is not drawn on the calendar as well.
  const { events } = await hub.getEvents(...week());
  assert.deepEqual(events.map((e) => [e.kind, e.title, e.piCall]), [['event', 'Dentist', true]]);
  assert.equal((await hub.getTasks()).tasks[0].mirror, true);

  // Switching the reminder off removes the task; so does deleting the event.
  await hub.updateEvent(ev.id, { piCall: false });
  assert.equal(mirrors().length, 0);
  await hub.updateEvent(ev.id, { piCall: true });
  assert.equal(mirrors().length, 1);
  await hub.deleteEvent(ev.id);
  assert.equal(mirrors().length, 0);
  assert.deepEqual(store.data.piLinks, {});
});

test('local time blocks and read-only events can have a phone reminder too', async () => {
  reset();
  const block = await hub.createEvent({ title: 'Deep work', start: day(1, 13, 0), end: day(1, 15, 0), allDay: false, piCall: true });
  assert.equal(block.calendarId, 'local/blocks');
  assert.deepEqual(piReads(mirrors()[0]), [ymd(day(1)), '13:00']);

  // A read-only event (a subscribed calendar) cannot be edited, but the reminder still works.
  const readOnly = { id: 'i1/feed/uid_1', title: 'Board meeting', start: day(2, 13, 0).toISOString(), allDay: false };
  assert.equal(await hub.setPiCall(readOnly, true), true);
  assert.equal(mirrors().length, 2);
  assert.equal(await hub.setPiCall(readOnly, false), false);
  assert.equal(mirrors().length, 1);
});

test('an all-day entry never gets a phone reminder', async () => {
  reset();
  const ev = await hub.createEvent({ calendarId: 'g1/primary', title: 'Leave', start: ymd(day(1)), end: ymd(day(2)), allDay: true, piCall: true });
  assert.equal(ev.piCall, false);
  assert.equal(mirrors().length, 0);

  // A timed event with a reminder that is dragged into the all-day row loses it.
  const timed = await hub.createEvent({ calendarId: 'g1/primary', title: 'Sync', start: day(1, 10), end: day(1, 11), allDay: false, piCall: true });
  assert.equal(mirrors().length, 1);
  const dragged = await hub.updateEvent(timed.id, { start: ymd(day(1)), end: ymd(day(2)), allDay: true });
  assert.equal(dragged.piCall, false);
  assert.equal(mirrors().length, 0);
});

test('an event changed in another app carries its phone reminder along', async () => {
  reset();
  const ev = await hub.createEvent({ calendarId: 'g1/primary', title: 'Review', start: day(1, 14, 0), end: day(1, 15, 0), allDay: false, piCall: true });
  const raw = fake.events.get(ev.id.split('/')[2]);

  // Moved on Google's site: the next read of the calendar moves the task.
  raw.start = day(1, 16, 30).toISOString();
  raw.end = day(1, 17, 0).toISOString();
  hub.invalidate();
  await hub.getEvents(...week());
  await settle();
  assert.deepEqual(piReads(mirrors()[0]), [ymd(day(1)), '16:30']);

  // Deleted on Google's site: the next read drops the task.
  fake.events.clear();
  hub.invalidate();
  await hub.getEvents(...week());
  await settle();
  assert.equal(mirrors().length, 0);
  assert.deepEqual(store.data.piLinks, {});
});

test('a reminder task deleted by hand is recreated when the event moves', async () => {
  reset();
  const ev = await hub.createEvent({ calendarId: 'g1/primary', title: 'Brief', start: day(1, 9, 0), end: day(1, 10, 0), allDay: false, piCall: true });
  fake.tasks.clear();
  await hub.updateEvent(ev.id, { start: day(1, 11, 0), end: day(1, 12, 0), allDay: false });
  assert.equal(mirrors().length, 1);
  assert.deepEqual(piReads(mirrors()[0]), [ymd(day(1)), '11:00']);
});

test('tasks with a time in the name land on the calendar at that time', async () => {
  reset();
  const tomorrow = ymd(day(1));
  await google.createTask(null, 'tasks', { title: '0800 Site visit', due: tomorrow });
  await google.createTask(null, 'tasks', { title: '0700 Check flight time', due: tomorrow });
  await google.createTask(null, 'tasks', { title: 'Renew passport', due: tomorrow });
  await google.createTask(null, 'tasks', { title: 'Anki 20 new words' });

  const { tasks } = await hub.getTasks();
  const by = Object.fromEntries(tasks.map((t) => [t.label, t]));
  assert.equal(by['Site visit'].start, day(1, 8, 0).toISOString());
  assert.equal(by['Site visit'].call.quiet, false);
  assert.equal(new Date(by['Site visit'].call.at).getHours(), 7);
  assert.equal(by['Check flight time'].call.quiet, true); // 6am is inside quiet hours
  assert.equal(by['Renew passport'].call, null);
  assert.equal(by['Anki 20 new words'].date, null);

  const { events } = await hub.getEvents(...week());
  assert.deepEqual(events.map((e) => [e.title, e.allDay, e.piCall]).sort(), [
    ['Check flight time', false, false],
    ['Renew passport', true, false],
    ['Site visit', false, true],
  ]);
});

test('a new task with a time but no date is given the next day that time comes round', async () => {
  reset();
  const soon = new Date(Date.now() + 2 * 3600000);
  const task = await hub.createTask({ title: `Call Sam ${pad(soon.getHours())}:${pad(soon.getMinutes())}` });
  assert.equal(task.due, ymd(soon));
  const dated = await hub.createTask({ title: 'Dentist Oct 14 3pm' });
  assert.equal(dated.due, null); // the name already says when
});

test('switching a calendar off takes its entries out of the master calendar', async () => {
  reset();
  await hub.createEvent({ calendarId: 'g1/primary', title: 'Google thing', start: day(1, 10), end: day(1, 11), allDay: false });
  await hub.createEvent({ title: 'Local thing', start: day(1, 12), end: day(1, 13), allDay: false });
  assert.equal((await hub.getEvents(...week())).events.length, 2);
  store.data.settings.hidden = { 'g1/primary': true };
  assert.deepEqual((await hub.getEvents(...week())).events.map((e) => e.title), ['Local thing']);
  assert.equal((await hub.getEvents(...week(), { includeHidden: true })).events.length, 2);
});

test('one account failing does not hide the others', async () => {
  reset();
  await hub.createEvent({ title: 'Local thing', start: day(1, 12), end: day(1, 13), allDay: false });
  const real = google.events;
  google.events = async () => { throw new Error('sign in again'); };
  hub.invalidate();
  const { events, errors } = await hub.getEvents(...week());
  google.events = real;
  assert.deepEqual(events.map((e) => e.title), ['Local thing']);
  assert.deepEqual(errors, ['me@example.com: sign in again']);
});

test('free time is what is left between the busy blocks', async () => {
  reset();
  await hub.createEvent({ title: 'A', start: day(1, 9), end: day(1, 10, 30), allDay: false });
  await hub.createEvent({ calendarId: 'g1/primary', title: 'B', start: day(1, 10), end: day(1, 12), allDay: false });
  await hub.createEvent({ title: 'C', start: day(1, 15), end: day(1, 16), allDay: false });
  const gaps = await hub.freeTime(ymd(day(1)), { minMinutes: 45, dayStart: '08:00', dayEnd: '17:00' });
  assert.deepEqual(gaps.map((g) => [new Date(g.start).getHours(), g.minutes]), [[8, 60], [12, 180], [16, 60]]);
});

test('tags stay in Onyx and follow their entry', async () => {
  reset();
  store.data.tags = {};
  store.data.tagColors = {};
  const ev = await hub.createEvent({ calendarId: 'g1/primary', title: 'Arabic', start: day(1, 9), end: day(1, 10), allDay: false, tags: ['#Study', 'arabic', 'study', '  '] });
  assert.deepEqual(ev.tags, ['Study', 'arabic']);
  assert.equal(fake.events.get(ev.id.split('/')[2]).tags, undefined); // never sent to Google

  // Typed in another case, an existing tag keeps its first spelling.
  const block = await hub.createEvent({ title: 'Flashcards', start: day(1, 11), end: day(1, 12), allDay: false, tags: ['STUDY'] });
  assert.deepEqual(block.tags, ['Study']);
  assert.deepEqual(hub.allTags().map((t) => [t.name, t.count]), [['arabic', 1], ['Study', 2]]);
  assert.match(hub.allTags()[0].color, /^#[0-9a-f]{6}$/i);

  const { events } = await hub.getEvents(...week());
  assert.deepEqual(events.map((e) => [e.title, e.tags]), [['Arabic', ['Study', 'arabic']], ['Flashcards', ['Study']]]);

  // Moving to another calendar keeps the tags; deleting drops them.
  const moved = await hub.updateEvent(block.id, { calendarId: 'g1/primary', title: 'Flashcards', start: day(1, 11), end: day(1, 12), allDay: false });
  assert.deepEqual(moved.tags, ['Study']);
  assert.equal(store.data.tags[block.id], undefined);
  await hub.deleteEvent(moved.id);
  assert.deepEqual(hub.allTags().map((t) => [t.name, t.count]), [['arabic', 1], ['Study', 1]]);

  // Tasks carry tags too, set without touching the task itself.
  await google.createTask(null, 'tasks', { title: 'Read chapter 4' });
  const task = (await hub.getTasks({ force: true })).tasks[0];
  const tagged = await hub.updateTask(task.id, { tags: ['reading'] });
  assert.deepEqual(tagged.tags, ['reading']);
  assert.equal(tagged.title, 'Read chapter 4');

  assert.equal(hub.renameTag('Study', 'arabic'), 'arabic'); // merging two tags
  assert.deepEqual(store.data.tags[ev.id], ['arabic']);
  hub.deleteTag('arabic');
  assert.equal(store.data.tags[ev.id], undefined);
  assert.deepEqual(hub.allTags().map((t) => t.name), ['reading']);
});

test('a picked call time reaches the Pi as a "Call at" line, and moves with the event', async () => {
  reset();
  const ev = await hub.createEvent({ calendarId: 'g1/primary', title: 'Dentist', start: day(2, 15, 0), end: day(2, 16, 0), allDay: false, piCall: true, callBefore: 180 });
  assert.equal(ev.callBefore, 180);
  const at = (t) => (t.notes.match(/^Call at: (.+)$/m) || [])[1];
  assert.deepEqual(piReads(mirrors()[0]), [ymd(day(2)), '15:00'], 'the name keeps the real start');
  assert.equal(at(mirrors()[0]), `${ymd(day(2))} 12:00`);

  // Moved an hour later: the call moves with it.
  await hub.updateEvent(ev.id, { start: day(2, 16, 0), end: day(2, 17, 0), allDay: false });
  assert.equal(at(mirrors()[0]), `${ymd(day(2))} 13:00`);
  assert.equal(store.data.piLinks[ev.id].before, 180);

  // Back to the usual time: no "Call at" line.
  const back = await hub.updateEvent(ev.id, { callBefore: null });
  assert.equal(back.callBefore, null);
  assert.equal(at(mirrors()[0]), undefined);
  assert.equal(mirrors().length, 1);
});

test('a task ticked off stays on the calendar, marked done', async () => {
  reset();
  google.completedTasks = async (req, list) => [...fake.tasks.values()].filter((t) => t.list === list && t.done);
  const t = await hub.createTask({ title: 'Call the bank 3pm', due: ymd(day(1)) });
  await hub.updateTask(t.id, { done: true });
  const { events } = await hub.getEvents(...week());
  const shown = events.filter((e) => e.id === t.id);
  assert.equal(shown.length, 1, 'once, not as both open and done');
  assert.equal(shown[0].done, true);
  assert.equal(shown[0].movable, false);
  const { tasks } = await hub.getTasks({ force: true });
  assert.equal(tasks.some((x) => x.id === t.id), false, 'not in the open list');
  delete google.completedTasks;
});

test('the escalation ladder: leave-by, push only, critical, and Leaving now', async () => {
  reset();
  store.data.settings.pi.checkEvery = 5;
  const at = (t) => [...t.notes.matchAll(/^Call at: (.+)$/gm)].map((m) => m[1]);
  // A call at the leave-by time (40 minutes before a 15:00 start: 14:20).
  const ev = await hub.createEvent({ calendarId: 'g1/primary', title: 'Dentist', start: day(2, 15, 0), end: day(2, 16, 0), allDay: false, piCall: true, leaveBy: 40 });
  assert.equal(ev.leaveBy, 40);
  assert.equal(ev.callMode, 'call');
  assert.deepEqual(at(mirrors()[0]), [`${ymd(day(2))} 14:20`]);
  assert.deepEqual(ev.piAlerts.map((a) => a.kind), ['call']);

  // Critical: a second call 10 minutes later.
  let up = await hub.updateEvent(ev.id, { callMode: 'critical' });
  assert.deepEqual(at(mirrors()[0]), [`${ymd(day(2))} 14:20`, `${ymd(day(2))} 14:30`]);
  assert.match(mirrors()[0].notes, /^Escalation: critical$/m);
  assert.equal(up.piAlerts.length, 2);

  // Push only: an alert, no call.
  up = await hub.updateEvent(ev.id, { callMode: 'push' });
  assert.match(mirrors()[0].notes, /^Alert: push only$/m);
  assert.deepEqual(up.piAlerts.map((a) => a.kind), ['push']);

  // Leaving now: nothing more about it, until it is moved.
  await hub.updateEvent(ev.id, { callMode: 'critical' });
  assert.equal(await hub.ackPiCall(ev.id), true);
  assert.match(mirrors()[0].notes, /^Acknowledged: yes$/m);
  assert.deepEqual(at(mirrors()[0]), []);
  await hub.updateEvent(ev.id, { start: day(2, 16, 0), end: day(2, 17, 0), allDay: false });
  assert.deepEqual(at(mirrors()[0]), [`${ymd(day(2))} 15:20`, `${ymd(day(2))} 15:30`], 'moved: it rings again');

  // Leave-by off: back to the Pi's usual time.
  await hub.updateEvent(ev.id, { leaveBy: null, callMode: 'call' });
  assert.deepEqual(at(mirrors()[0]), []);
  store.data.settings.pi.checkEvery = 30;
});

test('a repeating block: every day of it, one change moves all, skip a day, stop, delete', async () => {
  reset();
  const first = day(1, 9, 0);
  const other = (first.getDay() + 2) % 7;
  const made = await hub.createEvent({
    title: 'Gym', start: first, end: day(1, 10, 0), allDay: false, calendarId: 'local/blocks',
    recur: { freq: 'weekly', days: [first.getDay(), other] }, tags: ['health'],
  });
  const range = [day(0).toISOString(), day(15).toISOString()];
  const gym = async () => (await hub.getEvents(...range)).events.filter((e) => e.title === 'Gym');
  const when = (list) => list.map((e) => `${ymd(new Date(e.start))} ${new Date(e.start).getHours()}`);

  let days = await gym();
  assert.deepEqual(when(days), [1, 3, 8, 10].map((n) => `${ymd(day(n))} 9`));
  assert.ok(days.every((e) => e.seriesId === made.id && e.recur.freq === 'weekly'));
  assert.deepEqual(days[2].tags, ['health'], 'the series\' tags are on every day of it');

  // The second one dragged a day on and an hour later: all of them follow.
  const second = days[1];
  await hub.updateEvent(second.id, { start: day(4, 10, 0).toISOString(), end: day(4, 11, 0).toISOString(), allDay: false, seriesId: second.seriesId, from: second.start });
  days = await gym();
  assert.deepEqual(when(days), [2, 4, 9, 11].map((n) => `${ymd(day(n))} 10`));

  // Skip one day; the rest stay.
  await hub.deleteEvent(days[1].id, { scope: 'one', seriesId: days[1].seriesId });
  days = await gym();
  assert.deepEqual(when(days), [2, 9, 11].map((n) => `${ymd(day(n))} 10`));

  // Turned off on the second one shown: that is its last day.
  await hub.updateEvent(days[1].id, { title: 'Gym', recur: null, seriesId: days[1].seriesId, from: days[1].start });
  days = await gym();
  assert.deepEqual(when(days), [2, 9].map((n) => `${ymd(day(n))} 10`));

  // Delete all.
  await hub.deleteEvent(days[0].id, { scope: 'all', seriesId: days[0].seriesId });
  assert.equal((await gym()).length, 0);
  assert.equal(store.data.local.events.length, 0);
});

test('a new repeat starts on the first day its rule falls on', async () => {
  reset();
  const start = day(1, 8, 0);
  const notThatDay = (start.getDay() + 1) % 7;
  await hub.createEvent({ title: 'Swim', start, end: day(1, 9, 0), allDay: false, calendarId: 'local/blocks', recur: { freq: 'weekly', days: [notThatDay] } });
  const { events } = await hub.getEvents(day(0).toISOString(), day(9).toISOString());
  assert.deepEqual(events.filter((e) => e.title === 'Swim').map((e) => ymd(new Date(e.start))), [ymd(day(2)), ymd(day(9))].filter((s) => s < ymd(day(9))));
});

test('a task on the backburner has no date until it is scheduled by hand', async () => {
  reset();
  store.data.backburner = {};
  // Even a time in its name doesn't give it a day.
  const t = await hub.createTask({ title: 'Repaint the hallway 3pm', backburner: true });
  assert.equal(t.date, null);
  assert.equal(t.backburner, true);
  let open = (await hub.getTasks({ force: true })).tasks.find((x) => x.id === t.id);
  assert.equal(open.backburner, true);
  // Scheduled: off the backburner, for good.
  await hub.updateTask(t.id, { due: ymd(day(3)) });
  open = (await hub.getTasks({ force: true })).tasks.find((x) => x.id === t.id);
  assert.equal(open.backburner, false);
  assert.equal(store.data.backburner[t.id], undefined);
});

test('Stop all: a repeat set up in Google Tasks is deleted, and the copies it still adds go too', async () => {
  reset();
  store.data.stoppedSeries = {};
  store.data.madeHere = {};
  // Google's copies of a daily task (made in Google, not in Onyx).
  for (const n of [-2, -1, 0]) fake.tasks.set(`d${n}`, { rawId: `d${n}`, list: 'tasks', title: 'Water the plants', notes: '', due: ymd(day(n)), done: false });
  let { tasks } = await hub.getTasks({ force: true });
  const s = tasks.find((t) => t.label === 'Water the plants').series;
  assert.equal(s.count, 3);
  const res = await require('../src/main/series').stopAll(hub, s.key);
  assert.equal(res.deleted, 3);
  assert.equal(fake.tasks.size, 0);
  // Google adds tomorrow's copy anyway: it never shows, and is deleted.
  fake.tasks.set('d1', { rawId: 'd1', list: 'tasks', title: 'Water the plants', notes: '', due: ymd(day(1)), done: false });
  hub.invalidate();
  ({ tasks } = await hub.getTasks({ force: true }));
  assert.equal(tasks.some((t) => t.label === 'Water the plants'), false);
  await settle();
  assert.equal(fake.tasks.has('d1'), false);
  // One added through Onyx after the stop stays.
  const mine = await hub.createTask({ title: 'Water the plants', due: ymd(day(2)) });
  hub.invalidate();
  ({ tasks } = await hub.getTasks({ force: true }));
  assert.ok(tasks.some((t) => t.id === mine.id));
});

test('a calendar entry or block can be ticked off like a task, and brought back', async () => {
  reset();
  store.data.doneEvents = {};
  const block = await hub.createEvent({ title: 'Deep work', start: day(0, 9, 0), end: day(0, 10, 0), allDay: false, calendarId: 'local/blocks' });
  const find = async () => (await hub.getEvents(day(0).toISOString(), day(1).toISOString())).events.find((e) => e.id === block.id);
  assert.equal((await find()).done, false);
  hub.setEventDone(block.id, true);
  assert.equal((await find()).done, true);
  hub.setEventDone(block.id, false);
  assert.equal((await find()).done, false);
});
