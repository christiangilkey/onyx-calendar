// The doomscroll saver (the Android app's DoomscrollService): declared as an accessibility service
// that hears only window changes (which app is in front), and asks for nothing more than it uses.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const main = path.join(__dirname, '../mobile/android/app/src/main');

test('the service is declared for Android to bind, and nothing else can', () => {
  const m = fs.readFileSync(path.join(main, 'AndroidManifest.xml'), 'utf8');
  const svc = m.match(/<service\s+android:name="\.DoomscrollService"[\s\S]*?<\/service>/)?.[0];
  assert.ok(svc, 'DoomscrollService is in the manifest');
  assert.match(svc, /android:permission="android\.permission\.BIND_ACCESSIBILITY_SERVICE"/);
  assert.match(svc, /android\.accessibilityservice\.AccessibilityService/);
  assert.match(svc, /android:resource="@xml\/doomscroll_service"/);
});

test('it hears window changes only: not the screen\'s content changing, not what is typed', () => {
  const x = fs.readFileSync(path.join(main, 'res/xml/doomscroll_service.xml'), 'utf8');
  assert.match(x, /android:accessibilityEventTypes="typeWindowStateChanged"/);
  assert.doesNotMatch(x, /typeAllMask|typeViewTextChanged|typeWindowContentChanged|typeViewFocused/);
  assert.doesNotMatch(x, /flagRequestFilterKeyEvents|canRequestFilterKeyEvents/);
  const strings = fs.readFileSync(path.join(main, 'res/values/strings.xml'), 'utf8');
  assert.match(strings, /name="doomscroll_description">[^<]*Nothing is saved or sent/);
});

test('the service keeps nothing: no files, no network, only the minutes in memory', () => {
  const j = fs.readFileSync(path.join(main, 'java/com/onyxcalendar/app/DoomscrollService.java'), 'utf8');
  assert.doesNotMatch(j, /FileOutputStream|openFileOutput|HttpURLConnection|URL\(|putString\("(site|app|url|history)/);
  // Its own settings are the only thing it stores: on/off and the minutes.
  const stored = [...j.matchAll(/\.put(Boolean|Int|String|Long)\("([^"]+)"/g)].map((m) => m[2]);
  assert.deepEqual([...new Set(stored)].sort(), ['minutes', 'on']);
});
