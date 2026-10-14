const test = require('node:test');
const assert = require('node:assert/strict');
const { parseName, mirrorName, callTime } = require('../src/main/taskname');

// "Today" for every case, so yearless dates resolve the same way each run.
const TODAY = new Date(2026, 9, 10); // Oct 10, 2026

function check(name, spoken, date, time) {
  const p = parseName(name, TODAY);
  assert.deepEqual({ spoken: p.spoken, date: p.date, time: p.time }, { spoken, date, time }, name);
}

// The examples in task_caller's README.
test('README examples', () => {
  check('Call Alex 10am', 'Call Alex', null, [10, 0]);
  check('Submit report Oct 12 3:30pm', 'Submit report', '2026-10-12', [15, 30]);
  check('Dentist 10/14 at 15:00', 'Dentist', '2026-10-14', [15, 0]);
  check('Lunch with Sam 12 Dec noon', 'Lunch with Sam', '2026-12-12', [12, 0]);
  check('1100 21st Check flight time', 'Check flight time', '2026-10-21', [11, 0]);
  check('1300-1400 12 Oct Board meeting', 'Board meeting', '2026-10-12', [13, 0]);
});

test('times', () => {
  check('Call 3 p.m.', 'Call', null, [15, 0]);
  check('Party midnight', 'Party', null, [0, 0]);
  check('Standup 12am', 'Standup', null, [0, 0]);
  check('Brief the team at 1500', 'Brief the team', null, [15, 0]);
  check('Formation 0600L', 'Formation', null, [6, 0]);
  check('Gym 1430hrs', 'Gym', null, [14, 30]);
});

test('things that are not times or dates', () => {
  check('Anki 20 new words', 'Anki 20 new words', null, null);
  check('Room 1100 cleanup', 'Room 1100 cleanup', null, null);
  check('Order 1500 rounds', 'Order 1500 rounds', null, null);
  check('2026 goals', '2026 goals', null, null);
  check('Pay 13/45 invoice', 'Pay 13/45 invoice', null, null);
});

test('dates', () => {
  check('Renew 2026-11-03 9am', 'Renew', '2026-11-03', [9, 0]);
  check('Taxes October 12th, 2027', 'Taxes', '2027-10-12', null);
  check('Review 10/12/26 2pm', 'Review', '2026-10-12', [14, 0]);
  // More than 180 days back means next year.
  check('Birthday Feb 3 8am', 'Birthday', '2027-02-03', [8, 0]);
  // The 3rd has passed this month, so it means next month.
  check('Rent 9am the 3rd', 'Rent', '2026-11-03', [9, 0]);
  check('Sync Wednesday, Oct 14 10:00 (Pacific Standard Time)', 'Sync', '2026-10-14', [10, 0]);
});

test('mirrorName writes a name that reads back as the same date and time', () => {
  const cases = [
    ['Deep work', new Date(2026, 9, 14, 15, 0)],
    ['Plan 5 PM sync', new Date(2026, 9, 14, 9, 30)],
    ['Midnight snack planning', new Date(2026, 9, 14, 13, 15)],
    ['Review Oct 12 plan', new Date(2026, 9, 20, 8, 0)],
    ['1300 brief', new Date(2026, 10, 2, 7, 45)],
    ['', new Date(2026, 9, 14, 0, 0)],
  ];
  for (const [title, start] of cases) {
    const name = mirrorName(title, start);
    const p = parseName(name);
    const pad = (n) => String(n).padStart(2, '0');
    assert.equal(p.date, `${start.getFullYear()}-${pad(start.getMonth() + 1)}-${pad(start.getDate())}`, name);
    assert.deepEqual(p.time, [start.getHours(), start.getMinutes()], name);
  }
  assert.equal(mirrorName('Deep work', new Date(2026, 9, 14, 15, 0)), 'Deep work 2026-10-14 15:00');
});

test('callTime follows the half-hour checks and quiet hours', () => {
  const pi = { leadMinutes: 60, quietStart: '22:00', quietEnd: '07:00' };
  const at = (h, m) => callTime(new Date(2026, 9, 14, h, m), pi);
  assert.equal(at(15, 0).at.getHours() * 60 + at(15, 0).at.getMinutes(), 14 * 60);
  assert.equal(at(15, 15).at.getHours() * 60 + at(15, 15).at.getMinutes(), 14 * 60 + 30);
  assert.equal(at(15, 0).quiet, false);
  assert.equal(at(7, 30).quiet, true);   // would ring at 6:30am
  assert.equal(at(8, 0).quiet, false);   // rings at 7:00am
});
