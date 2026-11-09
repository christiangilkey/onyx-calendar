// On a board: Ctrl (Cmd) while dragging snaps a card to the grid; Shift and a drag on empty space picks several
// cards with a band (Shift+click adds or takes one), and they move together (one Undo), tick off or delete together.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const B = require('../src/renderer/boards');

const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const js = read('src/renderer/boards.js');
const app = read('src/renderer/app.js');
const css = read('src/renderer/styles.css');

test('the grid: a card dragged with Ctrl lands on it', () => {
  assert.equal(B.GRID, 20);
  assert.equal(B.snap(29), 20);
  assert.equal(B.snap(31), 40);
  assert.equal(B.snap(-11), -20);
  assert.match(js, /const grid = e\.ctrlKey \|\| e\.metaKey;\s*space\.classList\.toggle\('snapping', grid\);/, 'Ctrl, or Cmd on a Mac; the grid shows while it is held');
  assert.match(js, /if \(grid\) \{ x = snap\(x\); y = snap\(y\); \}/);
  assert.match(css, /#board-space\.snapping \{[\s\S]*?background-size: var\(--gs, 20px\) var\(--gs, 20px\); background-position: var\(--gx, 0\) var\(--gy, 0\);/, 'it moves and zooms with the board');
  assert.match(js, /while \(gs < 12\) gs \*= 2;/, 'never too fine to see');
});

test('a band picks the cards it touches', () => {
  const nodes = [{ id: 'a', x: 0, y: 0 }, { id: 'b', x: 300, y: 0 }, { id: 'c', x: 0, y: 300 }];
  const boxOf = (n) => ({ x: n.x, y: n.y, w: 200, h: 80 });
  assert.deepEqual(B.inBand(nodes, { x0: -10, y0: -10, x1: 320, y1: 50 }, boxOf), ['a', 'b'], 'touching is enough');
  assert.deepEqual(B.inBand(nodes, { x0: 320, y0: 50, x1: -10, y1: -10 }, boxOf), ['a', 'b'], 'drawn either way');
  assert.deepEqual(B.inBand(nodes, { x0: 210, y0: 100, x1: 280, y1: 200 }, boxOf), [], 'between cards: none');
  assert.match(js, /\} else if \(e\.shiftKey && !touchy && !t\.closest\('\.wb-label, \.wb-hit'\)\) \{\s*const band = el\('div', 'wb-band'\);/, 'Shift and a drag on empty space');
});

test('picked together: they move as one (one Undo), Shift+click adds or takes one, a plain click lets them go', () => {
  assert.match(js, /if \(multi\.has\(n\.id\) && multi\.size > 1\) act\.group = multiNodes\(\)\.map/);
  assert.match(js, /for \(const g of act\.group \|\| \[\{ n: act\.n, x: act\.nx, y: act\.ny, el: act\.el \}\]\) \{\s*g\.n\.x = g\.x \+ mx;/, 'all of them the same way');
  assert.match(js, /if \(a\.moved && a\.group\) \{ changed\(\); draw\(\); o\.onMovedMany\?\.\(a\.group\.map\(\(g\) => \(\{ id: g\.n\.id, x: g\.x, y: g\.y \}\)\)\); return; \}/);
  assert.match(app, /toast\(`Moved \$\{spots\.length\} cards`, '', \{ label: 'Undo', run: \(\) => \{ if \(board\.cur === b\) board\.view\?\.placeAt\(spots\); \} \}\);/);
  assert.match(js, /if \(a\.shift\) \{\s*if \(sel && sel !== a\.n\.id && !multi\.size\) multi\.add\(sel\);\s*if \(multi\.has\(a\.n\.id\)\) multi\.delete\(a\.n\.id\); else multi\.add\(a\.n\.id\);/);
  assert.match(js, /if \(multi\.size\) \{ multi\.clear\(\); draw\(\); tellMulti\(\); \}/, 'a plain click: just that card');
  assert.match(css, /\.wb-card\.multi \{ box-shadow:/);
});

test('their bar: tick them all off, delete them all (one Undo, or the Delete key), or let them go (Esc)', () => {
  const bar = app.slice(app.indexOf('function paintMultiBar('), app.indexOf('function deleteBoardCards('));
  assert.match(bar, /for \(const n of list\) n\.done = !allDone;/);
  assert.match(bar, /onclick: \(\) => deleteBoardCards\(list\)/);
  const del = app.slice(app.indexOf('function deleteBoardCards('), app.indexOf('function deleteBoardCard('));
  assert.match(del, /toast\(`Deleted \$\{list\.length\} cards`, '', \{ label: 'Undo'/);
  assert.match(js, /if \(\(e\.key === 'Delete' \|\| e\.key === 'Backspace'\) && o\.onDeleteMany\) \{ e\.preventDefault\(\); o\.onDeleteMany\(multiNodes\(\)\); \}/);
  assert.match(js, /e\.target\.closest\?\.\('input, textarea, select, \[contenteditable\]'\)\) return;/, 'never while typing');
  assert.match(app, /else if \(board\.on && board\.view\?\.picked\?\.\(\)\.length\) board\.view\.clearPicked\(\);\s*else if \(board\.on && board\.tool !== 'move'\)/, 'Esc lets them go before anything else on the board');
});
