// Time chunks: stretches of a day set aside for one category (a tag), like "#Study, weekdays 9–12". They sit
// behind the calendar's blocks and tasks, which fit inside them, and a chunk can be filled with its category's
// open tasks. Kept in Onyx (store.data.timeChunks, synced like boards), never sent to Google or Outlook.
// No DOM in here: the window (app.js), the PC (src/main/time-chunks.js), the phone's engine and the tests use it alike.
//
// A chunk, as kept:
//   { id: 'chunk/…', tag, title, date: 'YYYY-MM-DD' (its first day), start: 'HH:MM', end: 'HH:MM' (or '24:00'),
//     recur: null | { freq: 'daily' | 'weekly' | 'monthly' | 'yearly', days?, dates?, months? } (as a block's Repeat),
//     until: 'YYYY-MM-DD' | null (its last day), skip: ['YYYY-MM-DD', …] (days taken out of one that repeats),
//     color: '#rrggbb' | null (its own; none: its category's), created, updated }
// One day of it (an occurrence): { id: 'chunk/…@YYYY-MM-DD', chunk, day, start: Date, end: Date }.

(() => {
  const MIN = 60000;
  const SHORTEST = 15;             // minutes: a chunk is at least this long
  const DAYS_AT_MOST = 800;        // days looked at in one go (a year's view and some)
  const MAX_SKIP = 400;
  const FALLBACK_MIN = 30;         // a task with no length of its own takes this much of a chunk
  const ID = /^chunk\/[A-Za-z0-9_-]{4,60}$/;
  const YMD = /^\d{4}-\d{2}-\d{2}$/;
  const HM = /^(?:[01]\d|2[0-3]):[0-5]\d$|^24:00$/;
  const FREQS = ['daily', 'weekly', 'monthly', 'yearly'];

  const pad = (n) => String(n).padStart(2, '0');
  const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const fromYmd = (s) => new Date(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10));
  const mins = (t) => +t.slice(0, 2) * 60 + +t.slice(3, 5);
  const hm = (m) => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
  const midnight = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
  const atMin = (day, m) => new Date(day.getFullYear(), day.getMonth(), day.getDate(), 0, m);
  const minuteOf = (d) => d.getHours() * 60 + d.getMinutes();
  const realDay = (s) => YMD.test(String(s)) && ymd(fromYmd(s)) === s;

  /** A Repeat as kept: how often and on which days (as recurField gives it), or null for a single day. */
  function cleanRecur(r, date) {
    if (!r || !FREQS.includes(r.freq)) return null;
    const ints = (list, lo, hi) => [...new Set((Array.isArray(list) ? list : []).map(Number)
      .filter((n) => Number.isInteger(n) && n >= lo && n <= hi))].sort((a, b) => a - b);
    const first = fromYmd(date);
    const out = { freq: r.freq };
    if (r.freq === 'weekly') {
      out.days = ints(r.days, 0, 6);
      if (!out.days.length) out.days = [first.getDay()];
      if (out.days.length === 7) return { freq: 'daily' };
    }
    if (r.freq === 'monthly' || r.freq === 'yearly') {
      out.dates = ints(r.dates, 1, 31);
      if (!out.dates.length) out.dates = [first.getDate()];
    }
    if (r.freq === 'yearly') {
      out.months = ints(r.months, 1, 12);
      if (!out.months.length) out.months = [first.getMonth() + 1];
    }
    return out;
  }

  /** A chunk as kept: only what a chunk has, each part checked. Throws with what is wrong, said plainly. */
  function clean(c, now = new Date()) {
    if (!c || typeof c !== 'object' || !ID.test(String(c.id))) throw new Error('That is not a time chunk.');
    const tag = String(c.tag ?? '').trim().replace(/^#+/, '').replace(/\s+/g, ' ').trim().slice(0, 40);
    if (!tag) throw new Error('A time chunk needs a category.');
    const date = String(c.date || '');
    if (!realDay(date)) throw new Error('A time chunk needs a day.');
    const start = String(c.start || ''), end = String(c.end || '');
    if (!HM.test(start) || start === '24:00' || !HM.test(end)) throw new Error('A time chunk needs a start and an end time.');
    if (mins(end) <= mins(start)) throw new Error('A time chunk has to end after it starts, on the same day.');
    if (mins(end) - mins(start) < SHORTEST) throw new Error(`A time chunk is at least ${SHORTEST} minutes.`);
    const recur = cleanRecur(c.recur, date);
    const until = recur && realDay(c.until) && c.until >= date ? c.until : null;
    const skip = recur ? [...new Set((Array.isArray(c.skip) ? c.skip : []).filter((s) => realDay(s) && s >= date))].sort().slice(-MAX_SKIP) : [];
    const title = String(c.title ?? '').replace(/\s+/g, ' ').trim().slice(0, 80);
    const color = /^#[0-9a-f]{6}$/i.test(String(c.color || '')) ? c.color.toLowerCase() : null;
    const stamp = (v) => (typeof v === 'string' && !Number.isNaN(Date.parse(v)) ? v : null);
    return { id: c.id, tag, title, date, start, end, recur, until, skip, color, created: stamp(c.created) || now.toISOString(), updated: now.toISOString() };
  }

  /** Whether a chunk is on a day (a Date at any time of that day). */
  function occursOn(c, day) {
    const d = ymd(day);
    if (!c || d < c.date || (c.until && d > c.until)) return false;
    if (!c.recur) return d === c.date;
    if ((c.skip || []).includes(d)) return false;
    const r = c.recur;
    if (r.freq === 'daily') return true;
    if (r.freq === 'weekly') return (r.days || []).includes(day.getDay());
    if (r.freq === 'monthly') return (r.dates || []).includes(day.getDate());
    return (r.months || []).includes(day.getMonth() + 1) && (r.dates || []).includes(day.getDate());
  }

  /** Every day of every chunk that falls between two times, earliest first (a longer one first when two start together). */
  function occurrences(chunks, from, to) {
    const lo = +new Date(from), hi = +new Date(to);
    const out = [];
    let n = 0;
    for (let day = midnight(new Date(lo)); +day < hi && n < DAYS_AT_MOST; day = addDays(day, 1), n++) {
      for (const c of chunks || []) {
        if (!occursOn(c, day)) continue;
        const start = atMin(day, mins(c.start)), end = atMin(day, mins(c.end));
        if (+end <= lo || +start >= hi) continue;
        out.push({ id: `${c.id}@${ymd(day)}`, chunk: c, day: ymd(day), start, end });
      }
    }
    return out.sort((a, b) => a.start - b.start || b.end - a.end);
  }

  /** The chunk (one day of it) a time falls in, or null. Of two that share the time, the one inside the other. */
  function chunkAt(chunks, t) {
    const time = new Date(t);
    const day = midnight(time);
    const here = occurrences(chunks, day, addDays(day, 1)).filter((o) => +o.start <= +time && +time < +o.end);
    return here.sort((a, b) => (b.start - a.start) || (a.end - b.end))[0] || null;
  }

  /**
   * A chunk's day and times from a stretch dragged out on the calendar. Across several days it is the same hours on
   * each of them (every day, until the last one); one that runs past midnight stops at midnight.
   */
  function fromDrag(s, e) {
    const a = new Date(s), b = new Date(e);
    const day = midnight(a);
    const endsAtMidnight = +b === +midnight(b);
    const lastDay = endsAtMidnight ? addDays(midnight(b), -1) : midnight(b);
    let start = minuteOf(a);
    let end = endsAtMidnight ? 1440 : minuteOf(b);
    const several = ymd(lastDay) > ymd(day);
    if (several && end <= start) end = 1440; // overnight: its first evening
    else if (!several && !(end > start)) end = 1440;
    if (end - start < SHORTEST) { end = Math.min(1440, start + SHORTEST); start = Math.min(start, end - SHORTEST); }
    return several && end !== 1440
      ? { date: ymd(day), start: hm(start), end: hm(end), recur: { freq: 'daily' }, until: ymd(lastDay) }
      : { date: ymd(day), start: hm(start), end: hm(end), recur: null, until: null };
  }

  /** The stretches of one day of a chunk not taken by anything in `busy` ([{ start, end }]), from `from` on. 5 minutes or more. */
  function freeGaps(occ, busy, from = occ.start) {
    const lo = Math.max(+occ.start, +new Date(from)), hi = +occ.end;
    const spans = (busy || []).map((x) => [Math.max(lo, +new Date(x.start)), Math.min(hi, +new Date(x.end))])
      .filter(([x, y]) => y > x).sort((p, q) => p[0] - q[0]);
    const gaps = [];
    let cur = lo;
    for (const [x, y] of spans) {
      if (x > cur) gaps.push({ start: new Date(cur), end: new Date(x) });
      cur = Math.max(cur, y);
    }
    if (hi > cur) gaps.push({ start: new Date(cur), end: new Date(hi) });
    return gaps.filter((g) => g.end - g.start >= 5 * MIN);
  }

  /** How much of one day of a chunk is planned (minutes taken by `busy`, overlaps counted once), and its length. */
  function planned(occ, busy) {
    const total = Math.round((occ.end - occ.start) / MIN);
    const free = freeGaps(occ, busy).reduce((n, g) => n + (g.end - g.start), 0);
    // freeGaps leaves out slivers under 5 minutes: they count as planned, as nothing more fits there.
    return { total, planned: Math.max(0, total - Math.round(free / MIN)) };
  }

  /** The open tasks a chunk can take: its category, not ticked, not yet given a time; the soonest due first. */
  function candidates(tasks, tag) {
    const want = String(tag || '').toLowerCase();
    return (tasks || [])
      .map((t, i) => ({ t, i }))
      .filter(({ t }) => t && !t.done && !t.mirror && !t.start && (t.tags || []).some((x) => String(x).toLowerCase() === want))
      .sort((p, q) => ((p.t.date || '9999') < (q.t.date || '9999') ? -1 : (p.t.date || '9999') > (q.t.date || '9999') ? 1 : p.i - q.i))
      .map(({ t }) => t);
  }

  /**
   * Fits tasks into one day of a chunk, in order, each into the first free stretch long enough for it (its own
   * length, or half an hour), never before `now` (rounded up to 5 minutes). Returns { placed: [{ id, start, end,
   * minutes }], left: [ids that did not fit] }.
   */
  function fill(occ, tasks, busy, { now = Date.now(), fallback = FALLBACK_MIN } = {}) {
    const step = 5 * MIN;
    const from = Math.max(+occ.start, Math.ceil(+new Date(now) / step) * step);
    const gaps = freeGaps(occ, busy, new Date(from)).map((g) => ({ s: +g.start, e: +g.end }));
    const placed = [], left = [];
    for (const t of tasks || []) {
      const len = Math.max(5, Math.min(12 * 60, Math.round(Number(t.minutes) || fallback))) * MIN;
      const g = gaps.find((x) => x.e - x.s >= len);
      if (!g) { left.push(t.id); continue; }
      placed.push({ id: t.id, start: new Date(g.s), end: new Date(g.s + len), minutes: len / MIN });
      g.s += len;
    }
    return { placed, left };
  }

  /** A new chunk's id, made where the chunk is made (so one made offline keeps it). */
  const newId = () => `chunk/${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

  const api = {
    clean, cleanRecur, occursOn, occurrences, chunkAt, fromDrag, freeGaps, planned, candidates, fill, newId,
    ymd, fromYmd, mins, hm, ID, SHORTEST, FALLBACK_MIN,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else globalThis.OnyxChunks = api;
})();
