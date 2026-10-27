// A tap on an entry highlights it and shows a bubble beside it (its whole name, its time, and Open). The phone
// never waits for a second tap: that fought the calendar's own touch handling. A press on the bubble stays with
// the bubble, so nothing behind it is tapped.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const app = fs.readFileSync(path.join(__dirname, '../src/renderer/app.js'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, '../src/renderer/styles.css'), 'utf8');

test('one tap shows the bubble; only the PC opens on a double click', () => {
  assert.match(app, /const again = !MOBILE && lastTap\.id === src\.id/);
  assert.match(app, /if \(!again\) \{ showTapBubble\(src, info\.el\); return; \}/);
});

test('a press on the bubble never reaches the calendar, and it goes at a drag or a new day', () => {
  assert.match(app, /\['pointerdown', 'mousedown', 'touchstart'\]\) b\.addEventListener\(type, \(ev\) => ev\.stopPropagation\(\)/);
  assert.match(app, /eventDragStart: \(info\) => \{[^}]*hideTapBubble\(\)/);
  assert.match(app, /eventResizeStart: \(info\) => \{[^}]*hideTapBubble\(\)/);
  assert.match(app, /datesSet: \(info\) => \{\s*hideTapBubble\(\);/);
});

test('it keeps to the screen: beside the entry where there is room, else above or below it', () => {
  assert.match(app, /function placeTapBubble\(b, r, \{ sides = \['right', 'left', 'top', 'bottom'\], avoid = null \} = \{\}\)/);
  for (const side of ['right', 'left', 'top', 'bottom']) assert.ok(app.includes(`if (s === '${side}')`), side);
  assert.ok(app.includes("side = 'over';"));
  assert.match(app, /const clampX = \(x\) => Math\.max\(M, Math\.min\(innerWidth - M - bw, x\)\)/);
  // The whole name, however long: no clamp on it.
  assert.match(css, /\.tb-title \{[^}]*overflow-wrap: anywhere; \}/);
  assert.doesNotMatch(css, /\.tb-title \{[^}]*line-clamp/);
});

test('a block\'s links show in a bubble like it, on the opposite side, each with its own Open', () => {
  assert.match(app, /right: \['left', 'right', 'top', 'bottom'\], left: \['right', 'left', 'top', 'bottom'\], top: \['bottom', 'top', 'left', 'right'\], bottom: \['top', 'bottom', 'left', 'right'\]/);
  assert.match(app, /placeTapBubble\(lb, rect, \{ sides: other, avoid: b\.getBoundingClientRect\(\) \}\)/);
  assert.match(app, /hideTapBubble\(\); onyx\.open\(l\.url\);/);
  assert.match(app, /await onyx\.setBlockLinks\(id, links\)/);
});

test('names are 30 characters at most where they are typed', () => {
  assert.match(app, /const NAME_MAX = 30;/);
  for (const re of [/limitName\(h\('input', \{ type: 'text', class: 'pop-title', placeholder: 'What is this time for\?'/, /limitName\(h\('input', \{ type: 'text', class: 'pop-title', value: t\.title/, /limitName\(h\('input', \{ type: 'text', class: 'btask-in'/]) assert.match(app, re);
  assert.match(fs.readFileSync(path.join(__dirname, '../src/renderer/index.html'), 'utf8'), /id="task-title" type="text" maxlength="30"/);
});

test('the tick-off sound is quiet and can be changed or switched off', () => {
  assert.match(app, /const DONE_SOUNDS = \[\['soft', 'Soft'\], \['click', 'Click'\], \['off', 'Off'\]\];/);
  assert.match(app, /function doneSound\(kind = S\.settings\?\.doneSound \|\| 'soft'\)/);
  const body = app.slice(app.indexOf('function doneSound('), app.indexOf('function burstAt('));
  assert.ok(!body.includes('createBuffer'), 'no noise burst');
  assert.ok(!body.includes('1046.5'), 'not the old four-note chime');
  assert.match(app, /field\('Tick-off sound'/);
  assert.match(fs.readFileSync(path.join(__dirname, '../src/renderer/remote.js'), 'utf8'), /const PHONE_ONLY = \[[^\]]*'doneSound'/);
});

test('a carried entry shows a grey line at where it would land, across to the hours, with that time on it', () => {
  assert.match(app, /float\.guide = h\('div', \{ class: 'drop-guide', hidden: true, 'aria-hidden': 'true' \}, h\('span'\)\);/);
  assert.match(app, /    dropGuide\(mirror\);\n  \}/);
  assert.match(app, /g\.style\.width = `\$\{Math\.max\(0, Math\.round\(m\.left - axis\.left\)\)\}px`;/);
  assert.match(app, /float\.guide\?\.remove\(\);/);
  assert.match(css, /\.drop-guide \{[^}]*border-top: 1\.5px solid/);
});
