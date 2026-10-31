// On the phone a long press on an empty spot makes a new block at once (half an hour, with a buzz), which the
// finger stretches before lifting: down for a later end, up for an earlier start, kept on its day. Lifting saves
// it and opens it; a touch the system takes away makes nothing. The PC keeps its own drag-out.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const app = fs.readFileSync(path.join(__dirname, '../src/renderer/app.js'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, '../src/renderer/styles.css'), 'utf8');
const body = app.slice(app.indexOf('function newBlockMove('), app.indexOf('async function blockOut('));

test('the calendar tells the phone each step of a long press on an empty spot', () => {
  assert.match(app, /selectAllow: \(info\) => \{ if \(MOBILE\) newBlockMove\(info\); return true; \}/);
  assert.match(app, /longPressDelay: 350,/);
});

test('it starts as half an hour, follows the finger a quarter hour at a time, and stays on its day', () => {
  assert.match(body, /holdNew\.end = Math\.min\(a \+ 2 \* NB_SNAP, dayEnd\)/);
  assert.match(body, /const finger = s === a \? e - NB_SNAP : s;/);
  assert.match(body, /holdNew\.start = Math\.min\(a, f\);/);
  assert.match(body, /holdNew\.end = Math\.min\(Math\.max\(a, f\) \+ NB_SNAP, dayEnd\);/);
  assert.match(body, /navigator\.vibrate\?\.\(12\)/);
});

test('lifting saves it and opens it; a cancelled touch makes nothing', () => {
  assert.match(app, /if \(holdNew\.cancelled\) \{ newBlockStop\(\); calendar\.unselect\(\); return; \}/);
  assert.match(app, /return blockOut\(range, r \|\| pointRect\(info\.jsEvent\)\);/);
  assert.match(app, /'touchcancel', \(\) => \{ if \(holdNew\.on\) holdNew\.cancelled = true; lifted\(\); \}/);
});

test('its own look replaces the calendar outline only while making one', () => {
  assert.match(css, /body\.making-block #calendar \.fc-timegrid \.fc-event-mirror, body\.making-block #calendar \.fc-timegrid \.fc-highlight \{ visibility: hidden; \}/);
  assert.match(css, /\.new-block-ghost \{[^}]*pointer-events: none/);
  assert.match(css, /\.new-block-pill \{/);
});
