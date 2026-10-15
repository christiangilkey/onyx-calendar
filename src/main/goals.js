// Long-term goals: a name, a time frame and the steps toward it. The goal itself lives
// in Onyx; each step is a real task in Google Tasks / To Do (so it shows in the Tasks
// panel, on the calendar and on the phone, and the Pi phones about it when its name
// holds a time). The calendar draws the time frame as one bar, and the globe shows the
// goal as one node that stands for all of its steps.

const crypto = require('crypto');
const store = require('./store');
const hub = require('./hub');
const repeat = require('./repeat');
const { mirrorName } = require('./taskname');

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

// A step is done once (a checkbox), or repeats (daily, weekdays, weekly): a repeating
// step's task comes back after each time it is done, and every time counts toward it.
// A repeating step can have a time of day ("HH:MM"): like any task's time, it is written
// into the task's name (so the calendar places it and the Pi phones about it), and each
// next task keeps it (repeat.js).
const STEP_REPEATS = ['daily', 'weekdays', 'weekly'];
const isTime = (s) => /^([01]\d|2[0-3]):[0-5]\d$/.test(String(s || ''));
const at = (day, time) => new Date(+day.slice(0, 4), +day.slice(5, 7) - 1, +day.slice(8, 10), +time.slice(0, 2), +time.slice(3, 5));
/** The name a step's task carries on `due`: with the step's time, when it has one. */
const taskName = (title, due, time) => (time && due ? mirrorName(title, at(due, time)) : title);

/** How many times a repeating step is due between `start` and `end` (inclusive). */
function timesDue(rule, start, end) {
  const from = new Date(+start.slice(0, 4), +start.slice(5, 7) - 1, +start.slice(8, 10));
  const to = new Date(+end.slice(0, 4), +end.slice(5, 7) - 1, +end.slice(8, 10));
  const span = Math.round((to - from) / 86400000) + 1;
  if (span <= 0) return 1;
  if (rule === 'weekly') return Math.max(1, Math.ceil(span / 7));
  if (rule === 'weekdays') {
    let n = 0;
    for (let i = 0; i < span; i++) { const d = new Date(from.getFullYear(), from.getMonth(), from.getDate() + i).getDay(); if (d % 6) n++; }
    return Math.max(1, n);
  }
  return span;
}

function stepOut(g, s) {
  if (!s.repeat) return { ...s };
  const target = timesDue(s.repeat, g.start, g.end);
  const log = s.log || [];
  return { ...s, log: [...log], count: log.length, target, doneToday: log.some((e) => e.date === ymd(new Date())) };
}

/**
 * Progress: a one-off step counts when done; a repeating step counts in part, by how
 * many of its due days were done (12 of 90 days is 0.13 of a step).
 */
function out(g) {
  const steps = g.steps.map((s) => stepOut(g, s));
  const total = steps.length;
  const share = steps.reduce((sum, s) => sum + (s.repeat ? Math.min(1, s.count / s.target) : s.done ? 1 : 0), 0);
  const done = steps.filter((s) => (s.repeat ? s.count >= s.target : s.done)).length;
  return {
    ...g, steps, tags: store.data.tags[g.id] || [],
    progress: { done, total, percent: total ? Math.round((share / total) * 100) : 0 },
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
      // A repeating step starts on the goal's first day (or today, if that has passed).
      const due = s.due || (s.repeat ? [g.start, ymd(new Date())].sort().at(-1) : null);
      const t = await hub.createTask({ title: taskName(s.title, due, s.time), due, listId: g.listId, notes: `A step toward: ${g.title}` });
      s.taskId = t.id;
      s.due = t.date || due;
      if (s.repeat) repeat.setRule(t.id, s.repeat);
    } catch (err) { warn(s, err); }
  };
  for (const raw of (incoming || []).slice(0, MAX_STEPS)) {
    const title = String(raw?.title || '').trim().slice(0, 300);
    if (!title) continue;
    const rule = STEP_REPEATS.includes(raw.repeat) ? raw.repeat : null;
    const due = isDate(raw.due) ? raw.due : null;
    const done = rule ? false : !!raw.done; // a repeating step is never done once and for all
    const time = rule && isTime(raw.time) ? raw.time : null;
    let s = old.get(raw.id);
    if (!s) {
      s = { id: newId('s'), title, due, done, taskId: null, ...(rule ? { repeat: rule, log: [] } : {}), ...(time ? { time } : {}) };
      await addTask(s);
    } else {
      old.delete(s.id);
      if ((s.repeat || null) !== rule) {
        if (rule) { s.repeat = rule; s.log ||= []; } else delete s.repeat;
        if (s.taskId) repeat.setRule(s.taskId, rule);
      }
      const patch = {};
      if (title !== s.title) patch.title = title;
      if (due !== s.due && !(rule && !due)) patch.due = due;
      if (done !== s.done) patch.done = done;
      // A new or cleared time, or a new name for a step with a time: the task's name says it.
      if ((s.time || null) !== time || ('title' in patch && time)) patch.title = taskName(title, 'due' in patch ? due : s.due, time);
      Object.assign(s, { title, due: 'due' in patch ? due : s.due, done });
      if (time) s.time = time; else delete s.time;
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
        // A repeating step's next task was already added (repeat.reconcile, in getTasks).
        // Its name is the task's without the date and time, which the step keeps apart.
        const next = t
          ? { title: s.repeat ? t.label : t.title, due: t.date || null, done: false }
          : !s.repeat && lists.has(listOf(s.taskId)) && !skip.has(listOf(s.taskId)) ? { done: true } : null;
        if (next && Object.entries(next).some(([k, v]) => s[k] !== v)) { Object.assign(s, next); changed = true; }
        if (t && s.repeat && (s.time || null) !== (t.time || null)) {
          if (t.time) s.time = t.time; else delete s.time;
          changed = true;
        }
      }
    }
    if (changed) store.save();
  }
  return all().map(out);
}

/**
 * Ticks a step (or unticks it) straight away, without saving the rest of the goal. For
 * a repeating step, ticked means done today: its task is done (so the next one comes)
 * and the day is logged; unticking takes today's back. Returns the goal.
 */
async function setStep(id, stepId, done) {
  const g = find(id);
  const s = g.steps.find((x) => x.id === stepId);
  if (!s) throw Object.assign(new Error('That step is no longer part of the goal.'), { status: 404 });
  const today = ymd(new Date());
  if (s.repeat) {
    s.log ||= [];
    const entry = s.log.find((e) => e.date === today);
    if (done && !entry) {
      if (s.taskId) {
        if (!repeat.ruleOf(s.taskId)) repeat.setRule(s.taskId, s.repeat);
        await hub.updateTask(s.taskId, { done: true }); // repeat.js logs the day and moves the step on
      } else {
        s.log.push({ date: today, taskId: null });
      }
    } else if (!done && entry) {
      if (entry.taskId) await hub.updateTask(entry.taskId, { done: false }); // and repeat.js takes it back
      s.log = s.log.filter((e) => e !== entry);
    }
  } else if (s.done !== !!done) {
    if (s.taskId) await hub.updateTask(s.taskId, { done: !!done });
    s.done = !!done;
  }
  store.save();
  return out(g);
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

module.exports = { list, create, update, remove, setStep, spans, timesDue };
