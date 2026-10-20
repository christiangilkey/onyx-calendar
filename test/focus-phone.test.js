// Hyperfocus, phase 2: the sounds (steady, seamless, as loud as each other), the Spotify link,
// body checks, and the hard stop reaching the phone: an alarm on the phone app, a push or call
// sent by this PC when the stop goes unanswered, or a hidden task for the Pi.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const F = require('../src/renderer/focus-plan');
const store = require('../src/main/store');
const caller = require('../src/main/caller');
const focus = require('../src/main/focus');

store.save = () => {};

const MIN = 60000;
const RATE = 16000;
let seed = 11;
const rand = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
const rms = (b) => Math.sqrt(b.reduce((s, v) => s + v * v, 0) / b.length);

/** An MP3's length in seconds, from its frame headers (MPEG-1 Layer III, as the sounds are). */
function mp3Seconds(file) {
  const b = fs.readFileSync(file);
  const BR = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320], SR = [44100, 48000, 32000];
  let o = 0, secs = 0;
  while (o + 4 <= b.length) {
    if (b[o] !== 0xff || (b[o + 1] & 0xfe) !== 0xfa) { o++; continue; }
    const br = BR[b[o + 2] >> 4] * 1000, sr = SR[(b[o + 2] >> 2) & 3];
    if (!br || !sr) { o++; continue; }
    o += Math.floor(144 * br / sr) + ((b[o + 2] >> 1) & 1);
    secs += 1152 / sr;
  }
  return secs;
}

test('every sound is a recording in the app, long enough for its loop and its blend', () => {
  for (const kind of ['brown', 'pink', 'white', 'rain', 'lightrain', 'waves']) {
    const spec = F.SOUND_FILES[kind];
    assert.ok(spec, kind);
    const file = path.join(__dirname, '../src/renderer/assets/sounds', spec.file);
    assert.ok(fs.existsSync(file), `${spec.file} is in assets/sounds`);
    assert.ok(spec.start + spec.length + spec.fade <= mp3Seconds(file) - 0.1, `${kind}'s loop fits in the recording`);
    assert.ok(spec.length >= 15, `${kind} loops no sooner than every 15 seconds`);
    assert.ok(spec.fade >= 1, `${kind} blends for at least a second`);
  }
});

test('a recording becomes a loop with no seam and no dip where it joins', () => {
  // Stands in for a decoded recording: two channels of steady, random sound.
  const rec = [0, 1].map(() => Float32Array.from({ length: RATE * 12 }, () => rand() * 2 - 1));
  const [left, right] = F.loopBuffer(rec, RATE, { start: 0.5, length: 10, fade: 1 });
  assert.equal(left.length, RATE * 10);
  assert.equal(right.length, RATE * 10);
  const s = RATE * 0.5, n = RATE * 10, f = RATE;
  // The join: the loop's last sample is the recording's, and its first is (almost all) the very next one.
  assert.equal(left[n - 1], rec[0][s + n - 1]);
  assert.ok(Math.abs(left[0] - rec[0][s + n]) < 0.02);
  // After the blend it is the recording itself.
  assert.equal(left[f + 5], rec[0][s + f + 5]);
  // The blend is as loud as the rest (equal power), so there is no dip each time round.
  const blend = rms(left.slice(0, f)), rest = rms(left.slice(f));
  assert.ok(Math.abs(blend / rest - 1) < 0.08, `blend ${blend} vs ${rest}`);
  assert.ok(left.every((v) => Math.abs(v) <= 1.5));
});

test('a recording shorter than asked still makes a whole loop', () => {
  const rec = [Float32Array.from({ length: RATE * 5 }, () => rand() - 0.5)];
  const [loop] = F.loopBuffer(rec, RATE, { start: 0.2, length: 30, fade: 2 });
  assert.ok(loop.length > RATE * 2 && loop.length < RATE * 5);
  assert.ok(loop.every(Number.isFinite));
});

test('each sound is levelled by its own gain, under the volume slider', () => {
  assert.equal(F.soundLevel('pink', 0), 0);
  assert.ok(F.soundLevel('waves', 50) > F.noiseGain(50), 'the quiet surf recording is lifted');
  assert.ok(F.soundLevel('pink', 50) < F.noiseGain(50), 'the loud pink noise is brought down');
  assert.ok(F.soundLevel('lightrain', 30) < F.soundLevel('lightrain', 60));
  assert.equal(F.SOUND_FILES.lightrain.lowCut, 90, 'the rumble under the light rain is taken out');
});

test('a Spotify link is taken from Share → Copy link or a spotify: address, and nothing else', () => {
  assert.equal(F.spotifyLink('https://open.spotify.com/playlist/37i9dQZF1DWZeKCadgRdKQ?si=abc123'), 'https://open.spotify.com/playlist/37i9dQZF1DWZeKCadgRdKQ');
  assert.equal(F.spotifyLink('open.spotify.com/intl-de/album/4aawyAB9vmqN3uQ7FjRGTy'), 'https://open.spotify.com/album/4aawyAB9vmqN3uQ7FjRGTy');
  assert.equal(F.spotifyLink(' spotify:playlist:37i9dQZF1DWZeKCadgRdKQ '), 'https://open.spotify.com/playlist/37i9dQZF1DWZeKCadgRdKQ');
  for (const bad of ['', 'https://evil.example/playlist/37i9dQZF1DWZeKCadgRdKQ', 'https://open.spotify.com/user/me', 'javascript:alert(1)', 'https://open.spotify.com.evil.io/playlist/37i9dQZF1DWZeKCadgRdKQ']) {
    assert.equal(F.spotifyLink(bad), null, bad);
  }
});

test('body checks come every so often from the start, in turn, and not at all when off', () => {
  const t0 = Date.now();
  assert.equal(F.nextBodyCheck(t0, 30, 0), t0 + 30 * MIN);
  assert.equal(F.nextBodyCheck(t0, 30, 2), t0 + 90 * MIN);
  assert.equal(F.nextBodyCheck(t0, 0, 0), null);
  assert.notEqual(F.bodyCheck(0)[1], F.bodyCheck(1)[1]);
  assert.deepEqual(F.bodyCheck(F.BODY_CHECKS.length), F.bodyCheck(0));
});

// ---- the stop reaching the phone

const sent = [];
caller.send = async (kind, title, message) => { sent.push({ kind, title, message }); };
const fakeHub = {
  made: [], gone: [],
  piTaskList: () => ({ id: 'g1/tl~pi' }),
  callNotes: (at, o) => `Phone reminder.\nCall at: ${at.toISOString()} (${o.mode})`,
  createTask: async (d) => { fakeHub.made.push(d); return { id: `g1/tl~pi/t${fakeHub.made.length}` }; },
  deleteTask: async (id) => { fakeHub.gone.push(id); },
};
focus.start(fakeHub);
const way = (method, extra = {}) => {
  store.data.settings.calls = { method, ntfyTopic: 'onyx-chris', ...extra };
  store.data.focusActive = null;
  store.data.piLinks = {};
  sent.length = 0;
};

test('with ntfy or Twilio, an unanswered stop is sent once, two minutes after it; answered, nothing goes', async () => {
  way('ntfy');
  const t0 = Date.now(), end = t0 + 25 * MIN;
  const r = await focus.startActive({ startedAt: t0, plannedEnd: end, goal: 'Write the grant intro', escalate: true });
  assert.equal(r.reach, 'push');
  assert.equal(await focus.tick(end + MIN), null); // still inside the two minutes
  assert.equal(await focus.tick(end + focus.GRACE_MS + 1000), 'sent');
  assert.equal(await focus.tick(end + focus.GRACE_MS + 30000), null); // once only
  assert.equal(sent.length, 1);
  assert.equal(sent[0].kind, 'call'); // ntfy sends that as an urgent push
  assert.match(sent[0].message, /Write the grant intro/);

  // Answered on the PC in time: the phone is left alone.
  await focus.startActive({ startedAt: t0, plannedEnd: end, goal: 'Second', escalate: true });
  assert.equal(await focus.endActive(), true);
  assert.equal(await focus.tick(end + 10 * MIN), null);
  assert.equal(sent.length, 1);
  assert.equal(await focus.endActive(), false);

  // "Reach my phone" off: nothing, ever.
  await focus.startActive({ startedAt: t0, plannedEnd: end, goal: 'Quiet', escalate: false });
  assert.equal(await focus.tick(end + 10 * MIN), null);
  assert.equal(sent.length, 1);
});

test('a session left running for hours (the window closed) is let go', async () => {
  way('twilio');
  const t0 = Date.now();
  await focus.startActive({ startedAt: t0, plannedEnd: t0 + MIN * 30, goal: 'Old', escalate: true });
  store.data.focusActive.sent = true;
  assert.equal(await focus.tick(t0 + 5 * 3600000), 'stale');
  assert.equal(focus.active(), null);
});

test('a stop needs a time after the start', async () => {
  way('ntfy');
  await assert.rejects(focus.startActive({ startedAt: Date.now(), plannedEnd: Date.now() - MIN }), /hard stop/);
});

test('with the phone alarm, the phone sees the stop as an entry with an Alarm at that time, until the session ends', async () => {
  way('alarm');
  const t0 = Date.now(), end = t0 + 45 * MIN;
  assert.deepEqual(focus.phoneItems(new Date(t0).toISOString(), new Date(t0 + 86400000).toISOString()), []);
  const r = await focus.startActive({ startedAt: t0, plannedEnd: end, goal: 'Call Alex', escalate: true });
  assert.equal(r.reach, 'alarm');
  const [item] = focus.phoneItems(new Date(t0).toISOString(), new Date(t0 + 86400000).toISOString());
  assert.equal(item.title, 'Hyperfocus stop: Call Alex');
  assert.equal(item.start, new Date(end).toISOString());
  assert.deepEqual(item.piAlerts, [{ at: new Date(end).toISOString(), kind: 'alarm' }]);
  assert.equal(item.callMode, 'alarm');
  // Outside the range asked for, it is not there; nor once the session has ended.
  assert.deepEqual(focus.phoneItems(new Date(end + MIN).toISOString(), new Date(end + 2 * MIN).toISOString()), []);
  assert.equal(await focus.tick(end + 10 * MIN), null); // the PC sends nothing itself: the phone rings
  await focus.endActive();
  assert.deepEqual(focus.phoneItems(new Date(t0).toISOString(), new Date(t0 + 86400000).toISOString()), []);
  assert.equal(sent.length, 0);
});

test('the phone app is handed the stop with its entries', async () => {
  way('alarm');
  const hub = require('../src/main/hub');
  const api = require('../src/main/api');
  const real = hub.getEvents;
  hub.getEvents = async () => ({ events: [{ id: 'g1/personal/1', title: 'Lunch' }], errors: [] });
  try {
    const t0 = Date.now();
    await focus.startActive({ startedAt: t0, plannedEnd: t0 + 30 * MIN, goal: 'Deep work', escalate: true });
    const phone = await api.remote.events(new Date(t0 - 3600000).toISOString(), new Date(t0 + 86400000).toISOString());
    assert.deepEqual(phone.events.map((e) => e.title), ['Lunch', 'Hyperfocus stop: Deep work']);
    const pc = await api.handlers.events(new Date(t0 - 3600000).toISOString(), new Date(t0 + 86400000).toISOString());
    assert.deepEqual(pc.events.map((e) => e.title), ['Lunch']); // the PC's own window shows the session itself
    await focus.endActive();
  } finally {
    hub.getEvents = real;
  }
});

test('with the Pi, a hidden task asks it to call at its first look after the two minutes, and goes when answered', async () => {
  way('pi');
  store.data.settings.pi = { ...store.data.settings.pi, checkEvery: 30 };
  fakeHub.made.length = 0;
  fakeHub.gone.length = 0;
  const end = new Date(2026, 9, 18, 15, 45).getTime();
  const r = await focus.startActive({ startedAt: end - 60 * MIN, plannedEnd: end, goal: 'Grant intro', escalate: true });
  assert.equal(r.reach, 'pi');
  assert.equal(r.warning, null);
  const [made] = fakeHub.made;
  assert.equal(made.listId, 'g1/tl~pi');
  assert.match(made.notes, new RegExp(`Call at: ${new Date(2026, 9, 18, 16, 0).toISOString().replace(/[.]/g, '\\.')}`)); // 3:45 + 2 min → the 4:00 look
  assert.equal(made.due, '2026-10-18');
  const key = Object.keys(store.data.piLinks).find((k) => k.startsWith('focus|'));
  assert.equal(store.data.piLinks[key].task, 'g1/tl~pi/t1'); // listed with the Pi's tasks, so Onyx hides it
  await focus.endActive();
  assert.deepEqual(fakeHub.gone, ['g1/tl~pi/t1']);
  assert.equal(key in store.data.piLinks, false);
});

test('when the Pi cannot be given the stop, the session still starts and says why', async () => {
  way('pi');
  const make = fakeHub.createTask;
  fakeHub.createTask = async () => { throw new Error('Google is unreachable'); };
  try {
    const r = await focus.startActive({ startedAt: Date.now(), plannedEnd: Date.now() + 30 * MIN, goal: 'X', escalate: true });
    assert.match(r.warning, /Google is unreachable/);
    assert.ok(focus.active());
  } finally {
    fakeHub.createTask = make;
    await focus.endActive();
  }
});
