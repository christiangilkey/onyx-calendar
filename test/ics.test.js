const test = require('node:test');
const assert = require('node:assert/strict');
const ics = require('../src/main/providers/ics');

const wrap = (body) => `BEGIN:VCALENDAR\nVERSION:2.0\n${body}\nEND:VCALENDAR\n`;

async function expandAll(body, from, to) {
  const parsed = await ics.parse(wrap(body));
  return Object.values(parsed).filter((e) => e.type === 'VEVENT')
    .flatMap((e) => ics.expand(e, new Date(from), new Date(to)))
    .sort((a, b) => a.start.localeCompare(b.start));
}

test('a weekly meeting keeps its local time across the daylight-saving change', async () => {
  // 9am New York every Tuesday. Clocks go back on Nov 1, 2026: 13:00Z becomes 14:00Z.
  const out = await expandAll([
    'BEGIN:VEVENT', 'UID:weekly@test', 'SUMMARY:Standup',
    'DTSTART;TZID=America/New_York:20261020T090000', 'DTEND;TZID=America/New_York:20261020T093000',
    'RRULE:FREQ=WEEKLY;BYDAY=TU', 'END:VEVENT',
  ].join('\n'), '2026-10-19T00:00:00Z', '2026-11-11T00:00:00Z');
  assert.deepEqual(out.map((e) => e.start), [
    '2026-10-20T13:00:00.000Z', '2026-10-27T13:00:00.000Z', '2026-11-03T14:00:00.000Z', '2026-11-10T14:00:00.000Z',
  ]);
  assert.equal(out[0].end, '2026-10-20T13:30:00.000Z');
  assert.equal(out[0].title, 'Standup');
});

test('Outlook-style Windows time zone names are understood', async () => {
  const out = await expandAll([
    'BEGIN:VEVENT', 'UID:win@test', 'SUMMARY:Board',
    'DTSTART;TZID=Pacific Standard Time:20261012T130000', 'DTEND;TZID=Pacific Standard Time:20261012T140000',
    'RRULE:FREQ=DAILY;COUNT=2', 'END:VEVENT',
  ].join('\n'), '2026-10-12T00:00:00Z', '2026-10-15T00:00:00Z');
  assert.deepEqual(out.map((e) => e.start), ['2026-10-12T20:00:00.000Z', '2026-10-13T20:00:00.000Z']);
});

test('cancelled dates are left out and moved ones use their new time', async () => {
  const out = await expandAll([
    'BEGIN:VEVENT', 'UID:ex@test', 'SUMMARY:Review',
    'DTSTART:20261012T170000Z', 'DTEND:20261012T180000Z',
    'RRULE:FREQ=DAILY;COUNT=4', 'EXDATE:20261013T170000Z', 'END:VEVENT',
    'BEGIN:VEVENT', 'UID:ex@test', 'SUMMARY:Review (moved)', 'RECURRENCE-ID:20261014T170000Z',
    'DTSTART:20261014T190000Z', 'DTEND:20261014T200000Z', 'END:VEVENT',
  ].join('\n'), '2026-10-11T00:00:00Z', '2026-10-20T00:00:00Z');
  assert.deepEqual(out.map((e) => [e.start, e.title]), [
    ['2026-10-12T17:00:00.000Z', 'Review'],
    ['2026-10-14T19:00:00.000Z', 'Review (moved)'],
    ['2026-10-15T17:00:00.000Z', 'Review'],
  ]);
});

test('all-day entries come out as plain dates', async () => {
  const out = await expandAll([
    'BEGIN:VEVENT', 'UID:day@test', 'SUMMARY:Leave',
    'DTSTART;VALUE=DATE:20261014', 'DTEND;VALUE=DATE:20261016', 'END:VEVENT',
    'BEGIN:VEVENT', 'UID:yearly@test', 'SUMMARY:Birthday',
    'DTSTART;VALUE=DATE:20200115', 'RRULE:FREQ=YEARLY', 'END:VEVENT',
  ].join('\n'), '2026-10-01T00:00:00Z', '2027-02-01T00:00:00Z');
  assert.deepEqual(out.map((e) => [e.title, e.allDay, e.start, e.end]), [
    ['Leave', true, '2026-10-14', '2026-10-16'],
    ['Birthday', true, '2027-01-15', '2027-01-16'],
  ]);
});

test('entries outside the range are left out', async () => {
  const out = await expandAll([
    'BEGIN:VEVENT', 'UID:one@test', 'SUMMARY:Old', 'DTSTART:20260101T100000Z', 'DTEND:20260101T110000Z', 'END:VEVENT',
  ].join('\n'), '2026-10-01T00:00:00Z', '2026-11-01T00:00:00Z');
  assert.equal(out.length, 0);
});
