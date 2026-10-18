const test = require('node:test');
const assert = require('node:assert/strict');
const plan = require('../src/main/magic-plan');

const day = new Date(2026, 9, 19); // Monday 19 Oct 2026, local
const at = (h, m = 0) => new Date(2026, 9, 19, h, m).getTime();
const hm = (ms) => { const d = new Date(ms); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
const run = (busy, tasks, extra = {}) => plan.schedule(busy, plan.normalizeTasks(tasks), { day, from: at(8), to: at(21), ...extra });

test('reads a to-do list: lengths written out, guessed lengths, places, limits', () => {
  const t = plan.estimateLocal('Call the bank by 4pm (10 min)\nGroceries\nStudy arabic 1h30\nPick up prescription after 2pm');
  assert.equal(t.length, 4);
  assert.deepEqual([t[0].title, t[0].minutes, t[0].kind, t[0].before], ['Call the bank', 10, 'call', '16:00']);
  assert.deepEqual([t[1].minutes, t[1].place, t[1].kind], [45, 'Grocery store', 'errand']);
  assert.deepEqual([t[2].minutes, t[2].kind, t[2].place], [90, 'focus', 'Home']);
  assert.deepEqual([t[3].place, t[3].after], ['Pharmacy', '14:00']);
  assert.equal(plan.estimateLocal('milk, eggs, bread').length, 3, 'a single line with commas is a list');
});

test('tasks fit in the free stretches and never overlap what is fixed', () => {
  const busy = [{ start: at(9), end: at(12), place: 'Office' }, { start: at(13), end: at(15), place: 'Office' }];
  const { blocks, unplaced } = run(busy, [
    { title: 'Write report', minutes: 60, place: 'Office', when: 'morning', kind: 'focus' },
    { title: 'Email', minutes: 20, kind: 'admin' },
    { title: 'Gym', minutes: 60, place: 'Gym', kind: 'exercise', when: 'evening' },
  ]);
  assert.equal(unplaced.length, 0);
  assert.equal(blocks.length, 3);
  for (const b of blocks) {
    for (const f of busy) assert.ok(b.end <= f.start || b.start >= f.end, `${b.title} overlaps a fixed entry`);
    assert.ok(b.start >= at(8) && b.end <= at(21));
  }
  const gym = blocks.find((b) => b.title === 'Gym');
  assert.ok(gym.start >= at(17) - 30 * 60000, `the evening thing goes in the evening, got ${hm(gym.start)}`);
});

test('travel is counted inside the block and between places', () => {
  const travel = [{ from: 'Home', to: 'Pharmacy', minutes: 12 }, { from: 'Home', to: 'Bank', minutes: 20 }, { from: 'Pharmacy', to: 'Bank', minutes: 5 }];
  const { blocks } = run([], [
    { title: 'Pick up prescription', minutes: 15, place: 'Pharmacy', kind: 'errand' },
    { title: 'Deposit cheque', minutes: 15, place: 'Bank', kind: 'errand' },
  ], { home: 'Home', travel });
  assert.equal(blocks.length, 2);
  // The first block leads with its trip from home, rounded up to 5 minutes; the next trip is the short hop.
  assert.equal(blocks[0].travel, 15);
  assert.equal((blocks[0].end - blocks[0].start) / 60000, 15 + 15);
  assert.equal(blocks[1].travel, 5);
  assert.ok(blocks[1].start >= blocks[0].end, 'the second trip starts when the first is done');
});

test('errands in the same place are grouped, with no travel between them', () => {
  const { blocks } = run([], [
    { title: 'Milk', minutes: 10, place: 'Grocery store', kind: 'errand' },
    { title: 'Stamps', minutes: 10, place: 'Post office', kind: 'errand' },
    { title: 'Bread', minutes: 10, place: 'Grocery store', kind: 'errand' },
  ], { home: 'Home', travel: [{ from: 'Home', to: 'Grocery store', minutes: 10 }, { from: 'Home', to: 'Post office', minutes: 10 }, { from: 'Grocery store', to: 'Post office', minutes: 10 }] });
  const names = blocks.map((b) => b.title);
  const shop = names.indexOf('Milk'), shop2 = names.indexOf('Bread');
  assert.equal(Math.abs(shop - shop2), 1, `the two grocery stops sit together: ${names.join(', ')}`);
  assert.equal(blocks.reduce((n, b) => n + (b.travel > 0 ? 1 : 0), 0), 2, 'only two trips: to the shop and to the post office');
});

test('a hard "before" and "after" are kept, and what cannot fit is reported', () => {
  const busy = [{ start: at(8), end: at(16) }];
  const out = run(busy, [
    { title: 'Call the bank', minutes: 20, kind: 'call', before: '15:00' },
    { title: 'Evening class prep', minutes: 30, kind: 'focus', after: '18:00' },
  ]);
  assert.equal(out.blocks.length, 1);
  assert.equal(out.blocks[0].title, 'Evening class prep');
  assert.ok(out.blocks[0].start >= at(18));
  assert.equal(out.unplaced.length, 1);
  assert.match(out.unplaced[0].reason, /No room|Longer/);
});

test('travel to the next fixed entry is left room for', () => {
  const busy = [{ start: at(11), end: at(12), place: 'Clinic' }];
  const { blocks } = plan.schedule(busy, plan.normalizeTasks([{ title: 'Errand', minutes: 60, place: 'Shop', kind: 'errand' }]),
    { day, from: at(10), to: at(11), home: 'Home', travel: [{ from: 'Home', to: 'Shop', minutes: 10 }, { from: 'Shop', to: 'Clinic', minutes: 30 }] });
  assert.equal(blocks.length, 0, '10 + 60 + 30 minutes does not fit in the hour before the clinic');
});

test('a long job is split into sittings when it fits nowhere whole', () => {
  const busy = [{ start: at(10), end: at(11) }, { start: at(12), end: at(13) }, { start: at(14), end: at(15) }, { start: at(16), end: at(17) }, { start: at(18), end: at(21) }];
  const { blocks, unplaced } = run(busy, [{ title: 'Thesis', minutes: 180, kind: 'focus' }]);
  assert.equal(unplaced.length, 0);
  assert.ok(blocks.length >= 2 && blocks.every((b) => /\(\d\/\d\)$/.test(b.title)), blocks.map((b) => b.title).join(' | '));
});

test('nothing is put before the start of the window (it is later in the day already)', () => {
  const { blocks } = run([], [{ title: 'Something', minutes: 30, kind: 'admin' }], { from: at(15, 7) });
  assert.ok(blocks[0].start >= at(15, 10), hm(blocks[0].start));
});

test('lunch is kept free when there is somewhere else to go', () => {
  const { blocks } = run([], [{ title: 'Reading', minutes: 60, kind: 'focus', when: 'midday' }]);
  const b = blocks[0];
  const overlap = Math.min(b.end, at(13, 15)) - Math.max(b.start, at(12, 30));
  assert.ok(overlap <= 0, `${hm(b.start)}-${hm(b.end)} sits on lunch`);
});
