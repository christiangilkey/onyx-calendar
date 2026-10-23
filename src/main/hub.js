// The master calendar: one list of calendars, events and tasks across every
// connected account, plus the bridge that makes the Raspberry Pi phone about them.
// Both the window and the MCP server go through this module.

const store = require('./store');
const accounts = require('./accounts');
const google = require('./providers/google');
const microsoft = require('./providers/microsoft');
const ics = require('./providers/ics');
const { parseName, mirrorName, callTime } = require('./taskname');
const repeat = require('./repeat');
const series = require('./series');
const recur = require('./recur');
const sync = require('./sync');
const inbox = require('./inbox');
const { parseTaskLink } = require('./deeplink');

const PROVIDERS = { google, microsoft };
const LOCAL = { id: 'local', provider: 'local', label: 'On this PC' };
const EVENT_CACHE_MS = 2 * 60000;
const TASK_CACHE_MS = 60000;
const TASK_BLOCK_MINUTES = 30; // how tall a timed task is drawn on the grid
const FEED_COLORS = ['#3fd0c9', '#ff7eb6', '#5fd38d', '#ff9f4a', '#4aa8ff', '#c69a6d'];

const enc = encodeURIComponent;
const dec = decodeURIComponent;
const pad = (n) => String(n).padStart(2, '0');
const localDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
/** A 'YYYY-MM-DD' date, or a full timestamp, as a Date (dates mean local midnight). */
const toDate = (v) => (v.length === 10 ? new Date(+v.slice(0, 4), +v.slice(5, 7) - 1, +v.slice(8, 10)) : new Date(v));

const eventCache = new Map(); // `${calendar id}|${start}|${end}` -> { at, items }
const taskCache = new Map();  // list id -> { at, items }
const doneCache = new Map();  // `${list id}|${start}|${end}` -> { at, items }: tasks done, for the calendar

const req = (acct) => (url, opts) => accounts.request(acct, url, opts);
const findAccount = (id) => (id === 'local' ? LOCAL : store.data.accounts.find((a) => a.id === id));

// ---------------------------------------------------------------- ids
// calendar: "<account>/<calendar>"   task list: "<account>/tl~<list>"
// event or task: "<calendar id>/<item>"   (each part URL-encoded)

function parseId(id) {
  const [acctId, calPart, itemPart] = String(id).split('/');
  const acct = findAccount(acctId);
  if (!acct || !calPart) throw Object.assign(new Error('That calendar or event no longer exists.'), { status: 404 });
  const isTasks = calPart.startsWith('tl~');
  return {
    acct, isTasks,
    calendarId: `${acctId}/${calPart}`,
    rawCal: dec(isTasks ? calPart.slice(3) : calPart),
    rawItem: itemPart ? dec(itemPart) : null,
  };
}

// ---------------------------------------------------------------- calendars

function calendars() {
  const out = store.data.local.calendars.map((c) => ({
    id: `local/${enc(c.id)}`, account: 'local', accountLabel: LOCAL.label, provider: 'local',
    kind: 'calendar', name: c.name, color: c.color, writable: true,
  }));
  for (const a of store.data.accounts) {
    for (const c of store.data.calendars[a.id] || []) {
      out.push({
        id: `${a.id}/${c.kind === 'tasklist' ? 'tl~' : ''}${enc(c.rawId)}`,
        account: a.id, accountLabel: a.label, provider: a.provider,
        kind: c.kind, name: c.name, color: c.color, writable: c.writable, primary: !!c.primary,
      });
    }
  }
  return out;
}

const findCalendar = (id) => {
  const cal = calendars().find((c) => c.id === id);
  if (!cal) throw new Error('That calendar no longer exists.');
  return cal;
};

async function refreshCalendars() {
  const errors = [];
  await Promise.all(store.data.accounts.map(async (a, i) => {
    try {
      store.data.calendars[a.id] = a.provider === 'ics'
        ? [{ rawId: 'feed', kind: 'calendar', name: a.label, color: FEED_COLORS[i % FEED_COLORS.length], writable: false }]
        : await PROVIDERS[a.provider].calendars(req(a));
    } catch (err) {
      errors.push(err.message);
    }
  }));
  store.save();
  return { calendars: calendars(), errors };
}

function invalidate(calendarId) {
  for (const key of eventCache.keys()) if (!calendarId || key.startsWith(calendarId + '|')) eventCache.delete(key);
  if (calendarId) taskCache.delete(calendarId); else taskCache.clear();
  for (const key of doneCache.keys()) if (!calendarId || key.startsWith(calendarId + '|')) doneCache.delete(key);
}

// ---------------------------------------------------------------- events

// Which entries were added from Onyx (rather than in Google, Outlook or To Do), so a
// window can say where an entry came from. Only the newest are kept.
const MAX_MADE_HERE = 4000;
function markMadeHere(id) {
  const made = store.data.madeHere;
  made[id] = localDate(new Date());
  const keys = Object.keys(made);
  for (const k of keys.slice(0, Math.max(0, keys.length - MAX_MADE_HERE))) delete made[k];
  store.save();
}

// ---------------------------------------------------------------- pomodoro
// A block of time (an event, or a task with a time) can be split into work and rest
// chunks: 25 minutes on, 5 off, and so on. The split lives in Onyx; a task also gets a
// length (`minutes`), since Google Tasks and To Do have none.

const pomodoroOf = (id) => store.data.pomodoro[id] || null;

/** Sets (or, with null, clears) the pomodoro split of one event or task. */
function setPomodoro(id, cfg) {
  if (!id) throw new Error('Nothing to set it on.');
  if (!cfg) {
    delete store.data.pomodoro[id];
  } else {
    const num = (v, lo, hi, name) => {
      const n = Math.round(Number(v));
      if (!Number.isFinite(n) || n < lo || n > hi) throw new Error(`${name} must be between ${lo} and ${hi} minutes.`);
      return n;
    };
    // What to do on a break, in turn (written by the user): at most 12 short ones.
    const ideas = [];
    for (const raw of Array.isArray(cfg.activities) ? cfg.activities : String(cfg.activities || '').split(/[\n,;]+/)) {
      const t = String(raw).replace(/\s+/g, ' ').trim().slice(0, 60);
      if (t && !ideas.some((x) => x.toLowerCase() === t.toLowerCase())) ideas.push(t);
      if (ideas.length >= 12) break;
    }
    store.data.pomodoro[id] = {
      work: num(cfg.work ?? 25, 5, 180, 'Work'),
      rest: num(cfg.rest ?? 5, 1, 60, 'Rest'),
      ...(cfg.minutes != null ? { minutes: num(cfg.minutes, 10, 720, 'The length') } : {}),
      ...(ideas.length ? { activities: ideas } : {}),
    };
  }
  store.save();
  return pomodoroOf(id);
}

// ---------------------------------------------------------------- a block's tasks
// What to get done within a block of time, in order: a list kept in Onyx by the block (a repeat's
// list is the series', the same every day), with what is ticked off kept for each day on its own.

const MAX_BLOCK_TASKS = 50;
const MAX_TICKED_DAYS = 3000;

/** Gives a block (a repeat: every day of it) a colour of its own, '#rrggbb', or with null its calendar's again. */
function setEventColor(key, color) {
  if (!key) throw new Error('Nothing to colour.');
  if (color == null || color === '') delete store.data.eventColors[key];
  else if (/^#[0-9a-f]{6}$/i.test(color)) store.data.eventColors[key] = color.toLowerCase();
  else throw new Error('A colour is written like #4aa8ff.');
  store.save();
  return store.data.eventColors[key] || null;
}

/** A block's tasks as the window and the calendar show them: [{ id, text, done }], or null for none. */
function taskListOf(e) {
  const items = store.data.blockTasks[keyOf(e)];
  if (!items?.length) return null;
  const ticked = new Set(store.data.blockTicks[e.id] || []);
  return items.map((t) => ({ id: t.id, text: t.text, done: ticked.has(t.id) }));
}

/** Sets a block's tasks, in order (an empty list takes it off). Ticks of tasks no longer there go too. */
function setBlockTasks(key, items) {
  if (!key) throw new Error('Nothing to set it on.');
  const clean = [];
  for (const it of Array.isArray(items) ? items : []) {
    const text = String(it?.text ?? '').replace(/\s+/g, ' ').trim().slice(0, 200);
    if (!text) continue;
    let id = typeof it?.id === 'string' && /^[\w-]{1,40}$/.test(it.id) ? it.id : '';
    if (!id || clean.some((x) => x.id === id)) id = Math.random().toString(36).slice(2, 10);
    clean.push({ id, text });
    if (clean.length >= MAX_BLOCK_TASKS) break;
  }
  if (clean.length) store.data.blockTasks[key] = clean;
  else delete store.data.blockTasks[key];
  // Ticks of tasks taken off are simply no longer shown (taskListOf keeps only the tasks there).
  store.save();
  return clean;
}

/** Ticks one of a block's tasks off (or, with `done` false, back on), on this day of it (`id`). */
function tickBlockTask(id, taskId, done = true) {
  if (!id || !taskId) throw new Error('Nothing to tick.');
  const set = new Set(store.data.blockTicks[id] || []);
  if (done) set.add(String(taskId)); else set.delete(String(taskId));
  delete store.data.blockTicks[id]; // re-added last: the oldest days go first when the list is long
  if (set.size) store.data.blockTicks[id] = [...set];
  const days = Object.keys(store.data.blockTicks);
  for (const d of days.slice(0, Math.max(0, days.length - MAX_TICKED_DAYS))) delete store.data.blockTicks[d];
  store.save();
  return [...set];
}

function unify(cal, e) {
  const id = `${cal.id}/${enc(e.rawId)}`;
  // A day of a repeat belongs to its series: tags, notes kept in Onyx and the like are the series'.
  const seriesId = e.seriesRawId ? `${cal.id}/${enc(e.seriesRawId)}` : null;
  return {
    id, calendarId: cal.id, calendarName: cal.name, color: cal.color, kind: 'event',
    title: e.title, start: e.start, end: e.end, allDay: !!e.allDay,
    location: e.location || '', notes: e.notes || '', link: e.link || '',
    writable: cal.writable, ...callInfo(id, e.start), madeHere: store.data.madeHere[id] || (seriesId && store.data.madeHere[seriesId]) || null,
    recur: e.recur || null, seriesId,
  };
}

/** Where Onyx keeps its own things about an entry (tags, memo, pomodoro): a repeat's series, or the entry. */
const keyOf = (e) => e.seriesId || e.id;

// A time block in an Onyx calendar that repeats is kept once, with its rule, and laid out
// into its days here: "<id>~YYYY-MM-DD" for each, the days in `skip` left out.
function localEvents(rawCal, start, end) {
  const from = new Date(start), to = new Date(end);
  const out = [];
  for (const e of store.data.local.events) {
    if (e.calendar !== rawCal) continue;
    if (!e.recur) {
      if (toDate(e.end) > from && toDate(e.start) < to) out.push({ rawId: e.id, ...e });
      continue;
    }
    const first = toDate(e.start);
    const length = toDate(e.end) - first;
    // From a day before, so one that runs past midnight into the range is kept.
    for (const day of recur.days(e.recur, first, new Date(from.getTime() - Math.max(length, 86400000)), to, e.skip || [])) {
      const s = new Date(day.getFullYear(), day.getMonth(), day.getDate(), first.getHours(), first.getMinutes());
      const t = new Date(s.getTime() + length);
      if (t <= from || s >= to) continue;
      const key = localDate(day);
      out.push({
        ...e, rawId: `${e.id}~${key}`, seriesRawId: e.id,
        start: e.allDay ? key : s.toISOString(),
        end: e.allDay ? localDate(new Date(day.getFullYear(), day.getMonth(), day.getDate() + Math.round(length / 86400000))) : t.toISOString(),
      });
    }
  }
  return out;
}

async function calendarEvents(cal, start, end, force) {
  const key = `${cal.id}|${start}|${end}`;
  const hit = eventCache.get(key);
  if (hit && !force && Date.now() - hit.at < EVENT_CACHE_MS) return hit.items;
  const { acct, rawCal } = parseId(cal.id);
  let raw;
  if (acct.provider === 'local') raw = localEvents(rawCal, start, end);
  else if (acct.provider === 'ics') raw = await ics.events(acct.url, start, end, force);
  else raw = await PROVIDERS[acct.provider].events(req(acct), rawCal, start, end);
  const items = raw.map((e) => unify(cal, e));
  eventCache.set(key, { at: Date.now(), items });
  reconcileCalls(cal, items, start, end);
  return items;
}

function taskAsEvent(t) {
  if (!t.date) return null;
  const base = {
    id: t.id, calendarId: t.listId, calendarName: t.listName, color: t.color, kind: 'task',
    title: t.label, location: '', notes: t.notes, link: '', writable: false,
    leaveBy: t.leaveBy,
    piCall: !!(t.call && !t.call.quiet && !t.call.past), ...(t.call && !t.call.quiet && !t.call.past ? { callAt: t.call.at } : {}), done: t.done, goal: t.goal, repeat: t.repeat, madeHere: t.madeHere,
    provider: t.provider, mirror: t.mirror,
    movable: !t.mirror, // dragged to another day in the calendar (see moveTask); a ticked-off one too
  };
  if (t.start) {
    // A task with a pomodoro split has a real length; others are drawn as a short block.
    const minutes = t.pomodoro?.minutes || t.minutes || TASK_BLOCK_MINUTES;
    return { ...base, allDay: false, start: t.start, end: new Date(new Date(t.start).getTime() + minutes * 60000).toISOString() };
  }
  const day = toDate(t.date);
  return { ...base, allDay: true, start: t.date, end: localDate(new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1)) };
}

/**
 * Every event and dated task between `start` and `end` (ISO timestamps), across
 * all calendars that are switched on. Returns { events, errors }.
 */
/**
 * Tasks of one list that were done, for the calendar to show them where they were (ticked,
 * with a filled circle). Asked for by when they were done: from two months before the
 * range to now, so one finished late still shows on its own day.
 */
async function doneTasks(cal, start, end, force) {
  const key = `${cal.id}|${start}|${end}`;
  const hit = doneCache.get(key);
  if (hit && !force && Date.now() - hit.at < TASK_CACHE_MS) return hit.items;
  const { acct, rawCal } = parseId(cal.id);
  const from = new Date(new Date(start).getTime() - 60 * 86400000).toISOString();
  const to = new Date(Math.max(Date.now(), new Date(end).getTime()) + 86400000).toISOString();
  const raw = await PROVIDERS[acct.provider].completedTasks(req(acct), rawCal, from, to);
  const mirrors = new Set(Object.values(store.data.piLinks).map((l) => l.task));
  const items = raw.map((t) => unifyTask(cal, t, mirrors)).filter((t) => !t.mirror);
  doneCache.set(key, { at: Date.now(), items });
  return items;
}

async function getEvents(start, end, { includeHidden = false, force = false } = {}) {
  const hidden = store.data.settings.hidden;
  const shown = calendars().filter((c) => includeHidden || !hidden[c.id]);
  const errors = new Set();
  const from = new Date(start), to = new Date(end);
  const lists = await Promise.all(shown.map(async (cal) => {
    try {
      if (cal.kind === 'calendar') return await calendarEvents(cal, start, end, force);
      const open = (await listTasks(cal, force)).filter((t) => !t.mirror && !t.done);
      // Done ones too, so the calendar shows what was ticked off where it was planned.
      const done = await doneTasks(cal, start, end, force).catch(() => []);
      return [...open, ...done.map((t) => ({ ...t, done: true }))]
        .map(taskAsEvent)
        .filter((e) => e && toDate(e.end) > from && toDate(e.start) < to);
    } catch (err) {
      errors.add(err.message.includes(cal.accountLabel) ? err.message : `${cal.accountLabel}: ${err.message}`);
      return [];
    }
  }));
  const events = lists.flat()
    .map((e) => ({
      ...e, tags: tagsOf(keyOf(e)), memo: memoOf(keyOf(e)), pomodoro: pomodoroOf(keyOf(e)),
      ...(e.kind === 'event' ? { taskList: taskListOf(e) } : {}),
      // A block given a colour of its own wears it; its calendar's stays known for "Calendar colour".
      ...(e.kind === 'event' && store.data.eventColors[keyOf(e)] ? { color: store.data.eventColors[keyOf(e)], calColor: e.color, ownColor: true } : {}),
      // A calendar entry or block ticked off, like a task (kept in Onyx: each day of a repeat on its own).
      ...(e.kind === 'event' ? { done: !!store.data.doneEvents?.[e.id] } : {}),
    }))
    .concat(require('./goals').spans(start, end, includeHidden)) // goals.js needs this module: loaded late
    .sort((a, b) => toDate(a.start) - toDate(b.start));
  return { events, errors: [...errors] };
}

function eventFields(d) {
  const out = {};
  for (const k of ['title', 'notes', 'location']) if (k in d) out[k] = String(d[k] ?? '');
  if (d.start && d.end) {
    out.allDay = !!d.allDay;
    out.start = out.allDay ? String(d.start).slice(0, 10) : new Date(d.start).toISOString();
    out.end = out.allDay ? String(d.end).slice(0, 10) : new Date(d.end).toISOString();
    if (toDate(out.end) <= toDate(out.start)) throw new Error('The end must be after the start.');
  }
  return out;
}

/** Where a new time block goes when no calendar is named. */
function defaultCalendar() {
  const all = calendars().filter((c) => c.kind === 'calendar' && c.writable);
  return all.find((c) => c.id === store.data.settings.defaultCalendar) || all[0];
}

async function createEvent(data) {
  const cal = data.calendarId ? findCalendar(data.calendarId) : defaultCalendar();
  if (cal.kind !== 'calendar' || !cal.writable) throw new Error(`"${cal.name}" is read-only. Pick another calendar.`);
  const fields = eventFields(data);
  if (!fields.start) throw new Error('A start and end time are needed.');
  if (!fields.title && !data.blank) fields.title = 'Time block'; // a block dragged out on the calendar stays blank, to name later
  if (data.recur) {
    fields.recur = recur.normalize(data.recur, dayOfFields(fields));
    Object.assign(fields, alignToRule(fields, fields.recur));
  }
  const { acct, rawCal } = parseId(cal.id);
  let raw;
  if (acct.provider === 'local') {
    raw = { id: accounts.newId('e'), calendar: rawCal, notes: '', location: '', ...fields, ...(fields.recur ? { skip: [] } : {}) };
    store.data.local.events.push(raw);
    store.save();
    raw = { rawId: raw.id, ...raw };
  } else {
    raw = await PROVIDERS[acct.provider].createEvent(req(acct), rawCal, fields);
  }
  invalidate(cal.id);
  markMadeHere(`${cal.id}/${enc(raw.rawId)}`);
  const event = unify(cal, raw);
  if (data.tags) setTags(event.id, data.tags);
  if (data.leaveBy != null) setLeaveBy(event.id, data.leaveBy);
  return withCall(event, !!data.piCall, false, data.callBefore, data.callMode);
}

// The entry itself is already saved at this point, so a failure to set up the
// Pi call is reported as a warning beside it rather than as a failed save.
async function withCall(event, want, had, before, mode) {
  let warning = '';
  if (want || had) {
    try {
      await setPiCall(event, want, before, mode);
    } catch (err) {
      warning = `Saved, but the Pi phone reminder was not updated. ${err.message}`;
    }
  }
  return { ...event, ...callInfo(event.id, event.start), tags: tagsOf(keyOf(event)), memo: memoOf(keyOf(event)), warning };
}

// ---------------------------------------------------------------- repeating blocks

/** The local day a block starts on (local midnight). */
const dayOfFields = (f) => toDate(f.allDay ? String(f.start).slice(0, 10) : localDate(new Date(f.start)));
const dayOfStamp = (v) => toDate(String(v).length === 10 ? String(v) : localDate(new Date(v)));

/** A start and end moved onto `day`, keeping the time of day and the length. */
function onDay(f, day) {
  if (f.allDay) {
    const span = Math.round((toDate(f.end) - toDate(f.start)) / 86400000);
    return { start: localDate(day), end: localDate(new Date(day.getFullYear(), day.getMonth(), day.getDate() + span)) };
  }
  const s = new Date(f.start);
  const t = new Date(day.getFullYear(), day.getMonth(), day.getDate(), s.getHours(), s.getMinutes(), s.getSeconds());
  return { start: t.toISOString(), end: new Date(t.getTime() + (new Date(f.end) - s)).toISOString() };
}

/** A repeat begins on a day its rule falls on: the block's own day, or the next one that fits. */
function alignToRule(f, rule) {
  const day = dayOfFields(f);
  const first = recur.firstOnOrAfter(rule, day);
  if (!first) throw new Error('That repeat never falls on a day. Pick other days or dates.');
  return first.getTime() === day.getTime() ? {} : onDay(f, first);
}

const ruleKey = (r) => (r ? JSON.stringify([r.freq, r.days || [], r.dates || [], r.months || [], r.until || '']) : '');

/** A repeat's series as it is now: its first day, length and rule. */
async function seriesOf(acct, rawCal, rawSeries) {
  if (acct.provider === 'local') {
    const ev = store.data.local.events.find((e) => e.id === rawSeries);
    if (!ev) throw new Error('That repeating block no longer exists.');
    return { rawId: ev.id, ...ev };
  }
  return PROVIDERS[acct.provider].getEvent(req(acct), rawCal, rawSeries);
}

/**
 * A change to one day of a repeat, made to every day of it. Moving that day moves them all
 * by as much (Mon/Wed dragged a day later becomes Tue/Thu); a new time or length goes to
 * all; turning the repeat off ends it on that day (the ones before stay).
 */
async function updateSeries(id, patch) {
  const seriesId = patch.seriesId;
  const { acct, calendarId, rawCal, rawItem: rawSeries } = parseId(seriesId);
  const cal = findCalendar(calendarId);
  if (patch.calendarId && patch.calendarId !== calendarId) {
    throw new Error('A repeating block stays in its calendar. Turn the repeat off, or make a new one in the other calendar.');
  }
  if ('tags' in patch) setTags(seriesId, patch.tags);
  if (!cal.writable) throw new Error(`"${cal.name}" is read-only.`);
  if ('leaveBy' in patch) setLeaveBy(id, patch.leaveBy);
  const hadCall = !!store.data.piLinks[id];
  const wantCall = 'piCall' in patch ? !!patch.piCall : hadCall;

  const master = await seriesOf(acct, rawCal, rawSeries);
  const fields = eventFields(patch);
  const masterDay = dayOfStamp(master.start);
  const thisDay = patch.from ? dayOfStamp(patch.from) : null;
  const dayShift = fields.start && thisDay ? Math.round((dayOfFields(fields) - thisDay) / 86400000) : 0;

  let rule = master.recur || null;
  let ruleChanged = false;
  if ('recur' in patch && !patch.recur) {
    // Off: this day is its last.
    if (!rule || rule.custom) throw new Error('This repeat was set up in Google Calendar or Outlook. Stop it there.');
    rule = { ...rule, until: localDate(thisDay || new Date()) };
    ruleChanged = true;
  } else if (patch.recur && ruleKey(recur.normalize(patch.recur, masterDay)) !== ruleKey(rule)) {
    rule = recur.normalize(patch.recur, masterDay);
    ruleChanged = true;
  } else if (dayShift && rule) {
    if (rule.custom) throw new Error('This repeat was set up in Google Calendar or Outlook, so move its days there.');
    rule = recur.shift(rule, dayShift);
    ruleChanged = true;
  }

  // The series' first day moves with the change (its time and length are the ones given now).
  const base = { allDay: master.allDay, start: master.start, end: master.end };
  let times = fields.start
    ? { allDay: fields.allDay, ...onDay(fields, new Date(masterDay.getFullYear(), masterDay.getMonth(), masterDay.getDate() + dayShift)) }
    : null;
  if (ruleChanged && !rule.until) times = { ...(times || base), ...alignToRule(times || base, rule) };
  if (ruleChanged && !times) times = base;

  const payload = {};
  for (const k of ['title', 'notes', 'location']) if (k in fields) payload[k] = fields[k];
  if (times) Object.assign(payload, times);
  // The rule goes along when it changed, or with a new first day (Outlook keeps the two together);
  // one set up elsewhere that Onyx can't write back as it is stays untouched.
  if (ruleChanged || (times && rule && !rule.custom)) payload.recur = rule;

  let raw;
  if (acct.provider === 'local') {
    const ev = store.data.local.events.find((e) => e.id === rawSeries);
    Object.assign(ev, payload);
    store.save();
    raw = { rawId: ev.id, ...ev };
  } else {
    raw = await PROVIDERS[acct.provider].updateEvent(req(acct), rawCal, rawSeries, payload);
  }
  invalidate(cal.id);
  const ev = unify(cal, raw);
  const day = { ...ev, id, seriesId, start: fields.start || patch.from || ev.start, end: fields.end || ev.end };
  return withCall(day, wantCall, hadCall, 'callBefore' in patch ? patch.callBefore : undefined, patch.callMode);
}

async function updateEvent(id, patch) {
  if (patch.seriesId) return updateSeries(id, patch);
  const { acct, calendarId, rawCal, rawItem } = parseId(id);
  const cal = findCalendar(calendarId);
  const hadCall = !!store.data.piLinks[id];
  const wantCall = 'piCall' in patch ? !!patch.piCall : hadCall;

  // Saving to a different calendar is a copy followed by a delete.
  if (patch.calendarId && patch.calendarId !== calendarId) {
    const created = await createEvent({
      ...patch, piCall: wantCall, callBefore: 'callBefore' in patch ? patch.callBefore : callBeforeOf(id), tags: patch.tags || tagsOf(id),
      leaveBy: 'leaveBy' in patch ? patch.leaveBy : leaveByOf(id), callMode: patch.callMode || modeOf(id),
    });
    setLeaveBy(id, null);
    if (pomodoroOf(id)) store.data.pomodoro[created.id] = pomodoroOf(id); // the split goes with it
    if (store.data.blockTasks[id]) store.data.blockTasks[created.id] = store.data.blockTasks[id]; // and the tasks, ticks and all
    if (store.data.blockTicks[id]) store.data.blockTicks[created.id] = store.data.blockTicks[id];
    if (store.data.eventColors[id]) store.data.eventColors[created.id] = store.data.eventColors[id]; // and its colour
    await deleteEvent(id);
    return { ...created, pomodoro: pomodoroOf(created.id) };
  }
  if ('tags' in patch) setTags(id, patch.tags);
  if (!cal.writable) throw new Error(`"${cal.name}" is read-only.`);
  if ('leaveBy' in patch) setLeaveBy(id, patch.leaveBy);
  const fields = eventFields(patch);
  // A one-off block made to repeat: it becomes the series' first day (or moves to the first that fits).
  if (patch.recur && fields.start) {
    fields.recur = recur.normalize(patch.recur, dayOfFields(fields));
    Object.assign(fields, alignToRule(fields, fields.recur));
  }
  let raw;
  if (acct.provider === 'local') {
    const ev = store.data.local.events.find((e) => e.id === rawItem);
    if (!ev) throw new Error('That time block no longer exists.');
    if (fields.recur && !ev.skip) ev.skip = [];
    Object.assign(ev, fields);
    store.save();
    raw = { rawId: ev.id, ...ev };
  } else {
    raw = await PROVIDERS[acct.provider].updateEvent(req(acct), rawCal, rawItem, fields);
  }
  invalidate(cal.id);
  return withCall(unify(cal, raw), wantCall, hadCall, 'callBefore' in patch ? patch.callBefore : undefined, patch.callMode);
}

/**
 * Deletes an entry. A day of a repeat: `scope` 'all' deletes the whole series, 'one' just
 * that day (the rest go on).
 */
async function deleteEvent(id, { scope = 'all', seriesId = null } = {}) {
  if (seriesId && scope === 'all') return deleteEvent(seriesId);
  const { acct, calendarId, rawCal, rawItem } = parseId(id);
  const cal = findCalendar(calendarId);
  if (!cal.writable) throw new Error(`"${cal.name}" is read-only.`);
  if (seriesId) {
    if (acct.provider === 'local') {
      const [masterId, day] = rawItem.split('~');
      const master = store.data.local.events.find((e) => e.id === masterId);
      if (!master) throw new Error('That repeating block no longer exists.');
      master.skip = [...new Set([...(master.skip || []), day])];
      store.save();
    } else {
      await PROVIDERS[acct.provider].deleteEvent(req(acct), rawCal, rawItem); // Google and Outlook skip that day
    }
    invalidate(cal.id);
    await setPiCall({ id }, false).catch((err) => console.error('onyx: could not remove the Pi reminder:', err.message));
    return;
  }
  if (acct.provider === 'local') {
    if (!store.data.local.events.some((e) => e.id === rawItem)) throw new Error('That time block no longer exists.');
    store.data.local.events = store.data.local.events.filter((e) => e.id !== rawItem);
    store.save();
  } else {
    await PROVIDERS[acct.provider].deleteEvent(req(acct), rawCal, rawItem);
  }
  invalidate(cal.id);
  dropTags(id);
  setMemo(id, '');
  delete store.data.pomodoro[id];
  delete store.data.blockTasks[id];
  delete store.data.blockTicks[id];
  delete store.data.eventColors[id];
  await setPiCall({ id }, false).catch((err) => console.error('onyx: could not remove the Pi reminder:', err.message));
}

// ---------------------------------------------------------------- tasks

/** The goal a task is a step of, if any: { id, title, color }. */
function goalOfTask(id) {
  for (const g of store.data.goals) {
    // With its progress, for the bar on each of its steps in the calendar (goals.js loads late).
    if (g.steps.some((s) => s.taskId === id)) {
      let progress = null;
      try { progress = require('./goals').progressOf(g); } catch { /* shown without it */ }
      return { id: g.id, title: g.title, color: g.color, progress };
    }
  }
  return null;
}

/** Keeps a goal's step in line with a change made to its task. */
function syncStep(id, fields) {
  for (const g of store.data.goals) {
    for (const s of g.steps) {
      if (s.taskId !== id) continue;
      if ('title' in fields) s.title = fields.title;
      if ('time' in fields) { if (fields.time) s.time = fields.time; else delete s.time; }
      if ('due' in fields) s.due = fields.due;
      if ('done' in fields) s.done = fields.done;
      store.save();
    }
  }
}

function unifyTask(cal, t, mirrors) {
  const id = `${cal.id}/${enc(t.rawId)}`;
  const now = new Date();
  const p = parseName(t.title, now);
  const date = p.date || t.due;
  const start = date && p.time ? new Date(+date.slice(0, 4), +date.slice(5, 7) - 1, +date.slice(8, 10), p.time[0], p.time[1]) : null;
  const task = {
    id, listId: cal.id, listName: cal.name, color: cal.color, provider: cal.provider,
    title: t.title, label: p.date || p.time ? p.spoken : t.title, notes: t.notes,
    due: t.due, done: t.done, completed: t.completed || null, date, dateInName: !!p.date, time: p.time ? `${pad(p.time[0])}:${pad(p.time[1])}` : null,
    start: start ? start.toISOString() : null, mirror: mirrors.has(id), call: null, tags: tagsOf(id),
    // On the backburner: no date, kept for later. A date (however it came) takes it off.
    backburner: !date && !!store.data.backburner?.[id],
    goal: goalOfTask(id), repeat: store.data.repeats[id]?.rule || null, madeHere: store.data.madeHere[id] || null,
    pomodoro: pomodoroOf(id), minutes: store.data.taskMinutes?.[id] || null, leaveBy: leaveByOf(id),
    from: store.data.inboxItems?.[id]?.from || null, // the app that handed it over (Tamkeen, MCP), when it did
  };
  // The Pi only reads Google Tasks, and only phones for a task with a time in its name.
  const pi = store.data.settings.pi;
  // The Pi reads only Google Tasks; ntfy and Twilio (sent from this PC) work for any list.
  if (pi.enabled && (cal.provider === 'google' || require('./caller').sendsHere()) && start) {
    const c = callTime(start, pi);
    task.call = { at: c.at.toISOString(), quiet: c.quiet, past: start <= now };
  }
  return task;
}

async function listTasks(cal, force) {
  const hit = taskCache.get(cal.id);
  let raw;
  if (hit && !force && Date.now() - hit.at < TASK_CACHE_MS) {
    raw = hit.items;
  } else {
    const { acct, rawCal } = parseId(cal.id);
    raw = await PROVIDERS[acct.provider].tasks(req(acct), rawCal);
    taskCache.set(cal.id, { at: Date.now(), items: raw });
  }
  const mirrors = new Set(Object.values(store.data.piLinks).map((l) => l.task));
  const tasks = raw.map((t) => unifyTask(cal, t, mirrors));
  inbox.scanList(cal.id, tasks); // new arrivals from outside wait for Magic add
  return tasks;
}

/**
 * Every open task in every task list. Returns { tasks, errors, failed } (`failed`: the
 * lists that could not be read). A repeating task that was done elsewhere gets its next
 * one added here.
 */
async function getTasks({ force = false } = {}) {
  const errors = new Set();
  const failed = new Set();
  const all = calendars().filter((c) => c.kind === 'tasklist');
  const lists = await Promise.all(all.map(async (cal) => {
    try {
      return await listTasks(cal, force);
    } catch (err) {
      failed.add(cal.id);
      errors.add(err.message.includes(cal.accountLabel) ? err.message : `${cal.accountLabel}: ${err.message}`);
      return [];
    }
  }));
  let tasks = lists.flat();
  // Copies Google keeps adding of a repeat that was stopped (Stop all): out of sight, and deleted.
  const stopped = series.stoppedCopies(tasks);
  if (stopped.length) {
    if (sync.leads()) for (const t of stopped) deleteTask(t.id).catch((err) => console.error('onyx: could not delete a stopped repeat:', err.message));
    const gone = new Set(stopped);
    tasks = tasks.filter((t) => !gone.has(t));
  }
  // With linked desktops, one of them does this, or each would add the next task.
  if (Object.keys(store.data.repeats).length && sync.leads()) {
    const open = new Set(tasks.map((t) => t.id));
    tasks.push(...await repeat.reconcile(module.exports, open, failed, new Set(all.map((c) => c.id))));
  }
  series.annotate(tasks); // copies of a task that repeats in Google are marked as one series
  return { tasks, errors: [...errors], failed: [...failed], inbox: inbox.pendingIds(tasks) };
}

/** One task, open or done, as Onyx shows it; null when it was deleted. */
async function fetchTask(id) {
  const { acct, calendarId, rawCal, rawItem } = parseId(id);
  const raw = await PROVIDERS[acct.provider].getTask(req(acct), rawCal, rawItem);
  return raw && unifyTask(findCalendar(calendarId), raw, new Set());
}

/**
 * Makes a task repeat (`rule`: daily, weekdays, weekly, biweekly, monthly, yearly) or
 * stop repeating (null). A task without a date starts today.
 */
async function setRepeat(id, rule) {
  const { calendarId } = parseId(id);
  const cal = findCalendar(calendarId);
  const task = (await listTasks(cal, true)).find((t) => t.id === id);
  if (!task) throw Object.assign(new Error('That task no longer exists.'), { status: 404 });
  if (rule && task.mirror) throw new Error('This task follows a calendar entry for the Pi. It cannot repeat on its own.');
  repeat.setRule(id, rule);
  if (rule && !task.date) return updateTask(id, { due: localDate(new Date()) });
  return { ...task, repeat: repeat.ruleOf(id)?.rule || null };
}

/**
 * Tasks completed (archived) on local days `from` to `to` inclusive, 'YYYY-MM-DD'.
 * Completed tasks stay in Google Tasks and To Do; this reads them back, newest first.
 */
async function archivedTasks(from, to = from) {
  const day = (s) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(s || ''))) throw new Error('That is not a date.');
    const [y, m, d] = s.split('-').map(Number);
    return new Date(y, m - 1, d);
  };
  const min = day(from);
  const max = new Date(day(to).getTime() + 86400000);
  if (max <= min) throw new Error('The range ends before it starts.');
  const errors = new Set();
  const mirrors = new Set(Object.values(store.data.piLinks).map((l) => l.task));
  const lists = await Promise.all(calendars().filter((c) => c.kind === 'tasklist').map(async (cal) => {
    try {
      const { acct, rawCal } = parseId(cal.id);
      const raw = await PROVIDERS[acct.provider].completedTasks(req(acct), rawCal, min.toISOString(), max.toISOString());
      return raw.map((t) => unifyTask(cal, t, mirrors));
    } catch (err) {
      errors.add(`${cal.accountLabel}: ${err.message}`);
      return [];
    }
  }));
  const tasks = lists.flat().sort((a, b) => String(b.completed).localeCompare(String(a.completed)));
  return { tasks, errors: [...errors] };
}

function taskFields(d) {
  const out = {};
  if ('title' in d) out.title = String(d.title).trim();
  if ('notes' in d) out.notes = String(d.notes ?? '');
  if ('due' in d) out.due = d.due ? String(d.due).slice(0, 10) : null;
  if ('done' in d) out.done = !!d.done;
  return out;
}

function defaultTaskList() {
  const lists = calendars().filter((c) => c.kind === 'tasklist');
  const pick = lists.find((c) => c.id === store.data.settings.pi.taskList) || lists.find((c) => c.provider === 'google') || lists[0];
  if (!pick) throw new Error('Connect a Google or Outlook account first to use tasks.');
  return pick;
}

async function createTask(data) {
  const cal = data.listId ? findCalendar(data.listId) : defaultTaskList();
  const fields = taskFields(data);
  if (!fields.title) throw new Error('A task needs a name.');
  // "Dentist 3pm" with no date anywhere would never be called about (the Pi skips
  // a time without a date), so it gets the next day that time comes around.
  const named = parseName(fields.title);
  if (fields.due && named.date && named.date !== fields.due) {
    // A date picked in the add box wins over one typed in the name, which the Pi reads
    // first: the name is rewritten to say the picked day (keeping a time if it had one).
    const [y, m, d] = fields.due.split('-').map(Number);
    fields.title = named.time ? mirrorName(named.spoken, new Date(y, m - 1, d, named.time[0], named.time[1])) : named.spoken;
  }
  // A task for the backburner has no date: none is picked for it, even with a time in its name.
  if (data.backburner) delete fields.due;
  if (named.time && !named.date && !fields.due && !data.backburner) {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), named.time[0], named.time[1]);
    fields.due = localDate(today > now ? today : new Date(today.getTime() + 86400000));
  }
  const { acct, rawCal } = parseId(cal.id);
  const raw = await PROVIDERS[acct.provider].createTask(req(acct), rawCal, fields);
  invalidate(cal.id);
  markMadeHere(`${cal.id}/${enc(raw.rawId)}`);
  if (data.tags) setTags(`${cal.id}/${enc(raw.rawId)}`, data.tags);
  if (data.backburner && !named.date) setBackburner(`${cal.id}/${enc(raw.rawId)}`, true);
  if (data.inbox) inbox.add(`${cal.id}/${enc(raw.rawId)}`, String(data.inbox)); // another app made it: Magic add plans it
  return unifyTask(cal, raw, new Set());
}

/** Ticks a calendar entry or time block off (or brings it back). Kept in Onyx, never sent to the calendar. */
function setEventDone(id, done) {
  if (!store.data.doneEvents) store.data.doneEvents = {};
  if (done) store.data.doneEvents[id] = localDate(new Date()); else delete store.data.doneEvents[id];
  // Ticks older than a year are let go of, so the list doesn't grow for ever.
  const cut = localDate(new Date(Date.now() - 366 * 86400000));
  for (const [k, v] of Object.entries(store.data.doneEvents)) if (v < cut) delete store.data.doneEvents[k];
  store.save();
  return !!done;
}

/** Puts a task on the backburner (no date, kept for later) or takes it off. */
function setBackburner(id, on) {
  if (!store.data.backburner) store.data.backburner = {};
  if (on) store.data.backburner[id] = true; else delete store.data.backburner[id];
  store.save();
  return !!on;
}

async function updateTask(id, patch) {
  const { acct, calendarId, rawCal, rawItem } = parseId(id);
  const cal = findCalendar(calendarId);
  if ('tags' in patch) setTags(id, patch.tags);
  const fields = taskFields(patch);
  if (fields.due && store.data.backburner?.[id]) setBackburner(id, false); // scheduled: off the backburner
  let raw;
  if (Object.keys(fields).length) {
    raw = await PROVIDERS[acct.provider].updateTask(req(acct), rawCal, rawItem, fields);
    invalidate(cal.id);
  } else {
    raw = (taskCache.get(cal.id)?.items || []).find((t) => t.rawId === rawItem) || { rawId: rawItem, title: '', notes: '', due: null, done: false };
  }
  const task = unifyTask(cal, raw, new Set());
  // A goal's step keeps its plain name; a date and time written into the task's name are its due date and time.
  syncStep(id, { ...('title' in fields ? { title: task.label, time: task.time } : {}), ...('due' in fields ? { due: task.date } : {}), ...('done' in fields ? { done: fields.done } : {}) });
  // A repeating task that is done brings the next one; restoring it (Undo) takes that back.
  if (fields.done === true && task.repeat) return { ...task, next: await repeat.spawnNext(module.exports, task) };
  if (fields.done === false) await repeat.undoSpawn(module.exports, id);
  return { ...task, repeat: repeat.ruleOf(id)?.rule || null };
}

/**
 * Moves a task dragged in the calendar. `to` is { date: 'YYYY-MM-DD' } for a day, or
 * { start: ISO } for a time on a day. The due date changes, and so does the name when it
 * holds a date or time, because that is what the Pi (and Onyx) read first.
 */
async function moveTask(id, to) {
  const { calendarId } = parseId(id);
  const cal = findCalendar(calendarId);
  // A ticked-off task is not in the open list: it is read on its own and keeps its tick.
  const task = (await listTasks(cal, true)).find((t) => t.id === id) || await fetchTask(id).catch(() => null);
  if (!task) throw Object.assign(new Error('That task no longer exists.'), { status: 404 });
  if (task.mirror) throw new Error('This task follows a calendar entry for the Pi. Move the entry instead.');
  const named = parseName(task.title);
  const base = named.date || named.time ? named.spoken : task.title;
  if (to?.start) {
    const start = new Date(to.start);
    if (Number.isNaN(start.getTime())) throw new Error('That is not a time.');
    return updateTask(id, { title: mirrorName(base, start), due: localDate(start) });
  }
  const due = String(to?.date || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(due)) throw new Error('That is not a date.');
  // Onto a whole day: a date or time written in the name would pin it elsewhere, so it goes.
  return updateTask(id, { ...(base !== task.title ? { title: base } : {}), due });
}

/**
 * Plans a task into a block of the day (Magic add): its time goes into its name as when it is dragged on the
 * calendar, its length and travel are kept in Onyx. Returns { task, prev }: what to hand back to unplanTask.
 */
async function planTask(id, { start, minutes, leaveBy } = {}) {
  const { calendarId } = parseId(id);
  const cal = findCalendar(calendarId);
  const before = (await listTasks(cal, true)).find((t) => t.id === id);
  if (!before) throw Object.assign(new Error('That task no longer exists.'), { status: 404 });
  const prev = {
    title: before.title, due: before.due || null, minutes: store.data.taskMinutes?.[id] || null, leaveBy: leaveByOf(id),
    state: store.data.inboxItems?.[id]?.state || null, backburner: !!before.backburner,
  };
  const task = await moveTask(id, { start });
  setTaskMinutes(id, minutes);
  setLeaveBy(id, leaveBy);
  inbox.mark(id, 'planned');
  return { task: { ...task, minutes: store.data.taskMinutes[id] || null, leaveBy: leaveByOf(id) }, prev };
}

/**
 * A timed task's block resized on the calendar: a new start (its top edge moved) and a length. The length is
 * kept in Onyx, since Google Tasks and To Do have none.
 */
async function resizeTask(id, { start, minutes } = {}) {
  const { calendarId } = parseId(id);
  const cal = findCalendar(calendarId);
  const task = (await listTasks(cal, true)).find((t) => t.id === id) || await fetchTask(id).catch(() => null);
  if (!task) throw Object.assign(new Error('That task no longer exists.'), { status: 404 });
  if (task.mirror) throw new Error('This task follows a calendar entry for the Pi. Resize the entry instead.');
  let out = task;
  if (start && (!task.start || +new Date(start) !== +new Date(task.start))) out = await moveTask(id, { start });
  setTaskMinutes(id, minutes);
  if (store.data.pomodoro[id]) { store.data.pomodoro[id].minutes = store.data.taskMinutes[id] || store.data.pomodoro[id].minutes; store.save(); }
  return { ...out, minutes: store.data.taskMinutes[id] || null };
}

/** Takes a planned task back to how it was (undo of planTask). */
async function unplanTask(id, prev = {}) {
  await updateTask(id, { title: prev.title, due: prev.due || null });
  setTaskMinutes(id, prev.minutes);
  setLeaveBy(id, prev.leaveBy);
  // Back where it was: on the backburner, or waiting among what other apps sent (a task that never was stays out of that).
  if (prev.backburner) setBackburner(id, true);
  inbox.mark(id, prev.state && prev.state !== 'planned' ? prev.state : prev.state ? 'new' : 'seen');
  return true;
}

function setTaskMinutes(id, minutes) {
  store.data.taskMinutes ??= {};
  const n = Math.round(Number(minutes));
  if (!Number.isFinite(n) || n < 5) delete store.data.taskMinutes[id];
  else store.data.taskMinutes[id] = Math.min(n, 12 * 60);
  store.save();
}

const linkSent = []; // when each link task arrived, to hold a runaway sender back

/**
 * A task handed over by another app through onyx://task (see deeplink.js): it is made (or, with the same
 * id, updated), kept for Magic add with the length the app gave, and returned for the window to plan.
 * Returns { taskId, title, date, minutes, from, created }.
 */
async function receiveTask(link) {
  const t = parseTaskLink(link);
  if (!t) throw new Error('That link is not a task Onyx understands.');
  const now = Date.now();
  while (linkSent.length && now - linkSent[0] > 60000) linkSent.shift();
  if (linkSent.length >= 12) throw new Error('Too many tasks were sent at once. Try again in a minute.');
  linkSent.push(now);

  store.data.linkedTasks ??= {};
  const key = t.id ? `${t.from}:${t.id}` : null;
  const due = t.due || localDate(new Date());
  let task = null, created = false;
  const known = key && store.data.linkedTasks[key];
  if (known) {
    try {
      const cur = await fetchTask(known);
      if (cur && !cur.done) {
        // Already planned into a block: its time stays; otherwise it is brought up to date.
        task = cur.start ? cur : await updateTask(known, { title: t.title, notes: t.notes, due });
      }
    } catch { /* gone: made again below */ }
  }
  if (!task) {
    task = await createTask({ title: t.title, notes: t.notes, due, inbox: t.from });
    created = true;
    if (key) store.data.linkedTasks[key] = task.id;
  }
  if (t.minutes) setTaskMinutes(task.id, t.minutes);
  if (!task.start) inbox.mark(task.id, 'new'); // sent again after "Not now": it is wanted
  if (!store.data.inboxItems[task.id]?.from) store.data.inboxItems[task.id] = { ...store.data.inboxItems[task.id], at: now, from: t.from };
  store.save();
  return { taskId: task.id, title: t.title, date: task.date || due, minutes: t.minutes, from: t.from, created };
}

/** "Not now": the task stays in its list but leaves the Magic add inbox. */
function dismissInbox(id) {
  inbox.mark(id, 'dismissed');
  return true;
}

async function deleteTask(id) {
  const { acct, calendarId, rawCal, rawItem } = parseId(id);
  await PROVIDERS[acct.provider].deleteTask(req(acct), rawCal, rawItem);
  invalidate(calendarId);
  dropTags(id);
  if (store.data.repeats[id]) delete store.data.repeats[id];
  delete store.data.pomodoro[id];
  delete store.data.taskMinutes?.[id];
  delete store.data.leaveBy?.[id];
  inbox.forget(id);
  for (const g of store.data.goals) for (const s of g.steps) if (s.taskId === id) s.taskId = null;
  store.save();
}

// ---------------------------------------------------------------- tags
// Tags live only in Onyx (never written to Google or Microsoft), keyed by the
// event or task id, so they work the same on every kind of calendar.

const TAG_COLORS = ['#8b7cff', '#4aa8ff', '#3fd0c9', '#5fd38d', '#f5b83d', '#ff9f4a', '#ff6b6b', '#ff7eb6', '#c69a6d', '#9aa0a8'];
const MAX_TAGS = 12;

const tagsOf = (id) => store.data.tags[id] || [];

function cleanTags(list) {
  const out = [];
  const seen = new Set();
  for (const raw of Array.isArray(list) ? list : String(list || '').split(',')) {
    const tag = String(raw).replace(/^#+/, '').replace(/\s+/g, ' ').trim().slice(0, 40);
    if (!tag || seen.has(tag.toLowerCase())) continue;
    // Reuse the spelling of a tag that already exists ("Study" stays "Study" when typed as "study").
    const known = Object.keys(store.data.tagColors).find((t) => t.toLowerCase() === tag.toLowerCase());
    seen.add(tag.toLowerCase());
    out.push(known || tag);
    if (out.length >= MAX_TAGS) break;
  }
  return out;
}

function ensureColor(tag) {
  const colors = store.data.tagColors;
  if (!colors[tag]) colors[tag] = TAG_COLORS[Object.keys(colors).length % TAG_COLORS.length];
}

/** Replaces the tags on one event or task. Returns the tags as saved. */
function setTags(id, list) {
  const tags = cleanTags(list);
  if (tags.length) store.data.tags[id] = tags; else delete store.data.tags[id];
  tags.forEach(ensureColor);
  store.save();
  return tags;
}

function dropTags(id) {
  if (store.data.tags[id]) {
    delete store.data.tags[id];
    store.save();
  }
}

// ---------------------------------------------------------------- memos
// Your own notes on an entry Onyx cannot write notes to (a read-only calendar or a
// subscribed feed). Entries that can be written keep their notes in Google or Outlook.

const MAX_NOTE = 8000;
const memoOf = (id) => store.data.memos[id] || '';

/** Sets (or, when empty, clears) the memo on one entry. Returns it as saved. */
function setMemo(id, text) {
  if (!id) throw new Error('Nothing to attach the note to.');
  const memo = String(text ?? '').replace(/\s+$/, '').slice(0, MAX_NOTE);
  if (memo === memoOf(id)) return memo;
  if (memo) store.data.memos[id] = memo; else delete store.data.memos[id];
  store.save();
  return memo;
}

/** Every tag with its colour and how many entries carry it. */
function allTags() {
  const counts = {};
  for (const list of Object.values(store.data.tags)) for (const t of list) counts[t] = (counts[t] || 0) + 1;
  return Object.keys(counts).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
    .map((name) => ({ name, color: store.data.tagColors[name] || TAG_COLORS[0], count: counts[name] }));
}

function setTagColor(tag, color) {
  if (!/^#[0-9a-f]{6}$/i.test(String(color))) throw new Error('Colours look like #8b7cff.');
  store.data.tagColors[tag] = color;
  store.save();
}

/** Renames a tag everywhere, merging it into another tag if that name is taken. */
function renameTag(from, to) {
  const [name] = cleanTags([to]);
  if (!name) throw new Error('A tag needs a name.');
  for (const [id, list] of Object.entries(store.data.tags)) {
    if (list.includes(from)) store.data.tags[id] = cleanTags(list.map((t) => (t === from ? name : t)));
  }
  if (!store.data.tagColors[name]) store.data.tagColors[name] = store.data.tagColors[from];
  if (name !== from) delete store.data.tagColors[from];
  ensureColor(name);
  store.save();
  return name;
}

function deleteTag(tag) {
  for (const [id, list] of Object.entries(store.data.tags)) {
    const rest = list.filter((t) => t !== tag);
    if (rest.length) store.data.tags[id] = rest; else delete store.data.tags[id];
  }
  delete store.data.tagColors[tag];
  store.save();
}

// ---------------------------------------------------------------- Raspberry Pi calls
// The Pi phones about Google Tasks that have a time in their name, and knows
// nothing about calendar events. So "call me about this event" keeps a matching
// Google Task (the mirror) in step with the event. piLinks remembers the pairs.

function piTaskList() {
  const lists = calendars().filter((c) => c.kind === 'tasklist' && c.provider === 'google');
  const pick = lists.find((c) => c.id === store.data.settings.pi.taskList) || lists[0];
  if (!pick) throw new Error('The Pi reads Google Tasks, so connect a Google account in Settings first.');
  return pick;
}

// A call time picked for an entry is kept as minutes before its start, so it moves with
// the entry. It reaches the Pi as a "Call at" line in the task's notes (task_caller.py);
// a Pi without that update still calls lead_minutes before.
const PI_NOTE = 'Phone reminder for a calendar entry. Managed by Onyx Calendar.';
const callBeforeOf = (id) => store.data.piLinks[id]?.before ?? null;

function cleanBefore(before) {
  if (before == null || before === '') return null;
  const n = Math.round(Number(before));
  if (!Number.isFinite(n) || n < -12 * 60 || n > 24 * 60) throw new Error('Pick a call time from a day before it starts to 12 hours after.');
  return n;
}

// ---- leave-by times and the escalation ladder
// Travel time ("leaveBy"): the first minutes of an entry's block, spent getting there. You set
// off when the block starts and are there when the travel part ends. Kept in Onyx, by entry.
// The escalation is how you are reached at that time, one or more of: 'push' (an alert, no
// ringing), 'call' (a phone call), 'critical' (a call every 10 minutes, up to three, until one
// is answered or you tap "Leaving now"), and 'alarm' (the phone rings a full-screen alarm,
// Onyx on Android). "Leaving now", or a call answered, stops the rest.
const MODES = ['push', 'call', 'critical', 'alarm'];
const CRITICAL_CALLS = 3;
const CRITICAL_GAP_MS = 10 * 60000;
const leaveByOf = (id) => store.data.leaveBy?.[id] ?? null;

/** An escalation as a set, in a fixed order: from a list, one mode, or "push+alarm". Critical includes the call. */
function cleanModes(m) {
  const asked = Array.isArray(m) ? m : String(m || '').split(/[+,\s]+/);
  const set = new Set(asked.filter((x) => MODES.includes(x)));
  if (set.has('critical')) set.delete('call');
  return MODES.filter((x) => set.has(x));
}
const modesOf = (id) => { const l = store.data.piLinks[id]; return l ? (cleanModes(l.modes || l.mode || 'call').length ? cleanModes(l.modes || l.mode || 'call') : ['call']) : []; };
/** The strongest of an entry's modes ('off' for none), for what reads one mode (older desktops, the Pi's notes). */
const primaryMode = (modes) => (modes.includes('critical') ? 'critical' : modes.includes('call') ? 'call' : modes.includes('alarm') ? 'alarm' : modes.includes('push') ? 'push' : 'off');
const modeOf = (id) => primaryMode(modesOf(id));

function setLeaveBy(id, minutes) {
  store.data.leaveBy ??= {};
  if (minutes == null || minutes === '' || Number(minutes) === 0) {
    delete store.data.leaveBy[id];
  } else {
    const n = Math.round(Number(minutes));
    if (!Number.isFinite(n) || n < 1 || n > 6 * 60) throw new Error('Travel time can be up to 6 hours.');
    store.data.leaveBy[id] = n;
  }
  store.save();
  return leaveByOf(id);
}

/**
 * When the Pi reaches out about an entry starting at `start`: [{ at, kind }]. Empty when it
 * uses its own usual time (lead_minutes) or the call was acknowledged. The Pi looks every
 * settings.pi.checkEvery minutes, so a call comes at the last look before the time asked.
 */
function piAlerts(start, { before = null, leaveBy = null, mode = 'call', modes = null, ack = false } = {}) {
  if (ack) return [];
  const set = cleanModes(modes || mode);
  // With travel time the call is to set off: at the block's start (the trip is inside it).
  const base = before != null ? start.getTime() - before * 60000 : leaveBy ? start.getTime() : null;
  if (base == null || !set.length) return [];
  // The Pi looks every few minutes (a call comes at its last look before the time); this PC and the phone keep the minute.
  const grid = (require('./caller').method() === 'pi' ? Math.max(1, Number(store.data.settings.pi?.checkEvery) || 30) : 1) * 60000;
  const first = new Date(Math.floor(base / grid) * grid);
  const out = [];
  if (set.includes('push')) out.push({ at: first, kind: 'push' });
  if (set.includes('call')) out.push({ at: first, kind: 'call' });
  // Critical: a call every 10 minutes (or at each of the Pi's looks, if further apart), up to three.
  if (set.includes('critical')) {
    for (let i = 0; i < CRITICAL_CALLS; i++) out.push({ at: new Date(first.getTime() + i * Math.max(grid, CRITICAL_GAP_MS)), kind: 'call', critical: i + 1 });
  }
  if (set.includes('alarm')) out.push({ at: first, kind: 'alarm' });
  return out;
}

const stamp = (d) => `${localDate(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;

function callNotes(start, opts) {
  const lines = [PI_NOTE];
  if (opts.ack) {
    lines.push('Acknowledged: yes'); // "Leaving now" was pressed: no more calls about this one
  } else {
    // The Pi reads one way of reaching you per entry: its calls when there are any, else a push, else
    // nothing at all (an alarm is the phone's own).
    const set = cleanModes(opts.modes || opts.mode);
    const alerts = piAlerts(start, opts);
    const calls = alerts.filter((a) => a.kind === 'call');
    if (!calls.length && set.includes('push')) lines.push('Alert: push only');
    if (set.includes('critical')) lines.push('Escalation: critical');
    if (!calls.length && !set.includes('push') && set.includes('alarm')) lines.push('Alert: phone alarm'); // the phone rings; the Pi neither calls nor pushes
    for (const a of calls.length ? calls : alerts.slice(0, 1)) lines.push(`Call at: ${stamp(a.at)}`);
  }
  return lines.join('\n');
}

/** What an entry's reminder looks like, for the window: on, mode, call time, leave-by, alert times. */
function callInfo(id, start) {
  const link = store.data.piLinks[id];
  const s = start ? new Date(start) : null;
  const opts = link && s && !Number.isNaN(+s) ? { before: link.before ?? null, leaveBy: leaveByOf(id), modes: modesOf(id), ack: !!link.ack && link.start === s.toISOString() } : null;
  return {
    piCall: !!link, callBefore: callBeforeOf(id), callMode: modeOf(id), callModes: modesOf(id), leaveBy: leaveByOf(id), callAck: !!opts?.ack,
    piAlerts: opts ? piAlerts(s, opts).map((a) => ({ at: a.at.toISOString(), kind: a.kind, ...(a.critical ? { critical: a.critical } : {}) })) : [],
  };
}

/** "Leaving now": the Pi makes no more calls about this entry (until it is moved). */
async function ackPiCall(id) {
  const link = store.data.piLinks[id];
  if (!link) return false;
  link.ack = true;
  store.save();
  if (link.task) await updateTask(link.task, { notes: callNotes(new Date(link.start), { ack: true }) }).catch((err) => { if (err.status !== 404 && err.status !== 410) throw err; });
  return true;
}

/**
 * Switches the Pi call for an entry on or off. `before`: minutes before the start to call
 * (null: at leave-by, or the usual lead; undefined: keep). `mode`: one or more of push, call, critical,
 * alarm (a list, or one; undefined: keep).
 */
async function setPiCall(event, on, before, mode) {
  const links = store.data.piLinks;
  const link = links[event.id];
  const keep = before === undefined ? link?.before ?? null : cleanBefore(before);
  const asked = mode === undefined ? null : cleanModes(mode);
  const keepModes = asked?.length ? asked : link ? modesOf(event.id) : ['call'];
  const keepMode = primaryMode(keepModes);
  // The Pi needs a time of day, so an all-day entry can't have a call.
  if (!on || event.allDay) {
    if (link) {
      if (link.task) await deleteTask(link.task).catch((err) => { if (err.status !== 404 && err.status !== 410) throw err; });
      delete links[event.id];
      store.save();
    }
    return false;
  }
  const start = new Date(event.start);
  // An acknowledgement only holds for the same start: moved, it can ring again.
  const ack = !!link?.ack && link.start === start.toISOString();
  const fields = { title: mirrorName(event.title, start), due: localDate(start), notes: callNotes(start, { before: keep, leaveBy: leaveByOf(event.id), modes: keepModes, ack }) };
  const saved = (task) => ({
    task, start: start.toISOString(), title: event.title, ...(keep != null ? { before: keep } : {}),
    // `mode` (the strongest) for desktops from before several could be picked; `modes`, all of them.
    ...(keepMode !== 'call' ? { mode: keepMode } : {}), ...(keepModes.length > 1 || keepModes[0] !== keepMode ? { modes: keepModes } : {}), ...(ack ? { ack: true } : {}),
  });
  // Without the Pi there is no task for it to read: the reminder is kept here, and this PC
  // (ntfy, Twilio) or the phone (an alarm) acts on it.
  if (require('./caller').method() !== 'pi') {
    if (link?.task) await deleteTask(link.task).catch(() => {});
    links[event.id] = saved(null);
    store.save();
    return true;
  }
  if (link?.task) {
    try {
      await updateTask(link.task, fields);
      links[event.id] = saved(link.task);
      store.save();
      return true;
    } catch (err) {
      if (err.status !== 404 && err.status !== 410) throw err; // the task was deleted elsewhere: make a new one
    }
  }
  const task = await createTask({ ...fields, listId: piTaskList().id });
  links[event.id] = saved(task.id);
  store.save();
  return true;
}

/**
 * After a calendar is re-read: an event that was moved or deleted in another app
 * (Google's site, Outlook, a phone) must move or drop its Pi call too.
 */
function reconcileCalls(cal, items, start, end) {
  if (!sync.leads()) return; // one linked desktop keeps the Pi tasks in step, not all of them
  const from = new Date(start), to = new Date(end);
  const byId = new Map(items.map((e) => [e.id, e]));
  for (const [eventId, link] of Object.entries(store.data.piLinks)) {
    if (!eventId.startsWith(cal.id + '/')) continue;
    const linked = new Date(link.start);
    const event = byId.get(eventId);
    let job = null;
    // With the Pi, a reminder kept without its task (saved while another way was picked) gets one now.
    const needsTask = event && !link.task && !event.allDay && require('./caller').method() === 'pi';
    if (event && (needsTask || event.allDay || new Date(event.start).getTime() !== linked.getTime() || event.title !== link.title)) {
      job = setPiCall(event, !event.allDay);
    } else if (!event && linked >= from && linked < to) {
      job = setPiCall({ id: eventId }, false);
    }
    if (job) job.catch((err) => console.error('onyx: could not update a Pi reminder:', err.message));
  }
}

// ---------------------------------------------------------------- free time

/** Gaps of at least `minMinutes` on one day, between `dayStart` and `dayEnd` ("HH:MM"). */
async function freeTime(date, { minMinutes = 30, dayStart = '08:00', dayEnd = '18:00' } = {}) {
  const day = toDate(String(date).slice(0, 10));
  const at = (hm) => { const [h, m] = hm.split(':').map(Number); return new Date(day.getFullYear(), day.getMonth(), day.getDate(), h, m); };
  const from = at(dayStart), to = at(dayEnd);
  const { events } = await getEvents(from.toISOString(), to.toISOString());
  const busy = events.filter((e) => !e.allDay).map((e) => [new Date(e.start), new Date(e.end)]).sort((a, b) => a[0] - b[0]);
  const gaps = [];
  let cursor = from;
  for (const [s, e] of busy) {
    if (s - cursor >= minMinutes * 60000) gaps.push({ start: cursor.toISOString(), end: s.toISOString(), minutes: Math.round((s - cursor) / 60000) });
    if (e > cursor) cursor = e;
  }
  if (to - cursor >= minMinutes * 60000) gaps.push({ start: cursor.toISOString(), end: to.toISOString(), minutes: Math.round((to - cursor) / 60000) });
  return gaps;
}

// ---------------------------------------------------------------- local calendars

function addLocalCalendar(name, color) {
  const cal = { id: accounts.newId('c'), name: String(name).trim() || 'Calendar', color: color || '#8b7cff' };
  store.data.local.calendars.push(cal);
  store.save();
  return cal;
}

function removeLocalCalendar(id) {
  const { rawCal } = parseId(id);
  if (store.data.local.calendars.length <= 1) throw new Error('Keep at least one calendar on this PC.');
  store.data.local.calendars = store.data.local.calendars.filter((c) => c.id !== rawCal);
  store.data.local.events = store.data.local.events.filter((e) => e.calendar !== rawCal);
  store.save();
  invalidate(id);
}

module.exports = {
  calendars, refreshCalendars, invalidate, getEvents, setBackburner, setEventDone, createEvent, updateEvent, deleteEvent, setLeaveBy, ackPiCall, piAlerts,
  getTasks, archivedTasks, fetchTask, createTask, updateTask, moveTask, resizeTask, receiveTask, planTask, unplanTask, dismissInbox, deleteTask, setRepeat, setPomodoro, setBlockTasks, tickBlockTask, setEventColor, setPiCall, freeTime, addLocalCalendar, removeLocalCalendar,
  setTags, allTags, setTagColor, renameTag, deleteTag, setMemo, MAX_NOTE,
  callNotes, piTaskList, // Hyperfocus gives the Pi its stop the same way (focus.js)
};
