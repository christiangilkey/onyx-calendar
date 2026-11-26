// 1.142.0: the Onyx panel comes up every time the screen turns on while locked, not about half the time.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const java = (f) => fs.readFileSync(path.join(__dirname, '..', 'mobile/android/app/src/main/java/com/onyxcalendar/app', f), 'utf8');

test('the panel stays while the phone is locked, and goes once it is unlocked', () => {
  const p = java('LockPanelActivity.java');
  const stop = p.slice(p.indexOf('protected void onStop()'), p.indexOf('protected void onNewIntent'));
  assert.match(stop, /if \(unlocking\) return;/);
  assert.match(stop, /if \(km == null \|\| !km\.isKeyguardLocked\(\)\) finish\(\);/);
  assert.doesNotMatch(stop, /if \(!unlocking\) finish\(\);/, 'no longer closed at every screen-off');
  assert.match(p, /resumedAt = System\.currentTimeMillis\(\);/);
  assert.match(p, /if \(!unlocking && \(lock == null \|\| !lock\.isKeyguardLocked\(\) \|\| !LauncherData\.onLock\(this\)\)\) \{/);
});

test('after the screen turns on, the service checks the panel came up and asks again if not', () => {
  const s = java('OnyxLiveService.java');
  assert.match(s, /handler\.postDelayed\(recheckPanel, 450\);\s*handler\.postDelayed\(recheckPanel, 1300\);/);
  assert.match(s, /if \(pm != null && !pm\.isInteractive\(\)\) return;/);
  assert.match(s, /LockPanelActivity\.isFront\(\) \|\| LockPanelActivity\.resumedAt\(\) >= screenOnAt/, 'not over the PIN after it was shown and put away');
});
