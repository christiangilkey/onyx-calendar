// Blocks just to keep in mind: things to be aware of (meal hours, a time frame), not to do. They stay on the
// calendar, but have no tick and are never the next thing, on the PC or the phone. Set in the block's window.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const store = require('../src/main/store');
const hub = require('../src/main/hub');
const F = require('../src/renderer/focus-plan');

store.save = () => {};
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const app = read('src/renderer/app.js');
const java = (f) => read(`mobile/android/app/src/main/java/com/onyxcalendar/app/${f}`);

test('kept in Onyx by the block, a repeat by its series, and synced', () => {
  store.data.awareEvents = {};
  assert.equal(hub.setAware('g1/personal/series~meals', true), true);
  assert.deepEqual(store.data.awareEvents, { 'g1/personal/series~meals': true });
  assert.equal(hub.setAware('g1/personal/series~meals', false), false);
  assert.deepEqual(store.data.awareEvents, {});
  assert.throws(() => hub.setAware('', true), /Nothing to mark/);
  assert.match(read('src/main/hub.js'), /\.\.\.\(e\.kind === 'event' && store\.data\.awareEvents\?\.\[keyOf\(e\)\] \? \{ aware: true \} : \{\}\),/, 'on every day of it');
  assert.match(read('src/main/sync.js'), /doneEvents: MAP, awareEvents: MAP,/);
  assert.match(read('src/main/store-defaults.js'), /awareEvents: \{\},/);
  assert.match(read('src/main/api.js'), /'aware:set': \(key, on\) => hub\.setAware\(key, !!on\),/);
  assert.match(read('src/preload.js'), /setAware: \(key, on\) => call\('aware:set', key, on\),/);
  const remote = read('src/renderer/remote.js');
  assert.match(remote, /'eventColor:set', 'aware:set',/, 'waits offline on the phone');
  assert.match(remote, /else if \(o\.name === 'aware:set'\) touch\(a, \(e\) => \(\{ \.\.\.e, aware: !!b \}\)\);/, 'and shows at once');
  assert.match(read('src/main/mcp.js'), /\.\.\.\(e\.aware \? \{ keep_in_mind: true \} : \{\}\)/, 'the agenda (widgets, Claude) says so');
});

test('never the next thing in the window: the Next bar, its cues, popups, alarms and Hyperfocus', () => {
  assert.match(app, /nextRun\.items = events\.filter\(\(e\) => !e\.allDay && e\.end && !e\.done && !e\.aware && /);
  const now = Date.parse('2026-11-09T10:00:00Z');
  const items = [
    { id: 'meal', kind: 'event', start: '2026-11-09T10:45:00Z', end: '2026-11-09T12:45:00Z', aware: true },
    { id: 'class', kind: 'event', start: '2026-11-09T13:00:00Z', end: '2026-11-09T14:00:00Z' },
  ];
  assert.equal(F.nextEntry(items, now).id, 'class', 'Hyperfocus stops at the next real thing');
});

test('on the calendar with no tick and no Complete, and a lighter look', () => {
  assert.match(app, /e\.kind === 'goal' \|\| e\.aware \? '' : 'can-tick', e\.aware \? 'is-aware' : '',/);
  assert.match(app, /\(src\.kind === 'task' \|\| src\.kind === 'event'\) && !src\.aware && h\('span', \{ class: 'dot'/);
  assert.match(app, /src && !src\.aware && h\('button', \{ class: 'btn complete'/);
  assert.match(read('src/renderer/styles.css'), /\.fc \.fc-event\.is-aware \{[^}]*dashed/);
});

test('a switch in the block\'s window, saved with the block (any calendar, even a read-only one)', () => {
  assert.match(app, /const aware = h\('input', \{ type: 'checkbox', checked: !!src\?\.aware \}\);/);
  assert.match(app, /h\('label', \{ class: 'check', title: [^}]+\}, aware, 'Just to keep in mind'\)/);
  assert.match(app, /if \(id && aware\.checked !== !!src\?\.aware\) \{\s*try \{ await onyx\.setAware\(id, aware\.checked\); \}/);
  assert.match(read('src/renderer/mock.js'), /setAware: async/);
});

test('on the phone: never Now or Next, not in the day\'s list, not the small widget\'s next', () => {
  const data = java('LauncherData.java');
  assert.match(data, /it\.aware = e\.optBoolean\("aware", false\);/);
  assert.match(data, /return !it\.allDay && !it\.done && !it\.aware;/, 'now(), next() and all that use them');
  const panel = java('OnyxPanel.java');
  assert.equal((panel.match(/if \(it\.aware \|\| !LauncherData\.dayOf\(it\.start\)/g) || []).length, 4, 'the day card and its picture, today and tomorrow');
  const widget = java('WidgetItems.java');
  assert.match(widget, /it\.aware = e\.optBoolean\("keep_in_mind"\);/);
  assert.match(widget, /if \(it\.allDay \|\| it\.aware \|\| "goal"\.equals\(it\.kind\)/);
});
