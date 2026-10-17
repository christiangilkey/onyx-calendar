// Breakdown (the hammer): the steps read from Claude's answer, and the request it makes.
const test = require('node:test');
const assert = require('node:assert/strict');
const store = require('../src/main/store');
const ai = require('../src/main/ai');

store.save = () => {};

test('steps come from a JSON array, or from lines when Claude answers in prose', () => {
  assert.deepEqual(ai.parseSteps('Here you go:\n["Open the app", "Type the subject"]'), ['Open the app', 'Type the subject']);
  assert.deepEqual(ai.parseSteps('1. Open the app\n2) Type the subject\n- Send it'), ['Open the app', 'Type the subject', 'Send it']);
});

test('a breakdown asks Claude for as many steps as the hammers say, with the user\'s key', async () => {
  await assert.rejects(ai.breakdown('Write the report'), /Claude API key/);
  assert.throws(() => ai.setKey('not-a-key'), /sk-ant-/);
  ai.setKey('sk-ant-test-0123456789abcdefghijkl');
  let sent;
  global.fetch = async (url, opts) => {
    sent = { url, headers: opts.headers, body: JSON.parse(opts.body) };
    return { ok: true, status: 200, json: async () => ({ content: [{ type: 'text', text: '["Open the document", "Write the first line"]' }] }) };
  };
  const steps = await ai.breakdown('Write the report', { level: 5 });
  assert.deepEqual(steps, ['Open the document', 'Write the first line']);
  assert.equal(sent.headers['x-api-key'], 'sk-ant-test-0123456789abcdefghijkl');
  assert.match(sent.body.messages[0].content, /10 to 15 tiny/);
  assert.equal(sent.body.model, 'claude-haiku-5-5');
  ai.setKey('');
});
