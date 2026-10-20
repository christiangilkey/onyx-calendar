// Magic add, the planning half: tasks with a length, a place and a best time of day go in
// the free stretches of a day, in an order that makes them flow (errands grouped, travel
// counted, focus work in the morning, calls in office hours). No network and no Electron in
// here, so it runs the same on the PC, in the tests and in the browser preview.
//
// Times are milliseconds since the epoch, in the local day the plan is for.

const GRID = 5 * 60000;        // blocks start and end on 5-minute marks
const BREAK = 5 * 60000;       // a breather between two tasks in the same place
const DEFAULT_TRAVEL = 15;     // minutes between two named places nobody gave a time for
const MAX_MINUTES = 240;

const PARTS = { morning: [8, 12], midday: [11, 14], afternoon: [13, 17], evening: [17, 21] };
// What each kind of thing is usually best at, when nobody said (the estimate's "when" is "any").
const KIND_PART = { focus: [9, 12], call: [9, 17], errand: [10, 17] };
const KINDS = ['focus', 'errand', 'call', 'chore', 'exercise', 'meal', 'admin', 'other'];

const validPart = (p) => (Array.isArray(p) && Number.isInteger(p[0]) && Number.isInteger(p[1]) && p[0] >= 0 && p[1] <= 24 && p[1] - p[0] >= 1 ? [p[0], p[1]] : null);
const ceilTo = (ms, unit) => Math.ceil(ms / unit) * unit;
const placeKey = (p) => String(p || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const clock = (hm, day) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hm || ''));
  if (!m) return null;
  const d = new Date(day);
  d.setHours(Number(m[1]), Number(m[2]), 0, 0);
  return d.getTime();
};

// ---------------------------------------------------------------- reading a to-do list

/** What a free-text line is probably about: [pattern, { minutes, kind, place, when }]. First match wins. */
const GUESSES = [
  [/\b(call|phone|ring|dial|voicemail)\b/i, { minutes: 15, kind: 'call', place: null }],
  [/\b(e-?mails?|inbox|reply|replies|respond)\b/i, { minutes: 20, kind: 'admin', place: null }],
  [/\b(gym|swim|pool|lift|weights)\b/i, { minutes: 60, kind: 'exercise', place: 'Gym' }],
  [/\b(workout|exercise|run|jog|yoga|stretch|walk the dog|bike)\b/i, { minutes: 45, kind: 'exercise', place: null }],
  [/\b(grocer(y|ies)|supermarket|food shopping)\b/i, { minutes: 45, kind: 'errand', place: 'Grocery store' }],
  [/\b(pharmacy|prescription|chemist)\b/i, { minutes: 15, kind: 'errand', place: 'Pharmacy' }],
  [/\b(bank|atm|deposit)\b/i, { minutes: 20, kind: 'errand', place: 'Bank' }],
  [/\b(post office|parcel|package|ship|mail (a|the|my))\b/i, { minutes: 20, kind: 'errand', place: 'Post office' }],
  [/\b(dentist|doctor|dr\.|clinic|checkup|physio|therapist)\b/i, { minutes: 60, kind: 'errand', place: 'Clinic' }],
  [/\b(haircut|barber|salon)\b/i, { minutes: 45, kind: 'errand', place: 'Salon' }],
  [/\b(car wash|gas|petrol|fuel|oil change|mechanic)\b/i, { minutes: 25, kind: 'errand', place: 'Garage' }],
  [/\b(laundry|dishes|clean|tidy|vacuum|mop|cook|meal prep|trash|bins?)\b/i, { minutes: 30, kind: 'chore', place: 'Home' }],
  [/\b(breakfast|brunch)\b/i, { minutes: 30, kind: 'meal', place: null, when: 'morning' }],
  [/\blunch\b/i, { minutes: 30, kind: 'meal', place: null, when: 'midday' }],
  [/\b(dinner|supper)\b/i, { minutes: 45, kind: 'meal', place: null, when: 'evening' }],
  [/\b(snack|smoothie|shake)\b/i, { minutes: 10, kind: 'meal', place: null }],
  [/\b(bed ?time|go to bed|sleep|wind[- ]down|lights out|skincare)\b/i, { minutes: 20, kind: 'chore', place: 'Home', when: 'evening' }],
  [/\b(study|read|write|essay|report|draft|code|coding|homework|research|plan|design|practice|learn|revise|review|prepare|prep)\b/i, { minutes: 60, kind: 'focus', place: 'Home' }],
  [/\b(pick ?up|buy|get|return|drop ?off|collect|shop|errand)\b/i, { minutes: 30, kind: 'errand', place: 'Errands' }],
];

/** "30 min", "1h", "1.5 hours", "1h30" in a line: the minutes, and the line without it. */
function takeDuration(line) {
  let minutes = null, rest = line;
  // In words: "an hour and a half", "half an hour", "a couple of hours", "an hour".
  const words = [[/\b(?:an?|one) hour and a half\b/i, 90], [/\b(?:half an hour|half hour|30 mins?)\b/i, 30], [/\ba couple of hours\b|\btwo hours\b/i, 120],
    [/\bthree hours\b/i, 180], [/\b(?:an|one) hour\b/i, 60], [/\ba quarter of an hour\b|\bquarter hour\b/i, 15], [/\ba few minutes\b|\ba minute or two\b/i, 10]];
  for (const [re, n] of words) {
    const m = re.exec(rest);
    if (m) return { minutes: n, rest: rest.replace(m[0], ' ').replace(/\b(?:for|about|around|roughly)\s*$/i, ' ') };
  }
  const hm = /\b(\d+)\s*h(?:ours?|rs?)?\s*(\d{1,2})\s*(?:m(?:in(?:ute)?s?)?)?\b/i.exec(rest);
  if (hm) { minutes = Number(hm[1]) * 60 + Number(hm[2]); rest = rest.replace(hm[0], ' '); }
  else {
    const h = /\b(\d+(?:[.,]\d+)?)\s*(?:h|hr|hrs|hours?)\b/i.exec(rest);
    if (h) { minutes = Math.round(parseFloat(h[1].replace(',', '.')) * 60); rest = rest.replace(h[0], ' '); }
    else {
      const m = /\b(\d+)\s*(?:m|min|mins|minutes?)\b/i.exec(rest);
      if (m) { minutes = Number(m[1]); rest = rest.replace(m[0], ' '); }
    }
  }
  return { minutes, rest };
}

/** "by 5pm", "before 17:30", "after 3": a time of day as "HH:MM" (a bare small number means the afternoon). */
function timeOfDay(h, m, ap) {
  let hh = Number(h);
  const mm = Number(m || 0);
  if (ap) { ap = ap.toLowerCase(); if (ap === 'pm' && hh < 12) hh += 12; if (ap === 'am' && hh === 12) hh = 0; }
  else if (hh >= 1 && hh <= 6) hh += 12; // "by 5" is five in the evening
  if (hh > 23 || mm > 59) return null;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

function takeLimit(line, words) {
  const re = new RegExp(`\\b(?:${words})\\s+(\\d{1,2})(?::(\\d{2}))?\\s*(am|pm)?\\b`, 'i');
  const m = re.exec(line);
  if (!m) return { at: null, rest: line };
  const at = timeOfDay(m[1], m[2], m[3]);
  return at ? { at, rest: line.replace(m[0], ' ') } : { at: null, rest: line };
}

/** One task from one line: the length, limits and time of day it says, and a guess from its words for the rest. */
function readLine(raw) {
  let line = String(raw || '').replace(/^\s*(?:\d+[.)]|[-*•])\s*/, '');
  const dur = takeDuration(line); line = dur.rest;
  const by = takeLimit(line, 'by|before'); line = by.rest;
  const after = takeLimit(line, 'after|from'); line = after.rest;
  let when = null;
  const day = /\b(in the |this )?(morning|afternoon|evening)\b|\btonight\b/i.exec(line);
  if (day) { when = /tonight/i.test(day[0]) ? 'evening' : day[2].toLowerCase(); line = line.replace(day[0], ' '); }
  const title = line.replace(/[()]/g, ' ').replace(/\s{2,}/g, ' ').replace(/\s+([,.])/g, '$1').trim().replace(/^[\s,.-]+|[\s,.-]+$/g, '');
  const guess = (GUESSES.find(([re]) => re.test(raw)) || [null, { minutes: 30, kind: 'admin', place: null }])[1];
  const minutes = clampMinutes(dur.minutes ?? guess.minutes);
  return {
    title: (title || String(raw).trim()).replace(/^./, (c) => c.toUpperCase()).slice(0, 120), minutes, place: guess.place, when: when || guess.when || 'any',
    kind: guess.kind, before: by.at, after: after.at,
    why: dur.minutes ? 'Length from what you wrote' : '',
  };
}

/**
 * The offline estimate: one task per line (or per ";" or bullet), the length from what it says
 * ("30 min") or a guess from the words, a place and a best time of day from the same words.
 */
function estimateLocal(text) {
  let parts = String(text || '').split(/\r?\n|;|•|(?:^|\s)[-*]\s+/).map((s) => s.trim()).filter(Boolean);
  if (parts.length === 1 && parts[0].includes(',')) parts = parts[0].split(/,\s*(?:and\s+)?/).map((s) => s.trim()).filter(Boolean);
  return parts.slice(0, 30).map(readLine);
}

function clampMinutes(n) {
  const m = Math.round(Number(n) / 5) * 5;
  return Number.isFinite(m) ? Math.min(MAX_MINUTES, Math.max(5, m)) : 30;
}

/** Tasks as the planner needs them, from anything an estimator (Claude or the offline one) produced. */
function normalizeTasks(list) {
  const kinds = new Set(KINDS);
  const hm = (v) => (/^([01]?\d|2[0-3]):[0-5]\d$/.test(String(v || '')) ? String(v).replace(/^(\d):/, '0$1:') : null);
  return (Array.isArray(list) ? list : []).slice(0, 40).map((t) => ({
    title: String(t?.title || '').trim().slice(0, 120),
    minutes: clampMinutes(t?.minutes ?? 30),
    place: t?.place ? String(t.place).trim().slice(0, 80) || null : null,
    when: t?.when in PARTS ? t.when : 'any',
    kind: kinds.has(t?.kind) ? t.kind : 'other',
    after: hm(t?.after), before: hm(t?.before),
    ...(hm(t?.preferred) ? { preferred: hm(t.preferred) } : {}), // the time the sender planned it for: as near to it as fits
    why: String(t?.why || '').trim().slice(0, 160),
    ...(t?.ref ? { ref: String(t.ref).slice(0, 400) } : {}), // the task from another app this stands for
  })).filter((t) => t.title);
}

// ---------------------------------------------------------------- travel

/** A lookup for minutes between two places, from [{ from, to, minutes }]. Same place or an unknown one: 0. */
function travelBetween(table) {
  const known = new Map();
  for (const r of Array.isArray(table) ? table : []) {
    const a = placeKey(r?.from), b = placeKey(r?.to), m = Number(r?.minutes);
    if (a && b && Number.isFinite(m) && m >= 0) { known.set(`${a}|${b}`, m); if (!known.has(`${b}|${a}`)) known.set(`${b}|${a}`, m); }
  }
  return (from, to) => {
    const a = placeKey(from), b = placeKey(to);
    if (!a || !b || a === b) return 0;
    const m = known.get(`${a}|${b}`) ?? DEFAULT_TRAVEL;
    return m <= 0 ? 0 : Math.max(5, ceilTo(m * 60000, GRID) / 60000);
  };
}

// ---------------------------------------------------------------- scheduling

const anchored = (t) => !!(t.preferred || t.after || t.before);

/**
 * The stretch of the day the timed tasks from other apps need ([from, to] in ms), or null: a dinner at
 * 21:30 or a bedtime routine sent by another app widens the window past the chosen hours, for itself only.
 */
function anchorSpan(tasks, day) {
  let lo = Infinity, hi = -Infinity;
  for (const t of Array.isArray(tasks) ? tasks : []) {
    if (!t?.ref || !anchored(t)) continue;
    const span = clampMinutes(t.minutes ?? 30) * 60000;
    const p = clock(t.preferred, day), a = clock(t.after, day), b = clock(t.before, day);
    if (p != null) { lo = Math.min(lo, p); hi = Math.max(hi, p + span); }
    if (a != null) { lo = Math.min(lo, a); hi = Math.max(hi, a + span); }
    if (b != null) { lo = Math.min(lo, b - span); hi = Math.max(hi, b); }
  }
  return lo < hi ? [lo, hi] : null;
}

/** The free stretches of the window between the fixed entries, each knowing where you are before and after it. */
function gapsOf({ busy, from, to, home }) {
  const fixed = busy.filter((b) => b.end > from && b.start < to).map((b) => ({ ...b })).sort((a, b) => a.start - b.start);
  const gaps = [];
  let cursor = from, prevPlace = home || null;
  for (const b of fixed) {
    if (b.start > cursor) gaps.push({ from: cursor, to: b.start, prevPlace, nextPlace: b.place || null, seq: [], layout: null });
    if (b.end > cursor) { cursor = b.end; prevPlace = b.place || prevPlace; }
  }
  if (to > cursor) gaps.push({ from: cursor, to, prevPlace, nextPlace: null, seq: [], layout: null });
  return gaps;
}

// Focus work goes in your own best hours when Hyperfocus has learned them (opts.focusPart, focus.js).
const partOf = (t, ctx) => {
  if (t.preferred) return null; // a time of its own beats a time of day
  if (t.when !== 'any') return PARTS[t.when];
  if (t.kind === 'focus' && ctx?.focusPart) return ctx.focusPart;
  return KIND_PART[t.kind] || null;
};

/**
 * Lays a sequence of tasks into one gap, from the start of it, each after the travel to its place.
 * Returns { ok, cost, items }. A task that likes the afternoon waits for it when the gap has room.
 */
function layoutGap(gap, seq, ctx, delay) {
  const items = [];
  let t = ceilTo(gap.from, GRID), prev = gap.prevPlace, cost = 0;
  for (const task of seq) {
    const tr = ctx.travel(prev, task.place);
    const span = task.minutes * 60000;
    const hardAfter = task.after ? clock(task.after, ctx.day) : null;
    const pinned = anchored(task);
    let start = t;
    if (hardAfter != null) start = Math.max(start, hardAfter - tr * 60000);
    // A window widened for what another app timed (anchorSpan): everything else keeps to the chosen hours.
    if (ctx.core && !pinned) start = Math.max(start, ctx.core.from - tr * 60000);
    const part = partOf(task, ctx);
    const preferred = task.preferred ? clock(task.preferred, ctx.day) : null;
    if (delay && (part || preferred != null)) {
      const wanted = (preferred ?? clock(`${part[0]}:00`, ctx.day)) - tr * 60000;
      if (start < wanted) start = wanted;
    }
    start = ceilTo(start, GRID);
    const taskStart = start + tr * 60000, end = ceilTo(taskStart + span, GRID);
    if (end > gap.to) return { ok: false };
    if (ctx.core && !pinned && end > ctx.core.to) return { ok: false };
    const hardBefore = task.before ? clock(task.before, ctx.day) : null;
    if (hardBefore != null && taskStart + span > hardBefore) return { ok: false };

    cost += tr * 2 + (taskStart - ctx.from) / 60000 * 0.02;
    if (part) {
      const a = clock(`${part[0]}:00`, ctx.day), b = clock(`${part[1]}:00`, ctx.day);
      const out = Math.max(0, a - taskStart) + Math.max(0, taskStart + span - b);
      cost += out / 60000;
    }
    if (preferred != null) cost += Math.abs(taskStart - preferred) / 60000 * 1.5;
    if (ctx.lunch && preferred == null && task.kind !== 'meal') {
      const over = Math.min(taskStart + span, ctx.lunch[1]) - Math.max(taskStart, ctx.lunch[0]);
      if (over > 0) cost += (over / 60000) * 1.5;
    }
    items.push({ task, start, taskStart, end, travel: tr });
    t = end + (tr > 0 ? 0 : BREAK);
    if (task.place) prev = task.place;
  }
  if (items.length && gap.nextPlace) {
    const back = ctx.travel(items.at(-1).task.place || prev, gap.nextPlace);
    if (items.at(-1).end + back * 60000 > gap.to) return { ok: false };
    cost += back * 2;
  }
  return { ok: true, cost, items };
}

function bestLayout(gap, seq, ctx) {
  const waited = layoutGap(gap, seq, ctx, true);
  const packed = layoutGap(gap, seq, ctx, false);
  if (waited.ok && (!packed.ok || waited.cost <= packed.cost + 0.5)) return waited;
  return packed;
}

/**
 * Puts the tasks in the day.
 *  busy:  [{ start, end, place?, title? }] the fixed entries (ms)
 *  tasks: normalized tasks
 *  opts:  { day: Date/ms of the day, from, to (the window, ms), home, travel: [{from,to,minutes}], lunch: bool }
 * Returns { blocks, unplaced }: each block { task, title, start, end, minutes, travel, place }.
 */
function schedule(busy, tasks, opts) {
  const day = new Date(opts.day);
  day.setHours(0, 0, 0, 0);
  const from = ceilTo(opts.from, GRID), to = opts.to;
  const ctx = {
    day: day.getTime(), from, travel: travelBetween(opts.travel),
    lunch: opts.lunch === false ? null : [clock('12:30', day), clock('13:15', day)],
    core: opts.core || null, // the chosen hours, when the window was widened (empty once they are over today)
    focusPart: validPart(opts.focusPart),
  };
  const gaps = gapsOf({ busy, from, to, home: opts.home });
  for (const g of gaps) g.layout = { ok: true, cost: 0, items: [] };
  const longest = gaps.reduce((m, g) => Math.max(m, g.to - g.from), 0);

  // The ones with a hard time first, then the ones with a time of their own, then the long ones: they are the hardest to fit.
  const order = tasks.map((task, i) => ({ task, i }))
    .sort((a, b) => (!!(b.task.before || b.task.after) - !!(a.task.before || a.task.after)) || (!!b.task.preferred - !!a.task.preferred)
      || b.task.minutes - a.task.minutes || a.i - b.i)
    .map((x) => x.task);

  const tryPlace = (task) => {
    let best = null;
    for (const gap of gaps) {
      for (let pos = 0; pos <= gap.seq.length; pos++) {
        const seq = [...gap.seq.slice(0, pos), task, ...gap.seq.slice(pos)];
        const lay = bestLayout(gap, seq, ctx);
        if (!lay.ok) continue;
        const delta = lay.cost - gap.layout.cost;
        if (!best || delta < best.delta - 1e-9) best = { gap, seq, lay, delta };
      }
    }
    if (!best) return false;
    best.gap.seq = best.seq;
    best.gap.layout = best.lay;
    return true;
  };

  const unplaced = [];
  for (const task of order) {
    if (tryPlace(task)) continue;
    // Too long for any one stretch: in two or three sittings, when it is the kind of thing that can be.
    let split = false;
    if (task.minutes >= 60 && task.kind !== 'errand' && task.kind !== 'call') {
      for (const n of [2, 3, 4]) {
        const each = clampMinutes(Math.ceil(task.minutes / n / 5) * 5);
        if (each < 30) break;
        const saved = gaps.map((g) => ({ seq: g.seq, layout: g.layout }));
        const parts = Array.from({ length: n }, (_, k) => ({ ...task, minutes: each, title: `${task.title} (${k + 1}/${n})`, origin: task }));
        if (parts.every(tryPlace)) { split = true; break; }
        gaps.forEach((g, i) => { g.seq = saved[i].seq; g.layout = saved[i].layout; });
      }
    }
    if (!split) {
      unplaced.push({ task, idx: tasks.indexOf(task), reason: task.minutes * 60000 > longest ? 'Longer than any free stretch in the window' : 'No room left in the window' });
    }
  }

  const blocks = gaps.flatMap((g) => g.layout.items).map((it) => ({
    task: it.task, idx: tasks.indexOf(it.task.origin || it.task), part: !!it.task.origin,
    title: it.task.title, start: it.start, end: it.end, minutes: it.task.minutes, travel: it.travel,
    place: it.task.place, why: it.task.why, kind: it.task.kind, ref: it.task.ref,
  })).sort((a, b) => a.start - b.start);
  return { blocks, unplaced };
}

const api = { estimateLocal, readLine, normalizeTasks, travelBetween, schedule, gapsOf, anchorSpan, clampMinutes, placeKey, PARTS, KINDS };
if (typeof module !== 'undefined' && module.exports) module.exports = api;
else globalThis.OnyxMagicPlan = api;
