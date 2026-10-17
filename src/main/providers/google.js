// Google Calendar and Google Tasks.
// Every function takes `req`, an authorised request bound to one account.

const recurRule = require('../recur');

const CAL = 'https://www.googleapis.com/calendar/v3';
const TASKS = 'https://tasks.googleapis.com/tasks/v1';
const enc = encodeURIComponent;

async function calendars(req) {
  const out = [];
  let page = '';
  do {
    const res = await req(`${CAL}/users/me/calendarList?maxResults=250${page && `&pageToken=${enc(page)}`}`);
    for (const c of res.items || []) {
      out.push({
        rawId: c.id, kind: 'calendar', name: c.summaryOverride || c.summary || 'Calendar',
        color: c.backgroundColor || '#4f8cff', primary: !!c.primary,
        writable: c.accessRole === 'owner' || c.accessRole === 'writer',
      });
    }
    page = res.nextPageToken || '';
  } while (page);
  const lists = await req(`${TASKS}/users/@me/lists?maxResults=100`);
  for (const l of lists.items || []) {
    out.push({ rawId: l.id, kind: 'tasklist', name: l.title || 'Tasks', color: '#f5b83d', writable: true });
  }
  return out;
}

// A repeat's rule, from a series (its first event and its RRULE).
const ruleOf = (master) => (master?.recurrence ? recurRule.fromRRule(master.recurrence, master.start?.date || master.start?.dateTime) : null);

function toEvent(e, rule = null) {
  const allDay = !!e.start?.date;
  return {
    rawId: e.id, title: e.summary || '(No title)', allDay,
    start: allDay ? e.start.date : e.start.dateTime,
    end: allDay ? e.end.date : e.end.dateTime,
    location: e.location || '', notes: e.description || '', link: e.htmlLink || '',
    // One day of a repeat: its series, and the rule it repeats by.
    ...(e.recurringEventId ? { seriesRawId: e.recurringEventId } : {}),
    recur: rule || ruleOf(e),
  };
}

async function list(req, calId, params) {
  const out = [];
  let page = '';
  do {
    const q = new URLSearchParams({ ...params, maxResults: '2500' });
    if (page) q.set('pageToken', page);
    const res = await req(`${CAL}/calendars/${enc(calId)}/events?${q}`);
    out.push(...(res.items || []));
    page = res.nextPageToken || '';
  } while (page);
  return out;
}

async function events(req, calId, start, end) {
  // The days themselves, and the series they come from (for each repeat's rule).
  const [items, series] = await Promise.all([
    list(req, calId, { timeMin: start, timeMax: end, singleEvents: 'true', orderBy: 'startTime' }),
    list(req, calId, { timeMin: start, timeMax: end, singleEvents: 'false' }).catch(() => []),
  ]);
  const masters = new Map(series.filter((m) => m.recurrence).map((m) => [m.id, m]));
  const missing = [...new Set(items.map((e) => e.recurringEventId).filter((id) => id && !masters.has(id)))].slice(0, 30);
  await Promise.all(missing.map(async (id) => {
    try { masters.set(id, await req(`${CAL}/calendars/${enc(calId)}/events/${enc(id)}`)); } catch { /* shown without its rule */ }
  }));
  return items.filter((e) => e.status !== 'cancelled' && e.start).map((e) => toEvent(e, ruleOf(masters.get(e.recurringEventId))));
}

/** A series (or any one event) as it is: its first day, length and rule. */
async function getEvent(req, calId, id) {
  return toEvent(await req(`${CAL}/calendars/${enc(calId)}/events/${enc(id)}`));
}

// On an update, the unused half of start/end is cleared so an event can switch
// between all-day and timed.
// A timed repeat needs its time zone, so it stays at the same local time across daylight saving.
const ZONE = () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

function body(d, patch) {
  const b = {};
  if ('title' in d) b.summary = d.title;
  if ('notes' in d) b.description = d.notes;
  if ('location' in d) b.location = d.location;
  if (d.start && d.end) {
    const side = (v) => (d.allDay
      ? { date: v.slice(0, 10), ...(patch ? { dateTime: null, timeZone: null } : {}) }
      : { dateTime: new Date(v).toISOString(), timeZone: ZONE(), ...(patch ? { date: null } : {}) });
    b.start = side(d.start);
    b.end = side(d.end);
  }
  if ('recur' in d) b.recurrence = d.recur ? [recurRule.toRRule(d.recur, !!d.allDay)] : [];
  return b;
}

/** Creates an event; with `d.recur`, a repeating one (the series). */
const createEvent = async (req, calId, d) =>
  toEvent(await req(`${CAL}/calendars/${enc(calId)}/events`, { method: 'POST', body: body(d, false) }));

const updateEvent = async (req, calId, id, d) =>
  toEvent(await req(`${CAL}/calendars/${enc(calId)}/events/${enc(id)}`, { method: 'PATCH', body: body(d, true) }));

const deleteEvent = (req, calId, id) =>
  req(`${CAL}/calendars/${enc(calId)}/events/${enc(id)}`, { method: 'DELETE' });

const toTask = (t) => ({
  rawId: t.id, title: (t.title || '').trim(), notes: t.notes || '',
  due: t.due ? t.due.slice(0, 10) : null, done: t.status === 'completed', completed: t.completed || null,
});

/** Tasks completed between `from` and `to` (ISO timestamps): the Archived tab. */
async function completedTasks(req, listId, from, to) {
  const out = [];
  let page = '';
  do {
    const q = new URLSearchParams({ showCompleted: 'true', showHidden: 'true', completedMin: from, completedMax: to, maxResults: '100' });
    if (page) q.set('pageToken', page);
    const res = await req(`${TASKS}/lists/${enc(listId)}/tasks?${q}`);
    for (const t of res.items || []) if (t.status === 'completed' && (t.title || '').trim() && !t.deleted) out.push(toTask(t));
    page = res.nextPageToken || '';
  } while (page);
  return out;
}

async function tasks(req, listId) {
  const out = [];
  let page = '';
  do {
    const q = new URLSearchParams({ showCompleted: 'false', showHidden: 'false', maxResults: '100' });
    if (page) q.set('pageToken', page);
    const res = await req(`${TASKS}/lists/${enc(listId)}/tasks?${q}`);
    for (const t of res.items || []) if ((t.title || '').trim()) out.push(toTask(t));
    page = res.nextPageToken || '';
  } while (page);
  return out;
}

// Google Tasks keeps only the date of `due`; the time of day lives in the task's name.
function taskBody(d) {
  const b = {};
  if ('title' in d) b.title = d.title;
  if ('notes' in d) b.notes = d.notes;
  if ('due' in d) b.due = d.due ? `${d.due}T00:00:00.000Z` : null;
  if ('done' in d) {
    b.status = d.done ? 'completed' : 'needsAction';
    if (!d.done) b.completed = null;
  }
  return b;
}

const createTask = async (req, listId, d) =>
  toTask(await req(`${TASKS}/lists/${enc(listId)}/tasks`, { method: 'POST', body: taskBody(d) }));

const updateTask = async (req, listId, id, d) =>
  toTask(await req(`${TASKS}/lists/${enc(listId)}/tasks/${enc(id)}`, { method: 'PATCH', body: taskBody(d) }));

const deleteTask = (req, listId, id) =>
  req(`${TASKS}/lists/${enc(listId)}/tasks/${enc(id)}`, { method: 'DELETE' });

/** One task, open or completed; null when it was deleted. */
async function getTask(req, listId, id) {
  try {
    const t = await req(`${TASKS}/lists/${enc(listId)}/tasks/${enc(id)}`);
    return t.deleted ? null : toTask(t);
  } catch (err) {
    if (err.status === 404) return null;
    throw err;
  }
}

module.exports = { calendars, events, getEvent, createEvent, updateEvent, deleteEvent, tasks, completedTasks, getTask, createTask, updateTask, deleteTask };
