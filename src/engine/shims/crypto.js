// Node's crypto, as far as the engine (src/engine) uses it: random bytes and ids from the browser's
// own generator, and SHA-1 / SHA-256 (with HMAC), which Onyx uses for ids and change marks. The
// sync file's lock is opened with the browser's Web Crypto instead (src/engine/codec.js), so the
// ciphers, key agreement and PBKDF2 of Node are not here: linking desktops stays on the PCs.
'use strict';
const { Buffer } = require('./buffer');

const web = globalThis.crypto;

function randomBytes(n) {
  const b = Buffer.alloc(n);
  for (let i = 0; i < n; i += 65536) web.getRandomValues(b.subarray(i, Math.min(n, i + 65536)));
  return b;
}
const randomFillSync = (buf) => { web.getRandomValues(buf); return buf; };
const randomUUID = () => (web.randomUUID ? web.randomUUID() : (() => {
  const b = randomBytes(16);
  b[6] = (b[6] & 15) | 64; b[8] = (b[8] & 63) | 128;
  const h = b.toString('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
})());
const randomInt = (a, b) => { const [lo, hi] = b == null ? [0, a] : [a, b]; return lo + Math.floor((web.getRandomValues(new Uint32Array(1))[0] / 2 ** 32) * (hi - lo)); };

const bytesOf = (data, enc) => (typeof data === 'string' ? Buffer.from(data, enc || 'utf8') : data instanceof Uint8Array ? data : Buffer.from(data));

// ---------------------------------------------------------------- SHA-1 and SHA-256 (FIPS 180-4)
const rotl = (x, n) => (x << n) | (x >>> (32 - n));
const rotr = (x, n) => (x >>> n) | (x << (32 - n));
const K256 = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
  0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

/** The message padded to whole 64-byte blocks, with its length in bits at the end (big-endian). */
function padded(msg) {
  const len = msg.length;
  const total = (((len + 8) >> 6) + 1) << 6;
  const out = new Uint8Array(total);
  out.set(msg);
  out[len] = 0x80;
  const bits = len * 8;
  const dv = new DataView(out.buffer);
  dv.setUint32(total - 8, Math.floor(bits / 2 ** 32));
  dv.setUint32(total - 4, bits >>> 0);
  return dv;
}

function sha1(msg) {
  const dv = padded(msg);
  let h0 = 0x67452301, h1 = 0xefcdab89, h2 = 0x98badcfe, h3 = 0x10325476, h4 = 0xc3d2e1f0;
  const w = new Uint32Array(80);
  for (let off = 0; off < dv.byteLength; off += 64) {
    for (let i = 0; i < 16; i++) w[i] = dv.getUint32(off + i * 4);
    for (let i = 16; i < 80; i++) w[i] = rotl(w[i - 3] ^ w[i - 8] ^ w[i - 14] ^ w[i - 16], 1);
    let a = h0, b = h1, c = h2, d = h3, e = h4;
    for (let i = 0; i < 80; i++) {
      const [f, k] = i < 20 ? [(b & c) | (~b & d), 0x5a827999] : i < 40 ? [b ^ c ^ d, 0x6ed9eba1] : i < 60 ? [(b & c) | (b & d) | (c & d), 0x8f1bbcdc] : [b ^ c ^ d, 0xca62c1d6];
      const t = (rotl(a, 5) + f + e + k + w[i]) >>> 0;
      e = d; d = c; c = rotl(b, 30) >>> 0; b = a; a = t;
    }
    h0 = (h0 + a) >>> 0; h1 = (h1 + b) >>> 0; h2 = (h2 + c) >>> 0; h3 = (h3 + d) >>> 0; h4 = (h4 + e) >>> 0;
  }
  const out = Buffer.alloc(20);
  const o = new DataView(out.buffer, out.byteOffset);
  [h0, h1, h2, h3, h4].forEach((h, i) => o.setUint32(i * 4, h));
  return out;
}

function sha256(msg) {
  const dv = padded(msg);
  const h = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
  const w = new Uint32Array(64);
  for (let off = 0; off < dv.byteLength; off += 64) {
    for (let i = 0; i < 16; i++) w[i] = dv.getUint32(off + i * 4);
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, hh] = h;
    for (let i = 0; i < 64; i++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const t1 = (hh + S1 + ch + K256[i] + w[i]) >>> 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + maj) >>> 0;
      hh = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    h[0] += a; h[1] += b; h[2] += c; h[3] += d; h[4] += e; h[5] += f; h[6] += g; h[7] += hh;
  }
  const out = Buffer.alloc(32);
  const o = new DataView(out.buffer, out.byteOffset);
  h.forEach((x, i) => o.setUint32(i * 4, x));
  return out;
}

const HASHES = { sha1: [sha1, 64], sha256: [sha256, 64] };
const hashFn = (alg) => {
  const h = HASHES[String(alg).toLowerCase().replace('-', '')];
  if (!h) throw new Error(`The phone can't make a ${alg} hash.`);
  return h;
};
const finish = (bytes, enc) => (enc ? bytes.toString(enc) : bytes);

function createHash(alg) {
  const [fn] = hashFn(alg);
  const parts = [];
  return {
    update(data, enc) { parts.push(bytesOf(data, enc)); return this; },
    digest(enc) { return finish(fn(Buffer.concat(parts)), enc); },
  };
}

function createHmac(alg, key) {
  const [fn, block] = hashFn(alg);
  let k = bytesOf(key);
  if (k.length > block) k = fn(k);
  const pad = (x) => { const p = Buffer.alloc(block); p.set(k); for (let i = 0; i < block; i++) p[i] ^= x; return p; };
  const parts = [pad(0x36)];
  return {
    update(data, enc) { parts.push(bytesOf(data, enc)); return this; },
    digest(enc) { return finish(fn(Buffer.concat([pad(0x5c), fn(Buffer.concat(parts))])), enc); },
  };
}

function timingSafeEqual(a, b) {
  if (a.length !== b.length) throw new RangeError('Input buffers must have the same byte length');
  let x = 0;
  for (let i = 0; i < a.length; i++) x |= a[i] ^ b[i];
  return x === 0;
}

const onPc = (what) => () => { throw new Error(`${what} works on the PC only.`); };

module.exports = {
  randomBytes, randomFillSync, randomUUID, randomInt, createHash, createHmac, timingSafeEqual,
  getRandomValues: (a) => web.getRandomValues(a), webcrypto: web, subtle: web?.subtle,
  createCipheriv: onPc('Encrypting'), createDecipheriv: onPc('Decrypting'), pbkdf2Sync: onPc('PBKDF2'),
  generateKeyPairSync: onPc('Linking desktops'), diffieHellman: onPc('Linking desktops'), hkdfSync: onPc('Linking desktops'), createPublicKey: onPc('Linking desktops'),
};
