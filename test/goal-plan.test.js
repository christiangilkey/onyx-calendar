// Magic add for goals: Claude's plan read back into phases and measurable steps (one-off or repeating, in the
// time frame, never before today), every session given a time that is free in the calendar, and the steps
// saved on the goal with their phase, measure, length and last day; a habit for one phase stops after it.
const test = require('node:test');
const assert = require('node:assert/strict');
const plan = require('../src/main/goal-plan');
const store = require('../src/main/store');
const google = require('../src/main/providers/google');
const hub = require('../src/main/hub');
const goals = require('../src/main/goals');
const repeat = require('../src/main/repeat');

const T = { start: '2026-11-01', end: '2026-12-31', today: '2026-11-02' };
const at = (day, hm) => { const [h, m] = hm.split(':').map(Number); const d = new Date(+day.slice(0, 4), +day.slice(5, 7) - 1, +day.slice(8, 10), h, m); return +d; };

test('the plan is read back safely: known repeats, dates in range, lengths on the grid, no repeats of a title', () => {
  const answer = {
    phases: [{ name: 'Basics', start: '2026-10-01', end: '2026-11-30', milestone: 'Read 2 short texts' }, { name: 'Speak', start: '2026-12-01', end: '2027-03-01' }],
    tasks: [
      { title: 'Learn 20 new words', measure: '20 words in the deck', phase: 1, repeat: 'daily', start: '2026-10-20', until: '2027-01-30', minutes: 22, when: 'morning' },
      { title: 'Book a tutor for 3 lessons', phase: 2, repeat: 'once', start: '2026-12-05', minutes: 30 },
      { title: 'book a tutor for 3 lessons', phase: 2 },
      { title: 'Buy the textbook', done: true, start: '2026-10-15' },
      { title: 'Shadow 1 podcast', repeat: 'hourly', phase: 9, minutes: 900, when: 'night' },
      { title: '' },
    ],
  };
  const { phases, steps } = plan.normalize(answer, T);
  assert.deepEqual(phases.map((p) => [p.name, p.start, p.end]), [['Basics', '2026-11-01', '2026-11-30'], ['Speak', '2026-12-01', '2026-12-31']]);
  assert.equal(steps.length, 4);
  const [words, tutor, book, shadow] = steps;
  assert.deepEqual([words.repeat, words.due, words.until, words.minutes, words.when, words.phase, words.measure], ['daily', '2026-11-02', '2026-12-31', 20, 'morning', 'Basics', '20 words in the deck']); // a habit may run past its phase, not past the goal
  assert.deepEqual([tutor.repeat, tutor.due, tutor.until, tutor.phase], [null, '2026-12-05', null, 'Speak']);
  assert.deepEqual([book.done, book.due], [true, '2026-11-01']);
  assert.deepEqual([shadow.repeat, shadow.minutes, shadow.when, shadow.phase, shadow.due], [null, 180, 'any', '', '2026-11-02']);
});

test('the message asks for the hammers\' level and passes the outline and the steps already there', () => {
  const msg = plan.userMessage({ title: 'Reach B1 Arabic', ...T, outline: 'Grammar\n[x] Alphabet', level: 5, existing: [{ title: 'Read 10 pages', repeat: 'daily' }, { title: 'Find a course', done: true }] });
  assert.match(msg, /Today is 2026-11-02/);
  assert.match(msg, /\[x\] Alphabet/);
  assert.match(msg, /- Read 10 pages \(daily\)/);
  assert.match(msg, /- \[x\] Find a course/);
  assert.match(msg, /120 to 250 small steps/);
  assert.equal(Object.keys(plan.LEVELS).length, 5);
});

test('the days a step comes up on, by its repeat', () => {
  assert.deepEqual(plan.occurrences('weekdays', '2026-11-06', '2026-11-11'), ['2026-11-06', '2026-11-09', '2026-11-10', '2026-11-11']);
  assert.deepEqual(plan.occurrences('weekly', '2026-11-02', '2026-11-30'), ['2026-11-02', '2026-11-09', '2026-11-16', '2026-11-23', '2026-11-30']);
  assert.deepEqual(plan.occurrences('monthly', '2026-01-31', '2026-04-30'), ['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30']);
  assert.deepEqual(plan.occurrences(null, '2026-11-02', '2026-11-02'), ['2026-11-02']);
  assert.equal(plan.timesIn('daily', '2026-11-01', '2026-11-30'), 30);
});

test('sessions go where the calendar is free, never on each other, a full day moves a one-off a day later', () => {
  const busy = [
    { start: at('2026-11-02', '08:00'), end: at('2026-11-02', '09:30') }, // Monday morning meeting
    { start: at('2026-11-03', '08:00'), end: at('2026-11-03', '09:30') },
    { start: at('2026-11-04', '08:00'), end: at('2026-11-04', '21:00') }, // Wednesday is full
  ];
  const steps = [
    { title: 'Learn 20 words', repeat: 'daily', due: '2026-11-02', until: '2026-11-08', minutes: 30, when: 'morning' },
    { title: 'Review 1 lesson', repeat: 'daily', due: '2026-11-02', until: '2026-11-08', minutes: 30, when: 'morning' },
    { title: 'Write 1 essay', repeat: null, due: '2026-11-04', minutes: 60, when: 'any', phaseEnd: '2026-11-30' },
    { title: 'Buy a book', repeat: null, due: '2026-11-05', minutes: 0 },
  ];
  plan.fitTimes(steps, busy, { today: '2026-11-02', dayStart: '08:00', dayEnd: '21:00', end: '2026-12-31' });
  const [words, review, essay, book] = steps;
  assert.equal(words.time, '09:30'); // after the meetings, still in the morning
  assert.equal(review.time, '10:00'); // and the next one after it, not on top of it
  assert.equal(words.clash, 1); // Wednesday was full at every hour: one day of seven overlaps
  assert.deepEqual([essay.due, essay.time, essay.clash], ['2026-11-05', '08:00', 0]); // Wednesday full: Thursday
  assert.equal(book.time, undefined); // no length: no time
});

test('the numbers: tasks, habits, one-offs, done, and hours a week', () => {
  const s = plan.summary([
    { repeat: 'daily', due: '2026-11-01', until: '2026-11-28', minutes: 30 },
    { repeat: null, due: '2026-11-03', minutes: 120 },
    { repeat: null, due: '2026-11-01', done: true, minutes: 60 },
  ], { start: '2026-11-01', end: '2026-11-29' });
  assert.deepEqual(s, { tasks: 3, habits: 1, once: 1, done: 1, sessions: 29, hoursPerWeek: 4 });
});

// ---------------------------------------------------------------- saving the plan on a goal

store.save = () => {};
let tasks, seq;
google.tasks = async () => [...tasks.values()].filter((t) => !t.done).map((t) => ({ ...t }));
google.getTask = async (req, list, id) => (tasks.has(id) ? { ...tasks.get(id) } : null);
google.createTask = async (req, list, d) => { const t = { rawId: `t${++seq}`, title: d.title, notes: d.notes || '', due: d.due || null, done: false }; tasks.set(t.rawId, t); return { ...t }; };
google.updateTask = async (req, list, id, d) => { if (!tasks.has(id)) throw Object.assign(new Error('gone'), { status: 404 }); return { ...Object.assign(tasks.get(id), d) }; };
google.deleteTask = async (req, list, id) => { tasks.delete(id); };
function reset() {
  tasks = new Map();
  seq = 0;
  const d = store.data;
  d.accounts = [{ id: 'g1', provider: 'google', label: 'me@example.com' }];
  d.calendars = { g1: [{ rawId: 'tasks', kind: 'tasklist', name: 'My Tasks', color: '#f5b83d', writable: true }] };
  Object.assign(d, { piLinks: {}, tags: {}, goals: [], repeats: {}, repeatSpawned: {}, taskMinutes: {}, pomodoro: {} });
  d.settings.hidden = {};
  d.settings.pi = { enabled: false, taskList: '', leadMinutes: 60, quietStart: '22:00', quietEnd: '07:00' };
  d.settings.calls = { method: 'pi' };
  hub.invalidate();
}

test('a planned goal keeps each step\'s phase, measure, length and last day; done ones make no task', async () => {
  reset();
  const far = new Date(Date.now() + 30 * 86400000);
  const end = `${far.getFullYear()}-${String(far.getMonth() + 1).padStart(2, '0')}-${String(far.getDate()).padStart(2, '0')}`;
  const today = new Date();
  const day = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const g = await goals.create({
    title: 'Reach B1 Arabic', start: day, end,
    steps: [
      { title: 'Learn 20 words', repeat: 'daily', due: day, until: end, time: '09:30', minutes: 30, phase: 'Basics', measure: '20 words in the deck' },
      { title: 'Buy the textbook', due: day, done: true, phase: 'Basics' },
      { title: 'Review the month', repeat: 'monthly', due: day, phase: 'Basics' },
    ],
  });
  assert.equal(tasks.size, 2); // the done one has no task
  const words = g.steps[0];
  assert.deepEqual([words.phase, words.measure, words.minutes, words.until, words.from], ['Basics', '20 words in the deck', 30, end, day]);
  assert.equal(words.target, 31);
  assert.equal(store.data.taskMinutes[words.taskId], 30);
  assert.equal(repeat.ruleOf(words.taskId).until, end);
  assert.match([...tasks.values()][0].notes, /Done when: 20 words in the deck/);
  // Saving from the goal's window (which sends none of these) keeps them.
  const again = await goals.update(g.id, { steps: g.steps.map((s) => ({ id: s.id, title: s.title, due: s.repeat ? null : s.due, time: s.time || null, done: s.done, repeat: s.repeat || null })) });
  assert.deepEqual([again.steps[0].phase, again.steps[0].measure, again.steps[0].until], ['Basics', '20 words in the deck', end]);
});

test('a repeating step stops after its last day, and the next task keeps its length', async () => {
  reset();
  const t = await hub.createTask({ title: 'Practise 20 min', due: '2026-11-02', listId: 'g1/tl~tasks' });
  repeat.setRule(t.id, 'daily', '2026-11-03');
  hub.setTaskMinutes(t.id, 20);
  const a = await hub.updateTask(t.id, { done: true });
  assert.ok(a.next);
  assert.equal(store.data.taskMinutes[a.next.id], 20);
  assert.equal(repeat.ruleOf(a.next.id).until, '2026-11-03');
  // Done again on a day past the last one: no next task.
  store.data.repeats[a.next.id].until = '2000-01-01';
  const b = await hub.updateTask(a.next.id, { done: true });
  assert.equal(b.next, null);
  assert.equal(repeat.ruleOf(a.next.id), null);
});

test('the window has the Magic add button, the hammers, and keeps the plan\'s details when saving', () => {
  const app = require('fs').readFileSync(require('path').join(__dirname, '../src/renderer/app.js'), 'utf8');
  assert.match(app, /class: 'magic-goal'.*openGoalMagic\(null,.*'Magic add goal'\)/);
  assert.match(app, /onyx\.planGoal\(\{ title: title\.value\.trim\(\), start: start\.value, end: end\.value, outline: outline\.value, level, fit: fit\.checked, goalId: g\?\.id \|\| null \}\)/);
  assert.match(app, /openGoalMagic\(g, r, gLevel\)/);
  assert.match(app, /\['biweekly', 'Every 2 weeks'\], \['monthly', 'Monthly'\]\]/);
  const remote = require('fs').readFileSync(require('path').join(__dirname, '../src/renderer/remote.js'), 'utf8');
  assert.match(remote, /'goal:plan': 330000/);
});

test('a planned task name longer than 30 characters is cut at a word and said in full as its measure', () => {
  const { steps } = plan.normalize({ tasks: [{ title: 'Read twenty pages of the Arabic grammar textbook', repeat: 'daily' }] }, T);
  assert.equal(steps[0].title, 'Read twenty pages of the');
  assert.ok(steps[0].title.length <= 30);
  assert.equal(steps[0].measure, 'Read twenty pages of the Arabic grammar textbook');
});

test('a block keeps its links: web addresses only, in order, without repeats', () => {
  reset();
  store.data.blockLinks = {};
  const out = hub.setBlockLinks('local/blocks/1', [
    { url: 'notion.so/abc', title: 'Study plan', source: 'notion', kind: 'page' },
    { url: 'https://drive.google.com/file/d/1', title: '', source: 'drive', kind: 'doc' },
    { url: 'javascript:alert(1)', title: 'bad' },
    { url: 'https://notion.so/abc', title: 'again', source: 'notion' },
  ]);
  assert.deepEqual(out.map((l) => [l.url, l.title, l.source]), [['https://notion.so/abc', 'Study plan', 'notion'], ['https://drive.google.com/file/d/1', 'drive.google.com', 'drive']]);
  assert.deepEqual(hub.setBlockLinks('local/blocks/1', []), []);
  assert.equal(store.data.blockLinks['local/blocks/1'], undefined);
});

// ---------------------------------------------------------------- details for a step's block

test('Claude may give a step details for its block: a checklist, links and a tip, cleaned', () => {
  assert.match(plan.SYSTEM, /"checklist"/);
  assert.match(plan.SYSTEM, /never a guessed address/);
  const today = '2026-11-01';
  const { steps } = plan.normalize({
    phases: [],
    tasks: [
      { title: 'Write 300 words', start: '2026-11-02', minutes: 30, checklist: ['  Open the draft ', 'Write 300 words', 'write 300 words', { text: 'Save it' }, ''], links: [{ title: 'Hemingway', url: 'https://hemingwayapp.com/' }, { url: 'nope' }, { url: 'javascript:alert(1)' }, { url: 'https://hemingwayapp.com/' }], tip: ' Start mid-sentence. ' },
      { title: 'Plain step', start: '2026-11-03' },
      { title: 'Old step', start: '2026-10-01', done: true, checklist: ['x'] },
    ],
  }, { start: today, end: '2026-12-31', today });
  const by = (title) => steps.find((s) => s.title === title);
  const [write, plain, old] = [by('Write 300 words'), by('Plain step'), by('Old step')];
  assert.deepEqual(write.checklist, ['Open the draft', 'Write 300 words', 'Save it']);
  assert.deepEqual(write.links, [{ title: 'Hemingway', url: 'https://hemingwayapp.com/' }]);
  assert.equal(write.tip, 'Start mid-sentence.');
  assert.ok(!('checklist' in plain) && !('links' in plain) && !('tip' in plain), 'none when Claude gave none');
  assert.ok(!('checklist' in old), 'a done step has no block');
  assert.match(plan.userMessage({ title: 'G', start: today, end: '2026-12-31', today, level: 5 }), /only to the tasks that need them most/);
  assert.doesNotMatch(plan.userMessage({ title: 'G', start: today, end: '2026-12-31', today, level: 2 }), /need them most/);
});

test('saving puts a new step\'s checklist and links on its task\'s block, the tip in its notes; a repeat carries them on', async () => {
  reset();
  Object.assign(store.data, { blockTasks: {}, blockLinks: {}, blockTicks: {} });
  const today = new Date();
  const day = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const far = new Date(Date.now() + 30 * 86400000);
  const end = `${far.getFullYear()}-${String(far.getMonth() + 1).padStart(2, '0')}-${String(far.getDate()).padStart(2, '0')}`;
  const g = await goals.create({
    title: 'Write a novel', start: day, end,
    steps: [
      { title: 'Write 300 words', repeat: 'daily', due: day, until: end, time: '07:00', minutes: 30, checklist: ['Open the draft', 'Write 300 words'], links: [{ title: 'Hemingway', url: 'https://hemingwayapp.com/' }], tip: 'Start mid-sentence.' },
      { title: 'Pick a title', due: day },
    ],
  });
  const [write, pick] = g.steps;
  assert.deepEqual(store.data.blockTasks[write.taskId].map((x) => x.text), ['Open the draft', 'Write 300 words']);
  assert.equal(store.data.blockLinks[write.taskId][0].url, 'https://hemingwayapp.com/');
  assert.match([...tasks.values()].find((x) => x.title.startsWith('Write 300 words')).notes, /\n\nStart mid-sentence\.$/);
  assert.equal(store.data.blockTasks[pick.taskId], undefined);
  // The task, as the calendar and the task list see it, has them.
  const { tasks: list } = await hub.getTasks({ force: true });
  const t = list.find((x) => x.id === write.taskId);
  assert.deepEqual(t.taskList.map((x) => [x.text, x.done]), [['Open the draft', false], ['Write 300 words', false]]);
  assert.equal(t.links[0].title, 'Hemingway');
  // Ticked today, done: tomorrow's copy has the same checklist, unticked, and the links.
  hub.tickBlockTask(write.taskId, t.taskList[0].id, true);
  const res = await hub.updateTask(write.taskId, { done: true });
  assert.ok(res.next);
  assert.deepEqual(store.data.blockTasks[res.next.id].map((x) => x.text), ['Open the draft', 'Write 300 words']);
  assert.equal(store.data.blockLinks[res.next.id][0].url, 'https://hemingwayapp.com/');
  assert.equal(store.data.blockTicks[res.next.id], undefined);
});

test('a task\'s window edits its block\'s checklist and links, and the goal window sends what was kept', () => {
  const app = require('fs').readFileSync(require('path').join(__dirname, '../src/renderer/app.js'), 'utf8');
  const openTask = app.slice(app.indexOf('function openTask('), app.indexOf('function breakdownField('));
  assert.match(openTask, /blockTaskField\(t\.taskList \|\| \[\]/);
  assert.match(openTask, /await onyx\.setBlockTasks\(t\.id, list\.items\)/);
  assert.match(openTask, /await onyx\.setBlockLinks\(t\.id, links\)/);
  assert.match(app, /checklist: s\.checklist \|\| \[\], links: s\.links \|\| \[\], tip: s\.tip \|\| ''/);
  assert.match(app, /`On its block: \$\{parts\.join\(' · '\)\}`/);
});
