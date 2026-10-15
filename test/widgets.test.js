// The Android widget layouts may only use the views RemoteViews can show: anything else
// makes the home screen say "An error occurred when loading widget" (a plain <View> did, in 1.13.0).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const LAYOUTS = path.join(__dirname, '../mobile/android/app/src/main/res/layout');
// https://developer.android.com/develop/ui/views/appwidgets/build-ui (Android 8 and up; minSdk is 26)
const ALLOWED = new Set([
  'FrameLayout', 'LinearLayout', 'RelativeLayout', 'GridLayout',
  'AnalogClock', 'Button', 'Chronometer', 'ImageButton', 'ImageView', 'ProgressBar', 'TextView', 'ViewStub',
  'AdapterViewFlipper', 'GridView', 'ListView', 'StackView', 'ViewFlipper',
]);

for (const file of fs.readdirSync(LAYOUTS).filter((f) => f.startsWith('widget_'))) {
  test(`${file} uses only views a widget may show`, () => {
    const xml = fs.readFileSync(path.join(LAYOUTS, file), 'utf8').replace(/<!--[\s\S]*?-->/g, '');
    const tags = [...xml.matchAll(/<([A-Za-z][\w.]*)[\s/>]/g)].map((m) => m[1]);
    assert.ok(tags.length > 0);
    assert.deepEqual(tags.filter((t) => !ALLOWED.has(t)), []);
  });
}
