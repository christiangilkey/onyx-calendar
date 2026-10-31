// Hyperfocus presence: the camera (PC) or the phone's place sees you stay with it, and each working
// period stayed with all the way through adds a flame to the streak. Fidgeting never counts, only
// leaving; breaks are free. And the camera's part of Onyx keeps every picture to itself.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const F = require('../src/renderer/focus-plan');
const store = require('../src/main/store');
const focus = require('../src/main/focus');

store.save = () => {};
const SEC = 1000, MIN = 60000;
const never = () => 0.99; // no lucky drops: only the milestones decide a tier

/** Feeds looks once a second from `from` to `to` (ms), `seen(t)` deciding each. Returns the events. */
function looks(p, from, to, seen) {
  const evs = [];
  for (let t = from; t <= to; t += SEC) { const e = F.presenceSee(p, t, seen(t)); if (e) evs.push([t, e]); }
  return evs;
}

test('fidgeting, stretching and looking away never count as leaving', () => {
  const p = F.presenceStart('camera', 0);
  // Out of view for a few seconds at a time, over and over (leaning, bending down, turning away), and once for a whole minute.
  const evs = looks(p, 0, 20 * MIN, (t) => !((t % 40000) < 9000) && !(t > 5 * MIN && t < 6 * MIN));
  assert.deepEqual(evs, []);
  assert.equal(p.away, false);
  assert.equal(p.aways, 0);
});

test('out of view for 90 seconds is leaving, counted from when you went; the first look that sees you is back', () => {
  const p = F.presenceStart('camera', 0);
  const evs = looks(p, 0, 10 * MIN, (t) => t < 2 * MIN || t >= 6 * MIN);
  assert.deepEqual(evs.map((e) => e[1]), ['away', 'back']);
  assert.equal(evs[0][0], 2 * MIN + 90 * SEC);
  assert.equal(p.awayMs, 4 * MIN); // from the first look without you to the first one with you
});

test('the phone: away only once it has surely been somewhere else for two minutes', () => {
  const p = F.presenceStart('location', 0);
  assert.equal(F.presenceSee(p, 10 * SEC, false), null);  // one fix says moved (a GPS jump)…
  assert.equal(F.presenceSee(p, 40 * SEC, true), null);   // …and the next says still here: nothing happened
  assert.equal(F.presenceSee(p, 3 * MIN, false), null);
  assert.equal(F.presenceSee(p, 5 * MIN, false), 'away');
});

test('a work round stayed with all the way through wins a flame; a break you walk away in costs nothing', () => {
  const p = F.presenceStart('camera', 0, { streak: 3, best: 9 });
  const work = { key: 'r1', work: true, end: 25 * MIN }, rest = { key: 'b1', work: false, end: 30 * MIN };
  let flame = null;
  for (let t = 0; t <= 30 * MIN; t += SEC) {
    const inBreak = t >= 25 * MIN;
    F.presenceSee(p, t, !inBreak); // gone for the whole break
    const ev = F.presencePeriod(p, t, inBreak ? rest : work, never);
    if (ev) flame = ev;
  }
  assert.equal(flame.type, 'flame');
  assert.equal(flame.streak, 4);
  assert.equal(p.streak, 4);
  assert.equal(p.away, true); // away in the break…
  assert.deepEqual(p.periods, [{ ok: true, tier: 'common' }]); // …and the round still counted, nothing lost
});

test('leaving during a round puts the streak out; coming back from the break a minute late does not', () => {
  const p = F.presenceStart('camera', 0, { streak: 6, best: 6 });
  const round = (key) => ({ key, work: true, end: 0 });
  // Round 1: back a minute late from the break that came before it (away from the start), then stays.
  F.presenceSee(p, 0, false);
  for (let t = 0; t <= 3 * MIN; t += SEC) { F.presenceSee(p, t, t >= 60 * SEC); F.presencePeriod(p, t, { ...round('r1'), end: 25 * MIN }, never); }
  assert.equal(p.period.ok, true);
  // Then walks off in the middle of it for five minutes.
  const evs = [];
  for (let t = 3 * MIN; t <= 25 * MIN; t += SEC) {
    F.presenceSee(p, t, !(t > 10 * MIN && t < 15 * MIN));
    const ev = F.presencePeriod(p, t, { ...round('r1'), end: 25 * MIN }, never);
    if (ev) evs.push(ev.type);
  }
  assert.deepEqual(evs, ['broken']);
  assert.equal(p.streak, 0);
  const end = F.presencePeriod(p, 25 * MIN + SEC, null, never);
  assert.equal(end, null); // no flame for that round
  assert.deepEqual(p.periods, [{ ok: false, tier: null }]);
});

test('with the camera quiet (stopped, turned off) a round is not judged: no flame, and no harm to the streak', () => {
  const p = F.presenceStart('camera', 0, { streak: 8, best: 8 });
  F.presenceSee(p, 0, true);
  for (let t = 0; t <= 25 * MIN; t += 10 * SEC) F.presencePeriod(p, t, { key: 'r', work: true, end: 25 * MIN }, never);
  assert.equal(F.presencePeriod(p, 25 * MIN + SEC, null, never), null);
  assert.equal(p.streak, 8);
  assert.deepEqual(p.periods, [{ ok: null, tier: null }]);
});

test('stopped early, the round running is let go; at the hard stop it wins its flame', () => {
  const run = (complete) => {
    const p = F.presenceStart('camera', 0, { streak: 1, best: 1 });
    for (let t = 0; t <= 10 * MIN; t += SEC) { F.presenceSee(p, t, true); F.presencePeriod(p, t, { key: 'session', work: true, end: 10 * MIN }, never); }
    return [F.presenceEnd(p, 10 * MIN, complete, never), p];
  };
  const [early, p1] = run(false);
  assert.equal(early, null);
  assert.equal(p1.streak, 1);
  const [hard, p2] = run(true);
  assert.equal(hard.type, 'flame');
  assert.equal(p2.streak, 2);
  assert.deepEqual(F.presenceSummary(p2), { mode: 'camera', periods: [{ ok: true, tier: 'common' }], awayMin: 0, aways: 0 });
});

test('drops: a jackpot every 25 in a row, an epic every 5 and on passing your best, and now and then by luck', () => {
  assert.equal(F.dropTier(1, 0, never), 'common');
  assert.equal(F.dropTier(5, 0, never), 'epic');
  assert.equal(F.dropTier(10, 0, never), 'epic');
  assert.equal(F.dropTier(25, 0, never), 'jackpot');
  assert.equal(F.dropTier(50, 0, never), 'jackpot');
  assert.equal(F.dropTier(8, 7, never), 'epic');  // one past the best you came in with
  assert.equal(F.dropTier(9, 7, never), 'common'); // not again for every flame after it
  assert.equal(F.dropTier(2, 0, () => 0.01), 'jackpot');
  assert.equal(F.dropTier(2, 0, () => 0.05), 'epic');
  // Over many common rounds, roughly one in ten is an epic and one in fifty a jackpot.
  let seed = 3; const rand = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const tiers = Array.from({ length: 5000 }, () => F.dropTier(1, 0, rand));
  const share = (k) => tiers.filter((x) => x === k).length / tiers.length;
  assert.ok(share('jackpot') > 0.01 && share('jackpot') < 0.03);
  assert.ok(share('epic') > 0.07 && share('epic') < 0.13);
});

test('the streak runs on across sessions; a round left breaks it; unjudged rounds and sessions without presence leave it be', () => {
  const sessions = [
    { presence: { periods: [{ ok: true, tier: 'common' }, { ok: true, tier: 'epic' }] } },
    { goal: 'no presence this time' },
    { presence: { periods: [{ ok: false }, { ok: true, tier: 'jackpot' }, { ok: null }, { ok: true, tier: 'common' }] } },
  ];
  assert.deepEqual(F.flameStreak(sessions), { streak: 2, best: 2, flames: 4, epic: 1, jackpot: 1 });
});

test('the phone in the same place: within 60 metres, its own error allowed for; unsure fixes say nothing', () => {
  const home = { lat: 51.5, lng: -0.12, accuracy: 15 };
  const near = { lat: 51.5003, lng: -0.12, accuracy: 20 };   // about 33 m off
  const gone = { lat: 51.503, lng: -0.12, accuracy: 20 };    // about 330 m off
  const fuzzy = { lat: 51.503, lng: -0.12, accuracy: 900 };
  assert.ok(Math.abs(F.metres(home, gone) - 333) < 5);
  assert.equal(F.inPlace(home, near), true);
  assert.equal(F.inPlace(home, gone), false);
  assert.equal(F.inPlace(home, fuzzy), null);
  assert.equal(F.inPlace(null, near), null);
});

test('the log keeps how each round went, and no pictures or places', () => {
  store.data = {};
  const rec = focus.logSession({ startedAt: Date.now() - 50 * MIN, endedAt: Date.now(), presence: {
    mode: 'camera', periods: [{ ok: true, tier: 'jackpot' }, { ok: false, tier: 'epic' }, { ok: 'x' }], awayMin: 6, aways: 1, frame: 'data:image/png;base64,AAAA', lat: 51.5 } });
  assert.deepEqual(rec.presence, { mode: 'camera', periods: [{ ok: true, tier: 'jackpot' }, { ok: false, tier: null }, { ok: null, tier: null }], awayMin: 6, aways: 1 });
  assert.equal(focus.logSession({ startedAt: Date.now() - MIN, presence: { mode: 'spy' } }).presence, undefined);
  assert.deepEqual(focus.insights().flames, { streak: 0, best: 1, flames: 1, epic: 0, jackpot: 1 });
});

test('the camera\'s page cannot reach the internet, and the vision engine in it reports nowhere', () => {
  const dir = path.join(__dirname, '../src/renderer/presence');
  const html = fs.readFileSync(path.join(dir, 'presence.html'), 'utf8');
  const csp = html.match(/Content-Security-Policy" content="([^"]+)"/)[1];
  assert.match(csp, /default-src 'none'/);
  assert.match(csp, /connect-src 'self'(;|$)/);
  assert.match(csp, /img-src 'none'/);
  assert.doesNotMatch(csp, /https?:|\*/, 'no outside address is allowed');
  for (const f of ['vision/vision_bundle.js', 'vision/vision_wasm_internal.js', 'presence.js']) {
    const js = fs.readFileSync(path.join(dir, f), 'utf8');
    assert.doesNotMatch(js, /https:\/\/[a-z0-9.-]*google/i, `${f}: no Google address`);
    assert.doesNotMatch(js, /odml\.pa/, `${f}: MediaPipe's usage logging is gone`);
  }
  const bundle = fs.readFileSync(path.join(dir, 'vision/vision_bundle.js'), 'utf8');
  assert.match(bundle, /flush\(t,e\)\{this\.i=\[\];t\?\.\(\);return;/, 'the logger drops what it holds');
  assert.match(bundle, /this\.h=void 0/, 'and never starts its timer');
  for (const f of ['vision/vision_wasm_internal.wasm', 'vision/selfie_segmenter.tflite']) assert.ok(fs.statSync(path.join(dir, f)).size > 100000, f);
  // What presence.js sends out of its page: only whether you are in view.
  const js = fs.readFileSync(path.join(dir, 'presence.js'), 'utf8');
  const sent = js.match(/tell\(\{[^}]*\}\)/g);
  assert.ok(sent.every((m) => /type: '(look|ready|error)'/.test(m) && !/data|frame|image|pixel/i.test(m.replace(/text: String\(err[^)]*\)/, ''))), sent.join(' | '));
});

test('the win sounds are in the app', () => {
  for (const f of ['win-common.flac', 'win-epic.flac', 'win-jackpot.flac']) {
    const b = fs.readFileSync(path.join(__dirname, '../src/renderer/assets/sounds', f));
    assert.equal(b.toString('ascii', 0, 4), 'fLaC', f);
  }
});

test('the phone: a round with a fix every few minutes counts; one where the phone never said where it was is not judged', () => {
  const run = (every) => {
    const p = F.presenceStart('location', 0, { streak: 2, best: 2 });
    for (let t = 0; t <= 25 * MIN; t += SEC) {
      if (every && t % every === 0) F.presenceSee(p, t, true);
      F.presencePeriod(p, t, { key: 'r', work: true, end: 25 * MIN }, never);
    }
    return [F.presencePeriod(p, 25 * MIN + SEC, null, never), p];
  };
  const [seen, p1] = run(3 * MIN);
  assert.equal(seen.type, 'flame');
  assert.equal(p1.streak, 3);
  const [blind, p2] = run(0);
  assert.equal(blind, null);
  assert.equal(p2.streak, 2);
});
