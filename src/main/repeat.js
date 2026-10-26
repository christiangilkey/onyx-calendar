// Repeating tasks. Google Tasks and To Do do not let other apps set a repeat, so Onyx
// keeps the rule itself: when a repeating task is done (in Onyx, or in Google / To Do,
// noticed on the next look), the next one is added as a new task with the next date,
// and the rule moves to it. Undo in Onyx takes the added task back.

const store = require('./store');
const { parseName, mirrorName } = require('./taskname');

const RULES = {
  daily: 'Every day',
  weekdays: 'Every weekday',
  weekly: 'Every week',
  biweekly: 'Every 2 weeks',
  monthly: 'Every month',
  yearly: 'Every year',
};
const MAX_SPAWNED = 200;
const inFlight = new Set(); // task ids whose next task is being added right now

const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parse = (s) => new Date(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10));
const daysIn = (y, m) => new Date(y, m + 1, 0).getDate();

const ruleOf = (id) => store.data.repeats[id] || null;

/**
 * The next date for `rule` after `from` ('YYYY-MM-DD'), never today or earlier: a
 * daily task done three days late comes back tomorrow, not three days ago. `day` is
 * the day of the month a monthly or yearly task started on (so the 31st stays the
 * 31st after a shorter month).
 */
function nextDate(rule, from, today = new Date(), day = parse(from).getDate()) {
  if (!RULES[rule]) throw new Error('Unknown repeat.');
  let d = parse(from);
  const stop = ymd(today);
  let months = 0;
  const start = parse(from);
  do {
    if (rule === 'daily') d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);
    else if (rule === 'weekdays') {
      do d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1); while (d.getDay() === 0 || d.getDay() === 6);
    } else if (rule === 'weekly') d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 7);
    else if (rule === 'biweekly') d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 14);
    else {
      months += rule === 'monthly' ? 1 : 12;
      const y = start.getFullYear() + Math.floor((start.getMonth() + months) / 12);
      const m = (start.getMonth() + months) % 12;
      d = new Date(y, m, Math.min(day, daysIn(y, m)));
    }
  } while (ymd(d) <= stop);
  return ymd(d);
}

/** Switches repeating on (rule) or off (null) for one task; `until` (YYYY-MM-DD) is its last day, when it has one. */
function setRule(id, rule, until) {
  if (rule == null || rule === '' || rule === 'none') {
    delete store.data.repeats[id];
  } else {
    if (!RULES[rule]) throw new Error('Unknown repeat.');
    const old = ruleOf(id);
    const last = until === undefined ? old?.until : until;
    store.data.repeats[id] = { rule, ...(old?.day ? { day: old.day } : {}), ...(/^\d{4}-\d{2}-\d{2}$/.test(last || '') ? { until: last } : {}) };
  }
  store.save();
  return ruleOf(id);
}

function remember(doneId, nextId) {
  const map = store.data.repeatSpawned;
  map[doneId] = nextId;
  const keys = Object.keys(map);
  for (const k of keys.slice(0, Math.max(0, keys.length - MAX_SPAWNED))) delete map[k];
}

/**
 * Adds the task after `task` (a unified task that was just done) and moves the rule to
 * it. `hub` is passed in to avoid a require loop. Returns the new task.
 */
async function spawnNext(hub, task) {
  const r = ruleOf(task.id);
  // Marking it done in Onyx and noticing it done in Google can overlap: one next task only.
  if (!r || inFlight.has(task.id)) return null;
  inFlight.add(task.id);
  try {
    return await addNext(hub, task, r);
  } finally {
    inFlight.delete(task.id);
  }
}

async function addNext(hub, task, r) {
  const base = task.date || task.due || ymd(new Date());
  const day = r.day || parse(base).getDate();
  const due = nextDate(r.rule, base, new Date(), day);
  // Past its last day (a habit for one phase of a goal): the repeat ends here, and the step with it.
  if (r.until && due > r.until) {
    delete store.data.repeats[task.id];
    for (const g of store.data.goals) {
      for (const s of g.steps) {
        if (s.taskId !== task.id || !s.repeat) continue;
        s.log = [...(s.log || []), { date: ymd(new Date()), taskId: task.id }];
        s.ended = true;
      }
    }
    store.save();
    return null;
  }
  // A date written in the name is what the Pi reads first, so it moves along too.
  const named = parseName(task.title);
  let title = task.title;
  if (named.date) {
    const [y, m, d] = due.split('-').map(Number);
    title = named.time ? mirrorName(named.spoken, new Date(y, m - 1, d, named.time[0], named.time[1])) : named.spoken;
  }
  const next = await hub.createTask({ title, due, listId: task.listId, notes: task.notes || '', tags: task.tags || [] });
  delete store.data.repeats[task.id];
  store.data.repeats[next.id] = { rule: r.rule, day, ...(r.until ? { until: r.until } : {}) };
  if (store.data.taskMinutes?.[task.id]) store.data.taskMinutes[next.id] = store.data.taskMinutes[task.id]; // and its length on the calendar
  if (store.data.pomodoro?.[task.id]) store.data.pomodoro[next.id] = { ...store.data.pomodoro[task.id] }; // and its work/rest split
  remember(task.id, next.id);
  // A repeating step of a goal stays the goal's step, and each time it is done is logged.
  for (const g of store.data.goals) {
    for (const s of g.steps) {
      if (s.taskId !== task.id) continue;
      Object.assign(s, { taskId: next.id, due, done: false });
      if (s.repeat) s.log = [...(s.log || []), { date: ymd(new Date()), taskId: task.id }];
    }
  }
  store.save();
  return { ...next, repeat: r.rule, pomodoro: store.data.pomodoro?.[next.id] || null };
}

/**
 * Restoring a done repeating task (Undo) takes back the task that was added after it,
 * as long as that one has not been done itself, and moves the rule back.
 */
async function undoSpawn(hub, id) {
  const nextId = store.data.repeatSpawned[id];
  if (!nextId) return false;
  const r = ruleOf(nextId);
  delete store.data.repeatSpawned[id];
  if (!r) { store.save(); return false; } // the next one was done too: leave both
  // The rule and the goal step move back first: deleting the next task unlinks whatever points at it.
  store.data.repeats[id] = r;
  delete store.data.repeats[nextId];
  for (const g of store.data.goals) {
    for (const s of g.steps) {
      if (s.taskId !== nextId) continue;
      s.taskId = id;
      if (s.log) s.log = s.log.filter((e) => e.taskId !== id);
    }
  }
  store.save();
  await hub.deleteTask(nextId).catch((err) => { if (err.status !== 404) throw err; });
  return true;
}

/**
 * Tasks that repeat but are no longer open were done (or deleted) outside Onyx.
 * `open` is the set of open task ids just read; `failed` the lists that could not be
 * read (nothing is concluded about those). Returns the tasks added.
 */
async function reconcile(hub, open, failed, lists) {
  const added = [];
  for (const id of Object.keys(store.data.repeats)) {
    const listId = id.slice(0, id.lastIndexOf('/'));
    if (open.has(id) || failed.has(listId) || !lists.has(listId) || inFlight.has(id)) continue;
    try {
      const task = await hub.fetchTask(id);
      if (!task) {
        delete store.data.repeats[id]; // deleted: the repeat ends with it
        store.save();
      } else if (task.done) {
        added.push(await spawnNext(hub, task));
      }
    } catch (err) {
      console.error('onyx: could not repeat a task:', err.message);
    }
  }
  return added.filter(Boolean);
}

module.exports = { RULES, ruleOf, nextDate, setRule, spawnNext, undoSpawn, reconcile };
