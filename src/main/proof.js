// Proof of starts (1.146.0): what you actually did, from what Onyx logged, so belief comes from
// evidence instead of pep talk. Confidence mostly follows performance (Sitzmann & Yeo 2013;
// Baumeister et al. 2003), so the app shows the record: the days you showed up, what you got
// done, the time in Hyperfocus, and the comebacks after a missed day. It never counts misses
// against you: a missed day is just not counted.
//
// From: store.data.doneEvents (blocks and entries ticked off: id -> day), store.data.doneTasks
// (tasks ticked off in Onyx: id -> day, kept here since 1.146.0) and store.data.focusSessions.

const store = require('./store');

const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const MAX_TASKS = 3000;

/** Notes a task ticked off (or brought back) today, for the record. */
function noteTask(id, done, now = new Date()) {
  const log = (store.data.doneTasks ??= {});
  if (done) log[id] = ymd(now); else delete log[id];
  const keys = Object.keys(log);
  for (const k of keys.slice(0, Math.max(0, keys.length - MAX_TASKS))) delete log[k];
  store.save();
}

/** The record for the last `days` days (today included), and its totals. */
function summary(days = 14, now = new Date()) {
  const list = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    list.push({ day: ymd(d), done: 0, sessions: 0, minutes: 0 });
  }
  const at = new Map(list.map((x) => [x.day, x]));
  for (const day of Object.values(store.data.doneEvents || {})) if (at.has(day)) at.get(day).done++;
  for (const day of Object.values(store.data.doneTasks || {})) if (at.has(day)) at.get(day).done++;
  for (const s of store.data.focusSessions || []) {
    const start = new Date(s.startedAt);
    if (Number.isNaN(start.getTime())) continue;
    const x = at.get(ymd(start));
    if (!x) continue;
    x.sessions++;
    const end = new Date(s.endedAt || s.plannedEnd || s.startedAt);
    x.minutes += Math.max(0, Math.round((end - start) / 60000));
  }
  const showed = (x) => x.done > 0 || x.sessions > 0;
  const week = list.slice(-7);
  // A comeback: a day you showed up after a day you didn't (the restart is what counts).
  let comebacks = 0;
  for (let i = 1; i < list.length; i++) if (showed(list[i]) && !showed(list[i - 1])) comebacks++;
  const lastDay = [...list].reverse().find(showed)?.day || null;
  return {
    days: list.map((x) => ({ ...x, showed: showed(x) })),
    showedUp: week.filter(showed).length,
    weekDone: week.reduce((n, x) => n + x.done, 0),
    weekSessions: week.reduce((n, x) => n + x.sessions, 0),
    weekMinutes: week.reduce((n, x) => n + x.minutes, 0),
    comebacks,
    lastDay,
  };
}

/** One line of it: "Showed up 6 of the last 7 days · 23 done · 4 h 10 min in Hyperfocus". */
function line(s = summary()) {
  const parts = [`Showed up ${s.showedUp} of the last 7 days`];
  if (s.weekDone) parts.push(`${s.weekDone} done`);
  if (s.weekMinutes >= 1) parts.push(`${s.weekMinutes >= 60 ? `${Math.floor(s.weekMinutes / 60)} h ${pad(s.weekMinutes % 60)} min` : `${s.weekMinutes} min`} in Hyperfocus`);
  return parts.join(' · ');
}

module.exports = { noteTask, summary, line };
