// Magic add: describe what you need to get done and it lands in the day's free time. Claude
// (with the user's own API key, like Breakdown) estimates each task's length, where it is done,
// the best time of day for it and the travel between the places; magic-plan.js then places them
// around what is already in the calendar. Without a key the estimate is a guess from the words.

const store = require('./store');
const hub = require('./hub');
const plan = require('./magic-plan');

const MODEL = 'claude-sonnet-5-5'; // spatial and time reasoning: worth more than the quickest model
const API = 'https://api.anthropic.com/v1/messages';

const SYSTEM = [
  'You help someone plan one day. They describe things they need to get done; you work out how long each takes and where and when it fits best.',
  'For each task give: "title" (short, keep their words), "minutes" (realistic, door-to-door for the doing itself not the travel, including setup, queues and tidy-up, multiples of 5, between 5 and 240), "place" (a short name of where it is done; reuse the exact place names from their schedule when it is the same place; "Home" for things done at home; null for things done anywhere, like a phone call), "when" (morning, midday, afternoon, evening or any: when it suits best, thinking about energy, opening hours and how people usually do it; focus work is best in the morning, errands when places are open, calls in office hours), "kind" (focus, errand, call, chore, exercise, admin or other), "after" and "before" ("HH:MM" 24-hour, only when they said a time limit; otherwise null) and "why" (one short sentence on the length or timing).',
  'Also give "travel": the minutes of door-to-door travel between every two different places that matter (each pair once): the places of your tasks, the places in their schedule and their home base. Use their way of getting around and their area. If you do not know the area, assume a typical town.',
  'Some tasks arrive from other apps as "[t1] title"; each of those is exactly one task: give it the field "ref" with its tag (t1), and still estimate it like the rest. Tasks the person typed have no ref.',
  'Write in the same language as the task. Reply with only JSON: {"tasks":[...],"travel":[{"from":"","to":"","minutes":0}]}.',
].join(' ');

const keyOf = () => String(store.data.secrets.anthropicKey || '');
const settings = () => ({ home: '', mode: 'drive', start: '08:00', end: '21:00', lunch: true, ...(store.data.settings.magic || {}) });
const info = () => ({ ready: !!keyOf(), model: MODEL, ...settings() });

const pad = (n) => String(n).padStart(2, '0');
const hm = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
const MODES = { drive: 'by car', walk: 'on foot', transit: 'by public transport', bike: 'by bike' };

/** The day's window in ms: the chosen hours, and from now on when the day is today. */
function windowOf(date, opts) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(date || ''));
  const day = m ? new Date(+m[1], +m[2] - 1, +m[3]) : new Date();
  day.setHours(0, 0, 0, 0);
  const at = (t, fallback) => {
    const [h, mi] = /^\d{1,2}:\d{2}$/.test(String(t)) ? String(t).split(':').map(Number) : fallback;
    return new Date(day.getFullYear(), day.getMonth(), day.getDate(), h, mi).getTime();
  };
  let from = at(opts.start, [8, 0]);
  const to = at(opts.end, [21, 0]);
  const now = Date.now();
  if (now > from && now < day.getTime() + 86400000) from = Math.max(from, now + 5 * 60000); // not in the past
  if (to <= from) throw new Error(from > at(opts.start, [8, 0]) ? 'The day is over: pick tomorrow.' : 'The day needs to end after it starts.');
  return { day, from, to };
}

/** What is already in the calendar that day (entries and timed tasks), as busy time with its place. */
async function busyOf(day) {
  const start = new Date(day.getFullYear(), day.getMonth(), day.getDate()), end = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1);
  const { events } = await hub.getEvents(start.toISOString(), end.toISOString());
  return events.filter((e) => (e.kind === 'event' || e.kind === 'task') && !e.allDay && e.start && e.end)
    .map((e) => ({ start: +new Date(e.start), end: +new Date(e.end), place: String(e.location || '').trim().slice(0, 80) || null, title: e.title }))
    .filter((b) => b.end > b.start);
}

function userMessage({ text, day, from, to, busy, home, mode, arrived = [] }) {
  const lines = (busy.length ? busy : []).slice(0, 40).sort((a, b) => a.start - b.start)
    .map((b) => `- ${hm(new Date(b.start))}-${hm(new Date(b.end))} ${String(b.title || 'Busy').slice(0, 60)}${b.place ? ` @ ${b.place}` : ''}`);
  return [
    `Day: ${day.toDateString()}. Free window to plan in: ${hm(new Date(from))} to ${hm(new Date(to))}.`,
    `Home base: ${home || 'not given'}. They get around ${MODES[mode] || MODES.drive}.`,
    `Already in their schedule:\n${lines.length ? lines.join('\n') : '(nothing)'}`,
    arrived.length ? `Tasks that arrived from other apps:\n${arrived.map((a, i) => `[t${i + 1}] ${String(a.title).slice(0, 120)}${a.minutes ? ` [expected length: ${a.minutes} min]` : ''}${a.notes ? ` (${String(a.notes).replace(/\s+/g, ' ').slice(0, 160)})` : ''}`).join('\n')}` : '',
    String(text).trim() ? `What they need to get done:\n${String(text).slice(0, 3000)}` : '',
  ].filter(Boolean).join('\n\n');
}

/** The JSON out of Claude's answer (it may wrap it in a code fence or a sentence). */
function parseAnswer(text) {
  const m = String(text || '').match(/\{[\s\S]*\}/);
  if (!m) return null;
  try { return JSON.parse(m[0]); } catch { return null; }
}

async function askClaude(prompt) {
  const res = await fetch(API, {
    method: 'POST',
    signal: AbortSignal.timeout(60000),
    headers: { 'x-api-key': keyOf(), 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: MODEL, max_tokens: 3000, system: SYSTEM, messages: [{ role: 'user', content: prompt }] }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401) throw new Error('Claude did not accept the API key. Check it in Settings → AI.');
    throw new Error(body?.error?.message || `Claude answered ${res.status}`);
  }
  const answer = parseAnswer((body.content || []).map((c) => c.text || '').join(''));
  if (!answer) throw new Error('Claude\'s answer could not be read. Try again.');
  return answer;
}

const toISO = (ms) => new Date(ms).toISOString();

/** What the screen shows: the placed blocks (times as ISO), the rest, and the tasks to change and plan again. */
function present(result, { tasks, travel, source, warning }) {
  return {
    source, warning: warning || '', tasks, travel,
    blocks: result.blocks.map((b) => ({
      idx: b.idx, part: b.part, ref: b.ref, title: b.title, start: toISO(b.start), end: toISO(b.end), minutes: b.minutes, travel: b.travel,
      place: b.place, why: b.why, kind: b.kind,
    })),
    unplaced: result.unplaced.map((u) => ({ idx: u.idx, ref: u.task.ref, title: u.task.title, minutes: u.task.minutes, reason: u.reason })),
  };
}

const optsOf = (o = {}) => {
  const s = settings();
  return {
    home: String(o.home ?? s.home ?? '').trim().slice(0, 120), mode: o.mode in MODES ? o.mode : s.mode,
    start: o.start || s.start, end: o.end || s.end, lunch: o.lunch ?? s.lunch,
  };
};

/**
 * Estimates the tasks in `text` and places them on `date` ("YYYY-MM-DD").
 * Returns { source: 'claude' | 'local', blocks, unplaced, tasks, travel, warning }.
 */
async function planDay(text, date, o, inboxIds = []) {
  const body = String(text || '').trim();
  // Tasks that arrived from other apps, picked in the window: planned along with what was typed.
  const wanted = new Set(Array.isArray(inboxIds) ? inboxIds : []);
  const arrived = wanted.size ? (await hub.getTasks()).tasks.filter((t) => wanted.has(t.id) && !t.done && !t.mirror) : [];
  if (!body && !arrived.length) throw new Error('Describe what you need to get done first.');
  const opts = optsOf(o);
  const { day, from, to } = windowOf(date, opts);
  const busy = await busyOf(day);
  let tasks, travel = [], source = 'local', warning = '';
  if (keyOf()) {
    try {
      const answer = await askClaude(userMessage({ text: body, day, from, to, busy, home: opts.home, mode: opts.mode, arrived }));
      tasks = plan.normalizeTasks(answer.tasks);
      // Claude's "t1" tags are the arrived tasks: back to their real ids (and nothing it invented).
      for (const t of tasks) {
        const m = /^t(\d+)$/.exec(String(t.ref || ''));
        if (m && arrived[Number(m[1]) - 1]) t.ref = arrived[Number(m[1]) - 1].id; else delete t.ref;
      }
      travel = (Array.isArray(answer.travel) ? answer.travel : []).slice(0, 120);
      source = 'claude';
      if (!tasks.length) throw new Error('Claude found no tasks in that.');
    } catch (err) {
      warning = `${err.message} Planned from the words alone instead.`;
    }
  }
  if (!tasks) tasks = plan.normalizeTasks(plan.estimateLocal(body));
  // Every arrived task is in the plan, even when Claude merged or dropped it: a guess from its name stands in.
  const have = new Set(tasks.map((t) => t.ref).filter(Boolean));
  for (const a of arrived) {
    if (have.has(a.id)) continue;
    const guess = plan.normalizeTasks(plan.estimateLocal(a.label || a.title).slice(0, 1).map((g) => ({ ...g, ref: a.id })));
    tasks.push(...guess);
  }
  // A length the other app gave (Tamkeen's review time) is the length planned.
  for (const t of tasks) {
    const given = t.ref && arrived.find((a) => a.id === t.ref)?.minutes;
    if (given) { t.minutes = plan.clampMinutes(given); t.why ||= 'Length given by the app that sent it'; }
  }
  if (!tasks.length) throw new Error('No tasks found in that. Put one on each line.');
  const result = plan.schedule(busy, tasks, { day, from, to, home: opts.home || 'Home', travel, lunch: opts.lunch });
  return present(result, { tasks, travel, source, warning });
}

/** The same tasks (changed lengths, some removed) and travel, laid out again without asking Claude. */
async function replan(tasks, travel, date, o) {
  const opts = optsOf(o);
  const { day, from, to } = windowOf(date, opts);
  const busy = await busyOf(day);
  const list = plan.normalizeTasks(tasks);
  const result = plan.schedule(busy, list, { day, from, to, home: opts.home || 'Home', travel, lunch: opts.lunch });
  return present(result, { tasks: list, travel: Array.isArray(travel) ? travel : [], source: 'edited' });
}

/** Keeps the hours, home base and way of travelling for next time. */
function remember(o) {
  const s = store.data.settings;
  s.magic = { ...settings(), ...Object.fromEntries(Object.entries(optsOf(o)).filter(([k]) => ['home', 'mode', 'start', 'end', 'lunch'].includes(k))) };
  store.save();
  return info();
}

module.exports = { planDay, replan, remember, info, parseAnswer, userMessage, windowOf };
