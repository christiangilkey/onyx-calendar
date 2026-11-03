// A small CommonJS bundler, enough for Onyx's engine (scripts/build-engine.js): every module reached
// from the entry by require('…') goes into one file, each in its own function, run on first require as
// Node would. Packages are found in node_modules (their "exports", else "browser", else "main"); some
// files are swapped for others (`files`), and Node's own modules for stand-ins (`builtins`). Nothing
// to install: plain Node.
'use strict';
const fs = require('fs');
const path = require('path');

const CONDITIONS = ['browser', 'require', 'default'];
const REQUIRE = /\brequire\(\s*(['"])([^'"\n]+)\1\s*\)/g;

function isFile(p) { try { return fs.statSync(p).isFile(); } catch { return false; } }
function asFile(p) {
  for (const c of [p, `${p}.js`, `${p}.json`, path.join(p, 'index.js')]) if (isFile(c)) return c;
  return null;
}
function pick(exp) {
  if (typeof exp === 'string') return exp;
  if (!exp || typeof exp !== 'object') return null;
  for (const c of CONDITIONS) if (c in exp) { const r = pick(exp[c]); if (r) return r; }
  return null;
}

function resolvePackage(spec, from) {
  const parts = spec.split('/');
  const name = spec.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0];
  const sub = spec.slice(name.length); // '' or '/x/y.js'
  for (let d = path.dirname(from); ; d = path.dirname(d)) {
    const dir = path.join(d, 'node_modules', name);
    const pj = path.join(dir, 'package.json');
    if (isFile(pj)) {
      const pkg = JSON.parse(fs.readFileSync(pj, 'utf8'));
      if (sub) {
        const t = pkg.exports && typeof pkg.exports === 'object' ? pick(pkg.exports[`.${sub}`]) : null;
        return asFile(path.join(dir, t || sub));
      }
      let t = pkg.exports ? pick(typeof pkg.exports === 'object' && '.' in pkg.exports ? pkg.exports['.'] : pkg.exports) : null;
      if (!t && typeof pkg.browser === 'string') t = pkg.browser;
      const file = asFile(path.join(dir, t || pkg.main || 'index.js'));
      if (file && pkg.browser && typeof pkg.browser === 'object') {
        const swap = pkg.browser[`./${path.relative(dir, file).replace(/\\/g, '/')}`];
        if (typeof swap === 'string') return asFile(path.join(dir, swap));
      }
      return file;
    }
    if (d === path.dirname(d)) return null;
  }
}

/**
 * bundle({ entry, root, files: { absPath: absPath }, builtins: { name: absPath }, prelude: [absPath...] })
 * → the bundle's text. `prelude` modules run first (in order) and their exports are given to every module
 * as free names: [{ file, names: { Buffer: 'Buffer' } }] → `var Buffer = require(file).Buffer`.
 */
function bundle({ entry, root, files = {}, builtins = {}, globals = [] }) {
  const ids = new Map();
  const mods = [];
  const missing = new Set();

  function resolve(spec, from) {
    if (spec.startsWith('.') || path.isAbsolute(spec)) {
      const f = asFile(path.resolve(path.dirname(from), spec));
      return f && (files[f] || f);
    }
    const bare = spec.replace(/^node:/, '');
    if (builtins[bare]) return builtins[bare];
    if (builtins[spec]) return builtins[spec];
    const f = resolvePackage(spec, from);
    return f && (files[f] || f);
  }

  function add(file) {
    if (ids.has(file)) return ids.get(file);
    const id = mods.length;
    ids.set(file, id);
    const mod = { file, deps: {}, code: '' };
    mods.push(mod);
    const text = fs.readFileSync(file, 'utf8');
    if (file.endsWith('.json')) { mod.code = `module.exports = ${text.trim() || 'null'};`; return id; }
    mod.code = text.replace(/^#!.*/, '');
    for (const m of text.matchAll(REQUIRE)) {
      const spec = m[2];
      if (spec in mod.deps) continue;
      const target = resolve(spec, file);
      if (!target) { missing.add(`${spec} (from ${path.relative(root, file)})`); mod.deps[spec] = -1; continue; }
      mod.deps[spec] = add(target);
    }
    return id;
  }

  const globalIds = globals.map((g) => ({ ...g, id: add(g.file) }));
  const entryId = add(entry);
  const rel = (f) => path.relative(root, f).replace(/\\/g, '/');
  const out = [];
  out.push('/* Onyx engine: built by scripts/build-engine.js from src/main and src/engine. Do not edit. */');
  out.push('(function () {');
  out.push('var global = globalThis;');
  out.push("var process = { env: {}, platform: 'android', versions: {}, argv: [], cwd: function () { return '/'; }, emitWarning: function () {}, nextTick: function (f) { var a = [].slice.call(arguments, 1); queueMicrotask(function () { f.apply(null, a); }); } };");
  out.push('var setImmediate = function (f) { var a = [].slice.call(arguments, 1); return setTimeout(function () { f.apply(null, a); }, 0); };');
  out.push('var clearImmediate = function (t) { clearTimeout(t); };');
  for (const g of globalIds) for (const name of Object.keys(g.names)) out.push(`var ${name};`);
  out.push('var __defs = [');
  mods.forEach((m, i) => {
    out.push(`/* ${i}: ${rel(m.file)} */ [${JSON.stringify(m.deps)}, ${JSON.stringify(rel(m.file))}, function (module, exports, require, __filename, __dirname) {`);
    out.push(m.code);
    out.push('}],');
  });
  out.push('];');
  out.push(`var __cache = [];
function __require(id) {
  if (__cache[id]) return __cache[id].exports;
  var def = __defs[id], module = { exports: {}, id: def[1], loaded: false };
  __cache[id] = module;
  var req = function (spec) {
    var dep = def[0][spec];
    if (dep === undefined || dep < 0) { var e = new Error("Cannot find module '" + spec + "'"); e.code = 'MODULE_NOT_FOUND'; throw e; }
    return __require(dep);
  };
  def[2].call(module.exports, module, module.exports, req, '/' + def[1], '/' + def[1].replace(/\\/[^/]*$/, ''));
  module.loaded = true;
  return module.exports;
}`);
  for (const g of globalIds) for (const [name, key] of Object.entries(g.names)) out.push(`${name} = __require(${g.id})${key ? `.${key}` : ''};`);
  out.push(`__require(${entryId});`);
  out.push('})();');
  return { text: out.join('\n'), modules: mods.map((m) => rel(m.file)), missing: [...missing] };
}

module.exports = { bundle, resolvePackage };
