// Hyperfocus sessions, kept in Onyx: the one running now (so its hard stop can reach your
// phone), and a log of finished ones: what each was for, when it ran, how it ended, how deep
// it went and the note left at the end. The log is kept in one shape (with a version, `v`) so
// later it can show the hours you focus best.
//
// store.data.focusActive: the session running on this PC, or null:
//   { id, goal, startedAt, plannedEnd (ms), escalate: bool, sent: bool, piKey? }
//
// store.data.focusSessions, oldest first:
//   { id, v: 2, entry: { id, kind: 'task'|'event', title }, goal, firstStep, ifThen,
//     startedAt, plannedEnd, endedAt (ISO), stop: 'hard' | 'early' | 'ceiling',
//     ceiling: { minutes, asks: [{ at, choice: 'keep' | 'stop' }] },
//     sound: { kind: SOUNDS, volume 0-100 }, hook: 'race' | 'next' | 'none',
//     preflight: ['water', ...], steps: { total, done }, captured, where, next,
//     windDown: minutes, escalate: bool, bodyChecks: { every, shown }, rating: 1-5 | null }
//
// The way out, when "Reach my phone" is on (caller.js has the ways reminders go out):
//   alarm   the phone rings a full-screen alarm at the hard stop: the session shows to the
//           phone as an entry with an Alarm escalation (phoneItems), gone once it is over
//   ntfy / twilio   this PC sends a push or calls if the stop is not answered here in GRACE
//   pi      a hidden task for the Pi to phone about, deleted when the stop is answered

const crypto = require('crypto');
const store = require('./store');

const MAX_SESSIONS = 1000;
const GRACE_MS = 2 * 60000;      // the stop unanswered on the PC this long: the phone is reached
const STALE_MS = 3 * 3600000;    // a session left running (the window closed) is let go after this
const TICK_MS = 15000;
const STOPS = ['hard', 'early', 'ceiling'];
const SOUNDS = ['brown', 'pink', 'white', 'rain', 'waves', 'spotify', 'none'];
const HOOKS = ['race', 'next', 'none'];
const PREFLIGHT = ['water', 'snack', 'bathroom', 'phone'];

let hub = null; // set by start(), to avoid a require cycle
let timer = null;

const text = (v, max = 500) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const int = (v, lo, hi) => Math.max(lo, Math.min(hi, Math.round(Number(v) || 0)));
const one = (v, allowed, fallback) => (allowed.includes(v) ? v : fallback);
const ms = (v) => (typeof v === 'number' ? v : Date.parse(v));
const iso = (v) => {
  const t = ms(v);
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
};
const caller = () => require('./caller');
const clock = (t) => new Date(t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

// ---------------------------------------------------------------- the session running now

/** A session starts: kept so its stop can reach the phone. Returns what the window should say about it. */
async function startActive(s = {}) {
  await endActive(); // one at a time
  const startedAt = ms(s.startedAt) || Date.now();
  const plannedEnd = ms(s.plannedEnd);
  if (!Number.isFinite(plannedEnd) || plannedEnd <= startedAt) throw new Error('A focus session needs a hard stop after its start.');
  const active = { id: crypto.randomUUID(), goal: text(s.goal, 200) || 'Hyperfocus', startedAt, plannedEnd, escalate: !!s.escalate, sent: false };
  store.data.focusActive = active;
  store.save();
  let warning = null;
  if (active.escalate && caller().method() === 'pi') {
    try { await piTask(active); } catch (err) { warning = `The Pi could not be given the stop: ${err.message}`; }
  }
  return { id: active.id, reach: active.escalate ? reachOf() : null, warning };
}

/** The stop was answered (or the session ended early): nothing more goes to the phone. */
async function endActive() {
  const a = store.data.focusActive;
  if (!a) return false;
  store.data.focusActive = null;
  store.save();
  if (a.piKey) await dropPiTask(a.piKey);
  return true;
}

const active = () => store.data.focusActive || null;

/** How the stop reaches the phone, the way reminders are set up: 'alarm' | 'push' | 'call' | 'pi'. */
function reachOf() {
  const m = caller().method();
  if (m === 'alarm') return 'alarm';
  if (m === 'pi') return 'pi';
  if (m === 'ntfy') return 'push';
  return 'call'; // twilio
}

/** For the Pi: a task with the stop's time it reads (hidden in Onyx, like its other reminder tasks). */
async function piTask(a) {
  const grid = Math.max(1, Number(store.data.settings.pi?.checkEvery) || 30) * 60000;
  // The Pi calls at its last look before the time given, so the time given is its first look after the grace.
  const at = new Date(Math.ceil((a.plannedEnd + GRACE_MS) / grid) * grid);
  const { mirrorName } = require('./taskname');
  const key = `focus|${a.id}`;
  const task = await hub.createTask({
    title: mirrorName(`Hyperfocus stop ${a.goal}`, at), due: localDay(at), listId: hub.piTaskList().id,
    notes: hub.callNotes(at, { before: 0, mode: 'call' }),
  });
  store.data.piLinks[key] = { task: task.id, start: at.toISOString(), title: `Hyperfocus stop: ${a.goal}`, focus: true };
  a.piKey = key;
  store.save();
}

async function dropPiTask(key) {
  const link = store.data.piLinks?.[key];
  if (!link) return;
  delete store.data.piLinks[key];
  store.save();
  if (link.task && hub) await hub.deleteTask(link.task).catch(() => {});
}

const pad = (n) => String(n).padStart(2, '0');
const localDay = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/**
 * What the phone sees of the session, added to its entries: the stop, with an Alarm
 * escalation at that time, so the phone app and its alarm clock ring then. Only with
 * "Alarm on my phone" and "Reach my phone" on.
 */
function phoneItems(from, to) {
  const a = active();
  if (!a || !a.escalate || caller().method() !== 'alarm') return [];
  const lo = ms(from), hi = ms(to);
  if (Number.isFinite(lo) && a.plannedEnd < lo) return [];
  if (Number.isFinite(hi) && a.plannedEnd >= hi) return [];
  const at = new Date(a.plannedEnd).toISOString();
  return [{
    id: `focus/${a.id}`, kind: 'event', calendarId: 'focus', calendarName: 'Hyperfocus', color: '#8b7cff', writable: false,
    title: `Hyperfocus stop: ${a.goal}`, start: at, end: new Date(a.plannedEnd + 5 * 60000).toISOString(), allDay: false,
    notes: 'Time to stop: write where you left off on the PC.', tags: [], piCall: true, callMode: 'alarm', callAck: false,
    piAlerts: [{ at, kind: 'alarm' }],
  }];
}

/** Every few seconds: a stop left unanswered on the PC is sent to the phone (ntfy or Twilio), once. */
async function tick(now = Date.now()) {
  const a = active();
  if (!a) return null;
  if (now - a.plannedEnd > STALE_MS) { await endActive(); return 'stale'; }
  if (!a.escalate || a.sent || now < a.plannedEnd + GRACE_MS || !caller().sendsHere()) return null;
  a.sent = true;
  store.save();
  try {
    // As a call: with ntfy that is an urgent push, with Twilio a phone call.
    await caller().send('call', 'Hyperfocus: time to stop', `Your Hyperfocus session on ${a.goal} reached its hard stop at ${clock(a.plannedEnd)}. Time to stop and write down where you left off.`);
    return 'sent';
  } catch (err) {
    console.error('onyx: could not send the Hyperfocus stop:', err.message);
    return 'failed';
  }
}

function start(h) {
  hub = h;
  if (timer) return;
  timer = setInterval(() => tick().catch((err) => console.error('onyx: hyperfocus:', err.message)), TICK_MS);
  timer.unref?.();
}

// ---------------------------------------------------------------- the log

/** A session as the window sent it, cleaned to the shape above. */
function clean(s = {}) {
  const startedAt = iso(s.startedAt);
  if (!startedAt) throw new Error('A focus session needs the time it started.');
  const endedAt = iso(s.endedAt) || new Date().toISOString();
  const entry = s.entry && s.entry.id ? { id: text(s.entry.id, 300), kind: s.entry.kind === 'task' ? 'task' : 'event', title: text(s.entry.title, 300) } : null;
  const rating = Number(s.rating);
  return {
    id: crypto.randomUUID(),
    v: 2,
    entry,
    goal: text(s.goal, 300) || entry?.title || '',
    firstStep: text(s.firstStep, 300),
    ifThen: text(s.ifThen, 300),
    startedAt,
    plannedEnd: iso(s.plannedEnd),
    endedAt: endedAt < startedAt ? startedAt : endedAt,
    stop: one(s.stop, STOPS, 'early'),
    ceiling: {
      minutes: int(s.ceiling?.minutes, 0, 600),
      asks: (Array.isArray(s.ceiling?.asks) ? s.ceiling.asks : []).slice(0, 50)
        .map((a) => ({ at: iso(a?.at), choice: a?.choice === 'stop' ? 'stop' : 'keep' })).filter((a) => a.at),
    },
    sound: { kind: one(s.sound?.kind, SOUNDS, 'none'), volume: int(s.sound?.volume, 0, 100) },
    hook: one(s.hook, HOOKS, 'none'),
    preflight: [...new Set((Array.isArray(s.preflight) ? s.preflight : []).filter((p) => PREFLIGHT.includes(p)))],
    steps: { total: int(s.steps?.total, 0, 500), done: Math.min(int(s.steps?.done, 0, 500), int(s.steps?.total, 0, 500)) },
    captured: int(s.captured, 0, 1000),
    where: text(s.where, 1000),
    next: text(s.next, 1000),
    windDown: int(s.windDown, 0, 60),
    escalate: !!s.escalate,
    bodyChecks: { every: int(s.bodyChecks?.every, 0, 240), shown: int(s.bodyChecks?.shown, 0, 100) },
    rating: Number.isInteger(rating) && rating >= 1 && rating <= 5 ? rating : null, // 1 (couldn't settle) to 5 (lost in it), or not given
  };
}

/** Adds a finished session to the log (the oldest go past MAX_SESSIONS). Returns it as kept. */
function logSession(s) {
  const rec = clean(s);
  const list = (store.data.focusSessions ??= []);
  list.push(rec);
  if (list.length > MAX_SESSIONS) list.splice(0, list.length - MAX_SESSIONS);
  store.save();
  return rec;
}

/** The sessions that started between `from` and `to` (either may be left out), oldest first. */
function sessions({ from, to } = {}) {
  const lo = from ? iso(from) : null, hi = to ? iso(to) : null;
  return (store.data.focusSessions || []).filter((s) => (!lo || s.startedAt >= lo) && (!hi || s.startedAt < hi));
}

// ---------------------------------------------------------------- what the log shows

const plan = () => require('../renderer/focus-plan');

/** The hours you focus best, as Magic add's hours for focus work ([from, to]), once the log can say. */
function bestFocusPart() {
  const best = plan().bestWindow(store.data.focusSessions || []);
  return best ? [best.from, best.to] : null;
}

/** For the window and for Hermes: the best hours, each hour's sessions, and how the hour now usually goes. */
function insights(now = Date.now()) {
  const list = store.data.focusSessions || [];
  return {
    best: plan().bestWindow(list),
    hours: plan().focusHours(list).filter((h) => h.count),
    now: plan().hourScore(list, new Date(now).getHours()),
    rated: list.filter((s) => s.rating).length,
    needed: plan().BEST_MIN_RATED,
  };
}

/** What kind of task a title is (focus work, a call, an errand...), as Magic add guesses it. */
const kindOf = (title) => require('./magic-plan').estimateLocal(title)[0]?.kind || 'other';

/** After a session: up to three open tasks that would be a change of pace (focus-plan.js rotation). */
async function suggestions({ current = {}, rating = null, minutes = 0 } = {}) {
  const { tasks } = await hub.getTasks();
  const today = localDay(new Date());
  return plan().rotation(tasks, { current, today, kindOf, rating, minutes }).map((x) => ({ ...x, task: { id: x.task.id, title: x.task.label || x.task.title, minutes: x.task.minutes || null } }));
}

// ---------------------------------------------------------------- asked for by another app (Hermes, MCP)

let onRequest = () => false; // main.js: shows the window with the Hyperfocus setup
let pending = null;

/**
 * Another app asks for a session on a task (by id) or a title: the setup opens on the PC,
 * filled in, and you press Start there. Nothing starts by itself.
 */
function request({ task_id, title, minutes } = {}) {
  if (active()) return { opened: false, reason: `A Hyperfocus session is already running, until ${clock(active().plannedEnd)}.` };
  const req = {
    taskId: task_id ? text(task_id, 300) : null, title: text(title, 200) || null,
    minutes: minutes ? int(minutes, 10, 240) : null, at: Date.now(),
  };
  if (!req.taskId && !req.title) throw new Error('Name the task: its id (from list_tasks) or a title.');
  pending = req;
  onRequest(req);
  return { opened: true, note: 'The Hyperfocus setup is open on the PC. The user starts the session there.' };
}
const takeRequest = () => { const r = pending; pending = null; return r && Date.now() - r.at < 10 * 60000 ? r : null; };

/** For Hermes: whether a session is running, on what, and until when (so it can hold its messages). */
function status() {
  const a = active();
  if (!a) return { running: false };
  return { running: true, goal: a.goal, started: new Date(a.startedAt).toISOString(), hard_stop: new Date(a.plannedEnd).toISOString(), phone_at_stop: a.escalate };
}

module.exports = {
  logSession, sessions, clean, startActive, endActive, active, reachOf, phoneItems, tick, start, MAX_SESSIONS, GRACE_MS, SOUNDS,
  bestFocusPart, insights, suggestions, kindOf, request, takeRequest, status, setRequestHandler: (fn) => { onRequest = fn; },
};
