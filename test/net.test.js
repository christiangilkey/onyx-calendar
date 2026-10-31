// A connection that drops for a moment: a request that can't make anything twice is tried once
// more, and what still fails says so in plain words (and is marked, so the phone keeps its change).
const test = require('node:test');
const assert = require('node:assert/strict');
const net = require('../src/main/net');
const store = require('../src/main/store');
const accounts = require('../src/main/accounts');

net.timing.retryMs = 1;
store.save = () => {};

/** Node's own network failure: TypeError "fetch failed", with what went wrong as its cause. */
const dropped = (...codes) => Object.assign(new TypeError('fetch failed'), {
  cause: codes.length > 1 ? Object.assign(new AggregateError(codes.map((code) => Object.assign(new Error(code), { code }))), {}) : Object.assign(new Error(codes[0]), { code: codes[0] }),
});
const ok = { ok: true, status: 200, json: async () => ({}), text: async () => '{}' };

function fakeFetch(failures) {
  const f = async () => { f.calls++; if (failures.length) throw failures.shift(); return ok; };
  f.calls = 0;
  return f;
}

test('a read that met a dropped connection is tried once more, and goes through', async () => {
  const f = fakeFetch([dropped('ECONNRESET')]);
  assert.equal(await net.sturdyFetch('https://www.googleapis.com/calendar/v3/x', {}, { fetchImpl: f }), ok);
  assert.equal(f.calls, 2);
});

test('a change that may have reached the server is not sent twice; it fails in plain words', async () => {
  const f = fakeFetch([dropped('ECONNRESET')]);
  await assert.rejects(net.sturdyFetch('https://www.googleapis.com/calendar/v3/x', { method: 'POST', body: '{}' }, { fetchImpl: f }), (err) => {
    assert.equal(err.network, true);
    assert.match(err.message, /^Couldn't reach Google from this PC/);
    return true;
  });
  assert.equal(f.calls, 1);
});

test('a change that never left the PC (no connection made, on any address) is tried once more', async () => {
  const f = fakeFetch([dropped('ETIMEDOUT', 'ENETUNREACH')]);
  assert.equal(await net.sturdyFetch('https://tasks.googleapis.com/tasks/v1/x', { method: 'POST', body: '{}' }, { fetchImpl: f }), ok);
  assert.equal(f.calls, 2);
});

test('still down on the second try: one plain error, naming the site', async () => {
  const f = fakeFetch([dropped('ENOTFOUND'), dropped('ENOTFOUND')]);
  await assert.rejects(net.sturdyFetch('https://graph.microsoft.com/v1.0/me', {}, { fetchImpl: f }), (err) => /^Couldn't reach Microsoft from this PC/.test(err.message));
  assert.equal(f.calls, 2);
});

test('anything that is not a network failure is left as it was', async () => {
  const boom = new Error('something else');
  const f = fakeFetch([boom]);
  await assert.rejects(net.sturdyFetch('https://example.com/', {}, { fetchImpl: f }), (err) => err === boom);
  assert.equal(f.calls, 1);
});

test('an account request that cannot get through says which account, and is marked as a network failure', async (t) => {
  const acct = { id: 'gtest', provider: 'google', label: 'me@example.com' };
  store.data.accounts = [acct];
  store.data.secrets = { ...(store.data.secrets || {}), tokens: { gtest: { access: 'a', refresh: 'r', expires: Date.now() + 3600000 } } };
  const real = globalThis.fetch;
  t.after(() => { globalThis.fetch = real; });
  globalThis.fetch = async () => { throw dropped('ECONNREFUSED'); };
  await assert.rejects(accounts.request(acct, 'https://www.googleapis.com/calendar/v3/users/me/calendarList'), (err) => {
    assert.equal(err.network, true);
    assert.match(err.message, /^me@example\.com: Couldn't reach Google from this PC/);
    return true;
  });
});
