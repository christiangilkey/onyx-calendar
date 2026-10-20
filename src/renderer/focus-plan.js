// Hyperfocus, the planning half: when a focus session stops, the quick tasks worth clearing
// first, the steps already written in the notes, the "where I left off" note, the check-in
// times and the noise to play. No DOM and no Electron in here, so it runs the same in the
// window (app.js), the phone app and the tests.
//
// Times are milliseconds since the epoch.

(() => {
  const MIN = 60000;
  const BAND_MIN = 15;              // the striped transition band before the next entry (app.js BUFFER_MIN)
  const LENGTHS = [25, 45, 60, 90, 120];
  const DEFAULT_LENGTH = 90;
  const SHORTEST = 10;              // less than this before the next thing is no time to sink in
  const NATURAL_WITHIN = 4 * 60;    // the next entry is picked as the stop when it is within 4 hours
  const OFFER_WITHIN = 8 * 60;      // and offered at all within 8 (not tomorrow morning's meeting)
  const QUICK_MIN = 10;             // "do these first": open tasks of 10 minutes or less
  const MAX_NOTE = 8000;            // hub.js MAX_NOTE
  const LEFT_OFF = '⏸ Where I left off';
  const IF_THEN = 'When the timer starts, I open ___ and do the first step';

  const floorMin = (ms) => Math.floor(ms / MIN) * MIN;
  const ms = (v) => (typeof v === 'number' ? v : Date.parse(v));

  /**
   * The next fixed thing on the calendar after `now`: a timed event or time block (tasks can
   * move, so they never cut a session short). The session's own entry is skipped.
   */
  function nextEntry(items, now, own) {
    return (items || [])
      .filter((e) => e && e.kind === 'event' && !e.allDay && !e.done && e.start && ms(e.start) > now)
      .filter((e) => !(own && e.id === own.id && String(e.start) === String(own.start)))
      .sort((a, b) => ms(a.start) - ms(b.start))[0] || null;
  }

  /**
   * The hard stops to pick from: the end of the block it was started from, the next entry
   * minus its transition band, and set lengths. `pick` is the one picked to start with: the
   * earliest natural stop (within a few hours), else `length` minutes.
   * Each option: { key, kind: 'block'|'next'|'length', at, minutes, next?, pastNext }.
   */
  function stopOptions({ now, items = [], own = null, band = BAND_MIN, lengths = LENGTHS, length = DEFAULT_LENGTH } = {}) {
    const next = nextEntry(items, now, own);
    const nextAt = next ? ms(next.start) : Infinity;
    const out = [];
    const add = (o) => {
      const at = o.kind === 'length' ? o.at : floorMin(o.at); // a set length is exactly that long
      if (at - now < SHORTEST * MIN || (o.kind !== 'length' && at - now > OFFER_WITHIN * MIN)) return;
      // Flagged: a stop after the next entry starts, or inside the transition before it.
      out.push({ minutes: Math.round((at - now) / MIN), ...o, at, pastNext: o.kind !== 'next' && at > nextAt - band * MIN });
    };
    if (own && own.kind === 'event' && !own.allDay && own.end && ms(own.end) > now) add({ key: 'block', kind: 'block', at: ms(own.end) });
    if (next) {
      // Leave the transition band free; with too little time for it, stop right at the start.
      const withBand = nextAt - band * MIN;
      add({ key: 'next', kind: 'next', at: withBand - now >= SHORTEST * MIN ? withBand : nextAt, next });
    }
    for (const m of [...new Set([...lengths, length])].sort((a, b) => a - b)) add({ key: `len${m}`, kind: 'length', at: now + m * MIN, minutes: m });
    const natural = out.filter((o) => o.kind !== 'length' && o.at - now <= NATURAL_WITHIN * MIN).sort((a, b) => a.at - b.at)[0];
    const pick = natural || out.find((o) => o.key === `len${length}`) || out.find((o) => o.kind === 'length') || null;
    return { options: out, pick: pick ? pick.key : null, next };
  }

  /** The length of a task in minutes, when Onyx knows it (set in Magic add, a pomodoro, or by stretching it). */
  const taskMinutes = (t) => Number(t.minutes) || Number(t.pomodoro && t.pomodoro.minutes) || null;

  /** Today's open tasks of `max` minutes or less (not the session's own), shortest first. */
  function quickTasks(tasks, today, { max = QUICK_MIN, skipId = null } = {}) {
    return (tasks || [])
      .filter((t) => t && !t.done && !t.mirror && t.id !== skipId)
      .filter((t) => (t.start ? localDay(t.start) : t.date) === today)
      .map((t) => ({ t, m: taskMinutes(t) }))
      .filter((x) => x.m && x.m <= max)
      .sort((a, b) => a.m - b.m)
      .map((x) => ({ ...x.t, minutes: x.m }));
  }
  const pad = (n) => String(n).padStart(2, '0');
  const localDay = (v) => { const d = new Date(v); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };

  /** The checklist already written in the notes ("- [ ] step", "1. step"): [{ text, done }]. */
  function notesSteps(notes) {
    const out = [];
    for (const line of String(notes || '').split(/\r?\n/)) {
      const m = line.match(/^\s*(?:[-*•]|\d+[.)])\s+(?:\[([ xX]?)\]\s+)?(.+)$/);
      if (m && m[2].trim()) out.push({ text: m[2].trim(), done: /x/i.test(m[1] || '') });
    }
    return out;
  }

  /** The step to show large: the first one not ticked. */
  const currentStep = (steps) => (steps || []).find((s) => !s.done) || null;

  /**
   * The notes with "where I left off" at the end. An earlier one is replaced, so the notes keep
   * only the latest. Kept within the notes limit, cutting the older text rather than the new note.
   */
  function leftOffNote(notes, { where = '', next = '', when = '' } = {}) {
    const line = (s) => String(s || '').replace(/\s+/g, ' ').trim();
    const old = String(notes || '')
      .replace(new RegExp(`(?:^|\\n+)${LEFT_OFF}[^\\n]*(?:\\n(?:Where I am|Next step): [^\\n]*)*`, 'g'), '')
      .replace(/\s+$/, '');
    const parts = [line(where) && `Where I am: ${line(where)}`, line(next) && `Next step: ${line(next)}`].filter(Boolean);
    if (!parts.length) return old;
    const block = [`${LEFT_OFF}${when ? ` (${line(when)})` : ''}`, ...parts].join('\n').slice(0, MAX_NOTE);
    const room = MAX_NOTE - block.length - 2;
    const kept = room > 0 ? old.slice(0, room).replace(/\s+$/, '') : '';
    return kept ? `${kept}\n\n${block}` : block;
  }

  /** The "where I left off" written last time, to show when a session starts on the same thing. */
  function lastLeftOff(notes) {
    const text = String(notes || '');
    const i = text.lastIndexOf(LEFT_OFF);
    if (i < 0) return null;
    const lines = text.slice(i).split(/\r?\n/);
    const get = (k) => (lines.find((l) => l.startsWith(`${k}: `)) || '').slice(k.length + 2).trim();
    const out = { where: get('Where I am'), next: get('Next step') };
    return out.where || out.next ? out : null;
  }

  /** When the soft ceiling asks "keep going?": a set time after the start, or after the last answer. Null when off. */
  function nextCeiling(startedAt, minutes, lastAnswer = null) {
    if (!minutes) return null;
    return (lastAnswer || startedAt) + minutes * MIN;
  }

  /**
   * The sounds: real recordings (from Freesound, CC0; credits in the README), in assets/sounds.
   * Each is made into one seamless loop the first time it plays (loopBuffer): `start` and
   * `length` (seconds) are the stretch that repeats, and the `fade` seconds that follow it in the
   * recording are blended over its start. `db` levels it with the others, without a peak reaching
   * full scale; `lowCut` (Hz) takes out a rumble under the recording. Nothing here is made up in code.
   */
  const SOUND_FILES = {
    brown: { file: 'brown-noise.mp3', start: 0.2, length: 28.6, fade: 1, db: 4 },
    pink: { file: 'pink-noise.mp3', start: 0.2, length: 40, fade: 1, db: -2 },
    white: { file: 'white-noise.mp3', start: 0.2, length: 28.6, fade: 1, db: 5.9 },
    rain: { file: 'rainforest-rain.mp3', start: 0.1, length: 18.7, fade: 2, db: 6.1 },
    lightrain: { file: 'light-rain.mp3', start: 0.1, length: 20.2, fade: 2, db: 15.2, lowCut: 90 },
    // The stretch of the surf that starts and ends alike, with a long blend for the swell.
    waves: { file: 'beach-waves.mp3', start: 2, length: 51, fade: 4, db: 12.5 },
  };

  /**
   * One seamless loop out of a recording (its channels, Float32Arrays at `rate` samples a second):
   * the stretch from `start` for `length` seconds, with the `fade` seconds after it blended over
   * its first `fade` (equal power, so the blend is no quieter). Played on repeat, the end runs
   * straight on into the start just as the recording ran on, so there is no seam to hear.
   * Shortened if the recording is shorter than asked.
   */
  function loopBuffer(channels, rate, { start = 0, length, fade = 1 }) {
    const total = channels[0].length;
    const s = Math.min(Math.round(start * rate), Math.floor(total / 4));
    const f = Math.max(1, Math.min(Math.round(fade * rate), Math.floor((total - s) / 3)));
    const n = Math.min(Math.round(length * rate), total - s - f);
    return channels.map((src) => {
      const out = src.slice(s, s + n);
      for (let i = 0; i < f; i++) {
        const t = (i + 0.5) / f;
        out[i] = src[s + i] * Math.sqrt(t) + src[s + n + i] * Math.sqrt(1 - t);
      }
      return out;
    });
  }

  /** The slider (0-100) as a gain: a curve, so the low end is usable. */
  const noiseGain = (volume) => Math.pow(Math.max(0, Math.min(100, Number(volume) || 0)) / 100, 2) * 1.2;
  /** A sound's gain at a slider setting: the slider's curve, and the recording's own level. */
  const soundLevel = (kind, volume) => noiseGain(volume) * Math.pow(10, ((SOUND_FILES[kind] || {}).db || 0) / 20);

  /**
   * A Spotify playlist (or album, artist, track, show) as a link Onyx can open: from the link
   * Spotify's Share button copies, or a spotify: address. Null for anything else.
   */
  function spotifyLink(input) {
    const s = String(input || '').trim();
    const m = s.match(/^spotify:(playlist|album|artist|track|show|episode):([A-Za-z0-9]{10,40})$/i)
      || s.match(/^(?:https?:\/\/)?open\.spotify\.com\/(?:intl-[a-z-]+\/)?(playlist|album|artist|track|show|episode)\/([A-Za-z0-9]{10,40})(?:[?#/].*)?$/i);
    return m ? `https://open.spotify.com/${m[1].toLowerCase()}/${m[2]}` : null;
  }

  // Body checks: deep focus forgets the body, so a quiet nudge comes every so often, in turn.
  const BODY_CHECKS = [
    ['💧', 'Have a sip of water'],
    ['🙆', 'Roll your shoulders and unclench your jaw'],
    ['👀', 'Look at something far away for 20 seconds'],
    ['🌬️', 'One slow breath out'],
    ['🪑', 'Sit back, feet flat on the floor'],
    ['🚻', 'Need the bathroom? Go now, it is quicker than holding on'],
  ];
  /** When body check number `shown + 1` is due: every `minutes` from the start. Null when off. */
  const nextBodyCheck = (startedAt, minutes, shown = 0) => (minutes ? startedAt + (shown + 1) * minutes * MIN : null);
  const bodyCheck = (n) => BODY_CHECKS[n % BODY_CHECKS.length];

  // ---- what the log shows: the hours you focus best

  const BEST_MIN_RATED = 5;     // rated sessions needed before Onyx says anything
  const BEST_MIN_WINDOW = 2;    // and at least this many in the hours it names

  /** Each hour of the day (0-23): how many sessions started then, how many were rated, their average rating and minutes. */
  function focusHours(sessions) {
    const hours = Array.from({ length: 24 }, (_, hour) => ({ hour, count: 0, rated: 0, sum: 0, minutes: 0 }));
    for (const s of sessions || []) {
      const t = ms(s.startedAt);
      if (!Number.isFinite(t)) continue;
      const h = hours[new Date(t).getHours()];
      h.count++;
      h.minutes += Math.max(0, Math.round((ms(s.endedAt) - t) / MIN)) || 0;
      if (s.rating >= 1 && s.rating <= 5) { h.rated++; h.sum += s.rating; }
    }
    return hours.map((h) => ({ hour: h.hour, count: h.count, rated: h.rated, minutes: h.minutes, avg: h.rated ? h.sum / h.rated : null }));
  }

  /**
   * The `width` hours in a row where sessions went deepest: { from, to, avg, count }, or null
   * until there are enough rated sessions to say. A tie goes to the hours with more sessions.
   */
  function bestWindow(sessions, { width = 3, minRated = BEST_MIN_RATED, minInWindow = BEST_MIN_WINDOW } = {}) {
    const hours = focusHours(sessions);
    const total = hours.reduce((n, h) => n + h.rated, 0);
    if (total < minRated) return null;
    const overall = hours.reduce((n, h) => n + (h.avg || 0) * h.rated, 0) / total;
    const sumOf = (a, b) => hours.slice(a, b).reduce((n, h) => n + (h.avg || 0) * h.rated, 0);
    const ratedOf = (a, b) => hours.slice(a, b).reduce((n, h) => n + h.rated, 0);
    let best = null;
    for (let from = 0; from + width <= 24; from++) {
      const rated = ratedOf(from, from + width);
      if (rated < minInWindow) continue;
      // Pulled toward your usual rating by one session's worth, so two lucky sessions do not
      // outweigh a steadier record. A tie: the hours with more sessions.
      const score = (sumOf(from, from + width) + overall) / (rated + 1);
      if (!best || score > best.score + 1e-9 || (Math.abs(score - best.score) < 1e-9 && rated > best.count)) best = { from, to: from + width, score, count: rated };
    }
    if (!best) return null;
    // Named by the hours sessions really started in (at least two of them).
    let { from, to } = best;
    while (to - from > 1 && !hours[from].rated) from++;
    while (to - from > 1 && !hours[to - 1].rated) to--;
    if (to - from < 2) { to = Math.min(24, from + 2); from = to - 2; }
    const count = ratedOf(from, to);
    return { from, to, avg: sumOf(from, to) / count, count };
  }

  /** How sessions starting around `hour` (an hour either side) usually go: { avg, count } or null. */
  function hourScore(sessions, hour) {
    const near = focusHours(sessions).filter((h) => Math.abs(h.hour - hour) <= 1 && h.rated);
    const count = near.reduce((n, h) => n + h.rated, 0);
    return count >= BEST_MIN_WINDOW ? { avg: near.reduce((n, h) => n + h.avg * h.rated, 0) / count, count } : null;
  }

  // ---- what next: after a session, a change of pace

  const KIND_WORDS = { focus: 'focus work', call: 'a call', admin: 'admin', errand: 'an errand', chore: 'something around the house', exercise: 'something active', other: 'something else' };
  const ACTIVE = new Set(['exercise', 'chore', 'errand']);

  /**
   * Up to `max` open tasks to do next, a different kind of thing from the session just done:
   * today's first, short ones next, and something that gets you moving after a long sit.
   * After a session that would not settle (rated 1 or 2), nothing of the same kind is offered.
   * `kindOf(title)` says what kind a task is (Magic add's guess). Each: { task, kind, why }.
   */
  function rotation(tasks, { current = {}, today, kindOf, rating = null, minutes = 0, max = 3 } = {}) {
    const was = current.kind || kindOf(current.title || '') || 'focus';
    const out = [];
    for (const t of tasks || []) {
      if (!t || t.done || t.mirror || t.backburner || t.id === current.id) continue;
      const day = t.start ? localDay(t.start) : t.date;
      if (day && day > today) continue; // later days wait
      const kind = kindOf(t.label || t.title || '') || 'other';
      const same = kind === was;
      if (same && rating && rating <= 2) continue;
      const len = taskMinutes(t);
      let score = same ? -2 : 3;
      if (day === today) score += 2; else if (day) score += 1;
      if (len && len <= 30) score += 1;
      if (minutes >= 45 && ACTIVE.has(kind)) score += 2; // after a long sit, moving comes first
      const why = same ? `More ${KIND_WORDS[kind] || kind}`
        : minutes >= 45 && ACTIVE.has(kind) ? `Gets you moving after ${Math.round(minutes)} minutes sitting`
        : `A change of pace: ${KIND_WORDS[kind] || 'something different'}`;
      out.push({ task: t, kind, why: len ? `${why} · ${len} min` : why, score });
    }
    // A repeating task's copies (yesterday's Stretch, today's) are one suggestion: the best of them.
    const seen = new Set();
    return out.sort((a, b) => b.score - a.score)
      .filter((x) => { const k = String(x.task.label || x.task.title || '').trim().toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; })
      .slice(0, max).map(({ score, ...x }) => x);
  }

  /** Break ideas as written ("Stretch, walk to the window" or one to a line): a clean list, at most 12 of up to 60 characters. */
  const parseActivities = (input) => {
    const raw = Array.isArray(input) ? input : String(input || '').split(/[\n,;]+/);
    const out = [];
    for (const r of raw) {
      const t = String(r).replace(/\s+/g, ' ').trim().slice(0, 60);
      if (t && !out.some((x) => x.toLowerCase() === t.toLowerCase())) out.push(t);
      if (out.length >= 12) break;
    }
    return out;
  };
  /**
   * A stretch of `total` minutes as pomodoro chunks: [{ kind: 'work'|'rest', from, to }] in minutes.
   * With a `warmup` (minutes, shorter than a usual round), the first work round is that long, an
   * easy way in; the usual rounds follow.
   */
  function pomodoroChunks(total, p) {
    const out = [];
    const warm = p.warmup > 0 && p.warmup < p.work ? p.warmup : 0;
    for (let t = 0; t < total;) {
      const w = Math.min(!out.length && warm ? warm : p.work, total - t);
      out.push({ kind: 'work', from: t, to: t + w });
      t += w;
      if (t >= total) break;
      const r = Math.min(p.rest, total - t);
      out.push({ kind: 'rest', from: t, to: t + r });
      t += r;
    }
    return out;
  }

  /** The work rounds among the chunks: [{ round (1 on), from, to, minutes, warm }]. */
  const workRounds = (chunks, p = {}) => chunks.filter((c) => c.kind === 'work').map((c, i) => ({
    round: i + 1, from: c.from, to: c.to, minutes: Math.round(c.to - c.from), warm: i === 0 && p.warmup > 0 && p.warmup < p.work,
  }));

  /** The goal written for work round `round` (1 on), or ''. */
  const roundGoal = (goals, round) => String((Array.isArray(goals) && goals[round - 1]) || '').trim();

  /** The idea for break number `n` (1 on): each break takes the next one, round and round. '' when there are none. */
  const breakIdea = (list, n) => (Array.isArray(list) && list.length ? list[(Math.max(1, Math.round(n || 1)) - 1) % list.length] : '');

  const api = {
    parseActivities, breakIdea, pomodoroChunks, workRounds, roundGoal,
    focusHours, bestWindow, hourScore, rotation, BEST_MIN_RATED,
    nextEntry, stopOptions, quickTasks, taskMinutes, notesSteps, currentStep, leftOffNote, lastLeftOff, nextCeiling,
    loopBuffer, noiseGain, soundLevel, spotifyLink, nextBodyCheck, bodyCheck,
    BAND_MIN, LENGTHS, DEFAULT_LENGTH, QUICK_MIN, IF_THEN, LEFT_OFF, BODY_CHECKS, SOUND_FILES,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else globalThis.OnyxFocus = api;
})();
