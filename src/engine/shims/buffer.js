// Node's Buffer, as far as Onyx's own code uses it, for the engine that runs on the phone and in a
// browser (src/engine). A Uint8Array with Node's text encodings and the few readers sheet.js uses.
'use strict';

const utf8 = new TextEncoder();
const fromUtf8 = new TextDecoder('utf-8');
const HEX = Array.from({ length: 256 }, (_, i) => i.toString(16).padStart(2, '0'));

function toBase64(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
function fromBase64(str) {
  let s = String(str).replace(/[\s=]+/g, '').replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function encode(str, enc = 'utf8') {
  switch (String(enc).toLowerCase()) {
    case 'utf8': case 'utf-8': return utf8.encode(str);
    case 'base64': case 'base64url': return fromBase64(str);
    case 'hex': {
      const out = new Uint8Array(str.length >> 1);
      for (let i = 0; i < out.length; i++) out[i] = parseInt(str.substr(i * 2, 2), 16);
      return out;
    }
    case 'latin1': case 'binary': case 'ascii': {
      const out = new Uint8Array(str.length);
      for (let i = 0; i < str.length; i++) out[i] = str.charCodeAt(i) & 255;
      return out;
    }
    default: throw new TypeError(`Unknown encoding: ${enc}`);
  }
}

class Buffer extends Uint8Array {
  static from(v, enc) {
    if (typeof v === 'string') return Buffer.wrap(encode(v, enc));
    if (v instanceof ArrayBuffer || Object.prototype.toString.call(v) === '[object ArrayBuffer]') return new Buffer(v);
    if (ArrayBuffer.isView(v) || Array.isArray(v)) { const b = new Buffer(v.length); b.set(v); return b; }
    if (v && v.type === 'Buffer' && Array.isArray(v.data)) return Buffer.from(v.data);
    throw new TypeError('Buffer.from: unsupported value');
  }
  static wrap(u8) { return new Buffer(u8.buffer, u8.byteOffset, u8.byteLength); }
  static alloc(n, fill = 0) { const b = new Buffer(n); if (fill) b.fill(typeof fill === 'string' ? fill.charCodeAt(0) : fill); return b; }
  static allocUnsafe(n) { return new Buffer(n); }
  static isBuffer(v) { return v instanceof Buffer; }
  static byteLength(v, enc) { return typeof v === 'string' ? encode(v, enc).length : v.byteLength; }
  static concat(list, total) {
    const size = total ?? list.reduce((n, b) => n + b.length, 0);
    const out = new Buffer(size);
    let at = 0;
    for (const b of list) { if (at >= size) break; out.set(b.subarray(0, size - at), at); at += b.length; }
    return out;
  }
  static compare(a, b) { return a.compare(b); }

  toString(enc = 'utf8', start = 0, end = this.length) {
    const part = start === 0 && end >= this.length ? this : this.subarray(start, end);
    switch (String(enc).toLowerCase()) {
      case 'utf8': case 'utf-8': return fromUtf8.decode(part);
      case 'base64': return toBase64(part);
      case 'base64url': return toBase64(part).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
      case 'hex': { let s = ''; for (const x of part) s += HEX[x]; return s; }
      case 'latin1': case 'binary': case 'ascii': { let s = ''; for (let i = 0; i < part.length; i += 0x8000) s += String.fromCharCode.apply(null, part.subarray(i, i + 0x8000)); return s; }
      default: throw new TypeError(`Unknown encoding: ${enc}`);
    }
  }
  toJSON() { return { type: 'Buffer', data: Array.from(this) }; }
  equals(o) { if (!o || o.length !== this.length) return false; for (let i = 0; i < this.length; i++) if (this[i] !== o[i]) return false; return true; }
  compare(o) {
    const n = Math.min(this.length, o.length);
    for (let i = 0; i < n; i++) if (this[i] !== o[i]) return this[i] < o[i] ? -1 : 1;
    return this.length === o.length ? 0 : this.length < o.length ? -1 : 1;
  }
  write(str, offset = 0, enc = 'utf8') { const b = encode(str, enc); this.set(b.subarray(0, this.length - offset), offset); return Math.min(b.length, this.length - offset); }
  readUInt8(o) { return this[o]; }
  readUInt16LE(o) { return this[o] | (this[o + 1] << 8); }
  readUInt16BE(o) { return (this[o] << 8) | this[o + 1]; }
  readUInt32LE(o) { return (this[o] | (this[o + 1] << 8) | (this[o + 2] << 16)) + this[o + 3] * 0x1000000; }
  readUInt32BE(o) { return this[o] * 0x1000000 + ((this[o + 1] << 16) | (this[o + 2] << 8) | this[o + 3]); }
  readInt32LE(o) { return this[o] | (this[o + 1] << 8) | (this[o + 2] << 16) | (this[o + 3] << 24); }
  writeUInt8(v, o) { this[o] = v; return o + 1; }
  writeUInt16LE(v, o) { this[o] = v; this[o + 1] = v >>> 8; return o + 2; }
  writeUInt32LE(v, o) { this[o] = v; this[o + 1] = v >>> 8; this[o + 2] = v >>> 16; this[o + 3] = v >>> 24; return o + 4; }
  writeUInt32BE(v, o) { this[o] = v >>> 24; this[o + 1] = v >>> 16; this[o + 2] = v >>> 8; this[o + 3] = v; return o + 4; }
}

module.exports = { Buffer };
