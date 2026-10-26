// Magic add for goals, the planning half: what Claude is asked (a goal, its time frame, a pasted outline and
// the steps already there, broken down as finely as the hammers say), how its answer is read back into
// phases and measurable steps (one-off or repeating), and how each step's sessions are given a time of day
// that is free in the calendar. No network and no Electron in here, so it runs the same on the PC, in the
// tests and in the browser preview.

const REPEATS = ['daily', 'weekdays', 'weekly', 'biweekly', 'monthly'];
const MAX_STEPS = 400;
const PARTS = { morning: [8 * 60, 12 * 60], afternoon: [13 * 60, 17 * 60], evening: [17 * 60, 21 * 60] };
const SLOT = 15; // sessions start on quarter hours
const HORIZON_DAYS = 42; // the calendar is read this far ahead to find each session's time
const PER_STEP_DAYS = 12; // a repeating step's time is chosen to suit its first dozen days

// How finely: what each number of hammers asks for. A goal is bigger than a task, so even one hammer is a plan.
const LEVELS = {
  1: { label: 'Milestones', ask: 'a few big milestones: 4 to 8 one-off steps across the whole time frame, plus 1 or 2 repeating habits that carry it' },
  2: { label: 'Weekly plan', ask: 'a plan by the week: 10 to 25 steps, mostly one-off, with a few weekly or daily habits for the regular work' },
  3: { label: 'Clear steps', ask: 'clear, concrete steps: 25 to 60 in all, one-off steps for each deliverable and repeating habits (daily, weekdays or weekly) for practice and routine' },
  4: { label: 'Detailed', ask: 'a detailed plan: 60 to 120 steps, every session 20 to 60 minutes, with daily habits for anything practised and one-off steps for every piece of work' },
  5: { label: 'Every day', ask: 'a very fine-grained, day-by-day plan: 120 to 250 small steps of 10 to 45 minutes each, so that every day has something small and specific to do; use many repeating habits (often several per phase) and one-off steps for every concrete piece' },
};

const SYSTEM = [
  'You turn someone\'s long-term goal into a plan of actionable, measurable tasks they can put on their calendar. They have ADHD: every task must be something they can start without more planning.',
  'Split the time frame into a few phases (each with its dates and a measurable milestone), then give the tasks.',
  'Every task title starts with a verb and is measurable: it says how much or how many (pages, minutes, reps, words, items, calls), so done is obvious. Under 14 words.',
  'Give each task: "title"; "measure" (one short line: how they know it is done, with a number); "phase" (the phase number, from 1); "repeat" (once, daily, weekdays, weekly, biweekly or monthly; use a repeat for anything that is practised or done regularly instead of listing it again and again); "start" (YYYY-MM-DD: the due date of a one-off task, or the first day of a repeating one); "until" (YYYY-MM-DD, the last day of a repeating task, usually the end of its phase; null for one-off tasks); "minutes" (how long one session takes, a multiple of 5 from 5 to 180); "when" (morning, afternoon, evening or any: when it suits best).',
  'They may paste an outline of what the goal involves and the steps they already have. Use all of it: every part of the outline becomes tasks. Steps they say are already finished (marked [x], ✓, done, finished, completed) are included with "done": true, as one-off tasks dated on or before today. Do not repeat steps listed as already in the plan.',
  'Spread the work realistically over the whole time frame, in a sensible order (foundations first), never before today, and leave room: a few hours a week for a hobby goal, more for a serious one, as the outline suggests.',
  'Write in the same language as the goal. Reply with only JSON: {"phases":[{"name":"","start":"","end":"","milestone":""}],"tasks":[...]}.',
].join(' ');

const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ''));
const parse = (s) => new Date(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10));
const addDays = (s, n) => { const d = parse(s); return ymd(new Date(d.getFullYear(), d.getMonth(), d.getDate() + n)); };
const clampDate = (s, lo, hi) => (s < lo ? lo : s > hi ? hi : s);
const hm = (min) => `${pad(Math.floor(min / 60))}:${pad(min % 60)}`;
const toMin = (s, fallback) => { const m = /^(\d{1,2}):(\d{2})$/.exec(String(s || '')); return m ? Number(m[1]) * 60 + Number(m[2]) : fallback; };

/** What to send Claude: the goal, its dates, today, the outline and the steps the goal already has. */
function userMessage({ title, start, end, today, outline = '', level = 3, existing = [] }) {
  const n = Math.min(5, Math.max(1, Math.round(Number(level) || 3)));
  const have = existing.filter((s) => s && s.title).slice(0, 150)
    .map((s) => `- ${s.done ? '[x] ' : ''}${String(s.title).slice(0, 120)}${s.repeat ? ` (${s.repeat})` : ''}`);
  return [
    `Goal: ${String(title).slice(0, 300)}`,
    `Time frame: ${start} to ${end}. Today is ${today}.`,
    String(outline).trim() ? `Their outline, notes and the steps they have:\n${String(outline).slice(0, 12000)}` : '',
    have.length ? `Already in the plan (do not repeat these):\n${have.join('\n')}` : '',
    `Break it down into ${LEVELS[n].ask}.`,
  ].filter(Boolean).join('\n\n');
}

/** The JSON out of Claude's answer (it may wrap it in a code fence or a sentence). */
function parseAnswer(text) {
  const m = String(text || '').match(/\{[\s\S]*\}/);
  if (!m) return null;
  try { return JSON.parse(m[0]); } catch { return null; }
}

/**
 * Claude's answer as a plan Onyx can trust: phases inside the time frame, steps with a known repeat, a date
 * in range (never before today unless already done), a length on the 5-minute grid and a time of day to
 * aim for. Returns { phases: [{ name, start, end, milestone }], steps: [{ key, title, measure, phase, repeat,
 * due, until, minutes, when, done }] }.
 */
function normalize(answer, { start, end, today }) {
  const from = today > start ? today : start;
  const rawPhases = Array.isArray(answer?.phases) ? answer.phases.slice(0, 12) : [];
  const phases = rawPhases.map((p, i) => {
    const a = clampDate(isDate(p?.start) ? p.start : start, start, end);
    const b = clampDate(isDate(p?.end) ? p.end : end, a, end);
    return { name: String(p?.name || `Phase ${i + 1}`).trim().slice(0, 80), start: a, end: b, milestone: String(p?.milestone || '').trim().slice(0, 200) };
  });
  const rawSteps = Array.isArray(answer?.tasks) ? answer.tasks : Array.isArray(answer?.steps) ? answer.steps : [];
  const seen = new Set();
  const steps = [];
  for (const t of rawSteps) {
    if (steps.length >= MAX_STEPS) break;
    const title = String(t?.title || '').replace(/\s+/g, ' ').trim().slice(0, 200);
    if (!title || seen.has(title.toLowerCase())) continue;
    seen.add(title.toLowerCase());
    const ph = phases[Math.round(Number(t?.phase)) - 1] || null;
    const repeat = REPEATS.includes(t?.repeat) ? t.repeat : null;
    const done = !repeat && !!t?.done;
    const lo = done ? start : ph && ph.start > from ? ph.start : from;
    const hi = ph && ph.end >= lo ? ph.end : end;
    let due = clampDate(isDate(t?.start) ? t.start : lo, lo, hi < lo ? lo : hi);
    if (due > end) due = end;
    let until = null;
    if (repeat) until = clampDate(isDate(t?.until) ? t.until : ph?.end || end, due, end);
    const m = Math.round(Number(t?.minutes) / 5) * 5;
    const minutes = Number.isFinite(m) && m >= 5 ? Math.min(180, m) : null;
    const when = PARTS[t?.when] ? t.when : 'any';
    steps.push({
      key: `k${steps.length + 1}`, title, measure: String(t?.measure || '').replace(/\s+/g, ' ').trim().slice(0, 200),
      phase: ph ? ph.name : '', phaseEnd: hi < lo ? lo : hi, repeat, due, until, minutes, when, done,
    });
  }
  // In the order they are done: phase by phase, its habits first, then by date (the goal's window lists them so).
  const phaseAt = (s) => { const i = phases.findIndex((p) => p.name === s.phase); return i < 0 ? phases.length : i; };
  steps.sort((a, b) => phaseAt(a) - phaseAt(b) || Number(!!b.repeat) - Number(!!a.repeat) || a.due.localeCompare(b.due));
  steps.forEach((s, i) => { s.key = `k${i + 1}`; });
  return { phases, steps };
}

/** The days a step comes up on, from `from` to `until` (inclusive), at most `max` of them. */
function occurrences(rule, from, until, max = PER_STEP_DAYS) {
  if (!rule) return [from];
  const out = [];
  let d = from;
  let months = 0;
  const first = parse(from);
  for (let guard = 0; d <= until && out.length < max && guard < 4000; guard++) {
    const wd = parse(d).getDay();
    if (rule !== 'weekdays' || (wd !== 0 && wd !== 6)) out.push(d);
    if (rule === 'daily' || rule === 'weekdays') d = addDays(d, 1);
    else if (rule === 'weekly') d = addDays(d, 7);
    else if (rule === 'biweekly') d = addDays(d, 14);
    else {
      months += 1;
      const y = first.getFullYear() + Math.floor((first.getMonth() + months) / 12), mo = (first.getMonth() + months) % 12;
      d = ymd(new Date(y, mo, Math.min(first.getDate(), new Date(y, mo + 1, 0).getDate())));
    }
  }
  return out;
}

/** How many times a step comes up in its whole span (for the counts on the screen). */
function timesIn(rule, from, until) {
  return rule ? occurrences(rule, from, until, 2000).length : 1;
}

/**
 * Gives every step that has a length a time of day, free in the calendar on its days: for a one-off step on its
 * date (moved a day or three later, within its phase, if that day is full), for a repeating one at the same time
 * on most of its first days. What is placed counts as busy for the next step, so the plan never clashes with
 * itself. `busy` is [{ start, end }] in ms (the calendar's timed entries); opts { today, dayStart, dayEnd, end }.
 * Steps are changed in place: `time` ("HH:MM") and `clash` (how many of its days are not free at that time).
 */
function fitTimes(steps, busy, { today, dayStart = '08:00', dayEnd = '21:00', end } = {}) {
  const open = toMin(dayStart, 8 * 60), close = toMin(dayEnd, 21 * 60);
  const last = end && end < addDays(today, HORIZON_DAYS) ? end : addDays(today, HORIZON_DAYS);
  const taken = new Map(); // day -> [[startMin, endMin]]
  const take = (day, a, b) => { if (!taken.has(day)) taken.set(day, []); taken.get(day).push([a, b]); };
  for (const b of busy || []) {
    const s = new Date(b.start), e = new Date(b.end);
    if (!(e > s)) continue;
    for (let d = ymd(s); d <= ymd(new Date(e - 1)) && d <= last; d = addDays(d, 1)) {
      const dayStartMs = +parse(d);
      take(d, Math.max(0, Math.round((s - dayStartMs) / 60000)), Math.min(24 * 60, Math.round((e - dayStartMs) / 60000)));
    }
  }
  const clashes = (day, a, b) => (taken.get(day) || []).some(([x, y]) => a < y && b > x);
  const candidates = (when, minutes) => {
    const [pa, pb] = PARTS[when] || [open, close];
    const lo = Math.max(open, pa), hi = Math.min(close, pb);
    const list = [];
    for (let t = Math.ceil(lo / SLOT) * SLOT; t + minutes <= hi; t += SLOT) list.push(t);
    // When its part of the day is too short or full, any time in the day will do (after the part's own).
    for (let t = Math.ceil(open / SLOT) * SLOT; t + minutes <= close; t += SLOT) if (!list.includes(t)) list.push(t);
    return list;
  };
  // The ones that come up most first (they are the hardest to fit), then the long ones.
  const order = steps.filter((s) => s.minutes && !s.done)
    .map((s) => ({ s, days: occurrences(s.repeat, s.due < today ? today : s.due, s.repeat ? (s.until < last ? s.until : last) : s.due) }))
    .sort((a, b) => b.days.length - a.days.length || b.s.minutes - a.s.minutes);
  for (const { s, days: first } of order) {
    let days = first.filter((d) => d <= last);
    if (!days.length) { s.time = null; s.clash = 0; continue; } // beyond what is read of the calendar: its date is enough
    // The time that clashes on the fewest of these days (the first one free on all of them, when there is one).
    const pick = (ds) => {
      let best = null;
      for (const t of candidates(s.when, s.minutes)) {
        const n = ds.filter((d) => clashes(d, t, t + s.minutes)).length;
        if (!best || n < best.n) best = { t, n };
        if (n === 0) break;
      }
      return best;
    };
    let best = pick(days);
    if (best && best.n > 0 && !s.repeat) {
      // A full day: a day or three later instead, while the step's phase and the time frame last.
      for (let k = 1; k <= 3; k++) {
        const d = addDays(days[0], k);
        if (d > last || (s.phaseEnd && d > s.phaseEnd)) break;
        const later = pick([d]);
        if (later && later.n === 0) { s.due = d; days = [d]; best = later; break; }
      }
    }
    if (!best) { s.time = null; s.clash = 0; continue; } // longer than the day's window
    s.time = hm(best.t);
    s.clash = best.n;
    for (const d of days) take(d, best.t, best.t + s.minutes);
  }
  return steps;
}

/** A few numbers for the screen: tasks, habits, one-offs, already done, and the hours a week it asks for. */
function summary(steps, { start, end }) {
  const live = steps.filter((s) => !s.done);
  const weeks = Math.max(1, (parse(end) - parse(start)) / (7 * 86400000));
  const minutes = live.reduce((sum, s) => sum + (s.minutes || 0) * timesIn(s.repeat, s.due, s.until || s.due), 0);
  return {
    tasks: steps.length, habits: live.filter((s) => s.repeat).length, once: live.filter((s) => !s.repeat).length,
    done: steps.length - live.length, sessions: live.reduce((n, s) => n + timesIn(s.repeat, s.due, s.until || s.due), 0),
    hoursPerWeek: Math.round((minutes / 60 / weeks) * 10) / 10,
  };
}

const api = { LEVELS, SYSTEM, REPEATS, MAX_STEPS, userMessage, parseAnswer, normalize, occurrences, timesIn, fitTimes, summary };
if (typeof module !== 'undefined' && module.exports) module.exports = api;
else globalThis.OnyxGoalPlan = api;
