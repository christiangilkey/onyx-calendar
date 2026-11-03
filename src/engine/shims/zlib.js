// Node's zlib, as far as the engine (src/engine) uses it: unpacking (inflate, RFC 1951), which is how
// an .xlsx sheet's parts are stored (sheet.js), and gunzip. Packing the sync file goes through the
// browser's own CompressionStream instead (src/engine/codec.js).
'use strict';
const { Buffer } = require('./buffer');

const LEN_BASE = [3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258];
const LEN_EXTRA = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0];
const DIST_BASE = [1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577];
const DIST_EXTRA = [0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13];
const CL_ORDER = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15];

/** A canonical Huffman code from code lengths: counts per length, and symbols in code order. */
function huffman(lengths) {
  const counts = new Uint16Array(16);
  for (const l of lengths) counts[l]++;
  counts[0] = 0;
  const offs = new Uint16Array(16);
  for (let i = 1; i < 16; i++) offs[i] = offs[i - 1] + counts[i - 1];
  const symbols = new Uint16Array(lengths.length);
  for (let s = 0; s < lengths.length; s++) if (lengths[s]) symbols[offs[lengths[s]]++] = s;
  return { counts, symbols };
}

let FIXED = null;
function fixed() {
  if (FIXED) return FIXED;
  const l = new Uint8Array(288);
  l.fill(8, 0, 144); l.fill(9, 144, 256); l.fill(7, 256, 280); l.fill(8, 280, 288);
  FIXED = [huffman(l), huffman(new Uint8Array(30).fill(5))];
  return FIXED;
}

function inflateRawSync(input, { maxOutputLength = Infinity } = {}) {
  const src = input instanceof Uint8Array ? input : Buffer.from(input);
  let pos = 0, bitBuf = 0, bitCnt = 0;
  let out = new Uint8Array(Math.max(1024, src.length * 4));
  let len = 0;
  const ensure = (n) => {
    if (len + n > maxOutputLength) throw new RangeError('Unpacked data is larger than allowed.');
    if (len + n <= out.length) return;
    let size = out.length * 2;
    while (size < len + n) size *= 2;
    const next = new Uint8Array(size);
    next.set(out.subarray(0, len));
    out = next;
  };
  const bits = (n) => {
    while (bitCnt < n) {
      if (pos >= src.length) throw new Error('Unexpected end of packed data.');
      bitBuf |= src[pos++] << bitCnt;
      bitCnt += 8;
    }
    const v = bitBuf & ((1 << n) - 1);
    bitBuf >>>= n;
    bitCnt -= n;
    return v;
  };
  const decode = ({ counts, symbols }) => {
    let code = 0, first = 0, index = 0;
    for (let l = 1; l < 16; l++) {
      code |= bits(1);
      const count = counts[l];
      if (code - first < count) return symbols[index + code - first];
      index += count;
      first = (first + count) << 1;
      code <<= 1;
    }
    throw new Error('Bad packed data (no such code).');
  };

  let last = 0;
  while (!last) {
    last = bits(1);
    const type = bits(2);
    if (type === 0) { // stored
      bitBuf = 0; bitCnt = 0;
      if (pos + 4 > src.length) throw new Error('Unexpected end of packed data.');
      const n = src[pos] | (src[pos + 1] << 8);
      pos += 4;
      if (pos + n > src.length) throw new Error('Unexpected end of packed data.');
      ensure(n);
      out.set(src.subarray(pos, pos + n), len);
      len += n; pos += n;
      continue;
    }
    let lit, dist;
    if (type === 1) [lit, dist] = fixed();
    else if (type === 2) {
      const hlit = bits(5) + 257, hdist = bits(5) + 1, hclen = bits(4) + 4;
      const cl = new Uint8Array(19);
      for (let i = 0; i < hclen; i++) cl[CL_ORDER[i]] = bits(3);
      const clCode = huffman(cl);
      const lengths = new Uint8Array(hlit + hdist);
      for (let i = 0; i < hlit + hdist;) {
        const sym = decode(clCode);
        if (sym < 16) { lengths[i++] = sym; continue; }
        let rep, val = 0;
        if (sym === 16) { if (!i) throw new Error('Bad packed data.'); val = lengths[i - 1]; rep = 3 + bits(2); }
        else if (sym === 17) rep = 3 + bits(3);
        else rep = 11 + bits(7);
        if (i + rep > lengths.length) throw new Error('Bad packed data.');
        lengths.fill(val, i, i + rep);
        i += rep;
      }
      lit = huffman(lengths.subarray(0, hlit));
      dist = huffman(lengths.subarray(hlit));
    } else throw new Error('Bad packed data (block type 3).');

    for (;;) {
      const sym = decode(lit);
      if (sym < 256) { ensure(1); out[len++] = sym; continue; }
      if (sym === 256) break;
      const li = sym - 257;
      if (li >= 29) throw new Error('Bad packed data (length).');
      const n = LEN_BASE[li] + bits(LEN_EXTRA[li]);
      const di = decode(dist);
      if (di >= 30) throw new Error('Bad packed data (distance).');
      const back = DIST_BASE[di] + bits(DIST_EXTRA[di]);
      if (back > len) throw new Error('Bad packed data (too far back).');
      ensure(n);
      for (let i = 0; i < n; i++, len++) out[len] = out[len - back];
    }
  }
  return Buffer.from(out.subarray(0, len));
}

/** gzip (RFC 1952): its header skipped, then inflate. */
function gunzipSync(input, opts) {
  const b = input instanceof Uint8Array ? input : Buffer.from(input);
  if (b[0] !== 0x1f || b[1] !== 0x8b || b[2] !== 8) throw new Error('Not gzip data.');
  const flags = b[3];
  let p = 10;
  if (flags & 4) p += 2 + (b[p] | (b[p + 1] << 8));
  if (flags & 8) { while (b[p++]); }
  if (flags & 16) { while (b[p++]); }
  if (flags & 2) p += 2;
  return inflateRawSync(b.subarray(p), opts);
}

/** zlib (RFC 1950): two header bytes, then inflate. */
const inflateSync = (input, opts) => inflateRawSync((input instanceof Uint8Array ? input : Buffer.from(input)).subarray(2), opts);

const onPc = () => { throw new Error('Packing data works on the PC only.'); };

module.exports = { inflateRawSync, gunzipSync, inflateSync, gzipSync: onPc, deflateRawSync: onPc, deflateSync: onPc };
