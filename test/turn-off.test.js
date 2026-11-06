// Turn off: whatever is going off (the phone's alarm ringing, the Pi calling or reminding, the due screen, the
// PC's popups) is turned off by one button, on the lock screen, on Onyx Home, on the alarm's own screen and in
// the app; on the phone at once, whether or not the PC can be reached, and the PC told now or later.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const java = (f) => read(`mobile/android/app/src/main/java/com/onyxcalendar/app/${f}`);

test('the phone turns it all off itself: the ringing, the cards, the call notification, with no PC needed', () => {
  const a = java('Alerts.java');
  const off = a.slice(a.indexOf('static int offAll('), a.indexOf('static void off('));
  assert.match(off, /AlarmService\.stopNow\(app\);/);
  assert.match(off, /e\.putBoolean\("ack_" \+ it\.id \+ "_" \+ it\.start, true\);/, 'each one seen here at once');
  assert.match(off, /nm\.cancel\(OnyxLiveService\.ID_CALL\);/);
  assert.match(off, /for \(String id : ids\) keep\(app, id, false\);\s*sendSoon\(app\);/, 'the PC told, now or later');
  assert.match(off, /AlarmActivity\.planNext\(app\);/, 'no alarm set again for it');
  assert.match(a, /if \(o\.optBoolean\("done"\)\) WidgetData\.completeTask\(ctx, o\.optString\("id"\)\);\s*WidgetData\.rpc\(ctx, "event:ack"/);
  assert.match(a, /keep\.put\(o\);/, 'what the PC could not be told is kept');
  // The lock screen's own buttons used to wait on the PC, and did nothing when it was out of reach.
  assert.match(java('LauncherData.java'), /static void acknowledge\(Context ctx, Item item\) throws Exception \{[^}]*Alerts\.off\(ctx, item\.id, item\.start, "task"\.equals\(item\.kind\)\);\s*\}/);
  assert.match(java('LauncherData.java'), /if \(Alerts\.later\(ctx\)\.length\(\) > 0\) Alerts\.send\(ctx\);/, 'sent once the PC answers');
});

test('the alarm: Stop turns everything off, straight to the service, and its screen is not covered by the panel', () => {
  const s = java('AlarmService.java');
  assert.match(s, /if \(ACTION_STOP\.equals\(action\)\) \{\s*Alerts\.offAll\(this\);\s*end\(\);/);
  assert.match(s, /static void stopNow\(Context ctx\) \{/);
  assert.match(s, /private void leaving\(Intent what\) \{[\s\S]*?Alerts\.off\(this, id,/);
  const act = java('AlarmActivity.java');
  assert.match(act, /if \(AlarmService\.ACTION_STOP\.equals\(action\)\) \{\s*Alerts\.offAll\(this\);\s*finish\(\);/);
  assert.match(act, /button\("Turn off", 0xFFF5B83D/);
  assert.match(java('OnyxLiveService.java'), /if \(AlarmService\.coversNow\(this\)\) return;/);
});

test('the lock screen and Onyx Home: a big Turn off on what is going off, the alarm included', () => {
  const p = java('OnyxPanel.java');
  assert.match(p, /if \(calling != null \|\| ringing\) top\.addView\(callCard\(calling, t\)\);/);
  assert.match(p, /TextView off = button\(more > 0 \? "Turn off all" : "Turn off", true, v -> host\.turnOff\(\)\);/);
  assert.match(p, /if \(ringing != AlarmService\.isRinging\(\)\) return true;/, 'drawn again as it starts or stops');
  for (const f of ['LockPanelActivity.java', 'LauncherActivity.java']) assert.match(java(f), /public void turnOff\(\) \{\s*int n = Alerts\.offAll\(this\);/, f);
});

test('the app: a bar across the top while anything goes off, up as it opens, with one Turn off', () => {
  const app = read('src/renderer/app.js');
  assert.match(java('OnyxWidgetPlugin.java'), /public void alerts\(PluginCall call\)/);
  assert.match(read('src/renderer/remote.js'), /alerts: Widget\?\.alerts \? \{/);
  assert.match(read('src/main/main.js'), /'alert:closeAll': \(\) => \{/);
  assert.match(read('src/preload.js'), /closeAlerts: \(\) => call\('alert:closeAll'\),/);
  assert.match(app, /readRinging\(true\); \/\/ anything going off as the app opens/);
  assert.match(app, /document\.addEventListener\('visibilitychange', \(\) => \{ if \(!document\.hidden\) readRinging\(true\); \}\);/);
  const off = app.slice(app.indexOf('async function turnOffAll('), app.indexOf('/** A soft two-note chime'));
  assert.match(off, /onyx\.alerts\.off\(\)/);
  assert.match(off, /onyx\.closeAlerts\(\)/, 'the PC popups too');
  assert.match(off, /onyx\.ackCall\?\.\(x\.id\)/, 'no more calls about it (kept and sent later when offline)');
  assert.match(off, /due\.hidden\.set\(due\.key, Infinity\)/, 'the due screen goes');
  assert.match(app, /if \(s\?\.later\) \{ const t = await onyx\.alerts\.take\(\)/, 'what the lock screen could not tell the PC, the app sends');
  assert.match(read('src/renderer/styles.css'), /#ringing-bar \{ position: fixed; left: 0; right: 0; top: 0; z-index: 1000;/);
});
