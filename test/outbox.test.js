// The phone's outbox: with the PC out of reach, changes are kept on the phone, shown at once, and
// sent in order once a PC answers again, each made exactly once, even if sent twice. Runs the
// real phone code (remote.js) against the PC's real command handler (mcp.js appCall).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('node:vm');
const store = require('../src/main/store');
const mcp = require('../src/main/mcp');
const { offlineError } = require('../src/main/net');

store.save = () => {};

/** A PC with a calendar in memory, reached through a network that can be cut. */
function makePC() {
  const pc = { up: true, dropNextAnswer: false, events: [], tasks: [], seq: 0, calls: [] };
  mcp.setAppApi({
    state: async () => ({ version: 'test', calendars: [{ id: 'cal', name: 'Mine', color: '#4aa8ff', kind: 'calendar', writable: true }] }),
    events: async () => ({ events: pc.events.map((e) => ({ ...e })), errors: [] }),
    'event:create': async (d) => {
      if (pc.internetDown) throw offlineError(new TypeError('fetch failed'), 'https://www.googleapis.com/calendar/v3/calendars/x/events');
      const e = { kind: 'event', ...d, id: `cal/${++pc.seq}` }; pc.events.push(e); return e;
    },
    'event:update': async (id, patch) => {
      const e = pc.events.find((x) => x.id === id);
      if (!e) throw new Error('That event no longer exists.');
      return Object.assign(e, patch);
    },
    'event:delete': async (id) => { pc.events = pc.events.filter((x) => x.id !== id); return true; },
    tasks: async () => ({ tasks: pc.tasks.filter((t) => !t.done).map((t) => ({ ...t })), errors: [] }),
    'task:create': async (d) => { const t = { ...d, id: `list/${++pc.seq}`, label: d.title, date: d.due || null, done: false }; pc.tasks.push(t); return t; },
    'task:update': async (id, patch) => { const t = pc.tasks.find((x) => x.id === id); if (!t) throw new Error('That task no longer exists.'); return Object.assign(t, patch); },
    'tags:set': async (id, tags) => { if (tags.some((t) => t.includes('!'))) throw new Error('A tag is a word or two.'); return tags; },
    goals: async () => [{ id: 'goal/1', title: 'Learn Arabic', steps: [] }],
    settings: async (patch) => { Object.assign(pc.settings, patch); return { version: 'test', settings: { ...pc.settings }, calendars: [] }; },
  });
  pc.settings = { defaultCalendar: 'cal' };
  pc.tries = 0;
  pc.fetch = async (url, opts) => {
    pc.tries++;
    if (!pc.up) throw new TypeError('Failed to fetch');
    const msg = JSON.parse(opts.body);
    pc.calls.push(msg.name);
    const body = await mcp.appCall(msg);
    if (pc.dropNextAnswer) { pc.dropNextAnswer = false; throw new TypeError('The connection was reset'); } // made, but the answer never arrives
    return { status: 200, json: async () => body };
  };
  return pc;
}

/** The phone app's onyx object (remote.js), paired with that PC, with its own storage. */
function makePhone(pc, { paired = true } = {}) {
  const kept = new Map(paired ? [['onyx.connection', JSON.stringify({ addresses: ['192.168.1.20:4747'], token: 'token', last: '' })]] : []);
  const localStorage = {
    getItem: (k) => (kept.has(k) ? kept.get(k) : null), setItem: (k, v) => kept.set(k, String(v)), removeItem: (k) => kept.delete(k),
    key: (i) => [...kept.keys()][i], get length() { return kept.size; },
  };
  const sandbox = {
    console, URL, URLSearchParams, AbortController, setTimeout, clearTimeout, setInterval: () => 0, clearInterval: () => {},
    location: { search: '?remote' }, localStorage, fetch: (...a) => pc.fetch(...a), addEventListener: () => {},
    document: { documentElement: { classList: { toggle() {} }, style: { setProperty() {} }, dataset: {} }, addEventListener() {}, visibilityState: 'visible' },
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../src/renderer/remote.js'), 'utf8'), sandbox);
  const onyx = sandbox.window.onyx;
  onyx.heard = [];
  onyx.onOutbox((o) => onyx.heard.push(o));
  return onyx;
}

const plain = (v) => JSON.parse(JSON.stringify(v)); // values made inside the phone's own context
const settle = () => new Promise((r) => setTimeout(r, 20));
const DAY = ['2026-10-22T00:00:00.000Z', '2026-10-23T00:00:00.000Z'];
const block = (title) => ({ title, start: '2026-10-22T15:00:00.000Z', end: '2026-10-22T16:00:00.000Z', allDay: false, calendarId: 'cal' });

test('offline, a change is kept and shown at once; back online, it goes to the PC, later changes to it with its real id', async () => {
  const pc = makePC(), phone = makePhone(pc);
  await phone.state(); // the calendars, kept for offline
  pc.up = false;
  const made = await phone.createEvent(block('Dentist'));
  assert.match(made.id, /^offline-/);
  assert.equal(made.offline, true);
  assert.equal(made.color, '#4aa8ff', 'it wears its calendar\'s colour');
  await phone.updateEvent(made.id, { title: 'Dentist (moved)' });
  await phone.setTags(made.id, ['health']);
  const shown = await phone.events(...DAY);
  assert.deepEqual(plain(shown.events.map((e) => [e.title, e.tags])), [['Dentist (moved)', ['health']]]);
  assert.equal(phone.outbox().pending, 3);
  assert.equal(pc.events.length, 0);

  pc.up = true;
  await phone.syncNow();
  assert.equal(phone.outbox().pending, 0);
  assert.deepEqual(pc.events.map((e) => [e.id, e.title]), [['cal/1', 'Dentist (moved)']]);
  assert.deepEqual(pc.calls.slice(-3), ['event:create', 'event:update', 'tags:set']);
  assert.equal(phone.heard.at(-1).sent, 3, 'the app hears they went');
  // Later, the stand-in id the app may still hold reaches the real entry.
  await phone.updateEvent(made.id, { title: 'Dentist, 3pm' });
  assert.equal(pc.events[0].title, 'Dentist, 3pm');
});

test('an answer lost on the way: sent again, made once', async () => {
  const pc = makePC(), phone = makePhone(pc);
  pc.up = false;
  await phone.createEvent(block('Gym'));
  pc.up = true;
  pc.dropNextAnswer = true;
  await phone.syncNow(); // the PC makes it, but the phone never hears so
  assert.equal(phone.outbox().pending, 1, 'still waiting, as far as the phone knows');
  await phone.syncNow();
  assert.equal(phone.outbox().pending, 0);
  assert.equal(pc.events.length, 1, 'not twice');
});

test('made and taken away again offline: nothing is sent at all', async () => {
  const pc = makePC(), phone = makePhone(pc);
  pc.up = false;
  const made = await phone.createEvent(block('Oops'));
  await phone.updateEvent(made.id, { title: 'Oops again' });
  await phone.deleteEvent(made.id);
  assert.equal(phone.outbox().pending, 0);
  assert.deepEqual(plain((await phone.events(...DAY)).events), []);
  pc.up = true;
  await phone.syncNow();
  assert.deepEqual(pc.calls.filter((c) => c !== 'ping'), []);
});

test('a change to something deleted meanwhile is let go; one the PC turns down is reported', async () => {
  const pc = makePC(), phone = makePhone(pc);
  const kept = await phone.createEvent(block('Lunch'));
  pc.up = false;
  await phone.updateEvent(kept.id, { title: 'Lunch with Sam' });
  await phone.setTags(kept.id, ['bad!']);
  pc.events = []; // deleted on the PC (or in Google) while the phone was away
  pc.up = true;
  await phone.syncNow();
  assert.equal(phone.outbox().pending, 0);
  const last = phone.heard.at(-1);
  assert.equal(last.failed.length, 1);
  assert.match(last.failed[0].error, /a word or two/);
  assert.equal(phone.outbox().failed.length, 1, 'kept to look at later');
});

test('the PC answers, but its own internet dropped: the change is kept (not set aside), said once, and goes once it is back', async () => {
  const pc = makePC(), phone = makePhone(pc);
  await phone.state();
  pc.internetDown = true;
  const made = await phone.createEvent(block('Dentist'));
  assert.match(made.id, /^offline-/, 'kept on the phone, like one made offline');
  await phone.syncNow();
  await phone.syncNow();
  assert.equal(phone.outbox().pending, 1);
  assert.equal(phone.outbox().failed.length, 0, 'not taken as turned down');
  const told = phone.heard.filter((o) => o.waiting);
  assert.equal(told.length, 1, 'said once, not on every try');
  assert.match(told[0].waiting, /will sync on their own/);
  assert.equal(pc.events.length, 0);

  pc.internetDown = false;
  await phone.syncNow();
  assert.equal(phone.outbox().pending, 0);
  assert.deepEqual(pc.events.map((e) => e.title), ['Dentist']);
});

test('changes go in the order they were made, and new ones queue behind waiting ones', async () => {
  const pc = makePC(), phone = makePhone(pc);
  pc.up = false;
  const a = await phone.createEvent(block('First'));
  pc.up = true;
  // Online again, but the first still waits: this one goes after it, not ahead.
  const b = await phone.createEvent(block('Second'));
  assert.match(b.id, /^offline-/);
  await settle();
  await phone.syncNow();
  assert.deepEqual(pc.events.map((e) => e.title), ['First', 'Second']);
  assert.notEqual(a.id, b.id);
});

test('tasks too: one added offline shows in the list and on its day; ticked off, it leaves the list; both reach the PC', async () => {
  const pc = makePC(), phone = makePhone(pc);
  pc.up = false;
  const t = await phone.createTask({ title: 'Buy stamps', listId: 'cal', due: '2026-10-22' });
  assert.match(t.id, /^offline-/);
  assert.deepEqual(plain((await phone.tasks()).tasks.map((x) => x.label)), ['Buy stamps']);
  assert.deepEqual(plain((await phone.events(...DAY)).events.map((e) => [e.kind, e.title])), [['task', 'Buy stamps']]);
  await phone.updateTask(t.id, { done: true });
  assert.deepEqual(plain((await phone.tasks()).tasks), [], 'done: off to the Archived tab');
  pc.up = true;
  await phone.syncNow();
  assert.deepEqual(pc.tasks.map((x) => [x.title, x.done]), [['Buy stamps', true]]);
});

test('out of reach, nothing waits on the network: changes and the calendar show at once', async () => {
  const pc = makePC(), phone = makePhone(pc);
  await phone.state();
  await phone.events(...DAY); // the calendar kept for offline
  pc.up = false;
  await phone.createEvent(block('First, while finding out')); // the one look that finds the PC gone
  const calls = pc.calls.length;
  const t0 = Date.now();
  const made = await phone.createEvent(block('Gym'));
  await phone.updateEvent(made.id, { start: '2026-10-22T17:00:00.000Z', end: '2026-10-22T18:00:00.000Z' });
  const shown = await phone.events(...DAY);
  await phone.tasks().catch(() => null);
  await phone.deleteEvent(made.id);
  const after = await phone.events(...DAY);
  assert.ok(Date.now() - t0 < 100, 'no waiting');
  assert.deepEqual(pc.calls.slice(calls).filter((c) => c !== 'ping'), [], 'nothing waits on the PC (only quick looks for it, in the background)');
  assert.deepEqual(plain(shown.events.map((e) => [e.title, e.start])), [['First, while finding out', '2026-10-22T15:00:00.000Z'], ['Gym', '2026-10-22T17:00:00.000Z']]);
  assert.deepEqual(plain(after.events.map((e) => e.title)), ['First, while finding out']);
  // Found again: the outbox goes.
  pc.up = true;
  await phone.syncNow();
  assert.deepEqual(pc.events.map((e) => e.title), ['First, while finding out']);
});

test('a task moved offline shows at its new time', async () => {
  const pc = makePC(), phone = makePhone(pc);
  const t = await phone.createTask({ title: 'Call the bank', listId: 'cal', due: '2026-10-22' });
  pc.events.push({ id: t.id, kind: 'task', title: 'Call the bank', start: '2026-10-22', end: '2026-10-23', allDay: true }); // the PC shows dated tasks on the calendar
  await phone.events(...DAY); // kept for offline
  pc.up = false;
  await phone.moveTask(t.id, { start: '2026-10-22T14:00:00.000Z' });
  const e = (await phone.events(...DAY)).events.find((x) => x.id === t.id);
  assert.equal(e?.start, '2026-10-22T14:00:00.000Z');
  assert.equal(e?.allDay, false);
});

test('a setting changed offline is kept on the phone at once and reaches the PC once it is back', async () => {
  const pc = makePC(), phone = makePhone(pc);
  await phone.state(); // kept for offline
  pc.up = false;
  const st = await phone.settings({ defaultCalendar: 'other', view: 'timeGridDay' });
  assert.equal(st.settings.defaultCalendar, 'other');
  assert.equal(st.settings.view, 'timeGridDay');
  assert.equal((await phone.state()).settings.defaultCalendar, 'other', 'and stays so offline');
  assert.equal(phone.outbox().pending, 1);
  pc.up = true;
  await phone.syncNow();
  assert.equal(pc.settings.defaultCalendar, 'other');
  assert.equal(pc.settings.view, undefined, 'the view is kept on the phone');
});

test('offline, the goals show what was kept; a command that needs the PC says so in a short word', async () => {
  const pc = makePC(), phone = makePhone(pc);
  await phone.goals();
  pc.up = false;
  assert.deepEqual(plain((await phone.goals()).map((g) => g.title)), ['Learn Arabic']);
  await assert.rejects(phone.breakdown ? phone.breakdown('x') : phone.news(), (err) => err.offline === true && err.message === phone.offlineText);
});

test('pairing that cannot reach the PC says where it tried, and the next try really tries', async () => {
  const pc = makePC(), phone = makePhone(pc, { paired: false });
  const link = 'http://192.168.1.20:4747/pair#a=192.168.1.20%3A4747%2C100.100.1.2%3A4747&t=token';
  pc.up = false;
  await assert.rejects(phone.pairLink(link), /couldn't reach your PC at 192.168.1.20:4747 or 100.100.1.2:4747.*Tailscale/);
  assert.equal(phone.paired(), false);
  pc.up = true;
  const before = pc.tries;
  await phone.pairLink(link);
  assert.ok(pc.tries > before, 'the second scan asks the PC, not the memory of the first one failing');
  assert.equal(phone.paired(), true);
});
