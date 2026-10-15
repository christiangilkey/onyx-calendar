// Your own notes on entries Onyx cannot write to: read-only calendar entries (memos)
// and pinned Notion / Drive items. Tasks and writable events keep theirs in Google or Outlook.
const test = require('node:test');
const assert = require('node:assert/strict');
const store = require('../src/main/store');
const google = require('../src/main/providers/google');
const hub = require('../src/main/hub');
const library = require('../src/main/library');

store.save = () => {};

test('a memo is kept per entry, trimmed, capped, and cleared when empty', () => {
  store.data.memos = {};
  assert.equal(hub.setMemo('i1/feed/x', 'Bring the slides  \n\n'), 'Bring the slides');
  assert.equal(store.data.memos['i1/feed/x'], 'Bring the slides');
  assert.equal(hub.setMemo('i1/feed/x', 'y'.repeat(hub.MAX_NOTE + 50)).length, hub.MAX_NOTE);
  hub.setMemo('i1/feed/x', '   ');
  assert.equal('i1/feed/x' in store.data.memos, false);
  assert.throws(() => hub.setMemo('', 'x'), /Nothing to attach/);
});

test('a pinned page keeps notes, and they go when cleared', () => {
  Object.assign(store.data, { pins: [], tags: {} });
  const pin = library.addPin({ source: 'notion', ref: 'abc', title: 'Lease', url: 'https://notion.so/abc' });
  assert.equal(pin.notes, '');
  assert.equal(library.updatePin(pin.id, { notes: 'Ask about parking\n' }).notes, 'Ask about parking');
  assert.equal(library.listPins()[0].notes, 'Ask about parking');
  assert.equal(library.updatePin(pin.id, { notes: '' }).notes, '');
  assert.equal('notes' in store.data.pins[0], false);
});

test('task notes are sent to Google Tasks', async () => {
  const d = store.data;
  d.accounts = [{ id: 'g1', provider: 'google', label: 'me@example.com' }];
  d.calendars = { g1: [{ rawId: 'tasks', kind: 'tasklist', name: 'My Tasks', color: '#f5b83d', writable: true }] };
  d.piLinks = {};
  hub.invalidate();
  let sent;
  google.updateTask = async (req, list, id, f) => { sent = f; return { rawId: id, title: 'Renew passport', notes: f.notes, due: null, done: false }; };
  const t = await hub.updateTask('g1/tl~tasks/a', { notes: 'Two photos' });
  assert.deepEqual(sent, { notes: 'Two photos' });
  assert.equal(t.notes, 'Two photos');
});

test('any web link can be pinned to the globe, named, tagged and renamed', () => {
  Object.assign(store.data, { pins: [], tags: {} });
  const pin = library.addPin({ source: 'web', url: 'www.duolingo.com/course/ar', tags: ['arabic'], notes: 'Daily lesson' });
  assert.match(pin.id, /^web\/[0-9a-f]{16}$/);
  assert.equal(pin.url, 'https://www.duolingo.com/course/ar');
  assert.equal(pin.title, 'duolingo.com');
  assert.deepEqual([pin.tags, pin.notes, pin.kind], [['arabic'], 'Daily lesson', 'link']);
  assert.equal(library.addPin({ source: 'web', url: 'https://www.duolingo.com/course/ar' }).id, pin.id, 'the same link is pinned once');
  assert.equal(library.updatePin(pin.id, { title: 'Duolingo Arabic' }).title, 'Duolingo Arabic');
  assert.throws(() => library.addPin({ source: 'web', url: 'javascript:alert(1)' }), /Only web links/);
  assert.throws(() => library.addPin({ source: 'web', url: 'not a link' }), /not a web address/);
});
