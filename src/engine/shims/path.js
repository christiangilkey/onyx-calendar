// Node's path for the engine: file names in what the PCs share (a sheet's file, a pinned file).
'use strict';
const parts = (p) => String(p).split(/[\\/]+/);
const basename = (p, ext) => { const b = parts(p).filter(Boolean).pop() || ''; return ext && b.endsWith(ext) ? b.slice(0, -ext.length) : b; };
const dirname = (p) => { const a = parts(p); a.pop(); return a.join('/') || '/'; };
const extname = (p) => { const m = /\.[^.\\/]*$/.exec(basename(p)); return m ? m[0] : ''; };
const join = (...a) => a.filter((x) => x !== '').join('/').replace(/\/+/g, '/');
const resolve = (...a) => join(...a);
module.exports = { basename, dirname, extname, join, resolve, sep: '/', normalize: (p) => p, isAbsolute: (p) => /^([\\/]|[a-z]:)/i.test(String(p)) };
