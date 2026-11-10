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

test('one + button on the phone: what you are adding first (a block, Find time or a time chunk), then only what it needs', () => {
  assert.doesNotMatch(html, /id="magic-fab"/, 'no second round button');
  assert.doesNotMatch(app + css, /magic-fab/);
  assert.match(app, /if \(!graph\.on\) return MOBILE \? openMagic\(\{ add: true, date: ymd\(newBlockDay\(\)\) \}\) : newBlock\(\);/);
  const magic = between('function openMagic(', '// ------------------------------------------------------------ globe view');
  assert.match(magic, /'Add to your day'/);
  // Three big choices at the top, each saying what it does.
  assert.match(magic, /\{ key: 'time', ico: 'clock', name: 'Block', sub: 'You pick the time', hint: /);
  assert.match(magic, /\{ key: 'find', ico: 'fit', name: 'Find time', sub: 'Onyx fits it in', hint: /);
  assert.match(magic, /\{ key: 'chunk', ico: 'tag', name: 'Time chunk', sub: 'Time for a category', hint: /);
  assert.match(magic, /wayTabs = h\('div', \{ class: 'mg-kinds', role: 'tablist', 'aria-label': 'What are you adding\?' \}\)/);
  // Each keeps all it had: the block's own editor (its extras under More options), Magic add, and the chunk window.
  assert.match(magic, /editor = openEditor\(\{ start: begin, end: new Date\(begin\.getTime\(\) \+ 3600000\), allDay: false, into: \{ body: editorBody, more: moreBody, foot: editorFoot, close: \(\) => closeSettings\(\) \} \}, null\);/);
  assert.match(magic, /h\('b', null, 'More options'\)/);
  assert.match(magic, /chunker = openChunkEditor\(\{ \.\.\.OnyxChunks\.fromDrag\(begin, new Date\(begin\.getTime\(\) \+ 2 \* 3600000\)\), tag: cat \? \(tagInfo\(cat\)\?\.name \|\| cat\) : '', title: firstLine\(\) \},\s*null, null, \{ body: chunkBody, foot: chunkFoot, close: \(\) => closeSettings\(\) \}\);/);
  assert.match(magic, /\[wayTabs, wayHint, \.\.\.\(wayNow === 'chunk' \? \[chunkBody\]\s*: wayNow === 'time' \? \[whatField, timeNote, editorBody, moreBox\]\s*: \[whatField, src\.el, whenField, waitHead, pickBox, msg\]\)\]/);
  // One button at the foot to add it.
  assert.match(magic, /foot\.replaceChildren\(wayNow === 'time' \? editorFoot : wayNow === 'chunk' \? chunkFoot : h\('div', \{ class: 'mg-foot-row' \}, go\)\);/);
  assert.match(magic, /editor\?\.setTitle\(firstLine\(\)\);/, 'named as typed');
  assert.match(magic, /`Only the first line becomes this block\. `/);
  assert.match(magic, /go\.disabled = !count;/);
  assert.match(magic, /'Or tick tasks that are waiting'/);
  assert.match(magic, /if \(!\(adding && MOBILE\)\) setTimeout\(/, 'no keyboard over half the sheet as it opens');
  // The editor in the sheet is the same editor: everything it shows, its actions in the sheet's foot, closing the sheet.
  const ed = between('function openEditor(model, anchor)', '// ------------------------------------------------------------ tasks');
  assert.match(ed, /const done = \(\) => \(into \? into\.close\(\) : closePopover\(\)\);/);
  assert.doesNotMatch(ed, /closePopover\(\);/, 'every way out closes the sheet when it is in one');
  assert.match(ed, /field\('When', h\('div', \{ class: 'row mg-when-date' \}, date, h\('label', \{ class: 'check' \}, allDay, 'All day'\)\),\s*h\('div', \{ class: 'row mg-when-time' \}, startTime, dash, endTime\), untilRow\)/, 'the day on a line of its own, then the hours');
  assert.match(ed, /field\('Calendar', h\('div', \{ class: 'row' \}, calendarPick\)\)/);
  assert.match(ed, /const rest = nodes\.filter\(\(n\) => n && n\.nodeType && !\[title, actions, timeRow, untilRow, calRow\]\.includes\(n\)\);/);
  assert.match(ed, /into\.more\?\.replaceChildren\(\.\.\.rest\);/);
  assert.match(ed, /into\.foot\.replaceChildren\(\.\.\.\(actions \? \[actions\] : \[\]\)\);/);
  assert.match(ed, /!into && h\('button', \{ class: 'btn ghost', onclick: \(\) => done\(\) \}, 'Cancel'\)/, 'the sheet has its own close');
  assert.match(app, /value: src \? src\.title : \(model\.title \|\| ''\)/);
  // The chunk window draws into the sheet the same way: its own fields and save, no copy of them.
  const ch = between('function openChunkEditor(base, anchor, occ = null, into = null)', 'async function putChunk(chunk)');
  assert.match(ch, /const done = \(\) => \(into \? into\.close\(\) : closePopover\(\)\);/);
  assert.doesNotMatch(ch, /closePopover\(\);/, 'saving in the sheet closes the sheet');
  assert.match(ch, /field\('Category', h\('div', \{ class: 'tc-cats' \}, chips, newCat\)\),\s*field\('Colour', h\('div', \{ class: 'row color-row' \}, colorPick\.el\)\),\s*field\('Name', title\),\s*field\('When', /);
  assert.match(ch, /into\.foot\.replaceChildren\(actions\);/);
  assert.match(ch, /showPopover\(anchor, nodes, /, 'still its own window on the calendar');
  // On a phone with big system text (it scales the fonts, not the boxes): nothing wider than the screen.
  assert.match(css, /\.mg-kinds \{ display: grid; grid-template-columns: repeat\(3, minmax\(0, 1fr\)\);/);
  assert.match(css, /\.mg-field > \.row \{ flex-wrap: nowrap; min-width: 0; \}/);
  assert.match(css, /\.mg-field > \.row > input, \.mg-field > \.row > select \{ flex: 1 1 0; min-width: 0; width: 100%; \}/);
  assert.match(css, /body\.mobile \.sheet\.magic\.adding input, body\.mobile \.sheet\.magic\.adding select, body\.mobile \.sheet\.magic\.adding textarea \{ font-size: 16px; \}/);
  assert.match(css, /\.mg-more-body > \.row > \.ico:first-child \{ position: absolute;/, 'an icon never alone on a line');
  assert.doesNotMatch(css, /\.mg-editor input\[type=time\] \{ min-width: 112px; \}/, 'no fixed widths that push the end time onto a line of its own');
  // The waiting count moved to the + button.
  assert.match(app, /for \(const el of \[\$\('#magic-add'\), MOBILE \? \$\('#fab'\) : null, \$\('#task-magic'\)\]\)/);
  assert.match(css, /body\.mobile #fab \.magic-count \{ position: absolute;/);
});

test('the column of hours keeps the width its hours need, and goes back to it after anything wider passes', () => {
  // The calendar sizes it from each hour label's own width. A label as wide as its column (display: block) measured
  // the column itself, so a column drawn too wide once stayed that way, the days squeezed into half the phone.
  assert.match(css, /\.fc \.fc-timegrid-slot-label-cushion \{[^}]*display: inline-block; \}/);
  assert.doesNotMatch(css, /\.fc \.fc-timegrid-slot-label-cushion \{[^}]*display: block;/);
});

test('Adaptive Add: the name everywhere it is shown, no sparkles on it, and no nag for a key', () => {
  // What people see says Adaptive Add; the code keeps its names (magic_add, magic:*, openMagic).
  const shown = app.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*\*)/.test(l)).join('\n');
  assert.doesNotMatch(shown.replace(/\/\/.*$/gm, ''), /Magic add/, 'no "Magic add" left on screen');
  assert.match(app, /\$\('#magic-add'\)\.append\(icon\('fit'\), 'Adaptive Add'\);/);
  assert.match(app, /\$\('#task-magic'\)\.append\(icon\('fit'\), 'Adaptive Add tasks'\);/);
  const magic = between('function openMagic(', '// ------------------------------------------------------------ globe view');
  assert.doesNotMatch(magic, /'sparkles'/, 'its sheet has no sparkles');
  const goalWin = between('function openGoalMagic(', '// ------------------------------------------------------------ sidebar');
  assert.doesNotMatch(goalWin, /'sparkles'/, 'nor its goal window');
  assert.match(app, /'Fit it into a day with Adaptive Add', onclick: [^\n]*icon\('fit'\), 'Plan'/);
  assert.match(app, /h\('small', null, 'Adaptive Add fits it in'\)/);
  // No nag: without a key it plans from the words and what was done before, and says only that.
  assert.doesNotMatch(app, /Add a Claude key in Settings for (smarter|better) estimates/);
  assert.match(app, /`Lengths from your words and what you did before, for \$\{dayName\(view\.date\)\}`/);
  // A picture is the one thing that needs Claude: it says so when one is picked, and what to do instead.
  assert.match(app, /'Reading a picture takes a Claude key \(Settings → AI\)\. Without one, type or paste what it says into the box\.'/);
  assert.match(app, /if \(!pictures\) \{ needKey\.hidden = false; return; \}/);
  const mcp = require('fs').readFileSync(require('path').join(__dirname, '../src/main/mcp.js'), 'utf8');
  assert.match(mcp, /name: 'magic_add',/, 'the tool other apps call keeps its name');
  assert.match(mcp, /'Hand tasks for one day to Adaptive Add,/);
});
