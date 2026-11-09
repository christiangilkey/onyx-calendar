// Time chunks: time set aside for one category (a tag), drawn behind the blocks and tasks that fit inside it. Made
// by a drag (or a click) on the left half of a day; the right half still makes a block. Kept and synced like boards.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const C = require('../src/renderer/time-chunks');
const store = require('../src/main/store');
const chunks = require('../src/main/time-chunks');
const hub = require('../src/main/hub');

store.save = () => {};
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const app = read('src/renderer/app.js');
const css = read('src/renderer/styles.css');
const at = (ymd, h, m = 0) => new Date(+ymd.slice(0, 4), +ymd.slice(5, 7) - 1, +ymd.slice(8, 10), h, m);
const chunk = (o = {}) => C.clean({ id: 'chunk/test01', tag: 'Study', date: '2026-11-09', start: '09:00', end: '12:00', ...o }, new Date('2026-11-08T12:00:00Z'));
const days = (list) => list.map((o) => o.day);

test('a chunk is kept only as a chunk: a category, a day, and hours that end after they start', () => {
  const c = chunk({ tag: '  #Deep   work ', title: '  Morning  ', recur: null, skip: ['2026-11-10'] });
  assert.equal(c.tag, 'Deep work');
  assert.equal(c.title, 'Morning');
  assert.deepEqual(c.skip, [], 'only one that repeats skips days');
  assert.equal(chunk({ end: '24:00' }).end, '24:00', 'to midnight');
  for (const [bad, why] of [
    [{ id: 'nope' }, /not a time chunk/], [{ tag: ' # ' }, /needs a category/], [{ date: '2026-02-30' }, /needs a day/],
    [{ start: '12:00', end: '09:00' }, /end after it starts/], [{ start: '09:00', end: '09:10' }, /at least 15 minutes/],
    [{ start: '24:00', end: '24:00' }, /start and an end/],
  ]) assert.throws(() => chunk(bad), why);
  // Repeat, as a block's Repeat field gives it.
  assert.deepEqual(chunk({ recur: { freq: 'weekly', days: [] } }).recur, { freq: 'weekly', days: [1] }, 'its own weekday when none is picked');
  assert.deepEqual(chunk({ recur: { freq: 'weekly', days: [0, 1, 2, 3, 4, 5, 6] } }).recur, { freq: 'daily' });
  assert.equal(chunk({ recur: { freq: 'daily' }, until: '2026-11-01' }).until, null, 'a last day before its first is none');
  assert.equal(chunk({ recur: { freq: 'hourly' } }).recur, null);
});

test('its days: once, every day until its last, weekdays, monthly and yearly, less the days taken out', () => {
  const from = at('2026-11-08', 0), to = at('2026-11-22', 0);
  assert.deepEqual(days(C.occurrences([chunk()], from, to)), ['2026-11-09']);
  assert.deepEqual(days(C.occurrences([chunk({ recur: { freq: 'daily' }, until: '2026-11-12' })], from, to)), ['2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12']);
  const weekdays = chunk({ recur: { freq: 'weekly', days: [1, 2, 3, 4, 5] }, skip: ['2026-11-11'] });
  assert.deepEqual(days(C.occurrences([weekdays], from, to)), ['2026-11-09', '2026-11-10', '2026-11-12', '2026-11-13', '2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20']);
  assert.deepEqual(days(C.occurrences([chunk({ recur: { freq: 'monthly', dates: [9, 20] } })], from, to)), ['2026-11-09', '2026-11-20']);
  assert.deepEqual(days(C.occurrences([chunk({ recur: { freq: 'yearly', months: [11], dates: [15] } })], from, to)), ['2026-11-15']);
  const [o] = C.occurrences([chunk({ end: '24:00' })], from, to);
  assert.equal(+o.start, +at('2026-11-09', 9));
  assert.equal(+o.end, +at('2026-11-10', 0), '24:00 is the next midnight');
  assert.equal(o.id, 'chunk/test01@2026-11-09');
  // Only what falls in the range: a view that starts at 10 still has the 9–12 chunk.
  assert.equal(C.occurrences([chunk()], at('2026-11-09', 10), at('2026-11-09', 11)).length, 1);
  assert.equal(C.occurrences([chunk()], at('2026-11-09', 12), at('2026-11-09', 13)).length, 0);
});

test('a time inside two chunks belongs to the one inside the other', () => {
  const outer = chunk({ id: 'chunk/outer1', tag: 'Work', start: '08:00', end: '17:00' });
  const inner = chunk({ id: 'chunk/inner1', tag: 'Calls', start: '13:00', end: '14:00' });
  assert.equal(C.chunkAt([outer, inner], at('2026-11-09', 13, 30)).chunk.tag, 'Calls');
  assert.equal(C.chunkAt([outer, inner], at('2026-11-09', 15)).chunk.tag, 'Work');
  assert.equal(C.chunkAt([outer, inner], at('2026-11-09', 17)), null, 'its end is not in it');
});

test('a drag makes its hours: one day, the same hours over several days, an evening that runs past midnight', () => {
  assert.deepEqual(C.fromDrag(at('2026-11-09', 9), at('2026-11-09', 11, 30)), { date: '2026-11-09', start: '09:00', end: '11:30', recur: null, until: null });
  assert.deepEqual(C.fromDrag(at('2026-11-09', 9), at('2026-11-13', 12)), { date: '2026-11-09', start: '09:00', end: '12:00', recur: { freq: 'daily' }, until: '2026-11-13' });
  assert.deepEqual(C.fromDrag(at('2026-11-09', 22), at('2026-11-10', 1)), { date: '2026-11-09', start: '22:00', end: '24:00', recur: null, until: null });
  assert.equal(C.fromDrag(at('2026-11-09', 20), at('2026-11-10', 0)).end, '24:00', 'to midnight');
  assert.equal(C.fromDrag(at('2026-11-09', 9), at('2026-11-09', 9, 5)).end, '09:15', 'at least a quarter hour');
});

test('filling a chunk: its tag\'s open tasks with no time, soonest due first, in its free time, never in the past', () => {
  const o = C.occurrences([chunk()], at('2026-11-09', 0), at('2026-11-10', 0))[0];
  const busy = [{ start: at('2026-11-09', 9, 30), end: at('2026-11-09', 10, 30) }, { start: at('2026-11-09', 11, 30), end: at('2026-11-09', 13) }];
  assert.deepEqual(C.freeGaps(o, busy).map((g) => [g.start.getHours() * 60 + g.start.getMinutes(), g.end.getHours() * 60 + g.end.getMinutes()]), [[540, 570], [630, 690]]);
  assert.deepEqual(C.planned(o, busy), { total: 180, planned: 90 });
  const tasks = [
    { id: 'late', tags: ['study'], date: '2026-11-20' },
    { id: 'done', tags: ['Study'], done: true },
    { id: 'timed', tags: ['Study'], start: '2026-11-09T15:00:00Z' },
    { id: 'other', tags: ['Work'] },
    { id: 'soon', tags: ['Study'], date: '2026-11-09', minutes: 45 },
    { id: 'nodate', tags: ['STUDY'] },
    { id: 'mirror', tags: ['Study'], mirror: true },
  ];
  const want = C.candidates(tasks, 'Study');
  assert.deepEqual(want.map((t) => t.id), ['soon', 'late', 'nodate'], 'its own tag only, open and untimed, the soonest due first');
  const early = new Date(at('2026-11-09', 8));
  const { placed, left } = C.fill(o, want, busy, { now: early });
  // 45 min fits only the 10:30–11:30 gap; the next two take 30 min each: 9:00–9:30 and 11:15–11:30 is too short.
  assert.deepEqual(placed.map((p) => [p.id, p.start.getHours() * 60 + p.start.getMinutes(), p.minutes]), [['soon', 630, 45], ['late', 540, 30]]);
  assert.deepEqual(left, ['nodate']);
  // Part way through it, only what is left of it.
  const mid = C.fill(o, [{ id: 'x' }], [], { now: at('2026-11-09', 10, 2) });
  assert.equal(mid.placed[0].start.getHours() * 60 + mid.placed[0].start.getMinutes(), 605, 'from the next five minutes');
});

test('the PC keeps chunks, gives their category a tag colour, and takes one day out of one that repeats', () => {
  store.data.timeChunks = [];
  store.data.tagColors = { Study: '#8b7cff' };
  const list = chunks.save({ id: 'chunk/pc0001', tag: 'study', date: '2026-11-09', start: '09:00', end: '12:00', recur: { freq: 'daily' } });
  assert.equal(list.length, 1);
  assert.equal(list[0].tag, 'Study', 'the spelling of the tag you have');
  chunks.save({ id: 'chunk/pc0002', tag: 'Gym', date: '2026-11-09', start: '17:00', end: '18:00' });
  assert.ok(store.data.tagColors.Gym, 'a new category gets a colour');
  assert.ok(hub.allTags().some((t) => t.name === 'Gym' && t.count === 0), 'and shows among the tags though nothing has it yet');
  assert.deepEqual(chunks.remove('chunk/pc0001', '2026-11-10').find((c) => c.id === 'chunk/pc0001').skip, ['2026-11-10']);
  assert.equal(chunks.remove('chunk/pc0001').length, 1, 'all of it');
  hub.renameTag('Gym', 'Training');
  assert.equal(store.data.timeChunks[0].tag, 'Training', 'a renamed tag takes its chunks along');
  assert.throws(() => chunks.save({ id: 'chunk/pc0003', tag: '', date: '2026-11-09', start: '09:00', end: '10:00' }), /category/);
});

test('kept with the rest of Onyx: synced, on the phone and the web, and offline it waits like any change', () => {
  assert.match(read('src/main/sync.js'), /blockListsAt: VALUE, timeChunks: LIST,/);
  assert.match(read('src/main/store-defaults.js'), /timeChunks: \[\],/);
  const api = read('src/main/api.js');
  assert.match(api, /timeChunks: require\('\.\/time-chunks'\)\.chunks\(\),/, 'in the state the phone keeps');
  for (const name of ["'timeChunk:save'", "'timeChunk:delete'"]) {
    assert.ok(api.includes(name), name);
    assert.ok(read('src/renderer/remote.js').includes(name), `${name} waits offline`);
  }
  assert.match(read('src/preload.js'), /saveTimeChunk: \(chunk\) => call\('timeChunk:save', chunk\),/);
  assert.match(read('scripts/build-mobile.js'), /'time-chunks\.js'/, 'the phone and the web get the rules');
  assert.match(read('src/renderer/index.html'), /<script src="time-chunks\.js"><\/script>\n {2}<script src="app\.js">/);
  assert.match(read('src/renderer/mock.js'), /saveTimeChunk: async/);
});

test('the left half of a day makes a time chunk, the right half a block; a block inside one takes its tag', () => {
  assert.match(app, /eventSources: \[\{ id: 'entries', events: source \}, \{ id: 'chunks', events: chunkSource \}\]/);
  assert.match(app, /display: 'background'/);
  assert.match(app, /if \(info\.event\.display === 'background' \|\| !info\.event\.extendedProps\.src\) return;/, 'a click on its tint is the day\'s, not an entry\'s');
  assert.match(app, /gridPress\.chunk = e\.clientX - r\.left < r\.width \/ 2;/, 'the left half');
  assert.match(app, /if \(!info\.allDay && info\.view\.type\.startsWith\('timeGrid'\) && pressWasChunk\(\)\) return newChunkFrom\(info, anchor\);\s*blockOut\(info, anchor\);/, 'a drag');
  assert.match(app, /return there \? openChunk\(there, pointRect\(info\.jsEvent\)\) : newChunkFrom\(/, 'a click: the chunk there, or a new one');
  assert.match(app, /return chunk \? newChunkFrom\(range, r \|\| pointRect\(info\.jsEvent\)\) : blockOut\(range, r \|\| pointRect\(info\.jsEvent\)\);/, 'a long press on the phone');
  assert.match(app, /holdNew\.chunk = pressWasChunk\(5000\);/);
  assert.match(app, /const tagsHere = inChunk \? \[inChunk\.chunk\.tag\] : \[\];/, 'a block made inside one');
  assert.match(app, /openEditor\(\{ start, end, allDay: info\.allDay, \.\.\.\(inChunk \? \{ tags: \[inChunk\.chunk\.tag\] \} : \{\}\) \}/);
  assert.match(app, /const tags = tagField\(src \? src\.tags : model\.tags \|\| /);
  // The band down its side opens it; the calendar never starts a selection from the band.
  assert.match(app, /for \(const type of \['pointerdown', 'mousedown', 'touchstart'\]\) rail\.addEventListener\(type, \(ev\) => ev\.stopPropagation\(\), \{ passive: true \}\);/);
  assert.match(app, /const r = await onyx\.planTask\(p\.id, spec\);/, 'filled through Magic add\'s own planning');
  assert.match(app, /if \(m\.prev\) await onyx\.unplanTask\(m\.id, m\.prev\);/, 'one undo takes them out');
});

test('drawn behind the blocks, with a band that stays in view beside them', () => {
  assert.match(css, /\.fc \.fc-timegrid-col-bg \.fc-bg-event\.tchunk \{[^}]*opacity: 1;/);
  assert.match(css, /\.tchunk-name \{[^}]*writing-mode: vertical-rl;/);
  assert.match(css, /\.fc \.fc-timegrid-col-frame:has\(\.tchunk\) \.fc-timegrid-col-events \{ margin-left: 15px; \}/);
  assert.match(css, /body\.making-chunk #calendar \.fc-timegrid \.fc-event-mirror \{/);
});
