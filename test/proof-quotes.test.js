// 1.146.0: proof of starts (from what Onyx logged), and a quote in the top bar.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const store = require('../src/main/store');
const proof = require('../src/main/proof');

store.save = () => {};
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const day = (now, back) => { const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - back); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

test('the record counts blocks and tasks done and Hyperfocus time per day, and the comebacks', (t) => {
  const keep = { e: store.data.doneEvents, t: store.data.doneTasks, f: store.data.focusSessions };
  t.after(() => { store.data.doneEvents = keep.e; store.data.doneTasks = keep.t; store.data.focusSessions = keep.f; });
  const now = new Date(2026, 10, 27, 15);
  store.data.doneEvents = { a: day(now, 0), b: day(now, 0), c: day(now, 2), old: day(now, 30) };
  store.data.doneTasks = {};
  proof.noteTask('t1', true, now);
  proof.noteTask('t2', true, new Date(now.getTime() - 4 * 86400000));
  proof.noteTask('t3', true, now);
  proof.noteTask('t3', false, now); // ticked back: not counted
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 9);
  store.data.focusSessions = [{ startedAt: start.toISOString(), endedAt: new Date(start.getTime() + 50 * 60000).toISOString() }];
  const s = proof.summary(14, now);
  assert.equal(s.days.length, 14);
  const today = s.days[13], yday = s.days[12];
  assert.deepEqual([today.done, today.sessions], [3, 0]);
  assert.deepEqual([yday.done, yday.sessions, yday.minutes, yday.showed], [0, 1, 50, true]);
  assert.equal(s.showedUp, 4, 'today, yesterday, 2 and 4 days back');
  assert.equal(s.weekDone, 5);
  assert.equal(s.weekMinutes, 50);
  assert.equal(s.comebacks, 2, 'back after day 3 off, and after days 5 to 13 off');
  assert.equal(proof.line(s), 'Showed up 4 of the last 7 days · 5 done · 50 min in Hyperfocus');
});

test('a task ticked off in Onyx goes on the record; it syncs, reaches the phone and the lock screen', () => {
  assert.match(read('src/main/hub.js'), /if \('done' in fields\) \{ try \{ require\('\.\/proof'\)\.noteTask\(id, fields\.done\);/);
  assert.match(read('src/main/sync.js'), /doneTasks: MAP/);
  assert.match(read('src/main/api.js'), /'proof:get': \(days\) =>/);
  for (const f of ['src/preload.js', 'src/renderer/remote.js']) assert.match(read(f), /proofGet: \(days\) => call\('proof:get', days\),/, f);
  assert.match(read('src/renderer/app.js'), /proof \? proofCard\(proof\) : ''/);
  const J = 'mobile/android/app/src/main/java/com/onyxcalendar/app/';
  assert.match(read(`${J}LauncherData.java`), /WidgetData\.rpc\(ctx, "proof:get", new JSONArray\(\)\.put\(7\)\)/);
  assert.match(read(`${J}ReviewParts.java`), /planHead\.setText\("YOUR PROOF"\);/);
});

test('every quote has its words and who said it; the bar shows a new one each look, fitted to the space', () => {
  const window = {};
  vm.runInNewContext(read('src/renderer/quotes.js'), { window });
  const Q = window.OnyxQuotes;
  assert.ok(Q.length >= 150, `${Q.length} quotes`);
  for (const q of Q) { assert.ok(q.text.length > 8 && q.who.length > 1, q.text); assert.doesNotMatch(q.text, /[“”]/, 'the bar adds its own quotation marks'); }
  assert.equal(new Set(Q.map((q) => q.text)).size, Q.length, 'no quote twice');
  const app = read('src/renderer/app.js');
  assert.match(app, /if \(!hidden\) showQuote\(\); \/\/ looked at again/);
  assert.match(app, /showQuote\(\); \/\/ another view or week/);
  assert.match(app, /const fits = \(q\) => q\.text\.length \+ q\.who\.length \+ 4 <= room;/);
  assert.match(read('src/renderer/index.html'), /<script src="quotes\.js"><\/script>/);
  assert.match(read('scripts/build-mobile.js'), /'quotes\.js'/);
  assert.match(read('src/renderer/styles.css'), /#quote \{[^}]*"Palatino Linotype"/);
});
