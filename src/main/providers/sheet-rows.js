// A live Excel sheet's rows into blocks (sheet.js reads the sheet itself). On its own, Onyx goes by the
// headings (Title, Date, Start…). With rules of your own (Settings → the sheet → Rules) you say which rows
// count ("Status contains Insert"), which column holds the title, date, times and length, and what to use
// when a cell is empty. Nothing here needs Node, so the demo in a browser (mock.js) runs this same code.
'use strict';

const MAX_ROWS = 5000;
const DEFAULT_MINUTES = 60;
const DAY = 86400000;
const SHOWN = 300; // the rows a preview shows

const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const str = (v) => (v == null || typeof v === 'boolean' ? '' : String(v).replace(/\s+/g, ' ').trim());
/** A cell as it reads, for rules and titles: a tick box is TRUE or FALSE, a number has no float dust. */
const text = (v) => (v == null ? '' : typeof v === 'boolean' ? (v ? 'TRUE' : 'FALSE')
  : typeof v === 'number' ? String(+v.toFixed(6)) : String(v).replace(/\s+/g, ' ').trim());

let sha1 = null;
try {
  const crypto = require('crypto');
  if (crypto?.createHash) sha1 = (s) => crypto.createHash('sha1').update(s).digest('hex');
} catch { /* the browser demo: a plain hash does */ }
function hash(s) {
  if (sha1) return sha1(s).slice(0, 12);
  let a = 0x811c9dc5, b = 0x9e3779b9;
  for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); a = Math.imul(a ^ c, 16777619); b = Math.imul(b ^ c, 2246822507); }
  return ((a >>> 0).toString(16).padStart(8, '0') + (b >>> 0).toString(16).padStart(8, '0')).slice(0, 12);
}

/** A column's letters, as Excel shows them: 0 is A, 26 is AA. */
function letter(i) {
  let s = '';
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}
const fromLetters = (s) => [...String(s).toUpperCase()].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;

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
 * Two times in one cell: "9-10:30am", "9:00 AM - 5:00 PM", "14:00 to 15:30". { start, end } in minutes, or
 * null. One side needs a colon or an am/pm, so "11-06" is not taken for a range. "11-1pm" is 11am to 1pm.
 */
function parseRange(v) {
  if (typeof v !== 'string') return null;
  const m = v.trim().toLowerCase().match(/^(.+?)\s*(?:-|–|—|\bto\b|\buntil\b|\btill\b)\s*(.+)$/);
  if (!m) return null;
  const a = m[1].trim(), b = m[2].trim();
  const marked = (s) => /[:.]|\d\s*[ap]\.?m?\.?$/.test(s);
  if (!marked(a) && !marked(b)) return null;
  const half = (s) => s.match(/\d\s*([ap])\.?m?\.?$/)?.[1];
  const end = parseTime(b, true);
  let start = parseTime(a, true);
  if (end == null || start == null) return null;
  if (!half(a) && half(b) && +a.split(/[:.]/)[0] <= 12) {
    // The am or pm written once, after the end: the start is on the same side of noon, unless that puts it after the end.
    const same = parseTime(`${a}${half(b)}m`, true), other = parseTime(`${a}${half(b) === 'a' ? 'p' : 'a'}m`, true);
    start = same != null && same < end ? same : other != null && other < end ? other : same ?? start;
  }
  return { start, end };
}

/**
 * A day and/or a time from one cell: { day: {y,m,d}?, min? }, or null. `kind` is 'date' or 'time':
 * what a bare number in that column means (a time column's 9 is 9:00; a date column's is Excel's day).
 * `order` is how 11/6 is written: 'mdy' (6 November, as in the US) or 'dmy' (11 June); either way a
 * date that can only be read the other way round (13/6) is read that way.
 */
function parseWhen(v, kind, now = new Date(), order = 'mdy') {
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
  const monthDay = (a, b) => (order === 'dmy' ? (b > 12 ? [a, b] : [b, a]) : (a > 12 ? [b, a] : [a, b]));
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s,]+(.+?))?(?:Z|[+-]\d{2}:?\d{2})?$/i);
  if (m) return withTime(validDay(+m[1], +m[2], +m[3]), m[4]);
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})(?:[T\s,]+(.+))?$/);
  if (m) {
    const y = +m[3] < 100 ? 2000 + +m[3] : +m[3];
    const [mo, d] = monthDay(+m[1], +m[2]);
    return withTime(validDay(y, mo, d), m[4]);
  }
  // 11/6 with no year: this year's.
  m = s.match(/^(\d{1,2})\/(\d{1,2})(?:[T\s,]+(.+))?$/);
  if (m) {
    const [mo, d] = monthDay(+m[1], +m[2]);
    return withTime(validDay(now.getFullYear(), mo, d), m[3]);
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

// ---------------------------------------------------------------- which column is what, on its own

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
  ['location', ['location', 'where', 'place', 'room', 'address', 'venue', 'site']],
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
 * How Onyx reads a sheet with no rules: its headings (in one of the first rows) say which column is what,
 * Title, Date, Start, End, Duration or Hours, Notes, Location and ID, under any of their usual names; with
 * no headings, the columns are Title, Date, Start, End, Notes.
 */
function guess(rows, now) {
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
  const at = (k) => (k in cols ? cols[k] : -1);
  return {
    auto: true, head, date: at('date'), start: at('start'), end: at('end'), id: at('id'),
    title: at('title'), notes: at('notes'), location: at('location'),
    length: 'hours' in cols ? cols.hours : at('minutes'), lengthIn: 'hours' in cols ? 'hours' : 'minutes',
    when: [], match: 'all', time: null, minutes: DEFAULT_MINUTES, noDate: 'skip', order: 'mdy',
  };
}

// ---------------------------------------------------------------- rules of your own

const OPS = ['has', 'lacks', 'is', 'isnt', 'starts', 'ends', 'filled', 'empty', 'more', 'less', 'upcoming', 'past', 'ticked', 'unticked'];
const TICKED = /^(true|yes|y|x|✓|✔|☑|done|1)$/i;
const isTicked = (v) => v === true || TICKED.test(text(v));
const numberOf = (v) => {
  if (typeof v === 'number') return v;
  const m = String(v ?? '').replace(/,/g, '').match(/-?\d+(?:\.\d+)?/);
  return m ? +m[0] : null;
};
// Why a row was left out, said of the condition it failed.
const NOT = {
  has: (v) => `doesn’t contain “${v}”`, lacks: (v) => `contains “${v}”`, is: (v) => `isn’t “${v}”`, isnt: (v) => `is “${v}”`,
  starts: (v) => `doesn’t start with “${v}”`, ends: (v) => `doesn’t end with “${v}”`, filled: () => 'is empty', empty: () => 'isn’t empty',
  more: (v) => `isn’t over ${v}`, less: (v) => `isn’t under ${v}`, upcoming: () => 'isn’t a date from today on', past: () => 'isn’t a date before today',
  ticked: () => 'isn’t ticked', unticked: () => 'is ticked',
};

/** Whether a row meets one condition: { col, op, value }, its words matched without minding capitals. */
function meets(c, row, now, order) {
  const v = c.col >= 0 ? row[c.col] ?? null : null;
  const t = text(v).toLowerCase();
  const want = String(c.value ?? '').trim().toLowerCase();
  switch (c.op) {
    case 'has': return t.includes(want);
    case 'lacks': return !t.includes(want);
    case 'is': return t === want;
    case 'isnt': return t !== want;
    case 'starts': return t.startsWith(want);
    case 'ends': return t.endsWith(want);
    case 'filled': return t !== '';
    case 'empty': return t === '';
    case 'more': case 'less': {
      const a = numberOf(v), b = numberOf(want);
      return a != null && b != null && (c.op === 'more' ? a > b : a < b);
    }
    case 'upcoming': case 'past': {
      const w = parseWhen(v, 'date', now, order);
      if (!w?.day) return false;
      const day = new Date(w.day.y, w.day.m - 1, w.day.d), today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      return c.op === 'upcoming' ? day >= today : day < today;
    }
    case 'ticked': return isTicked(v);
    case 'unticked': return !isTicked(v);
    default: return true;
  }
}

/** The column a {word} in a title means: a heading (without minding capitals or spaces), else letters like B. */
function columnNamed(key, names) {
  const k = squash(key);
  const i = names.findIndex((n) => k && squash(n) === k);
  if (i >= 0) return i;
  return /^[A-Z]{1,3}$/i.test(key.trim()) ? fromLetters(key.trim()) : null;
}

/**
 * A title, notes or place: a column's cell (a number), or your own words with {Heading} or {B} in them, filled
 * from the row: "{Client} at {Room}", "Shift: {B}". Where a cell is empty, the dash or dot left beside it goes too.
 */
function fill(how, row, names, lines = false) {
  if (typeof how === 'number') return how >= 0 ? text(row[how]) : '';
  if (!how) return '';
  let gap = false;
  let out = String(how).replace(/\{([^{}]{1,60})\}/g, (m, key) => {
    const c = columnNamed(key, names);
    const v = c == null ? '' : text(row[c]);
    if (!v) gap = true;
    return v;
  });
  out = lines ? out.replace(/[ \t]+/g, ' ').replace(/ *\n */g, '\n') : out.replace(/\s+/g, ' ');
  if (gap) out = out.replace(/([\s\-–—·|:,/]+)(?=[\s\-–—·|:,/]*$)/, '').replace(/^[\s\-–—·|:,/]+/, '').replace(/([-–—·|:,/])\s*[-–—·|:,/]+/g, '$1');
  return out.trim();
}

/**
 * Rules as they are kept (on the sheet's account), with anything odd put right:
 *   head      the row with the headings (1 is the first; 0: none). The rows below it are read.
 *   when      [{ col, op, value }]: which rows become blocks (none: every row with a date); match 'all' or 'any'
 *   title, notes, location   a column, or words with {Heading} in them
 *   date, start, end, length, id   columns (-1: none); lengthIn 'minutes' or 'hours'
 *   time      when a row has no time: '' (an all-day block) or 'HH:MM'
 *   minutes   when it has no end or length
 *   noDate    when it has no date: 'skip', 'above' (the date of the rows above it) or 'today'
 *   order     how 11/6 is written: 'mdy' or 'dmy'
 */
function clean(r) {
  if (!r || typeof r !== 'object') return null;
  const col = (v) => (Number.isInteger(+v) && v !== '' && v !== null && +v >= 0 && +v < 1000 ? +v : -1);
  const field = (v) => (typeof v === 'string' && !/^\d+$/.test(v) ? v.slice(0, 300) : col(v));
  const time = typeof r.time === 'string' && /^\d{1,2}:\d{2}$/.test(r.time.trim()) && parseTime(r.time, true) != null ? r.time.trim() : '';
  const minutes = parseInt(r.minutes, 10);
  return {
    head: Math.min(Math.max(parseInt(r.head, 10) || 0, 0), 100),
    match: r.match === 'any' ? 'any' : 'all',
    when: (Array.isArray(r.when) ? r.when : []).slice(0, 12)
      .filter((c) => c && OPS.includes(c.op) && col(c.col) >= 0)
      .map((c) => ({ col: col(c.col), op: c.op, value: String(c.value ?? '').slice(0, 120) })),
    title: field(r.title), date: col(r.date), start: col(r.start), end: col(r.end),
    length: col(r.length), lengthIn: r.lengthIn === 'hours' ? 'hours' : 'minutes',
    notes: field(r.notes), location: field(r.location), id: col(r.id),
    time, minutes: Math.min(Math.max(Number.isFinite(minutes) ? minutes : DEFAULT_MINUTES, 5), 1440),
    noDate: r.noDate === 'above' || r.noDate === 'today' ? r.noDate : 'skip',
    order: r.order === 'dmy' ? 'dmy' : 'mdy',
  };
}

/** How rules read a sheet, in the shape guess() gives. */
const planOf = (r) => ({ ...r, auto: false, head: r.head - 1, time: r.time ? parseTime(r.time, true) : null });

/** Onyx's own reading of a sheet, written as rules: where the rules editor starts. */
function suggest(rows, now = new Date()) {
  const p = guess(rows, now);
  return clean({ ...p, head: p.head + 1, time: '' });
}

// ---------------------------------------------------------------- rows into blocks

/**
 * The blocks in a sheet's rows: { items, skipped, left }, where skipped rows have no date (or, by rules, no
 * title) and left ones did not meet the rules. With `trace`, `shown` also says what each of the first rows
 * became, for the rules editor's preview.
 */
function build(rows, p, now, trace = false) {
  const items = [];
  const seen = new Map();
  let skipped = 0, left = 0, read = 0, lastDay = null;
  const names = p.head >= 0 ? (rows[p.head] || []).map(text) : [];
  const shown = trace ? [] : null;
  const cellsOf = (row) => (row || []).slice(0, 60).map((v) => text(v).slice(0, 80));
  const show = (i, row, what) => { if (shown && shown.length < SHOWN) shown.push({ row: i + 1, cells: cellsOf(row), ...what }); };
  const filled = (row) => !!row && row.some((v) => text(v) !== '');
  if (trace) for (let i = 0; i <= p.head && i < rows.length; i++) if (filled(rows[i])) show(i, rows[i], i === p.head ? { head: true } : { above: true });
  const today = { y: now.getFullYear(), m: now.getMonth() + 1, d: now.getDate() };
  const label = (c) => names[c] || `Column ${letter(c)}`;

  for (let i = p.head + 1; i < rows.length && items.length < MAX_ROWS; i++) {
    const row = rows[i];
    if (!filled(row)) continue; // a blank row
    read++;
    const get = (c) => (c >= 0 ? row[c] ?? null : null);
    const d = parseWhen(get(p.date), 'date', now, p.order);
    const startCell = get(p.start);
    const s = parseWhen(startCell, 'time', now, p.order);
    const range = s ? null : parseRange(startCell);
    const e = parseWhen(get(p.end), 'time', now, p.order);
    const own = d?.day || s?.day || null;
    const above = lastDay;
    if (own) lastDay = own;

    if (p.when.length) {
      const fails = p.when.filter((c) => !meets(c, row, now, p.order));
      if (p.match === 'any' ? fails.length === p.when.length : fails.length) {
        left++;
        show(i, row, { out: p.match === 'any' && p.when.length > 1 ? 'None of your conditions match' : `${label(fails[0].col)} ${NOT[fails[0].op](fails[0].value)}` });
        continue;
      }
    }
    const title = p.auto ? str(get(p.title)) : fill(p.title, row, names);
    if (!title) {
      if (p.auto) continue; // read on its own, a row without a title is a blank one
      skipped++;
      show(i, row, { skip: typeof p.title === 'number' && p.title >= 0 ? `No title in ${label(p.title)}` : 'No title' });
      continue;
    }
    // An empty date cell takes the fallback; one with words Onyx can't read ("next week?") is said, not guessed at.
    const said = text(get(p.date));
    let day = own, dayFrom = null;
    if (!day && !said && p.noDate === 'above' && above) { day = above; dayFrom = 'above'; }
    if (!day && !said && p.noDate === 'today') { day = today; dayFrom = 'today'; }
    if (!day) {
      skipped++;
      show(i, row, { skip: p.date < 0 ? 'No date column chosen' : said ? `No date Onyx can read in “${said.slice(0, 40)}”` : `No date in ${label(p.date)}` });
      continue;
    }
    let startMin = s?.min ?? range?.start ?? d?.min ?? null;
    let timeFrom = null;
    if (startMin == null && p.time != null) { startMin = p.time; timeFrom = 'default'; }
    const item = {
      title, allDay: startMin == null,
      location: p.auto ? str(get(p.location)) : fill(p.location, row, names),
      notes: p.auto ? str(get(p.notes)) : fill(p.notes, row, names, true), link: '',
    };
    let lengthFrom = null;
    if (item.allDay) {
      const first = new Date(day.y, day.m - 1, day.d);
      const lastDay2 = e?.day ? new Date(e.day.y, e.day.m - 1, e.day.d) : first;
      const last = lastDay2 < first ? first : lastDay2;
      item.start = ymd(first);
      item.end = ymd(new Date(last.getFullYear(), last.getMonth(), last.getDate() + 1));
      item.from = first.getTime();
      item.to = new Date(last.getFullYear(), last.getMonth(), last.getDate() + 1).getTime();
    } else {
      const start = new Date(day.y, day.m - 1, day.d, 0, startMin);
      const length = parseMinutes(get(p.length), p.lengthIn === 'hours');
      const endMin = e?.min ?? range?.end ?? null;
      let end = null;
      if (endMin != null) {
        const ed = e?.day && e.min != null ? e.day : day;
        end = new Date(ed.y, ed.m - 1, ed.d, 0, endMin);
        if (!(e?.day && e.min != null) && end <= start) end = new Date(end.getTime() + DAY); // 22:00 to 01:00 runs past midnight
      }
      if (!end || end <= start) {
        if (!length) lengthFrom = 'default';
        end = new Date(start.getTime() + (length || p.minutes) * 60000);
      }
      item.start = start.toISOString();
      item.end = end.toISOString();
      item.from = start.getTime();
      item.to = end.getTime();
    }
    // The same row keeps the same id while it is the same: by its ID column, or by what it says.
    const id = str(get(p.id));
    const base = id ? `id-${id}` : hash(`${title}|${item.start}`);
    const n = seen.get(base) || 0;
    seen.set(base, n + 1);
    item.rawId = n ? `${base}-${n}` : base;
    items.push(item);
    show(i, row, { block: { title, start: item.start, end: item.end, allDay: item.allDay, location: item.location, dayFrom, timeFrom, lengthFrom } });
  }
  return { items, skipped, left, read, shown };
}

/** The blocks in a sheet's rows, by `rules` (clean()'s shape), or by its headings when there are none. */
function toItems(rows, now = new Date(), rules = null) {
  const r = clean(rules);
  const { items, skipped, left } = build(rows, r ? planOf(r) : guess(rows, now), now);
  return { items, skipped, left };
}

/** The columns as the rules editor lists them: { i, letter, name } (the name from the headings row). */
function columnsOf(rows, head) {
  let count = 0;
  for (let i = 0; i < Math.min(rows.length, head + 1 + SHOWN); i++) count = Math.max(count, rows[i]?.length || 0);
  const names = head >= 0 ? (rows[head] || []) : [];
  return Array.from({ length: Math.min(Math.max(count, 1), 60) }, (_, i) => ({ i, letter: letter(i), name: text(names[i]).slice(0, 60) }));
}

/** What the rules make of a sheet, for the editor: its columns, each of the first rows and what it became, and the counts. */
function preview(rows, rules, now = new Date()) {
  const r = clean(rules) || suggest(rows, now);
  const p = planOf(r);
  const { items, skipped, left, read, shown } = build(rows, p, now, true);
  return { rules: r, columns: columnsOf(rows, p.head), shown, totals: { blocks: items.length, skipped, left, rows: read } };
}

module.exports = {
  MAX_ROWS, OPS, letter, parseTime, parseRange, parseWhen, parseMinutes, headingsOf, toItems, suggest, clean, preview, fill,
};
