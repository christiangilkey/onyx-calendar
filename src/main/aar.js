// The daily after-action review (1.143.0): at the end of a day, three short answers: what I
// did, what could go better, and the plan for tomorrow. The next day shows it in the top bar,
// one click away, so yesterday's lesson is today's instruction. A debrief like this is the
// practice with the best evidence for getting better at anything (Tannenbaum & Cerasoli 2013:
// about 25% better performance, the same for one person as for a team).
//
// store.data.aars: 'YYYY-MM-DD' -> { did, better, plan, at, updated }. Synced between devices.

const store = require('./store');

const FIELDS = ['did', 'better', 'plan'];
const MAX = 4000;
const isDay = (d) => /^\d{4}-\d{2}-\d{2}$/.test(String(d || ''));

const all = () => (store.data.aars ??= {});

/** One day's review, or null. */
function get(day) {
  if (!isDay(day)) throw new Error('Which day?');
  return all()[day] || null;
}

/** Saves a day's review (the fields given); with every field empty it is taken off. */
function set(day, fields = {}, now = Date.now()) {
  if (!isDay(day)) throw new Error('Which day?');
  const was = all()[day] || {};
  const next = { ...was };
  for (const k of FIELDS) if (k in fields) next[k] = String(fields[k] ?? '').replace(/\r\n/g, '\n').slice(0, MAX).trimEnd();
  if (FIELDS.every((k) => !String(next[k] || '').trim())) {
    delete all()[day];
    store.save();
    return null;
  }
  next.at = was.at || now;
  next.updated = now;
  all()[day] = next;
  store.save();
  return next;
}

/** The latest reviews, newest first (for looking back). */
function recent(limit = 30) {
  return Object.entries(all())
    .filter(([d]) => isDay(d))
    .sort(([a], [b]) => (a < b ? 1 : -1))
    .slice(0, Math.max(1, Math.min(365, Number(limit) || 30)))
    .map(([day, r]) => ({ day, ...r }));
}

module.exports = { get, set, recent, FIELDS };
