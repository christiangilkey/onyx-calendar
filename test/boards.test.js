// Boards: whiteboards for long workflows. The route through a board (the way each decision is taken), its
// steps planned into the calendar one after another, and boards kept and synced like the rest of Onyx.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const B = require('../src/renderer/boards');
const store = require('../src/main/store');
const boards = require('../src/main/boards');

store.save = () => {};
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const titles = (b, ids) => ids.map((id) => b.nodes.find((n) => n.id === id).title);
const card = (b, title) => b.nodes.find((n) => n.title === title);

test('the route follows every arrow, but only the way picked at a decision', () => {
  const b = B.newBoard('New board', true);
  const r = B.route(b);
  assert.deepEqual(titles(b, r.order), ['Moved in by the end of the month', 'Work out the budget', 'Rent or buy?', 'Shortlist 5 rentals', 'Book viewings', 'Pack and book the movers']);
  assert.deepEqual(titles(b, [...r.off]).sort(), ['Find an estate agent', 'Talk to the bank about a mortgage']);
  assert.deepEqual(r.open, []);
  assert.ok(!r.order.includes(card(b, 'Pick a branch on "Rent or buy?" and the route lights up. Plan it puts its steps in the calendar.').id), 'notes are never on it');
  // The other way: the rentals drop off, the bank and the agent come on; the movers still come last.
  const q = card(b, 'Rent or buy?');
  q.chosen = b.links.find((l) => l.from === q.id && l.label === 'Buy').id;
  assert.deepEqual(B.planSteps(b).map((n) => n.title), ['Work out the budget', 'Talk to the bank about a mortgage', 'Find an estate agent', 'Pack and book the movers']);
});

test('a decision with no way picked stops the route there, and says it is open', () => {
  const b = B.newBoard('New board', true);
  const q = card(b, 'Rent or buy?');
  q.chosen = null;
  const r = B.route(b);
  assert.deepEqual(r.open, [q.id]);
  assert.deepEqual(B.planSteps(b).map((n) => n.title), ['Work out the budget']);
});

test('several decisions in a row: each pick opens the next stretch; a loop still ends', () => {
  const b = { nodes: [], links: [] };
  const n = (id, kind, x, y) => b.nodes.push({ id, kind, x, y, title: id, minutes: 30 });
  const l = (id, from, to, label = '') => b.links.push({ id, from, to, label });
  n('a', 'step', 0, 0); n('d1', 'decision', 200, 0); n('b', 'step', 400, -100); n('c', 'step', 400, 100);
  n('d2', 'decision', 600, 100); n('e', 'step', 800, 0); n('f', 'step', 800, 200);
  l('1', 'a', 'd1'); l('2', 'd1', 'b', 'Yes'); l('3', 'd1', 'c', 'No'); l('4', 'c', 'd2'); l('5', 'd2', 'e', 'Now'); l('6', 'd2', 'f', 'Later');
  b.nodes.find((x) => x.id === 'd1').chosen = '3';
  assert.deepEqual(B.route(b).order, ['a', 'd1', 'c', 'd2']);
  assert.deepEqual(B.route(b).open, ['d2']);
  b.nodes.find((x) => x.id === 'd2').chosen = '6';
  assert.deepEqual(B.planSteps(b).map((x) => x.id), ['a', 'c', 'f']);
  l('7', 'f', 'a'); // back to the start: no card has nothing leading to it any more
  assert.deepEqual(new Set(B.route(b).order), new Set(['a', 'd1', 'c', 'd2', 'f']));
});

test('Plan it: one block after another, each its own length, with a break if asked', () => {
  const start = new Date(2026, 10, 9, 9, 0).getTime();
  const slots = B.backToBack([{ id: 'a', minutes: 45 }, { id: 'b', minutes: 0 }, { id: 'c', minutes: 90 }], start, 10);
  const hm = (t) => new Date(t).toTimeString().slice(0, 5);
  assert.deepEqual(slots.map((s) => [s.id, hm(s.start), hm(s.end)]), [['a', '09:00', '09:45'], ['b', '09:55', '10:25'], ['c', '10:35', '12:05']]);
  assert.equal(B.lengthText(90), '1 h 30 min');
  assert.equal(B.branchName(0), 'Yes');
  assert.equal(B.branchName(2), 'Option 3');
});

test('an arrow leaves from the side that faces the card it goes to', () => {
  const side = B.linkPath({ x: 0, y: 0, w: 100, h: 50 }, { x: 300, y: 10, w: 100, h: 50 });
  assert.match(side.d, /^M100 25 C/);
  assert.match(side.d, / 300 35$/);
  const down = B.linkPath({ x: 0, y: 0, w: 100, h: 50 }, { x: 0, y: 300, w: 100, h: 50 });
  assert.match(down.d, /^M50 50 C/);
  assert.match(down.d, / 50 300$/);
});

test('boards are kept tidy: only their own cards and arrows, picks that still exist, within bounds', () => {
  store.data.boards = [];
  const kept = boards.save({ id: 'board/abc123', title: '  ', nodes: [
    { id: 'n1', kind: 'decision', x: 1.4, y: 2, title: 'Q', chosen: 'gone' },
    { id: 'n2', kind: 'weird', x: 0, y: 0, title: 'A', minutes: 9999 },
    { id: 'n1', kind: 'step', x: 0, y: 0, title: 'twice' },
    { id: 'bad id!', kind: 'step', x: 0, y: 0 },
  ], links: [{ id: 'l1', from: 'n1', to: 'n2', label: 'Yes' }, { id: 'l2', from: 'n1', to: 'nope' }, { id: 'l3', from: 'n2', to: 'n2' }] });
  assert.equal(kept.title, 'Untitled board');
  assert.deepEqual(kept.nodes.map((n) => [n.id, n.kind]), [['n1', 'decision'], ['n2', 'step']]);
  assert.equal(kept.nodes[0].x, 1);
  assert.equal(kept.nodes[1].minutes, 720);
  assert.equal(kept.nodes[0].chosen, undefined, 'a pick that is not one of its arrows is dropped');
  assert.deepEqual(kept.links.map((l) => l.id), ['l1']);
  assert.throws(() => boards.save({ id: 'note/1' }), /not a board/);
  assert.equal(boards.boards().length, 1);
  boards.remove('board/abc123');
  assert.equal(boards.boards().length, 0);
});

test('boards sync between devices, reach the phone, and work offline there', () => {
  assert.match(read('src/main/sync.js'), /notes: LIST, goals: LIST, pins: LIST, accounts: LIST, boards: LIST,/);
  const api = read('src/main/api.js');
  assert.match(api, /'board:save': \(board\) => require\('\.\/boards'\)\.save\(board\),/);
  assert.match(read('src/renderer/remote.js'), /'note:delete', 'board:save', 'board:delete',/, 'saved later when the PC is out of reach');
  assert.match(read('src/preload.js'), /saveBoard: \(board\) => call\('board:save', board\),/);
  assert.match(read('scripts/build-mobile.js'), /'app\.js', 'graph\.js', 'boards\.js',/);
  const html = read('src/renderer/index.html');
  assert.ok(html.indexOf('<script src="boards.js">') < html.indexOf('<script src="app.js">'));
  assert.match(html, /<button id="board-toggle" class="icon-btn board-btn" title="Boards \(B\)"><\/button>/);
});

test('the app: Plan it makes a block per step, a pinch on a board stays on it', () => {
  const app = read('src/renderer/app.js');
  const plan = app.slice(app.indexOf('function planBoard('), app.indexOf('function pickView('));
  assert.match(plan, /const slots = OnyxBoards\.backToBack\(list, \+start, \+gap\.value\);/);
  assert.match(plan, /notes: \[`From the board "\$\{b\.title\}"`, n\.notes\]/);
  assert.match(plan, /n\.placed = \{ start: fields\.start, id: ev\.id \};/);
  assert.match(plan, /recordAction\(`Planned \$\{made\.length\} step/, 'with undo');
  assert.match(plan, /openMagic\(\{ text: lines\.join\('\\n'\), date: date\.value \}\);/, 'or Magic add fits them in');
  assert.match(app, /if \(graph\.on \|\| board\.on \|\| !calendar\) return null;/);
  assert.match(app, /if \(e\.touches\.length !== 2 \|\| graph\.on \|\| board\.on\)/);
  assert.match(app, /if \(board\.on\) \{ const n = board\.view\?\.add\('step'\); if \(n\) openBoardCard\(n\); return; \}/, 'the + adds a step');
  // Its classes are its own (Breakdown already has bd-).
  assert.doesNotMatch(read('src/renderer/boards.js'), /'bd-|"bd-|bd-card/);
});

test('a card picked shows its quick options; holding a card lifts it, holding empty space adds one there', () => {
  const js = read('src/renderer/boards.js');
  assert.match(js, /const HOLD_MS = 450;/);
  assert.match(js, /if \(act\.type === 'card' && !act\.picked\) act\.type = 'pan';/, 'a finger across a card not picked moves the board');
  assert.match(js, /a\.picked = a\.lifted = true;/, 'held: lifted to move');
  assert.match(js, /o\.onAddHere\?\.\(toWorld\(a\.x0, a\.y0\), \{ x: a\.x0, y: a\.y0 \}\);/, 'held on empty space: add here');
  assert.match(js, /space\.addEventListener\('contextmenu', \(e\) => \{/, 'the right button does the same on the PC');
  assert.match(js, /if \(a\.lifted\) \{ placeQuick\(\); return; \}/, 'held and let go: picked, not opened');
  const app = read('src/renderer/app.js');
  const q = app.slice(app.indexOf('function boardQuick('), app.indexOf('function openBoardAdd('));
  for (const label of ["'Edit'", "'Add a way' : 'Next'", "'Calendar'", "'Copy'", "'Delete'", "'Colour'"]) assert.ok(q.includes(label), label);
  assert.match(q, /n\.done = !n\.done;/);
  assert.match(app, /const n = board\.view\.add\(k, at && \{ x: at\.x - OnyxBoards\.KINDS\[k\]\.w \/ 2, y: at\.y - 30 \}\);/, 'placed where it was asked for');
});
