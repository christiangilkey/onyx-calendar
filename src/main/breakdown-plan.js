// Breakdown with a timeline (the hammer in a task's or a calendar block's window). The task is split into steps
// using everything written in it (its notes, checklist and links), and each step gets a realistic length and a
// squeezed one. The steps are laid out first in the time the task already has: its block, or the free time of
// its day. When that is clearly too little, a second, realistic timeline carries on in the free time after it,
// over the next days. The person picks one, changes what they like, and app.js puts the steps on the calendar
// in place of the task.

const store = require('./store');
const plan = require('./magic-plan');
const magic = require('./magic');
const { LEVELS } = require('./ai');

const MODEL = 'claude-sonnet-5-5'; // lengths and squeezing need some judgement: worth more than the quickest model
const API = 'https://api.anthropic.com/v1/messages';
const MIN = 60000;
const MAX_DAYS = 14;        // how far a realistic timeline may run
const TIGHT = 1.1;          // needing more than this times the time it has: a longer timeline is offered too
const MAX_NOTES = 12000;    // characters of what is written in it, sent to Claude
const LAYOUT = { home: null, travel: false, lunch: false };

const SYSTEM = [
  'You help someone with ADHD break a task into steps and fit them into the time they have for it.',
  'Use everything written in the task: its notes, checklist, links and details are what it involves. Every part of them belongs in a step, except parts marked as already done ([x], done, finished), which you leave out. Where they already listed steps, keep their wording and order.',
  'For each step give: "title" (short, at most 40 characters, starting with a verb), "minutes" (a realistic length for doing it, multiples of 5, 5 to 240), "fit" (the minutes it gets when the steps are squeezed into the time they have: all the fit values together are at most that time; shorten what can be shortened, never below 5), and "notes" (what they need from the task\'s notes for that step: details, amounts, settings, links; at most 300 characters; "" when there is nothing).',
  'Also give "fits" (true when the realistic minutes together fit in the time they have) and "advice" (one short sentence: whether it fits, and if not, how much time is realistic).',
  'Write in the same language as the task. Reply with only JSON: {"steps":[...],"fits":true,"advice":"..."}.',
].join(' ');

const keyOf = () => String(store.data.secrets.anthropicKey || '');
const pad = (n) => String(n).padStart(2, '0');
const hm = (ms) => { const d = new Date(ms); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const sum = (xs) => xs.reduce((a, b) => a + b, 0);
const dayOf = (ms) => { const d = new Date(ms); d.setHours(0, 0, 0, 0); return d; };
const nextDay = (d, n = 1) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const clockOn = (day, t) => { const [h, m] = String(t).split(':').map(Number); return new Date(day.getFullYear(), day.getMonth(), day.getDate(), h || 0, m || 0).getTime(); };
const fromYmd = (s) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s || '')); return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null; };
const ceil5 = (ms) => Math.ceil(ms / (5 * MIN)) * 5 * MIN;

/** The calendar that day, without the task being broken down (its time is what the steps get). */
async function busyFor(day, exclude) {
  return (await magic.busyOf(day)).filter((b) => !exclude.has(String(b.id)));
}

/**
 * The time the task has. f: { start, end } (a block, ISO) or { day: 'YYYY-MM-DD', from?: 'HH:MM' } (a task with a
 * date, or a time but no length: the free time of that day, from that time on). A day that is past or over is
 * planned from now, or the next day.
 */
async function frameOf(f, exclude, hours, now) {
  if (f?.start && f?.end) {
    const start = +new Date(f.start), end = +new Date(f.end);
    if (!(end > start)) throw new Error('The block needs to end after it starts.');
    return { kind: 'block', start, end, minutes: Math.round((end - start) / MIN) };
  }
  let day = fromYmd(f?.day) || dayOf(now);
  if (day < dayOf(now)) day = dayOf(now);
  for (let i = 0; i < 2; i++, day = nextDay(day)) {
    let start = i === 0 && /^\d{1,2}:\d{2}$/.test(String(f?.from || '')) ? clockOn(day, f.from) : clockOn(day, hours.start);
    const end = Math.max(clockOn(day, hours.end), start + 60 * MIN);
    start = Math.max(start, ceil5(now + 5 * MIN));
    if (end - start < 30 * MIN) continue;
    const busy = await busyFor(day, exclude);
    const gaps = plan.gapsOf({ busy, from: start, to: end }).filter((g) => g.to - g.from >= 5 * MIN);
    return { kind: 'day', day, start, end, busy, gaps, minutes: Math.round(sum(gaps.map((g) => g.to - g.from)) / MIN) };
  }
  throw new Error('There is no time left to plan in.');
}

function userMessage({ title, notes, frame, level }) {
  const when = frame.kind === 'block'
    ? `Time they have for it: ${frame.minutes} minutes, one block from ${hm(frame.start)} to ${hm(frame.end)} on ${new Date(frame.start).toDateString()}.`
    : `Time they have for it: the free time on ${frame.day.toDateString()}, ${frame.minutes} minutes in all (${frame.gaps.map((g) => `${hm(g.from)}-${hm(g.to)}`).join(', ') || 'none'}).`;
  const text = String(notes || '').trim();
  return [
    `Task: ${String(title).slice(0, 300)}`,
    text ? `Everything written in it:\n${text.slice(0, MAX_NOTES)}` : 'Nothing else is written in it.',
    when,
    `Break it into ${LEVELS[level]}.`,
  ].join('\n\n');
}

async function askClaude(prompt) {
  const res = await fetch(API, {
    method: 'POST',
    signal: AbortSignal.timeout(90000),
    headers: { 'x-api-key': keyOf(), 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: MODEL, max_tokens: 5000, system: SYSTEM, messages: [{ role: 'user', content: prompt }] }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401) throw new Error('Claude did not accept the API key. Check it in Settings → AI.');
    throw new Error(body?.error?.message || `Claude answered ${res.status}`);
  }
  const answer = magic.parseAnswer((body.content || []).map((c) => c.text || '').join(''));
  if (!answer) throw new Error('Claude\'s answer could not be read. Try again.');
  return answer;
}

function normalizeSteps(list) {
  return (Array.isArray(list) ? list : []).slice(0, 30).map((s) => {
    const minutes = plan.clampMinutes(s?.minutes ?? 15);
    const fit = Number.isFinite(Number(s?.fit)) && s?.fit !== null ? plan.clampMinutes(s.fit) : minutes;
    return { title: String(s?.title || '').trim().slice(0, 120), minutes, fit, notes: String(s?.notes || '').trim().slice(0, 600) };
  }).filter((s) => s.title);
}

/** Lengths that add up to at most `total` minutes, in the same proportions (5 minutes each at least). */
function squeeze(mins, total) {
  if (sum(mins) <= total) return mins.slice();
  const k = total / sum(mins);
  const out = mins.map((m) => Math.max(5, Math.floor((m * k) / 5) * 5));
  // What rounding down left over goes, five minutes at a time, to the steps that lost the most.
  for (let left = total - sum(out); left >= 5; left -= 5) {
    let best = -1, lost = -Infinity;
    out.forEach((m, i) => { const l = mins[i] * k - m; if (l > lost) { lost = l; best = i; } });
    if (best < 0) break;
    out[best] += 5;
  }
  return out;
}

const tasksOf = (steps, mins) => plan.normalizeTasks(steps.map((s, i) => ({
  title: s.title, minutes: mins[i], kind: 'other', when: 'any', notes: s.notes, chain: 'b', step: i + 1,
})));

/** The realistic timeline: from the start of its time on, in the free time of that day and the next ones, in order. */
async function spread(tasks, frame, exclude, hours, now) {
  const blocks = [];
  let left = tasks;
  const first = dayOf(frame.start);
  for (let d = 0; d < MAX_DAYS && left.length; d++) {
    const day = nextDay(first, d);
    let from = d === 0 ? frame.start : clockOn(day, hours.start);
    const to = d === 0 ? Math.max(clockOn(day, hours.end), frame.end) : clockOn(day, hours.end);
    from = Math.max(from, ceil5(now + 5 * MIN));
    if (to - from < 5 * MIN) continue;
    const r = plan.schedule(await busyFor(day, exclude), left, { day, from, to, ...LAYOUT });
    blocks.push(...r.blocks);
    const placed = new Set(r.blocks.map((b) => b.task.origin || b.task));
    left = left.filter((t) => !placed.has(t));
  }
  return { blocks, unplaced: left };
}

const option = (key, { blocks, unplaced = [] }, over = 0) => ({
  key, over,
  minutes: sum(blocks.map((b) => b.minutes)),
  blocks: blocks.map((b) => ({ title: b.title, notes: b.notes || '', start: new Date(b.start).toISOString(), end: new Date(b.end).toISOString(), minutes: b.minutes })),
  unplaced: unplaced.map((u) => ({ title: (u.task || u).title, minutes: (u.task || u).minutes })),
});

/**
 * Breaks a task down with times. o: { title, notes (everything written in it), level 1-5, frame (see frameOf),
 * exclude (the ids of its own entries, left out of the busy time) }.
 * Returns { steps, advice, fits, need, frame: { kind, start, end, minutes }, options: [fit, real?] }, each option
 * { key, minutes, over, blocks: [{ title, notes, start, end, minutes }], unplaced }.
 */
async function planBreakdown(o = {}) {
  const title = String(o.title || '').trim();
  if (!title) throw new Error('Give it a task to break down.');
  if (!keyOf()) throw new Error('Add your Claude API key in Settings → AI to use Breakdown.');
  const level = Math.min(5, Math.max(1, Math.round(Number(o.level) || 3)));
  const exclude = new Set([].concat(o.exclude || []).filter(Boolean).map(String));
  const now = Date.now();
  const hours = magic.info();
  const frame = await frameOf(o.frame, exclude, hours, now);

  const answer = await askClaude(userMessage({ title, notes: o.notes, frame, level }));
  const steps = normalizeSteps(answer.steps);
  if (!steps.length) throw new Error('Claude gave no steps. Try again.');
  const need = sum(steps.map((s) => s.minutes));

  // In the time it has: a block is cut into the steps; a day's free time takes them where they fit.
  const fitMins = squeeze(steps.map((s) => s.fit), frame.minutes);
  let fit;
  if (frame.kind === 'block') {
    let t = frame.start;
    const blocks = steps.map((s, i) => { const b = { title: s.title, notes: s.notes, start: t, end: t + fitMins[i] * MIN, minutes: fitMins[i] }; t = b.end; return b; });
    fit = option('fit', { blocks }, Math.max(0, sum(fitMins) - frame.minutes));
  } else {
    fit = option('fit', plan.schedule(frame.busy, tasksOf(steps, fitMins), { day: frame.day, from: frame.start, to: frame.end, ...LAYOUT }));
  }
  const options = [fit];
  const short = fit.unplaced.length > 0 || (need > frame.minutes && (need > frame.minutes * TIGHT || answer.fits === false));
  if (short) options.push(option('real', await spread(tasksOf(steps, steps.map((s) => s.minutes)), frame, exclude, hours, now)));

  return {
    steps, need, fits: !short,
    advice: String(answer.advice || '').trim().slice(0, 300),
    frame: { kind: frame.kind, start: new Date(frame.start).toISOString(), end: new Date(frame.end).toISOString(), minutes: frame.minutes },
    options,
  };
}

module.exports = { planBreakdown, normalizeSteps, squeeze, userMessage };
