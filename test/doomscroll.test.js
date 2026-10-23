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
  assert.match(strings, /name="doomscroll_description">[^<]*All it keeps is today's time on each of those apps, on this phone[^<]*Nothing is sent/);
});

test('the service keeps nothing but today\'s time per app: no files, no network', () => {
  const j = fs.readFileSync(path.join(main, 'java/com/onyxcalendar/app/DoomscrollService.java'), 'utf8');
  assert.doesNotMatch(j, /FileOutputStream|openFileOutput|HttpURLConnection|URL\(|putString\("(site|app|url|history)/);
  // What it stores: its own settings (on/off and the minutes) and today's totals (only the day and the time per app).
  const stored = [...j.matchAll(/\.put(Boolean|Int|String|Long)\("([^"]+)"/g)].map((m) => m[2]);
  assert.deepEqual([...new Set(stored)].sort(), ['minutes', 'on', 'today']);
  assert.match(j, /new JSONObject\(\)\.put\("day", usedDay\)\.put\("used", u\)/, 'today is the day and the time per app, nothing else');
  assert.match(j, /if \(!day\.equals\(usedDay\)\) \{ used\.clear\(\)/, 'and it starts again each day');
});
