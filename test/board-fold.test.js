// The phone's board bar folds away (1.135.0): one slim row (the board's name, the tools, unfold), and the
// Now / Next strip hidden, so what is on the board can be read. Folded unless unfolded before.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

test('the board bar folds on the phone, and remembers it', () => {
  const app = read('src/renderer/app.js');
  assert.match(app, /const boardFolded = \(\) => readLocal\('onyx\.boardFolded', true\) !== false;/, 'folded at first');
  assert.match(app, /writeLocal\('onyx\.boardFolded', !!v\);/);
  assert.match(app, /class: `icon-btn wb-fold mobile-only\$\{boardFolded\(\) \? ' folded' : ''\}`/);
  assert.match(app, /document\.body\.classList\.toggle\('wb-folded', boardFolded\(\)\);/, 'opening a board folds it as it was');
  assert.match(app, /document\.body\.classList\.remove\('board-on', 'wb-folded'\);/, 'the calendar keeps its Now \/ Next strip');
  const css = read('src/renderer/styles.css');
  assert.match(css, /body\.mobile\.board-on\.wb-folded #next-bar \{ display: none; \}/);
  assert.match(css, /body\.mobile\.wb-folded #board-bar > :not\(\.wb-name\):not\(\.wb-tools\):not\(\.wb-fold\) \{ display: none; \}/);
});
