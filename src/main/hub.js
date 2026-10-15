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

function unify(cal, e) {
  const id = `${cal.id}/${enc(e.rawId)}`;
  return {
    id, calendarId: cal.id, calendarName: cal.name, color: cal.color, kind: 'event',
    title: e.title, start: e.start, end: e.end, allDay: !!e.allDay,
    location: e.location || '', notes: e.notes || '', link: e.link || '',
    writable: cal.writable, piCall: !!store.data.piLinks[id], madeHere: store.data.madeHere[id] || null,
  };
}

function localEvents(rawCal, start, end) {
  const from = new Date(start), to = new Date(end);
  return store.data.local.events
    .filter((e) => e.calendar === rawCal && toDate(e.end) > from && toDate(e.start) < to)
    .map((e) => ({ rawId: e.id, ...e }));
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
    piCall: !!(t.call && !t.call.quiet && !t.call.past), done: t.done, goal: t.goal, repeat: t.repeat, madeHere: t.madeHere,
    provider: t.provider, mirror: t.mirror,
    movable: !t.mirror && !t.done, // dragged to another day in the calendar (see moveTask)
  };
  if (t.start) {
    return { ...base, allDay: false, start: t.start, end: new Date(new Date(t.start).getTime() + TASK_BLOCK_MINUTES * 60000).toISOString() };
  }
  const day = toDate(t.date);
  return { ...base, allDay: true, start: t.date, end: localDate(new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1)) };
}

/**
 * Every event and dated task between `start` and `end` (ISO timestamps), across
 * all calendars that are switched on. Returns { events, errors }.
 */
async function getEvents(start, end, { includeHidden = false, force = false } = {}) {
  const hidden = store.data.settings.hidden;
  const shown = calendars().filter((c) => includeHidden || !hidden[c.id]);
  const errors = new Set();
  const from = new Date(start), to = new Date(end);
  const lists = await Promise.all(shown.map(async (cal) => {
    try {
      if (cal.kind === 'calendar') return await calendarEvents(cal, start, end, force);
      return (await listTasks(cal, force))
        .filter((t) => !t.mirror && !t.done)
        .map(taskAsEvent)
        .filter((e) => e && toDate(e.end) > from && toDate(e.start) < to);
    } catch (err) {
      errors.add(err.message.includes(cal.accountLabel) ? err.message : `${cal.accountLabel}: ${err.message}`);
      return [];
    }
  }));
  const events = lists.flat()
    .map((e) => ({ ...e, tags: tagsOf(e.id), memo: memoOf(e.id) }))
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
  if (!fields.title) fields.title = 'Time block';
  const { acct, rawCal } = parseId(cal.id);
  let raw;
  if (acct.provider === 'local') {
    raw = { id: accounts.newId('e'), calendar: rawCal, notes: '', location: '', ...fields };
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
  return withCall(event, !!data.piCall, false);
}

// The entry itself is already saved at this point, so a failure to set up the
// Pi call is reported as a warning beside it rather than as a failed save.
async function withCall(event, want, had) {
  let warning = '';
  if (want || had) {
    try {
      await setPiCall(event, want);
    } catch (err) {
      warning = `Saved, but the Pi phone reminder was not updated. ${err.message}`;
    }
  }
  return { ...event, piCall: !!store.data.piLinks[event.id], tags: tagsOf(event.id), memo: memoOf(event.id), warning };
}

async function updateEvent(id, patch) {
  const { acct, calendarId, rawCal, rawItem } = parseId(id);
  const cal = findCalendar(calendarId);
  const hadCall = !!store.data.piLinks[id];
  const wantCall = 'piCall' in patch ? !!patch.piCall : hadCall;

  // Saving to a different calendar is a copy followed by a delete.
  if (patch.calendarId && patch.calendarId !== calendarId) {
    const created = await createEvent({ ...patch, piCall: wantCall, tags: patch.tags || tagsOf(id) });
    await deleteEvent(id);
    return created;
  }
  if ('tags' in patch) setTags(id, patch.tags);
  if (!cal.writable) throw new Error(`"${cal.name}" is read-only.`);
  const fields = eventFields(patch);
  let raw;
  if (acct.provider === 'local') {
    const ev = store.data.local.events.find((e) => e.id === rawItem);
    if (!ev) throw new Error('That time block no longer exists.');
    Object.assign(ev, fields);
    store.save();
    raw = { rawId: ev.id, ...ev };
  } else {
    raw = await PROVIDERS[acct.provider].updateEvent(req(acct), rawCal, rawItem, fields);
  }
  invalidate(cal.id);
  return withCall(unify(cal, raw), wantCall, hadCall);
}

async function deleteEvent(id) {
  const { acct, calendarId, rawCal, rawItem } = parseId(id);
  const cal = findCalendar(calendarId);
  if (!cal.writable) throw new Error(`"${cal.name}" is read-only.`);
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
  await setPiCall({ id }, false).catch((err) => console.error('onyx: could not remove the Pi reminder:', err.message));
}

// ---------------------------------------------------------------- tasks

/** The goal a task is a step of, if any: { id, title, color }. */
function goalOfTask(id) {
  for (const g of store.data.goals) {
    if (g.steps.some((s) => s.taskId === id)) return { id: g.id, title: g.title, color: g.color };
  }
  return null;
}

/** Keeps a goal's step in line with a change made to its task. */
function syncStep(id, fields) {
  for (const g of store.data.goals) {
    for (const s of g.steps) {
      if (s.taskId !== id) continue;
      if ('title' in fields) s.title = fields.title;
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
    goal: goalOfTask(id), repeat: store.data.repeats[id]?.rule || null, madeHere: store.data.madeHere[id] || null,
  };
  // The Pi only reads Google Tasks, and only phones for a task with a time in its name.
  const pi = store.data.settings.pi;
  if (pi.enabled && cal.provider === 'google' && start) {
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
  return raw.map((t) => unifyTask(cal, t, mirrors));
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
  const tasks = lists.flat();
  if (Object.keys(store.data.repeats).length) {
    const open = new Set(tasks.map((t) => t.id));
    tasks.push(...await repeat.reconcile(module.exports, open, failed, new Set(all.map((c) => c.id))));
  }
  series.annotate(tasks); // copies of a task that repeats in Google are marked as one series
  return { tasks, errors: [...errors], failed: [...failed] };
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
  if (named.time && !named.date && !fields.due) {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), named.time[0], named.time[1]);
    fields.due = localDate(today > now ? today : new Date(today.getTime() + 86400000));
  }
  const { acct, rawCal } = parseId(cal.id);
  const raw = await PROVIDERS[acct.provider].createTask(req(acct), rawCal, fields);
  invalidate(cal.id);
  markMadeHere(`${cal.id}/${enc(raw.rawId)}`);
  if (data.tags) setTags(`${cal.id}/${enc(raw.rawId)}`, data.tags);
  return unifyTask(cal, raw, new Set());
}

async function updateTask(id, patch) {
  const { acct, calendarId, rawCal, rawItem } = parseId(id);
  const cal = findCalendar(calendarId);
  if ('tags' in patch) setTags(id, patch.tags);
  const fields = taskFields(patch);
  let raw;
  if (Object.keys(fields).length) {
    raw = await PROVIDERS[acct.provider].updateTask(req(acct), rawCal, rawItem, fields);
    invalidate(cal.id);
  } else {
    raw = (taskCache.get(cal.id)?.items || []).find((t) => t.rawId === rawItem) || { rawId: rawItem, title: '', notes: '', due: null, done: false };
  }
  const task = unifyTask(cal, raw, new Set());
  syncStep(id, { ...('title' in fields ? { title: task.title } : {}), ...('due' in fields ? { due: task.date } : {}), ...('done' in fields ? { done: fields.done } : {}) });
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
  const task = (await listTasks(cal, true)).find((t) => t.id === id);
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

async function deleteTask(id) {
  const { acct, calendarId, rawCal, rawItem } = parseId(id);
  await PROVIDERS[acct.provider].deleteTask(req(acct), rawCal, rawItem);
  invalidate(calendarId);
  dropTags(id);
  if (store.data.repeats[id]) delete store.data.repeats[id];
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

async function setPiCall(event, on) {
  const links = store.data.piLinks;
  const link = links[event.id];
  // The Pi needs a time of day, so an all-day entry can't have a call.
  if (!on || event.allDay) {
    if (link) {
      await deleteTask(link.task).catch((err) => { if (err.status !== 404 && err.status !== 410) throw err; });
      delete links[event.id];
      store.save();
    }
    return false;
  }
  const start = new Date(event.start);
  const fields = { title: mirrorName(event.title, start), due: localDate(start) };
  if (link) {
    try {
      await updateTask(link.task, fields);
      links[event.id] = { task: link.task, start: start.toISOString(), title: event.title };
      store.save();
      return true;
    } catch (err) {
      if (err.status !== 404 && err.status !== 410) throw err; // the task was deleted elsewhere: make a new one
    }
  }
  const task = await createTask({ ...fields, listId: piTaskList().id, notes: 'Phone reminder for a calendar entry. Managed by Onyx Calendar.' });
  links[event.id] = { task: task.id, start: start.toISOString(), title: event.title };
  store.save();
  return true;
}

/**
 * After a calendar is re-read: an event that was moved or deleted in another app
 * (Google's site, Outlook, a phone) must move or drop its Pi call too.
 */
function reconcileCalls(cal, items, start, end) {
  const from = new Date(start), to = new Date(end);
  const byId = new Map(items.map((e) => [e.id, e]));
  for (const [eventId, link] of Object.entries(store.data.piLinks)) {
    if (!eventId.startsWith(cal.id + '/')) continue;
    const linked = new Date(link.start);
    const event = byId.get(eventId);
    let job = null;
    if (event && (event.allDay || new Date(event.start).getTime() !== linked.getTime() || event.title !== link.title)) {
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
  calendars, refreshCalendars, invalidate, getEvents, createEvent, updateEvent, deleteEvent,
  getTasks, archivedTasks, fetchTask, createTask, updateTask, moveTask, deleteTask, setRepeat, setPiCall, freeTime, addLocalCalendar, removeLocalCalendar,
  setTags, allTags, setTagColor, renameTag, deleteTag, setMemo, MAX_NOTE,
};
