// Breakdown with times: what Claude is told (everything written in the task, the time it has), the steps cut into
// that time, and the realistic timeline after it when that is clearly too little.

const test = require('node:test');
const assert = require('node:assert/strict');
const store = require('../src/main/store');
const google = require('../src/main/providers/google');
const hub = require('../src/main/hub');
const bp = require('../src/main/breakdown-plan');

store.save = () => {};

const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const day = (offset, h = 0, m = 0) => { const t = new Date(); return new Date(t.getFullYear(), t.getMonth(), t.getDate() + offset, h, m); };
const hm = (iso) => { const d = new Date(iso); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };

const fake = { events: new Map() };
google.events = async (req, cal, start, end) => [...fake.events.values()].filter((e) => e.cal === cal && new Date(e.end) > new Date(start) && new Date(e.start) < new Date(end));
google.tasks = async () => [];

const KEY = 'sk-ant-test-key-0000000000000000';
function reset({ key = KEY } = {}) {
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
const event = (id, title, start, end) => fake.events.set(id, { rawId: id, cal: 'primary', title, start: start.toISOString(), end: end.toISOString(), allDay: false, location: '', notes: '' });
const answer = (obj) => async () => ({ ok: true, status: 200, json: async () => ({ content: [{ type: 'text', text: JSON.stringify(obj) }] }) });

async function withFetch(impl, fn) {
  const real = global.fetch;
  global.fetch = impl;
  try { return await fn(); } finally { global.fetch = real; }
}

test('Breakdown: a block too short for it is cut into the steps, and a realistic timeline carries on after it in order', async () => {
  reset();
  event('orig', 'Write the report', day(1, 14), day(1, 17)); // the block being broken down: its time is what the steps get
  event('next', 'Gym', day(1, 17), day(1, 18));
  const { events } = await hub.getEvents(day(1).toISOString(), day(2).toISOString());
  const origId = events.find((e) => e.title === 'Write the report').id;
  let sent = null;
  const steps = [
    { title: 'Gather the figures', minutes: 60, fit: 40, notes: 'Q3 sheet in Drive' },
    { title: 'Write the draft', minutes: 90, fit: 60, notes: 'Use the blue template' },
    { title: 'Make the charts', minutes: 60, fit: 40, notes: '' },
    { title: 'Send it to Sam', minutes: 60, fit: 40, notes: '' },
  ];
  const r = await withFetch(async (url, init) => { sent = JSON.parse(init.body); return answer({ steps, fits: false, advice: 'Realistically 4 h 30; you have 3 h.' })(); }, () => bp.planBreakdown({
    title: 'Write the report', level: 3,
    notes: 'Use the blue template.\n\nChecklist:\n- [x] Ask Sam for the figures\n- [ ] Charts for Q3',
    frame: { start: day(1, 14).toISOString(), end: day(1, 17).toISOString() },
    exclude: [origId],
  }));
  const prompt = sent.messages[0].content;
  assert.match(prompt, /Use the blue template/, 'the notes go along');
  assert.match(prompt, /\[x\] Ask Sam for the figures/, 'the checklist, with what is done');
  assert.match(prompt, /180 minutes, one block from 14:00 to 17:00/);
  assert.match(sent.system, /except parts marked as already done/);

  assert.equal(r.fits, false);
  assert.equal(r.advice, 'Realistically 4 h 30; you have 3 h.');
  const [fit, real] = r.options;
  assert.equal(fit.key, 'fit');
  assert.deepEqual(fit.blocks.map((b) => `${hm(b.start)}-${hm(b.end)} ${b.title}`),
    ['14:00-14:40 Gather the figures', '14:40-15:40 Write the draft', '15:40-16:20 Make the charts', '16:20-17:00 Send it to Sam']);
  assert.equal(fit.blocks[1].notes, 'Use the blue template');

  assert.equal(real.key, 'real');
  assert.equal(hm(real.blocks[0].start), '14:00', 'from the start of its own time (the block itself is not in the way)');
  assert.deepEqual(real.blocks.map((b) => b.title), steps.map((s) => s.title), 'in order');
  for (let i = 1; i < real.blocks.length; i++) assert.ok(real.blocks[i - 1].end <= real.blocks[i].start);
  for (const b of real.blocks) assert.ok(hm(b.end) <= '17:00' || hm(b.start) >= '18:00', `${b.title} is clear of the gym`);
  assert.equal(real.minutes, 270);
});

test('Breakdown: when it fits there is one timeline, with Claude\'s lengths', async () => {
  reset();
  const r = await withFetch(answer({ steps: [
    { title: 'Outline', minutes: 30, fit: 30 }, { title: 'Write', minutes: 60, fit: 60 }, { title: 'Proofread', minutes: 20, fit: 20 },
  ], fits: true, advice: 'Fits, with time to spare.' }), () => bp.planBreakdown({
    title: 'Essay', frame: { start: day(1, 9).toISOString(), end: day(1, 12).toISOString() },
  }));
  assert.equal(r.options.length, 1);
  assert.deepEqual(r.options[0].blocks.map((b) => `${hm(b.start)}-${hm(b.end)}`), ['09:00-09:30', '09:30-10:30', '10:30-10:50']);
  assert.equal(r.need, 110);
});

test('Breakdown: squeezed lengths that still add up to too much are cut down to the time it has', async () => {
  reset();
  const r = await withFetch(answer({ steps: [
    { title: 'A', minutes: 120, fit: 120 }, { title: 'B', minutes: 60, fit: 60 }, { title: 'C', minutes: 60, fit: 60 },
  ], fits: false }), () => bp.planBreakdown({ title: 'Big', frame: { start: day(1, 9).toISOString(), end: day(1, 12).toISOString() } }));
  const fit = r.options[0];
  assert.equal(fit.minutes, 180);
  assert.equal(hm(fit.blocks.at(-1).end), '12:00');
  assert.deepEqual(fit.blocks.map((b) => b.minutes), [90, 45, 45]);
  assert.equal(r.options[1].key, 'real', '240 minutes for 180 is offered a longer timeline');
});

test('Breakdown: a task with only a date gets that day\'s free time, around what is there', async () => {
  reset();
  event('m', 'Meeting', day(1, 8), day(1, 12));
  let sent = null;
  const r = await withFetch(async (url, init) => { sent = JSON.parse(init.body); return answer({ steps: [
    { title: 'Plan the trip', minutes: 60, fit: 60 }, { title: 'Book the train', minutes: 30, fit: 30 },
  ], fits: true })(); }, () => bp.planBreakdown({ title: 'Trip', frame: { day: ymd(day(1)) } }));
  assert.match(sent.messages[0].content, /the free time on .*540 minutes in all \(12:00-21:00\)/);
  assert.equal(r.frame.kind, 'day');
  assert.equal(r.options.length, 1);
  for (const b of r.options[0].blocks) assert.ok(hm(b.start) >= '12:00', `${b.title} is after the meeting`);
  assert.deepEqual(r.options[0].blocks.map((b) => b.title), ['Plan the trip', 'Book the train']);
});

test('Breakdown with times needs the Claude key, and a step needs a name', async () => {
  reset({ key: '' });
  await assert.rejects(bp.planBreakdown({ title: 'X', frame: { day: ymd(day(1)) } }), /Claude API key/);
  assert.deepEqual(bp.normalizeSteps([{ title: '', minutes: 10 }, { title: 'Go', minutes: 7, fit: null }]), [{ title: 'Go', minutes: 5, fit: 5, notes: '' }]);
  assert.deepEqual(bp.squeeze([30, 30], 120), [30, 30], 'room to spare: left as they are');
  assert.deepEqual(bp.squeeze([5, 5, 5], 10), [5, 5, 5], 'never below 5 minutes');
});
