// Eye breaks (1.139.0): the 20-20-20 card and a longer break, counting only time at the screen.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const eyes = require('../src/main/eyes');

const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const MIN = 60e3;

// Runs the timer for `minutes` in 5-second ticks, with `idle` seconds of no input on each tick.
function run(t, from, minutes, idle = 0) {
  const seen = [];
  for (let now = from; now < from + minutes * MIN; now += 5000) {
    const what = t.tick(now, idle);
    if (what) { seen.push([Math.round((now - from) / MIN), what]); if (what !== 'close') t.showing = what; }
  }
  return seen;
}

test('every 20 minutes at the screen, the look-away card; each hour, the longer break', () => {
  const settings = { eyeBreaks: { on: true, every: 20, long: 60 } };
  const t = eyes.createTimer(() => settings);
  let now = 1e9;
  t.tick(now, 0);
  const seen = run(t, now + 5000, 21);
  assert.deepEqual(seen[0], [20, 'look']);
  t.answer('look', 'done');
  assert.equal(t.screenMs, 0);
  // While a card is up nothing more is counted or asked.
  t.showing = 'look';
  t.last = now + 30 * MIN - 5000;
  assert.equal(run(t, now + 30 * MIN, 1).length, 0);
  t.answer('look', 'done');
  t.breakMs = 59 * MIN;
  t.last = now + 40 * MIN - 5000;
  assert.deepEqual(run(t, now + 40 * MIN, 2)[0][1], 'break');
  t.answer('break', 'done');
  assert.equal(t.breakMs, 0);
});

test('time away counts: 20 seconds closes the look-away, 5 minutes is the longer break', () => {
  const t = eyes.createTimer(() => ({}));
  t.tick(0, 0);
  t.screenMs = 15 * MIN; t.breakMs = 50 * MIN;
  t.tick(5000, 25);
  assert.equal(t.screenMs, 0);
  assert.equal(t.breakMs, 50 * MIN);
  t.showing = 'look';
  assert.equal(t.tick(10000, 30), 'close');
  t.showing = null; t.screenMs = 10 * MIN;
  t.tick(15000, 5 * 60);
  assert.equal(t.screenMs, 0);
  assert.equal(t.breakMs, 0);
  // The PC asleep for an hour (no ticks) is time away too.
  t.breakMs = 40 * MIN;
  t.tick(15000 + 60 * MIN, 0);
  assert.equal(t.breakMs, 0);
});

test('snooze brings it back in 5 minutes (the longer break in 10); off stops it', () => {
  const s = { eyeBreaks: { on: true, every: 20, long: 60 } };
  const t = eyes.createTimer(() => s);
  t.answer('look', 'snooze');
  assert.equal(t.screenMs, 15 * MIN);
  t.answer('break', 'snooze');
  assert.equal(t.breakMs, 50 * MIN);
  s.eyeBreaks.on = false;
  t.tick(1, 0);
  assert.equal(run(t, 2, 90).length, 0);
  assert.deepEqual(eyes.settingsOf({ eyeBreaks: { every: 1, long: 3 } }), { on: true, every: 5, long: 5 });
  assert.equal(eyes.settingsOf({ eyeBreaks: { long: 0 } }).long, 0);
});

test('the card counts down 20 seconds, says to look 20 feet away and blink, and is wired in', () => {
  const look = eyes.cardPage('look');
  assert.match(look, /const total=20, look=true/);
  assert.match(look, /20 feet \(6 m\) away/);
  assert.match(look, /blink/);
  assert.match(eyes.cardPage('break'), /Start the break/);
  assert.match(read('src/main/main.js'), /require\('\.\/eyes'\)\.start\(store\)/);
  assert.match(read('src/main/main.js'), /'eyes:test': \(kind\) => require\('\.\/eyes'\)\.test\(kind\),/);
  assert.match(read('src/preload.js'), /eyesTest: \(kind\) => call\('eyes:test', kind\),/);
  assert.match(read('src/main/store-defaults.js'), /eyeBreaks: \{ on: true, every: 20, long: 60 \}/);
  assert.match(read('src/renderer/app.js'), /onyx\.eyesTest && eyeBreaksField\(s\),/);
});
