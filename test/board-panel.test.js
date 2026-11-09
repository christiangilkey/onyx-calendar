// A board card's panel: picked, a card shows whole beside the board (a sheet along the bottom on the phone), every
// detail under its own heading; opened, it is changed in the same panel, with room to write. In place of the small
// popover and the quick toolbar over the card.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const app = read('src/renderer/app.js');
const js = read('src/renderer/boards.js');
const css = read('src/renderer/styles.css');
const html = read('src/renderer/index.html');
const between = (a, b) => app.slice(app.indexOf(a), app.indexOf(b));

test('the canvas says which card is picked, and can bring one into view', () => {
  assert.match(js, /o\.onDraw\?\.\(r\);\s*o\.onPick\?\.\(sel \? node\(sel\) : null\);/, 'after every draw: the card picked as it is now, or none');
  assert.match(js, /placeQuick\(\);\s*o\.onPick\?\.\(node\(id\)\);/, 'a card picked without a redraw');
  assert.match(js, /reveal: \(id, \{ bottom = 0 \} = \{\}\) => \{/);
  // A card taking the focus made the browser scroll the board itself, out of step with the view: it moves the view.
  assert.match(js, /space\.addEventListener\('scroll', \(\) => \{[\s\S]{0,200}cam = \{ \.\.\.cam, x: cam\.x - space\.scrollLeft, y: cam\.y - space\.scrollTop \};/);
});

test('picked: the panel beside the board, in place of the quick toolbar', () => {
  assert.match(html, /<div id="board-main">\s*<div id="board-space"><\/div>\s*<aside id="board-panel" class="wb-panel" hidden aria-label="The card picked"><\/aside>\s*<\/div>/);
  assert.match(app, /onPick: \(n\) => boardPicked\(n\),/);
  assert.doesNotMatch(app, /quick: \(n\) => boardQuick\(n\),/, 'no toolbar over the card');
  const picked = between('function boardPicked(', 'function panelFrame(');
  assert.match(picked, /if \(!n\) \{ hideCardPanel\(\); return; \}/);
  assert.match(picked, /if \(board\.panel\.mode === 'edit' && board\.panel\.id === n\.id\) return;/, 'not drawn again while it is typed in');
  const view = between('function showCardPanel(', 'function openBoardCard(');
  assert.match(view, /const parts = cardSections\(n\.notes\);/);
  assert.match(view, /panelFrame\(n, chips, body, boardQuick\(n\), 'view'\);/, 'its options at the foot');
  assert.match(app, /requestAnimationFrame\(\(\) => board\.view\?\.reveal\?\.\(n\.id, \{ bottom: MOBILE \? p\.offsetHeight : 0 \}\)\);/, 'the card stays in sight');
  assert.match(app, /board\.on = false;\s*hideCardPanel\(\);/, 'leaving the boards puts it away');
});

test('the details read as sections: a spreadsheet\'s columns each under its heading', () => {
  const src = between('function cardSections(', 'const panelEl = ');
  const cardSections = new Function(`${src}; return cardSections;`)();
  const notes = 'Who: Claude (Trendtrack MCP, Chrome). You pick the product.\n\nWhat to do: Trendtrack gap prompt: a scaling DR brand.\nScore 5 to 10.\n\nOutput / stop: Shortlist.\n\nSee https://example.com/x for more\n\nChoices: CHOICE 7, 9';
  assert.deepEqual(cardSections(notes), [
    { label: 'Who', body: 'Claude (Trendtrack MCP, Chrome). You pick the product.' },
    { label: 'What to do', body: 'Trendtrack gap prompt: a scaling DR brand.\nScore 5 to 10.' },
    { label: 'Output / stop', body: 'Shortlist.' },
    { label: '', body: 'See https://example.com/x for more' },
    { label: 'Choices', body: 'CHOICE 7, 9' },
  ]);
  assert.deepEqual(cardSections('https://example.com/a'), [{ label: '', body: 'https://example.com/a' }], 'a link is not a heading');
  assert.deepEqual(cardSections(''), []);
});

test('opened: changed in the same panel, with room to write, kept as it is typed', () => {
  const card = between('function openBoardCard(', 'function deleteBoardCard(');
  assert.doesNotMatch(card, /showPopover\(/, 'no popover any more');
  assert.match(card, /board\.panel = \{ id: n\.id, mode: 'edit' \};/);
  assert.match(card, /panelFrame\(n, \[h\('span', \{ class: 'wb-p-editing' \}, 'Changing it'\)\], \[h\('div', \{ class: `wb-edit k-\$\{n\.kind\}` \}, \.\.\.parts\)\], foot, 'edit'\);/);
  assert.match(card, /oninput: \(e\) => \{ n\.notes = e\.target\.value; redraw\(\); \}/);
  assert.match(css, /\.wb-panel \.wb-notes \{ flex: 1; min-height: 260px;/, 'the details get the room left');
  assert.match(css, /body\.mobile \.wb-panel\.edit \{ height: 88%; max-height: 88%; \}/, 'a tall sheet on the phone');
  // Escape (or the phone's back): out of changing it, then the card put down, and only then off the board.
  assert.match(app, /else if \(board\.on && board\.panel\.id && !\$\('#board-panel'\)\.hidden\) \{/);
});

test('its look: beside the board on the PC (wider by dragging its edge), a sheet on the phone', () => {
  assert.match(css, /\.wb-panel \{ position: relative; flex: none; width: 420px;/);
  assert.match(css, /\.wb-p-grip \{[^}]*cursor: col-resize;/);
  assert.match(app, /writeLocal\('onyx\.boardPanelW', p\.offsetWidth\)/, 'the width it was given is kept');
  assert.match(css, /body\.mobile \.wb-panel \{ position: absolute; left: 0; right: 0; bottom: 0;/);
  assert.match(css, /body\.wb-panel-on #board \.wb-hint/, 'the tips give way to it');
  assert.match(css, /\.wb-p-text \{[^}]*white-space: pre-wrap;/);
});
