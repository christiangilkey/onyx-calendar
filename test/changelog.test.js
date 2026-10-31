// The changelog (Settings → Changelog, CHANGELOG.md): every version so far, newest first, each with what came
// with it; the newest is the version being released, so no release goes out without its entry. Both the PC
// window and the phone app load it.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('node:vm');
const { bullets, clean, titleOf } = require('../scripts/changelog');

const root = path.resolve(__dirname, '..');
const load = () => {
  const box = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'src/renderer/changelog.js'), 'utf8'), box);
  return box.window.OnyxChangelog;
};
const cmp = (a, b) => { const x = a.split('.').map(Number), y = b.split('.').map(Number); return x[0] - y[0] || x[1] - y[1] || x[2] - y[2]; };

test('every version, newest first, each with a day and what came with it; the newest is this one', () => {
  const list = load();
  const { version } = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  assert.equal(list[0].version, version, 'add this release to the changelog: node scripts/changelog.js --next <version> <notes> --title "..."');
  assert.ok(list.length >= 100);
  assert.equal(list.at(-1).version, '1.0.0');
  for (let i = 1; i < list.length; i++) assert.ok(cmp(list[i - 1].version, list[i].version) > 0, `${list[i - 1].version} before ${list[i].version}`);
  for (const v of list) {
    assert.match(v.date, /^\d{4}-\d{2}-\d{2}$/, v.version);
    assert.ok(v.items.length && v.items.every((it) => typeof it === 'string' && it.trim()), v.version);
  }
  assert.ok(fs.readFileSync(path.join(root, 'CHANGELOG.md'), 'utf8').includes(`## ${version}`), 'CHANGELOG.md too');
});

test('the notes become plain points: wrapped lines joined, code in brackets left out', () => {
  assert.deepEqual(bullets('Title\n\n- One thing\n  that wraps\n- Two (hub.setPomodoro) things\n\nCo-Authored-By: x'), ['One thing that wraps', 'Two things']);
  assert.equal(clean('Google, Outlook, .ics links'), 'Google, Outlook, .ics links');
  assert.equal(titleOf('1.76.1: the phone app builds again'), 'The phone app builds again');
});

test('the window and the phone app both load it', () => {
  assert.match(fs.readFileSync(path.join(root, 'src/renderer/index.html'), 'utf8'), /<script src="changelog\.js"><\/script>/);
  assert.match(fs.readFileSync(path.join(root, 'scripts/build-mobile.js'), 'utf8'), /'changelog\.js'/);
});
