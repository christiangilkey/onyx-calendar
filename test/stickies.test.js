// Sticky notes (1.140.0): notes of their own on the desktop, for thoughts, ideas and lists, whose
// lines can become tasks.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const store = require('../src/main/store');
const stickies = require('../src/main/stickies');

store.save = () => {};
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

test('a new note takes the next colour along, keeps its text, and can be deleted', (t) => {
  const real = store.data.stickies;
  t.after(() => { store.data.stickies = real; });
  store.data.stickies = [];
  const a = stickies.makeNote({ x: 10, y: 20 });
  const b = stickies.makeNote({ x: 30, y: 40 });
  assert.equal(a.color, 'yellow');
  assert.equal(b.color, 'pink');
  assert.deepEqual(a.bounds, { width: 280, height: 260, x: 10, y: 20 });
  assert.equal(stickies.setText(a.id, 'Idea: a garden'), true);
  assert.equal(store.data.stickies[0].text, 'Idea: a garden');
  assert.equal(stickies.setText(a.id, 'x'.repeat(30000)) && store.data.stickies[0].text.length, 20000);
  assert.equal(stickies.setColor(a.id, 'green'), true);
  assert.equal(stickies.setColor(a.id, 'rainbow'), false);
  assert.equal(stickies.remove(a.id), true);
  assert.deepEqual(store.data.stickies.map((n) => n.id), [b.id]);
  assert.equal(stickies.setText('gone', 'x'), false);
});

test('Make task: each selected line is a task (list marks off); with none selected, the whole note is one', () => {
  assert.deepEqual(stickies.tasksFrom('whatever', '- Call Sam\n\n* Buy stamps\n1. Book flights\n[ ] Pay rent\n[x] Old one'),
    [{ title: 'Call Sam' }, { title: 'Buy stamps' }, { title: 'Book flights' }, { title: 'Pay rent' }, { title: 'Old one' }]);
  assert.deepEqual(stickies.tasksFrom('\nPlan the trip\n- flights\n- hotel\n'), [{ title: 'Plan the trip', notes: '- flights\n- hotel' }]);
  assert.deepEqual(stickies.tasksFrom('Just one thing'), [{ title: 'Just one thing' }]);
  assert.deepEqual(stickies.tasksFrom('  \n '), []);
  assert.deepEqual(stickies.tasksFrom('Note', '   '), [{ title: 'Note' }]);
});

test('the note windows, the tray, the shortcut and the top bar button are wired in', () => {
  const main = read('src/main/main.js');
  assert.match(main, /require\('\.\/stickies'\)\.start\(\{ hub, onChanged/);
  assert.match(main, /globalShortcut\.register\(STICKY_KEY/);
  assert.match(main, /label: 'New sticky note', accelerator: STICKY_KEY/);
  assert.match(main, /label: 'Show sticky notes'/);
  assert.match(main, /'stickies:new': \(\) => require\('\.\/stickies'\)\.create\(\),/);
  assert.match(read('src/preload.js'), /newSticky: \(\) => call\('stickies:new'\),/);
  const pre = read('src/sticky-preload.js');
  for (const name of ['load', 'text', 'color', 'pin', 'new', 'delete', 'task']) assert.match(pre, new RegExp(`call\\('${name}'`), name);
  const html = read('src/renderer/sticky.html');
  for (const c of stickies.COLORS) assert.match(html, new RegExp(`body\\[data-color="${c}"\\]`), c);
  assert.match(html, /script-src 'self'/);
  assert.match(read('src/renderer/sticky.js'), /window\.sticky\.task\(selected\)/);
  assert.match(read('src/renderer/app.js'), /sticky\.onclick = \(\) => onyx\.newSticky\(\)\.catch\(fail\);/);
  assert.match(read('src/renderer/index.html'), /id="sticky-btn"/);
});
