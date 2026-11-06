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

test('the Inbox is the top of the task list, with how many wait on the Tasks button; each can be planned, ticked off or cleared', () => {
  assert.doesNotMatch(read('src/renderer/index.html'), /id="inbox-btn"/, 'one place for both, not a button of its own');
  assert.match(app, /const inboxOpen = \(\) => inboxTasks\(\)\.filter\(\(t\) => !t\.done && !t\.mirror\);/, 'the lock screen\'s notes and what other apps sent');
  assert.match(app, /const b = \$\('#toggle-tasks'\);[\s\S]{0,300}h\('span', \{ class: 'inbox-count' \}/);
  assert.match(app, /box\.replaceChildren\(\.\.\.\[inboxGroup\(inbox\), rolloverTray\(earlier, someday\)/, 'first in the list');
  assert.match(app, /visible\(t\.listId\) && matchesFilter\(t\.tags\) && !inInbox\.has\(t\.id\)\);/, 'not twice');
  const row = app.slice(app.indexOf('function inboxRow('), app.indexOf('async function loadGoals('));
  assert.ok(row.includes('const row = taskRow(t);'), 'a task card like the rest: tick it off, give it a day, open it, drag it');
  assert.ok(row.includes("openMagic({ pick: [t.id], tab: 'apps' })"), 'Plan: Magic add with it');
  assert.ok(row.includes('onyx.dismissInbox(t.id)'), 'Clear: out of the inbox, still a task');
  assert.ok(row.includes("t.from === 'lock' ? 'From your lock screen'"));
  assert.match(app, /openMagic\(\{ pick: items\.map\(\(t\) => t\.id\), tab: 'apps' \}\)/, 'Plan all');
  assert.match(app, /\{ label: 'Open', run: openInbox \}/, 'a new note\'s toast opens the list there');
});

test('with the keyboard up, the lock panel ends above it and scrolls the box into sight', () => {
  const lock = java('LockPanelActivity.java');
  assert.match(lock, /Insets ime = insets\.getInsets\(WindowInsetsCompat\.Type\.ime\(\)\);/);
  assert.match(lock, /column\.setPadding\(0, 0, 0, typing \? ime\.bottom \+ dp\(8\) : bars\.bottom \+ dp\(18\)\);/);
  assert.match(lock, /if \(typing\) scroll\.post\(\(\) -> showTyping\(scroll\)\);/);
  assert.match(lock, /scroll\.smoothScrollTo\(0, target\)/);
});
