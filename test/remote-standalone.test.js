// The phone working on its own (remote.js with the engine): with the PC out of reach, waiting changes go to
// the engine first, but one only the PC can make keeps waiting for the PC, in its place, and holds nothing up.
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('fs');
const path = require('path');

const code = fs.readFileSync(path.join(__dirname, '../src/renderer/remote.js'), 'utf8');

function phone(outbox, pcOnly) {
  const kept = new Map([
    ['onyx.connection', JSON.stringify({ addresses: ['127.0.0.1:9'], token: 't', last: '' })],
    ['onyx.outbox', JSON.stringify(outbox)],
  ]);
  const events = {};
  const calls = [];
  const unref = (fn) => (...a) => { const t = fn(...a); t.unref?.(); return t; };
  const ctx = {
    console, URL, URLSearchParams, AbortController, Promise, JSON, Date, Math,
    setTimeout: unref(setTimeout), clearTimeout, setInterval: unref(setInterval), clearInterval,
    location: { search: '?remote' },
    localStorage: { getItem: (k) => kept.get(k) ?? null, setItem: (k, v) => kept.set(k, String(v)), removeItem: (k) => kept.delete(k) },
    document: { documentElement: { classList: { toggle() {} }, style: { setProperty() {} }, dataset: {} }, visibilityState: 'visible', addEventListener() {} },
    addEventListener: (type, fn) => { events[type] = fn; },
    fetch: async () => { throw new TypeError('Failed to fetch'); },
    OnyxEngine: {
      boot: async () => true, can: (name) => !pcOnly.includes(name), active() {}, onChanged() {},
      call: async (name, args) => { calls.push([name, args]); return name.endsWith(':create') ? { id: 'real-id' } : true; },
    },
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(code, ctx);
  return { onyx: ctx.onyx, calls, events, outbox: () => JSON.parse(kept.get('onyx.outbox') || '[]') };
}

test('a change only the PC can make keeps waiting; the rest go to the engine, and so does the next one', async () => {
  const p = phone([
    { op: '1', name: 'p:pc-only', args: ['m1'], at: 1 },
    { op: '2', name: 'tags:set', args: ['e1', ['study']], at: 2 },
  ], ['p:pc-only']);
  await p.onyx.whenReady();
  p.events.offline(); // the phone says it has no way to the PC
  await p.onyx.setTags('e2', ['gym']);
  assert.deepEqual(p.calls.map(([n, a]) => `${n} ${a[0]}`), ['tags:set e1', 'tags:set e2'], 'the waiting one first, then the new one, both on the engine');
  assert.deepEqual(p.outbox().map((o) => o.name), ['p:pc-only'], 'the PC-only change still waits, nothing lost');
  assert.equal(p.onyx.outbox().failed.length, 0);
});

test('with only PC-only changes waiting, new changes still run on the engine at once', async () => {
  const p = phone([{ op: '1', name: 'p:pc-only', args: ['m1'], at: 1 }], ['p:pc-only']);
  await p.onyx.whenReady();
  p.events.offline();
  const made = await p.onyx.createEvent({ title: 'Made with the PC off', start: '2026-11-03T10:00:00Z', end: '2026-11-03T11:00:00Z', calendarId: 'local/blocks' });
  assert.equal(made.id, 'real-id', 'made for real, not a stand-in for later');
  assert.deepEqual(p.outbox().map((o) => o.name), ['p:pc-only']);
});
