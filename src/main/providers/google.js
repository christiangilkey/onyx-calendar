// Google Calendar and Google Tasks.
// Every function takes `req`, an authorised request bound to one account.

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

function toEvent(e) {
  const allDay = !!e.start?.date;
  return {
    rawId: e.id, title: e.summary || '(No title)', allDay,
    start: allDay ? e.start.date : e.start.dateTime,
    end: allDay ? e.end.date : e.end.dateTime,
    location: e.location || '', notes: e.description || '', link: e.htmlLink || '',
  };
}

async function events(req, calId, start, end) {
  const out = [];
  let page = '';
  do {
    const q = new URLSearchParams({ timeMin: start, timeMax: end, singleEvents: 'true', orderBy: 'startTime', maxResults: '2500' });
    if (page) q.set('pageToken', page);
    const res = await req(`${CAL}/calendars/${enc(calId)}/events?${q}`);
    for (const e of res.items || []) if (e.status !== 'cancelled' && e.start) out.push(toEvent(e));
    page = res.nextPageToken || '';
  } while (page);
  return out;
}

// On an update, the unused half of start/end is cleared so an event can switch
// between all-day and timed.
function body(d, patch) {
  const b = {};
  if ('title' in d) b.summary = d.title;
  if ('notes' in d) b.description = d.notes;
  if ('location' in d) b.location = d.location;
  if (d.start && d.end) {
    const side = (v) => (d.allDay
      ? { date: v.slice(0, 10), ...(patch ? { dateTime: null, timeZone: null } : {}) }
      : { dateTime: new Date(v).toISOString(), ...(patch ? { date: null } : {}) });
    b.start = side(d.start);
    b.end = side(d.end);
  }
  return b;
}

const createEvent = async (req, calId, d) =>
  toEvent(await req(`${CAL}/calendars/${enc(calId)}/events`, { method: 'POST', body: body(d, false) }));

const updateEvent = async (req, calId, id, d) =>
  toEvent(await req(`${CAL}/calendars/${enc(calId)}/events/${enc(id)}`, { method: 'PATCH', body: body(d, true) }));

const deleteEvent = (req, calId, id) =>
  req(`${CAL}/calendars/${enc(calId)}/events/${enc(id)}`, { method: 'DELETE' });

const toTask = (t) => ({
  rawId: t.id, title: (t.title || '').trim(), notes: t.notes || '',
  due: t.due ? t.due.slice(0, 10) : null, done: t.status === 'completed',
});

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

module.exports = { calendars, events, createEvent, updateEvent, deleteEvent, tasks, createTask, updateTask, deleteTask };
