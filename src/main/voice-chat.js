// "Hey Claude" as a voice assistant (1.134.0): what is said after the phrase goes to Claude as a
// conversation, not straight into a task. Claude answers out loud (the phone speaks the reply), looks at
// the day when asked what's on, searches the web for what it doesn't know, and adds a task to Onyx only
// when asked to. A conversation goes on for a few minutes: the phone sends the same `convo` id while you
// keep talking, and Claude remembers what was said in it.
//
// Without a Claude key (or with "Claude reads it" off) there is no one to talk to: what plainly asks for
// a task is still added, as before (voice-task.js), and anything else gets a spoken hint.

const store = require('./store');
const voice = require('./voice');

const MODEL = 'claude-opus-5-5';
const API = 'https://api.anthropic.com/v1/messages';
const FALLBACK_BETA = 'server-side-fallback-2026-07-01';
const KEEP_MS = 5 * 60 * 1000; // a conversation is forgotten five minutes after the last thing said
const MAX_TURNS = 6;           // rounds of tool calls in one answer

const SYSTEM = [
  'You are Claude, speaking with the user through Onyx, the calendar and planner app on their phone. They talk to you hands free, like a voice assistant, and your reply is read out loud.',
  'Speak naturally and briefly: usually one to three short sentences. Plain spoken words only: no markdown, lists, headings, links, emoji or symbols that cannot be read aloud. Say times and dates the way a person would ("tomorrow at three").',
  'What they say comes from offline speech recognition on the phone: no punctuation, numbers as words, and now and then a wrong word that sounds like the right one. Read it for what they meant.',
  'Just talk with them: answer questions, chat, explain, help them think. Most of what they say is not a task.',
  'Use add_task only when they ask you to add, remind, schedule, put down or not forget something, or plainly say a to-do for their list. If you are unsure whether they want it added, ask in a few words instead of adding it. After adding, say briefly what you added and when.',
  'Use get_schedule when they ask what is on, what they have, when they are free, or anything about their calendar or tasks.',
  'Use web_search for news, weather, scores, opening hours or other facts that change or that you do not know. Give the answer, not the sources.',
  'If they say goodbye, thanks, or that is all, give a short friendly sign off.',
].join(' ');

const TOOLS = [
  {
    name: 'add_task',
    description: 'Adds one task to the user\'s Onyx inbox. Only when they ask for it.',
    strict: true,
    input_schema: {
      type: 'object',
      additionalProperties: false,
      required: ['title', 'date', 'time', 'minutes'],
      properties: {
        title: { type: 'string', description: 'What to do: short, in their words, capitalised, without the day or time.' },
        date: { type: ['string', 'null'], description: 'YYYY-MM-DD if they gave a day, else null.' },
        time: { type: ['string', 'null'], description: '24-hour HH:MM if they gave a time of day, else null.' },
        minutes: { type: ['integer', 'null'], description: 'How long it takes, if they said, else null.' },
      },
    },
  },
  {
    name: 'get_schedule',
    description: 'The user\'s calendar events and dated tasks for a day or a few days, and their open tasks with no day.',
    strict: true,
    input_schema: {
      type: 'object',
      additionalProperties: false,
      required: ['date', 'days'],
      properties: {
        date: { type: 'string', description: 'First day, YYYY-MM-DD.' },
        days: { type: ['integer', 'null'], description: 'How many days from date (1-14). Null for one.' },
      },
    },
  },
  { type: 'web_search_20260209', name: 'web_search', max_uses: 2 },
];

const keyOf = () => String(store.data.secrets?.anthropicKey || '');
const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** Conversations going on now: convo id → { messages, at }. Kept in memory only. */
const talks = new Map();
function talk(id) {
  const now = Date.now();
  for (const [k, v] of talks) if (now - v.at > KEEP_MS) talks.delete(k);
  const key = String(id || '').slice(0, 80);
  let t = key && talks.get(key);
  if (!t) { t = { messages: [], at: now }; if (key) talks.set(key, t); }
  t.at = now;
  return t;
}

/** Plainly a task: "remind me to…", "add a task…", or a day or time in it. For when there is no Claude. */
function asksForTask(text, now = new Date()) {
  const said = voice.normal(text);
  if (voice.LEAD.test(said)) return true;
  const p = voice.parseSpoken(said, now);
  return !!(p.date || p.time);
}

const okDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T12:00:00`));
const okTime = (s) => typeof s === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(s);

async function addTask(input, said) {
  const title = String(input?.title || '').replace(/\s+/g, ' ').trim().slice(0, 200);
  if (!title) throw new Error('The task needs a name.');
  const date = okDate(input.date) ? input.date : null;
  const time = okTime(input.time) ? input.time : null;
  const minutes = Number.isFinite(input.minutes) && input.minutes >= 1 ? Math.min(600, Math.max(5, Math.round(input.minutes))) : null;
  const hub = require('./hub');
  const r = await hub.queueTask({
    title, notes: `Said to Hey Claude: "${said}"`, due: date, minutes,
    from: 'voice', limits: time ? { preferred: time } : null,
  });
  return { taskId: r.taskId, title, date, time, minutes };
}

async function schedule(input) {
  const { TOOLS: MCP } = require('./mcp');
  const run = (name, args) => MCP.find((t) => t.name === name).run(args);
  const date = okDate(input?.date) ? input.date : ymd(new Date());
  const days = Math.min(14, Math.max(1, Number(input?.days) || 1));
  const [agenda, open] = await Promise.all([run('get_agenda', { start: date, days }), run('list_tasks', {})]);
  const brief = (e) => ({ title: e.title, start: e.start, end: e.end, ...(e.location ? { location: e.location } : {}) });
  return {
    from: agenda.from, to: agenda.to,
    events: (agenda.events || []).slice(0, 40).map(brief),
    tasks_with_no_day: (open.tasks || []).filter((t) => !t.due_date).slice(0, 15).map((t) => t.title),
  };
}

async function post(body, fallbacks) {
  const headers = { 'x-api-key': keyOf(), 'anthropic-version': '2023-06-01', 'content-type': 'application/json' };
  if (fallbacks) headers['anthropic-beta'] = FALLBACK_BETA;
  const res = await fetch(API, {
    method: 'POST', signal: AbortSignal.timeout(30000), headers,
    body: JSON.stringify(fallbacks ? { ...body, fallbacks: 'default' } : body),
  });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) {
    const e = new Error(out?.error?.message || `Claude answered ${res.status}`);
    e.status = res.status;
    throw e;
  }
  return out;
}

let fallbacksOk = true; // off for good once this key turns the fallback beta down
async function call(messages) {
  const body = { model: MODEL, max_tokens: 4000, system: SYSTEM, tools: TOOLS, output_config: { effort: 'low' }, messages };
  if (fallbacksOk) {
    try { return await post(body, true); } catch (e) {
      if (e.status !== 400 || !/fallback|beta/i.test(e.message)) throw e;
      fallbacksOk = false;
    }
  }
  return post(body, false);
}

const textOf = (content) => (content || []).filter((c) => c.type === 'text').map((c) => c.text).join(' ').replace(/\s+/g, ' ').trim();

/**
 * What was said after "Hey Claude" (`text`), answered. o.convo: the conversation it belongs to (the
 * phone keeps it while you keep talking); o.claude: false keeps it off Claude. Returns
 * { reply, tasks: [{ taskId, title, date, time, minutes }], by: 'claude' | 'onyx' }.
 */
async function ask(text, o = {}) {
  const said = String(text || '').replace(/\s+/g, ' ').trim().slice(0, 600);
  if (!said) throw new Error('Nothing was heard after "Hey Claude".');
  const now = new Date();

  if (o.claude === false || !keyOf()) {
    if (!asksForTask(said, now)) {
      return { reply: o.claude === false
        ? 'Claude is switched off for Hey Claude, so I can only add tasks. Say remind me to, and the task.'
        : 'To talk with me, add your Claude key in Onyx on your PC, under Keys and accounts. I can still add tasks: say remind me to, and the task.', tasks: [], by: 'onyx' };
    }
    const r = await require('./voice-task').add(said, { claude: false });
    return { reply: `Added ${r.title}.`, tasks: [r], by: 'onyx' };
  }

  const t = talk(o.convo);
  const stamp = `${now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}, ${pad(now.getHours())}:${pad(now.getMinutes())}`;
  const turn = [...t.messages, { role: 'user', content: `[${stamp}, ${ymd(now)}] ${said}` }];
  const tasks = [];
  let reply = '';
  for (let i = 0; i < MAX_TURNS; i++) {
    const r = await call(turn);
    if (r.stop_reason === 'refusal') { reply = 'Sorry, I can\'t help with that one.'; break; }
    turn.push({ role: 'assistant', content: r.content });
    if (r.stop_reason === 'pause_turn') continue; // a web search still going: let it finish
    const uses = (r.content || []).filter((c) => c.type === 'tool_use');
    if (r.stop_reason !== 'tool_use' || !uses.length) { reply = textOf(r.content); break; }
    const results = [];
    for (const u of uses) {
      try {
        let out;
        if (u.name === 'add_task') { out = await addTask(u.input, said); tasks.push(out); }
        else if (u.name === 'get_schedule') out = await schedule(u.input);
        else throw new Error(`No tool called ${u.name}.`);
        results.push({ type: 'tool_result', tool_use_id: u.id, content: JSON.stringify(out) });
      } catch (e) {
        results.push({ type: 'tool_result', tool_use_id: u.id, is_error: true, content: e.message || 'That didn\'t work.' });
      }
    }
    turn.push({ role: 'user', content: results });
  }
  if (!reply) reply = tasks.length ? `Added ${tasks.map((x) => x.title).join(' and ')}.` : 'Sorry, I lost my train of thought. Say that again?';
  // Kept for the next thing said, as long as it ended on Claude's answer (the API wants turns in order).
  if (turn[turn.length - 1].role === 'assistant') t.messages = turn.slice(-40);
  while (t.messages.length && (t.messages[0].role !== 'user' || typeof t.messages[0].content !== 'string')) t.messages.shift();
  return { reply: reply.slice(0, 1200), tasks, by: 'claude' };
}

module.exports = { ask, asksForTask, SYSTEM, TOOLS, _talks: talks };
