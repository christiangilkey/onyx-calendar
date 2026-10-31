// Critical calls stop once one is answered: by a person, not voicemail (Twilio tells which).
const test = require('node:test');
const assert = require('node:assert/strict');
const store = require('../src/main/store');
const caller = require('../src/main/caller');

store.save = () => {};
store.data.settings.calls = { method: 'twilio', twilioSid: 'AC1', twilioFrom: '+15550001', callTo: '+15550002' };
store.data.secrets.twilioToken = 'secret';

/** A Twilio that answers each look with the next of `states`. */
const twilio = (...states) => {
  let i = 0;
  return async () => ({ ok: true, json: async () => states[Math.min(i++, states.length - 1)] });
};
const ask = (...states) => caller.wasAnswered('CA1', { every: 1, upTo: 2000, fetchImpl: twilio(...states) });

test('a person picking up counts as answered, as soon as they do', async () => {
  assert.equal(await ask({ status: 'ringing' }, { status: 'in-progress', answered_by: 'human' }), true);
  assert.equal(await ask({ status: 'completed', answered_by: 'human', duration: '20' }), true);
});

test('voicemail, no answer, busy or a failed call do not count: the next call still comes', async () => {
  assert.equal(await ask({ status: 'in-progress', answered_by: 'machine_start' }), false);
  assert.equal(await ask({ status: 'ringing' }, { status: 'no-answer' }), false);
  assert.equal(await ask({ status: 'busy' }), false);
  assert.equal(await ask({ status: 'failed' }), false);
  assert.equal(await ask({ status: 'completed', duration: '1' }), false, 'hung up at once');
});

test('without Twilio set up there is nothing to ask', async () => {
  const t = store.data.secrets.twilioToken;
  store.data.secrets.twilioToken = '';
  assert.equal(await caller.wasAnswered('CA1', { every: 1, upTo: 50, fetchImpl: twilio({ status: 'completed' }) }), null);
  store.data.secrets.twilioToken = t;
});
