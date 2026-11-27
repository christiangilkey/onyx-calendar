// 1.143.0: the daily after-action review, and today's progress under the Now/Next pills.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const store = require('../src/main/store');
const aar = require('../src/main/aar');

store.save = () => {};
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

test('a review is kept per day, tidied, cleared when empty, and listed newest first', (t) => {
  const real = store.data.aars;
  t.after(() => { store.data.aars = real; });
  store.data.aars = {};
  const r = aar.set('2026-11-25', { did: '- Gym\r\n- Grant intro  ', better: 'Email first', plan: 'Phone away, grant at 9', extra: 'no' }, 1000);
  assert.deepEqual(r, { did: '- Gym\n- Grant intro', better: 'Email first', plan: 'Phone away, grant at 9', at: 1000, updated: 1000 });
  assert.equal(aar.set('2026-11-25', { better: 'Email after lunch' }, 2000).plan, 'Phone away, grant at 9', 'one field changes, the others stay');
  assert.equal(aar.get('2026-11-25').at, 1000);
  aar.set('2026-11-26', { plan: 'x'.repeat(5000) });
  assert.equal(aar.get('2026-11-26').plan.length, 4000);
  assert.deepEqual(aar.recent().map((x) => x.day), ['2026-11-26', '2026-11-25']);
  assert.equal(aar.set('2026-11-26', { plan: '  ' }), null);
  assert.equal(aar.get('2026-11-26'), null);
  assert.throws(() => aar.get('yesterday'), /Which day/);
});

test('reviews sync, reach the phone, and show in the top bar the next day', () => {
  assert.match(read('src/main/sync.js'), /aars: MAP/);
  assert.match(read('src/main/api.js'), /'aar:set': \(day, fields\) => require\('\.\/aar'\)\.set\(day, fields\),/);
  for (const f of ['src/preload.js', 'src/renderer/remote.js']) assert.match(read(f), /aarGet: \(day\) => call\('aar:get', day\),/, f);
  const app = read('src/renderer/app.js');
  assert.match(app, /if \(aarRun\.yesterday\?\.plan\) return \["Today's plan", firstLine\(aarRun\.yesterday\.plan\)/);
  assert.match(app, /now\.getHours\(\) >= AAR_EVENING && !aarRun\.today\) return \['Review today'/);
  assert.match(app, /h\('div', \{ class: 'next-center' \}, parts\.main\.el, parts\.sub\.el, parts\.aar, parts\.progress\)/);
  assert.match(read('src/renderer/index.html'), /id="aar-btn"/);
});

test("today's progress counts blocks and tasks on today, not all-day calendar entries", () => {
  const app = read('src/renderer/app.js');
  assert.match(app, /\(\(e\.kind === 'event' && !e\.allDay\) \|\| \(e\.kind === 'task' && !e\.mirror\)\) && sameDay\(toDate\(e\.start\), now\)\);\n\s*nextRun\.progress = \{ done: todays\.filter\(\(e\) => e\.done\)\.length, total: todays\.length \};/);
  assert.match(app, /p\.progress\.style\.setProperty\('--done'/);
});
