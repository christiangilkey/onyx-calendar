// Repeating time blocks: the rule, as Google, Outlook and Onyx's own calendars keep it.

const test = require('node:test');
const assert = require('node:assert/strict');
const recur = require('../src/main/recur');

const d = (s) => recur.fromYmd(s);

test('a rule is filled in from its first day', () => {
  const wed = d('2026-10-21'); // a Wednesday
  assert.deepEqual(recur.normalize({ freq: 'weekly' }, wed), { freq: 'weekly', days: [3] });
  assert.deepEqual(recur.normalize({ freq: 'monthly' }, wed), { freq: 'monthly', dates: [21] });
  assert.deepEqual(recur.normalize({ freq: 'yearly' }, wed), { freq: 'yearly', dates: [21], months: [10] });
  assert.deepEqual(recur.normalize({ freq: 'weekly', days: [5, 1, 1, 9] }, wed), { freq: 'weekly', days: [1, 5] });
  assert.equal(recur.normalize(null, wed), null);
  assert.throws(() => recur.normalize({ freq: 'hourly' }, wed));
});

test('the days a rule falls on', () => {
  const weekly = recur.normalize({ freq: 'weekly', days: [1, 3] }, d('2026-10-19'));
  const days = recur.days(weekly, d('2026-10-19'), d('2026-10-19'), d('2026-11-01')).map(recur.ymd);
  assert.deepEqual(days, ['2026-10-19', '2026-10-21', '2026-10-26', '2026-10-28']);
  // Skipped days and the last day are kept to.
  const some = recur.days({ ...weekly, until: '2026-10-26' }, d('2026-10-19'), d('2026-10-01'), d('2026-11-30'), ['2026-10-21']).map(recur.ymd);
  assert.deepEqual(some, ['2026-10-19', '2026-10-26']);
  const monthly = recur.normalize({ freq: 'monthly', dates: [1, 15] }, d('2026-10-01'));
  assert.deepEqual(recur.days(monthly, d('2026-10-01'), d('2026-10-01'), d('2026-11-30')).map(recur.ymd), ['2026-10-01', '2026-10-15', '2026-11-01', '2026-11-15']);
  const yearly = recur.normalize({ freq: 'yearly', months: [3, 9], dates: [1] }, d('2026-03-01'));
  assert.deepEqual(recur.days(yearly, d('2026-03-01'), d('2026-01-01'), d('2027-12-31')).map(recur.ymd), ['2026-03-01', '2026-09-01', '2027-03-01', '2027-09-01']);
  assert.equal(recur.ymd(recur.firstOnOrAfter(weekly, d('2026-10-22'))), '2026-10-26');
});

test('Google: rules go out as an RRULE and come back the same', () => {
  const rule = { freq: 'yearly', months: [3, 9], dates: [1, 15] };
  assert.equal(recur.toRRule(rule, true), 'RRULE:FREQ=YEARLY;BYMONTH=3,9;BYMONTHDAY=1,15');
  assert.equal(recur.toRRule({ freq: 'weekly', days: [1, 3], until: '2026-12-31' }, true), 'RRULE:FREQ=WEEKLY;BYDAY=MO,WE;UNTIL=20261231');
  assert.deepEqual(recur.fromRRule([recur.toRRule(rule, false)], '2026-03-01'), rule);
  assert.deepEqual(recur.fromRRule(['RRULE:FREQ=WEEKLY;BYDAY=TU,TH'], '2026-10-20'), { freq: 'weekly', days: [2, 4] });
  // A timed UNTIL comes back as its local day.
  const back = recur.fromRRule([recur.toRRule({ freq: 'daily', until: '2026-11-05' }, false)], '2026-10-20T09:00:00Z');
  assert.equal(back.until, '2026-11-05');
  // Rules Onyx can't show as they are stay marked, so they're never written back changed.
  assert.equal(recur.fromRRule(['RRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=MO'], '2026-10-19').custom, true);
  assert.equal(recur.fromRRule(['RRULE:FREQ=MONTHLY;BYDAY=1MO'], '2026-10-05').custom, true);
  assert.equal(recur.fromRRule(['EXDATE:20261020'], '2026-10-20'), null);
});

test('Outlook: one date a month or a year, anything else is refused plainly', () => {
  const weekly = recur.toGraph({ freq: 'weekly', days: [1, 5] }, '2026-10-19', 'Europe/London');
  assert.deepEqual(weekly.pattern.daysOfWeek, ['monday', 'friday']);
  assert.equal(weekly.range.type, 'noEnd');
  assert.equal(recur.toGraph({ freq: 'monthly', dates: [15] }, '2026-10-15', 'UTC').pattern.dayOfMonth, 15);
  assert.throws(() => recur.toGraph({ freq: 'monthly', dates: [1, 15] }, '2026-10-01', 'UTC'), /one date a month/);
  assert.deepEqual(recur.fromGraph(recur.toGraph({ freq: 'yearly', months: [3], dates: [1], until: '2030-01-01' }, '2026-03-01', 'UTC'), '2026-03-01'),
    { freq: 'yearly', months: [3], dates: [1], until: '2030-01-01' });
});

test('moving one day of a repeat moves its days with it', () => {
  assert.deepEqual(recur.shift({ freq: 'weekly', days: [1, 3] }, 1).days, [2, 4]);
  assert.deepEqual(recur.shift({ freq: 'weekly', days: [6] }, 1).days, [0]);
  assert.deepEqual(recur.shift({ freq: 'monthly', dates: [1, 15] }, -1).dates, [1, 14]);
  assert.deepEqual(recur.shift({ freq: 'daily' }, 3), { freq: 'daily' });
});
