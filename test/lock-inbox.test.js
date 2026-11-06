// Notes typed on the lock screen land in an inbox by the date, and the keyboard never covers the box they are typed in.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const java = (f) => read(`mobile/android/app/src/main/java/com/onyxcalendar/app/${f}`);
const app = read('src/renderer/app.js');

test('the lock screen sends its notes marked as from the lock screen', () => {
  assert.match(java('WidgetData.java'), /new JSONObject\(\)\.put\("title", o\.optString\("title"\)\)\.put\("inbox", "lock"\)/);
  assert.match(java('OnyxPanel.java'), /to Onyx's inbox/);
});

test('the inbox sits just after the date, with how many wait, and each can be planned, ticked off or cleared', () => {
  assert.match(read('src/renderer/index.html'), /<h1 id="range"><\/h1>\s*<!--[^>]*-->\s*<button id="inbox-btn"/);
  assert.match(app, /const lockNotes = \(\) => inboxTasks\(\)\.filter\(\(t\) => t\.from === 'lock' && !t\.done\);/);
  assert.match(app, /h\('span', \{ class: 'inbox-count' \}/);
  const draw = app.slice(app.indexOf('function drawLockInbox('), app.indexOf("lockInboxOpen = true; // (drawn again"));
  assert.ok(draw.includes("openMagic({ pick: [t.id], tab: 'apps' })"), 'Plan: Magic add with it');
  assert.ok(draw.includes('completeTask('), 'Done');
  assert.ok(draw.includes('onyx.dismissInbox(t.id)'), 'Clear: out of the inbox, still a task');
  // On the phone it leads the strip of buttons just after the date (topTools).
  assert.match(app, /strip\.append\(\.\.\.\['inbox-btn', /);
});

test('with the keyboard up, the lock panel ends above it and scrolls the box into sight', () => {
  const lock = java('LockPanelActivity.java');
  assert.match(lock, /Insets ime = insets\.getInsets\(WindowInsetsCompat\.Type\.ime\(\)\);/);
  assert.match(lock, /column\.setPadding\(0, 0, 0, typing \? ime\.bottom \+ dp\(8\) : bars\.bottom \+ dp\(18\)\);/);
  assert.match(lock, /if \(typing\) scroll\.post\(\(\) -> showTyping\(scroll\)\);/);
  assert.match(lock, /scroll\.smoothScrollTo\(0, target\)/);
});
