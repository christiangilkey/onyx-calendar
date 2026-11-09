// Drawing on a board (a pencil in any colour from a wheel, an eraser, undo), kept and synced with the board; and a
// tick box at the top right of every card, of every kind.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const B = require('../src/renderer/boards');
const store = require('../src/main/store');
const boards = require('../src/main/boards');

store.save = () => {};
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const js = read('src/renderer/boards.js');
const app = read('src/renderer/app.js');
const css = read('src/renderer/styles.css');

test('kept with the board: strokes in bounds, with a colour and a width; every card can be done', () => {
  const kept = boards.clean({
    id: 'board/drawtest', title: 'Draw',
    nodes: [
      { id: 'n1', kind: 'decision', x: 0, y: 0, title: 'Q', done: true },
      { id: 'n2', kind: 'note', x: 0, y: 0, title: 'N', done: true },
      { id: 'n3', kind: 'step', x: 0, y: 0, title: 'S' },
    ],
    links: [],
    strokes: [
      { id: 's1', color: '#1A1AF4', width: 6, pts: [0.4, 1.6, 10, 20, 'x', 3, 30, 40] },
      { id: 's1', color: '#fff', width: 2, pts: [0, 0, 1, 1] }, // the same id twice: once
      { id: 'bad id!', color: '#fff', width: 2, pts: [0, 0, 1, 1] },
      { id: 's2', color: 'red', width: 99, pts: [5e9, -5e9] }, // a dot, a colour not like #rrggbb, too wide
      { id: 's3', color: '#ffffff', width: 2, pts: [] },
    ],
  });
  assert.equal(kept.nodes.find((n) => n.id === 'n1').done, true, 'a decision');
  assert.equal(kept.nodes.find((n) => n.id === 'n2').done, true, 'a note');
  assert.equal(kept.nodes.find((n) => n.id === 'n3').done, undefined);
  assert.deepEqual(kept.strokes, [
    { id: 's1', color: '#1a1af4', width: 6, pts: [0, 2, 10, 20, 30, 40] },
    { id: 's2', color: '#f1f1f4', width: 40, pts: [1e6, -1e6] },
  ]);
  assert.equal('strokes' in boards.clean({ id: 'board/nodraw', nodes: [], links: [] }), false, 'no drawing: nothing kept for it');
  // Bounded: a drawing can't grow without end.
  const many = Array.from({ length: boards.MAX_STROKES + 50 }, (_, i) => ({ id: `s${i}`, color: '#ffffff', width: 2, pts: [i, 0, i, 10] }));
  assert.equal(boards.cleanStrokes(many).length, boards.MAX_STROKES);
  const long = [{ id: 'big', color: '#ffffff', width: 2, pts: Array.from({ length: 20000 }, (_, i) => i) }];
  assert.equal(boards.cleanStrokes(long)[0].pts.length, 8000, 'at most 4000 points a stroke');
});

test('the eraser takes out what it passes and cuts a line in two; what it never touched stays as it was', () => {
  let k = 0;
  const line = { id: 'a', color: '#ff0000', width: 4, pts: [0, 0, 100, 0] };
  const far = { id: 'b', color: '#00ff00', width: 2, pts: [0, 50, 10, 50] };
  const out = B.eraseInk([line, far], [50, -5, 50, 5], 6, () => `n${++k}`);
  assert.deepEqual(out.map((s) => [s.id, s.color, s.width, s.pts]), [
    ['n1', '#ff0000', 4, [0, 0, 43, 0]], ['n2', '#ff0000', 4, [57, 0, 100, 0]], ['b', '#00ff00', 2, [0, 50, 10, 50]],
  ], 'the middle of a long straight line, though it has no point there');
  assert.equal(out[2], far, 'the same stroke, untouched');
  assert.deepEqual(B.eraseInk([{ id: 'c', color: '#fff', width: 2, pts: [0, 0, 4, 0] }], [2, 0], 6), [], 'all of a small one');
  assert.equal(B.eraseInk([line], [], 6)[0], line, 'nowhere: nothing');
});

test('a line is kept with fewer points, drawn smooth, and colours go round the wheel', () => {
  assert.deepEqual(B.simplifyInk([0, 0, 1, 0.2, 2, 0, 3, 0.1, 4, 0, 10, 10], 0.8), [0, 0, 4, 0, 10, 10]);
  assert.equal(B.inkPath([0, 0, 10, 10, 20, 0]), 'M0 0 Q10 10 15 5 L20 0');
  assert.equal(B.inkPath([3, 4]), 'M3 4 l0.01 0', 'a tap is a dot');
  assert.equal(B.hsvToHex(0, 1, 1), '#ff0000');
  assert.equal(B.hsvToHex(120, 1, 1), '#00ff00');
  assert.equal(B.hsvToHex(240, 1, 0.5), '#000080');
  assert.equal(B.hsvToHex(0, 0, 1), '#ffffff', 'the middle of the wheel');
  const rgb = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
  for (const c of ['#1a1af4', '#ff9f4a', '#3fd0c9', '#26262b']) {
    const { h, s, v } = B.hexToHsv(c);
    const back = rgb(B.hsvToHex(h, s, v));
    rgb(c).forEach((x, i) => assert.ok(Math.abs(x - back[i]) <= 3, `${c} round the wheel and back (${B.hsvToHex(h, s, v)})`));
  }
});

test('the canvas: a drawing layer under the cards; the pencil and eraser take the press; two fingers still pinch', () => {
  assert.match(js, /world\.append\(ink, lines, labels, cards, temp\);/, 'under the arrows and the cards');
  assert.match(js, /const ink = svgEl\('svg', \{ class: 'wb-ink', viewBox: '0 0 1 1'/);
  assert.match(js, /if \(tool !== 'move'\) \{\s*const w = toWorld\(e\.clientX, e\.clientY\);/);
  assert.match(js, /act = \{ \.\.\.base, type: 'erase', before: strokesOf\(\), last: w, r: 12 \/ cam\.z \};/, 'the eraser is the same size on screen at any zoom');
  assert.match(js, /if \(act\?\.type === 'draw'\) act\.live\?\.remove\(\); \/\/ two fingers: a pinch, not a line/);
  assert.match(js, /board\.strokes = \[\.\.\.strokesOf\(\), \{ id: newId\('s'\), color: pen\.color, width: a\.width, pts \}\];/);
  assert.match(js, /undoInk: \(\) => \{ if \(!inkUndo\.length\) return false; board\.strokes = inkUndo\.pop\(\);/);
  assert.match(css, /#board-space\.drawing \.wb-cards, #board-space\.drawing \.wb-labels, #board-space\.drawing \.wb-hit \{ pointer-events: none; \}/);
  assert.match(css, /\.wb-ink \{[^}]*overflow: visible; pointer-events: none;/);
});

test('every card has a tick box at its top right, which ticks it off or not and opens nothing', () => {
  assert.match(js, /const check = el\('button', `wb-check\$\{n\.done \? ' on' : ''\}`\);/);
  assert.match(js, /if \(t\.closest\('\.wb-check'\) && card\) \{ const id = card\.dataset\.id; act = \{ \.\.\.base, type: 'tap', run: \(\) => \{ const n = node\(id\); if \(!n\) return; n\.done = !n\.done; changed\(\); draw\(\); \} \}; \}/);
  assert.match(js, /if \(card && !e\.target\.closest\('\.wb-plus, \.wb-way, \.wb-check'\)\) o\.onOpen/, 'a double-click on it does not open the card');
  assert.match(css, /\.wb-check \{ position: absolute; top: 8px; right: 8px;/);
  // Done for every kind, in its options and its panel too.
  const q = app.slice(app.indexOf('function boardQuick('), app.indexOf('function openBoardAdd('));
  assert.doesNotMatch(q, /if \(n\.kind === 'step' \|\| n\.kind === 'goal'\) \{\s*kids\.push\(btn\('check'/);
  assert.match(q, /kids\.push\(btn\('check', n\.done \? 'Not done'/);
  const card = app.slice(app.indexOf('function openBoardCard('), app.indexOf('function deleteBoardCard('));
  assert.match(card, /parts\.push\(h\('label', \{ class: 'wb-done' \}, toggle\(!!n\.done/);
  assert.doesNotMatch(read('src/main/boards.js'), /\(kind === 'step' \|\| kind === 'goal'\) && n\.done/);
});

test('the bar: Move, Pencil, Eraser, the colour wheel and undo; Escape puts the pencil down first', () => {
  assert.match(app, /h\('div', \{ class: 'wb-adds' \}, \.\.\.\['step', 'decision', 'goal', 'note'\]\.map\(addBtn\)\),\s*boardTools\(\),/);
  const tools = app.slice(app.indexOf('function boardTools('), app.indexOf('function openInkColor('));
  for (const t of ["tool('move', 'hand', 'Move'", "tool('pen', 'pencil', 'Pencil'", "tool('eraser', 'eraser', 'Eraser'", "class: 'wb-ink-color'", "class: 'icon-btn wb-ink-undo'"]) assert.ok(tools.includes(t), t);
  const wheel = app.slice(app.indexOf('function openInkColor('), app.indexOf('/** The bar over the board'));
  assert.match(wheel, /hue = Math\.round\(\(\(Math\.atan2\(dy, dx\) \* 180\) \/ Math\.PI \+ 360\) % 360\);/, 'round the wheel: the colour');
  assert.match(wheel, /sat = Math\.min\(1, Math\.hypot\(dx, dy\) \/ R\);/, 'in to the middle: paler');
  assert.match(css, /conic-gradient\(from 90deg, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00\)/, 'the wheel drawn the way it is read');
  assert.match(app, /writeLocal\('onyx\.boardPen', board\.pen\)/, 'the pencil as it was left, on this device');
  assert.match(app, /else if \(board\.on && board\.tool !== 'move'\) setBoardTool\('move'\);\s*else if \(board\.on && board\.panel\.id/);
});
