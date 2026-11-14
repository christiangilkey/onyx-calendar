// Boards: optional steps (run it, skip it this time, or drop it), and long details on a card (up to 100,000
// characters, and a save with more is refused rather than cut: an Ecom board lost text that way at 4000).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const B = require('../src/renderer/boards');
const store = require('../src/main/store');
const boards = require('../src/main/boards');

store.save = () => {};
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const app = read('src/renderer/app.js');
const js = read('src/renderer/boards.js');
const css = read('src/renderer/styles.css');

const card = (id, kind, x, extra = {}) => ({ id, kind, x, y: 0, title: id, notes: '', ...extra });
const link = (id, from, to) => ({ id, from, to, label: '' });
// a → opt → b: an optional step in the middle of the flow.
const flow = (opt) => ({ id: 'board/test1', title: 'T', nodes: [card('a', 'step', 0, { minutes: 30 }), card('o', 'optional', 300, { minutes: 45, ...opt }), card('b', 'step', 600, { minutes: 20 })], links: [link('l1', 'a', 'o'), link('l2', 'o', 'b')] });

test('an optional step is kept with its length, its call and its place in the calendar', () => {
  const kept = boards.clean(flow({ choice: 'skip', placed: { start: '2026-11-14T09:00:00.000Z', id: 'ev1' }, done: true }));
  const o = kept.nodes.find((n) => n.id === 'o');
  assert.deepEqual({ kind: o.kind, minutes: o.minutes, choice: o.choice, placed: o.placed, done: o.done },
    { kind: 'optional', minutes: 45, choice: 'skip', placed: { start: '2026-11-14T09:00:00.000Z', id: 'ev1' }, done: true });
  for (const c of ['run', 'skip', 'drop']) assert.equal(boards.clean(flow({ choice: c })).nodes[1].choice, c);
  assert.equal('choice' in boards.clean(flow({ choice: 'maybe' })).nodes[1], false, 'only run, skip or drop');
  const step = boards.clean({ id: 'board/test1', title: 'T', nodes: [card('s', 'step', 0, { choice: 'run' })], links: [] }).nodes[0];
  assert.equal('choice' in step, false, 'a call is only an optional step\'s');
  assert.deepEqual([...boards.KINDS], ['step', 'optional', 'decision', 'goal', 'note']);
  assert.deepEqual([...boards.CHOICES], ['run', 'skip', 'drop']);
  // A board from before (no optional steps) comes back the same.
  const old = boards.clean({ id: 'board/test1', title: 'T', nodes: [card('s', 'step', 0, { minutes: 30 }), card('d', 'decision', 300)], links: [] });
  assert.deepEqual(old.nodes.map((n) => Object.keys(n).sort().join()), ['id,kind,minutes,notes,title,x,y', 'id,kind,notes,title,x,y']);
});

test('the route goes on through an optional step whatever its call; Plan it takes it only to be run', () => {
  const ids = (b) => B.planSteps(b).map((n) => n.id);
  assert.deepEqual(B.route(flow()).order, ['a', 'o', 'b']);
  assert.deepEqual(B.route(flow()).pending, ['o'], 'not decided yet: waiting for a call');
  assert.deepEqual(ids(flow()), ['a', 'b'], 'left out until it is to be run');
  assert.deepEqual(ids(flow({ choice: 'run' })), ['a', 'o', 'b']);
  assert.deepEqual(ids(flow({ choice: 'skip' })), ['a', 'b'], 'skipped: the route goes on past it');
  assert.deepEqual(ids(flow({ choice: 'drop' })), ['a', 'b']);
  for (const c of ['run', 'skip', 'drop']) assert.deepEqual(B.route(flow({ choice: c })).pending, []);
  assert.deepEqual(B.route(flow({ choice: 'skip' })).off, new Set(), 'skipped is still on the route, not off it');
  assert.deepEqual(Object.keys(B.CHOICES), ['run', 'skip', 'drop']);
});

test('"Optional: …" in a pasted list makes an optional step', () => {
  assert.equal(B.optionalText('Optional: hook test before making ads'), 'hook test before making ads');
  assert.equal(B.optionalText('Optional (non-core ideas to test)'), 'non-core ideas to test');
  assert.equal(B.optionalText('(Optional) Test a second angle'), 'Test a second angle');
  assert.equal(B.optionalText('optional - try TikTok'), 'try TikTok');
  assert.equal(B.optionalText('Optionally test X'), null, 'only the word itself');
  assert.equal(B.optionalText('Write the brief'), null);
  assert.equal(B.optionalText('Optional'), null, 'nothing after it: a step named Optional');
  const made = B.fromList('Write the brief\nOptional: hook test\nLaunch');
  assert.deepEqual(made.nodes.map((n) => [n.kind, n.title, n.minutes]), [['step', 'Write the brief', 30], ['optional', 'hook test', 30], ['step', 'Launch', 30]]);
  assert.equal(made.cut, 0);
});

test('a card keeps 100,000 characters of details; a save with more is refused, never cut', () => {
  assert.equal(boards.MAX_NOTES, 100000);
  assert.equal(B.MAX_NOTES, boards.MAX_NOTES, 'the canvas and the save agree');
  const long = 'x'.repeat(13000);
  const b = flow();
  b.nodes[0].notes = long;
  assert.equal(boards.clean(b).nodes[0].notes.length, 13000, 'a long how-to stays whole (was cut at 4000)');
  b.nodes[0].notes = 'y'.repeat(100000);
  assert.equal(boards.save(b).nodes[0].notes.length, 100000);
  b.nodes[1].notes = 'z'.repeat(100001);
  b.nodes[1].title = 'Hook test';
  assert.throws(() => boards.save(b), /"Hook test" has 100,001 characters of details, more than a card keeps \(100,000\)/);
  assert.equal(store.data.boards.find((x) => x.id === b.id).nodes[1].notes, '', 'the copy kept is the last good one');
  assert.doesNotMatch(read('src/main/boards.js'), /text\(n\.notes, 4000\)/);
  assert.doesNotMatch(js, /notes\.slice\(0, 4000\)/);
  // A pasted row with more than that is said in the toast, not cut without a word.
  const huge = B.fromList(`Step one\t${'w'.repeat(100005)}`);
  assert.equal(huge.cut, 1);
  assert.equal(huge.nodes[0].notes.length, 100000);
  assert.match(app, /const long = made\.cut \? ` \$\{made\.cut\} row/);
});

test('the editor counts long details and says when the board cannot be saved', () => {
  const editor = app.slice(app.indexOf('function openBoardCard('), app.indexOf('function paintMultiBar('));
  assert.match(editor, /count\.hidden = len < max \* 0\.8;/);
  assert.match(editor, /characters too many: a card keeps up to \$\{max\.toLocaleString\(\)\}\. The board is not saved until it is shorter\./);
  assert.match(css, /\.wb-notes-count\.warn \{/);
  // On the board, a long sticky note shows its first lines (all of it is in the panel).
  assert.match(js, /n\.notes\.length > 1200 \? `\$\{n\.notes\.slice\(0, 1200\)\.trimEnd\(\)\}…` : n\.notes/);
  assert.match(css, /\.wb-card\.k-note \.wb-body \{ display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 14; overflow: hidden; \}/);
});

test('an optional step on the board: its own look, Run / Skip / Drop on the card and in its panel', () => {
  assert.match(app, /const BOARD_KINDS = \['step', 'optional', 'decision', 'goal', 'note'\];/);
  assert.match(app, /\.\.\.BOARD_KINDS\.map\(\(k\) => h\('button', \{ type: 'button', class: `wb-menu-row k-\$\{k\}`/, 'in the Add menu');
  assert.match(js, /else if \(t\.closest\('\.wb-opt'\)\) \{ const w = t\.closest\('\.wb-opt'\); act = \{ \.\.\.base, type: 'tap', run: \(\) => decide\(w\.dataset\.node, w\.dataset\.choice\) \}; \}/);
  assert.match(js, /if \(n\.choice === choice\) delete n\.choice; else n\.choice = choice;/, 'tapped again: undecided');
  assert.match(app, /function optionalCall\(n, after\)/);
  assert.match(app, /if \(n\.kind === 'optional'\) body\.push\(optionalCall\(n, \(\) => \{ boardChanged\(\); board\.view\.draw\(\); \}\)\);/);
  assert.match(app, /delete copy\.choice;/, 'a copy waits for its own call');
  assert.match(app, /askNames\.length \? h\('p', \{ class: 'wb-warn' \}, `Not decided yet:/, 'Plan it says which are left out');
  assert.match(css, /\.wb-card\.k-optional \{ --k: #c3a6ff;[^}]*border: 1px dashed/);
  assert.match(css, /\.wb-card\.opt-drop \.wb-title \{ text-decoration: line-through;/);
});
