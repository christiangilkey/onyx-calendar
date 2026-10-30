// Magic add against a stand-in calendar and a stand-in Claude: what is sent, what is read back,
// and that the plan keeps clear of what is already in the day.

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
const hm = (iso) => { const d = new Date(iso); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };

const fake = { events: new Map() };
google.events = async (req, cal, start, end) => [...fake.events.values()].filter((e) => e.cal === cal && new Date(e.end) > new Date(start) && new Date(e.start) < new Date(end));
google.tasks = async () => [];

function reset({ key = '' } = {}) {
  fake.events.clear();
  const d = store.data;
  d.accounts = [{ id: 'g1', provider: 'google', label: 'me@example.com' }];
  d.calendars = { g1: [{ rawId: 'primary', kind: 'calendar', name: 'Personal', color: '#4aa8ff', writable: true }] };
  d.local.events = [];
  d.settings.hidden = {};
  d.settings.magic = { start: '08:00', end: '21:00' };
  d.secrets.anthropicKey = key;
  hub.invalidate();
}

const withFetch = (impl, fn) => async () => {
  const real = global.fetch;
  global.fetch = impl;
  try { await fn(); } finally { global.fetch = real; }
};

const CLAUDE_ANSWER = '```json\n' + JSON.stringify({
  tasks: [
    { title: 'Pick up prescription', minutes: 15, place: 'Pharmacy', when: 'afternoon', kind: 'errand', after: null, before: '17:30', why: 'Quick stop; closes at 18:00' },
    { title: 'Write report', minutes: 90, place: 'Home', when: 'morning', kind: 'focus', after: null, before: null, why: 'Needs a clear head' },
    { title: 'Call dentist', minutes: 10, place: null, when: 'any', kind: 'call', after: null, before: '16:00', why: 'Office hours' },
  ],
}) + '\n```';

test('Magic add with Claude: estimates come back, the day\'s entries are respected, no travel or lunch is added', withFetch(async (url, init) => {
  const body = JSON.parse(init.body);
  assert.equal(url, 'https://api.anthropic.com/v1/messages');
  assert.equal(init.headers['x-api-key'], 'sk-ant-test-key-0000000000000000');
  assert.match(body.messages[0].content, /10:00-11:00 Team sync @ Office/, 'the day\'s entries, with their places, are sent');
  assert.doesNotMatch(body.messages[0].content, /Home base|get around/, 'travel is not asked about');
  assert.doesNotMatch(body.system, /"travel"/);
  assert.match(body.messages[0].content, /Write report/);
  assert.ok(!JSON.stringify(body).includes('sk-ant'), 'the key is never in the body');
  return { ok: true, status: 200, json: async () => ({ content: [{ type: 'text', text: CLAUDE_ANSWER }] }) };
}, async () => {
  reset({ key: 'sk-ant-test-key-0000000000000000' });
  fake.events.set('e1', { rawId: 'e1', cal: 'primary', title: 'Team sync', start: day(1, 10).toISOString(), end: day(1, 11).toISOString(), allDay: false, location: 'Office', notes: '' });
  const r = await magic.planDay('Pick up prescription\nWrite report\nCall dentist', ymd(day(1)));
  assert.equal(r.source, 'claude');
  assert.equal(r.warning, '');
  assert.equal(r.blocks.length, 3);
  assert.equal(r.unplaced.length, 0);
  for (const b of r.blocks) assert.ok(hm(b.end) <= '10:00' || hm(b.start) >= '11:00', `${b.title} ${hm(b.start)}-${hm(b.end)} overlaps the 10:00 meeting`);
  const rx = r.blocks.find((b) => b.title === 'Pick up prescription');
  for (const b of r.blocks) assert.equal(b.travel, 0, `${b.title}: no travel added to the block`);
  assert.equal(rx.minutes, 15);
  assert.ok(hm(rx.end) <= '17:30', 'the "before 17:30" limit is kept');
  assert.equal(r.blocks.find((b) => b.title === 'Call dentist').place, null);
  assert.ok(r.tasks.length === 3 && r.travel.length === 0, 'what the screen needs to lay it out again');
}));

test('Magic add: lunchtime is not held free, so the first free time is used', withFetch(async () => ({ ok: true, status: 200, json: async () => ({ content: [{ type: 'text', text: JSON.stringify({ tasks: [
  { title: 'Sort the paperwork', minutes: 45, place: 'Home', when: 'any', kind: 'other', after: null, before: null, why: '' },
] }) }] }) }), async () => {
  reset({ key: 'sk-ant-test-key-0000000000000000' });
  // Free 12:30-13:15 (lunchtime) and from 14:00. Holding lunch used to push it to 14:00.
  fake.events.set('a', { rawId: 'a', cal: 'primary', title: 'Morning', start: day(1, 8).toISOString(), end: day(1, 12, 30).toISOString(), allDay: false, location: '', notes: '' });
  fake.events.set('b', { rawId: 'b', cal: 'primary', title: 'Meeting', start: day(1, 13, 15).toISOString(), end: day(1, 14).toISOString(), allDay: false, location: '', notes: '' });
  const r = await magic.planDay('Sort the paperwork', ymd(day(1)));
  assert.equal(hm(r.blocks[0].start), '12:30');
  assert.equal(r.blocks[0].travel, 0);
}));

test('Magic add: when Claude fails it plans from the words and says so', withFetch(async () => ({ ok: false, status: 500, json: async () => ({ error: { message: 'overloaded' } }) }), async () => {
  reset({ key: 'sk-ant-test-key-0000000000000000' });
  const r = await magic.planDay('Groceries\nStudy 1h', ymd(day(1)));
  assert.equal(r.source, 'local');
  assert.match(r.warning, /overloaded.*from the words/);
  assert.equal(r.blocks.length, 2);
}));

test('Magic add: nothing is sent without a key, and an unreadable answer falls back', async () => {
  reset({ key: '' });
  let called = false;
  const real = global.fetch;
  global.fetch = async () => { called = true; return { ok: true, status: 200, json: async () => ({}) }; };
  try {
    const r = await magic.planDay('Groceries', ymd(day(1)));
    assert.equal(called, false);
    assert.equal(r.source, 'local');
    reset({ key: 'sk-ant-test-key-0000000000000000' });
    global.fetch = async () => ({ ok: true, status: 200, json: async () => ({ content: [{ type: 'text', text: 'Sure! Here is a plan.' }] }) });
    const r2 = await magic.planDay('Groceries', ymd(day(1)));
    assert.equal(r2.source, 'local');
    assert.match(r2.warning, /could not be read/);
  } finally { global.fetch = real; }
});

test('Magic add: changing the tasks lays them out again without asking Claude', async () => {
  reset({ key: '' });
  const first = await magic.planDay('Groceries\nLaundry\nCall mum', ymd(day(1)));
  const tasks = first.tasks.filter((t) => t.title !== 'Laundry').map((t) => ({ ...t, minutes: t.title === 'Groceries' ? 90 : t.minutes }));
  const real = global.fetch;
  global.fetch = async () => { throw new Error('should not be called'); };
  try {
    const again = await magic.replan(tasks, first.travel, ymd(day(1)));
    assert.equal(again.source, 'edited');
    assert.equal(again.blocks.length, 2);
    assert.equal(again.blocks.find((b) => b.title === 'Groceries').minutes, 90);
  } finally { global.fetch = real; }
});

test('Magic add: today starts from now, and an empty request or a finished day says so', async () => {
  reset({ key: '' });
  const { from } = magic.windowOf(ymd(new Date()), { start: '00:00', end: '23:59' });
  assert.ok(from >= Date.now(), 'nothing is planned in the past');
  await assert.rejects(() => magic.planDay('   ', ymd(day(1))), /Describe what/);
  await assert.rejects(() => magic.planDay('Something', ymd(new Date()), { start: '00:00', end: '00:01' }), /over|after it starts/);
});

test('Magic add: reading Claude\'s answer copes with code fences and chatter', () => {
  assert.deepEqual(magic.parseAnswer('Here you go:\n```json\n{"tasks":[]}\n```'), { tasks: [] });
  assert.equal(magic.parseAnswer('no json here'), null);
  assert.equal(magic.parseAnswer('{broken'), null);
});
