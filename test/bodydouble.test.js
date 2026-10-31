// Hyperfocus's study companion (body doubling): the cat's five clips are in the window's files, each packed
// with its own see-through parts (colour on the left half, how solid each pixel is on the right), as long as
// it should be; its phases follow the session's thirds and step only forward; the window may play them, and
// the phone app gets them too.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const F = require('../src/renderer/focus-plan');

const root = path.resolve(__dirname, '..');
const assets = path.join(root, 'src/renderer/assets');

/** An MP4's picture size (its track header) and frame count (its sample sizes box). */
function mp4(file) {
  const b = fs.readFileSync(file);
  assert.equal(b.subarray(4, 8).toString('latin1'), 'ftyp', `${path.basename(file)} is an MP4`);
  const tkhd = b.indexOf('tkhd');
  const at = tkhd + (b[tkhd + 4] === 1 ? 92 : 80);
  const stsz = b.indexOf('stsz');
  return { width: b.readUInt32BE(at) >>> 16, height: b.readUInt32BE(at + 4) >>> 16, frames: b.readUInt32BE(stsz + 12) };
}

test('the five clips are there: packed side by side, a square of colour and one of matte, each as long as it should be', () => {
  const frames = { loop: 120, intro: 24 };
  for (const phase of [1, 2, 3]) {
    for (const intro of phase === 1 ? [false] : [true, false]) {
      const name = F.catClip({ phase, intro });
      const m = mp4(path.join(assets, `${name}.mp4`));
      assert.deepEqual([m.width, m.height], [1600, 800], name);
      assert.equal(m.frames, frames[intro ? 'intro' : 'loop'], name);
    }
  }
  assert.equal(fs.existsSync(path.join(assets, 'bodydouble.mp4')), false, 'the old companion is gone');
  assert.equal(fs.existsSync(path.join(assets, 'bodydouble-mask.png')), false);
});

test('the phases are the session\'s thirds, from its start to its hard stop', () => {
  const start = 0, end = 90 * 60000;
  assert.equal(F.catPhase(start, end, 0), 1);
  assert.equal(F.catPhase(start, end, 29 * 60000), 1);
  assert.equal(F.catPhase(start, end, 30 * 60000), 2);
  assert.equal(F.catPhase(start, end, 59 * 60000), 2);
  assert.equal(F.catPhase(start, end, 60 * 60000), 3);
  assert.equal(F.catPhase(start, end, 200 * 60000), 3, 'past the stop (the way out): still the last');
  assert.equal(F.catPhase(5, 5, 99), 1, 'no length: calm');
});

test('a loop goes round until the next phase is due, then that phase\'s intro once, then its loop; one at a time, never back', () => {
  const play = (at, due, n) => { const out = []; for (let i = 0; i < n; i++) { at = F.catNext(at, due); out.push(F.catClip(at)); } return out; };
  assert.deepEqual(play({ phase: 1, intro: false }, 1, 2), ['cat-phase1-loop', 'cat-phase1-loop']);
  assert.deepEqual(play({ phase: 1, intro: false }, 2, 3), ['cat-phase2-intro', 'cat-phase2-loop', 'cat-phase2-loop']);
  // A jump of two (a sleeping PC): the phase between still plays its loop once, where the next intro begins.
  assert.deepEqual(play({ phase: 1, intro: false }, 3, 5), ['cat-phase2-intro', 'cat-phase2-loop', 'cat-phase3-intro', 'cat-phase3-loop', 'cat-phase3-loop']);
  assert.deepEqual(play({ phase: 3, intro: false }, 1, 1), ['cat-phase3-loop'], 'never back');
});

test('the window may play them (its own files only) and the phone app gets the assets', () => {
  const html = fs.readFileSync(path.join(root, 'src/renderer/index.html'), 'utf8');
  const csp = html.match(/Content-Security-Policy" content="([^"]+)"/)[1];
  assert.match(csp, /default-src 'self'/);
  assert.doesNotMatch(csp, /media-src/, 'no narrower rule for video');
  const build = fs.readFileSync(path.join(root, 'scripts/build-mobile.js'), 'utf8');
  assert.match(build, /cpSync\(path\.join\(src, 'assets'\), path\.join\(out, 'assets'\)/);
  const scene = fs.readFileSync(path.join(root, 'mobile/android/app/src/main/java/com/onyxcalendar/app/FocusScene.java'), 'utf8');
  for (const phase of [1, 2, 3]) assert.ok(scene.includes(`"${F.catClip({ phase, intro: false })}.mp4"`), 'the phone\'s Home and lock screen play the same clips');
});
