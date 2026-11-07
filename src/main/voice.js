// "Hey Claude" on the phone: the words said after it, read into a task. The phone hears them offline
// (Vosk, in the app), so they come in lower case with no punctuation and numbers as words: "call the
// dentist tomorrow at three thirty p m". This reads the day, the time of day and how long it takes out
// of them, and leaves the rest as the task's name. With a Claude key, voice-task.js asks Claude first
// and falls back on this. No Node and no network in here: it runs the same on the PC, the phone's
// engine and in the tests.

const ONES = { zero: 0, oh: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19 };
const TENS = { twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };
const ORDS = { first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7, eighth: 8, ninth: 9, tenth: 10, eleventh: 11, twelfth: 12, thirteenth: 13, fourteenth: 14, fifteenth: 15, sixteenth: 16, seventeenth: 17, eighteenth: 18, nineteenth: 19, twentieth: 20, thirtieth: 30 };
const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];

const alt = (list) => list.slice().sort((a, b) => b.length - a.length).join('|');
const UNIT = alt(Object.keys(ONES).filter((w) => ONES[w] >= 1 && ONES[w] <= 9));
/** A number said or written: "7", "seven", "twenty five", "forty-five". */
const NUM = `(?:\\d{1,4}|(?:${alt(Object.keys(TENS))})(?:[ -](?:${UNIT}))?|${alt(Object.keys(ONES))})`;
/** An ordinal: "3rd", "third", "twenty first". */
const ORD = `(?:\\d{1,2}(?:st|nd|rd|th)|(?:twenty|thirty)[ -](?:${alt(Object.keys(ORDS).filter((w) => ORDS[w] <= 9))})|${alt(Object.keys(ORDS))})`;
const DAY = alt(DAYS);
const MONTH = alt(MONTHS);
// What can follow a bare "at 3" for it to be a time: the end, or a word that is not part of the name.
const AFTER_TIME = `(?=$| (?:on|today|tomorrow|tonight|this|next|in|and|for|every|then|please|so|to|by|before|after|with|o'?clock|o clock|${DAY})\\b)`;

/** "seven" → 7, "twenty five" → 25, "15" → 15; null when it isn't a number. */
function num(s) {
  const t = String(s || '').trim().toLowerCase();
  if (/^\d+$/.test(t)) return Number(t);
  const [a, b] = t.split(/[ -]+/);
  if (a in ONES && !b) return ONES[a];
  if (a in TENS) return TENS[a] + (b ? (ONES[b] ?? NaN) : 0);
  return null;
}
/** "3rd" → 3, "twenty first" → 21. */
function ord(s) {
  const t = String(s || '').trim().toLowerCase();
  const d = /^(\d{1,2})(?:st|nd|rd|th)$/.exec(t);
  if (d) return Number(d[1]);
  const [a, b] = t.split(/[ -]+/);
  if (b) return (TENS[a] || 0) + (ORDS[b] || NaN);
  return ORDS[a] ?? null;
}

const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

/** Takes the first match of `re` out of `s.text` (the words around it closed up), returning the match. */
function take(s, re) {
  const m = re.exec(s.text);
  if (!m) return null;
  s.text = `${s.text.slice(0, m.index)} ${s.text.slice(m.index + m[0].length)}`.replace(/\s+/g, ' ').trim();
  return m;
}

/** What was said, as plain words: lower case, "p.m." and "p m" as "pm", no punctuation but apostrophes and colons in times. */
function normal(text) {
  return String(text || '').toLowerCase()
    .replace(/[“”"]/g, ' ')
    .replace(/\bp\.? ?m\b\.?/g, 'pm').replace(/\ba\.m\.?|\ba m\b/g, 'am')
    .replace(/(\d)\s*:\s*(\d)/g, '$1:$2')
    .replace(/[^\p{L}\p{N}':\- ]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Asking for it, at the start: "add a task to", "remind me to", "I need to". Only what is plainly about
// making the task: "make dinner" or "put the bins out" stay as they are.
const LEAD = new RegExp('^(?:(?:okay|ok|so|um|uh|hey|hi|please|can you|could you|would you|will you|claude|onyx)\\s+)*'
  + '(?:(?:add|create|make|set|put|new)\\s+(?:(?:a|an|new|the|me)\\s+)*(?:task|to ?do|reminder|item|note)s?(?:\\s+(?:to|for|that says|called|saying|about))?'
  + '|add(?:\\s+(?:to (?:my )?(?:list|tasks))?)?'
  + '|remind me(?:\\s+(?:to|that|about))?|reminder(?:\\s+(?:to|for|about))?'
  + "|i\\s+(?:need|must|should|gotta)(?:\\s+to)?|i\\s+(?:have|want|got|ought)\\s+to|i've got to|don't forget(?:\\s+to)?|do not forget(?:\\s+to)?|remember(?:\\s+to)?|note to self|task)\\b\\s*");
// And at the end: "to my list", "please".
const TAIL = /\s+(?:(?:to|on|onto|in|into)\s+(?:my|the)\s+(?:to ?do\s+|task\s+|tasks\s+)?(?:list|tasks|calendar|schedule|planner)|to onyx|in onyx|please|thanks|thank you|okay|ok)$/;
const EDGE_START = /^(?:to|and|that|about|then|so|on|at|by|for)\s+/;
const EDGE_END = /\s+(?:on|at|by|for|and|the|to|in|from|around|about|before|after|this|next|until)$/;

/**
 * Reads a task out of words said aloud. `now` is when they were said. Returns
 * { title, date: 'YYYY-MM-DD' | null, time: 'HH:MM' | null, minutes: number | null }.
 */
function parseSpoken(text, now = new Date()) {
  const said = normal(text);
  const s = { text: said };
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let date = null, minutes = null, hour = null, minute = 0, half = null; // half: 'am' | 'pm' (said or meant)

  // ---- how long: "for half an hour", "for an hour and a half", "for 45 minutes", "for two hours"
  const LEN = `(half an hour|half hour|an hour and a half|one and a half hours?|a couple of hours|a few minutes|an hour|a minute|${NUM}(?: and a half)? (?:hours?|hrs?)(?: (?:and )?${NUM} (?:minutes?|mins?))?|${NUM} (?:minutes?|mins?))`;
  const len = take(s, new RegExp(`\\b(?:for|takes?|taking|lasting)(?: about| around| roughly)? ${LEN}\\b`));
  if (len) {
    const t = len[1];
    if (/^half/.test(t)) minutes = 30;
    else if (/and a half hours?$|^one and a half/.test(t) && !/^an hour/.test(t)) minutes = Math.round(((num(t.replace(/ and a half.*| hours?.*/, '')) ?? 1) + 0.5) * 60);
    else if (t === 'an hour and a half') minutes = 90;
    else if (t === 'a couple of hours') minutes = 120;
    else if (t === 'a few minutes') minutes = 10;
    else if (t === 'an hour') minutes = 60;
    else if (t === 'a minute') minutes = 5;
    else {
      const h = new RegExp(`^(${NUM}) (?:hours?|hrs?)(?: (?:and )?(${NUM}) (?:minutes?|mins?))?$`).exec(t);
      const m = new RegExp(`^(${NUM}) (?:minutes?|mins?)$`).exec(t);
      if (h) minutes = (num(h[1]) || 0) * 60 + (h[2] ? num(h[2]) || 0 : 0);
      else if (m) minutes = num(m[1]);
    }
    if (!(minutes >= 1)) minutes = null;
    else minutes = Math.min(600, Math.max(5, minutes));
  }

  // ---- which day
  const partHalf = (p) => (!p ? null : p === 'morning' ? 'am' : 'pm');
  let m;
  if ((m = take(s, /\b(?:on |by |for )?(?:the )?day after tomorrow\b/))) date = addDays(today, 2);
  else if ((m = take(s, /\b(?:by |for |due )?(tonight|today|this (morning|afternoon|evening))\b/))) {
    date = today;
    half = m[1] === 'tonight' ? 'pm' : partHalf(m[2]);
  } else if ((m = take(s, /\b(?:by |for |due )?tomorrow(?: (morning|afternoon|evening|night))?\b/))) {
    date = addDays(today, 1);
    half = partHalf(m[1]);
  } else if ((m = take(s, new RegExp(`\\b(?:on |by |for |due )?(this |next |coming )?(${DAY})s?(?: (morning|afternoon|evening|night))?\\b`)))) {
    const want = DAYS.indexOf(m[2]);
    let ahead = (want - today.getDay() + 7) % 7;
    if (ahead === 0 && (m[1] || '').trim() !== 'this') ahead = 7; // "on Friday", said on a Friday: next week's
    date = addDays(today, ahead);
    half = partHalf(m[3]);
  } else if ((m = take(s, new RegExp(`\\bin (${NUM}|a|an|one) (days?|weeks?)\\b`)))) {
    const n = /^(a|an)$/.test(m[1]) ? 1 : num(m[1]);
    if (n >= 1 && n <= 366) date = addDays(today, /^week/.test(m[2]) ? n * 7 : n);
  } else if ((m = take(s, /\b(?:by |for )?(next week|this weekend|the weekend|next weekend|at the weekend|on the weekend)\b/))) {
    const sat = (6 - today.getDay() + 7) % 7;
    if (m[1] === 'next week') date = addDays(today, ((1 - today.getDay() + 7) % 7) || 7);
    else if (m[1] === 'next weekend') date = addDays(today, sat + 7);
    else date = addDays(today, today.getDay() === 0 ? 0 : sat);
  } else if ((m = take(s, new RegExp(`\\b(?:on |by |for )?(?:the )?(${ORD}) of (${MONTH})\\b|\\b(?:on |by |for )?(${MONTH}) (?:the )?(${ORD}|${NUM})\\b`)))) {
    const mon = MONTHS.indexOf(m[2] || m[3]);
    const d = m[1] ? ord(m[1]) : (ord(m[4]) ?? num(m[4]));
    if (d >= 1 && d <= 31) {
      let dt = new Date(today.getFullYear(), mon, d);
      if (dt.getMonth() !== mon) dt = null; // "February thirtieth"
      else if (dt < today) dt = new Date(today.getFullYear() + 1, mon, d);
      date = dt;
    }
  } else if ((m = take(s, new RegExp(`\\b(?:on|by|for) the (${ORD})\\b`)))) {
    const d = ord(m[1]);
    if (d >= 1 && d <= 31) {
      let dt = new Date(today.getFullYear(), today.getMonth(), d);
      if (dt < today) dt = new Date(today.getFullYear(), today.getMonth() + 1, d);
      if (dt.getDate() === d) date = dt;
    }
  }

  // ---- the time of day
  const MER = "(am|pm|o'?clock|o clock|in the morning|in the afternoon|in the evening|at night|tonight)";
  const MIN = `(?:(?:oh|o) )?(${NUM})`;
  const merHalf = (x) => (!x ? null : /^(am|in the morning)$/.test(x) ? 'am' : /clock/.test(x) ? null : 'pm');
  if ((m = take(s, /\b(?:at |by |around |about |before |after )?(noon|midday|midnight)\b/))) {
    hour = m[1] === 'midnight' ? 0 : 12;
    half = 'set';
  } else if ((m = take(s, new RegExp(`\\b(?:at |by |around |about )?(half|quarter|${NUM}) (past|after|to|till|before) (${NUM})(?: ${MER})?\\b`)))) {
    const h = num(m[3]);
    const off = m[1] === 'half' ? 30 : m[1] === 'quarter' ? 15 : num(m[1]);
    if (h != null && h <= 12 && off != null && off < 60) {
      const past = /past|after/.test(m[2]);
      hour = past ? h : h === 1 ? 12 : h - 1; // "quarter to one": 12:45
      minute = past ? off : 60 - off;
      half = merHalf(m[4]) || half;
    }
  } else if ((m = take(s, new RegExp(`\\b(?:at |by |around |about |before |after )?(${NUM})(?:[: ]${MIN})? ${MER}\\b`)))
    || (m = take(s, new RegExp(`\\b(?:at|by|around|about) (${NUM})(?:[: ]${MIN})?${AFTER_TIME}`)))
    || (m = take(s, /\b(?:at |by |around |about )?(\d{1,2}):(\d{2})\b/))) {
    const h = num(m[1]), mm = m[2] != null ? num(m[2]) : 0;
    if (h != null && h <= 23 && mm != null && mm < 60) {
      hour = h;
      minute = mm;
      half = merHalf(m[3]) || half;
    }
  }
  let time = null;
  if (hour != null) {
    let h = hour;
    if (half === 'pm' && h < 12) h += 12;
    else if (half === 'am' && h === 12) h = 0;
    else if (!half && h >= 1 && h <= 6) h += 12; // "at 3": in the afternoon, for a task
    else if (!half && h >= 7 && h <= 11 && /\b(dinner|supper|evening|night|bed)\b/.test(s.text)) h += 12;
    time = `${pad(h)}:${pad(minute)}`;
  }

  // ---- the rest is the name
  let rest = s.text;
  for (let i = 0; i < 3; i++) rest = rest.replace(LEAD, '').replace(TAIL, '').trim();
  for (let i = 0; i < 3; i++) rest = rest.replace(EDGE_START, '').replace(EDGE_END, '').trim();
  rest = rest.replace(/\bi\b/g, 'I').replace(/\bi'(m|ll|ve|d)\b/g, "I'$1");
  const title = (rest || said).replace(/^./, (c) => c.toUpperCase()).slice(0, 200);
  return { title, date: date ? ymd(date) : null, time, minutes };
}

module.exports = { parseSpoken, normal, num, ord };
