// Repeating time blocks: the rule a block repeats by, as Onyx keeps it.
//
//   { freq: 'daily' }
//   { freq: 'weekly',  days: [1, 3] }                 Monday and Wednesday (0 is Sunday)
//   { freq: 'monthly', dates: [1, 15] }               the 1st and the 15th
//   { freq: 'yearly',  months: [3, 9], dates: [1] }   1 March and 1 September
//   ...each with an optional `until: 'YYYY-MM-DD'`, the last day it can fall on.
//
// Google Calendar keeps it as an RRULE, Outlook as a recurrence pattern, and Onyx's own
// calendars as this object, laid out into days here.

const FREQS = ['daily', 'weekly', 'monthly', 'yearly'];
const RR_DAYS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
const GRAPH_DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const DAY_MS = 86400000;

const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fromYmd = (s) => new Date(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10));
const isYmd = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ''));
const ints = (list, lo, hi) => [...new Set((Array.isArray(list) ? list : []).map(Number).filter((n) => Number.isInteger(n) && n >= lo && n <= hi))].sort((a, b) => a - b);

/**
 * A clean rule from what the window sent, filled in from the first day where it says
 * nothing (weekly on that weekday, monthly on that date...). null for "does not repeat".
 */
function normalize(rule, first) {
  if (!rule || !rule.freq) return null;
  if (!FREQS.includes(rule.freq)) throw new Error('A block repeats daily, weekly, monthly or yearly.');
  const day = first instanceof Date ? first : fromYmd(String(first).slice(0, 10));
  const out = { freq: rule.freq };
  if (rule.freq === 'weekly') {
    out.days = ints(rule.days, 0, 6);
    if (!out.days.length) out.days = [day.getDay()];
  }
  if (rule.freq === 'monthly' || rule.freq === 'yearly') {
    out.dates = ints(rule.dates, 1, 31);
    if (!out.dates.length) out.dates = [day.getDate()];
  }
  if (rule.freq === 'yearly') {
    out.months = ints(rule.months, 1, 12);
    if (!out.months.length) out.months = [day.getMonth() + 1];
  }
  if (isYmd(rule.until)) out.until = rule.until;
  return out;
}

/** Whether `day` (a local Date) is one the rule falls on. */
function matches(rule, day) {
  switch (rule.freq) {
    case 'daily': return true;
    case 'weekly': return rule.days.includes(day.getDay());
    case 'monthly': return rule.dates.includes(day.getDate());
    case 'yearly': return rule.months.includes(day.getMonth() + 1) && rule.dates.includes(day.getDate());
    default: return false;
  }
}

/** The first day on or after `from` that the rule falls on (within ~4 years), or null. */
function firstOnOrAfter(rule, from) {
  const d = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  for (let i = 0; i < 1500; i++, d.setDate(d.getDate() + 1)) {
    if (rule.until && ymd(d) > rule.until) return null;
    if (matches(rule, d)) return new Date(d);
  }
  return null;
}

/**
 * The days a block repeats on between `from` and `to` (local Dates), starting no earlier
 * than its first day and leaving out the days in `skip` ('YYYY-MM-DD').
 */
function days(rule, first, from, to, skip = []) {
  const out = [];
  const start = new Date(Math.max(new Date(first.getFullYear(), first.getMonth(), first.getDate()), new Date(from.getFullYear(), from.getMonth(), from.getDate())));
  const skipped = new Set(skip);
  for (const d = start; d <= to && out.length < 1000; d.setDate(d.getDate() + 1)) {
    const key = ymd(d);
    if (rule.until && key > rule.until) break;
    if (!skipped.has(key) && matches(rule, d)) out.push(new Date(d));
  }
  return out;
}

// ---------------------------------------------------------------- Google: RRULE

function untilStamp(until, allDay) {
  if (allDay) return until.replace(/-/g, '');
  // The end of that day, local time, in UTC.
  const end = new Date(fromYmd(until).getTime() + DAY_MS - 1000);
  return end.toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
}

function toRRule(rule, allDay) {
  const parts = [`FREQ=${rule.freq.toUpperCase()}`];
  if (rule.freq === 'weekly') parts.push(`BYDAY=${rule.days.map((d) => RR_DAYS[d]).join(',')}`);
  if (rule.freq === 'yearly') parts.push(`BYMONTH=${rule.months.join(',')}`);
  if (rule.freq === 'monthly' || rule.freq === 'yearly') parts.push(`BYMONTHDAY=${rule.dates.join(',')}`);
  if (rule.until) parts.push(`UNTIL=${untilStamp(rule.until, allDay)}`);
  return `RRULE:${parts.join(';')}`;
}

/**
 * The rule from Google's recurrence lines. Rules Onyx can't show as they are (every
 * 2 weeks, the first Monday, 10 times) come back as { freq, custom: true }: kept as they
 * are unless the repeat is changed in Onyx.
 */
function fromRRule(lines, first) {
  const line = (lines || []).find((l) => /^RRULE:/i.test(l));
  if (!line) return null;
  const p = Object.fromEntries(line.slice(6).split(';').map((kv) => kv.split('=')).map(([k, v]) => [k.toUpperCase(), v || '']));
  const freq = String(p.FREQ || '').toLowerCase();
  if (!FREQS.includes(freq)) return { freq: 'daily', custom: true };
  const custom = (p.INTERVAL && p.INTERVAL !== '1') || p.COUNT || p.BYSETPOS || /\d/.test(p.BYDAY || '')
    || (freq !== 'weekly' && p.BYDAY) || p.BYHOUR || p.BYWEEKNO || p.BYYEARDAY;
  const rule = { freq };
  if (p.BYDAY && freq === 'weekly') rule.days = p.BYDAY.split(',').map((d) => RR_DAYS.indexOf(d.slice(-2))).filter((d) => d >= 0);
  if (p.BYMONTHDAY) rule.dates = p.BYMONTHDAY.split(',').map(Number).filter((n) => n > 0);
  if (p.BYMONTH) rule.months = p.BYMONTH.split(',').map(Number);
  if (p.UNTIL) {
    const u = p.UNTIL;
    if (/^\d{8}$/.test(u)) rule.until = `${u.slice(0, 4)}-${u.slice(4, 6)}-${u.slice(6, 8)}`;
    else {
      const d = new Date(`${u.slice(0, 4)}-${u.slice(4, 6)}-${u.slice(6, 8)}T${u.slice(9, 11)}:${u.slice(11, 13)}:${u.slice(13, 15)}Z`);
      if (!Number.isNaN(+d)) rule.until = ymd(d);
    }
  }
  const out = normalize(rule, first);
  return custom ? { ...out, custom: true } : out;
}

// ---------------------------------------------------------------- Outlook: recurrence pattern

/** Outlook's pattern. It repeats a month or a year on one date only, so more dates are refused. */
function toGraph(rule, firstDay, zone) {
  const pattern = { interval: 1 };
  if (rule.freq === 'daily') pattern.type = 'daily';
  if (rule.freq === 'weekly') Object.assign(pattern, { type: 'weekly', daysOfWeek: rule.days.map((d) => GRAPH_DAYS[d]), firstDayOfWeek: 'sunday' });
  if (rule.freq === 'monthly') {
    if (rule.dates.length > 1) throw new Error('Outlook repeats a block on one date a month. Pick one date, or use a Google or Onyx calendar.');
    Object.assign(pattern, { type: 'absoluteMonthly', dayOfMonth: rule.dates[0] });
  }
  if (rule.freq === 'yearly') {
    if (rule.dates.length > 1 || rule.months.length > 1) throw new Error('Outlook repeats a block on one date a year. Pick one month and date, or use a Google or Onyx calendar.');
    Object.assign(pattern, { type: 'absoluteYearly', month: rule.months[0], dayOfMonth: rule.dates[0] });
  }
  const range = rule.until
    ? { type: 'endDate', startDate: firstDay, endDate: rule.until, recurrenceTimeZone: zone }
    : { type: 'noEnd', startDate: firstDay, recurrenceTimeZone: zone };
  return { pattern, range };
}

function fromGraph(rec, first) {
  if (!rec?.pattern) return null;
  const p = rec.pattern;
  const custom = (p.interval && p.interval !== 1) || /relative/i.test(p.type || '') || rec.range?.type === 'numbered';
  const rule = {};
  if (p.type === 'daily') rule.freq = 'daily';
  else if (p.type === 'weekly') Object.assign(rule, { freq: 'weekly', days: (p.daysOfWeek || []).map((d) => GRAPH_DAYS.indexOf(d)).filter((d) => d >= 0) });
  else if (p.type === 'absoluteMonthly') Object.assign(rule, { freq: 'monthly', dates: [p.dayOfMonth] });
  else if (p.type === 'absoluteYearly') Object.assign(rule, { freq: 'yearly', months: [p.month], dates: [p.dayOfMonth] });
  else rule.freq = /month/i.test(p.type) ? 'monthly' : /year/i.test(p.type) ? 'yearly' : 'weekly';
  if (rec.range?.type === 'endDate' && isYmd(rec.range.endDate)) rule.until = rec.range.endDate;
  const out = normalize(rule, first);
  return custom ? { ...out, custom: true } : out;
}

// ---------------------------------------------------------------- moving a series

/**
 * The rule after one of its days moved by `shiftDays` (a block dragged from Wednesday to
 * Thursday moves every one of them a day on: Mon/Wed becomes Tue/Thu).
 */
function shift(rule, shiftDays) {
  if (!rule || !shiftDays) return rule;
  const out = { ...rule };
  if (rule.freq === 'weekly') out.days = [...new Set(rule.days.map((d) => (((d + shiftDays) % 7) + 7) % 7))].sort((a, b) => a - b);
  if (rule.freq === 'monthly' || rule.freq === 'yearly') out.dates = [...new Set(rule.dates.map((d) => Math.min(31, Math.max(1, d + shiftDays))))].sort((a, b) => a - b);
  return out;
}

/** The rule ending on the day before `day` ('YYYY-MM-DD'): "stop repeating from here". */
function endBefore(rule, day) {
  return { ...rule, until: ymd(new Date(fromYmd(day).getTime() - DAY_MS / 2)) };
}

module.exports = { normalize, matches, firstOnOrAfter, days, toRRule, fromRRule, toGraph, fromGraph, shift, endBefore, ymd, fromYmd };
