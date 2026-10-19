// Break ideas: written by the user for pomodoro breaks and Hyperfocus body checks.

const test = require('node:test');
const assert = require('node:assert/strict');
const store = require('../src/main/store');
const hub = require('../src/main/hub');
const F = require('../src/renderer/focus-plan');

store.save = () => {};

test('break ideas are read from commas, semicolons and lines, cleaned and capped', () => {
  assert.deepEqual(F.parseActivities('Stretch, Drink water;  walk to the window\nmake tea'), ['Stretch', 'Drink water', 'walk to the window', 'make tea']);
  assert.deepEqual(F.parseActivities('Stretch, stretch,  STRETCH , , '), ['Stretch'], 'no repeats, no blanks');
  assert.deepEqual(F.parseActivities(['a', 'b ', '']), ['a', 'b']);
  assert.deepEqual(F.parseActivities(''), []);
  assert.deepEqual(F.parseActivities(null), []);
  assert.equal(F.parseActivities('x'.repeat(200))[0].length, 60);
  assert.equal(F.parseActivities(Array.from({ length: 30 }, (_, i) => `idea ${i}`)).length, 12);
});

test('each break takes the next idea, round and round', () => {
  const list = ['Stretch', 'Water', 'Walk'];
  assert.deepEqual([1, 2, 3, 4, 5].map((n) => F.breakIdea(list, n)), ['Stretch', 'Water', 'Walk', 'Stretch', 'Water']);
  assert.equal(F.breakIdea([], 1), '');
  assert.equal(F.breakIdea(undefined, 3), '');
  assert.equal(F.breakIdea(list, 0), 'Stretch', 'a bad round still gives one');
});

test('a pomodoro keeps its break ideas, cleaned; without any it keeps none', () => {
  store.data.pomodoro = {};
  const a = hub.setPomodoro('block1', { work: 25, rest: 5, activities: 'Stretch, Water; stretch\n  Walk ' });
  assert.deepEqual(a.activities, ['Stretch', 'Water', 'Walk']);
  const b = hub.setPomodoro('block2', { work: 25, rest: 5, activities: ['Tea', 'Tea', 'x'.repeat(100)] });
  assert.equal(b.activities.length, 2);
  assert.equal(b.activities[1].length, 60);
  const c = hub.setPomodoro('block3', { work: 25, rest: 5 });
  assert.equal('activities' in c, false);
  const d = hub.setPomodoro('block4', { work: 25, rest: 5, activities: '  ,, ' });
  assert.equal('activities' in d, false, 'a blank list is no list');
});

test('Hyperfocus can be silent: "none" is a sound and keeps its meaning', () => {
  const focus = require('../src/main/focus');
  assert.ok(focus.SOUNDS.includes('none'));
});
