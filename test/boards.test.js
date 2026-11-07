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
  assert.match(plan, /if \(await bookSteps\(b, chosen\(\), start, \+gap\.value\) === null\) \{ paint\(\); return; \}/);
  assert.match(plan, /openMagic\(\{ text: lines\.join\('\\n'\), date: date\.value \}\);/, 'or Magic add fits them in');
  const book = app.slice(app.indexOf('async function bookSteps('), app.indexOf('function planStep('));
  assert.match(book, /const slots = OnyxBoards\.backToBack\(list, \+start, gap\);/);
  assert.match(book, /notes: \[`From the board "\$\{b\.title\}"`, n\.notes\]/);
  assert.match(book, /n\.placed = \{ start: fields\.start, id: ev\.id \};/);
  assert.match(book, /recordAction\(one \? `Added \$\{one\} to the calendar` : `Planned \$\{made\.length\} steps/, 'with undo');
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
  for (const label of ["'Edit'", "'Add a way' : 'Next'", "'Add to calendar'", "'Copy'", "'Delete'", "'Colour'"]) assert.ok(q.includes(label), label);
  assert.match(q, /n\.done = !n\.done;/);
  assert.match(app, /const n = board\.view\.add\(k, at && \{ x: at\.x - OnyxBoards\.KINDS\[k\]\.w \/ 2, y: at\.y - 30 \}\);/, 'placed where it was asked for');
});

test('a step picked goes into the calendar on its own: Add to calendar, first among its options', () => {
  const app = read('src/renderer/app.js');
  const q = app.slice(app.indexOf('function boardQuick('), app.indexOf('function openBoardAdd('));
  assert.ok(q.indexOf("'Add to calendar'") < q.indexOf("'Edit'"), 'first, before Edit');
  assert.match(q, /btn\('calendar', n\.placed \? 'In calendar' : 'Add to calendar', \(\) => planStep\(n, cardOf\(n\)\), n\.placed \? 'cal booked' : 'cal'\)/);
  const card = app.slice(app.indexOf('function openBoardCard('), app.indexOf('function deleteBoardCard('));
  assert.match(card, /planStep\(n, cardOf\(n\)\);/, 'the card\'s own Add to calendar does the same');
  assert.doesNotMatch(q + card, /openEditor\(/, 'not an empty new entry any more');
  const one = app.slice(app.indexOf('function planStep('), app.indexOf('function planBoard('));
  assert.match(one, /if \(await bookSteps\(b, \[n\], start\) === null\)/, 'booked like Plan it: kept on the step, with undo');
  assert.match(one, /openMagic\(\{ text: `\$\{\(n\.title \|\| 'Untitled step'\)/, 'or Magic add fits it in');
  assert.match(one, /Already in your calendar: \$\{placedText\(n\.placed\)\}/);
  const css = read('src/renderer/styles.css');
  assert.match(css, /\.wb-plan-ways \{ display: grid; grid-template-columns: minmax\(0, 1fr\) minmax\(0, 1fr\);/, 'both buttons stay on a narrow phone');
});

test('a list pasted from a spreadsheet becomes steps: numbered, with details under their column names, a line per heading', () => {
  const rows = [
    'Step\tName\tWho\tWhat to do\tOutput / stop',
    '1 PRODUCT RESEARCH',
    '1\tNiche, sub-niche, product\tClaude. You pick.\t"Trendtrack gap search:\nscore 5 to 10"\tShortlist.',
    '2\tValidation gate\tClaude.\t1 to 5 competitors.\tSTOP for your yes.',
    '6b\tBrand foundation\tClaude drafts.\tBrand brief.\t',
    '2 STORE BUILDING',
    '7\tOffer\t\t"Price tiers, ""Buy 2 Get 1""."\tOffer sheet.', // Excel quotes a cell with quotes in it
  ].join('\r\n');
  const { nodes, links } = B.fromList(rows);
  assert.deepEqual(nodes.map((n) => [n.kind, n.title]), [
    ['goal', '1 PRODUCT RESEARCH'], ['step', '1. Niche, sub-niche, product'], ['step', '2. Validation gate'], ['step', '6b. Brand foundation'],
    ['goal', '2 STORE BUILDING'], ['step', '7. Offer'],
  ]);
  assert.equal(nodes[1].notes, 'Who: Claude. You pick.\n\nWhat to do: Trendtrack gap search:\nscore 5 to 10\n\nOutput / stop: Shortlist.', 'a cell with a line break stays one cell');
  assert.equal(nodes[5].notes, 'What to do: Price tiers, "Buy 2 Get 1".\n\nOutput / stop: Offer sheet.', 'empty cells are left out');
  assert.ok(nodes.filter((n) => n.kind === 'step').every((n) => n.minutes === 30));
  // Every card leads to the next, the end of one heading's line to the next heading.
  assert.deepEqual(links.map((l) => [nodes.findIndex((n) => n.id === l.from), nodes.findIndex((n) => n.id === l.to)]), [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5]]);
  // A line per heading, its goal at the left; the next heading's line below it.
  assert.deepEqual(nodes.map((n) => [n.x, n.y]), [[40, 40], [300, 40], [560, 40], [820, 40], [40, 260], [300, 260]]);
  // What it makes is a board as kept (src/main/boards.js clean), nothing lost on the way.
  const kept = boards.clean({ id: 'board/test-list', title: 'From a list', nodes, links });
  assert.equal(kept.nodes.length, 6);
  assert.equal(kept.links.length, 5);
});

test('a plain list: bullets and numbers go, a heading line starts a new line of cards, long lines are cut with all of it in the details', () => {
  const long = 'Vacuum the whole flat, including under the sofa and behind the TV unit, then mop the kitchen floor. Then do the bathroom.';
  const { nodes } = B.fromList(`Groceries:\n- milk\n• eggs\n\n# Cleaning\n1. ${long}\n[ ] Bins out`);
  assert.deepEqual(nodes.map((n) => [n.kind, n.title]), [
    ['goal', 'Groceries'], ['step', 'milk'], ['step', 'eggs'],
    ['goal', 'Cleaning'], ['step', 'Vacuum the whole flat, including under the sofa and behind the TV unit, then mop the kitchen floor'], ['step', 'Bins out'],
  ]);
  assert.equal(nodes[4].notes, long);
  const plain = B.fromList('one\ntwo\nthree');
  assert.deepEqual(plain.nodes.map((n) => n.kind), ['step', 'step', 'step'], 'no heading: just steps, joined in order');
  assert.equal(plain.links.length, 2);
  assert.deepEqual(B.fromList('  \n\n').nodes, [], 'nothing in it: nothing made');
});

test('a long line of cards wraps under its first step, and new cards start where they are told', () => {
  const list = ['PHASE', ...Array.from({ length: 10 }, (_, i) => `step ${i + 1}`)].join('\n');
  const { nodes } = B.fromList(list, { x0: 100, y0: 500 });
  assert.deepEqual(nodes.slice(0, 2).map((n) => [n.x, n.y]), [[100, 500], [360, 500]]);
  assert.deepEqual(nodes.slice(7, 9).map((n) => [n.title, n.x, n.y]), [['step 7', 1920, 500], ['step 8', 360, 720]], 'eight a line; the rest under step 1');
});

test('the app: paste a list on a board, or in its box, from the boards menu or an empty board; a board link (PC) makes one', () => {
  const app = read('src/renderer/app.js');
  assert.match(app, /h\('button', \{ type: 'button', class: 'btn', onclick: \(\) => \{ closePopover\(\); openListImport\(anchor\); \} \}, 'From a list'\)/);
  assert.match(app, /onclick: \(e\) => openListImport\(e\.currentTarget\) \}, 'From a list'\)/, 'on the empty boards screen too');
  assert.match(app, /document\.addEventListener\('paste', \(e\) => \{\n\s+if \(!board\.on \|\| !board\.cur \|\| e\.target\.closest\?\.\('input, textarea, \[contenteditable="true"\]'\)/, 'pasting into a box is left alone');
  assert.match(app, /const made = OnyxBoards\.fromList\(text, \{ x0: left, y0: below \}\);/, 'below what the board has');
  assert.match(app, /if \(fresh\) \{\n\s+try \{ await onyx\.deleteBoard\(b\.id\); \}/, 'Undo takes a board made for them away');
  assert.match(app, /onyx\.onBoardLink\?\.\(\(\) => onyx\.takeBoardLink\(\)\.then\(openBoardFromLink\)\.catch\(fail\)\);/);
  const main = read('src/main/main.js');
  assert.ok(main.includes('(argv || []).find((a) => /^onyx:\\/\\/(task|board)/i.test(a))'), 'the PC takes board links as well as task links');
  assert.match(main, /ipcMain\.handle\('board-link:take'/);
  assert.match(read('src/preload.js'), /takeBoardLink: \(\) => ipcRenderer\.invoke\('board-link:take'\)/);
  const { parseBoardLink } = require('../src/main/deeplink');
  assert.deepEqual(parseBoardLink(`onyx://board?title=${encodeURIComponent('  My  plan ')}&text=${encodeURIComponent('PHASE\nstep one\tdetail')}`), { title: 'My plan', text: 'PHASE\nstep one\tdetail' });
  assert.equal(parseBoardLink('onyx://board?title=x'), null, 'no text: not a board');
  assert.equal(parseBoardLink('onyx://task?title=x&text=y'), null);
  assert.equal(parseBoardLink(`onyx://board?text=${'a'.repeat(70000)}`).text.length, 60000, 'kept to a size');
  assert.equal(parseBoardLink('onyx://board?text=a').title, 'From a link');
});
