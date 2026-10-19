// Hyperfocus, phase 3: the hours you focus best (from rated sessions, and fed to Magic add),
// what to do next for a change of pace, and Hermes (any MCP agent) seeing and asking for sessions.
const test = require('node:test');
const assert = require('node:assert/strict');
const F = require('../src/renderer/focus-plan');
const plan = require('../src/main/magic-plan');
const store = require('../src/main/store');
const focus = require('../src/main/focus');

store.save = () => {};

const at = (h, m = 0, d = 18) => new Date(2026, 9, d, h, m).toISOString();
const session = (h, m, rating, mins = 50, d = 18) => ({ startedAt: at(h, m, d), endedAt: new Date(Date.parse(at(h, m, d)) + mins * 60000).toISOString(), rating });
const kindOf = (title) => plan.estimateLocal(title)[0]?.kind || 'other';

const LOG = [
  session(9, 0, 5), session(9, 30, 4, 50, 19), session(10, 15, 5, 50, 20),
  session(14, 0, 2), session(15, 0, 2, 50, 19), session(16, 0, 3, 50, 20), session(20, 0, null),
];

test('nothing is said about your best hours until there are enough rated sessions', () => {
  assert.equal(F.bestWindow(LOG.slice(0, 4)), null); // four rated
  assert.equal(F.bestWindow([]), null);
});

test('the best hours are the three in a row where sessions went deepest, starting where sessions began', () => {
  const best = F.bestWindow(LOG);
  assert.deepEqual([best.from, best.to, best.count], [9, 11, 3]); // named by the hours sessions started in
  assert.ok(Math.abs(best.avg - 14 / 3) < 1e-9);
  const hours = F.focusHours(LOG);
  assert.deepEqual([hours[9].count, hours[9].rated, hours[9].avg, hours[9].minutes], [2, 2, 4.5, 100]);
  assert.equal(hours[20].rated, 0); // not rated: counted, but not in the average
  assert.equal(hours[20].count, 1);
  assert.equal(F.hourScore(LOG, 15).count, 3);
  assert.ok(Math.abs(F.hourScore(LOG, 15).avg - 7 / 3) < 1e-9);
  assert.equal(F.hourScore(LOG, 3), null);
});

test('Magic add puts focus work in your best hours once they are known, and keeps its usual morning until then', () => {
  const day = new Date(2026, 9, 21);
  const t = (h) => new Date(2026, 9, 21, h).getTime();
  const tasks = () => plan.normalizeTasks([{ title: 'Write the report', minutes: 60, kind: 'focus' }]);
  const usual = plan.schedule([], tasks(), { day, from: t(8), to: t(21) }).blocks[0];
  assert.ok(new Date(usual.start).getHours() >= 9 && new Date(usual.start).getHours() < 12);
  const mine = plan.schedule([], tasks(), { day, from: t(8), to: t(21), focusPart: [14, 17] }).blocks[0];
  assert.ok(new Date(mine.start).getHours() >= 14 && new Date(mine.end).getHours() <= 17, `planned at ${new Date(mine.start).getHours()}`);
  // Nonsense hours are ignored.
  const odd = plan.schedule([], tasks(), { day, from: t(8), to: t(21), focusPart: [20, 3] }).blocks[0];
  assert.equal(new Date(odd.start).getHours(), new Date(usual.start).getHours());

  store.data.focusSessions = LOG.slice(0, 4);
  assert.equal(focus.bestFocusPart(), null);
  store.data.focusSessions = LOG;
  assert.deepEqual(focus.bestFocusPart(), [9, 11]);
  const ins = focus.insights(new Date(2026, 9, 21, 15, 10).getTime());
  assert.deepEqual([ins.best.from, ins.rated, ins.needed, ins.now.count], [9, 6, 5, 3]);
});

test('what next: a different kind of thing, today\'s first, and something active after a long sit', () => {
  const today = '2026-10-18';
  const tasks = [
    { id: 'a', title: 'Write the next chapter', date: today },
    { id: 'b', title: 'Call the bank', date: today, minutes: 10 },
    { id: 'c', title: 'Groceries', date: today },
    { id: 'd', title: 'Gym', date: '2026-10-17' },
    { id: 'e', title: 'Pick up parcel', date: '2026-10-25' }, // a later day: not yet
    { id: 'f', title: 'Clean the kitchen', done: true },
    { id: 'g', title: 'Write report', date: today }, // the session's own
    { id: 'h', title: 'Vacuum', backburner: true },
  ];
  const next = F.rotation(tasks, { current: { id: 'g', title: 'Write report' }, today, kindOf, minutes: 90 });
  assert.equal(next.length, 3);
  const ids = next.map((x) => x.task.id);
  assert.ok(!ids.includes('a'), 'more focus work comes last');
  assert.ok(!ids.some((id) => ['e', 'f', 'g', 'h'].includes(id)));
  assert.equal(ids[0], 'c'); // an errand, today, after 90 minutes sitting: it gets you moving
  assert.match(next[0].why, /Gets you moving after 90 minutes/);
  assert.match(next.find((x) => x.task.id === 'b').why, /A change of pace: a call · 10 min/);

  // It would not settle (rated 2): nothing more of the same kind, even if it is all there is.
  const only = F.rotation([{ id: 'a', title: 'Write the next chapter', date: today }], { current: { title: 'Write report' }, today, kindOf, rating: 2 });
  assert.deepEqual(only, []);
  const fine = F.rotation([{ id: 'a', title: 'Write the next chapter', date: today }], { current: { title: 'Write report' }, today, kindOf, rating: 4 });
  assert.match(fine[0].why, /More focus work/);
});

test('the suggestions come from your open tasks on the PC', async () => {
  const fakeHub = { getTasks: async () => ({ tasks: [{ id: 'g1/tl~main/1', title: 'Call Sam', label: 'Call Sam', date: null, minutes: 15 }, { id: 'g1/tl~main/2', title: 'Study Arabic', label: 'Study Arabic' }] }) };
  focus.start(fakeHub);
  const list = await focus.suggestions({ current: { title: 'Write the grant intro' } });
  assert.deepEqual(list[0].task, { id: 'g1/tl~main/1', title: 'Call Sam', minutes: 15 });
  assert.equal(list[0].kind, 'call');
});

test('Hermes sees whether a session is running and until when', async () => {
  store.data.settings.calls = { method: 'ntfy', ntfyTopic: 't' };
  store.data.focusActive = null;
  assert.deepEqual(focus.status(), { running: false });
  const t0 = Date.now();
  await focus.startActive({ startedAt: t0, plannedEnd: t0 + 30 * 60000, goal: 'Grant intro', escalate: false });
  const s = focus.status();
  assert.deepEqual([s.running, s.goal, s.hard_stop, s.phone_at_stop], [true, 'Grant intro', new Date(t0 + 30 * 60000).toISOString(), false]);
  // Asking for another while one runs: it says so and opens nothing.
  let opened = 0;
  focus.setRequestHandler(() => { opened++; });
  assert.equal(focus.request({ title: 'Something else' }).opened, false);
  assert.equal(opened, 0);
  await focus.endActive();
});

test('Hermes can ask for a session: the setup opens on the PC once, for the user to start', () => {
  store.data.focusActive = null;
  const seen = [];
  focus.setRequestHandler((r) => seen.push(r));
  const res = focus.request({ title: '  Draft the   grant intro ', minutes: 500 });
  assert.equal(res.opened, true);
  assert.equal(seen.length, 1);
  const req = focus.takeRequest();
  assert.deepEqual([req.title, req.taskId, req.minutes], ['Draft the grant intro', null, 240]);
  assert.equal(focus.takeRequest(), null); // taken once
  assert.throws(() => focus.request({}), /Name the task/);
});

test('the MCP server lists the Hyperfocus tools, and focus_history reports sessions and best hours', async () => {
  const mcp = require('../src/main/mcp');
  const tool = (name) => mcp.TOOLS.find((t) => t.name === name);
  for (const name of ['focus_status', 'focus_history', 'start_focus']) assert.ok(tool(name), name);
  store.data.focusSessions = LOG.map((s, i) => focus.clean({ ...s, goal: `Session ${i}`, stop: 'hard', plannedEnd: s.endedAt }));
  const out = await tool('focus_history').run({ limit: 2 });
  assert.deepEqual(out.sessions.map((s) => s.goal), ['Session 6', 'Session 5']);
  assert.equal(out.sessions[1].minutes, 50);
  assert.deepEqual(out.best_hours, { from: '9:00', to: '11:00', average_rating: 4.7, sessions: 3 });
  assert.equal(out.rated_sessions, 6);
});

test('two lucky sessions in a quiet stretch do not outweigh a steadier record, and late nights count too', () => {
  const s = (h, rating, back) => ({ startedAt: new Date(2026, 9, 18 - back, h).toISOString(), endedAt: new Date(2026, 9, 18 - back, h, 50).toISOString(), rating });
  const best = F.bestWindow([s(9, 5, 1), s(10, 4, 2), s(9, 5, 3), s(15, 2, 1), s(16, 3, 2), s(20, 3, 3)]);
  assert.deepEqual([best.from, best.to, best.count], [9, 11, 3]); // not "7 to 10 AM" for the two 9 AM fives
  const night = F.bestWindow([s(23, 5, 1), s(23, 5, 2), s(23, 4, 3), s(9, 2, 1), s(10, 2, 2)]);
  assert.deepEqual([night.from, night.to], [22, 24]); // at least two hours, within the day
});

test('a repeating task\'s copies are suggested once, today\'s copy first', () => {
  const today = '2026-10-18';
  const tasks = [
    { id: 's1', title: 'Stretch', date: '2026-10-16' }, { id: 's2', title: 'Stretch', date: '2026-10-17' }, { id: 's3', title: 'Stretch', date: today },
    { id: 'c', title: 'Call Alex', date: today },
  ];
  const next = F.rotation(tasks, { current: { title: 'Write the report' }, today, kindOf, minutes: 60 });
  assert.deepEqual(next.map((x) => x.task.id), ['s3', 'c']);
});
