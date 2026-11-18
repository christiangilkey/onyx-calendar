// Hemingway bridges (1.136.0): each task can keep the next small step to pick up with, typed in or
// thought of by Claude. It shows under the task, starts the next Hyperfocus on it, and the next step
// written when a session ends becomes the bridge.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const store = require('../src/main/store');
const hub = require('../src/main/hub');
const ai = require('../src/main/ai');

store.save = () => {};
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

test('a bridge is kept per task, tidied, and taken off with no words', (t) => {
  const real = store.data.bridges;
  t.after(() => { store.data.bridges = real; });
  store.data.bridges = {};
  const b = hub.setBridge('g/list/1', '  Finish   the intro\nparagraph ', 'claude');
  assert.equal(b.text, 'Finish the intro paragraph');
  assert.equal(b.by, 'claude');
  assert.deepEqual(hub.bridgeOf('g/list/1'), b);
  assert.equal(hub.setBridge('g/list/1', 'x'.repeat(400)).text.length, 300);
  assert.equal(hub.setBridge('g/list/1', 'Open it', 'someone').by, 'you');
  assert.equal(hub.setBridge('g/list/1', '   '), null);
  assert.equal('g/list/1' in store.data.bridges, false);
  assert.throws(() => hub.setBridge('', 'x'), /Nothing to put/);
});

test('bridges sync between desktops, go out with the tasks, and go when the task is deleted', () => {
  assert.match(read('src/main/sync.js'), /bridges: MAP/);
  const h = read('src/main/hub.js');
  assert.match(h, /bridge: bridgeOf\(t\.id\) \}\)\);/);
  assert.match(h, /delete store\.data\.bridges\?\.\[id\];/);
  assert.match(read('src/main/api.js'), /'bridge:set': \(id, text, by\) => hub\.setBridge\(id, text, by\),/);
  assert.match(read('src/main/api.js'), /'ai:bridge': \(title, opts\) => ai\.bridge\(title, opts\),/);
  for (const f of ['src/preload.js', 'src/renderer/remote.js']) {
    assert.match(read(f), /setBridge: \(id, text, by\) => call\('bridge:set', id, text, by\),/, f);
    assert.match(read(f), /suggestBridge: \(title, opts\) => call\('ai:bridge', title, opts\),/, f);
  }
});

test('Claude thinks of one: a single tiny next move from the task, its notes and steps', async (t) => {
  const realFetch = global.fetch, realKey = store.data.secrets.anthropicKey;
  t.after(() => { global.fetch = realFetch; store.data.secrets.anthropicKey = realKey; });
  store.data.secrets.anthropicKey = 'sk-ant-test-0000000000000000000000';
  let sent;
  global.fetch = async (url, o) => { sent = JSON.parse(o.body); return { ok: true, json: async () => ({ content: [{ type: 'text', text: '"Finish the sentence that starts “Our goal is”."' }] }) }; };
  const out = await ai.bridge('Write the grant', { notes: 'Due Friday', steps: [{ text: 'Outline', done: true }, { text: 'Intro', done: false }] });
  assert.equal(out, 'Finish the sentence that starts “Our goal is”.');
  assert.match(sent.messages[0].content, /Task: Write the grant\nNotes: Due Friday\nSteps:\n\[x\] Outline\n\[ \] Intro/);
  assert.match(sent.system, /Hemingway bridge/);
  assert.ok(sent.max_tokens <= 300);
  store.data.secrets.anthropicKey = '';
  await assert.rejects(ai.bridge('Write the grant'), /Claude API key/);
  await assert.rejects(ai.bridge('  '), /Give it a task/);
});

test('the task window, the list and Hyperfocus use the bridge', () => {
  const app = read('src/renderer/app.js');
  assert.match(app, /bridge && bridge\.el,/, 'a Bridge row in the task window');
  assert.match(app, /if \(bridge && bridge\.changed\(\)\) await onyx\.setBridge\(t\.id, bridge\.value\(\), bridge\.by\(\)\);/);
  assert.match(app, /onyx\.suggestBridge\(about\(\)\.title/, 'Think of one asks Claude');
  assert.match(app, /bridgeLine\(t\),\s*notePreview/, 'shown under the task in the list');
  assert.match(app, /value: entry\.task\?\.bridge\?\.text \|\| lastTime\?\.next/, 'Hyperfocus starts from it');
  assert.match(app, /await onyx\.setBridge\(s\.entry\.id, next, 'you'\)/, 'the next step at the end of a session becomes it');
});
