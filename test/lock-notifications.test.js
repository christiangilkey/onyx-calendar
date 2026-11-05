// The notifications under the Onyx panel on the lock screen show in full, as on Android's own lock
// screen. "Private" is what a notification is when its app picks nothing, so being private alone
// must not hide it: only your phone's "hide sensitive content", or an app you set to hide its content.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '..', 'mobile/android/app/src/main/java/com/onyxcalendar/app/OnyxNotificationListener.java'), 'utf8');

test('a private notification is hidden only when the phone hides sensitive content', () => {
  assert.doesNotMatch(src, /privateHidden \|\| n\.visibility == Notification\.VISIBILITY_PRIVATE/, 'private alone hid every notification');
  assert.match(src, /privateHidden && n\.visibility == Notification\.VISIBILITY_PRIVATE/);
});

test('an app set to hide its content on the lock screen still does, and nothing hides without a screen lock', () => {
  assert.match(src, /mine == Notification\.VISIBILITY_PRIVATE \|\|/);
  assert.match(src, /getLockscreenVisibilityOverride\(\)/);
  assert.match(src, /SDK_INT >= 31\) return r\.getLockscreenVisibilityOverride/, 'added in Android 12; older phones go by the channel');
  assert.match(src, /boolean hidden = locked && /);
  assert.match(src, /km\.isDeviceSecure\(\)/);
});
