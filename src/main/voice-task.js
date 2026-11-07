// "Hey Claude" on the phone (VoiceService in the app): the words said after it arrive here as text,
// and become a task in the inbox, from "Hey Claude", for Magic add to plan. With the user's Claude key
// (Settings → AI) Claude reads the words first, so a misheard word or an odd way of saying the day is
// understood; without it, or if Claude can't be reached, voice.js reads them.

const store = require('./store');
const voice = require('./voice');

const MODEL = 'claude-haiku-5-5'; // quick and inexpensive: a task is a few words
const API = 'https://api.anthropic.com/v1/messages';
const SYSTEM = [
  'You turn a to-do someone said out loud into one task for their planner.',
  'The words come from offline speech recognition: no punctuation, numbers written as words, and now and then a wrong word that sounds like the right one.',
  'Reply with only a JSON object: {"title": string, "date": "YYYY-MM-DD" or null, "time": "HH:MM" (24-hour) or null, "minutes": number or null}.',
  'title: what to do, short, in their words, starting with a capital letter, with names capitalised and without the day, time or length.',
  'Fix a word only when it is plainly misheard; never add anything they did not say.',
  'date: only if they gave a day. time: only if they gave a time of day. minutes: only if they said how long it takes.',
  'Write the title in the language they spoke.',
].join(' ');

const keyOf = () => String(store.data.secrets?.anthropicKey || '');
const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** Claude's answer, checked: { title, date, time, minutes } with anything doubtful left null; null if unusable. */
function readAnswer(text) {
  const m = String(text || '').match(/\{[\s\S]*\}/);
  if (!m) return null;
  let o;
  try { o = JSON.parse(m[0]); } catch { return null; }
  const title = typeof o?.title === 'string' ? o.title.replace(/\s+/g, ' ').trim().slice(0, 200) : '';
  if (!title) return null;
  const date = typeof o.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(o.date) && !Number.isNaN(Date.parse(`${o.date}T12:00:00`)) ? o.date : null;
  const time = typeof o.time === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(o.time) ? o.time : null;
  const minutes = Number.isFinite(o.minutes) && o.minutes >= 1 ? Math.min(600, Math.max(5, Math.round(o.minutes))) : null;
  return { title, date, time, minutes };
}

async function askClaude(text, now) {
  const res = await fetch(API, {
    method: 'POST',
    signal: AbortSignal.timeout(15000),
    headers: { 'x-api-key': keyOf(), 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({
      model: MODEL, max_tokens: 200, system: SYSTEM,
      messages: [{ role: 'user', content: `Now: ${now.toLocaleDateString('en-US', { weekday: 'long' })} ${ymd(now)}, ${pad(now.getHours())}:${pad(now.getMinutes())}.\nThey said: "${text}"` }],
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error?.message || `Claude answered ${res.status}`);
  return readAnswer((body.content || []).map((c) => c.text || '').join(''));
}

/**
 * What was said after "Hey Claude" (`text`), made into a task in the inbox. o.claude: false keeps it
 * off Claude even with a key. Returns { taskId, title, date, time, minutes, by: 'claude' | 'onyx' }.
 */
async function add(text, o = {}) {
  const said = String(text || '').replace(/\s+/g, ' ').trim().slice(0, 400);
  if (!said) throw new Error('Nothing was heard after "Hey Claude".');
  const now = new Date();
  let task = null, by = 'onyx';
  if (o.claude !== false && keyOf()) {
    try { task = await askClaude(said, now); if (task) by = 'claude'; } catch { task = null; } // read here instead
  }
  if (!task) task = voice.parseSpoken(said, now);
  const hub = require('./hub');
  const r = await hub.queueTask({
    title: task.title, notes: `Said to Hey Claude: "${said}"`, due: task.date, minutes: task.minutes,
    from: 'voice', limits: task.time ? { preferred: task.time } : null,
  });
  return { taskId: r.taskId, title: task.title, date: task.date || ymd(now), time: task.time, minutes: task.minutes, by };
}

module.exports = { add, readAnswer, SYSTEM };
