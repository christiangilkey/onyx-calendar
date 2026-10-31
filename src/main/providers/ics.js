// Read-only calendars from a subscription link (.ics / webcal), which is how
// Outlook, iCloud and most other calendars can be shared without a sign-in.

const ical = require('node-ical');
const moment = require('moment-timezone');
const { RRule } = require('rrule');
const windowsZones = require('node-ical/windowsZones.json');
const { sturdyFetch } = require('../net');

const DAY = 86400000;
const CACHE_MS = 5 * 60000;
const cache = new Map(); // url -> { at, items }

const pad = (n) => String(n).padStart(2, '0');
const localDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const text = (v) => (v && typeof v === 'object' ? String(v.val ?? '') : String(v ?? ''));

async function load(url, force) {
  const hit = cache.get(url);
  if (hit && !force && Date.now() - hit.at < CACHE_MS) return hit.items;
  const res = await sturdyFetch(url, { headers: { 'User-Agent': 'OnyxCalendar' } });
  if (!res.ok) throw new Error(`the calendar link answered HTTP ${res.status}`);
  const raw = await res.text();
  if (!/BEGIN:VCALENDAR/i.test(raw)) throw new Error('that link is not a calendar (.ics) feed');
  const items = Object.values(await ical.async.parseICS(raw)).filter((e) => e.type === 'VEVENT' && e.start);
  cache.set(url, { at: Date.now(), items });
  return items;
}

/** An IANA zone name moment knows, from an IANA or Windows ("Pacific Standard Time") name. */
function zone(tz) {
  if (!tz) return null;
  if (moment.tz.zone(tz)) return tz;
  const mapped = windowsZones[tz]?.iana?.[0];
  return mapped && moment.tz.zone(mapped) ? mapped : null;
}

// Repeating events are expanded in "floating" time (the wall-clock time in the
// event's own zone, held in a Date's UTC fields) and then turned back into real
// instants, so a 9am meeting stays at 9am across daylight-saving changes.
function toFloating(date, tz) {
  if (!tz) {
    return new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate(),
      date.getHours(), date.getMinutes(), date.getSeconds()));
  }
  const m = moment.tz(date, tz);
  return new Date(Date.UTC(m.year(), m.month(), m.date(), m.hour(), m.minute(), m.second()));
}

function fromFloating(f, tz) {
  const parts = [f.getUTCFullYear(), f.getUTCMonth(), f.getUTCDate(), f.getUTCHours(), f.getUTCMinutes(), f.getUTCSeconds()];
  return tz ? moment.tz(parts, tz).toDate() : new Date(...parts);
}

function starts(ev, from, to, allDay, duration) {
  if (!ev.rrule) return [ev.start];
  const tz = allDay ? null : zone(ev.start.tz);
  const o = ev.rrule.origOptions;
  const rule = new RRule({
    ...o, tzid: null, dtstart: toFloating(ev.start, tz),
    ...(o.until ? { until: toFloating(o.until, tz) } : {}),
  });
  return rule.between(new Date(from.getTime() - duration - 2 * DAY), new Date(to.getTime() + 2 * DAY), true)
    .map((f) => fromFloating(f, tz));
}

function expand(ev, from, to) {
  const allDay = ev.datetype === 'date';
  const duration = Math.max(0, (ev.end || ev.start) - ev.start);
  const excluded = new Set(Object.values(ev.exdate || {}).map((d) => +d));
  const out = [];
  const seen = new Set();

  const emit = (src, start) => {
    const length = Math.max(0, (src.end || src.start) - src.start);
    const end = new Date(start.getTime() + length);
    // A zero-length entry still occupies the moment it starts.
    const occupiedUntil = start.getTime() + Math.max(allDay ? DAY : 1, length);
    if (occupiedUntil <= from.getTime() || start >= to) return;
    const item = {
      rawId: `${ev.uid}_${+start}`, title: text(src.summary) || '(No title)', allDay,
      location: text(src.location), notes: text(src.description), link: '',
    };
    if (allDay) {
      item.start = localDate(start);
      item.end = localDate(new Date(start.getFullYear(), start.getMonth(), start.getDate() + Math.max(1, Math.round(length / DAY))));
    } else {
      item.start = start.toISOString();
      item.end = end.toISOString();
    }
    out.push(item);
  };

  for (const start of starts(ev, from, to, allDay, duration)) {
    const key = start.toISOString().slice(0, 10);
    if (excluded.has(+start)) continue;
    const moved = ev.recurrences?.[key];
    if (moved) {
      seen.add(moved);
      emit(moved, moved.start);
    } else {
      emit(ev, start);
    }
  }
  // An occurrence moved into this range from a date outside it.
  for (const moved of Object.values(ev.recurrences || {})) {
    if (!seen.has(moved) && moved.start) emit(moved, moved.start);
  }
  return out;
}

async function events(url, start, end, force) {
  const from = new Date(start), to = new Date(end);
  const out = [];
  for (const ev of await load(url, force)) {
    try {
      out.push(...expand(ev, from, to));
    } catch (err) {
      console.error(`onyx: skipped calendar entry "${text(ev.summary)}":`, err.message);
    }
  }
  return out;
}

module.exports = { events, expand, parse: (raw) => ical.async.parseICS(raw) };
