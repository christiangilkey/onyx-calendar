// Bugs in Onyx itself are kept with their trace (bugs.js): the PC's own, from any command it runs,
// and the ones the window and the phone send. Failures that are not bugs (the network, a refusal) are not.
const test = require('node:test');
const assert = require('node:assert/strict');
const store = require('../src/main/store');
const mcp = require('../src/main/mcp');
const bugs = require('../src/main/bugs');

store.save = () => {};

test('a slip in a command is kept with its trace; a network failure or a refusal is not', async () => {
  store.data.bugReports = [];
  mcp.setAppApi({
    broken: async () => { const x = undefined; return x.length; },
    offline: async () => { throw new TypeError('fetch failed'); },
    refused: async () => { throw new Error('That event no longer exists.'); },
  });
  const r = await mcp.appCall({ name: 'broken', args: [] });
  assert.equal(r.ok, false);
  assert.match(r.error, /reading 'length'/);
  await mcp.appCall({ name: 'offline', args: [] });
  await mcp.appCall({ name: 'refused', args: [] });
  assert.equal(store.data.bugReports.length, 1);
  const [b] = store.data.bugReports;
  assert.equal(b.where, 'pc');
  assert.equal(b.command, 'broken');
  assert.match(b.stack, /bugs.test.js/);
});

test('bugs sent by the app are kept, trimmed, and only when they are bugs', () => {
  store.data.bugReports = [];
  bugs.fromApp([
    { where: 'phone', message: "Cannot read properties of undefined (reading 'length')", stack: 'x'.repeat(10000), at: '2026-10-21T21:01:00.000Z' },
    { where: 'phone', message: 'That needs your PC, and it is out of reach right now.' },
    'nonsense', null,
  ]);
  assert.equal(store.data.bugReports.length, 1);
  assert.equal(store.data.bugReports[0].where, 'phone');
  assert.equal(store.data.bugReports[0].stack.length, 3000);
  for (let i = 0; i < 100; i++) bugs.fromApp([{ message: 'x is not a function' }]);
  assert.equal(store.data.bugReports.length, 60, 'only the latest are kept');
});
