// The phone's calendar chrome: pinching past the day (or the month) leaves the grid drawn, the top bar keeps
// the date whole with its buttons in a strip that scrolls, and one + button adds a block either way.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const app = read('src/renderer/app.js');
const css = read('src/renderer/styles.css');
const html = read('src/renderer/index.html');
const between = (a, b) => app.slice(app.indexOf(a), app.indexOf(b, app.indexOf(a)));

test('a pinch toward a view that is not there leaves the calendar still, and drawn afresh after', () => {
  const pinch = between('function setupPinch()', '// A trackpad pinch');
  assert.match(pinch, /canIn: !!pinchTarget\(-1\), canOut: !!pinchTarget\(1\)/, 'which ways there is a view to go, from the start');
  assert.match(pinch, /if \(!\(s\.ratio > 1 \? s\.canIn : s\.canOut\)\) \{ if \(el\.style\.transform\) el\.style\.transform = ''; return; \}/, 'no stretch at the end');
  assert.match(pinch, /if \(dir && \(dir < 0 \? s\.canIn : s\.canOut\)\)/);
  assert.match(pinch, /setTimeout\(freshenCalendar, 170\)/, 'eased back, then drawn again');
  assert.match(app, /if \(MOBILE\) document\.addEventListener\('visibilitychange', \(\) => \{ if \(!document\.hidden && !pinch\.s\) freshenCalendar\(\); \}\);/, 'and on coming back to Onyx');
  const fresh = between('function freshenCalendar()', 'function pinchStep(');
  assert.match(fresh, /Object\.assign\(el\.style, \{ transform: '', transformOrigin: '', transition: '' \}\)/);
  assert.match(fresh, /Object\.assign\(v\.style, \{ transform: '', opacity: '', transition: '' \}\)/, 'no slide left on the view');
  assert.match(fresh, /calendar\?\.updateSize\(\);/);
});

test('the phone keeps the whole date: the buttons after it scroll in a strip, and show once that they do', () => {
  const tools = between('function topTools()', 'function buildChrome()');
  assert.match(tools, /if \(!MOBILE\) return;/, 'the PC\'s bar is as it was');
  assert.match(tools, /'globe-toggle', 'board-toggle', 'undo-btn', 'update-btn', 'refresh', 'toggle-tasks', 'open-settings'\]/);
  assert.match(tools, /strip\.scrollTo\(\{ left: Math\.min\(room, 72\), behavior: 'smooth' \}\);\s*setTimeout\(\(\) => strip\.scrollTo\(\{ left: 0, behavior: 'smooth' \}\), 650\);/, 'over and back');
  assert.match(tools, /if \(seen === 'done' \|\| \+seen >= 3\) return;/, 'until it has been scrolled, three times at most');
  assert.match(tools, /if \(room < 8 \|\| strip\.scrollLeft > 2 \|\| matchMedia\('\(prefers-reduced-motion: reduce\)'\)\.matches\) return;/, 'only when there is more to see');
  assert.match(app, /const header = \$\('#top-tools'\) \|\| \$\('#titlebar'\);/, 'the timer and undo come back into the strip, not the bar');
  assert.match(css, /body\.mobile \.nav \{ flex: none; max-width: 68vw; \}/);
  assert.match(css, /body\.mobile \.top-tools \{[^}]*overflow-x: auto;/);
  assert.match(css, /body\.mobile \.top-tools\.more-right \{ --fade-r: transparent; \}/);
  // The offline label took room in the bar at all times, cutting the date short.
  assert.doesNotMatch(css, /^html:not\(\[data-offline-label\]\) #titlebar::after/m);
  assert.match(css, /html\.offline:not\(\[data-offline-label\]\) #titlebar::after, html\.syncing:not\(\[data-offline-label\]\) #titlebar::after \{ content:/);
});

test('one + button on the phone: type it, then Choose a time or Find time', () => {
  assert.doesNotMatch(html, /id="magic-fab"/, 'no second round button');
  assert.doesNotMatch(app + css, /magic-fab/);
  assert.match(app, /if \(!graph\.on\) return MOBILE \? openMagic\(\{ add: true, date: ymd\(newBlockDay\(\)\) \}\) : newBlock\(\);/);
  const magic = between('function openMagic(', '// ------------------------------------------------------------ globe view');
  assert.match(magic, /'Add to your day'/);
  // The two ways are tabs, and each keeps all it had: the block's own editor, drawn in the sheet, and Magic add.
  assert.match(magic, /wayTab\('time', 'clock', 'Choose a time', 'You pick when'\), wayTab\('find', 'sparkles', 'Find time', 'Onyx fits it in'\)/);
  assert.match(magic, /editor = openEditor\(\{ start: begin, end: new Date\(begin\.getTime\(\) \+ 3600000\), allDay: false, into: \{ body: editorBody, foot: editorFoot, close: \(\) => closeSettings\(\) \} \}, null\);/);
  assert.match(magic, /wayNow === 'time' \? \[text, wayTabs, timeNote, editorBody\]\s*: \[text, wayTabs, src\.el, waitHead, pickBox, msg\]/);
  assert.match(magic, /editor\?\.setTitle\(firstLine\(\)\);/, 'named as typed');
  assert.match(magic, /`Only the first line becomes this block\. `/);
  assert.match(magic, /go\.disabled = !count;/);
  assert.match(magic, /'Or tick tasks that are waiting'/);
  // The editor in the sheet is the same editor: everything it shows, its actions in the sheet's foot, closing the sheet.
  const ed = between('function openEditor(model, anchor)', '// ------------------------------------------------------------ tasks');
  assert.match(ed, /const done = \(\) => \(into \? into\.close\(\) : closePopover\(\)\);/);
  assert.doesNotMatch(ed, /closePopover\(\);/, 'every way out closes the sheet when it is in one');
  assert.match(ed, /into\.body\.replaceChildren\(\.\.\.nodes\.filter\(\(n\) => n && n\.nodeType && n !== title && n !== actions\)\);/);
  assert.match(ed, /into\.foot\.replaceChildren\(\.\.\.\(actions \? \[actions\] : \[\]\)\);/);
  assert.match(app, /value: src \? src\.title : \(model\.title \|\| ''\)/);
  // The waiting count moved to the + button.
  assert.match(app, /for \(const el of \[\$\('#magic-add'\), MOBILE \? \$\('#fab'\) : null, \$\('#task-magic'\)\]\)/);
  assert.match(css, /body\.mobile #fab \.magic-count \{ position: absolute;/);
});
