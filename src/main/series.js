// Repeating tasks set up in Google Tasks itself. The Tasks API has no repeat field:
// each copy of a repeating task is its own task, so a daily task left undone for a
// week arrives as seven tasks with the same name. Onyx recognises such a series (the
// same name in the same list, open more than once), works out how often it repeats
// from the copies' dates, and lets the globe show it as one node. Repeats that Onyx
// itself keeps (repeat.js) are series too, with one open copy.

const store = require('./store');
const { parseName, mirrorName } = require('./taskname');

const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parse = (s) => new Date(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10));
const days = (a, b) => Math.round((parse(b) - parse(a)) / 86400000);

/** Copies of one repeating task share this: the list and the name without its date or time. */
const keyOf = (t) => `${t.listId}|${(t.label || t.title || '').toLowerCase().replace(/\s+/g, ' ').trim()}`;

/** How often a series repeats, from its copies' dates: a repeat rule, or every N days, or null. */
function cadence(dates) {
  const d = [...new Set(dates.filter(Boolean))].sort();
  if (d.length < 2) return null;
  const gaps = d.slice(1).map((x, i) => days(d[i], x));
  const all = (fn) => gaps.every(fn);
  if (all((g) => g === 1)) return { rule: 'daily' };
  if (all((g) => g === 1 || g === 3) && d.every((x) => parse(x).getDay() % 6 !== 0)) return { rule: 'weekdays' };
  if (all((g) => g === 7)) return { rule: 'weekly' };
  if (all((g) => g === 14)) return { rule: 'biweekly' };
  if (all((g) => g >= 28 && g <= 31) && d.every((x) => x.slice(8) === d[0].slice(8) || +x.slice(8) >= 28)) return { rule: 'monthly' };
  if (all((g) => g === 365 || g === 366)) return { rule: 'yearly' };
  if (all((g) => g === gaps[0])) return { everyDays: gaps[0] };
  return null;
}

/**
 * Marks the tasks that belong to a series with `series`: { key, label, count, rule,
 * everyDays, time, managed, ids, overdue }. Mirrors of calendar entries are left alone.
 */
function annotate(tasks) {
  const groups = new Map();
  for (const t of tasks) {
    if (t.mirror || t.done) continue;
    const k = keyOf(t);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(t);
  }
  const today = ymd(new Date());
  for (const [key, copies] of groups) {
    const managed = copies.find((t) => store.data.repeats[t.id]);
    if (copies.length < 2 && !managed) continue;
    copies.sort((a, b) => String(a.date || '9999').localeCompare(String(b.date || '9999')));
    const found = managed ? { rule: store.data.repeats[managed.id].rule } : cadence(copies.map((t) => t.date)) || {};
    const series = {
      key, label: copies[0].label || copies[0].title, count: copies.length,
      rule: found.rule || null, everyDays: found.everyDays || null,
      time: copies.find((t) => t.time)?.time || null, managed: !!managed,
      ids: copies.map((t) => t.id), overdue: copies.filter((t) => t.date && t.date < today).length,
    };
    for (const t of copies) t.series = series;
  }
  return tasks;
}

/**
 * A task's name with a new label and time. A copy whose name holds its date keeps it
 * (moved to the new time); otherwise the time is added as "18:00", which the Pi reads.
 */
function rename(task, label, time) {
  const named = parseName(task.title);
  if (named.date && time) {
    const [h, m] = time.split(':').map(Number);
    const d = parse(named.date);
    return mirrorName(label, new Date(d.getFullYear(), d.getMonth(), d.getDate(), h, m));
  }
  if (named.date) return `${label} ${named.date}`;
  return time ? `${label} ${time}` : label;
}

/**
 * Changes every open copy of a series: { label, time ('HH:MM' or ''), notes, rule }.
 * `hub` is passed in to avoid a require loop. How often a series set up in Google
 * repeats can't be changed through Google's API, so `rule` only applies to repeats
 * Onyx keeps. Returns { changed, warnings }.
 */
async function update(hub, key, data = {}) {
  const { tasks } = await hub.getTasks({ force: true });
  annotate(tasks);
  const copies = tasks.filter((t) => t.series?.key === key);
  if (!copies.length) throw Object.assign(new Error('That repeating task is no longer open.'), { status: 404 });
  const s = copies[0].series;
  const label = 'label' in data ? String(data.label || '').trim().slice(0, 300) : s.label;
  if (!label) throw new Error('A task needs a name.');
  const time = 'time' in data ? String(data.time || '') : s.time || '';
  if (time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw new Error('That is not a time.');
  if ('rule' in data && (data.rule || null) !== s.rule) {
    if (!s.managed) {
      throw new Error('Google Tasks does not let other apps change how often its tasks repeat. Change that in the Google Tasks app; the name, time and notes can be changed here.');
    }
    const id = copies.find((t) => store.data.repeats[t.id]).id;
    if (data.rule) require('./repeat').setRule(id, data.rule); else require('./repeat').setRule(id, null);
  }
  const warnings = [];
  let changed = 0;
  for (const t of copies) {
    const patch = {};
    const title = rename(t, label, time);
    if (title !== t.title) patch.title = title;
    if ('notes' in data && String(data.notes || '') !== (t.notes || '')) patch.notes = String(data.notes || '');
    if (!Object.keys(patch).length) continue;
    try {
      await hub.updateTask(t.id, patch);
      changed++;
    } catch (err) {
      warnings.push(err.message);
    }
  }
  return { changed, warnings };
}

/** Marks the overdue copies of a series done (a pile-up of missed days), keeping the newest. */
async function clearOverdue(hub, key) {
  const { tasks } = await hub.getTasks({ force: true });
  annotate(tasks);
  const today = ymd(new Date());
  const copies = tasks.filter((t) => t.series?.key === key);
  const overdue = copies.filter((t) => t.date && t.date < today);
  // If every copy is overdue, the latest stays open so the series is not lost.
  const keep = overdue.length === copies.length ? overdue.at(-1) : null;
  let done = 0;
  for (const t of overdue) {
    if (t === keep) continue;
    await hub.updateTask(t.id, { done: true });
    done++;
  }
  return { done };
}

module.exports = { keyOf, cadence, annotate, rename, update, clearOverdue };
