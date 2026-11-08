// Shortcuts on the lock screen as tiles of a bento box, and the screen editor's picture drawn to the phone's
// own scale from what its cards show now (OnyxPanel.preview), so it matches the lock screen.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const app = read('src/renderer/app.js');
const J = 'mobile/android/app/src/main/java/com/onyxcalendar/app/';
const shortcuts = read(`${J}LockShortcuts.java`);

const src = app.match(/\n {2}function bentoTiles\(n\) \{[\s\S]*?\n {2}\}\n/);
const bentoTiles = new Function(`${src[0]}; return bentoTiles;`)();

test('every number of shortcuts fills the box: no gaps, no overlaps, four across', () => {
  for (let n = 1; n <= 12; n++) {
    const spots = bentoTiles(n);
    assert.equal(spots.length, n, `${n}: a place for each`);
    const cells = new Map();
    for (const [c, r, w, tall] of spots) {
      assert.ok(c >= 0 && c + w <= 4, `${n}: inside the four columns`);
      for (let y = r; y < r + tall; y++) for (let x = c; x < c + w; x++) {
        assert.ok(!cells.has(`${x},${y}`), `${n}: cell ${x},${y} taken twice`);
        cells.set(`${x},${y}`, true);
      }
    }
    const rows = Math.max(...spots.map(([, r, , tall]) => r + tall));
    assert.equal(cells.size, rows * 4, `${n}: every row full`);
  }
});

test('one fills the row, two share it, and from three on the first is big', () => {
  assert.deepEqual(bentoTiles(1), [[0, 0, 4, 1]]);
  assert.deepEqual(bentoTiles(2), [[0, 0, 2, 1], [2, 0, 2, 1]]);
  assert.deepEqual(bentoTiles(3), [[0, 0, 2, 2], [2, 0, 2, 1], [2, 1, 2, 1]]);
  assert.deepEqual(bentoTiles(4), [[0, 0, 2, 2], [2, 0, 2, 1], [2, 1, 1, 1], [3, 1, 1, 1]]);
  assert.deepEqual(bentoTiles(5).map(([, , w, tall]) => `${w}x${tall}`), ['2x2', '1x1', '1x1', '1x1', '1x1']);
  for (let n = 3; n <= 12; n++) assert.deepEqual(bentoTiles(n)[0], [0, 0, 2, 2], `${n}: big first`);
  assert.deepEqual(bentoTiles(0), []);
});

test('the phone lays the tiles out by the same rules as the picture', () => {
  for (const rule of [
    'if (n == 1) sizes.add(F);',
    'else if (n == 2) { sizes.add(W); sizes.add(W); }',
    'else if (n == 3) { sizes.add(B); sizes.add(W); sizes.add(W); }',
    'else if (n == 4) { sizes.add(B); sizes.add(W); sizes.add(S); sizes.add(S); }',
    'for (; rest >= 4; rest -= 4) for (int i = 0; i < 4; i++) sizes.add(S);',
    'if (rest == 1) sizes.add(F);',
    'else if (rest == 3) { sizes.add(W); sizes.add(S); sizes.add(S); }',
  ]) assert.ok(shortcuts.includes(rule), rule);
  assert.match(app, /sizes\.push\(\.\.\.\[\[\], \[F\], \[W, W\], \[W, S, S\]\]\[rest\]\);/);
  assert.match(shortcuts, /most = dp\(c, 96\)/, 'cells at most 96dp');
  assert.match(app, /Math\.min\(96, Math\.floor\(\(ph\.w - 32 - 30\) \/ 4\)\)/, 'the picture\'s cells the same');
});

test('the lock screen starts with tiles, Onyx Home keeps its pills, and either can change', () => {
  const layout = read(`${J}LockLayout.java`);
  assert.match(layout, /in\.optString\("shortcutLook", home \? "pills" : "tiles"\)/);
  assert.match(layout, /out\.put\("shortcutLook", look\);/, 'kept when saved');
  assert.match(shortcuts, /if \("tiles"\.equals\(LockLayout\.get\(a, screen\)\.optString\("shortcutLook"\)\)\) return tiles\(a, list, open\);/);
  assert.match(app, /field\('Shortcuts as'/);
  assert.match(app, /setLayout\(\{ shortcutLook: v \}\)/);
  assert.match(app, /'Clock and shortcuts on', 'Shortcuts as',/, 'search finds it');
  assert.match(shortcuts, /float radius = dp\(a, big \? 26 : 20\);/, 'tiles have rounded corners, not a pill\'s ends');
});

test('the picture is drawn from what the lock screen shows, at the phone\'s own size', () => {
  const panel = read(`${J}OnyxPanel.java`);
  assert.match(panel, /static org\.json\.JSONObject preview\(Context ctx\)/);
  assert.match(panel, /if \(rest\.length\(\) == 7\) break;/, 'seven of today, as dayCard');
  assert.match(panel, /if \(tomorrow\.length\(\) == 3\) break;/, 'three of tomorrow, as dayCard');
  assert.match(panel, /o\.put\("waiting", WidgetData\.quickWaiting\(ctx\)\);/, 'the notes waiting for the PC');
  const plugin = read(`${J}OnyxWidgetPlugin.java`);
  assert.match(plugin, /o\.put\("panel", OnyxPanel\.preview\(getContext\(\)\)\);/);
  assert.match(plugin, /o\.put\("phone", phoneScreen\(\)\);/);
  assert.match(app, /const p = setup\.panel \|\| panelGuess\(\);/);
  assert.match(app, /const k = PREVIEW_W \/ ph\.w;/, 'shrunk from the phone\'s width');
  assert.match(app, /'lp-screen', css: \{ width: `\$\{ph\.w\}px`, height: `\$\{ph\.h\}px`, transform: `scale\(\$\{k\}\)` \}/);
  for (const part of ['Goals', 'Add a task…', 'Today · ', 'Next · tomorrow', 'Free for ']) assert.ok(app.includes(part), part);
  assert.match(app, /Below the first screen: /, 'says what starts below the first screen');
});

test('dragging works in the shrunk picture, and a tile takes the size of the place it moves to', () => {
  assert.match(app, /function dragToOrder\(box, \{ axis = 'y', items, key, done, skip, moved, scale, hold = 230 \}\)/);
  assert.match(app, /\(d\.x - gx - r\.left\) \/ k\(\)/, 'the finger\'s move undone by the scale');
  assert.match(app, /else if \(axis === 'grid'\)/);
  assert.match(app, /moved: tiles \? \(\) => items\(\)\.forEach\(\(el, j\) => spot\(el, spots\[j\]\)\) : null/);
});
