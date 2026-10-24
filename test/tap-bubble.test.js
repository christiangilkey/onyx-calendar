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
  for (const side of ['right', 'left', 'top', 'bottom', 'over']) assert.ok(app.includes(`side = '${side}'`), side);
  assert.match(app, /const clampX = \(x\) => Math\.max\(M, Math\.min\(innerWidth - M - bw, x\)\)/);
  assert.match(css, /\.tb-title \{[^}]*-webkit-line-clamp: 3/);
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
