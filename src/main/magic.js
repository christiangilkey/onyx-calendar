// Magic add: describe what you need to get done and it lands in the day's free time. Claude
// (with the user's own API key, like Breakdown) estimates each task's length, where it is done and
// the best time of day for it; magic-plan.js then places them around what is already in the
// calendar. Without a key the estimate is a guess from the words. Travel and lunch are not added:
// the person puts those in their calendar themselves.

const store = require('./store');
const hub = require('./hub');
const plan = require('./magic-plan');
const sources = require('./sources');

const MODEL = 'claude-sonnet-5-5'; // spatial and time reasoning: worth more than the quickest model
const API = 'https://api.anthropic.com/v1/messages';

const SYSTEM = [
  'You help someone plan one day. They describe things they need to get done; you work out how long each takes and where and when it fits best.',
  'For each task give: "title" (short, keep their words), "minutes" (realistic, for the doing itself, including setup, queues and tidy-up, multiples of 5, between 5 and 240), "place" (a short name of where it is done; reuse the exact place names from their schedule when it is the same place; "Home" for things done at home; null for things done anywhere, like a phone call), "when" (morning, midday, afternoon, evening or any: when it suits best, thinking about energy, opening hours and how people usually do it; focus work is best in the morning, errands when places are open, calls in office hours), "kind" (focus, errand, call, chore, exercise, meal, admin or other), "after" and "before" ("HH:MM" 24-hour, only when they said a time limit; otherwise null) and "why" (one short sentence on the length or timing).',
  'Some tasks come from the person\'s own lists (sent from other apps, kept on the backburner, or with no date yet) as "[t1] title"; each of those is exactly one task: give it the field "ref" with its tag (t1), and still estimate it like the rest. Tasks the person typed have no ref.',
  'Write in the same language as the task. Reply with only JSON: {"tasks":[...]}.',
].join(' ');

// When the person hands over something to read (a webpage, a Notion page, a picture of instructions).
const MATERIAL = [
  'They also added material to turn into tasks: pages or pictures, written out as text, each numbered ("Material 1").',
  'Turn it into concrete tasks for this day, each something they can do in one sitting, in the order the material gives: group tiny steps that follow each other into one task, and split anything longer than 4 hours.',
  'Give each task that comes from material "source" (the material\'s number) and "step" (its place in that material\'s order, from 1), and put what they need to do it in "notes" (at most 400 characters: the instructions, amounts, settings or links for that step).',
  'Leave out what is not something to do (background, ads, menus). If the material is a long course or project that cannot fit one day, plan the first part and say so in the "why" of its last task.',
].join(' ');

const keyOf = () => String(store.data.secrets.anthropicKey || '');
// incoming: what happens to tasks another app sends through magic_add: 'review' (they wait in Magic add) or 'auto' (placed at once).
const INCOMING = ['review', 'auto'];
const settings = () => {
  const s = store.data.settings.magic || {};
  return { start: s.start || '08:00', end: s.end || '21:00', incoming: INCOMING.includes(s.incoming) ? s.incoming : 'review' };
};
const info = () => ({ ready: !!keyOf(), model: MODEL, ...settings() });

const pad = (n) => String(n).padStart(2, '0');
const hm = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

/**
 * The day's window in ms: the chosen hours, and from now on when the day is today. Tasks from other apps
 * with a time of their own (a dinner at 21:30) widen it for themselves; `core` is then the chosen hours.
 */
function windowOf(date, opts, tasks = []) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(date || ''));
  const day = m ? new Date(+m[1], +m[2] - 1, +m[3]) : new Date();
  day.setHours(0, 0, 0, 0);
  const at = (t, fallback) => {
    const [h, mi] = /^\d{1,2}:\d{2}$/.test(String(t)) ? String(t).split(':').map(Number) : fallback;
    return new Date(day.getFullYear(), day.getMonth(), day.getDate(), h, mi).getTime();
  };
  let from = at(opts.start, [8, 0]), to = at(opts.end, [21, 0]);
  const core = { from, to };
  const span = plan.anchorSpan(tasks, day);
  if (span) { from = Math.min(from, span[0]); to = Math.min(day.getTime() + 86400000, Math.max(to, span[1])); }
  const now = Date.now();
  if (now > from && now < day.getTime() + 86400000) from = Math.max(from, now + 5 * 60000); // not in the past
  if (to <= from) throw new Error(from > at(opts.start, [8, 0]) ? 'The day is over: pick tomorrow.' : 'The day needs to end after it starts.');
  return { day, from, to, core: span ? { from: Math.max(core.from, from), to: core.to } : null };
}

/** What is already in the calendar that day (entries and timed tasks), as busy time with its place. */
async function busyOf(day) {
  const start = new Date(day.getFullYear(), day.getMonth(), day.getDate()), end = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1);
  const { events } = await hub.getEvents(start.toISOString(), end.toISOString());
  return events.filter((e) => (e.kind === 'event' || e.kind === 'task') && !e.allDay && e.start && e.end)
    .map((e) => ({ id: e.id, start: +new Date(e.start), end: +new Date(e.end), place: String(e.location || '').trim().slice(0, 80) || null, title: e.title }))
    .filter((b) => b.end > b.start);
}

const limitText = (l) => [l?.preferred && ` [planned for ${l.preferred}]`, l?.after && ` [not before ${l.after}]`, l?.before && ` [done by ${l.before}]`].filter(Boolean).join('');

function userMessage({ text, day, from, to, busy, arrived = [], material = [] }) {
  const lines = (busy.length ? busy : []).slice(0, 40).sort((a, b) => a.start - b.start)
    .map((b) => `- ${hm(new Date(b.start))}-${hm(new Date(b.end))} ${String(b.title || 'Busy').slice(0, 60)}${b.place ? ` @ ${b.place}` : ''}`);
  return [
    `Day: ${day.toDateString()}. Free window to plan in: ${hm(new Date(from))} to ${hm(new Date(to))}.`,
    `Already in their schedule:\n${lines.length ? lines.join('\n') : '(nothing)'}`,
    arrived.length ? `Tasks picked from their lists:\n${arrived.map((a, i) => `[t${i + 1}] ${String(a.title).slice(0, 120)}${a.minutes ? ` [expected length: ${a.minutes} min]` : ''}${limitText(a.limits)}${a.notes ? ` (${String(a.notes).replace(/\s+/g, ' ').slice(0, 160)})` : ''}`).join('\n')}` : '',
    String(text).trim() ? `What they need to get done:\n${String(text).slice(0, 3000)}` : '',
    material.length ? sources.promptBlock(material) : '',
  ].filter(Boolean).join('\n\n');
}

/** The JSON out of Claude's answer (it may wrap it in a code fence or a sentence). */
function parseAnswer(text) {
  const m = String(text || '').match(/\{[\s\S]*\}/);
  if (!m) return null;
  try { return JSON.parse(m[0]); } catch { return null; }
}

async function askClaude(prompt, { material = false } = {}) {
  const res = await fetch(API, {
    method: 'POST',
    signal: AbortSignal.timeout(material ? 150000 : 60000),
    headers: { 'x-api-key': keyOf(), 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: MODEL, max_tokens: material ? 10000 : 3000, system: material ? `${SYSTEM} ${MATERIAL}` : SYSTEM, messages: [{ role: 'user', content: prompt }] }),
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
      place: b.place, why: b.why, kind: b.kind, notes: b.notes || '', from: b.from || null,
    })),
    unplaced: result.unplaced.map((u) => ({ idx: u.idx, ref: u.task.ref, title: u.task.title, minutes: u.task.minutes, reason: u.reason })),
  };
}

const optsOf = (o = {}) => {
  const s = settings();
  return { start: o.start || s.start, end: o.end || s.end, incoming: INCOMING.includes(o.incoming) ? o.incoming : s.incoming };
};
// No travel inside the blocks and no time held for lunch: the person plans those themselves.
const LAYOUT = { home: null, travel: false, lunch: false };

/** Claude's tasks from material, tied to what they came from: each material's tasks are a chain of steps, kept in order. */
function linkMaterial(raw, material) {
  return (Array.isArray(raw) ? raw : []).map((t, i) => {
    const n = Number(t?.source);
    const m = Number.isInteger(n) && n >= 1 ? material[n - 1] : null;
    if (!m) return t;
    return { ...t, chain: `m${n}`, step: Number.isFinite(Number(t.step)) ? Number(t.step) : i + 1, from: { title: m.title, url: m.url } };
  });
}

/**
 * Estimates the tasks in `text` and places them on `date` ("YYYY-MM-DD"). `material`: pages and pictures read
 * for it (sources.js: [{ title, url, kind, text }]), turned into tasks too; that needs Claude.
 * Returns { source: 'claude' | 'local', blocks, unplaced, tasks, travel (always empty now), warning }.
 */
async function planDay(text, date, o, inboxIds = [], material = []) {
  // Tasks picked in the window (sent from other apps, on the backburner, or with no date): planned along with what was typed.
  const wanted = new Set(Array.isArray(inboxIds) ? inboxIds : []);
  const arrived = wanted.size ? (await hub.getTasks()).tasks.filter((t) => wanted.has(t.id) && !t.done && !t.mirror)
    .map((t) => ({ ...t, limits: store.data.inboxItems?.[t.id]?.limits || null })) : [];
  return planWith(text, date, o, arrived, material);
}

/** The times a sender gave a task ({ preferred, after, before } as "HH:MM"), on the planner's task. */
const asAnchors = (a) => ({ ref: a.id, minutes: a.minutes || 30, ...(a.limits || {}) });

/** planDay's work: `arrived` is [{ id, title, label?, minutes?, notes?, from?, limits? }], each planned as exactly one task. */
async function planWith(text, date, o, arrived, material = []) {
  const body = String(text || '').trim();
  const read = sources.forPrompt(material);
  if (!body && !arrived.length && !read.length) throw new Error('Describe what you need to get done first.');
  if (read.length && !keyOf()) throw new Error('Turning pages and pictures into tasks needs your Claude key: add it in Settings → AI.');
  const opts = optsOf(o);
  const { day, from, to, core } = windowOf(date, opts, arrived.map(asAnchors));
  const busy = await busyOf(day);
  let tasks, source = 'local', warning = '';
  const travel = [];
  if (keyOf()) {
    try {
      const answer = await askClaude(userMessage({ text: body, day, from, to, busy, arrived, material: read }), { material: read.length > 0 });
      tasks = plan.normalizeTasks(linkMaterial(answer.tasks, read));
      // Claude's "t1" tags are the arrived tasks: back to their real ids (and nothing it invented).
      for (const t of tasks) {
        const m = /^t(\d+)$/.exec(String(t.ref || ''));
        if (m && arrived[Number(m[1]) - 1]) t.ref = arrived[Number(m[1]) - 1].id; else delete t.ref;
      }
      source = 'claude';
      if (!tasks.length) throw new Error('Claude found no tasks in that.');
    } catch (err) {
      if (read.length) throw err; // a page or a picture can't be planned from guesses
      warning = `${err.message} Planned from the words alone instead.`;
    }
  }
  if (!tasks) tasks = plan.normalizeTasks(plan.estimateLocal(body));
  // Every arrived task is in the plan, even when Claude merged or dropped it: a guess from its name stands in.
  const have = new Set(tasks.map((t) => t.ref).filter(Boolean));
  for (const a of arrived) {
    if (have.has(a.id)) continue;
    tasks.push(...plan.normalizeTasks([{ ...plan.readLine(a.label || a.title), ref: a.id }])); // its whole name, never split
  }
  // A length the other app gave (Tamkeen's review time) is the length planned, and the times it gave are kept to.
  for (const t of tasks) {
    const a = t.ref && arrived.find((x) => x.id === t.ref);
    if (!a) continue;
    if (a.minutes) {
      t.minutes = plan.clampMinutes(a.minutes);
      t.why ||= a.from ? 'Length given by the app that sent it' : 'The length it was kept with';
    }
    for (const k of ['preferred', 'after', 'before']) if (a.limits?.[k]) t[k] = a.limits[k];
  }
  if (!tasks.length) throw new Error('No tasks found in that. Put one on each line.');
  const result = plan.schedule(busy, tasks, { day, from, to, core, ...LAYOUT, focusPart: require('./focus').bestFocusPart() });
  return present(result, { tasks, travel, source, warning });
}

/** The same tasks (changed lengths, some removed), laid out again without asking Claude. */
async function replan(tasks, travel, date, o) {
  const opts = optsOf(o);
  const list = plan.normalizeTasks(tasks);
  const { day, from, to, core } = windowOf(date, opts, list);
  const busy = await busyOf(day);
  const result = plan.schedule(busy, list, { day, from, to, core, ...LAYOUT, focusPart: require('./focus').bestFocusPart() });
  return present(result, { tasks: list, travel: [], source: 'edited' });
}

/** Keeps the hours for next time. */
function remember(o) {
  const s = store.data.settings;
  s.magic = { ...(s.magic || {}), ...optsOf(o) };
  store.save();
  return info();
}

// ---------------------------------------------------------------- tasks sent by other apps (MCP magic_add)

const MAX_ITEMS = 30;
const sent = []; // when each call came, to hold a runaway sender back
let placedListener = () => {};

const HM = /^([01]\d|2[0-3]):[0-5]\d$/;
const clean = (v, max) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

/** One item from the caller, checked: { title, minutes?, notes, tags, id?, limits? }. Throws on what cannot be used. */
function readItem(it, i) {
  const where = `items[${i}]`;
  if (!it || typeof it !== 'object') throw new Error(`${where} is not an object.`);
  const title = clean(it.title, 120);
  if (!title) throw new Error(`${where} needs a title.`);
  let minutes = null;
  if (it.minutes != null) {
    minutes = Number(it.minutes);
    if (!Number.isFinite(minutes) || minutes < 1) throw new Error(`${where}.minutes must be a number of minutes.`);
    minutes = plan.clampMinutes(minutes);
  }
  const limits = {};
  for (const [arg, key] of [['preferred', 'preferred'], ['not_before', 'after'], ['not_after', 'before']]) {
    if (it[arg] == null || it[arg] === '') continue;
    const v = String(it[arg]).trim().replace(/^(\d):/, '0$1:');
    if (!HM.test(v)) throw new Error(`${where}.${arg} must be a time like "18:30".`);
    limits[key] = v;
  }
  const id = it.id == null ? null : String(it.id).trim();
  if (id != null && !/^[\w.:-]{1,80}$/.test(id)) throw new Error(`${where}.id may use letters, digits and . : _ - (up to 80).`);
  const tags = Array.isArray(it.tags) ? it.tags.map((t) => clean(t, 40)).filter(Boolean).slice(0, 12) : null;
  return { title, minutes, notes: String(it.notes ?? '').trim().slice(0, 1000), tags, id, limits: Object.keys(limits).length ? limits : null };
}

/**
 * Tasks another app sends for a day (the MCP tool magic_add). With the setting "From other apps: wait for
 * my review" (the default) each becomes a task that waits in Magic add, planned around the day when the
 * user opens it; with "place them right away" they are fitted in now and added as time blocks, with an
 * undo in the window. `source` names the app ("food-planner"). Each item's `id`, when given, makes a
 * second send of the same thing update (review) or keep (placed) the first instead of adding another.
 */
async function receive({ date, items, source } = {}) {
  const day = /^\d{4}-\d{2}-\d{2}$/.test(String(date || '')) ? String(date) : null;
  if (!day || Number.isNaN(+new Date(`${day}T00:00`))) throw new Error('date must be a day, YYYY-MM-DD.');
  if (!Array.isArray(items) || !items.length) throw new Error('items must be a list of at least one task.');
  if (items.length > MAX_ITEMS) throw new Error(`Send at most ${MAX_ITEMS} items at a time (one call per day).`);
  const from = String(source || 'mcp').trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]{0,23}$/.test(from)) throw new Error('source must be a short name like "food-planner" (a-z, 0-9 and -).');
  const list = items.map(readItem);
  const now = Date.now();
  while (sent.length && now - sent[0] > 60000) sent.shift();
  if (sent.length >= 20) throw new Error('Too many magic_add calls in a minute. Try again shortly.');
  sent.push(now);

  if (optsOf().incoming !== 'auto') {
    const queued = [], kept = [];
    for (const it of list) {
      const r = await hub.queueTask({ title: it.title, notes: it.notes, due: day, minutes: it.minutes, from, id: it.id, tags: it.tags, limits: it.limits });
      (r.planned ? kept : queued).push({ title: it.title, id: r.taskId, ...(r.planned ? { start: r.start } : {}) });
    }
    return { mode: 'review', date: day, queued, ...(kept.length ? { already_planned: kept } : {}),
      message: `Waiting in Magic add for ${day}: the user sees where they would fit and adds them.` };
  }

  // Placed right away. Ones sent before (same id) that are still in the calendar stay where they are.
  store.data.magicSent ??= {};
  const cut = new Date(Date.now() - 60 * 86400000).toISOString().slice(0, 10);
  for (const [k, v] of Object.entries(store.data.magicSent)) if (!v?.date || v.date < cut) delete store.data.magicSent[k];
  const dayStart = new Date(`${day}T00:00`);
  const live = new Map();
  if (list.some((it) => it.id && store.data.magicSent[`${from}:${it.id}`])) {
    const { events } = await hub.getEvents(dayStart.toISOString(), new Date(dayStart.getFullYear(), dayStart.getMonth(), dayStart.getDate() + 1).toISOString());
    for (const e of events) live.set(e.id, e);
  }
  const placed = [], unplaced = [], arrived = [];
  list.forEach((it, i) => {
    const before = it.id && store.data.magicSent[`${from}:${it.id}`];
    const still = before?.events?.map((id) => live.get(id)).filter(Boolean) || [];
    if (still.length) { for (const e of still) placed.push({ title: e.title, start: e.start, end: e.end, id: e.id, kept: true }); return; }
    // Its time today is already over: nothing is put in the past.
    const last = it.limits?.before || it.limits?.preferred;
    if (last && day === localDay(new Date()) && new Date(`${day}T${last}`).getTime() + (it.limits.before ? 0 : (it.minutes || 30) * 60000) <= now) {
      unplaced.push({ title: it.title, reason: 'Its time today has already passed' });
      return;
    }
    arrived.push({ id: `i${i}`, title: it.title, minutes: it.minutes, notes: it.notes, limits: it.limits, item: it });
  });
  let source2 = 'local', warning = '';
  const made = [];
  if (arrived.length) {
    const r = await planWith('', day, {}, arrived);
    source2 = r.source; warning = r.warning;
    for (const b of r.blocks) {
      const a = arrived.find((x) => x.id === b.ref);
      if (!a) continue;
      const part = b.part ? / \(\d+\/\d+\)$/.exec(b.title)?.[0] || '' : '';
      const fields = {
        title: `${a.title}${part}`, start: b.start, end: b.end, allDay: false, location: b.place || '', notes: a.notes || b.why || '',
        ...(a.item.tags ? { tags: a.item.tags } : {}), ...(b.travel > 0 ? { leaveBy: b.travel } : {}),
      };
      const event = await hub.createEvent(fields);
      made.push({ fields: { ...fields, calendarId: event.calendarId }, id: event.id, key: a.item.id ? `${from}:${a.item.id}` : null });
      placed.push({ title: fields.title, start: b.start, end: b.end, id: event.id, ...(b.travel > 0 ? { travel_minutes: b.travel } : {}) });
    }
    for (const u of r.unplaced) {
      const a = arrived.find((x) => x.id === u.ref);
      if (a) unplaced.push({ title: a.title, reason: u.reason });
    }
  }
  const byKey = new Map(); // a long one may be in two or three sittings
  for (const m of made) if (m.key) byKey.set(m.key, [...(byKey.get(m.key) || []), m.id]);
  for (const [k, ids] of byKey) store.data.magicSent[k] = { date: day, events: ids };
  if (made.length) {
    store.save();
    placedListener({ date: day, source: from, events: made.map(({ id, fields }) => ({ id, fields })) });
  }
  placed.sort((a, b) => new Date(a.start) - new Date(b.start));
  return { mode: 'placed', date: day, placed, unplaced, estimated_by: source2 === 'claude' ? 'claude' : 'words', ...(warning ? { warning } : {}) };
}

const localDay = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

module.exports = {
  planDay, replan, remember, info, parseAnswer, userMessage, windowOf, linkMaterial, busyOf, receive, MAX_ITEMS,
  onPlaced: (fn) => { placedListener = fn; }, // the window is told, for its undo
};
