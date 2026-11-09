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
  assert.match(strings, /name="doomscroll_description">[^<]*All it keeps is how long you spent on each of those apps today, on this phone[^<]*Nothing is sent/);
});

test('every Android string builds: no bare apostrophe or quote (the resource compiler stops on one)', () => {
  const strings = fs.readFileSync(path.join(main, 'res/values/strings.xml'), 'utf8');
  for (const m of strings.matchAll(/<string name="([^"]+)">([^<]*)<\/string>/g)) {
    assert.doesNotMatch(m[2], /(^|[^\\])['"]/, `string ${m[1]} has a bare apostrophe or quote: write \\' or \\"`);
  }
});

test('the service keeps nothing but today\'s time per app: no files, no network', () => {
  const j = fs.readFileSync(path.join(main, 'java/com/onyxcalendar/app/DoomscrollService.java'), 'utf8');
  assert.doesNotMatch(j, /FileOutputStream|openFileOutput|HttpURLConnection|URL\(|putString\("(site|app|url|history)/);
  // What it stores: its own settings (on/off, the minutes, the built-in apps left out, the apps and the websites you
  // added, and the daily limits) and today's totals (only the day and the time per app).
  const stored = [...j.matchAll(/\.put(Boolean|Int|StringSet|String|Long)\("([^"]+)"/g)].map((m) => m[2]);
  assert.deepEqual([...new Set(stored)].sort(), ['addedSites', 'extra', 'limits', 'minutes', 'off', 'on', 'today']);
  assert.match(j, /new JSONObject\(\)\.put\("day", usedDay\)\.put\("used", u\)/, 'today is the day and the time per app, nothing else');
  assert.match(j, /if \(!day\.equals\(usedDay\)\) \{ used\.clear\(\)/, 'and it starts again each day');
});

// Daily limits: the most each app (its site too) may be open in a day; then the phone covers it until midnight.
const svc = () => fs.readFileSync(path.join(main, 'java/com/onyxcalendar/app/DoomscrollService.java'), 'utf8');

test('an app whose time is up today is covered, at once and until it leaves the front', () => {
  const j = svc();
  assert.match(j, /if \(name != null && leftToday\(name, now\) == 0\) \{\s*hideCard\(\);\s*if \(now >= blockQuietUntil\) showBlock\(name\);/);
  assert.match(j, /if \(!limits\(this\)\.isEmpty\(\) \|\| Blocker\.any\(this, System\.currentTimeMillis\(\)\)\) handler\.post\(this::tick\);/, 'a switch of app is looked at straight away');
  assert.match(j, /hideBlock\(\);\s*if \(name != null\) \{/, 'gone once something else is in front');
  assert.match(j, /boolean over = name != null && leftToday\(name, now\) == 0;\s*if \(name != null && !over/, 'time under the cover does not count');
  assert.match(j, /boolean watch = nudge \|\| !limits\(this\)\.isEmpty\(\);/, 'limits work with the card off');
  assert.match(j, /String seen = screenOn && \(watch \|\| blocking\) \? social\(\) : null;\s*String name = watch \? seen : null;/, 'a block list looks too, without counting time');
  // The cover takes every touch, but Android's own home and back still work, and it offers the way out itself.
  assert.match(j, /root\.setClickable\(true\)/);
  assert.match(j, /TYPE_ACCESSIBILITY_OVERLAY,\s*WindowManager\.LayoutParams\.FLAG_NOT_FOCUSABLE \| WindowManager\.LayoutParams\.FLAG_LAYOUT_IN_SCREEN/);
  assert.match(j, /performGlobalAction\(site \? GLOBAL_ACTION_BACK : GLOBAL_ACTION_HOME\)/);
  assert.match(j, /coverButton\("Back to Onyx", true, v -> \{ leaveBlock\(\); openOnyx\(\); \}\)/);
});

test('Onyx itself and the lock screen never count as the app last open (or Back to Onyx would be covered too)', () => {
  const j = svc();
  assert.match(j, /if \(pkg\.equals\(getPackageName\(\)\)\) \{ frontPkg = pkg; frontSite = null; frontHost = null; \}/);
  assert.match(j, /boolean screenOn = \(pm == null \|\| pm\.isInteractive\(\)\) && \(km == null \|\| !km\.isKeyguardLocked\(\)\);/);
});

test('the limits are kept per name, at most 12 hours, warned two minutes before, and reach Settings with today\'s times', () => {
  const j = svc();
  assert.match(j, /static final int MAX_LIMIT = 12 \* 60;/);
  assert.match(j, /private static final long WARN = 2 \* MIN;/);
  assert.match(j, /\(left > 0 && left <= WARN\)/, 'the card comes up near the limit, even with it off');
  assert.match(j, /prefs\(ctx\)\.edit\(\)\.putString\("limits", keep\.toString\(\)\)\.apply\(\);/);
  const plugin = fs.readFileSync(path.join(main, 'java/com/onyxcalendar/app/OnyxWidgetPlugin.java'), 'utf8');
  assert.match(plugin, /DoomscrollService\.setLimits\(getContext\(\), call\.getData\(\)\.optJSONObject\("doomLimits"\)\)/);
  const data = fs.readFileSync(path.join(main, 'java/com/onyxcalendar/app/LauncherData.java'), 'utf8');
  assert.match(data, /o\.put\("doomLimits", DoomscrollService\.limitsJson\(ctx\)\);\s*o\.put\("doomUsed", DoomscrollService\.usedJson\(ctx\)\);/);
  const remote = fs.readFileSync(path.join(__dirname, '../src/renderer/remote.js'), 'utf8');
  assert.match(remote, /\.\.\.\(limits \? \{ doomLimits: limits \} : \{\}\)/);
  const app = fs.readFileSync(path.join(__dirname, '../src/renderer/app.js'), 'utf8');
  assert.match(app, /limitsPart\(info, set\),/, 'Settings → Doomscroll saver → Daily limits');
  assert.match(app, /if \(!info\.doomLimits \|\| !Array\.isArray\(info\.doomNames\)\) return null;/, 'an older Onyx app shows no limits');
});

test('daily limits take your own websites and apps, each with its own minutes, covered until midnight as the rest are', () => {
  const j = svc();
  const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
  // A website you add counts as the built-in sites do, in any browser, with every part of it.
  assert.match(j, /frontSite = siteName\(url, extraSites\(this\)\);/);
  assert.match(j, /static String siteName\(String url, Map<String, String> extra\)/);
  assert.match(j, /if \(extra != null\) \{\s*for \(Map\.Entry<String, String> e : extra\.entrySet\(\)\) \{\s*String site = e\.getKey\(\);\s*if \(host\.equals\(site\) \|\| host\.endsWith\("\." \+ site\)\) return e\.getValue\(\);/);
  assert.match(j, /String host = o == null \? null : Blocker\.hostOf\(o\.optString\("host"\)\);\s*if \(host == null \|\| m\.containsKey\(host\) \|\| siteName\(host\) != null\) continue;/, 'a built-in one is left to its name');
  assert.match(j, /putString\("addedSites", keep\.toString\(\)\)/, 'your list, not where you went');
  // It reaches Settings and comes back from it, with the built-in sites so a typed youtube.com finds YouTube.
  const data = read('mobile/android/app/src/main/java/com/onyxcalendar/app/LauncherData.java');
  assert.match(data, /o\.put\("doomSites", DoomscrollService\.sitesList\(ctx\)\);/);
  assert.match(data, /o\.put\("doomBuiltInSites", DoomscrollService\.builtInSites\(\)\);/);
  assert.match(read('mobile/android/app/src/main/java/com/onyxcalendar/app/OnyxWidgetPlugin.java'), /if \(call\.hasOption\("doomSites"\)\) DoomscrollService\.setSites\(getContext\(\), call\.getData\(\)\.optJSONArray\("doomSites"\)\);\s*\/\/ The daily limits/, 'before the limits, in one call');
  assert.match(read('src/renderer/remote.js'), /\.\.\.\(sites \? \{ doomSites: sites \} : \{\}\), \.\.\.\(limits \? \{ doomLimits: limits \} : \{\}\)/);
  // Settings: added in Daily limits with 30 minutes to start, shown with today's time, taken off with ×.
  const app = read('src/renderer/app.js');
  assert.match(app, /const NEW_LIMIT = 30;/);
  assert.match(app, /set\(\{ sites: \[\.\.\.sites, \{ host, label: host \}\], limits: \{ \.\.\.limits, \[host\]: limits\[host\] \|\| NEW_LIMIT \} \}\);/);
  assert.match(app, /const known = Object\.entries\(info\.doomBuiltInSites \|\| \{\}\)\.find\(\(\[s\]\) => host === s \|\| host\.endsWith\(`\.\$\{s\}`\)\);/);
  assert.match(app, /extra: extra\.some\(\(x\) => x\.pkg === a\.pkg\) \? extra : \[\.\.\.extra, \{ pkg: a\.pkg, label: a\.label \}\], limits: \{ \.\.\.limits, \[a\.label\]: limits\[a\.label\] \|\| NEW_LIMIT \}/);
  assert.match(app, /\.\.\.\(sites \|\| \[\]\)\.map\(\(s\) => s\.label\)\]\)\];/, 'in the list, with today\'s time as every other');
  assert.match(app, /mine\(n\) && h\('button', \{ type: 'button', class: 'doom-x', 'aria-label': `Remove \$\{n\}`/);
  assert.match(app, /const sites = Array\.isArray\(info\.doomSites\) \? info\.doomSites : null;/, 'an older Onyx app: apps only');
});
