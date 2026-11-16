// The lock screen's calendar cards are parts of their own (1.133.0): now and next, the goals, the box to add
// a task, and the rest of today, each moved and hidden apart. Onyx Home keeps them together.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const J = 'mobile/android/app/src/main/java/com/onyxcalendar/app/';

test('the panel builds each card in a box of its own, and the lock screen places each', () => {
  const panel = read(J + 'OnyxPanel.java');
  assert.match(panel, /static final java\.util\.List<String> PARTS = java\.util\.Arrays\.asList\("now", "goals", "quick", "day"\);/);
  for (const [box, card] of [['nowBox', 'nowNextCard'], ['goalsBox', 'goalsCard'], ['quickBox', 'quickCard'], ['dayBox', 'dayCard']]) {
    assert.match(panel, new RegExp(`${box}\\.addView\\(${card}\\(`), `${card} goes in ${box}`);
  }
  assert.doesNotMatch(panel, /root\.post\(/, 'a box taken out of root still gets its updates');
  const lock = read(J + 'LockPanelActivity.java');
  assert.match(lock, /for \(String p : OnyxPanel\.PARTS\) \{\s*LinearLayout s = section\(\);\s*s\.addView\(panel\.part\(p\)\);\s*parts\.put\(p, s\);/);
  assert.match(lock, /for \(String p : OnyxPanel\.PARTS\) if \(!LockLayout\.shows\(layout, p\)\) parts\.get\(p\)\.setVisibility\(View\.GONE\);/);
  assert.match(read(J + 'LauncherActivity.java'), /parts\.put\("onyx", panelBox\);/, 'Onyx Home keeps them as one');
});

test('a layout saved before is split where the calendar was, hidden if it was hidden', () => {
  const layout = read(J + 'LockLayout.java');
  assert.match(layout, /if \(split && "onyx"\.equals\(p\)\) \{ for \(String q : ONYX\) if \(!order\.contains\(q\)\) order\.add\(q\); continue; \}/);
  assert.match(layout, /if \(split && "onyx"\.equals\(p\)\) \{ for \(String q : ONYX\) if \(!has\(hidden, q\)\) hidden\.put\(q\); \}/);
});

test('the editor names each part and draws each apart', () => {
  const app = read('src/renderer/app.js');
  assert.match(app, /now: 'Now and next', goals: 'Goals', quick: 'Add a task', day: 'Today', onyx: 'Calendar'/);
  for (const p of ['now', 'goals', 'quick', 'day']) assert.match(app, new RegExp(`\\n        ${p}: h\\('div', \\{ class: 'lx-panel' \\}`));
});
