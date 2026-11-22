// The bridge screen (1.137.0): a button covers the whole screen with the message you leave yourself
// about a half-done task, until you are back. The PC's window goes full screen with it.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

test('a button in the bar opens it, on the phone in the scrolling strip too', () => {
  assert.match(read('src/renderer/index.html'), /<button id="bridge-btn" class="icon-btn bridge-btn"/);
  const app = read('src/renderer/app.js');
  assert.match(app, /\$\('#bridge-btn'\)\.onclick = \(\) => openBridgeScreen\(\);/);
  assert.match(app, /'board-toggle', 'bridge-btn', 'undo-btn'/);
});

test('the message covers the screen until "I am back", and is still up after a restart', () => {
  const app = read('src/renderer/app.js');
  assert.match(app, /function coverWithBridge\(/);
  assert.match(app, /writeLocal\(BRIDGE_SCREEN, s\);/, 'kept on this device');
  assert.match(app, /restoreBridgeScreen\(\); \/\/ left up when Onyx closed/);
  assert.match(app, /if \(s\?\.on && s\.text\) coverWithBridge\(s\);/);
  assert.match(app, /writeLocal\(BRIDGE_SCREEN, \{ \.\.\.s, on: false \}\);\s*closeBridgeLayer\(\);/, 'I am back takes it down');
  assert.match(app, /onyx\.coverScreen\(true, /);
  assert.match(app, /'Cover screen'\);/, 'the task window covers with its bridge too');
  assert.match(read('src/renderer/styles.css'), /\.bridge-screen \{ position: fixed; inset: 0; z-index: 9000;/);
});

test('the PC window goes full screen for it, and only the PC can ask', () => {
  assert.match(read('src/main/main.js'), /'window:cover': \(on, card\) => \{[\s\S]{0,200}win\.setFullScreen\(true\)/);
  assert.match(read('src/preload.js'), /coverScreen: \(on, card\) => call\('window:cover', on, card\),/);
  assert.doesNotMatch(read('src/renderer/remote.js'), /window:cover/);
});
