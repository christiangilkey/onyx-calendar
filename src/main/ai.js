// Breakdown (the hammer): splits a task into small, concrete steps, as finely as asked,
// from one hammer (a few broad steps) to five (tiny micro-steps). Uses Claude with the
// user's own API key (Settings → AI), which is kept with the other secrets.

const store = require('./store');

const MODEL = 'claude-haiku-5-5'; // quick and inexpensive; steps need no deep thought
const API = 'https://api.anthropic.com/v1/messages';
const LEVELS = {
  1: '2 to 3 broad steps',
  2: '3 to 5 simple steps',
  3: '5 to 7 clear steps',
  4: '7 to 10 detailed steps',
  5: '10 to 15 tiny, concrete micro-steps (for example "open the email app", "type the subject line", "write the first sentence")',
};
const SYSTEM = [
  'You help someone with ADHD get started on a task by breaking it into steps.',
  'Give the steps in order. Each step is short (at most 30 characters), starts with a verb, and is something they can just do, with no further planning.',
  'Write in the same language as the task.',
  'Reply with only a JSON array of strings, nothing else.',
].join(' ');

const keyOf = () => String(store.data.secrets.anthropicKey || '');
const info = () => ({ ready: !!keyOf(), model: MODEL });

function setKey(key) {
  const k = String(key || '').trim();
  if (k && !/^sk-ant-[\w-]{20,}$/.test(k)) throw new Error('That does not look like a Claude API key (they start with sk-ant-).');
  store.data.secrets.anthropicKey = k;
  store.save();
  return info();
}

/** The steps from Claude's answer: a JSON array, or failing that, its lines. */
function parseSteps(text) {
  let list = null;
  const m = String(text || '').match(/\[[\s\S]*\]/);
  if (m) { try { list = JSON.parse(m[0]); } catch { list = null; } }
  if (!Array.isArray(list)) list = String(text || '').split(/\r?\n/);
  return list.map((s) => String(s || '').replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '').trim()).filter(Boolean).slice(0, 20).map((s) => s.slice(0, 160));
}

/** Breaks `title` into steps; `level` 1 (broad) to 5 (micro-steps). Returns an array of strings. */
async function breakdown(title, { level = 3, notes = '' } = {}) {
  const task = String(title || '').trim();
  if (!task) throw new Error('Give it a task to break down.');
  const key = keyOf();
  if (!key) throw new Error('Add your Claude API key in Settings → AI to use Breakdown.');
  const n = Math.min(5, Math.max(1, Math.round(Number(level) || 3)));
  const res = await fetch(API, {
    method: 'POST',
    signal: AbortSignal.timeout(30000),
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({
      model: MODEL, max_tokens: 900, system: SYSTEM,
      messages: [{ role: 'user', content: `Task: ${task.slice(0, 500)}\n${notes ? `Notes: ${String(notes).slice(0, 1500)}\n` : ''}Break it into ${LEVELS[n]}.` }],
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401) throw new Error('Claude did not accept the API key. Check it in Settings → AI.');
    throw new Error(body?.error?.message || `Claude answered ${res.status}`);
  }
  const steps = parseSteps((body.content || []).map((c) => c.text || '').join(''));
  if (!steps.length) throw new Error('Claude gave no steps. Try again.');
  return steps;
}

// ---- a Hemingway bridge (1.136.0): stop while you still know what comes next, and write that down
const BRIDGE_SYSTEM = [
  'You help someone with ADHD use a Hemingway bridge: they stop work while they still know exactly what comes next,',
  'and leave themselves that next move so starting again is easy.',
  'Given a task (and maybe its notes, steps done and where they stopped), write the one next move to pick up with:',
  'concrete, tiny and obvious, something they can start in under two minutes without deciding anything,',
  'ideally finishing something half-done ("Finish the sentence that starts...", "Open the doc and fill in the third row").',
  'One sentence, at most 140 characters, starting with a verb, in the same language as the task.',
  'Reply with only that sentence, no quotes and nothing else.',
].join(' ');

/** One Hemingway bridge for `title`: the next tiny move to pick up with next time. Returns a string. */
async function bridge(title, { notes = '', steps = [], where = '' } = {}) {
  const task = String(title || '').trim();
  if (!task) throw new Error('Give it a task to make a bridge for.');
  const key = keyOf();
  if (!key) throw new Error('Add your Claude API key in Settings → AI to have Claude think of a bridge.');
  const done = (Array.isArray(steps) ? steps : []).slice(0, 20).map((s) => `${s.done ? '[x]' : '[ ]'} ${String(s.text || s).slice(0, 120)}`).join('\n');
  const res = await fetch(API, {
    method: 'POST',
    signal: AbortSignal.timeout(30000),
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({
      model: MODEL, max_tokens: 300, system: BRIDGE_SYSTEM,
      messages: [{ role: 'user', content: [
        `Task: ${task.slice(0, 500)}`,
        notes && `Notes: ${String(notes).slice(0, 1500)}`,
        done && `Steps:\n${done}`,
        where && `Where they stopped: ${String(where).slice(0, 500)}`,
        'Write the bridge.',
      ].filter(Boolean).join('\n') }],
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401) throw new Error('Claude did not accept the API key. Check it in Settings → AI.');
    throw new Error(body?.error?.message || `Claude answered ${res.status}`);
  }
  const text = (body.content || []).filter((c) => c.type === 'text').map((c) => c.text).join(' ')
    .replace(/\s+/g, ' ').trim().replace(/^["“']+|["”']+$/g, '').slice(0, 300);
  if (!text) throw new Error('Claude gave no bridge. Try again.');
  return text;
}

module.exports = { breakdown, bridge, BRIDGE_SYSTEM, setKey, info, parseSteps, LEVELS };
