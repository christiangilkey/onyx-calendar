// The saved copy (1.141.0): a calendar that can't be read (a sign-in that expired, no network)
// shows its last good entries instead of nothing, and its repeats carry on by their rule.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const store = require('../src/main/store');
const hub = require('../src/main/hub');

store.save = () => {};
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const at = (d, h, m = 0) => new Date(2026, 10, d, h, m).toISOString();

test('a read keeps a copy; the copy shows entries and carries a daily repeat past the last day read', (t) => {
  const real = store.data.keptEvents;
  t.after(() => { store.data.keptEvents = real; });
  store.data.keptEvents = {};
  const cal = { id: 'g1/primary' };
  const now = new Date(2026, 10, 20, 9).getTime();
  const gym = (d) => ({ id: `g1/primary/gym_${d}`, calendarId: cal.id, title: 'Gym', start: at(d, 7), end: at(d, 8), recur: { freq: 'daily' }, seriesId: 'g1/primary/gym' });
  const dentist = { id: 'g1/primary/dent', calendarId: cal.id, title: 'Dentist', start: at(21, 14), end: at(21, 15) };
  hub.keepEvents(cal, at(19, 0), at(23, 0), [gym(19), gym(20), gym(21), gym(22), dentist], now);
  assert.equal(store.data.keptEvents[cal.id].items.length, 5);

  // Inside what was read: exactly what was there.
  const inside = hub.keptEvents(cal, at(21, 0), at(22, 0));
  assert.deepEqual(inside.map((e) => e.title).sort(), ['Dentist', 'Gym']);
  assert.ok(inside.every((e) => e.saved === now && e.writable === false));

  // Days later, past what was read: the daily Gym is still there every day, the one-off is not.
  const later = hub.keptEvents(cal, at(25, 0), at(28, 0));
  assert.deepEqual(later.map((e) => e.start), [at(25, 7), at(26, 7), at(27, 7)]);
  assert.ok(later.every((e) => e.title === 'Gym' && e.end === new Date(new Date(e.start).getTime() + 3600000).toISOString()));

  // A new read stands for its range: an entry deleted since goes from the copy.
  hub.keepEvents(cal, at(21, 0), at(22, 0), [gym(21)], now);
  assert.deepEqual(hub.keptEvents(cal, at(21, 0), at(22, 0)).map((e) => e.title), ['Gym']);
  assert.equal(hub.keptEvents({ id: 'nothing' }, at(21, 0), at(22, 0)), null);
});

test('getEvents falls back to the copy and says so; the window shows a bar that stays', () => {
  const h = read('src/main/hub.js');
  assert.match(h, /const copy = cal\.kind === 'calendar' \? keptEvents\(cal, start, end\) : null;/);
  assert.match(h, /saved: \[\.\.\.saved\]\.map\(\(\[account, at\]\) => \(\{ account, at \}\)\)/);
  assert.match(h, /if \(saved\) err\.savedTasks = saved;/, 'a task list falls back to its last good copy too');
  assert.match(read('src/main/main.js'), /if \(!SMOKE_SHOT\) hub\.keepFresh\(\);/);
  const app = read('src/renderer/app.js');
  assert.match(app, /showSaved\(saved \|\| \[\]\);/);
  assert.match(app, /isn't showing: \$\{why\}, and there is no saved copy yet\./);
  assert.match(app, /e\.saved \? 'saved-copy' : ''/);
  assert.match(read('src/renderer/index.html'), /<div id="saved-bar" hidden><\/div>/);
  // The copy stays on this device: it is not one of the parts that sync between devices.
  assert.doesNotMatch(read('src/main/sync.js'), /keptEvents|keptTasks/);
});
