// Adaptive Add for goals (Magic add in the code): a goal, its time frame and whatever the person pastes about it (an outline, notes,
// the steps they already have) become phases of actionable, measurable steps, one-off or repeating, as
// finely as the hammers say. Claude (with the user's own API key, like Breakdown) writes the plan; without a
// key the outline's own lines are the steps (outlineGoal); goal-plan.js reads it back and gives every session a time that is free in the calendar. Nothing is
// saved here: the window shows the plan, and the goal is made (or added to) when the person says so.

const store = require('./store');
const hub = require('./hub');
const plan = require('./goal-plan');

const MODEL = 'claude-sonnet-5-5'; // a long, ordered plan over months: worth more than the quickest model
const API = 'https://api.anthropic.com/v1/messages';

const keyOf = () => String(store.data.secrets.anthropicKey || '');
const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ''));

async function askClaude(prompt, level) {
  const res = await fetch(API, {
    method: 'POST',
    signal: AbortSignal.timeout(300000), // a fine-grained plan for months is a long answer
    headers: { 'x-api-key': keyOf(), 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: MODEL, max_tokens: level >= 4 ? 32000 : 16000, system: plan.SYSTEM, messages: [{ role: 'user', content: prompt }] }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401) throw new Error('Claude did not accept the API key. Check it in Settings → AI.');
    throw new Error(body?.error?.message || `Claude answered ${res.status}`);
  }
  const answer = plan.parseAnswer((body.content || []).map((c) => c.text || '').join(''));
  if (!answer) throw new Error(body.stop_reason === 'max_tokens' ? 'The plan was too long to finish. Try one hammer less.' : 'Claude\'s answer could not be read. Try again.');
  return answer;
}

/** The calendar's timed entries from today on, for as far as the sessions are fitted (goal bars and all-day entries are not busy time). */
async function busyFrom(today, end) {
  const from = new Date(+today.slice(0, 4), +today.slice(5, 7) - 1, +today.slice(8, 10));
  const to = new Date(from.getFullYear(), from.getMonth(), from.getDate() + 43);
  const stop = end && isDate(end) ? new Date(+end.slice(0, 4), +end.slice(5, 7) - 1, +end.slice(8, 10) + 1) : to;
  const { events } = await hub.getEvents(from.toISOString(), (stop < to ? stop : to).toISOString());
  return events.filter((e) => (e.kind === 'event' || e.kind === 'task') && !e.allDay && e.start && e.end)
    .map((e) => ({ start: +new Date(e.start), end: +new Date(e.end) })).filter((b) => b.end > b.start);
}

/**
 * Plans a goal. o: { title, start, end, outline, sources (pages and pictures read for it), level (1-5), fit (give sessions free times), goalId (add to
 * that goal: its steps are sent so none are repeated) }. Returns { phases, steps, summary }.
 */
/**
 * A goal's plan without Claude: the outline's own lines (and the steps listed on a page read for it) are the
 * steps, in their order, spread evenly from the start (today, if later) to the target date, each with a
 * length read from its words. Lines marked [x], ✓ or "done" are steps already done. Same shape as Claude's.
 */
function outlineGoal({ title, start, end, today, outline, material = [] }) {
  const lines = String(outline || '').split(/\r?\n/).map((l) => l.replace(/^\s*(?:[-*•]|\d{1,3}[.)])\s*/, '').trim());
  for (const m of material) for (const t of require('./magic-plan').stepsFromText(m.text, 60)) lines.push(t.notes || t.title);
  const isDone = (l) => /\[x\]|✓|\(?\bdone\b\)?/i.test(l);
  const rows = lines.filter((l) => l.replace(/\[[ x]\]|✓/gi, '').trim().length >= 2).slice(0, 120);
  if (!rows.length) throw new Error('List the steps, one per line, and Onyx spreads them out until the target date. (Having the steps written for you takes a Claude key, in Settings → AI.)');
  const from = start > today ? start : today;
  const t0 = new Date(`${from}T00:00`);
  const span = Math.max(0, Math.round((new Date(`${end}T00:00`) - t0) / 86400000));
  const at = (d) => ymd(new Date(t0.getFullYear(), t0.getMonth(), t0.getDate() + Math.floor(d)));
  const open = rows.filter((l) => !isDone(l)).length;
  let k = 0;
  const readLine = require('./magic-plan').readLine;
  const tasks = rows.map((l) => {
    const done = isDone(l);
    const name = l.replace(/\[[ x]\]|✓|\(?\bdone\b\)?/gi, '').replace(/\s{2,}/g, ' ').trim();
    const r = readLine(name);
    return { title: r.title, measure: name, phase: 1, start: done ? from : at((k++ * (span + 1)) / Math.max(1, open)), minutes: r.minutes, when: r.when, done };
  });
  return { phases: [{ name: 'Steps', start, end, milestone: title }], tasks };
}

async function planGoal(o = {}) {
  const title = String(o.title || '').trim();
  if (!title) throw new Error('Give the goal a name first.');
  const today = ymd(new Date());
  const start = isDate(o.start) ? o.start : today;
  const end = isDate(o.end) ? o.end : null;
  if (!end) throw new Error('Pick a target date for the goal.');
  if (end < start) throw new Error('The target date is before the start.');
  if (end < today) throw new Error('The target date has passed: pick a later one.');
  const level = Math.min(5, Math.max(1, Math.round(Number(o.level) || 3)));
  const goal = o.goalId ? store.data.goals.find((g) => g.id === o.goalId) : null;
  const existing = goal ? goal.steps.map((s) => ({ title: s.title, done: s.done, repeat: s.repeat })) : [];

  const material = require('./sources').forPrompt(o.sources);
  const local = !keyOf(); // without a Claude key: the steps listed, spread out until the target date
  const answer = local ? outlineGoal({ title, start, end, today, outline: o.outline, material })
    : await askClaude(plan.userMessage({ title, start, end, today, outline: o.outline, level, existing, material }), level);
  const { phases, steps } = plan.normalize(answer, { start, end, today });
  if (!steps.length) throw new Error(local ? 'No steps found in that. Put one on each line.' : 'Claude gave no steps. Add a little more about the goal and try again.');
  if (o.fit !== false) {
    const magic = store.data.settings.magic || {};
    plan.fitTimes(steps, await busyFrom(today, end), { today, dayStart: magic.start || '08:00', dayEnd: magic.end || '21:00', end });
  }
  for (const s of steps) s.sessions = plan.timesIn(s.repeat, s.due, s.until || s.due);
  return { phases, steps, summary: plan.summary(steps, { start: start > today ? start : today, end }), level, local };
}

module.exports = { planGoal, outlineGoal };
