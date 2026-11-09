// A picture of your own as a shortcut's icon on the lock screen and Onyx Home, in place of its emoji: picked on
// the phone, cut to a 192-pixel square and kept as a file in the app's storage (ShortcutImages), the shortcut
// keeping only the file's name. It shows in the tiles, the pills and the editor; a missing file falls back to
// the emoji.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const app = read('src/renderer/app.js');
const J = 'mobile/android/app/src/main/java/com/onyxcalendar/app/';
const images = read(`${J}ShortcutImages.java`);
const shortcuts = read(`${J}LockShortcuts.java`);
const plugin = read(`${J}OnyxWidgetPlugin.java`);

const fn = (name) => {
  const src = app.match(new RegExp(`\\n {2}function ${name}\\([^)]*\\) \\{[\\s\\S]*?\\n {2}\\}\\n`));
  assert.ok(src, `${name} in app.js`);
  return new Function(`${src[0]}; return ${name};`)();
};
const shortcutIcon = fn('shortcutIcon');
const svgSized = fn('svgSized');

test('the editor shows a shortcut\'s own picture while the phone has it, and its emoji when the file is gone', () => {
  const urls = { 'abc12345678.png': 'http://localhost/_capacitor_file_/data/x/files/shortcut-icons/abc12345678.png' };
  assert.deepEqual(shortcutIcon({ kind: 'link', icon: '🤕', image: 'abc12345678.png' }, urls), { src: urls['abc12345678.png'] });
  assert.deepEqual(shortcutIcon({ kind: 'link', icon: '🤕', image: 'gone0000001.png' }, urls), { text: '🤕' }, 'missing file: the emoji');
  assert.deepEqual(shortcutIcon({ kind: 'file', image: 'gone0000001.png' }, urls), { text: '📄' }, 'no emoji either: the mark for its kind');
  assert.deepEqual(shortcutIcon({ kind: 'app' }, null), { text: '▦' });
  assert.deepEqual(shortcutIcon({ kind: 'link' }), { text: '🔗' });
});

test('an SVG is given a size to draw at, from its viewBox when it has none, without stretching', () => {
  const icon = svgSized('<?xml version="1.0"?>\n<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path stroke-width="2" d="M0 0h24v24z"/></svg>');
  assert.equal(icon.width, 384);
  assert.equal(icon.height, 384);
  assert.match(icon.text, /^<\?xml version="1\.0"\?>\n<svg width="384" height="384" xmlns=/, 'the rest of the file left as it was');
  assert.match(icon.text, /stroke-width="2"/, 'only the svg\'s own width and height change');

  const wide = svgSized('<svg viewBox="0 0 48 32" xmlns="http://www.w3.org/2000/svg"></svg>');
  assert.deepEqual([wide.width, wide.height], [576, 384], 'the short side is 384, the shape kept');

  const sized = svgSized('<svg width="100px" height="50" xmlns="http://www.w3.org/2000/svg"><rect width="100" height="50"/></svg>');
  assert.deepEqual([sized.width, sized.height], [768, 384]);
  assert.match(sized.text, /^<svg width="768" height="384" viewBox="0 0 100 50" xmlns=/, 'its old size becomes a viewBox, so it scales');
  assert.match(sized.text, /<rect width="100" height="50"\/>/, 'shapes inside untouched');

  const percent = svgSized('<svg width="100%" height="100%" viewBox="0 0 10 20"></svg>');
  assert.deepEqual([percent.width, percent.height], [384, 768], 'a size that isn\'t pixels: the viewBox\'s');
  assert.deepEqual([svgSized('<svg></svg>').width, svgSized('<svg></svg>').height], [384, 384], 'no size at all: a square');
  assert.equal(svgSized('<html><body>not a picture</body></html>'), null);
  assert.equal(svgSized(''), null);
});

test('the page draws an SVG through a data: address, which its rules allow for pictures', () => {
  assert.match(read('src/renderer/index.html'), /img-src 'self' data:/);
  assert.match(app, /img\.src = `data:image\/svg\+xml;charset=utf-8,\$\{encodeURIComponent\(sized\.text\)\}`;/);
  assert.match(app, /c\.width = c\.height = 192;/, 'a 192-pixel square');
  assert.match(app, /drawImage\(img, \(sized\.width - side\) \/ 2, \(sized\.height - side\) \/ 2, side, side, 0, 0, 192, 192\)/, 'its middle square');
});

test('a kept picture\'s name is the only thing stored, and it can never be a path', () => {
  const pattern = images.match(/static final Pattern NAME = Pattern\.compile\("([^"]+)"\);/);
  assert.ok(pattern, 'NAME pattern');
  const name = new RegExp(`^(?:${pattern[1].replace(/\\\\/g, '\\')})$`); // Java's matches() takes the whole string
  // keep() names each new picture from the time and a random number, both in base 36.
  assert.match(images, /String name = Long\.toString\(System\.currentTimeMillis\(\), 36\) \+ Long\.toString\(RANDOM\.nextLong\(\) & Long\.MAX_VALUE, 36\) \+ "\.png";/);
  for (const r of [0n, 1n, 2n ** 63n - 1n]) assert.match(`${Date.now().toString(36)}${r.toString(36)}.png`, name);
  for (const bad of ['../../shared_prefs/x.png', 'a/b12345678.png', 'abc12345678.jpg', 'ABC12345678.png', 'abc.png', '', 'abc12345678.png/..'])
    assert.doesNotMatch(bad, name, bad);
  assert.match(shortcuts, /String image = s\.optString\("image"\)\.trim\(\);\n\s+if \(ShortcutImages\.valid\(image\)\) o\.put\("image", image\);/, 'saved only when it is one of ours');
  assert.match(images, /static File file\(Context ctx, String name\) \{\n\s+return valid\(name\) \? new File\(dir\(ctx\), name\) : null;/);
  assert.match(images, /return new File\(ctx\.getFilesDir\(\), DIR\);/, 'in the app\'s own storage');
  assert.match(images, /private static final String DIR = "shortcut-icons";/);
});

test('a picked picture is read shrunk, the right way up, and cut to its middle square, 192 pixels across', () => {
  assert.match(images, /static final int SIZE = 192;/);
  const sample = images.match(/static int sample\(int w, int h\) \{([\s\S]*?)\n {4}\}/);
  const SIZE = 192;
  const run = new Function('w', 'h', 'SIZE', sample[1].replace(/\bint /g, 'let '));
  for (const [w, h] of [[4032, 3024], [192, 192], [383, 1000], [384, 384], [100, 80], [12000, 9000]]) {
    const n = run(w, h, SIZE);
    const side = Math.floor(Math.min(w, h) / n);
    assert.ok(Math.min(w, h) < SIZE ? n === 1 : side >= SIZE && side < SIZE * 2, `${w}x${h}: by ${n}, short side ${side}`);
  }
  assert.match(images, /if \(Build\.VERSION\.SDK_INT >= 28\) \{\n\s+ImageDecoder\.Source src = ImageDecoder\.createSource\(cr, uri\);/, 'Android 9 on: ImageDecoder (HEIC, AVIF, EXIF turn)');
  assert.match(images, /decoder\.setAllocator\(ImageDecoder\.ALLOCATOR_SOFTWARE\);/, 'not a hardware bitmap: drawn into a Canvas next');
  assert.match(images, /decoder\.setTargetSampleSize\(sample\(/);
  assert.match(images, /o\.inSampleSize = sample\(bounds\.outWidth, bounds\.outHeight\);/, 'before that, BitmapFactory, shrunk too');
  assert.match(images, /case ExifInterface\.ORIENTATION_ROTATE_90: turn = 90; break;/, 'and turned by its EXIF orientation');
  assert.match(images, /int x = \(w - side\) \/ 2, y = \(h - side\) \/ 2;/, 'the middle square');
  assert.match(images, /square\(b\)\.compress\(Bitmap\.CompressFormat\.PNG, 100, out\)/, 'kept as a PNG (a logo keeps its see-through parts)');
});

test('any kind of image can be picked; an SVG comes back for the page to draw, then is kept the same way', () => {
  assert.match(plugin, /new Intent\(Intent\.ACTION_OPEN_DOCUMENT\)\.addCategory\(Intent\.CATEGORY_OPENABLE\)\.setType\("image\/\*"\)/);
  assert.match(plugin, /startActivityForResult\(call, pick, "pickedShortcutImage"\);/);
  assert.match(plugin, /getBridge\(\)\.execute\(\(\) -> \{/, 'read away from the main thread');
  assert.match(plugin, /if \(ShortcutImages\.isSvg\(c\.getContentResolver\(\)\.getType\(uri\), LockShortcuts\.nameOf\(c, uri\)\)\) \{/);
  assert.match(plugin, /o\.put\("svg", ShortcutImages\.svgText\(c, uri\)\);/);
  assert.match(images, /if \(out\.size\(\) > SVG_MAX\) throw new Unusable/, 'an SVG too big is turned down');
  assert.match(plugin, /public void saveShortcutImage\(PluginCall call\)/);
  assert.match(plugin, /ShortcutImages\.decode\(android\.util\.Base64\.decode\(png, android\.util\.Base64\.DEFAULT\)\)/);
  assert.match(plugin, /"This phone can't read that picture\. Try a JPEG or a PNG\."/, 'a kind it can\'t read says so');
  assert.match(app, /if \(f\?\.svg\) f = await svgToPng\(f\.svg\)\.then\(\(png\) => onyx\.launcher\.saveShortcutImage\(png\)\)/);
  const remote = read('src/renderer/remote.js');
  assert.match(remote, /pickShortcutImage: \(\) => Widget\.pickShortcutImage\(\),/);
  assert.match(remote, /saveShortcutImage: \(png\) => Widget\.saveShortcutImage\(\{ png \}\),/);
});

test('the lock screen and Onyx Home draw the picture first, and the emoji when its file is gone', () => {
  const mark = shortcuts.match(/private static View mark\(Activity a, JSONObject s, int size\) \{[\s\S]*?\n {4}\}/)[0];
  assert.ok(mark.indexOf('ShortcutImages.load(a, s.optString("image"))') < mark.indexOf('getApplicationIcon'), 'before the app\'s own icon');
  assert.match(mark, /if \(pic != null\) \{/);
  assert.match(mark, /img\.setLayoutParams\(new LinearLayout\.LayoutParams\(px, px\)\);/, 'as wide as the emoji would be');
  assert.match(mark, /d\.setCornerRadius\(px \* 0\.24f\);/, 'corners rounded');
  assert.match(images, /if \(f == null \|\| !f\.isFile\(\)\) return null;/, 'a missing file: no picture, so the emoji');
  assert.match(shortcuts, /t\.addView\(mark\(a, s, small \? 28 : big \? 44 : 30\)\);/, 'the tiles');
  assert.match(shortcuts, /View mark = mark\(a, s, 20\);/, 'the pills');
});

test('the editor\'s picture and list show it too, with the tiles\' and pills\' sizes', () => {
  assert.match(app, /h\('span', \{ class: 'lx-ic' \}, iconOf\(s\)\)/, 'tiles');
  assert.match(app, /h\('em', null, iconOf\(s\)\)/, 'pills');
  assert.match(app, /h\('span', \{ class: 'le-ic' \}, iconOf\(s\)\)/, 'the list of shortcuts');
  assert.match(app, /const urls = \(\) => \(\{ \.\.\.D\.images, \.\.\.\(setup\?\.images \|\| \{\}\) \}\);/, 'the phone\'s list, and ones just picked');
  assert.match(plugin, /o\.put\("images", ShortcutImages\.urls\(getContext\(\), imagePrefix\(\), list\)\);/);
  assert.match(plugin, /return getBridge\(\)\.getLocalUrl\(\) \+ Bridge\.CAPACITOR_FILE_START;/, 'loaded from the page\'s own origin');
  assert.match(images, /if \(f == null \|\| !f\.isFile\(\)\) continue;/, 'a missing file has no address: the editor shows the emoji');
  const css = read('src/renderer/styles.css');
  assert.match(css, /\.lx-ic img, \.lx-chip em img \{ display: block; width: 1\.25em; height: 1\.25em;/, 'the emoji is 0.8 of the picture\'s size on the phone');
});

test('the form uploads a picture, goes back to the emoji, or removes it', () => {
  assert.match(app, /pic \? 'Change picture' : 'Upload image'/);
  assert.match(app, /onclick: \(\) => \{ delete s\.image; draw\(\); \} \}, 'Use an emoji'\)/, 'the emoji it had comes back');
  assert.match(app, /onclick: \(\) => \{ delete s\.image; s\.icon = ''; draw\(\); \} \}, 'Remove'\)/, 'no icon of its own');
  assert.match(app, /Its picture is gone from this phone, so the emoji shows instead\./);
  assert.match(app, /JPEG, PNG, WebP, GIF, HEIC or SVG/);
  assert.match(app, /const lockDraft = \{ editing: null, redraw: null, images: \{\} \};/, 'a picture picked survives Settings drawn again');
});

test('pictures no shortcut uses are cleared away, after an hour\'s grace for one still being set up', () => {
  assert.match(plugin, /LockShortcuts\.save\(getContext\(\), screen, call\.getArray\("shortcuts"\)\);\n\s+ShortcutImages\.tidy\(getContext\(\)\);/);
  assert.match(images, /for \(String screen : new String\[\] \{ LockLayout\.LOCK, LockLayout\.HOME \}\)/, 'either screen\'s shortcuts keep theirs');
  assert.match(images, /if \(!used\.contains\(f\.getName\(\)\) && now - f\.lastModified\(\) > KEEP_NEW_MS\) f\.delete\(\);/);
  assert.match(images, /KEEP_NEW_MS = 60 \* 60 \* 1000L;/);
});

test('the preview\'s phone has a shortcut with a picture, and picking one goes the SVG way', () => {
  const mock = read('src/renderer/mock.js');
  assert.match(mock, /label: 'Game', icon: '❤️', image: 'mockpicture01\.png' \}/);
  assert.match(mock, /pickShortcutImage: async \(\) => \(\{ svg: picked \}\),/);
  assert.match(mock, /images: Object\.fromEntries\(Object\.entries\(images\)\.filter/);
});
