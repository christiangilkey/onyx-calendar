// Requests to Google, Microsoft and the rest of the internet, made sturdier for a connection that
// drops for a moment (the wifi reconnecting, a VPN switching over). A request is tried once more,
// after a short wait, when it failed on the network and trying again can't make anything twice: a
// read, or a change that never left this PC (no connection was made). What still fails says so in
// plain words, marked `network`, so the phone keeps its change for later instead of dropping it.

// The connection was never made, so the server never saw the request.
const NEVER_SENT = new Set([
  'ENOTFOUND', 'EAI_AGAIN', 'ECONNREFUSED', 'ENETUNREACH', 'EHOSTUNREACH', 'ENETDOWN', 'EADDRNOTAVAIL',
  'ETIMEDOUT', 'UND_ERR_CONNECT_TIMEOUT',
]);
const timing = { retryMs: 1500 }; // how long to wait before the second try (tests make it short)

/** Node's fetch says "fetch failed" for every network failure; what went wrong is in its cause. */
const isNetworkError = (err) => err instanceof TypeError && /fetch failed/i.test(err.message || '');

function causeCodes(err) {
  const c = err?.cause;
  if (!c) return [];
  const list = Array.isArray(c.errors) ? c.errors : [c]; // several addresses tried: an AggregateError
  return list.map((e) => e?.code).filter(Boolean);
}

const neverSent = (err) => {
  const codes = causeCodes(err);
  return codes.length > 0 && codes.every((c) => NEVER_SENT.has(c));
};

function siteName(url) {
  let host = '';
  try { host = new URL(url).hostname; } catch { return 'the internet'; }
  if (/(^|\.)(googleapis|google)\.com$/.test(host)) return 'Google';
  if (/(^|\.)(microsoft|microsoftonline|live|office|office365)\.com$/.test(host)) return 'Microsoft';
  if (/(^|\.)notion\.(com|so)$/.test(host)) return 'Notion';
  return host;
}

/** The plain-words error for a network failure (anything else is returned as it was). */
function offlineError(err, url) {
  if (!isNetworkError(err)) return err;
  const out = new Error(`Couldn't reach ${siteName(url)} from this PC (its internet connection dropped). Try again in a moment.`);
  out.network = true;
  out.cause = err;
  return out;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * fetch(), tried once more after a network failure when that is safe: a GET or HEAD, a request
 * marked `retry: true` (sending it twice changes nothing), or one that never left this PC.
 */
async function sturdyFetch(url, opts = {}, { wait = timing.retryMs, fetchImpl = (...a) => fetch(...a) } = {}) {
  const { retry, ...init } = opts;
  const method = String(init.method || 'GET').toUpperCase();
  const safe = retry === true || method === 'GET' || method === 'HEAD';
  try {
    return await fetchImpl(url, init);
  } catch (err) {
    if (!isNetworkError(err) || !(safe || neverSent(err))) throw offlineError(err, url);
    await sleep(wait);
    try {
      return await fetchImpl(url, init);
    } catch (again) {
      throw offlineError(again, url);
    }
  }
}

module.exports = { sturdyFetch, offlineError, isNetworkError, neverSent, siteName, timing };
