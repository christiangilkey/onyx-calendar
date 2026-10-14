// Reads the date and time out of a task NAME, e.g. "Call Alex 10am",
// "Submit report Oct 12 3:30pm", "1300-1400 12 Oct Board meeting".
//
// This is a line-for-line port of parse_name() in the Raspberry Pi's task_caller.py.
// The two must agree: the Pi decides when to phone from the name, and this app
// uses the same rules to place tasks on the calendar and to write names the Pi
// will understand. If task_caller.py's rules change, change them here too.

const PREFIX = String.raw`(?:\b(?:at|on|by|due)\s+|@\s*)?`;
const MONTH = String.raw`(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?`;
const MONTHS = Object.fromEntries('jan feb mar apr may jun jul aug sep oct nov dec'.split(' ').map((m, i) => [m, i + 1]));

const DATE_PATTERNS = [
  new RegExp(PREFIX + String.raw`\b(?<y>\d{4})-(?<m>\d{2})-(?<d>\d{2})\b`, 'i'),
  new RegExp(PREFIX + String.raw`\b(?<m>\d{1,2})/(?<d>\d{1,2})(?:/(?<y>\d{4}|\d{2}))?\b`, 'i'),
  // "12 Dec" is tried before "Dec 6" so a day-first date isn't misread.
  new RegExp(PREFIX + String.raw`\b(?<d>\d{1,2})(?:st|nd|rd|th)?\s+(?<mon>${MONTH})(?:,?\s+(?<y>\d{4}))?(?![a-z])`, 'i'),
  new RegExp(PREFIX + String.raw`\b(?<mon>${MONTH})\s+(?<d>\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(?<y>\d{4}))?\b`, 'i'),
];
const WORD_TIME = new RegExp(PREFIX + String.raw`\b(noon|midnight)\b`, 'i');
// Military time: four digits, no colon. Only at the very start of the name, after
// at/by/due/@, or with an hrs/L suffix, so "Room 1100" is not read as a time.
const HHMM = String.raw`(?<t>(?:[01]\d|2[0-3])[0-5]\d)`;
const RANGE_END = String.raw`(?:\s*[-–]\s*(?:[01]\d|2[0-3])[0-5]\d(?:\s*(?:hrs?|hours|h|L))?)?`;
const MILITARY_TIMES = [
  new RegExp(String.raw`^\s*` + HHMM + String.raw`(?<unit>\s*(?:hrs?|hours|h|L))?\b` + RANGE_END, 'i'),
  new RegExp(String.raw`(?:\b(?:at|by|due)\s+|@\s*)` + HHMM + String.raw`(?<unit>\s*(?:hrs?|hours|h|L))?\b` + RANGE_END, 'i'),
  new RegExp(String.raw`\b` + HHMM + String.raw`(?<unit>\s*(?:hrs?|hours)|L)\b` + RANGE_END, 'i'),
];
// A bare day of the month ("21st", "the 3rd"): the next time that day comes around.
const ORDINAL_DAY = new RegExp(PREFIX + String.raw`\b(?:the\s+)?(?<d>[0-3]?\d)(?:st|nd|rd|th)\b`, 'i');
const WEEKDAY = /\b(mon|tues|wednes|thurs|fri|satur|sun)day\b,?|\b(mon|tues?|wed|thu(rs?)?|fri|sat|sun)[.,]/gi;
const TIMEZONE_NOTE = /\([^)]*\b(time|[A-Z]{1,2}[SD]T|UTC|GMT)\b[^)]*\)/gi;
// "3pm", "3:30 pm", "3 p.m.", or 24-hour "15:00". A bare number is never a time.
const TIME_PATTERN = new RegExp(
  PREFIX + String.raw`\b(\d{1,2})(?::([0-5]\d))?\s*([ap])\.?\s*m\.?(?![a-z])|` + PREFIX + String.raw`\b([01]?\d|2[0-3]):([0-5]\d)\b`, 'i');

const pad = (n) => String(n).padStart(2, '0');
const ymd = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;

/** A real calendar date, or null (so "13/45" is not a date). */
function validDate(y, m, d) {
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d ? dt : null;
}

function cut(text, match) {
  return text.slice(0, match.index) + ' ' + text.slice(match.index + match[0].length);
}

function strip(text, chars) {
  let a = 0, b = text.length;
  while (a < b && chars.includes(text[a])) a++;
  while (b > a && chars.includes(text[b - 1])) b--;
  return text.slice(a, b);
}

/**
 * Pull the date and time out of a task name.
 * Returns { spoken, date: 'YYYY-MM-DD' | null, time: [hour, minute] | null }.
 * `spoken` is the name with the date/time removed.
 */
function parseName(title, today = new Date()) {
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  let rest = title, foundDate = null, foundTime = null;

  for (const pattern of DATE_PATTERNS) {
    const m = pattern.exec(rest);
    if (!m) continue;
    const g = m.groups;
    const month = g.mon ? MONTHS[g.mon.slice(0, 3).toLowerCase()] : Number(g.m);
    let year = g.y ? Number(g.y) : null;
    if (year !== null && year < 100) year += 2000;
    const day = Number(g.d);
    let dt;
    if (year === null) { // no year written: the next time that date comes around
      dt = validDate(todayStart.getFullYear(), month, day);
      if (dt && dt < new Date(todayStart.getFullYear(), todayStart.getMonth(), todayStart.getDate() - 180)) {
        dt = validDate(todayStart.getFullYear() + 1, month, day);
      }
    } else {
      dt = validDate(year, month, day);
    }
    if (!dt) continue;
    foundDate = dt;
    rest = cut(rest, m);
    break;
  }

  const word = WORD_TIME.exec(rest);
  const m = word ? null : TIME_PATTERN.exec(rest);
  if (word) {
    foundTime = word[1].toLowerCase() === 'noon' ? [12, 0] : [0, 0];
    rest = cut(rest, word);
  } else if (m) {
    let hour, minute;
    if (m[4] !== undefined) { // 24-hour, e.g. 15:00
      hour = Number(m[4]); minute = Number(m[5]);
    } else {
      hour = Number(m[1]); minute = Number(m[2] || 0);
      hour = hour >= 1 && hour <= 12 ? (hour % 12) + (m[3].toLowerCase() === 'p' ? 12 : 0) : 99;
    }
    if (hour < 24) {
      foundTime = [hour, minute];
      rest = cut(rest, m);
    }
  }

  if (!foundTime) {
    for (const pattern of MILITARY_TIMES) {
      const mil = pattern.exec(rest);
      // "2026 goals" at the start is a year, not 20:26, unless it says "2026hrs".
      if (mil && (mil.groups.unit || Math.abs(Number(mil.groups.t) - todayStart.getFullYear()) > 1)) {
        foundTime = [Number(mil.groups.t.slice(0, 2)), Number(mil.groups.t.slice(2))];
        rest = cut(rest, mil);
        break;
      }
    }
  }

  if (foundTime && !foundDate) {
    const o = ORDINAL_DAY.exec(rest);
    if (o) {
      const day = Number(o.groups.d);
      let year = todayStart.getFullYear(), month = todayStart.getMonth() + 1;
      for (let i = 0; i < 3; i++) { // this month if the day hasn't passed, else the next month that has it
        const candidate = validDate(year, month, day);
        if (candidate && candidate >= todayStart) {
          foundDate = candidate;
          rest = cut(rest, o);
          break;
        }
        [year, month] = month === 12 ? [year + 1, 1] : [year, month + 1];
      }
    }
  }

  if (!foundDate && !foundTime) return { spoken: title, date: null, time: null };

  rest = rest.replace(TIMEZONE_NOTE, ' ');
  if (foundDate) rest = rest.replace(WEEKDAY, ' ');
  let spoken = rest.replace(/\(\s*\)|\[\s*\]/g, ' ');
  spoken = strip(spoken.replace(/\s+/g, ' '), ' -–—,:;@');
  spoken = strip(spoken.replace(/\s+(at|on|by|due)$/i, ''), ' -–—,:;');
  return {
    spoken: spoken || title,
    date: foundDate ? ymd(foundDate.getFullYear(), foundDate.getMonth() + 1, foundDate.getDate()) : null,
    time: foundTime,
  };
}

/**
 * A task name the Pi will read back as exactly this date and time, e.g.
 * "Deep work 2026-10-14 15:00". Anything in the title that the Pi could
 * mistake for a different date or time is dropped.
 */
function mirrorName(title, start) {
  const date = ymd(start.getFullYear(), start.getMonth() + 1, start.getDate());
  const time = `${pad(start.getHours())}:${pad(start.getMinutes())}`;
  const reads = (name) => {
    const p = parseName(name);
    return p.date === date && p.time && p.time[0] === start.getHours() && p.time[1] === start.getMinutes();
  };
  let base = title.trim() || 'Time block';
  for (let i = 0; i < 5; i++) {
    const name = `${base} ${date} ${time}`;
    if (reads(name)) return name;
    const p = parseName(base);
    if ((!p.date && !p.time) || p.spoken === base) break;
    base = p.spoken;
  }
  return `Calendar block ${date} ${time}`;
}

function inQuietHours(when, quietStart, quietEnd) {
  const toMin = (v) => { const [h, m] = v.split(':').map(Number); return h * 60 + m; };
  const start = toMin(quietStart), end = toMin(quietEnd);
  const t = when.getHours() * 60 + when.getMinutes();
  return start > end ? (t >= start || t < end) : (t >= start && t < end);
}

/**
 * When the Pi will phone for something starting at `start`: the first half-hour
 * check that falls within the lead time. Returns { at, quiet }.
 */
function callTime(start, pi) {
  const LEAD_SLACK_MINUTES = 2; // same slack as task_caller.py
  const earliest = start.getTime() - (pi.leadMinutes + LEAD_SLACK_MINUTES) * 60000;
  const half = 30 * 60000;
  const at = new Date(Math.ceil(earliest / half) * half);
  return { at, quiet: inQuietHours(at, pi.quietStart, pi.quietEnd) };
}

module.exports = { parseName, mirrorName, inQuietHours, callTime };
