// A live Excel sheet as a read-only calendar: each row with a title and a date is a block, and a row
// added to the sheet shows up in Onyx on its own. The sheet is either a file on this PC (.xlsx or .csv;
// one in a OneDrive or Google Drive folder stays live as it syncs) or a link: a Google Sheet or a
// OneDrive / SharePoint workbook shared as "Anyone with the link", or a link to an .xlsx or .csv file.
// Workbooks are read here (they are zip files of XML), so no library is needed.

const fs = require('fs');
const os = require('os');
const zlib = require('zlib');
const crypto = require('crypto');
const { sturdyFetch } = require('../net');

const LINK_EVERY_MS = 60000; // a link is read again each minute
const FILE_EVERY_MS = 5000;  // a file: its saved time is looked at every 5 seconds, and it is read when it changes
const MAX_ROWS = 5000;
const MAX_BYTES = 25 * 1024 * 1024;
const DEFAULT_MINUTES = 60;
const DAY = 86400000;

const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const str = (v) => (v == null || typeof v === 'boolean' ? '' : String(v).replace(/\s+/g, ' ').trim());

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

/** The rows of one tab of a workbook (the first one shown, or the one named `tab`): arrays of values. */
function readXlsx(buf, tab) {
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
      else if (type !== 'e' && v != null && v !== '') val = Number(v); // a number, or a date or time Excel keeps as one
      cells[col] = val === '' ? null : val;
    }
    rows[r] = cells;
  }
  return rows;
}

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

/** The rows of a file's bytes: a workbook (it starts PK, being a zip) or a .csv. */
function readRows(buf, tab) {
  if (buf[0] === 0x50 && buf[1] === 0x4b) return readXlsx(buf, tab);
  if (buf[0] === 0xd0 && buf[1] === 0xcf) throw new Error('that is an old .xls workbook: in Excel, save it as .xlsx (File → Save As)');
  return readCsv(buf.toString('utf8'));
}

// ---------------------------------------------------------------- dates, times and lengths

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

/** Excel's day number (1 is 1 January 1900, with its famous 29 February 1900) as a date here. */
const serialDay = (n) => { const d = new Date(1899, 11, 30 + Math.floor(n)); return { y: d.getFullYear(), m: d.getMonth() + 1, d: d.getDate() }; };
const validDay = (y, m, d) => {
  const t = new Date(y, m - 1, d);
  return t.getFullYear() === y && t.getMonth() === m - 1 && t.getDate() === d ? { y, m, d } : null;
};

/** Minutes after midnight, from "9", "9:30", "9am", "9:30 pm", "21:30", "noon"; null when it is no time. */
function parseTime(s, bare = false) {
  s = String(s).trim().toLowerCase().replace(/\./g, (m, i, all) => (/\d\.\d/.test(all.slice(i - 1, i + 2)) ? ':' : ''));
  if (s === 'noon' || s === 'midday') return 720;
  if (s === 'midnight') return 0;
  const m = s.match(/^(\d{1,2})(?::(\d{2}))?(?::\d{2})?\s*(am?|pm?)?$/);
  if (!m || (!m[2] && !m[3] && !bare)) return null;
  let h = +m[1];
  const min = +(m[2] || 0);
  if (m[3]) {
    if (h < 1 || h > 12) return null;
    h = (h % 12) + (m[3][0] === 'p' ? 12 : 0);
  }
  return h < 24 && min < 60 ? h * 60 + min : null;
}

/**
 * A day and/or a time from one cell: { day: {y,m,d}?, min? }, or null. `kind` is 'date' or 'time':
 * what a bare number in that column means (a time column's 9 is 9:00; a date column's is Excel's day).
 */
function parseWhen(v, kind, now = new Date()) {
  if (v == null || typeof v === 'boolean') return null;
  if (typeof v === 'number' && Number.isFinite(v)) {
    if (kind === 'time' && v >= 0 && v < 1) return { min: Math.round(v * 1440) % 1440 };
    if (kind === 'time' && v >= 1 && v <= 24) return { min: Math.round(v * 60) % 1440 };
    if (v < 60) return null;
    const frac = v - Math.floor(v);
    return { day: serialDay(v), ...(frac > 1e-6 ? { min: Math.round(frac * 1440) % 1440 } : {}) };
  }
  const s = String(v).trim();
  if (!s) return null;
  const low = s.toLowerCase();
  const rel = { today: 0, tomorrow: 1, yesterday: -1 }[low];
  if (rel != null) { const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + rel); return { day: { y: d.getFullYear(), m: d.getMonth() + 1, d: d.getDate() } }; }
  const withTime = (day, rest) => {
    if (!day) return null;
    const t = rest ? parseTime(rest.replace(/^(at|@)\s*/i, ''), true) : null;
    return t == null ? { day } : { day, min: t };
  };
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s,]+(.+?))?(?:Z|[+-]\d{2}:?\d{2})?$/i);
  if (m) return withTime(validDay(+m[1], +m[2], +m[3]), m[4]);
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})(?:[T\s,]+(.+))?$/);
  if (m) {
    const y = +m[3] < 100 ? 2000 + +m[3] : +m[3];
    const [mo, d] = +m[1] > 12 ? [+m[2], +m[1]] : [+m[1], +m[2]]; // month first, as in the US, unless it can't be
    return withTime(validDay(y, mo, d), m[4]);
  }
  const t = parseTime(s, kind === 'time');
  if (t != null) return { min: t };
  // Words: "Nov 3, 2026", "Tuesday 3 November 9am", "3 Nov".
  const words = low.replace(/(\d)(st|nd|rd|th)\b/g, '$1').replace(/,/g, ' ');
  const month = MONTHS.findIndex((name) => new RegExp(`\\b${name}`).test(words));
  if (month < 0) return null;
  const nums = [...words.matchAll(/\b(\d{1,4})\b(?!\s*(?::|am|pm|a\b|p\b))/g)].map((x) => +x[1]);
  const year = nums.find((n) => n > 1900) ?? now.getFullYear();
  const day = nums.find((n) => n >= 1 && n <= 31);
  if (!day) return null;
  const time = words.match(/\b(\d{1,2}(?::\d{2})?\s*(?:am?|pm?)|\d{1,2}:\d{2})\b/)?.[1];
  return withTime(validDay(year, month + 1, day), time);
}

/** A length in minutes, from 90, "1:30", "1h30", "90 min", "1.5 hours" (`hours`: the column is in hours). */
function parseMinutes(v, hours = false) {
  let n = null;
  if (typeof v === 'number' && Number.isFinite(v)) n = hours ? v * 60 : v > 0 && v < 1 ? v * 1440 : v;
  else if (v != null && typeof v !== 'boolean') {
    const s = String(v).trim().toLowerCase();
    let m;
    if ((m = s.match(/^(\d+):(\d{2})$/))) n = +m[1] * 60 + +m[2];
    else if (/^\d+(\.\d+)?$/.test(s)) n = hours ? +s * 60 : +s;
    else {
      // "1h30", "2 hours 15 min", "1.5 hours", "45 min": the minutes are what follows the hours.
      const h = s.match(/(\d+(?:\.\d+)?)\s*h(?:ours?|rs?)?/);
      const mm = (h ? s.slice(h.index + h[0].length) : s).match(/(\d+)\s*(?:m(?!o)|$)/);
      if (h || mm) n = (h ? +h[1] * 60 : 0) + (mm ? +mm[1] : 0);
    }
  }
  return n != null && n > 0 ? Math.min(Math.round(n), 14 * 1440) : null;
}

// ---------------------------------------------------------------- rows into blocks

// What a heading means, written without spaces or signs ("Start time" is starttime).
const HEADINGS = [
  ['id', ['id', 'uid', 'key', 'rowid']],
  ['hours', ['hours', 'hrs', 'durationhours', 'durationh', 'lengthhours']],
  ['minutes', ['duration', 'length', 'minutes', 'mins', 'min', 'howlong', 'durationmin', 'durationminutes']],
  ['title', ['title', 'name', 'task', 'event', 'block', 'what', 'subject', 'activity', 'summary', 'item', 'todo']],
  ['date', ['date', 'day', 'when', 'startdate', 'on']],
  ['start', ['start', 'starttime', 'starts', 'from', 'begin', 'begins', 'time', 'at', 'startat']],
  ['end', ['end', 'endtime', 'ends', 'to', 'until', 'finish', 'finishes', 'stop', 'endat', 'enddate']],
  ['notes', ['notes', 'note', 'description', 'details', 'comments', 'comment', 'info']],
  ['location', ['location', 'where', 'place', 'room', 'address', 'venue']],
];
const squash = (s) => str(s).toLowerCase().replace(/[^a-z0-9]/g, '');

function headingsOf(row) {
  const cols = {};
  const names = (row || []).map(squash);
  for (const exact of [true, false]) {
    names.forEach((name, i) => {
      if (!name || Object.values(cols).includes(i)) return;
      const hit = HEADINGS.find(([key, words]) => !(key in cols) && words.some((w) => (exact ? name === w : w.length >= 4 && name.startsWith(w))));
      if (hit) cols[hit[0]] = i;
    });
  }
  return cols;
}

/**
 * The blocks in a sheet's rows. Its headings (in one of the first rows) say which column is what:
 * Title, Date, Start, End, Duration or Hours, Notes, Location and ID, under any of their usual names;
 * with no headings, the columns are Title, Date, Start, End, Notes. Returns { items, skipped }.
 */
function toItems(rows, now = new Date()) {
  let head = -1, cols = null;
  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    const c = headingsOf(rows[i]);
    if (Object.keys(c).length >= 2 && ('date' in c || 'start' in c)) { head = i; cols = c; break; }
  }
  if (!cols) cols = { title: 0, date: 1, start: 2, end: 3, notes: 4 };
  if (!('title' in cols)) {
    // A sheet with dates but no Title heading: its first column of words is the title.
    const used = new Set(Object.values(cols));
    const sample = rows.slice(head + 1, head + 30).filter(Boolean);
    for (let i = 0; i < 30 && !('title' in cols); i++) if (!used.has(i) && sample.some((r) => typeof r[i] === 'string' && parseWhen(r[i], 'date', now) == null)) cols.title = i;
  }
  const items = [];
  const seen = new Map();
  let skipped = 0;
  for (let i = head + 1; i < rows.length && items.length < MAX_ROWS; i++) {
    const row = rows[i];
    if (!row) continue;
    const cell = (k) => (k in cols ? row[cols[k]] ?? null : null);
    const title = str(cell('title'));
    if (!title) continue; // a blank row
    const d = parseWhen(cell('date'), 'date', now), s = parseWhen(cell('start'), 'time', now), e = parseWhen(cell('end'), 'time', now);
    const day = d?.day || s?.day;
    if (!day) { skipped++; continue; }
    const startMin = s?.min ?? d?.min ?? null;
    const item = { title, allDay: startMin == null, location: str(cell('location')), notes: str(cell('notes')), link: '' };
    if (item.allDay) {
      const first = new Date(day.y, day.m - 1, day.d);
      const lastDay = e?.day ? new Date(e.day.y, e.day.m - 1, e.day.d) : first;
      const last = lastDay < first ? first : lastDay;
      item.start = ymd(first);
      item.end = ymd(new Date(last.getFullYear(), last.getMonth(), last.getDate() + 1));
      item.from = first.getTime();
      item.to = new Date(last.getFullYear(), last.getMonth(), last.getDate() + 1).getTime();
    } else {
      const start = new Date(day.y, day.m - 1, day.d, 0, startMin);
      const length = cols.hours != null ? parseMinutes(cell('hours'), true) : parseMinutes(cell('minutes'));
      let end = null;
      if (e?.min != null) {
        const ed = e.day || day;
        end = new Date(ed.y, ed.m - 1, ed.d, 0, e.min);
        if (!e.day && end <= start) end = new Date(end.getTime() + DAY); // 22:00 to 01:00 runs past midnight
      }
      if (!end || end <= start) end = new Date(start.getTime() + (length || DEFAULT_MINUTES) * 60000);
      item.start = start.toISOString();
      item.end = end.toISOString();
      item.from = start.getTime();
      item.to = end.getTime();
    }
    // The same row keeps the same id while it is the same: by its ID column, or by what it says.
    const id = str(cell('id'));
    const base = id ? `id-${id}` : crypto.createHash('sha1').update(`${title}|${item.start}`).digest('hex').slice(0, 12);
    const n = seen.get(base) || 0;
    seen.set(base, n + 1);
    item.rawId = n ? `${base}-${n}` : base;
    items.push(item);
  }
  return { items, skipped };
}

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

async function read(acct) {
  let buf;
  if (isFile(acct)) {
    const st = fs.statSync(acct.path);
    if (st.size > MAX_BYTES) throw new Error('the sheet is too big to read (over 25 MB)');
    buf = fs.readFileSync(acct.path);
  } else {
    buf = await fetchSheet(acct.url);
  }
  return toItems(readRows(buf, acct.tab));
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
    const { items, skipped } = await read(acct);
    const sig = crypto.createHash('sha1').update(JSON.stringify(items)).digest('hex');
    cache.set(acct.id, { at: Date.now(), mtime, sig, items, skipped, error: null });
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

/** How the sheet was read last, for Settings: { blocks, skipped, at, error }. */
function status(id) {
  const hit = cache.get(id);
  return hit ? { blocks: hit.items?.length || 0, skipped: hit.skipped || 0, at: hit.at, error: hit.error || null } : null;
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

/** Reads a sheet once before it is added, so a wrong link or a sheet with no dates says so straight away. */
async function check(acct) {
  const { items, skipped } = await read(acct);
  // An empty sheet is fine (its rows show up as they are added); rows without a readable date are not.
  if (!items.length && skipped) {
    throw new Error(`none of its ${skipped} rows has a date Onyx can read: give it a Date column (like 11/3/2026) and, for a time, a Start column (like 9:00 AM)`);
  }
  return { blocks: items.length, skipped };
}

module.exports = { events, load, status, start, stop, check, forget: (id) => cache.delete(id), readXlsx, readCsv, readRows, toItems, parseWhen, parseTime, parseMinutes, downloadUrls };
