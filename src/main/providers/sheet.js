// A live Excel sheet as a read-only calendar: each row with a title and a date is a block, and a row
// added to the sheet shows up in Onyx on its own. The sheet is either a file on this PC (.xlsx or .csv;
// one in a OneDrive or Google Drive folder stays live as it syncs) or a link: a Google Sheet or a
// OneDrive / SharePoint workbook shared as "Anyone with the link", or a link to an .xlsx or .csv file.
// Workbooks are read here (they are zip files of XML), so no library is needed. How rows become blocks,
// by the headings or by rules of your own, is in sheet-rows.js.

const fs = require('fs');
const os = require('os');
const zlib = require('zlib');
const crypto = require('crypto');
const { sturdyFetch } = require('../net');
const rowsOf = require('./sheet-rows');
const { MAX_ROWS, toItems, parseWhen, parseTime, parseMinutes } = rowsOf;

const LINK_EVERY_MS = 60000; // a link is read again each minute
const FILE_EVERY_MS = 5000;  // a file: its saved time is looked at every 5 seconds, and it is read when it changes
const MAX_BYTES = 25 * 1024 * 1024;

const pad = (n) => String(n).padStart(2, '0');

// ---------------------------------------------------------------- reading an .xlsx (a zip of XML)

function unzip(buf) {
  let end = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { end = i; break; }
  }
  if (end < 0) throw new Error('the file is not a readable .xlsx workbook');
  const entries = new Map();
  let p = buf.readUInt32LE(end + 16);
  for (let n = buf.readUInt16LE(end + 10); n > 0 && p + 46 <= buf.length && buf.readUInt32LE(p) === 0x02014b50; n--) {
    const nameLen = buf.readUInt16LE(p + 28);
    entries.set(buf.toString('utf8', p + 46, p + 46 + nameLen).toLowerCase(), {
      method: buf.readUInt16LE(p + 10), size: buf.readUInt32LE(p + 20), local: buf.readUInt32LE(p + 42),
    });
    p += 46 + nameLen + buf.readUInt16LE(p + 30) + buf.readUInt16LE(p + 32);
  }
  return (name) => {
    const e = entries.get(name.toLowerCase());
    if (!e) return null;
    const at = e.local + 30 + buf.readUInt16LE(e.local + 26) + buf.readUInt16LE(e.local + 28);
    const raw = buf.subarray(at, at + e.size);
    if (e.method === 0) return raw;
    if (e.method === 8) return zlib.inflateRawSync(raw, { maxOutputLength: 200 * 1024 * 1024 });
    throw new Error('the workbook is packed in a way Onyx cannot read: save it again as .xlsx');
  };
}

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
function unxml(s) {
  return String(s)
    .replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e) => {
      if (e[0] !== '#') return ENTITIES[e] ?? m;
      const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : '';
    })
    .replace(/_x([0-9a-f]{4})_/gi, (m, hex) => String.fromCharCode(parseInt(hex, 16)));
}
const noPrefixes = (xml) => xml.replace(/<(\/?)[A-Za-z_][\w.-]*:/g, '<$1'); // <x:row> is <row>
const attr = (s, name) => {
  const m = s.match(new RegExp(`(?:^|\\s)${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`));
  return m ? m[1] ?? m[2] : null;
};
/** The text of a shared or inline string: its runs joined, without the phonetic guide. */
const textOf = (xml) => [...xml.replace(/<rPh\b[\s\S]*?<\/rPh>/g, '').matchAll(/<t\b[^>]*\/>|<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((m) => unxml(m[1] || '')).join('');
const column = (ref) => [...(ref.match(/^[A-Z]+/i)?.[0] || 'A').toUpperCase()].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;

// Excel keeps a date or a time as a number (days since 1900); its number format says which it is. The
// formats Excel has built in, by number: dates, times, both, and lengths of time like [h]:mm.
const BUILT_IN_FORMATS = { 14: 'date', 15: 'date', 16: 'date', 17: 'date', 22: 'datetime', 18: 'time', 19: 'time', 20: 'time', 21: 'time', 45: 'time', 46: 'elapsed', 47: 'time' };
for (let id = 27; id <= 36; id++) BUILT_IN_FORMATS[id] = 'date';
for (let id = 50; id <= 58; id++) BUILT_IN_FORMATS[id] = 'date';
/** What a format of your own shows: 'date', 'time', 'datetime', 'elapsed', or null for a plain number. */
function formatKind(code) {
  const c = String(code || '').split(';')[0].replace(/"[^"]*"/g, '').replace(/\\./g, '').replace(/[_*]./g, '');
  if (/\[h+\]|\[m+\]|\[s+\]/i.test(c)) return 'elapsed';
  const bare = c.replace(/\[[^\]]*\]/g, '');
  const date = /[dy]/i.test(bare) || /m{3,}/i.test(bare) && !/[hs]/i.test(bare);
  const time = /[hs]/i.test(bare) || /am\/pm|a\/p/i.test(bare);
  return date && time ? 'datetime' : date ? 'date' : time ? 'time' : null;
}
/** Each cell style's kind of number (by its index, the s="…" of a cell), from xl/styles.xml. */
function styleKinds(xml) {
  if (!xml) return [];
  const own = {};
  for (const m of xml.matchAll(/<numFmt\b([^>]*?)\/?>/g)) own[attr(m[1], 'numFmtId')] = unxml(attr(m[1], 'formatCode') || '');
  const xfs = xml.match(/<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/)?.[1] || '';
  return [...xfs.matchAll(/<xf\b([^>]*?)\/?>/g)].map((m) => {
    const id = parseInt(attr(m[1], 'numFmtId'), 10) || 0;
    return id in own ? formatKind(own[id]) : BUILT_IN_FORMATS[id] || null;
  });
}
/** A number Excel shows as a date or time, written as it reads: 2026-11-06, 09:30, 2026-11-06 09:30, or 1:30 for a length. */
function asShown(n, kind, base1904) {
  const minutes = Math.round((n - Math.floor(n)) * 1440) % 1440;
  const hm = `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
  if (kind === 'elapsed') { const all = Math.round(n * 1440); return `${Math.floor(all / 60)}:${pad(all % 60)}`; }
  if (n < 1) return kind === 'date' ? n : hm; // a time on its own (a "date" of 0 is no date)
  const d = new Date(1899, 11, 30 + Math.floor(n) + (base1904 ? 1462 : 0));
  const day = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  return kind === 'date' ? day : `${day} ${hm}`; // a date shown without its time (as =NOW() is) is that day, all of it
}

/** One tab of a workbook (the first one shown, or the one named `tab`): { rows, tabs, tab }, its rows arrays of values. */
function readBook(buf, tab) {
  const get = unzip(buf);
  const read = (name) => { const b = get(name); return b ? noPrefixes(b.toString('utf8')) : null; };
  const book = read('xl/workbook.xml');
  if (!book) throw new Error('the file is not an Excel workbook (.xlsx)');
  const targets = {};
  for (const m of (read('xl/_rels/workbook.xml.rels') || '').matchAll(/<Relationship\b([^>]*)>/g)) targets[attr(m[1], 'Id')] = attr(m[1], 'Target');
  const tabs = [...book.matchAll(/<sheet\b([^>]*)>/g)].map((m, i) => ({
    name: unxml(attr(m[1], 'name') || ''), hidden: /hidden/i.test(attr(m[1], 'state') || ''),
    target: targets[attr(m[1], 'r:id') || m[1].match(/\s[\w.-]+:id\s*=\s*"([^"]*)"/)?.[1]] || `worksheets/sheet${i + 1}.xml`,
  }));
  if (!tabs.length) throw new Error('the workbook has no sheets');
  let pick;
  if (tab) {
    pick = tabs.find((t) => t.name.trim().toLowerCase() === String(tab).trim().toLowerCase());
    if (!pick) throw new Error(`the workbook has no tab called "${tab}" (it has ${tabs.map((t) => `"${t.name}"`).join(', ')})`);
  } else {
    pick = tabs.find((t) => !t.hidden) || tabs[0];
  }
  const target = String(pick.target || '');
  const xml = read(target.startsWith('/') ? target.slice(1) : `xl/${target.replace(/^\.\//, '')}`);
  if (!xml) throw new Error(`the tab "${pick.name}" could not be read`);
  const shared = [...(read('xl/sharedStrings.xml') || '').matchAll(/<si\b[^>]*\/>|<si\b[^>]*>([\s\S]*?)<\/si>/g)].map((m) => textOf(m[1] || ''));
  const kinds = styleKinds(read('xl/styles.xml'));
  const base1904 = /<workbookPr\b[^>]*\bdate1904\s*=\s*"(1|true)"/i.test(book);

  const rows = [];
  for (const m of xml.matchAll(/<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g)) {
    const r = (parseInt(attr(m[1], 'r'), 10) || rows.length + 1) - 1;
    if (r > MAX_ROWS + 20) break;
    const cells = [];
    let next = 0;
    for (const c of (m[2] || '').matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const ref = attr(c[1], 'r');
      const col = ref ? column(ref) : next;
      next = col + 1;
      const type = attr(c[1], 't') || 'n';
      const inner = c[2] || '';
      const v = inner.match(/<v\b[^>]*>([\s\S]*?)<\/v>/)?.[1];
      let val = null;
      if (type === 's') val = v != null ? shared[+v] ?? null : null;
      else if (type === 'inlineStr') val = textOf(inner);
      else if (type === 'str' || type === 'd') val = v != null ? unxml(v) : null;
      else if (type === 'b') val = v === '1';
      else if (type !== 'e' && v != null && v !== '') {
        val = Number(v); // a number, or a date or time Excel keeps as one: its style says which
        const kind = kinds[parseInt(attr(c[1], 's'), 10) || 0];
        if (kind && Number.isFinite(val) && val >= 0) val = asShown(val, kind, base1904);
      }
      cells[col] = val === '' ? null : val;
    }
    rows[r] = cells;
  }
  return { rows, tabs: tabs.filter((t) => !t.hidden || t === pick).map((t) => t.name), tab: pick.name };
}
const readXlsx = (buf, tab) => readBook(buf, tab).rows;

/** The rows of a .csv (commas, or semicolons or tabs when the first line has more of those). */
function readCsv(text) {
  text = String(text).replace(/^﻿/, '');
  const first = text.split(/\r?\n/, 1)[0];
  const count = (ch) => first.split(ch).length - 1;
  const sep = count(';') > count(',') ? ';' : count('\t') > count(',') ? '\t' : ',';
  const rows = [];
  let row = [], cell = '', quoted = false, started = false;
  for (let i = 0; i < text.length && rows.length <= MAX_ROWS + 20; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch !== '"') cell += ch;
      else if (text[i + 1] === '"') { cell += '"'; i++; } else quoted = false;
      continue;
    }
    if (ch === '"' && !started) { quoted = true; started = true; continue; }
    if (ch === sep) { row.push(cell); cell = ''; started = false; continue; }
    if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = ''; started = false;
      continue;
    }
    cell += ch;
    if (!/\s/.test(ch)) started = true;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows.map((r) => r.map((c) => (c.trim() === '' ? null : c.trim())));
}

/** A file's bytes as { rows, tabs, tab }: a workbook (it starts PK, being a zip) or a .csv (no tabs). */
function readSheet(buf, tab) {
  if (buf[0] === 0x50 && buf[1] === 0x4b) return readBook(buf, tab);
  if (buf[0] === 0xd0 && buf[1] === 0xcf) throw new Error('that is an old .xls workbook: in Excel, save it as .xlsx (File → Save As)');
  return { rows: readCsv(buf.toString('utf8')), tabs: [], tab: null };
}
const readRows = (buf, tab) => readSheet(buf, tab).rows;

// ---------------------------------------------------------------- where the sheet is

/** The addresses to try for a link, in order: what downloads the sheet itself rather than its web page. */
function downloadUrls(url) {
  const g = url.match(/docs\.google\.com\/spreadsheets\/d\/(e\/)?([\w-]+)/);
  if (g) {
    const gid = url.match(/[#&?]gid=(\d+)/)?.[1];
    const what = gid ? `csv&gid=${gid}` : 'xlsx';
    return [g[1]
      ? `https://docs.google.com/spreadsheets/d/e/${g[2]}/pub?output=${what}` // "Publish to the web"
      : `https://docs.google.com/spreadsheets/d/${g[2]}/export?format=${what}`];
  }
  let host = '';
  try { host = new URL(url).hostname.toLowerCase(); } catch { /* checked when added */ }
  if (/(^|\.)(1drv\.ms|onedrive\.live\.com|sharepoint\.com)$/.test(host)) {
    const out = [];
    if (!host.endsWith('sharepoint.com')) out.push(`https://api.onedrive.com/v1.0/shares/u!${Buffer.from(url).toString('base64url')}/root/content`);
    const direct = new URL(url);
    direct.searchParams.set('download', '1');
    out.push(direct.href);
    return out;
  }
  return [url];
}

const looksLikePage = (buf) => /^\s*(<!doctype html|<html)/i.test(buf.subarray(0, 512).toString('utf8'));

async function fetchSheet(url) {
  let last = null;
  for (const href of downloadUrls(url)) {
    try {
      const res = await sturdyFetch(href, { headers: { 'User-Agent': 'OnyxCalendar' } });
      if (!res.ok) {
        last = new Error([401, 403, 404].includes(res.status)
          ? 'the sheet link needs a sign-in: share the sheet as "Anyone with the link can view"'
          : `the sheet link answered HTTP ${res.status}`);
        continue;
      }
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length > MAX_BYTES) throw new Error('the sheet is too big to read (over 25 MB)');
      if (looksLikePage(buf)) { last = new Error('that link opens a web page, not the sheet: share it as "Anyone with the link can view"'); continue; }
      return buf;
    } catch (err) {
      last = err;
    }
  }
  throw last || new Error('the sheet could not be read');
}

// ---------------------------------------------------------------- the calendar

const cache = new Map(); // account id -> { at, mtime, sig, items, skipped, error }

const isFile = (acct) => !!acct.path;
/** A file chosen on another PC (linked desktops share their accounts) that isn't on this one. */
const elsewhere = (acct) => isFile(acct) && acct.host && acct.host !== os.hostname() && !fs.existsSync(acct.path);

async function bytes(acct) {
  if (!isFile(acct)) return fetchSheet(acct.url);
  const st = fs.statSync(acct.path);
  if (st.size > MAX_BYTES) throw new Error('the sheet is too big to read (over 25 MB)');
  return fs.readFileSync(acct.path);
}

/** The sheet's blocks, by its rules when it has some (sheet-rows.js), else by its headings. */
async function read(acct) {
  return toItems(readRows(await bytes(acct), acct.tab), new Date(), acct.rules || null);
}

/** The sheet's blocks, read again when it changed (a file) or each minute (a link). */
async function load(acct, force = false) {
  if (elsewhere(acct)) return [];
  const hit = cache.get(acct.id);
  let mtime = null;
  if (isFile(acct)) {
    try { mtime = fs.statSync(acct.path).mtimeMs; } catch (err) {
      if (hit?.items) return hit.items;
      throw new Error(`${acct.label}: the sheet ${err.code === 'ENOENT' ? 'is no longer at' : 'could not be opened at'} ${acct.path}`);
    }
    if (hit?.items && hit.mtime === mtime) return hit.items;
  } else if (hit?.items && !force && Date.now() - hit.at < LINK_EVERY_MS) {
    return hit.items;
  }
  try {
    const { items, skipped, left } = await read(acct);
    const sig = crypto.createHash('sha1').update(JSON.stringify(items)).digest('hex');
    cache.set(acct.id, { at: Date.now(), mtime, sig, items, skipped, left, error: null });
    return items;
  } catch (err) {
    // Excel holding the file while it saves, or the wifi dropping: keep showing what was read last.
    if (hit?.items) { hit.error = err.message; hit.at = Date.now(); return hit.items; }
    throw new Error(`${acct.label}: ${err.message}`);
  }
}

async function events(acct, start, end, force) {
  const from = new Date(start).getTime(), to = new Date(end).getTime();
  return (await load(acct, force))
    .filter((it) => it.to > from && it.from < to)
    .map(({ from: _f, to: _t, ...it }) => ({ ...it }));
}

/** How the sheet was read last, for Settings: { blocks, skipped, left, at, error } (left: rows its rules leave out). */
function status(id) {
  const hit = cache.get(id);
  return hit ? { blocks: hit.items?.length || 0, skipped: hit.skipped || 0, left: hit.left || 0, at: hit.at, error: hit.error || null } : null;
}

// ---------------------------------------------------------------- rules of your own

const books = new Map(); // "account id|tab" -> { at, mtime, book }: what the rules editor is looking at

/** The sheet as it is now, for the rules editor: a file read again once it is saved, a link at most each 20 seconds. */
async function bookOf(acct, tab) {
  if (elsewhere(acct)) throw new Error(`${acct.label} is a file on another PC (${acct.host}): change its rules there`);
  const key = `${acct.id}|${tab || ''}`;
  const hit = books.get(key);
  let mtime = null;
  if (isFile(acct)) {
    try { mtime = fs.statSync(acct.path).mtimeMs; } catch { throw new Error(`the sheet is no longer at ${acct.path}`); }
    if (hit && hit.mtime === mtime) return hit.book;
  } else if (hit && Date.now() - hit.at < 20000) {
    return hit.book;
  }
  const book = readSheet(await bytes(acct), tab);
  books.delete(key);
  books.set(key, { at: Date.now(), mtime, book });
  if (books.size > 12) books.delete(books.keys().next().value);
  return book;
}

/**
 * What the rules editor opens with: the sheet's tabs, its rules (or Onyx's own reading of it, written as
 * rules), and the preview of its rows. A `tab` other than its own starts from Onyx's reading of that tab.
 */
async function peek(acct, tab) {
  const own = tab === undefined;
  const book = await bookOf(acct, own ? acct.tab : tab);
  const suggested = rowsOf.suggest(book.rows);
  const rules = own && acct.rules ? acct.rules : suggested;
  return { label: acct.label, tabs: book.tabs, tab: book.tab, saved: !!acct.rules, suggested, ...rowsOf.preview(book.rows, rules) };
}

/** What `rules` would make of the sheet (and of `tab`, if given), without keeping them. */
async function preview(acct, { tab, rules } = {}) {
  const book = await bookOf(acct, tab === undefined ? acct.tab : tab);
  return rowsOf.preview(book.rows, rules);
}

/** Keeps a sheet's rules (null: back to reading it by its headings) and its tab; it is read again with them. */
function setRules(acct, { tab, rules } = {}) {
  if (tab !== undefined) {
    if (tab) acct.tab = String(tab).slice(0, 120);
    else delete acct.tab;
  }
  const r = rules == null ? null : rowsOf.clean(rules);
  if (r) acct.rules = r;
  else delete acct.rules;
  forget(acct.id);
  return acct;
}
function forget(id) {
  cache.delete(id);
  for (const key of books.keys()) if (key.startsWith(`${id}|`)) books.delete(key);
}

/**
 * Keeps every sheet live: a file is read again soon after it is saved, a link each minute.
 * `changed(acct)` is told when a sheet's blocks changed, so the calendar can show them.
 */
let timer = null;
function start(accountsOf, changed, every = FILE_EVERY_MS) {
  clearInterval(timer);
  let busy = false;
  let lastLinks = 0;
  timer = setInterval(async () => {
    if (busy) return;
    busy = true;
    try {
      const links = Date.now() - lastLinks >= LINK_EVERY_MS;
      if (links) lastLinks = Date.now();
      for (const acct of accountsOf().filter((a) => a.provider === 'sheet')) {
        if (!isFile(acct) && !links) continue;
        const before = cache.get(acct.id)?.sig;
        try { await load(acct, !isFile(acct)); } catch { continue; }
        const after = cache.get(acct.id)?.sig;
        if (before && after && before !== after) changed(acct);
      }
    } finally {
      busy = false;
    }
  }, every);
  timer.unref?.();
}
const stop = () => { clearInterval(timer); timer = null; };

/**
 * Reads a sheet once before it is added, so a wrong link says so straight away. A sheet whose dates Onyx
 * can't find on its own is added all the same: its rules (opened next) say where they are.
 */
async function check(acct) {
  const { items, skipped } = await read(acct);
  return { blocks: items.length, skipped };
}

module.exports = {
  events, load, status, start, stop, check, forget, peek, preview, setRules,
  readXlsx, readBook, readCsv, readRows, readSheet, formatKind, toItems, parseWhen, parseTime, parseMinutes, downloadUrls,
};
