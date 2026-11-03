// How the engine reaches the internet (it is the `fetch` every bundled module sees). Google's APIs and
// Anthropic's answer a web page directly. The rest don't (Microsoft's sign-in, calendar and sheet
// links, Notion, Twilio, ntfy), so inside the Android app those go through Android's own network
// stack, as the phone's link to the PC does; in a browser they are tried as they are.
// A request that never got through fails the way Node's fetch does ("fetch failed"), so net.js
// tries it again and words it the same.
'use strict';
const { Buffer } = require('./shims/buffer');

const DIRECT = /(^|\.)(googleapis\.com|anthropic\.com)$/i;
const nativeHttp = () => (globalThis.Capacitor?.isNativePlatform?.() && globalThis.Capacitor?.Plugins?.CapacitorHttp) || null;
const failed = (cause) => Object.assign(new TypeError('fetch failed'), { cause });

function plainHeaders(h) {
  if (!h) return {};
  if (typeof h.forEach === 'function' && !Array.isArray(h) && typeof h.get === 'function') { const o = {}; h.forEach((v, k) => { o[k] = v; }); return o; }
  return Array.isArray(h) ? Object.fromEntries(h) : { ...h };
}
const headerOf = (headers, name) => Object.entries(headers || {}).find(([k]) => k.toLowerCase() === name.toLowerCase())?.[1];

function bytesOfNative(data) {
  if (typeof data === 'string') {
    try { return Buffer.from(atob(data.replace(/\s+/g, '')), 'latin1'); } catch { return Buffer.from(data, 'utf8'); } // base64 when asked for bytes
  }
  return Buffer.from(data == null ? '' : JSON.stringify(data), 'utf8');
}

async function viaAndroid(http, url, init, headers) {
  const method = String(init.method || 'GET').toUpperCase();
  let data;
  if (init.body != null) {
    const type = String(headerOf(headers, 'content-type') || '');
    if (/x-www-form-urlencoded/i.test(type)) data = Object.fromEntries(new URLSearchParams(String(init.body)));
    else if (/json/i.test(type)) { try { data = JSON.parse(init.body); } catch { data = init.body; } } else data = init.body;
  }
  let res;
  try {
    res = await http.request({ url, method, headers, data, responseType: 'arraybuffer', connectTimeout: 15000, readTimeout: 45000 });
  } catch (err) {
    throw failed(err);
  }
  const bytes = bytesOfNative(res.data);
  return {
    ok: res.status >= 200 && res.status < 300, status: res.status, url: res.url || url,
    headers: { get: (k) => { const v = headerOf(res.headers, k); return v == null ? null : String(v); } },
    text: async () => bytes.toString('utf8'),
    json: async () => JSON.parse(bytes.toString('utf8')),
    arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length),
  };
}

async function engineFetch(input, init = {}) {
  const url = String(input instanceof URL ? input.href : input?.url || input);
  const headers = plainHeaders(init.headers);
  let host = '';
  try { host = new URL(url).hostname; } catch { /* a bad link: fetch says so */ }
  if (/(^|\.)anthropic\.com$/i.test(host)) headers['anthropic-dangerous-direct-browser-access'] = 'true'; // Claude, straight from this device
  const http = nativeHttp();
  const binaryBody = init.body != null && typeof init.body !== 'string';
  if (http && !DIRECT.test(host) && !binaryBody) return viaAndroid(http, url, init, headers);
  try {
    return await globalThis.fetch(url, { ...init, headers });
  } catch (err) {
    if (err?.name === 'AbortError') throw err;
    throw failed(err);
  }
}

module.exports = { engineFetch };
