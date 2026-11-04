// Settings → Home & lock screen: one page, a switch for each screen in place of "Where should Onyx show?",
// and an editor for each, kept apart on the phone (a layout and a shortcut list per screen).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const app = read('src/renderer/app.js');
const J = 'mobile/android/app/src/main/java/com/onyxcalendar/app/';

test('the lock screen editor is part of Home & lock screen, and its old names still find it', () => {
  assert.doesNotMatch(app, /\blockeditor\(\)|lockeditor: \{ name/, 'no page of its own');
  assert.match(app, /\['launcher', 'doomscroll'\]/);
  assert.match(app, /if \(tab === 'lockeditor'\) tab = 'launcher';/, 'an old link to it lands on the new page');
  const entry = app.match(/launcher: \{ name: 'Home & lock screen'[\s\S]*?words: '([^']*)' \}/);
  assert.ok(entry, 'the page\'s search entry');
  for (const w of ['lock screen editor', 'where should onyx show']) assert.ok(entry[1].includes(w), w);
  assert.doesNotMatch(app, /Where should Onyx show\?'\),/, 'the where-question is gone from the page');
  assert.match(app, /screenEditor\(screen\)/, 'an editor per screen');
  assert.match(app, /onyx\.launcher\.setLockSetup\(patch, screen\)/);
});

test('each screen keeps its own layout and shortcuts on the phone, and Onyx Home follows its own', () => {
  const layout = read(`${J}LockLayout.java`);
  assert.match(layout, /HOME_PARTS = Arrays\.asList\("clock", "onyx", "shortcuts", "widgets", "apps"\)/);
  assert.match(layout, /static final List<String> PARTS = Arrays\.asList\("clock", "onyx", "shortcuts", "music", "notifications"\)/, 'the lock screen\'s list keeps its name');
  assert.match(layout, /"homeLayout" : "lockLayout"/, 'the lock screen keeps its saved layout');
  assert.match(layout, /home \? "left" : "center"/, 'Onyx Home starts as it always looked');
  assert.match(read(`${J}LockShortcuts.java`), /HOME_KEY = "homeShortcuts"/);
  const plugin = read(`${J}OnyxWidgetPlugin.java`);
  assert.match(plugin, /LockLayout\.save\(getContext\(\), screen, call\.getObject\("layout"\)\)/);
  const home = read(`${J}LauncherActivity.java`);
  assert.match(home, /LockLayout\.get\(this, LockLayout\.HOME\)/);
  assert.match(home, /applyLayout\(\); \/\/ changed in the app meanwhile\?/, 'read again each time Onyx Home comes back');
  assert.match(read('src/renderer/remote.js'), /Widget\.setLockSetup\(\{ \.\.\.o, screen \}\)/);
});
