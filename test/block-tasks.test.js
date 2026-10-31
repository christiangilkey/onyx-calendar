// A block's tasks: a list kept in Onyx by the block (a repeat's by its series), each day ticked
// off on its own, in the order it was left, with the block's progress shown on the calendar.
const test = require('node:test');
const assert = require('node:assert/strict');
const store = require('../src/main/store');
const hub = require('../src/main/hub');

store.save = () => {};

test('a block keeps its tasks in order, tidied: blank ones dropped, ids kept, at most 50', () => {
  store.data.blockTasks = {};
  const out = hub.setBlockTasks('local/blocks/a', [{ id: 'x1', text: '  Read   chapter 4 ' }, { text: '' }, { id: 'x1', text: 'Same id twice' }, { text: 'No id yet' }]);
  assert.equal(out.length, 3);
  assert.deepEqual(out[0], { id: 'x1', text: 'Read chapter 4' });
  assert.notEqual(out[1].id, 'x1', 'a repeated id gets a new one');
  assert.ok(out[2].id);
  assert.equal(hub.setBlockTasks('local/blocks/b', Array.from({ length: 80 }, (_, i) => ({ text: `t${i}` }))).length, 50);
  assert.deepEqual(hub.setBlockTasks('local/blocks/a', []), []);
  assert.equal(store.data.blockTasks['local/blocks/a'], undefined, 'an empty list takes it off');
});

test('ticks are kept for each day of a block on its own', () => {
  store.data.blockTicks = {};
  hub.tickBlockTask('cal/series_day1', 't1', true);
  hub.tickBlockTask('cal/series_day1', 't2', true);
  hub.tickBlockTask('cal/series_day1', 't1', false);
  hub.tickBlockTask('cal/series_day2', 't1', true);
  assert.deepEqual(store.data.blockTicks['cal/series_day1'], ['t2']);
  assert.deepEqual(store.data.blockTicks['cal/series_day2'], ['t1']);
  hub.tickBlockTask('cal/series_day2', 't1', false);
  assert.equal(store.data.blockTicks['cal/series_day2'], undefined);
  assert.throws(() => hub.tickBlockTask('', 't1'), /Nothing to tick/);
});

test('a block can wear a colour of its own, kept in Onyx; null gives it its calendar\'s again', () => {
  store.data.eventColors = {};
  assert.equal(hub.setEventColor('cal/series', '#FF7EB6'), '#ff7eb6');
  assert.equal(store.data.eventColors['cal/series'], '#ff7eb6');
  assert.throws(() => hub.setEventColor('cal/series', 'pink'), /like #4aa8ff/);
  assert.equal(hub.setEventColor('cal/series', null), null);
  assert.equal(store.data.eventColors['cal/series'], undefined);
});
