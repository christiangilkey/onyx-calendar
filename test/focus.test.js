// Hyperfocus: the hard stop picked before starting, the quick tasks to clear first, the steps
// in the notes, the "where I left off" note, the check-in times, the noise, and the session log.
const test = require('node:test');
const assert = require('node:assert/strict');
const F = require('../src/renderer/focus-plan');
const store = require('../src/main/store');
const focus = require('../src/main/focus');

store.save = () => {};

const MIN = 60000;
const now = new Date(2026, 9, 18, 14, 0).getTime(); // 2:00 PM
const at = (h, m = 0) => new Date(2026, 9, 18, h, m).toISOString();
const ev = (id, sh, sm, eh, em, extra = {}) => ({ id, kind: 'event', title: id, start: at(sh, sm), end: at(eh, em), allDay: false, ...extra });

test('the next entry is the soonest timed event to come, never a task, an all-day entry or the session\'s own', () => {
  const items = [
    ev('later', 17, 0, 18, 0), ev('soon', 15, 30, 16, 0), ev('allday', 15, 0, 16, 0, { allDay: true }),
    { id: 't', kind: 'task', title: 'task', start: at(14, 30), end: at(14, 45) }, ev('done', 14, 30, 15, 0, { done: true }), ev('past', 13, 0, 14, 30),
  ];
  assert.equal(F.nextEntry(items, now).id, 'soon');
  assert.equal(F.nextEntry(items, now, { id: 'soon', start: at(15, 30) }).id, 'later');
  assert.equal(F.nextEntry([], now), null);
});

test('the hard stop is the next entry minus its transition band, or a set length when nothing is near', () => {
  const plan = F.stopOptions({ now, items: [ev('Dentist', 16, 0, 17, 0)], band: 15 });
  const next = plan.options.find((o) => o.key === 'next');
  assert.equal(new Date(next.at).getHours(), 15);
  assert.equal(new Date(next.at).getMinutes(), 45); // 4:00 minus the 15-minute band
  assert.equal(next.minutes, 105);
  assert.equal(plan.pick, 'next');
  assert.equal(plan.next.title, 'Dentist');
  // A length that runs past the next entry says so.
  assert.equal(plan.options.find((o) => o.key === 'len120').pastNext, true);
  assert.equal(plan.options.find((o) => o.key === 'len60').pastNext, false);

  // Nothing for hours: the remembered length is picked.
  const free = F.stopOptions({ now, items: [ev('Dinner', 19, 0, 20, 0)], length: 45 });
  assert.equal(free.pick, 'len45');
  assert.equal(free.options.find((o) => o.key === 'len45').at, now + 45 * MIN);
  assert.equal(free.options.find((o) => o.key === 'len45').minutes, 45);
  assert.ok(free.options.some((o) => o.key === 'next')); // offered, 5 hours away, but not picked
  // Tomorrow morning's meeting is not offered as tonight's stop.
  const late = F.stopOptions({ now, items: [{ ...ev('Formation', 0, 0, 1, 0), start: new Date(now + 15 * 3600000).toISOString() }] });
  assert.equal(late.options.some((o) => o.key === 'next'), false);
  assert.equal(late.next.title, 'Formation');
});

test('too little time for the band: the stop is the start itself; too little for anything: no natural stop', () => {
  const close = F.stopOptions({ now, items: [ev('Call', 14, 20, 14, 50)], band: 15 });
  const next = close.options.find((o) => o.key === 'next');
  assert.equal(next.at, Date.parse(at(14, 20))); // 5 minutes after the band would be too short
  const tooClose = F.stopOptions({ now, items: [ev('Call', 14, 5, 14, 50)] });
  assert.equal(tooClose.options.some((o) => o.key === 'next'), false);
  assert.equal(tooClose.options.every((o) => o.pastNext), true);
});

test('started from a block that is on now, its end is a stop too, and the earliest natural one is picked', () => {
  const own = ev('Deep work', 13, 30, 15, 0);
  const plan = F.stopOptions({ now, items: [own, ev('Standup', 16, 0, 16, 15)], own });
  assert.equal(plan.pick, 'block');
  assert.equal(plan.options.find((o) => o.key === 'block').at, Date.parse(at(15, 0)));
  assert.equal(plan.options.find((o) => o.key === 'next').at, Date.parse(at(15, 45)));
});

test('quick tasks: today\'s open ones of 10 minutes or less, shortest first, not the session\'s own', () => {
  const today = '2026-10-18';
  const list = [
    { id: 'a', title: 'Reply to Sam', date: today, minutes: 10 },
    { id: 'b', title: 'Water plants', date: today, minutes: 5 },
    { id: 'c', title: 'Write report', date: today, minutes: 90 },
    { id: 'd', title: 'No length', date: today },
    { id: 'e', title: 'Tomorrow', date: '2026-10-19', minutes: 5 },
    { id: 'f', title: 'Done', date: today, minutes: 5, done: true },
    { id: 'g', title: 'Timed', start: at(16, 0), minutes: 5 },
    { id: 'h', title: 'Pomodoro', date: today, pomodoro: { work: 5, rest: 5, minutes: 10 } },
  ];
  assert.deepEqual(F.quickTasks(list, today).map((t) => t.id), ['b', 'g', 'a', 'h']);
  assert.deepEqual(F.quickTasks(list, today, { skipId: 'b' }).map((t) => t.id), ['g', 'a', 'h']);
});

test('the steps already in the notes are read, ticked or not, and the first open one is the step', () => {
  const steps = F.notesSteps('Some notes\n- [x] Open the file\n- [ ] Write the intro\n2. Send it\n* Tidy up\nnot a step');
  assert.deepEqual(steps, [
    { text: 'Open the file', done: true }, { text: 'Write the intro', done: false }, { text: 'Send it', done: false }, { text: 'Tidy up', done: false },
  ]);
  assert.equal(F.currentStep(steps).text, 'Write the intro');
  assert.equal(F.currentStep([{ text: 'x', done: true }]), null);
});

test('"where I left off" goes at the end of the notes and replaces the one from last time', () => {
  const once = F.leftOffNote('Bring the slides', { where: 'Intro written,\n half the method', next: 'Draft the results table', when: 'Sat, Oct 18, 3:45 PM' });
  assert.equal(once, 'Bring the slides\n\n⏸ Where I left off (Sat, Oct 18, 3:45 PM)\nWhere I am: Intro written, half the method\nNext step: Draft the results table');
  const twice = F.leftOffNote(once, { next: 'Check the numbers' });
  assert.equal(twice, 'Bring the slides\n\n⏸ Where I left off\nNext step: Check the numbers');
  assert.deepEqual(F.lastLeftOff(once), { where: 'Intro written, half the method', next: 'Draft the results table' });
  assert.equal(F.lastLeftOff('Nothing here'), null);
  // Nothing written: the notes stay as they were (without an old note).
  assert.equal(F.leftOffNote('Keep me', {}), 'Keep me');
  assert.equal(F.leftOffNote('', { where: 'x' }), '⏸ Where I left off\nWhere I am: x');
});

test('a long note keeps the new "where I left off" and stays within the notes limit', () => {
  const out = F.leftOffNote('y'.repeat(9000), { where: 'Here', next: 'Then this' });
  assert.ok(out.length <= 8000);
  assert.ok(out.endsWith('Where I am: Here\nNext step: Then this'));
});

test('the soft check-in comes a set time after the start, then after each answer, and never when off', () => {
  assert.equal(F.nextCeiling(now, 45), now + 45 * MIN);
  assert.equal(F.nextCeiling(now, 45, now + 50 * MIN), now + 95 * MIN);
  assert.equal(F.nextCeiling(now, 0), null);
});

test('white and pink noise stay within range, and pink is smoother than white', () => {
  let seed = 7;
  const rand = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const white = F.fillNoise('white', new Float32Array(20000), rand);
  const pink = F.fillNoise('pink', new Float32Array(20000), rand);
  for (const buf of [white, pink]) assert.ok(buf.every((v) => Math.abs(v) <= 1));
  // Sample-to-sample change: pink noise (more low end) moves less than white.
  const jitter = (b) => b.slice(1).reduce((sum, v, i) => sum + Math.abs(v - b[i]), 0) / b.length;
  assert.ok(jitter(pink) < jitter(white));
  assert.ok(jitter(pink) > 0);
  assert.equal(F.noiseGain(0), 0);
  assert.ok(F.noiseGain(50) < F.noiseGain(100));
  assert.equal(F.noiseGain(500), F.noiseGain(100));
});

test('a finished session is kept in the log in one shape, cleaned and capped', () => {
  store.data.focusSessions = [];
  const rec = focus.logSession({
    entry: { id: 'g1/tl~main/a', kind: 'task', title: 'Write report' }, goal: '  Draft   the report ', firstStep: 'Open the doc',
    startedAt: now, plannedEnd: now + 90 * MIN, endedAt: now + 60 * MIN, stop: 'ceiling',
    ceiling: { minutes: 45, asks: [{ at: now + 45 * MIN, choice: 'keep' }, { at: 'nonsense' }] },
    sound: { kind: 'pink', volume: 140 }, hook: 'race', preflight: ['water', 'phone', 'water', 'rocket'],
    steps: { total: 6, done: 9 }, captured: 2, where: 'Half done', next: 'Results', windDown: 5, extra: 'dropped',
  });
  assert.equal(rec.v, 2);
  assert.equal(rec.goal, 'Draft the report');
  assert.equal(rec.startedAt, new Date(now).toISOString());
  assert.equal(rec.stop, 'ceiling');
  assert.deepEqual(rec.ceiling, { minutes: 45, asks: [{ at: new Date(now + 45 * MIN).toISOString(), choice: 'keep' }] });
  assert.deepEqual(rec.sound, { kind: 'pink', volume: 100 });
  assert.deepEqual(rec.preflight, ['water', 'phone']);
  assert.deepEqual(rec.steps, { total: 6, done: 6 });
  assert.equal(rec.rating, null); // not given
  assert.equal('extra' in rec, false);
  assert.equal(store.data.focusSessions.length, 1);

  // Unknown values fall back; a session needs its start.
  const odd = focus.logSession({ startedAt: now, endedAt: now - MIN, stop: 'exploded', sound: { kind: 'jazz' }, hook: 'x' });
  assert.equal(odd.stop, 'early');
  assert.equal(odd.endedAt, odd.startedAt);
  assert.deepEqual([odd.sound.kind, odd.hook, odd.entry], ['none', 'none', null]);
  assert.throws(() => focus.logSession({ goal: 'no start' }), /time it started/);

  // Read back by date; the oldest go once the log is full.
  assert.equal(focus.sessions({ from: new Date(now + MIN) }).length, 0);
  assert.equal(focus.sessions({ from: new Date(now - MIN), to: new Date(now + MIN) }).length, 2);
  store.data.focusSessions = Array.from({ length: focus.MAX_SESSIONS }, (_, i) => ({ id: String(i), startedAt: new Date(now - i * MIN).toISOString() }));
  focus.logSession({ startedAt: now });
  assert.equal(store.data.focusSessions.length, focus.MAX_SESSIONS);
  assert.equal(store.data.focusSessions[0].id, '1');
});

// ---------------------------------------------------------------- phase 2

test('the log keeps how deep it went (1 to 5), the body checks and whether the phone was to be reached', () => {
  store.data.focusSessions = [];
  const rec = focus.logSession({ startedAt: now, rating: 4, escalate: true, bodyChecks: { every: 30, shown: 2 }, sound: { kind: 'rain', volume: 40 } });
  assert.deepEqual([rec.rating, rec.escalate, rec.bodyChecks, rec.sound.kind], [4, true, { every: 30, shown: 2 }, 'rain']);
  for (const bad of [0, 6, 2.5, 'deep', null]) assert.equal(focus.logSession({ startedAt: now, rating: bad }).rating, null);
  for (const kind of ['brown', 'waves', 'spotify']) assert.equal(focus.logSession({ startedAt: now, sound: { kind } }).sound.kind, kind);
});
