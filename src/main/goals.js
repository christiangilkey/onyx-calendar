// Long-term goals: a name, a time frame and the steps toward it. The goal itself lives
// in Onyx; each step is a real task in Google Tasks / To Do (so it shows in the Tasks
// panel, on the calendar and on the phone, and the Pi phones about it when its name
// holds a time). The calendar draws the time frame as one bar, and the globe shows the
// goal as one node that stands for all of its steps.

const crypto = require('crypto');
const store = require('./store');
const hub = require('./hub');

const MAX_STEPS = 100;
const MAX_GOALS = 60;
const COLORS = ['#ffb547', '#8b7cff', '#3fd0c9', '#5fd38d', '#ff7eb6', '#4aa8ff', '#ff9f4a'];

const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ''));
const dayAfter = (s) => ymd(new Date(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10) + 1));
const newId = (prefix) => `${prefix}${crypto.randomBytes(6).toString('hex')}`;
const listOf = (taskId) => taskId.slice(0, taskId.lastIndexOf('/'));

const all = () => store.data.goals;
function find(id) {
  const g = all().find((x) => x.id === id);
  if (!g) throw Object.assign(new Error('That goal no longer exists.'), { status: 404 });
  return g;
}

function out(g) {
  const total = g.steps.length;
  const done = g.steps.filter((s) => s.done).length;
  return {
    ...g, steps: g.steps.map((s) => ({ ...s })), tags: store.data.tags[g.id] || [],
    progress: { done, total, percent: total ? Math.round((done / total) * 100) : 0 },
  };
}

/** Name, notes, time frame and colour from what the window sent. */
function fields(d, current = {}) {
  const f = {};
  if ('title' in d || !current.title) {
    f.title = String(d.title || '').trim().slice(0, 200);
    if (!f.title) throw new Error('A goal needs a name.');
  }
  if ('notes' in d) f.notes = String(d.notes || '').replace(/\s+$/, '').slice(0, hub.MAX_NOTE);
  const start = 'start' in d ? d.start : current.start || ymd(new Date());
  const end = 'end' in d ? d.end : current.end;
  if (!isDate(start)) throw new Error('Pick the day the goal starts.');
  if (!isDate(end)) throw new Error('Pick a target date for the goal.');
  if (end < start) throw new Error('The target date is before the start.');
  Object.assign(f, { start, end });
  if ('color' in d && /^#[0-9a-f]{6}$/i.test(d.color || '')) f.color = d.color;
  if ('listId' in d && d.listId) {
    const list = hub.calendars().find((c) => c.id === d.listId && c.kind === 'tasklist');
    if (!list) throw new Error('That task list is not connected.');
    f.listId = list.id;
  }
  return f;
}

/**
 * Brings the goal's steps in line with `incoming` ([{ id?, title, due, done }]): new
 * steps get a task, changed ones update theirs, removed ones delete their open task.
 * Returns warnings (the goal is saved even when a task could not be changed).
 */
async function syncSteps(g, incoming) {
  const warnings = [];
  const warn = (s, err) => warnings.push(`"${s.title}": ${err.message}`);
  const old = new Map(g.steps.map((s) => [s.id, s]));
  const next = [];
  const addTask = async (s) => {
    if (!g.listId || s.done) return;
    try {
      const t = await hub.createTask({ title: s.title, due: s.due, listId: g.listId, notes: `A step toward: ${g.title}` });
      s.taskId = t.id;
      s.due = t.date || s.due;
    } catch (err) { warn(s, err); }
  };
  for (const raw of (incoming || []).slice(0, MAX_STEPS)) {
    const title = String(raw?.title || '').trim().slice(0, 300);
    if (!title) continue;
    const due = isDate(raw.due) ? raw.due : null;
    const done = !!raw.done;
    let s = old.get(raw.id);
    if (!s) {
      s = { id: newId('s'), title, due, done, taskId: null };
      await addTask(s);
    } else {
      old.delete(s.id);
      const patch = {};
      if (title !== s.title) patch.title = title;
      if (due !== s.due) patch.due = due;
      if (done !== s.done) patch.done = done;
      Object.assign(s, { title, due, done });
      if (s.taskId && Object.keys(patch).length) {
        try {
          await hub.updateTask(s.taskId, patch);
        } catch (err) {
          if (err.status === 404) { s.taskId = null; await addTask(s); } else warn(s, err);
        }
      } else if (!s.taskId) {
        await addTask(s); // a step from before a task list was connected
      }
    }
    next.push(s);
  }
  for (const s of old.values()) {
    if (s.taskId && !s.done) await hub.deleteTask(s.taskId).catch((err) => { if (err.status !== 404) warn(s, err); });
  }
  g.steps = next;
  return warnings;
}

async function create(data = {}) {
  if (all().length >= MAX_GOALS) throw new Error(`Up to ${MAX_GOALS} goals.`);
  const f = fields(data);
  let listId = f.listId;
  if (!listId) {
    const lists = hub.calendars().filter((c) => c.kind === 'tasklist');
    listId = (lists.find((c) => c.id === store.data.settings.pi.taskList) || lists.find((c) => c.provider === 'google') || lists[0])?.id || null;
  }
  const g = {
    id: newId('goal/'), notes: '', color: COLORS[all().length % COLORS.length], ...f, listId,
    steps: [], created: new Date().toISOString(),
  };
  all().push(g);
  if (data.tags) hub.setTags(g.id, data.tags);
  const warnings = await syncSteps(g, data.steps);
  store.save();
  return { ...out(g), warnings };
}

async function update(id, data = {}) {
  const g = find(id);
  Object.assign(g, fields(data, g));
  if ('tags' in data) hub.setTags(g.id, data.tags);
  const warnings = 'steps' in data ? await syncSteps(g, data.steps) : [];
  store.save();
  return { ...out(g), warnings };
}

/** Deletes a goal and, unless `keepTasks`, the open tasks of its steps. */
async function remove(id, { keepTasks = false } = {}) {
  const g = find(id);
  if (!keepTasks) {
    for (const s of g.steps) {
      if (s.taskId && !s.done) await hub.deleteTask(s.taskId).catch((err) => { if (err.status !== 404) throw err; });
    }
  }
  store.data.goals = all().filter((x) => x !== g);
  hub.setTags(g.id, []);
  delete store.data.settings.hidden[g.id];
  store.save();
}

/**
 * Every goal with its progress. Steps follow their tasks: a renamed or moved task
 * renames or moves its step, and one that is no longer open (done in Google, say)
 * counts as done. Lists that could not be read are left alone.
 */
async function list({ force = false } = {}) {
  if (all().some((g) => g.steps.some((s) => s.taskId))) {
    const { tasks, failed = [] } = await hub.getTasks({ force });
    const open = new Map(tasks.map((t) => [t.id, t]));
    const lists = new Set(hub.calendars().filter((c) => c.kind === 'tasklist').map((c) => c.id));
    const skip = new Set(failed);
    let changed = false;
    for (const g of all()) {
      for (const s of g.steps) {
        if (!s.taskId) continue;
        const t = open.get(s.taskId);
        const next = t
          ? { title: t.title, due: t.date || null, done: false }
          : lists.has(listOf(s.taskId)) && !skip.has(listOf(s.taskId)) ? { done: true } : null;
        if (next && Object.entries(next).some(([k, v]) => s[k] !== v)) { Object.assign(s, next); changed = true; }
      }
    }
    if (changed) store.save();
  }
  return all().map(out);
}

/** The goals' time frames as all-day bars for the calendar, between `start` and `end`. */
function spans(start, end, includeHidden = false) {
  const from = start.slice(0, 10), to = end.slice(0, 10);
  return all()
    .filter((g) => (includeHidden || !store.data.settings.hidden[g.id]) && g.start < to && dayAfter(g.end) > from)
    .map((g) => {
      const o = out(g);
      return {
        id: g.id, calendarId: g.id, calendarName: 'Goals', color: g.color, kind: 'goal',
        title: g.title, allDay: true, start: g.start, end: dayAfter(g.end),
        location: '', notes: g.notes || '', link: '', writable: false, tags: o.tags, progress: o.progress,
      };
    });
}

module.exports = { list, create, update, remove, spans };
