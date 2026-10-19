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
   * Fills `out` (a Float32Array) with white, pink or brown noise. Pink is white noise filtered
   * so each octave has the same energy (Paul Kellet's filter), softer and less hissy; brown is
   * deeper still, a low rumble like a distant waterfall. `rand` gives 0..1.
   */
  function fillNoise(kind, out, rand = Math.random) {
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < out.length; i++) {
      const w = rand() * 2 - 1;
      if (kind === 'brown') { b0 = (b0 + 0.02 * w) / 1.02; out[i] = b0 * 3.5; continue; }
      if (kind !== 'pink') { out[i] = w * 0.35; continue; }
      b0 = 0.99886 * b0 + w * 0.0555179;
      b1 = 0.99332 * b1 + w * 0.0750759;
      b2 = 0.969 * b2 + w * 0.153852;
      b3 = 0.8665 * b3 + w * 0.3104856;
      b4 = 0.55 * b4 + w * 0.5329522;
      b5 = -0.7616 * b5 - w * 0.016898;
      out[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
      b6 = w * 0.115926;
    }
    return out;
  }

  /**
   * Rain on rainforest leaves, and nothing else: a soft hiss with many tiny drops blended into
   * it. No birds, animal calls or thunder, and no drop much louder than the rest, since anything
   * sudden pulls attention away from the work.
   */
  function fillRain(out, rate, rand = Math.random) {
    const bed = fillNoise('pink', new Float32Array(out.length), rand);
    const lowA = Math.exp(-2 * Math.PI * 180 / rate), highA = Math.exp(-2 * Math.PI * 5500 / rate);
    let low = 0, soft = 0;
    for (let i = 0; i < out.length; i++) {
      low = low * lowA + bed[i] * (1 - lowA);       // the rumble, taken out: rain is a hiss
      soft = soft * highA + (bed[i] - low) * (1 - highA); // and the harsh top, softened
      out[i] = soft * 1.6;
    }
    // Drops: about 140 a second, each a few milliseconds of fading noise, all of them quiet.
    const perSample = 140 / rate;
    for (let i = 0; i < out.length; i++) {
      if (rand() >= perSample) continue;
      const amp = 0.025 + rand() * 0.05;
      const tau = rate * (0.0008 + rand() * 0.0025);
      for (let k = 0, len = Math.min(out.length - i, Math.round(tau * 5)); k < len; k++) out[i + k] += (rand() * 2 - 1) * amp * Math.exp(-k / tau);
    }
    return out;
  }

  /**
   * Beach waves: slow, smooth swells of deep noise with a brighter wash at the top of each, two
   * to a loop (the second a little smaller). No gulls and no crashing break.
   */
  function fillWaves(out, rate, rand = Math.random, period = out.length / 2) {
    // The body of the water: brown noise, a low roar; the wash: pink noise, only near the top.
    const deep = fillNoise('brown', new Float32Array(out.length), rand);
    const wash = fillNoise('pink', new Float32Array(out.length), rand);
    for (let i = 0; i < out.length; i++) {
      const wave = Math.floor(i / period) % 2;
      const s = 0.5 - 0.5 * Math.cos(2 * Math.PI * ((i % period) / period)); // 0 → 1 → 0, smoothly
      const swell = (wave ? 0.8 : 1) * Math.pow(s, 1.4);
      out[i] = deep[i] * (0.35 + 0.65 * swell) + wash[i] * 0.7 * swell * swell;
    }
    return out;
  }

  const SOUND_SECONDS = { white: 4, pink: 4, brown: 6, rain: 8, waves: 20 };
  const SOUND_RMS = 0.12; // every sound as loud as the others at the same volume

  /**
   * One loop of a sound at `rate` samples a second: its end blended into its start so it
   * repeats with no seam, and levelled so each sound is as loud as the others.
   */
  function soundBuffer(kind, rate, rand = Math.random) {
    const n = Math.round(rate * (SOUND_SECONDS[kind] || 4));
    const fade = Math.round(rate * 0.5);
    const raw = new Float32Array(n + fade);
    if (kind === 'rain') fillRain(raw, rate, rand);
    else if (kind === 'waves') fillWaves(raw, rate, rand, (n) / 2);
    else fillNoise(kind, raw, rand);
    const out = raw.slice(0, n);
    for (let i = 0; i < fade; i++) {
      const t = i / fade; // equal-power, so the loop point is not quieter
      out[i] = raw[i] * Math.sqrt(t) + raw[n + i] * Math.sqrt(1 - t);
    }
    let sum = 0;
    for (let i = 0; i < n; i++) sum += out[i] * out[i];
    const k = SOUND_RMS / Math.max(1e-6, Math.sqrt(sum / n));
    for (let i = 0; i < n; i++) out[i] = Math.max(-1, Math.min(1, out[i] * k));
    return out;
  }

  /** The slider (0-100) as a gain: a curve, so the low end is usable. */
  const noiseGain = (volume) => Math.pow(Math.max(0, Math.min(100, Number(volume) || 0)) / 100, 2) * 1.2;

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
  /** The idea for break number `n` (1 on): each break takes the next one, round and round. '' when there are none. */
  const breakIdea = (list, n) => (Array.isArray(list) && list.length ? list[(Math.max(1, Math.round(n || 1)) - 1) % list.length] : '');

  const api = {
    parseActivities, breakIdea,
    focusHours, bestWindow, hourScore, rotation, BEST_MIN_RATED,
    nextEntry, stopOptions, quickTasks, taskMinutes, notesSteps, currentStep, leftOffNote, lastLeftOff, nextCeiling,
    fillNoise, fillRain, fillWaves, soundBuffer, noiseGain, spotifyLink, nextBodyCheck, bodyCheck,
    BAND_MIN, LENGTHS, DEFAULT_LENGTH, QUICK_MIN, IF_THEN, LEFT_OFF, BODY_CHECKS, SOUND_SECONDS,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else globalThis.OnyxFocus = api;
})();
