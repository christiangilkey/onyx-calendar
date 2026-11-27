// 1.145.0: today's plan (the after-action review) and Unstick on the phone's lock screen.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const java = (f) => read(`mobile/android/app/src/main/java/com/onyxcalendar/app/${f}`);

test('the lock screen has the two parts, placed by the editor, and fetches the reviews from the PC', () => {
  const layout = java('LockLayout.java');
  assert.match(layout, /PARTS = Arrays\.asList\("clock", "now", "plan", "goals", "quick", "day", "unstick", "shortcuts", "music", "notifications", "noise"\)/);
  assert.match(layout, /order\.add\(at, p\);/, 'a new part goes in after the one it follows, not at the bottom');
  const panel = java('LockPanelActivity.java');
  assert.match(panel, /parts\.put\("plan", planPart\);\s*parts\.put\("unstick", unstickPart\);/);
  assert.match(panel, /if \(review != null\) review\.render\(\);/);
  assert.match(panel, /Uri\.parse\("onyx:\/\/open\?" \+ query/);
  assert.match(java('LauncherData.java'), /WidgetData\.rpc\(ctx, "aar:get", new JSONArray\(\)\.put\(today\.minusDays\(1\)\.toString\(\)\)\)/);
  const parts = java('ReviewParts.java');
  assert.match(parts, /open\.accept\("view=unstick"\)/);
  assert.match(parts, /open\.accept\("view=unstick&state=rescue"\)/);
  assert.match(parts, /open\.accept\("view=aar&date=" \+ today\.minusDays\(1\)\)/);
  assert.match(parts, /plan\.setVisibility\(View\.GONE\); \/\/ nothing planned/);
});

test('the app opens Unstick or a review from the lock screen link, and the editor knows the parts', () => {
  assert.match(read('src/renderer/remote.js'), /state: q\.get\('state'\) \|\| ''/);
  const app = read('src/renderer/app.js');
  assert.match(app, /if \(d\.view === 'unstick'\) \{ openUnstick\(d\.state \|\| ''\); return; \}/);
  assert.match(app, /if \(d\.view === 'aar'\) \{ openAar\(/);
  assert.match(app, /plan: "Today's plan \(review\)", goals: 'Goals', quick: 'Add a task', day: 'Today', unstick: 'Unstick'/);
});
