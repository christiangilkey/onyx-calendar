// Outlook calendars and Microsoft To Do, through Microsoft Graph.
// Every function takes `req`, an authorised request bound to one account.

const recurRule = require('../recur');

const GRAPH = 'https://graph.microsoft.com/v1.0';
const UTC = { Prefer: 'outlook.timezone="UTC"' };
const enc = encodeURIComponent;

// Graph's named colours, for calendars that have no custom hex colour.
const COLORS = {
  lightBlue: '#4aa8ff', lightGreen: '#5fd38d', lightOrange: '#ff9f4a', lightGray: '#9aa0a8',
  lightYellow: '#f5d04a', lightTeal: '#3fd0c9', lightPink: '#ff7eb6', lightBrown: '#c69a6d',
  lightRed: '#ff6b6b', auto: '#4aa8ff',
};

async function all(req, url, headers) {
  const out = [];
  while (url) {
    const res = await req(url, { headers });
    out.push(...(res.value || []));
    url = res['@odata.nextLink'] || '';
  }
  return out;
}

async function calendars(req) {
  const out = [];
  for (const c of await all(req, `${GRAPH}/me/calendars?$top=100`)) {
    out.push({
      rawId: c.id, kind: 'calendar', name: c.name || 'Calendar',
      color: c.hexColor || COLORS[c.color] || '#4aa8ff',
      primary: !!c.isDefaultCalendar, writable: c.canEdit !== false,
    });
  }
  for (const l of await all(req, `${GRAPH}/me/todo/lists?$top=100`)) {
    out.push({ rawId: l.id, kind: 'tasklist', name: l.displayName || 'Tasks', color: '#f5b83d', writable: true });
  }
  return out;
}

// Graph sends "2026-10-14T15:00:00.0000000" in the zone asked for (UTC here).
const fromGraph = (t) => `${t.dateTime.slice(0, 19)}Z`;

function toEvent(e, rule = null) {
  const allDay = !!e.isAllDay;
  const start = allDay ? e.start.dateTime.slice(0, 10) : fromGraph(e.start);
  return {
    rawId: e.id, title: e.subject || '(No title)', allDay,
    start, end: allDay ? e.end.dateTime.slice(0, 10) : fromGraph(e.end),
    location: e.location?.displayName || '', notes: e.bodyPreview || '', link: e.webLink || '',
    // One day of a repeat: its series, and the rule it repeats by.
    ...(e.seriesMasterId ? { seriesRawId: e.seriesMasterId } : {}),
    recur: rule || (e.recurrence ? recurRule.fromGraph(e.recurrence, start) : null),
  };
}

const SELECT = 'id,subject,start,end,isAllDay,location,bodyPreview,webLink,isCancelled,seriesMasterId,type';

async function events(req, calId, start, end) {
  const q = new URLSearchParams({ startDateTime: start, endDateTime: end, $top: '250', $select: SELECT });
  const items = (await all(req, `${GRAPH}/me/calendars/${enc(calId)}/calendarView?${q}`, UTC)).filter((e) => !e.isCancelled);
  // Each repeat's rule, from its series.
  const rules = new Map();
  const ids = [...new Set(items.map((e) => e.seriesMasterId).filter(Boolean))].slice(0, 30);
  await Promise.all(ids.map(async (id) => {
    try {
      const m = await req(`${GRAPH}/me/events/${enc(id)}?$select=start,isAllDay,recurrence`, { headers: UTC });
      rules.set(id, recurRule.fromGraph(m.recurrence, m.isAllDay ? m.start.dateTime.slice(0, 10) : fromGraph(m.start)));
    } catch {
      // shown without its rule
    }
  }));
  return items.map((e) => toEvent(e, rules.get(e.seriesMasterId) || null));
}

/** A series (or any one event) as it is: its first day, length and rule. */
async function getEvent(req, calId, id) {
  return toEvent(await req(`${GRAPH}/me/events/${enc(id)}?$select=${SELECT},recurrence`, { headers: UTC }));
}

const ZONE = () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
const pad2 = (n) => String(n).padStart(2, '0');
const localStamp = (v) => {
  const t = new Date(v);
  return `${t.getFullYear()}-${pad2(t.getMonth() + 1)}-${pad2(t.getDate())}T${pad2(t.getHours())}:${pad2(t.getMinutes())}:00`;
};

function body(d) {
  const b = {};
  if ('title' in d) b.subject = d.title;
  if ('notes' in d) b.body = { contentType: 'text', content: d.notes };
  if ('location' in d) b.location = { displayName: d.location };
  // A repeat keeps local time (and so the same hour across daylight saving); one-offs go in UTC.
  const local = !!d.recur;
  if (d.start && d.end) {
    const side = (v) => (d.allDay
      ? { dateTime: `${v.slice(0, 10)}T00:00:00`, timeZone: local ? ZONE() : 'UTC' }
      : local ? { dateTime: localStamp(v), timeZone: ZONE() } : { dateTime: new Date(v).toISOString().slice(0, 19), timeZone: 'UTC' });
    b.isAllDay = !!d.allDay;
    b.start = side(d.start);
    b.end = side(d.end);
  }
  if ('recur' in d) {
    const first = d.start ? (d.allDay ? d.start.slice(0, 10) : localStamp(d.start).slice(0, 10)) : null;
    b.recurrence = d.recur && first ? recurRule.toGraph(d.recur, first, ZONE()) : null;
  }
  return b;
}

const createEvent = async (req, calId, d) =>
  toEvent(await req(`${GRAPH}/me/calendars/${enc(calId)}/events`, { method: 'POST', body: body(d), headers: UTC }));

const updateEvent = async (req, calId, id, d) =>
  toEvent(await req(`${GRAPH}/me/events/${enc(id)}`, { method: 'PATCH', body: body(d), headers: UTC }));

const deleteEvent = (req, calId, id) => req(`${GRAPH}/me/events/${enc(id)}`, { method: 'DELETE' });

const pad = (n) => String(n).padStart(2, '0');

// A To Do due date is local midnight stored in UTC; read it back as a local date.
function dueDate(t) {
  if (!t.dueDateTime?.dateTime) return null;
  const d = new Date(`${t.dueDateTime.dateTime.slice(0, 19)}Z`);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const toTask = (t) => ({
  rawId: t.id, title: (t.title || '').trim(),
  notes: t.body?.contentType === 'text' ? (t.body.content || '') : '',
  due: dueDate(t), done: t.status === 'completed',
  completed: t.completedDateTime?.dateTime ? `${t.completedDateTime.dateTime.slice(0, 19)}Z` : null,
});

async function tasks(req, listId) {
  const q = new URLSearchParams({ $filter: "status ne 'completed'", $top: '100' });
  const items = await all(req, `${GRAPH}/me/todo/lists/${enc(listId)}/tasks?${q}`);
  return items.map(toTask).filter((t) => t.title);
}

/** Tasks completed between `from` and `to` (ISO timestamps): the Archived tab. */
async function completedTasks(req, listId, from, to) {
  const q = new URLSearchParams({ $filter: "status eq 'completed'", $top: '100' });
  const items = await all(req, `${GRAPH}/me/todo/lists/${enc(listId)}/tasks?${q}`);
  return items.map(toTask).filter((t) => t.title && t.completed && t.completed >= from && t.completed < to);
}

function taskBody(d) {
  const b = {};
  if ('title' in d) b.title = d.title;
  if ('notes' in d) b.body = { contentType: 'text', content: d.notes };
  if ('due' in d) {
    b.dueDateTime = d.due
      ? { dateTime: `${d.due}T00:00:00`, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone }
      : null;
  }
  if ('done' in d) b.status = d.done ? 'completed' : 'notStarted';
  return b;
}

const createTask = async (req, listId, d) =>
  toTask(await req(`${GRAPH}/me/todo/lists/${enc(listId)}/tasks`, { method: 'POST', body: taskBody(d) }));

const updateTask = async (req, listId, id, d) =>
  toTask(await req(`${GRAPH}/me/todo/lists/${enc(listId)}/tasks/${enc(id)}`, { method: 'PATCH', body: taskBody(d) }));

const deleteTask = (req, listId, id) =>
  req(`${GRAPH}/me/todo/lists/${enc(listId)}/tasks/${enc(id)}`, { method: 'DELETE' });

/** One task, open or completed; null when it was deleted. */
async function getTask(req, listId, id) {
  try {
    return toTask(await req(`${GRAPH}/me/todo/lists/${enc(listId)}/tasks/${enc(id)}`));
  } catch (err) {
    if (err.status === 404) return null;
    throw err;
  }
}

module.exports = { calendars, events, getEvent, createEvent, updateEvent, deleteEvent, tasks, completedTasks, getTask, createTask, updateTask, deleteTask };
