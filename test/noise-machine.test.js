// The noise machine: Hyperfocus's recordings on their own, from the top bar. On the phone the app plays them
// itself (NoiseService), from the files inside it, on with the screen off, and from the lock screen and Onyx
// Home (a part added in the app). The screen editor's preview is put in order by hand.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const F = require('../src/renderer/focus-plan');

const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const java = (f) => read(`mobile/android/app/src/main/java/com/onyxcalendar/app/${f}`);
const app = read('src/renderer/app.js');
const svc = java('NoiseService.java');

test('the phone makes each loop exactly as the app does, from the same recordings', () => {
  for (const [kind, s] of Object.entries(F.SOUND_FILES)) {
    const line = svc.match(new RegExp(`case "${kind}": return new Spec\\("([^"]+)", ([\\d.]+), ([\\d.]+), ([\\d.]+), (-?[\\d.]+), ([\\d.]+)\\);`))
      || (kind === 'brown' && svc.match(/default: return new Spec\("([^"]+)", ([\d.]+), ([\d.]+), ([\d.]+), (-?[\d.]+), ([\d.]+)\);/));
    assert.ok(line, `${kind} is on the phone`);
    assert.deepEqual(line.slice(1).map((v, i) => (i ? +v : v)), [s.file, s.start, s.length, s.fade, s.db, s.lowCut || 0], `${kind} matches SOUND_FILES`);
    assert.ok(fs.existsSync(path.join(__dirname, '../src/renderer/assets/sounds', s.file)), `${s.file} ships with the app`);
  }
  assert.match(read('scripts/build-mobile.js'), /fs\.cpSync\(path\.join\(src, 'assets'\), path\.join\(out, 'assets'\), \{ recursive: true \}\);/, 'the sounds go into the phone app');
  assert.match(svc, /String path = "public\/assets\/sounds\/" \+ file;/);
  assert.doesNotMatch(svc, /HttpURLConnection|new URL\(|setDataSource\("http/, 'nothing streamed');
  // The blend over the loop's start, equal power, as loopBuffer does it.
  assert.match(svc, /v = \(float\) \(v \* Math\.sqrt\(t\) \+ out\[\(st \+ n \+ i\) \* ch \+ c2\] \* Math\.sqrt\(1 - t\)\);/);
  assert.match(svc, /return \(float\) Math\.min\(1\.0, v \* v \* 1\.2\);/, 'the slider curve is noiseGain\'s');
});

test('it plays on with the screen off, as media, until stopped or its timer runs out', () => {
  const m = read('mobile/android/app/src/main/AndroidManifest.xml');
  assert.match(m, /<service\s+android:name="\.NoiseService"\s+android:exported="false"\s+android:foregroundServiceType="mediaPlayback" \/>/);
  assert.match(m, /android\.permission\.FOREGROUND_SERVICE_MEDIA_PLAYBACK/);
  assert.match(svc, /startForeground\(NOTE_ID, n, ServiceInfo\.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK\)/);
  assert.match(svc, /PowerManager\.PARTIAL_WAKE_LOCK, "onyx:noise"/);
  assert.match(svc, /if \(on && endsAt > 0 && System\.currentTimeMillis\(\) >= endsAt\) \{ on = false; timedOut = true; \}/);
  assert.match(svc, /AudioManager\.ACTION_AUDIO_BECOMING_NOISY/, 'headphones out: it stops');
  assert.match(svc, /"Next sound"/);
  assert.match(svc, /"Stop"/);
  assert.match(svc, /if \(!\(kind\.equals\(sounding\) && soundingGen == gen\)\) begin\(kind\);/, 'a new timer leaves the sound as it is');
});

test('the lock screen and Onyx Home can have it, switched on in the app, off until then', () => {
  const layout = java('LockLayout.java');
  assert.match(layout, /static final List<String> ADDED = Arrays\.asList\("noise"\);/);
  assert.match(layout, /if \(ADDED\.contains\(p\) && !has\(hidden, p\)\) hidden\.put\(p\);/);
  assert.match(java('LockPanelActivity.java'), /parts\.put\("noise", noisePart\);/);
  assert.match(java('LockPanelActivity.java'), /if \(!LockLayout\.shows\(layout, "noise"\)\) \{ noisePart\.setVisibility\(View\.GONE\); noise = null; \}/);
  assert.match(java('LauncherActivity.java'), /parts\.put\("noise", noisePart\);/);
  const part = java('NoisePart.java');
  assert.match(part, /play\.setOnClickListener\(v -> NoiseService\.toggle\(ctx\)\);/);
  assert.match(part, /next\.setOnClickListener\(v -> NoiseService\.next\(ctx\)\);/);
  assert.doesNotMatch(part, /unlock\(|requestDismissKeyguard/, 'it plays without unlocking');
  assert.match(app, /noise: 'Noise machine' \}/, 'in the editor\'s list of parts');
});

test('the app reaches it through the plugin, and plays it itself on the PC, apart from Hyperfocus', () => {
  assert.match(java('OnyxWidgetPlugin.java'), /public void noise\(PluginCall call\)/);
  assert.match(read('src/renderer/remote.js'), /noise: Widget\?\.noise \? \{/);
  assert.match(app, /const noiseMachine = \(\) => onyx\.noise \|\| webMachine;/);
  assert.match(app, /playOn\(machine, kind, volume\);/, 'its own player');
  assert.match(app, /function playNoise\(kind, volume\) \{\s*if \(kind === 'none' \|\| kind === 'spotify' \|\| !volume\) \{ stopNoise\(\); return; \}\s*playOn\(noise, kind, volume\);/);
  const kinds = [...app.matchAll(/\['(\w+)', '[^']+', '[^']+'\]/g)].map((m) => m[1]).filter((k) => F.SOUND_FILES[k]);
  assert.deepEqual([...new Set(kinds)].sort(), Object.keys(F.SOUND_FILES).sort(), 'every recording, in the panel');
  assert.match(read('src/renderer/index.html'), /<button id="noise-btn" class="icon-btn noise-btn" title="Noise machine"><\/button>/);
  assert.match(app, /strip\.append\(\.\.\.\['pomo-timer', 'noise-btn',/, 'on the phone, at the start of the strip');
});

test('the preview is put in order by hand: a part up or down, a shortcut along its row', () => {
  const drag = app.slice(app.indexOf('function dragToOrder('), app.indexOf('function screenEditor('));
  assert.match(drag, /if \(e\.pointerType === 'mouse'\) lift\(\);\s*else d\.timer = setTimeout\(lift, hold\);/, 'press and hold on a touch screen');
  assert.match(drag, /if \(Math\.hypot\(d\.x - d\.sx, d\.y - d\.sy\) > 8\) end\(false\);/, 'a swipe still scrolls');
  assert.match(drag, /box\.addEventListener\('touchmove', \(e\) => \{ if \(d\?\.on\) e\.preventDefault\(\); \}, \{ passive: false \}\);/);
  const editor = app.slice(app.indexOf('function screenEditor('), app.indexOf('function standaloneCard('));
  assert.match(editor, /const next = l\.order\.map\(\(p\) => \(shown\.includes\(p\) \? moved\.shift\(\) : p\)\);/, 'hidden parts keep their places');
  assert.match(editor, /setLayout\(\{ order: next \}\);/);
  assert.match(editor, /save\(\{ shortcuts: order\.map\(\(i\) => setup\.shortcuts\[i\]\) \}\);/);
  assert.match(editor, /'Press and hold a part or a shortcut on it, then drag it where you want it\.'/);
});
