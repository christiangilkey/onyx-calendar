// The sync file's lock (cloud.js) with the browser's own Web Crypto, for the phone and the web app.
// It makes and opens exactly what the PCs' Node version does: "ONX1", a 12-byte IV, the 16-byte
// GCM tag, then the gzipped JSON, sealed with AES-256-GCM under a key made from the sync code by
// PBKDF2-SHA256 (310,000 rounds). Each part is asynchronous here, which cloud.js waits for.
'use strict';
const { Buffer } = require('./shims/buffer');

const MAGIC = Buffer.from('ONX1');
const subtle = () => {
  const s = globalThis.crypto?.subtle;
  if (!s) throw new Error('This browser cannot open the sync file (it has no Web Crypto). Use a newer browser.');
  return s;
};
const normCode = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

async function pipe(bytes, stream) {
  const out = new Response(new Blob([bytes]).stream().pipeThrough(stream));
  return Buffer.from(await out.arrayBuffer());
}
const gzip = (bytes) => pipe(bytes, new CompressionStream('gzip'));
async function gunzip(bytes) {
  if (typeof DecompressionStream !== 'undefined') return pipe(bytes, new DecompressionStream('gzip'));
  return require('./shims/zlib').gunzipSync(bytes);
}

/** The key the files are locked with, from the code (base64, as cloud.js keeps it). */
async function keyOf(code) {
  const s = subtle();
  const base = await s.importKey('raw', new TextEncoder().encode(normCode(code)), 'PBKDF2', false, ['deriveBits']);
  const bits = await s.deriveBits({ name: 'PBKDF2', salt: new TextEncoder().encode('onyx-cloud-sync-v1'), iterations: 310000, hash: 'SHA-256' }, base, 256);
  return Buffer.from(bits).toString('base64');
}

const aes = (key, use) => subtle().importKey('raw', Buffer.from(key, 'base64'), 'AES-GCM', false, [use]);

async function seal(obj, key) {
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const packed = await gzip(new TextEncoder().encode(JSON.stringify(obj)));
  const sealed = Buffer.from(await subtle().encrypt({ name: 'AES-GCM', iv, additionalData: MAGIC, tagLength: 128 }, await aes(key, 'encrypt'), packed));
  const data = sealed.subarray(0, sealed.length - 16), tag = sealed.subarray(sealed.length - 16);
  return Buffer.concat([MAGIC, Buffer.from(iv), tag, data]);
}

async function unseal(buf, key) {
  const b = buf instanceof Buffer ? buf : Buffer.from(buf);
  if (!b.subarray(0, 4).equals(MAGIC)) throw new Error('Not an Onyx sync file.');
  const iv = b.subarray(4, 16), tag = b.subarray(16, 32), data = b.subarray(32);
  const open = await subtle().decrypt({ name: 'AES-GCM', iv, additionalData: MAGIC, tagLength: 128 }, await aes(key, 'decrypt'), Buffer.concat([data, tag]));
  return JSON.parse((await gunzip(Buffer.from(open))).toString('utf8'));
}

module.exports = { keyOf, seal, unseal, normCode };
