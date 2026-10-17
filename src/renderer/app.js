/* global FullCalendar, onyx */
(() => {
  'use strict';

  // Titles, notes and locations come from outside calendars, so they are only
  // ever written with text nodes (h() below), never as HTML.

  const ICONS = {
    left: '<path d="M15 6l-6 6 6 6"/>',
    right: '<path d="M9 6l6 6-6 6"/>',
    down: '<path d="M6 9l6 6 6-6"/>',
    refresh: '<path d="M20 12a8 8 0 1 1-2.34-5.66"/><path d="M20 4v5h-5"/>',
    sliders: '<path d="M4 7h9M19 7h1M4 17h1M11 17h9"/><circle cx="16" cy="7" r="2.4"/><circle cx="8" cy="17" r="2.4"/>',
    tasks: '<rect x="4" y="4" width="16" height="16" rx="4.5"/><path d="M8.5 12.3l2.4 2.4 4.6-5"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    phone: '<path d="M6.5 3.5h3l1.5 4-2 1.5a12 12 0 0 0 6 6l1.5-2 4 1.5v3a2 2 0 0 1-2.2 2A17 17 0 0 1 4.5 5.7a2 2 0 0 1 2-2.2z"/>',
    x: '<path d="M6 6l12 12M18 6L6 18"/>',
    trash: '<path d="M4 7h16M9 7V4h6v3M6.5 7l1 13h9l1-13"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    undo: '<path d="M9 14L4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
    flag: '<path d="M5.5 21V4"/><path d="M5.5 4.5h11.5l-2.4 3.8 2.4 3.8H5.5"/>',
    repeat: '<path d="M4.5 10.5a6.5 6.5 0 0 1 11.3-3.8L18 9"/><path d="M18 4.5V9h-4.5"/><path d="M19.5 13.5a6.5 6.5 0 0 1-11.3 3.8L6 15"/><path d="M6 19.5V15h4.5"/>',
    news: '<rect x="3.5" y="4.5" width="17" height="12.5" rx="2.5"/><path d="M8.5 20.5h7M12 17v3.5"/><path d="M10.2 8.3l4.3 2.45-4.3 2.45z"/>',
    play: '<path d="M7 4.8v14.4L19 12z"/>',
    next: '<path d="M6 5.5v13l9-6.5z"/><path d="M18 5.5v13"/>',
    archive: '<rect x="3.5" y="4.5" width="17" height="4.5" rx="1.5"/><path d="M5.5 9v9.5a1.5 1.5 0 0 0 1.5 1.5h10a1.5 1.5 0 0 0 1.5-1.5V9M10 13h4"/>',
    clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
    bell: '<path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 1.5h-15z"/><path d="M10 20.5a2 2 0 0 0 4 0"/>',
    'bell-off': '<path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 1.5h-15z"/><path d="M10 20.5a2 2 0 0 0 4 0M4 4l16 16"/>',
    calendar: '<rect x="4" y="5" width="16" height="15" rx="3"/><path d="M4 10h16M8.5 3v4M15.5 3v4"/>',
    note: '<path d="M5 6h14M5 11h14M5 16h9"/>',
    lock: '<rect x="5.5" y="10.5" width="13" height="9.5" rx="2.5"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5"/>',
    pin: '<path d="M12 21s6.5-5.6 6.5-10.5a6.5 6.5 0 0 0-13 0C5.5 15.4 12 21 12 21z"/><circle cx="12" cy="10.5" r="2.3"/>',
    tag: '<path d="M3.5 12.2V4.5a1 1 0 0 1 1-1h7.7l8.3 8.3a1.5 1.5 0 0 1 0 2.1l-6.3 6.3a1.5 1.5 0 0 1-2.1 0z"/><circle cx="8" cy="8" r="1.4"/>',
    graph: '<circle cx="12" cy="12" r="2.6"/><circle cx="5" cy="6" r="1.8"/><circle cx="19" cy="7" r="1.8"/><circle cx="17.5" cy="18.5" r="1.8"/><circle cx="5.5" cy="17" r="1.8"/><path d="M6.5 7l3.6 3.4M17.4 7.9l-3.3 2.6M16.3 17.2l-2.4-3.2M7.1 16l2.7-2.2"/>',
    menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
    device: '<rect x="7" y="3" width="10" height="18" rx="2.5"/><path d="M11 18h2"/>',
    target: '<circle cx="12" cy="12" r="7.5"/><circle cx="12" cy="12" r="2.5"/>',
    globe: '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.6 2.3 3.9 5.1 3.9 8.5s-1.3 6.2-3.9 8.5c-2.6-2.3-3.9-5.1-3.9-8.5s1.3-6.2 3.9-8.5z"/>',
    link: '<path d="M14 5h5v5M19 5l-8 8M11 7H6v11h11v-5"/>',
    update: '<path d="M20 12a8 8 0 1 1-2.34-5.66"/><path d="M20 4v5h-5"/><path d="M12 8v6M9.5 11.5L12 14l2.5-2.5"/>',
    qr: '<path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3"/><rect x="8" y="8" width="3" height="3"/><rect x="13" y="8" width="3" height="3"/><rect x="8" y="13" width="3" height="3"/><path d="M13 13h3v3"/>',
  };
  const COLORS = ['#8b7cff', '#4aa8ff', '#3fd0c9', '#5fd38d', '#f5b83d', '#ff9f4a', '#ff6b6b', '#ff7eb6', '#b9b9c2'];
  const PROVIDER = { google: 'Google', microsoft: 'Outlook', ics: 'Link', local: 'Local' };

  const $ = (sel, root = document) => root.querySelector(sel);

  function h(tag, props, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(props || {})) {
      if (v === false || v == null) continue;
      if (k === 'class') el.className = v;
      else if (k === 'css') for (const [name, val] of Object.entries(v)) el.style.setProperty(name, val);
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else if (k in el && k !== 'list') el[k] = v; // an input's `list` can only be set as an attribute
      else el.setAttribute(k, v);
    }
    for (const kid of kids.flat(Infinity)) {
      if (kid != null && kid !== false) el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
    }
    return el;
  }

  function icon(name) {
    const el = h('span', { class: 'ico' });
    el.innerHTML = `<svg viewBox="0 0 24 24">${ICONS[name]}</svg>`; // constant markup from ICONS only
    return el;
  }

  const pad = (n) => String(n).padStart(2, '0');
  const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const hm = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const fromYmd = (s) => new Date(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10));
  const toDate = (v) => (v.length === 10 ? fromYmd(v) : new Date(v));
  const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n, d.getHours(), d.getMinutes());
  const at = (date, time) => { const d = fromYmd(date); const [hh, mm] = time.split(':').map(Number); d.setHours(hh, mm, 0, 0); return d; };
  const sameDay = (a, b) => ymd(a) === ymd(b);

  let S = null;          // app state from the main process
  let calendar = null;   // FullCalendar instance
  let tasks = [];
  let goals = [];        // long-term goals with their steps and progress (goals.js)
  let forceNext = false; // next event fetch bypasses the cache
  let miniMonth = new Date();
  let closePopover = () => {};
  const tagFilter = new Set(); // tags picked in the sidebar: everything else is dimmed
  // The Android app (remote.js) and narrow windows get the phone layout.
  const MOBILE = !!onyx.isPhone || matchMedia('(max-width: 760px)').matches;

  // ------------------------------------------------------------ tags

  const tagInfo = (name) => S.tags.find((t) => t.name.toLowerCase() === String(name).toLowerCase());
  const tagColor = (name) => tagInfo(name)?.color || '#8b7cff';
  const matchesFilter = (tags) => !tagFilter.size || (tags || []).some((t) => tagFilter.has(t.toLowerCase()));

  async function reloadTags() {
    try {
      S.tags = (await onyx.state()).tags;
    } catch { /* keep the old list */ }
    renderSidebar();
    if (graph.on) renderClusters(); // the Clusters tab lists the tags too
  }

  /**
   * A row of tag chips with a text box to add more. get() returns the tags; toggle(name)
   * adds or removes one; onChange(tags) runs whenever they change.
   */
  function tagField(initial, onChange) {
    let tags = [...(initial || [])];
    const input = h('input', { type: 'text', placeholder: tags.length ? 'Add tag' : 'Add tags…', spellcheck: false, autocomplete: 'off' });
    const chips = h('span', { class: 'chips' });
    // Existing tags to tap, shown while typing (the browser's own suggestion list draws
    // badly in the Android app, so this is ours). Filtered by what is typed.
    const suggest = h('div', { class: 'tag-suggest', hidden: true });
    const box = h('div', { class: 'tags-field', onclick: () => input.focus() }, chips, input, suggest);
    const has = (name) => tags.some((x) => x.toLowerCase() === name.toLowerCase());
    const showSuggestions = () => {
      const q = input.value.replace(/^#+/, '').trim().toLowerCase();
      const list = S.tags.filter((t) => !has(t.name) && (!q || t.name.toLowerCase().includes(q))).slice(0, 12);
      suggest.hidden = !list.length || document.activeElement !== input;
      suggest.replaceChildren(...list.map((t) => h('button', {
        type: 'button', class: 'tag-pick', css: { '--t': t.color },
        onpointerdown: (e) => e.preventDefault(), // keep the keyboard up
        onclick: (e) => { e.stopPropagation(); tags.push(t.name); input.value = ''; draw(); showSuggestions(); },
      }, `#${t.name}`)));
    };
    input.addEventListener('focus', showSuggestions);
    input.addEventListener('input', showSuggestions);
    input.addEventListener('blur', () => { suggest.hidden = true; });
    const draw = () => {
      chips.replaceChildren(...tags.map((t) => h('span', { class: 'chip', css: { '--t': tagColor(t) } }, `#${t}`,
        h('button', { type: 'button', title: 'Remove tag', onclick: (e) => { e.stopPropagation(); tags = tags.filter((x) => x !== t); draw(); } }, icon('x')))));
      input.placeholder = tags.length ? 'Add tag' : 'Add tags…';
      onChange?.(tags);
    };
    const add = () => {
      for (const part of input.value.split(',')) {
        const t = part.replace(/^#+/, '').trim();
        if (t && !tags.some((x) => x.toLowerCase() === t.toLowerCase())) tags.push(tagInfo(t)?.name || t);
      }
      input.value = '';
      draw();
    };
    input.addEventListener('keydown', (e) => {
      if ((e.key === 'Enter' || e.key === ',' || e.key === 'Tab') && input.value.trim()) { e.preventDefault(); e.stopPropagation(); add(); }
      else if (e.key === 'Backspace' && !input.value && tags.length) { tags.pop(); draw(); }
    });
    draw();
    const toggle = (name) => {
      const has = tags.some((x) => x.toLowerCase() === name.toLowerCase());
      tags = has ? tags.filter((x) => x.toLowerCase() !== name.toLowerCase()) : [...tags, name];
      draw();
    };
    return { el: box, input, toggle, get: () => { if (input.value.trim()) add(); return tags; } };
  }

  const sameTags = (a, b) => (a || []).join('\n') === (b || []).join('\n');

  // ------------------------------------------------------------ pomodoro
  // A block of time split into work and rest chunks (hub.js setPomodoro). The calendar
  // draws the chunks inside the block, and the top bar runs the timer while it is on.

  /** The chunks of a block `total` minutes long: [{ kind: 'work'|'rest', from, to }] in minutes. */
  function pomodoroChunks(total, p) {
    const out = [];
    for (let t = 0; t < total;) {
      const w = Math.min(p.work, total - t);
      out.push({ kind: 'work', from: t, to: t + w });
      t += w;
      if (t >= total) break;
      const r = Math.min(p.rest, total - t);
      out.push({ kind: 'rest', from: t, to: t + r });
      t += r;
    }
    return out;
  }
  const chunkSummary = (total, p) => {
    const chunks = pomodoroChunks(total, p);
    const work = chunks.filter((c) => c.kind === 'work').length;
    const rest = chunks.length - work;
    return `${work} × ${p.work} min work${rest ? `, ${rest} × ${p.rest} min rest` : ''}`;
  };

  /**
   * The Pomodoro switch and its work / rest lengths (and, for a task, how long it runs).
   * `duration()` gives the block's minutes for the summary line.
   */
  function pomodoroField(cfg, { length = false, duration = () => 60, extra = [] } = {}) {
    const pick = (values, value, unit = 'min') => {
      const all = [...new Set([...values, value])].sort((a, b) => a - b);
      const sel = h('select', null, all.map((v) => h('option', { value: v }, `${v} ${unit}`)));
      sel.value = String(value);
      return sel;
    };
    const on = h('input', { type: 'checkbox', checked: !!cfg });
    const work = pick([15, 20, 25, 30, 45, 50, 60, 90], cfg?.work || 25);
    const rest = pick([3, 5, 10, 15, 20, 30], cfg?.rest || 5);
    const len = length && pick([30, 45, 60, 90, 120, 150, 180, 240], cfg?.minutes || 60);
    const summary = h('small', { class: 'pomo-summary' });
    const body = h('div', { class: 'pomo-opts' }, ...extra, h('span', null, 'Work'), work, h('span', null, 'Rest'), rest, len && h('span', null, 'for'), len);
    const get = () => (on.checked ? { work: +work.value, rest: +rest.value, ...(len ? { minutes: +len.value } : {}) } : null);
    const sync = () => {
      body.hidden = !on.checked;
      const p = get();
      summary.textContent = p ? chunkSummary(len ? p.minutes : duration(), p) : 'Split it into work and rest chunks, with a timer in the top bar';
    };
    for (const el of [on, work, rest, len].filter(Boolean)) el.addEventListener('change', sync);
    sync();
    const el = h('div', { class: 'pomo-field' }, h('label', { class: 'check' }, on, h('b', null, 'Pomodoro')), body, summary);
    return { el, get, sync };
  }
  const samePomodoro = (a, b) => JSON.stringify(a || null) === JSON.stringify(b || null);

  // ---- the timer in the top bar: starts by itself when a pomodoro block's time comes

  const pomoRun = { blocks: [], key: '', dismissed: new Set(), parts: null, loading: false };

  async function refreshPomodoros() {
    if (!S || pomoRun.loading) return;
    pomoRun.loading = true;
    const now = new Date();
    const from = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1); // a block may have started yesterday
    try {
      const { events } = await onyx.events(from.toISOString(), addDays(from, 3).toISOString());
      pomoRun.blocks = events.filter((e) => e.pomodoro && !e.allDay && e.end && visible(e.calendarId));
      // The next-thing bar uses the same read: every timed entry and task still to come.
      nextRun.items = events.filter((e) => !e.allDay && e.end && (e.kind === 'event' || (e.kind === 'task' && !e.done && !e.mirror)) && visible(e.calendarId));
      nextRun.loaded = true;
    } catch { /* keep the last list */ }
    pomoRun.loading = false;
    tickPomodoro();
    tickNext();
  }

  /** Where `now` falls in a pomodoro block: the chunk it is in, time left, and which round. */
  function pomodoroPhase(e, now) {
    const start = new Date(e.start), end = new Date(e.end);
    if (now < start || now >= end) return null;
    const total = (end - start) / 60000;
    const t = (now - start) / 60000;
    const chunks = pomodoroChunks(total, e.pomodoro);
    const index = chunks.findIndex((c) => t >= c.from && t < c.to);
    if (index < 0) return null;
    const c = chunks[index];
    const works = chunks.filter((x) => x.kind === 'work');
    return {
      kind: c.kind, index, left: (c.to - t) * 60000, length: c.to - c.from,
      round: works.filter((w) => w.from <= c.from).length, rounds: works.length,
    };
  }

  /** A soft two-note chime: rising for work, falling for rest. */
  function chime(kind) {
    try {
      const ctx = chime.ctx || (chime.ctx = new AudioContext());
      ctx.resume?.();
      (kind === 'work' ? [587, 880] : [880, 587]).forEach((f, i) => {
        const o = ctx.createOscillator(), g = ctx.createGain(), t0 = ctx.currentTime + i * 0.2;
        o.type = 'sine';
        o.frequency.value = f;
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.exponentialRampToValueAtTime(0.22, t0 + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.5);
        o.connect(g).connect(ctx.destination);
        o.start(t0);
        o.stop(t0 + 0.55);
      });
    } catch { /* no sound: the top bar still shows it */ }
  }

  function announce(e, p, first) {
    chime(p.kind);
    const title = first ? `Pomodoro: ${e.title}` : p.kind === 'work' ? `Back to work: ${e.title}` : `Rest: ${e.title}`;
    const body = `${p.kind === 'work' ? 'Work' : 'Rest'} for ${Math.round(p.length)} min (round ${p.round} of ${p.rounds})`;
    toast(`${title}. ${body}`);
    try {
      if (typeof Notification !== 'undefined' && Notification.permission === 'granted') new Notification(title, { body, silent: true });
      else if (typeof Notification !== 'undefined' && Notification.permission === 'default') Notification.requestPermission();
    } catch { /* the toast is enough */ }
  }

  function tickPomodoro() {
    const box = $('#pomo-timer');
    const now = new Date();
    const live = pomoRun.blocks.map((e) => ({ e, p: pomodoroPhase(e, now) }))
      .find((x) => x.p && !pomoRun.dismissed.has(`${x.e.id}|${x.e.start}`));
    if (!live) { pomoRun.key = ''; box.hidden = true; return; }
    const { e, p } = live;
    const block = `${e.id}|${e.start}`;
    const key = `${block}|${p.index}`;
    if (key !== pomoRun.key) {
      const first = !pomoRun.key.startsWith(`${block}|`);
      pomoRun.key = key;
      announce(e, p, first);
    }
    // Built once and updated in place, so the stop button can be clicked between ticks.
    if (!pomoRun.parts) {
      const parts = { label: h('span', { class: 'pomo-label' }), time: h('span', { class: 'pomo-time' }), round: h('span', { class: 'pomo-round' }) };
      parts.stop = h('button', { class: 'pomo-stop', title: 'Stop the timer for this block', onclick: () => { pomoRun.dismissed.add(parts.block); tickPomodoro(); } }, icon('x'));
      box.replaceChildren(icon('clock'), parts.label, parts.time, parts.round, parts.stop);
      pomoRun.parts = parts;
    }
    const parts = pomoRun.parts;
    parts.block = block;
    const secs = Math.max(0, Math.ceil(p.left / 1000));
    parts.label.textContent = `${e.title} - ${p.kind === 'work' ? 'working' : 'rest'}`;
    parts.time.textContent = `${Math.floor(secs / 60)}:${pad(secs % 60)}`;
    parts.round.textContent = `${p.round}/${p.rounds}`;
    box.className = p.kind;
    box.style.setProperty('--done', `${Math.min(100, 100 - (p.left / (p.length * 60000)) * 100)}%`);
    box.title = `${e.title}: ${p.kind === 'work' ? 'working' : 'resting'}, round ${p.round} of ${p.rounds}. Ends ${fmtTime(new Date(e.end))}.`;
    box.hidden = false;
  }

  // ---- the next-thing bar: time made visible and audible at the point of action
  // A strip under the top bar counts down to the next timed thing (or shows how long the
  // current one has left), shrinking and changing colour as it gets close, and chimes 5
  // minutes before and when it starts.

  const nextRun = { items: [], loaded: false, fired: new Set(), parts: null, key: '' };
  const NEXT_WARN_MIN = 5;
  const NEXT_HORIZON_MIN = 60; // the bar shrinks over the last hour before the next thing
  const nextSoundOn = () => { try { return localStorage.getItem('onyx.next-sound') !== '0'; } catch { return true; } };
  const nextBarOn = () => S?.settings?.nextBar !== false;

  /** "42 min", "1 h 05 min", or "4:32" in the last ten minutes. */
  function untilText(ms, seconds) {
    const total = Math.max(0, Math.round(ms / 1000));
    if (seconds && total < 600) return `${Math.floor(total / 60)}:${pad(total % 60)}`;
    const mins = Math.ceil(total / 60);
    if (mins < 60) return `${mins} min`;
    return `${Math.floor(mins / 60)} h${mins % 60 ? ` ${pad(mins % 60)} min` : ''}`;
  }

  /** A single soft note: the "five minutes to go" cue. */
  function warnTone() {
    try {
      const ctx = chime.ctx || (chime.ctx = new AudioContext());
      ctx.resume?.();
      const o = ctx.createOscillator(), g = ctx.createGain(), t0 = ctx.currentTime;
      o.type = 'sine';
      o.frequency.value = 660;
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.2, t0 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.7);
      o.connect(g).connect(ctx.destination);
      o.start(t0);
      o.stop(t0 + 0.75);
    } catch { /* the bar still shows it */ }
  }

  function cue(e, starting) {
    const title = starting ? `Starting now: ${e.title}` : `In ${NEXT_WARN_MIN} minutes: ${e.title}`;
    if (nextSoundOn()) (starting ? chime('work') : warnTone());
    toast(title);
    try {
      if (typeof Notification !== 'undefined' && Notification.permission === 'granted') new Notification(title, { body: `${fmtTime(new Date(e.start))} · ${e.calendarName || ''}`.replace(/ · $/, ''), silent: true });
    } catch { /* the toast is enough */ }
  }

  function openNextItem(e, anchor) {
    if (e.kind === 'task') openTask(tasks.find((t) => t.id === e.id) || { id: e.id, title: e.title, label: e.title, listName: e.calendarName }, anchor);
    else openEditor({ src: e, start: toDate(e.start), end: toDate(e.end), allDay: false }, anchor);
  }

  function tickNext() {
    const bar = $('#next-bar');
    const show = nextBarOn() && nextRun.loaded;
    if (document.body.classList.contains('has-next') !== show) {
      document.body.classList.toggle('has-next', show);
      requestAnimationFrame(() => calendar?.updateSize()); // the calendar gets shorter or taller
    }
    if (!show) { placeStatus(false); bar.hidden = true; return; }
    const now = Date.now();
    const timed = nextRun.items.map((e) => ({ e, s: new Date(e.start).getTime(), f: new Date(e.end).getTime() }));
    // Now: what has started and not ended (the one that started last); next: the soonest start to come.
    const current = timed.filter((x) => x.s <= now && x.f > now).sort((a, b) => b.s - a.s)[0] || null;
    const next = timed.filter((x) => x.s > now).sort((a, b) => a.s - b.s)[0] || null;

    // Cues: five minutes before, and as it starts (within the last minute, so a late tick still counts).
    for (const x of timed) {
      const left = x.s - now;
      const key = `${x.e.id}|${x.e.start}`;
      if (left <= NEXT_WARN_MIN * 60000 && left > (NEXT_WARN_MIN - 1) * 60000 && !nextRun.fired.has(`${key}|warn`)) { nextRun.fired.add(`${key}|warn`); cue(x.e, false); }
      if (left <= 0 && left > -60000 && !nextRun.fired.has(`${key}|start`)) {
        nextRun.fired.add(`${key}|start`);
        nextRun.fired.add(`${key}|warn`);
        if (popupsOn()) showPopup(popupFor(x.e, 'start')); else cue(x.e, true);
      }
    }

    if (!nextRun.parts) {
      const parts = {
        label: h('button', { class: 'next-label' }),
        // The focal point: [icon] NEXT TASK: name | ● 09h 22m 14s, with a gauge that runs down.
        pill: h('button', { class: 'next-pill' }),
        kindIcon: h('span', { class: 'next-kind' }),
        kind: h('b', { class: 'next-kind-label' }),
        what: h('span', { class: 'what' }),
        live: h('span', { class: 'next-live', 'aria-hidden': 'true' }),
        count: h('span', { class: 'next-count' }),
        gauge: h('span', { class: 'next-gauge', 'aria-hidden': 'true' }, h('i')),
        tools: h('div', { class: 'next-tools' }),
        sound: h('button', { class: 'next-sound', onclick: () => {
          try { localStorage.setItem('onyx.next-sound', nextSoundOn() ? '0' : '1'); } catch { /* this visit only */ }
          toast(nextSoundOn() ? 'Chimes on: 5 minutes before, and as it starts' : 'Chimes off');
          if (nextSoundOn()) warnTone();
          tickNext();
        } }),
      };
      parts.pill.append(parts.kindIcon, parts.kind, parts.what, h('span', { class: 'next-sep', 'aria-hidden': 'true' }), parts.live, parts.count, parts.gauge);
      parts.label.addEventListener('click', (ev) => parts.labelItem && openNextItem(parts.labelItem, ev.currentTarget.getBoundingClientRect()));
      parts.pill.addEventListener('click', (ev) => parts.thenItem && openNextItem(parts.thenItem, ev.currentTarget.getBoundingClientRect()));
      bar.replaceChildren(h('div', { class: 'next-row' },
        h('div', { class: 'next-side' }, parts.label),
        parts.pill,
        h('div', { class: 'next-side end' }, parts.tools, parts.sound)));
      nextRun.parts = parts;
    }
    placeStatus(!MOBILE);
    // Now on the left (what you are in, or free time); in the middle, as the thing to look at,
    // what comes next and the time left before it, ticking by the second.
    const p = nextRun.parts;
    p.labelItem = current?.e || null;
    p.label.replaceChildren(h('b', null, 'Now'), h('span', { class: 'what' }, current ? current.e.title : 'Free time'), ...(current ? [h('small', null, `${untilText(current.f - now)} left`)] : []));
    p.label.title = current ? `Open ${current.e.title}` : '';
    p.label.disabled = !current;
    p.thenItem = next?.e || null;
    let tone = 'calm';
    let gauge = 0;
    if (next) {
      const left = next.s - now;
      const day = !sameDay(new Date(next.s), new Date()) ? ' tomorrow' : '';
      tone = left <= 60000 ? 'urgent' : left <= NEXT_WARN_MIN * 60000 ? 'soon' : left <= 15 * 60000 ? 'near' : 'calm';
      // The gauge runs down from when the wait began (the last thing ending, or the current one
      // starting) to the next start; with nothing earlier, over the last hour.
      const since = Math.max(0, ...timed.filter((x) => x.f <= now).map((x) => x.f), current ? current.s : 0);
      const span = since ? next.s - since : NEXT_HORIZON_MIN * 60000;
      gauge = Math.max(0, Math.min(1, left / span));
      p.kindIcon.replaceChildren(icon(next.e.kind === 'task' ? 'check' : 'calendar'));
      p.kind.textContent = next.e.kind === 'task' ? 'Next task' : 'Next';
      p.what.textContent = next.e.title;
      p.count.textContent = countdown(left);
      p.pill.title = `${untilText(left)} until ${next.e.title} at ${fmtTime(new Date(next.s))}${day}. Click to open it`;
      p.pill.disabled = false;
      p.pill.classList.remove('empty');
    } else {
      p.kindIcon.replaceChildren(icon('calendar'));
      p.kind.textContent = 'Next';
      p.what.textContent = 'Nothing else timed';
      p.count.textContent = '';
      p.pill.title = '';
      p.pill.disabled = true;
      p.pill.classList.add('empty');
    }
    const sound = nextSoundOn();
    p.sound.replaceChildren(icon(sound ? 'bell' : 'bell-off'));
    p.sound.title = sound ? 'Chimes on: 5 minutes before, and as it starts. Click to mute' : 'Chimes off. Click to turn them on';
    bar.className = tone;
    p.pill.style.setProperty('--left', `${(gauge * 100).toFixed(2)}%`);
    bar.hidden = false;
  }

  // Two tiers: the title bar keeps navigation (dates, views, globe, tasks, settings); the bar
  // under it holds the status and the contextual actions (the pomodoro timer, undo, updates,
  // refresh). With the bar off, or on the phone, they stay in the title bar.
  const STATUS_TOOLS = ['pomo-timer', 'undo-btn', 'update-btn', 'refresh'];
  function placeStatus(inBar) {
    const tools = nextRun.parts?.tools;
    const header = $('#titlebar');
    if (inBar && tools) {
      for (const id of STATUS_TOOLS) { const el = document.getElementById(id); if (el && el.parentElement !== tools) tools.append(el); }
    } else if ($('#pomo-timer').parentElement !== header) {
      header.insertBefore($('#pomo-timer'), $('#views'));
      for (const id of STATUS_TOOLS.slice(1)) header.insertBefore(document.getElementById(id), $('#toggle-tasks'));
    }
  }

  /** The countdown in the pill: "09h 22m 14s", "22m 14s", or "2d 03h" for days ahead. */
  function countdown(ms) {
    const total = Math.max(0, Math.floor(ms / 1000));
    const d = Math.floor(total / 86400), hrs = Math.floor((total % 86400) / 3600), m = Math.floor((total % 3600) / 60), s = total % 60;
    if (d) return `${d}d ${pad(hrs)}h`;
    if (hrs) return `${pad(hrs)}h ${pad(m)}m ${pad(s)}s`;
    return `${pad(m)}m ${pad(s)}s`;
  }

  // ---- popups: when the Pi phones about something, and when something starts
  // On the PC each is a small window of its own over everything (main.js, showAlert), with a
  // ring for the call and a chime for the start; on the phone it shows inside the app.

  const popups = { fired: new Set(), snoozed: [] };
  const popupsOn = () => S?.settings?.popups !== false;
  const SNOOZE_MIN = 5;

  function popupFor(e, kind, extra = {}) {
    return {
      key: `${kind}|${e.id}|${e.start}`, kind, id: e.id, title: e.title, start: e.start, end: e.end, color: e.color,
      calendar: e.calendarName || '', sound: nextSoundOn(), hour12: S.settings.hour12, ...extra,
    };
  }

  function showPopup(a) {
    if (onyx.alert && !onyx.isPhone) onyx.alert(a).catch(() => showAlertOverlay(a));
    else showAlertOverlay(a);
  }

  function popupAction(m) {
    const a = m?.alert;
    if (!a) return;
    if (m.action === 'snooze') {
      popups.snoozed.push({ at: Date.now() + SNOOZE_MIN * 60000, alert: { ...a, key: `${a.key}|snooze|${Date.now()}`, snoozed: true } });
      toast(`Snoozed: "${a.title}" again in ${SNOOZE_MIN} minutes`);
    } else if (m.action === 'open') {
      const anchor = new DOMRect(innerWidth / 2 - 1, 130, 2, 2);
      const e = nextRun.items.find((x) => x.id === a.id && x.start === a.start) || nextRun.items.find((x) => x.id === a.id);
      if (e) openNextItem(e, anchor);
      else if (tasks.some((t) => t.id === a.id)) openTask(tasks.find((t) => t.id === a.id), anchor);
    }
  }
  onyx.onAlertAction?.(popupAction);

  // The window hidden in the tray or minimised: things that only draw (the globe) pause.
  onyx.onWindowVisibility?.((hidden) => {
    window.onyxHidden = hidden;
    window.dispatchEvent(new CustomEvent('onyx-visibility', { detail: { hidden } }));
  });

  /** Fires the call popups (at the time the Pi phones) and the snoozed ones; start popups come from tickNext. */
  function tickPopups() {
    if (!popupsOn() || !nextRun.loaded) return;
    const now = Date.now();
    const fire = (key, make) => {
      if (popups.fired.has(key)) return;
      popups.fired.add(key);
      showPopup(make());
    };
    if (S.settings.pi?.enabled) {
      // Blocks and events with a phone reminder: the Pi calls at the time worked out for them.
      for (const e of nextRun.items) {
        if (e.kind !== 'event' || !e.piCall) continue;
        const start = new Date(e.start);
        const c = piCallTime(start, e.callBefore ?? null);
        const at = c.at.getTime();
        if (!c.quiet && now >= at && now - at < 90000 && start.getTime() > now) fire(`call|${e.id}|${e.start}`, () => popupFor(e, 'call', { callAt: c.at.toISOString() }));
      }
      // Google tasks with a time in their name.
      for (const t of tasks) {
        if (!t.call || t.call.quiet || t.mirror || t.done || !t.start) continue;
        const at = new Date(t.call.at).getTime();
        const start = new Date(t.start).getTime();
        if (now >= at && now - at < 90000 && start > now) {
          fire(`call|${t.id}|${t.start}`, () => popupFor({ id: t.id, title: t.label, start: t.start, end: new Date(start + 30 * 60000).toISOString(), color: t.color, calendarName: t.listName }, 'call', { callAt: t.call.at }));
        }
      }
    }
    for (const s of [...popups.snoozed]) {
      if (now < s.at) continue;
      popups.snoozed.splice(popups.snoozed.indexOf(s), 1);
      showPopup(s.alert);
    }
  }

  // ---- the popup inside the app (the phone, and a window that cannot open its own)
  let overlayRing = null;
  function ringOnceHere() {
    try {
      const ctx = chime.ctx || (chime.ctx = new AudioContext());
      ctx.resume?.();
      const note = (f, at, len, vol, type = 'sine') => {
        const o = ctx.createOscillator(), g = ctx.createGain(), t0 = ctx.currentTime + at;
        o.type = type;
        o.frequency.value = f;
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.exponentialRampToValueAtTime(vol, t0 + 0.015);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + len);
        o.connect(g).connect(ctx.destination);
        o.start(t0);
        o.stop(t0 + len + 0.02);
      };
      for (const burst of [0, 0.5]) {
        for (let i = 0; i < 8; i++) note(i % 2 ? 1046.5 : 1318.5, burst + i * 0.045, 0.06, 0.09, 'triangle');
        note(659.25, burst, 0.36, 0.05);
      }
    } catch { /* no sound: the popup still shows */ }
    try { navigator.vibrate?.([400, 150, 400]); } catch { /* no buzz */ }
  }

  function showAlertOverlay(a) {
    let box = $('#alert-stack');
    if (!box) { box = h('div', { id: 'alert-stack' }); document.body.append(box); }
    if (box.querySelector(`[data-key="${CSS.escape(a.key)}"]`)) return;
    const start = new Date(a.start), end = new Date(a.end);
    const when = h('div', { class: 'alert-when' });
    const draw = () => {
      const left = start - Date.now();
      const range = `${fmtTime(start)}${Number.isNaN(+end) ? '' : ` – ${fmtTime(end)}`}`;
      when.replaceChildren(...(left > 30000 ? [h('b', null, `in ${untilText(left)}`), ` · at ${range}`] : [range]), a.calendar ? ` · ${a.calendar}` : '');
    };
    draw();
    const timer = setInterval(draw, 1000);
    const close = (action) => {
      clearInterval(timer);
      if (overlayRing && card.dataset.ringing) { clearInterval(overlayRing); overlayRing = null; }
      card.classList.add('leaving');
      setTimeout(() => card.remove(), 220);
      if (action !== 'dismiss') popupAction({ action, alert: a });
    };
    const card = h('div', { class: `alert-card ${a.kind}`, 'data-key': a.key, css: { '--c': a.color || 'var(--accent)' } },
      h('div', { class: 'alert-head' }, icon(a.kind === 'call' ? 'phone' : 'clock'),
        h('span', null, a.snoozed ? 'Reminder (snoozed)' : a.kind === 'call' ? 'Reminder call' : 'Starting now'),
        h('span', { class: 'grow' }), h('button', { class: 'icon-btn', title: 'Close', onclick: () => close('dismiss') }, icon('x'))),
      h('div', { class: 'alert-title' }, a.title),
      when,
      h('div', { class: 'alert-row' },
        h('button', { class: 'btn primary', onclick: () => close('open') }, 'Open'),
        h('button', { class: 'btn', onclick: () => close('snooze') }, `Snooze ${SNOOZE_MIN} min`),
        h('button', { class: 'btn', onclick: () => close('dismiss') }, 'Got it')));
    box.append(card);
    if (a.sound !== false) {
      if (a.kind === 'call') {
        card.dataset.ringing = '1';
        clearInterval(overlayRing);
        let rings = 0;
        ringOnceHere();
        overlayRing = setInterval(() => { if (++rings >= 7) { clearInterval(overlayRing); overlayRing = null; } else ringOnceHere(); }, 2600);
      } else {
        chime('work');
      }
    }
    setTimeout(() => card.isConnected && close('dismiss'), 15 * 60000);
  }

  // ------------------------------------------------------------ where an entry came from

  const ORIGIN = {
    google: { calendar: ['Google Calendar', '#4aa8ff'], tasklist: ['Google Tasks', '#f5b83d'] },
    microsoft: { calendar: ['Outlook', '#3b9cf5'], tasklist: ['Microsoft To Do', '#7aa7ff'] },
    ics: { calendar: ['Calendar link', '#3fd0c9'] },
    local: { calendar: ['Onyx', '#8b7cff'] },
  };

  /**
   * One line at the top of an entry's window: where it lives (Google Calendar, Google
   * Tasks, Outlook, To Do, a calendar link, or Onyx), which calendar or list and account,
   * and how it got there (added from Onyx, a goal's step, a Pi reminder, a repeat...).
   */
  function originRow(x) {
    if (x.kind === 'goal') {
      const list = S.calendars.find((c) => c.id === x.listId);
      return h('div', { class: 'origin', css: { '--o': '#8b7cff' } }, h('span', { class: 'origin-badge' }, 'Onyx goal'),
        h('span', { class: 'origin-text' }, `Kept in Onyx on this PC${list ? `. Its steps are tasks in ${PROVIDER_TASKS[list.provider] || 'your tasks'}: ${list.name} · ${list.accountLabel}` : ''}`));
    }
    const isTask = x.kind === 'task' || 'listId' in x || String(x.id || '').includes('/tl~');
    const calId = x.listId || x.calendarId || String(x.id || '').split('/').slice(0, 2).join('/');
    const cal = S.calendars.find((c) => c.id === calId);
    const provider = cal?.provider || x.provider || (calId.startsWith('local/') ? 'local' : '');
    const [badge, color] = ORIGIN[provider]?.[isTask ? 'tasklist' : 'calendar'] || ['Unknown source', '#7f7f89'];
    const where = [cal?.name || x.listName || x.calendarName, provider !== 'local' && cal?.accountLabel !== cal?.name && cal?.accountLabel].filter(Boolean).join(' · ');
    const series = tasks.find((t) => t.id === x.id)?.series || x.series;
    let how;
    if (provider === 'local') how = 'A time block made in Onyx, kept on this PC';
    else if (x.mirror) how = 'Made by Onyx so the Raspberry Pi phones you about a calendar entry';
    else if (x.goal) how = `Added by Onyx as a step of the goal "${x.goal.title}"`;
    else if (series && !series.managed) how = 'Repeats in Google Tasks';
    else if (x.madeHere) how = `Added from Onyx on ${fmtDay(fromYmd(x.madeHere))}`;
    else if (provider === 'ics') how = 'From a subscribed calendar link (read-only)';
    else how = `Synced from ${badge}`;
    if (x.repeat || series?.managed) how += ', repeated by Onyx';
    return h('div', { class: 'origin', css: { '--o': color }, title: `${badge}${where ? ` · ${where}` : ''}\n${how}` },
      h('span', { class: 'origin-badge' }, badge),
      h('span', { class: 'origin-text' }, [where, how].filter(Boolean).join('  ·  ')));
  }
  const PROVIDER_TASKS = { google: 'Google Tasks', microsoft: 'Microsoft To Do' };

  // ------------------------------------------------------------ notes on entries
  // Every task, event, block and pinned document has a notes box. Notes go to Google or
  // Outlook where the entry can be written; otherwise they are kept in Onyx (`memo`).

  const notesOf = (x) => [x?.notes, x?.memo].map((s) => (s || '').trim()).filter(Boolean).join('\n\n');
  const cleanNote = (s) => String(s || '').replace(/\s+$/, '');

  /** A notes box that grows with what is written in it. */
  function notesField(value, placeholder = 'Notes: anything you want to remember about this') {
    const box = h('textarea', { class: 'notes-field', rows: 2, placeholder, value: value || '', spellcheck: true });
    const fit = () => { box.style.height = 'auto'; box.style.height = `${Math.min(box.scrollHeight + 2, 260)}px`; };
    box.addEventListener('input', fit);
    // Fit once the popup has its real width: measured earlier, the text wraps narrow and the box opens at full height.
    let width = 0;
    new ResizeObserver(() => { if (box.clientWidth && box.clientWidth !== width) { width = box.clientWidth; fit(); } }).observe(box);
    return box;
  }

  /** A short preview of an entry's notes for lists. */
  const notePreview = (text) => text && h('div', { class: 'note-preview', title: text }, icon('note'), h('span', null, text.replace(/\s*\n+\s*/g, ' · ')));

  const fmtTime = (d) => d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: S.settings.hour12 });
  const fmtDay = (d) => d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
  const quietLabel = () => `${fmtTime(at('2000-01-01', S.settings.pi.quietStart))} to ${fmtTime(at('2000-01-01', S.settings.pi.quietEnd))}`;

  /** `action` ({ label, run }) adds a button to the toast, like Undo. */
  function toast(message, kind = '', action) {
    const el = h('div', { class: `toast ${kind}${action ? ' has-action' : ''}` }, h('span', null, message),
      action && h('button', { class: 'toast-action', onclick: () => { el.remove(); action.run(); } }, action.label));
    $('#toasts').append(el);
    setTimeout(() => el.remove(), action ? 8000 : kind ? 7000 : 3200);
  }

  // The phone talking to an older Onyx on the PC: say so once, not on every reload.
  let toldOutdated = false;
  function outdated(err) {
    if (!err?.outdated) return false;
    if (!toldOutdated) toast(err.message, 'warn');
    toldOutdated = true;
    return true;
  }

  /** Saves a pomodoro split. An older PC without the timer keeps the entry and just skips the split. */
  async function savePomodoro(id, split) {
    try {
      await onyx.setPomodoro(id, split);
    } catch (err) {
      if (!outdated(err)) throw err;
    }
  }

  let lastProblems = '';
  function showProblems(errors) {
    const text = (errors || []).join('  ·  ');
    if (text && text !== lastProblems) toast(text, 'error');
    lastProblems = text;
  }

  // ------------------------------------------------------------ Pi call timing
  // Mirrors callTime() in src/main/taskname.js: the Pi checks on the hour and
  // half-hour, and phones at the first check inside the lead time.

  function piCallTime(start, before = null) {
    const pi = S.settings.pi;
    const half = 30 * 60000;
    const callAt = new Date(Math.ceil((start.getTime() - ((before ?? pi.leadMinutes) + 2) * 60000) / half) * half);
    const mins = (v) => { const [a, b] = v.split(':').map(Number); return a * 60 + b; };
    const t = callAt.getHours() * 60 + callAt.getMinutes();
    const qs = mins(pi.quietStart), qe = mins(pi.quietEnd);
    return { at: callAt, quiet: qs > qe ? (t >= qs || t < qe) : (t >= qs && t < qe) };
  }

  const hasGoogleTasks = () => S.calendars.some((c) => c.kind === 'tasklist' && c.provider === 'google');

  /** The half-hour checks the Pi could phone at for something starting at `start`: from the day before up to the start. */
  function callSlots(start) {
    const half = 30 * 60000;
    const out = [];
    for (let t = Math.floor((start.getTime() - 60000) / half) * half; t > start.getTime() - 24 * 3600000 && t > Date.now(); t -= half) out.push(new Date(t));
    return out;
  }

  /** What the Pi will do for something starting at `start` (`before`: a picked call time, as minutes before): { text, tone, allowed }. */
  function piStatus(start, allDay, before = null) {
    if (!hasGoogleTasks()) return { text: 'Connect Google in Settings. The Pi reads Google Tasks.', tone: '', allowed: false };
    if (allDay) return { text: 'Needs a start time, so not for all-day entries.', tone: '', allowed: false };
    if (start <= new Date()) return { text: 'This has already started.', tone: '', allowed: false };
    const call = piCallTime(start, before);
    if (call.quiet) return { text: `Would ring at ${fmtTime(call.at)}, inside quiet hours (${quietLabel()}), so the Pi skips it.`, tone: 'warn', allowed: true };
    return { text: `The Pi phones you at ${fmtTime(call.at)}${sameDay(call.at, start) ? '' : ' the day before'}.`, tone: 'ok', allowed: true };
  }

  // ------------------------------------------------------------ calendar grid

  const visible = (id) => !S.settings.hidden[id];

  function toFc(e) {
    return {
      id: e.id, title: e.title, start: e.start, end: e.end, allDay: e.allDay,
      backgroundColor: e.color, borderColor: e.color,
      // Tasks can be dragged to another day or time, but keep their length.
      editable: e.kind === 'task' ? !!e.movable : e.writable && e.kind === 'event',
      durationEditable: e.kind === 'event' && e.writable,
      classNames: [e.kind === 'task' ? 'is-task' : e.kind === 'goal' ? 'is-goal' : 'is-event', e.done ? 'is-done' : '', matchesFilter(e.tags) ? '' : 'is-dim'],
      extendedProps: { src: e },
    };
  }

  async function source(info, ok) {
    try {
      const force = forceNext;
      forceNext = false;
      const { events, errors } = await onyx.events(info.start.toISOString(), info.end.toISOString(), force);
      showProblems(errors);
      ok(events.filter((e) => visible(e.calendarId)).map(toFc));
    } catch (err) {
      toast(err.message, 'error');
      ok([]);
    }
  }

  function refetch(force) {
    if (force) forceNext = true;
    calendar.refetchEvents();
    if (graph.on) loadGraph();
    clearTimeout(refetch.pomo);
    refetch.pomo = setTimeout(refreshPomodoros, 400); // blocks may have moved or changed
  }


  function eventContent(arg) {
    const src = arg.event.extendedProps.src;
    // The block being dragged out has no entry behind it yet: show just its times.
    if (!src) return { domNodes: [h('div', { class: 'ev' }, h('div', { class: 'ev-title' }, h('span', { class: 't' }, arg.timeText || 'New block')))] };
    const notes = notesOf(src);
    if (src.kind === 'goal') {
      // A goal's time frame: one bar with its progress.
      const p = src.progress || { done: 0, total: 0, percent: 0 };
      return { domNodes: [h('div', { class: 'ev goal-bar', css: { '--p': `${p.percent}%` }, title: `Goal: ${src.title}\n${p.done} of ${p.total} steps done${notes ? `\n\n${notes}` : ''}` },
        h('div', { class: 'ev-title' }, icon('flag'), h('span', { class: 't' }, src.title), p.total > 0 && h('span', { class: 'goal-pct' }, `${p.percent}%`)))] };
    }
    const title = h('div', { class: 'ev-title' },
      // A task's circle: clicking it ticks the task off (eventClick); the rest opens it.
      src.kind === 'task' && h('span', { class: 'dot', title: src.done ? 'Done. Tap to bring it back' : 'Mark done' }, src.done && checkMark()),
      h('span', { class: 't' }, arg.event.title),
      src.goal && h('span', { class: 'ev-goal', title: `A step toward: ${src.goal.title}` }, icon('flag')),
      src.repeat && h('span', { title: REPEAT[src.repeat] }, icon('repeat')),
      src.pomodoro && h('span', { class: 'ev-pomo', title: `Pomodoro: ${src.pomodoro.work} min work, ${src.pomodoro.rest} min rest` }, icon('clock')),
      src.piCall && icon('phone'),
      notes && icon('note'),
      src.kind === 'event' && !src.writable && icon('lock'),
      src.tags?.length > 0 && h('span', { class: 'tagdots', title: src.tags.map((t) => `#${t}`).join(' ') },
        src.tags.slice(0, 4).map((t) => h('i', { css: { '--t': tagColor(t) } }))));
    // On the PC, hovering shows a preview card (showPeek); the phone keeps the plain tooltip.
    return { domNodes: [h('div', { class: 'ev', title: notes && MOBILE ? `${arg.event.title}\n\n${notes}` : null }, title, arg.timeText && h('div', { class: 'ev-time' }, arg.timeText))] };
  }

  // A preview card for the block under the pointer: its whole name, times, calendar, notes and
  // tags, which a short or narrow block cuts off. Shown after a short pause, never while dragging.
  const peek = { el: null, timer: 0 };
  document.addEventListener('scroll', () => hidePeek(), true); // the block moved away from under the card
  function showPeek(info) {
    hidePeek();
    const src = info.event.extendedProps.src;
    if (MOBILE || !src || src.kind === 'goal' || document.body.classList.contains('dragging-entry')) return;
    peek.timer = setTimeout(() => {
      if (!info.el.isConnected || document.body.classList.contains('dragging-entry')) return;
      const e = info.event;
      const notes = notesOf(src);
      const when = e.allDay ? `${fmtDay(e.start)} · all day` : `${fmtDay(e.start)} · ${fmtTime(e.start)}${e.end ? ` – ${fmtTime(e.end)}` : ''}`;
      const card = h('div', { class: 'ev-peek', css: { '--c': src.color || '#8b7cff' } },
        h('div', { class: 'peek-title' }, e.title),
        h('div', { class: 'peek-when' }, when),
        h('div', { class: 'peek-cal' }, [src.kind === 'task' ? (src.done ? 'Task · done' : 'Task') : null, src.calendarName].filter(Boolean).join(' · ')),
        notes && h('div', { class: 'peek-notes' }, notes.length > 240 ? `${notes.slice(0, 240)}…` : notes),
        src.tags?.length > 0 && h('div', { class: 'peek-tags' }, src.tags.map((t) => h('span', { css: { '--t': tagColor(t) } }, `#${t}`))));
      document.body.append(card);
      peek.el = card;
      const r = info.el.getBoundingClientRect();
      let x = r.right + 8;
      if (x + card.offsetWidth > innerWidth - 8) x = r.left - card.offsetWidth - 8;
      card.style.left = `${Math.max(8, x)}px`;
      card.style.top = `${Math.max(8, Math.min(r.top, innerHeight - card.offsetHeight - 8))}px`;
    }, 350);
  }
  function hidePeek() {
    clearTimeout(peek.timer);
    peek.el?.remove();
    peek.el = null;
  }

  /**
   * A pomodoro block in the day and week views shows its rest chunks as darker bands, at
   * their real place and size (a 2-hour block of 25/5 has its 4 rests where they fall).
   */
  function drawPomodoroStripes(arg) {
    const p = arg.event.extendedProps.src?.pomodoro;
    if (!p || arg.event.allDay || !arg.view.type.startsWith('timeGrid') || !arg.event.end) return;
    const total = (arg.event.end - arg.event.start) / 60000;
    if (total <= 0) return;
    const bands = pomodoroChunks(total, p).filter((c) => c.kind === 'rest')
      .map((c) => `transparent ${(c.from / total) * 100}%, rgba(0,0,0,.5) ${(c.from / total) * 100}%, rgba(0,0,0,.5) ${(c.to / total) * 100}%, transparent ${(c.to / total) * 100}%`);
    if (!bands.length) return;
    arg.el.classList.add('pomo');
    arg.el.style.backgroundImage = `linear-gradient(to bottom, transparent 0%, ${bands.join(', ')}, transparent 100%)`;
  }

  async function onMove(info) {
    const e = info.event;
    const src = e.extendedProps.src;
    if (src.kind === 'task') return moveTaskTo(info);
    const end = e.end || (e.allDay ? addDays(e.start, 1) : new Date(e.start.getTime() + 3600000));
    try {
      const saved = await onyx.updateEvent(src.id, e.allDay
        ? { start: ymd(e.start), end: ymd(end), allDay: true }
        : { start: e.start.toISOString(), end: end.toISOString(), allDay: false });
      if (saved.warning) toast(saved.warning, 'warn');
      refetch();
    } catch (err) {
      info.revert();
      toast(err.message, 'error');
    }
  }

  /** A task dropped on another day (or time): its due date in Google Tasks / To Do follows. */
  async function moveTaskTo(info) {
    const e = info.event;
    try {
      const t = await onyx.moveTask(e.extendedProps.src.id, e.allDay ? { date: ymd(e.start) } : { start: e.start.toISOString() });
      const day = toDate(t.date).toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' });
      const call = t.call && !t.call.quiet && !t.call.past ? ` · the Pi phones at ${fmtTime(new Date(t.call.at))}` : '';
      toast(`Moved to ${day}${t.start ? ` ${fmtTime(new Date(t.start))}` : ''}${call}`);
      refetch();
      loadTasks(true);
    } catch (err) {
      info.revert();
      toast(err.message, 'error');
    }
  }

  function timeFormats() {
    const hour12 = S.settings.hour12;
    return {
      slotLabelFormat: hour12 ? { hour: 'numeric', meridiem: 'short' } : { hour: '2-digit', minute: '2-digit', hour12: false },
      eventTimeFormat: hour12 ? { hour: 'numeric', minute: '2-digit', meridiem: 'short' } : { hour: '2-digit', minute: '2-digit', hour12: false },
    };
  }

  function buildCalendar() {
    // A week is too narrow on a phone: it gets three days instead, and the reverse on the desktop.
    let view = S.settings.view;
    if (MOBILE && view === 'timeGridWeek') view = 'timeGrid3';
    if (!MOBILE && view === 'timeGrid3') view = 'timeGridWeek';
    calendar = new FullCalendar.Calendar($('#calendar'), {
      initialView: view,
      views: { timeGrid3: { type: 'timeGrid', duration: { days: 3 } } },
      longPressDelay: 350,
      headerToolbar: false,
      height: '100%',
      expandRows: true,
      nowIndicator: true,
      firstDay: S.settings.weekStart,
      slotDuration: '00:30:00',
      snapDuration: '00:15:00',
      scrollTime: '07:00:00',
      allDayText: 'all day',
      dayMaxEvents: true,
      eventDisplay: 'block',
      eventColor: '#8b7cff',
      eventMinHeight: 22, // a 15-minute entry still shows a full line of its name
      // Hovering a block shows a preview card with what it cuts off.
      eventMouseEnter: showPeek,
      eventMouseLeave: hidePeek,
      ...timeFormats(),
      // Drag across the grid to block out time; the highlight stays until the editor closes.
      selectable: true,
      selectMirror: true,
      unselectAuto: false,
      editable: true,
      events: source,
      eventContent,
      eventDidMount: (arg) => {
        arg.el.style.setProperty('--c', arg.event.extendedProps.src?.color || '#8b7cff');
        drawPomodoroStripes(arg);
      },
      // Month headers stand for a weekday, not a real date, so they use FullCalendar's own text.
      dayHeaderContent: (arg) => (arg.view.type === 'dayGridMonth'
        ? { domNodes: [h('span', { class: 'dh-dow' }, arg.text)] }
        : { domNodes: [h('span', { class: 'dh-dow' }, arg.date.toLocaleDateString([], { weekday: 'short' })), h('span', { class: 'dh-num' }, arg.date.getDate())] }),
      select: (info) => {
        const marked = $('.fc-event-mirror') || $('.fc-highlight');
        const anchor = marked ? marked.getBoundingClientRect() : pointRect(info.jsEvent);
        openEditor({ start: info.start, end: info.end, allDay: info.allDay }, anchor);
      },
      eventClick: (info) => {
        info.jsEvent.preventDefault();
        hidePeek();
        const src = info.event.extendedProps.src;
        const anchor = info.el.getBoundingClientRect();
        if (src.kind === 'task' && info.jsEvent.target.closest?.('.dot')) {
          const dot = info.el.querySelector('.dot');
          if (info.el.classList.contains('done-anim')) return; // already on its way
          if (src.done) {
            // A ticked task: the white circle empties again and the task comes back.
            info.el.classList.remove('is-done');
            dot.replaceChildren();
            restoreTask(src.id, src.title);
            return;
          }
          // The circle pops and fills white, a check draws in, a little burst and a click.
          celebrate(info.el, dot, src.color);
          const t = tasks.find((x) => x.id === src.id) || { id: src.id, label: src.title };
          completeTask(t, null, 900).then((ok) => {
            if (ok) return;
            info.el.classList.remove('is-done', 'done-anim');
            dot.replaceChildren();
          });
          return;
        }
        if (src.kind === 'task') openTask(tasks.find((t) => t.id === src.id) || { id: src.id, title: src.title, label: src.title, listName: src.calendarName }, anchor);
        else if (src.kind === 'goal') openGoalById(src.id, anchor);
        else openEditor({ src, start: toDate(src.start), end: toDate(src.end), allDay: src.allDay }, anchor);
      },
      eventDrop: onMove,
      eventResize: onMove,
      // Held at the right (or left) edge while dragging, the calendar turns to the next (or
      // previous) week, so an entry can be carried there and dropped.
      // While it is carried, the entry itself follows the pointer freely; where it will land
      // (snapped to the grid) shows as an outline, and it snaps there when dropped.
      eventDragStart: (info) => { hidePeek(); edgeNavStart(); floatStart(info); },
      eventDragStop: () => { edgeNavStop(); floatStop(); },
      datesSet: (info) => {
        if (!graph.on) $('#range').textContent = MOBILE ? shortTitle(info.view.currentStart, info.view.currentEnd, info.view.type) : info.view.title;
        for (const b of document.querySelectorAll('[data-view]')) b.classList.toggle('on', !graph.on && b.dataset.view === info.view.type);
        if (S.settings.view !== info.view.type) saveSettings({ view: info.view.type }, true);
        miniMonth = calendar.getDate();
        renderMini();
      },
    });
    calendar.render();
    swipeToChangeDates($('#calendar'));
  }

  // ---- dragging to the edge turns the page
  const EDGE_ZONE = 44;      // px from the edge (or anywhere past it) that count
  const EDGE_WAIT = 600;     // ms held there before the first turn
  const EDGE_REPEAT = 1100;  // ms between turns while it stays there
  const edgeNav = { dir: 0, timer: 0, marks: null };

  function edgeMarks() {
    if (edgeNav.marks) return edgeNav.marks;
    const mark = (dir) => h('div', { class: `edge-nav ${dir > 0 ? 'next' : 'prev'}` },
      h('span', { class: 'edge-arrow' }, dir > 0 ? '›' : '‹'), h('span', { class: 'edge-label' }, dir > 0 ? 'Next' : 'Back'));
    edgeNav.marks = { next: mark(1), prev: mark(-1) };
    $('#calendar').parentElement.append(edgeNav.marks.prev, edgeNav.marks.next);
    return edgeNav.marks;
  }

  function edgeMove(e) {
    const p = e.touches?.[0] || e;
    if (p.clientX == null) return;
    floatMove(p.clientX, p.clientY);
    const r = $('#calendar').getBoundingClientRect();
    // The left side counts only over the time column, so the first day stays a place to drop.
    const axis = Math.max(28, $('#calendar .fc-timegrid-axis')?.getBoundingClientRect().width || 0);
    setEdge(p.clientX >= r.right - EDGE_ZONE ? 1 : p.clientX <= r.left + axis ? -1 : 0);
  }

  function setEdge(dir) {
    if (dir === edgeNav.dir) return;
    edgeNav.dir = dir;
    clearTimeout(edgeNav.timer);
    const m = edgeMarks();
    m.next.classList.toggle('armed', dir > 0);
    m.prev.classList.toggle('armed', dir < 0);
    if (dir) edgeNav.timer = setTimeout(edgeTurn, EDGE_WAIT);
  }

  function edgeTurn() {
    const dir = edgeNav.dir;
    if (!dir) return;
    if (dir > 0) calendar.next(); else calendar.prev();
    const m = edgeMarks()[dir > 0 ? 'next' : 'prev'];
    m.classList.remove('turned');
    void m.offsetWidth; // restart the flash
    m.classList.add('turned');
    edgeNav.timer = setTimeout(edgeTurn, EDGE_REPEAT);
  }

  function edgeNavStart() {
    edgeMarks();
    document.body.classList.add('dragging-entry');
    for (const type of ['pointermove', 'mousemove', 'touchmove']) document.addEventListener(type, edgeMove, true);
  }

  function edgeNavStop() {
    document.body.classList.remove('dragging-entry');
    for (const type of ['pointermove', 'mousemove', 'touchmove']) document.removeEventListener(type, edgeMove, true);
    setEdge(0);
  }

  // ---- the carried entry: a copy that follows the pointer exactly
  const float = { box: null, dx: 0, dy: 0 };

  function floatStart(info) {
    floatStop();
    const el = info.el;
    const r = el.getBoundingClientRect();
    const p = info.jsEvent?.touches?.[0] || info.jsEvent || {};
    float.dx = (p.clientX ?? r.left + 12) - r.left;
    float.dy = (p.clientY ?? r.top + 8) - r.top;
    const copy = el.cloneNode(true);
    copy.classList.remove('fc-event-dragging', 'fc-event-selected');
    copy.style.width = `${r.width}px`;
    copy.style.height = `${r.height}px`;
    // Inside an element with the "fc" class, so it keeps the calendar's look.
    float.box = h('div', { class: 'fc drag-float' }, copy);
    float.box.style.transform = `translate(${r.left}px, ${r.top}px)`;
    document.body.append(float.box);
    document.body.classList.add('carrying');
  }

  function floatMove(x, y) {
    if (float.box) float.box.style.transform = `translate(${x - float.dx}px, ${y - float.dy}px)`;
  }

  function floatStop() {
    document.body.classList.remove('carrying');
    const box = float.box;
    float.box = null;
    if (!box) return;
    box.classList.add('dropping'); // it fades as the entry appears in its snapped place
    setTimeout(() => box.remove(), 160);
  }

  // Swiping left or right on the calendar goes to the next or previous days, the same as
  // the arrows. The calendar follows the finger, then slides over. A finger that rests
  // first is left to the calendar (a long press moves an entry or blocks out time), and
  // the screen's edges are left to Android's back gesture.
  function swipeToChangeDates(el) {
    const EDGE = 24, HOLD_MS = 250;
    let t = null; // { x, y, at, dx, horizontal }
    const harness = () => el.querySelector('.fc-view-harness');
    const slide = (x, ms) => {
      const v = harness();
      if (!v) return;
      v.style.transition = ms ? `transform ${ms}ms ease-out, opacity ${ms}ms ease-out` : 'none';
      v.style.transform = x ? `translateX(${x}px)` : '';
      v.style.opacity = x ? String(Math.max(0.35, 1 - Math.abs(x) / el.clientWidth)) : '';
    };
    const busy = () => el.querySelector('.fc-event-mirror, .fc-event-dragging, .fc-event-resizing');

    el.addEventListener('touchstart', (e) => {
      const p = e.touches[0];
      t = e.touches.length === 1 && p.clientX > EDGE && p.clientX < innerWidth - EDGE && !busy()
        ? { x: p.clientX, y: p.clientY, at: Date.now(), dx: 0, horizontal: null }
        : null;
    }, { passive: true });

    el.addEventListener('touchmove', (e) => {
      if (!t) return;
      if (e.touches.length > 1 || busy()) { t = null; slide(0, 150); return; }
      const p = e.touches[0];
      const dx = p.clientX - t.x, dy = p.clientY - t.y;
      if (t.horizontal === null) {
        if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return;
        // Up and down is scrolling; a move after resting is the calendar's own drag.
        t.horizontal = Math.abs(dx) > Math.abs(dy) * 1.3 && Date.now() - t.at < HOLD_MS;
        if (!t.horizontal) { t = null; return; }
        // FullCalendar would still start a time selection once the long press is up: telling it
        // the touch scrolled makes it stand down, as it does when the grid scrolls.
        window.dispatchEvent(new Event('scroll'));
      }
      e.preventDefault();
      t.dx = dx;
      slide(dx * 0.6, 0);
    }, { passive: false });

    const end = () => {
      if (!t?.horizontal) { t = null; return; }
      const { dx, at } = t;
      t = null;
      const far = Math.abs(dx) > el.clientWidth * 0.25 || (Math.abs(dx) > 50 && Date.now() - at < 300);
      if (!far || busy()) return slide(0, 150);
      const dir = dx < 0 ? 1 : -1;
      slide(-dir * el.clientWidth * 0.5, 120);
      setTimeout(() => {
        nav(dir);
        slide(dir * el.clientWidth * 0.3, 0);
        requestAnimationFrame(() => requestAnimationFrame(() => slide(0, 180)));
      }, 120);
    };
    el.addEventListener('touchend', end);
    el.addEventListener('touchcancel', () => { t = null; slide(0, 150); });
  }

  const pointRect = (ev) => {
    const x = ev ? ev.clientX : innerWidth / 2, y = ev ? ev.clientY : innerHeight / 2;
    return { left: x, right: x, top: y, bottom: y };
  };

  // ------------------------------------------------------------ popover

  // Web links written in an entry's notes: "https://…", "http://…" or "www.…".
  const LINK = /\bhttps?:\/\/[^\s<>"'`]+|\bwww\.[a-z0-9-]+(?:\.[a-z0-9-]+)+[^\s<>"'`]*/gi;
  function linksIn(text) {
    const found = (String(text || '').match(LINK) || [])
      .map((u) => u.replace(/[.,;:!?)\]}]+$/, ''))
      .map((u) => (/^www\./i.test(u) ? `https://${u}` : u));
    return [...new Set(found)].slice(0, 4);
  }
  const hostOf = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return u; } };

  /**
   * An "Open link" button for every link in the window's notes (notes boxes, a note's
   * text, read-only notes), kept up to date while typing.
   */
  function addLinkButtons(pop) {
    const bar = h('div', { class: 'note-links' });
    const refresh = () => {
      const text = [...pop.querySelectorAll('textarea, .note-text')].map((el) => (el.tagName === 'TEXTAREA' ? el.value : el.textContent)).join('\n');
      const urls = linksIn(text);
      bar.hidden = !urls.length;
      bar.replaceChildren(...urls.map((u) => h('button', { class: 'btn link-open', title: u, onclick: () => onyx.open(u) },
        icon('link'), urls.length > 1 ? `Open ${hostOf(u)}` : 'Open link')));
    };
    const actions = pop.querySelector('.pop-actions');
    if (actions) actions.before(bar); else pop.append(bar);
    pop.oninput = refresh; // a property, so one popover's listener replaces the last one's
    refresh();
  }

  function showPopover(anchor, nodes, onClose, { wide = false } = {}) {
    closePopover();
    const pop = $('#popover');
    pop.classList.toggle('wide', wide);
    pop.replaceChildren(...nodes.filter((n) => n && n.nodeType));
    addLinkButtons(pop);
    pop.hidden = false;
    closePopover = () => {
      closePopover = () => {};
      pop.hidden = true;
      pop.replaceChildren();
      calendar.unselect();
      if (onClose) onClose();
    };
    if (MOBILE) return; // on a phone it is a sheet along the bottom (styles.css)
    const margin = 10, width = pop.offsetWidth, height = pop.offsetHeight;
    let x = anchor.right + margin;
    if (x + width > innerWidth - margin) x = anchor.left - width - margin;
    if (x < margin) x = Math.min(Math.max(margin, anchor.left), innerWidth - width - margin);
    const y = Math.min(Math.max(58, anchor.top), Math.max(58, innerHeight - height - margin));
    pop.style.left = `${x}px`;
    pop.style.top = `${y}px`;
  }

  document.addEventListener('pointerdown', (e) => {
    if (!$('#popover').hidden && !$('#popover').contains(e.target)) closePopover();
  });

  // ------------------------------------------------------------ block editor

  function openEditor(model, anchor) {
    const src = model.src;
    const readOnly = !!src && !src.writable;
    const writable = S.calendars.filter((c) => c.kind === 'calendar' && c.writable);
    const lastDay = model.allDay ? addDays(model.end, -1) : model.end;
    const multiDay = !sameDay(model.start, model.allDay ? lastDay : new Date(model.end.getTime() - 1));
    let busy = false;

    const title = h('input', { type: 'text', class: 'pop-title', placeholder: 'What is this time for?', value: src ? src.title : '', disabled: readOnly, spellcheck: false });
    const date = h('input', { type: 'date', value: ymd(model.start), disabled: readOnly });
    const startTime = h('input', { type: 'time', value: hm(model.start), step: 300, disabled: readOnly });
    const endTime = h('input', { type: 'time', value: hm(model.end), step: 300, disabled: readOnly });
    const endDate = h('input', { type: 'date', value: ymd(lastDay), disabled: readOnly });
    const allDay = h('input', { type: 'checkbox', checked: model.allDay, disabled: readOnly });
    const calendarPick = h('select', { disabled: readOnly },
      (readOnly ? [S.calendars.find((c) => c.id === src.calendarId) || { id: src.calendarId, name: src.calendarName, accountLabel: '' }] : writable)
        .map((c) => h('option', { value: c.id }, c.account === 'local' || !c.accountLabel ? c.name : `${c.name}  ·  ${c.accountLabel}`)));
    calendarPick.value = src ? src.calendarId : (writable.some((c) => c.id === S.settings.defaultCalendar) ? S.settings.defaultCalendar : writable[0]?.id);
    // Notes are saved with the entry; on a read-only calendar yours are kept in Onyx instead.
    const notes = !readOnly && notesField(src ? src.notes : '');
    const memo = readOnly && notesField(src.memo, 'Your notes: kept in Onyx, since this calendar is read-only');
    const call = h('input', { type: 'checkbox', checked: !!src?.piCall });
    const callHint = h('small');
    // When the Pi phones: its usual lead time, or a half-hour picked here (kept as minutes before the start).
    let callBefore = src?.callBefore ?? null;
    const callWhen = h('select', { class: 'call-when', title: 'When the Pi phones you' });
    callWhen.addEventListener('change', () => { callBefore = callWhen.value === '' ? null : Number(callWhen.value); sync(); });
    const untilRow = h('div', { class: 'row' }, h('span', { class: 'ico' }), h('span', { class: 'dash' }, 'until'), endDate);
    const dash = h('span', { class: 'dash' }, '–');
    const tags = tagField(src ? src.tags : [...tagFilter].map((t) => tagInfo(t)?.name || t));

    const range = () => {
      if (allDay.checked) {
        const last = endDate.value && endDate.value >= date.value ? endDate.value : date.value;
        return { start: date.value, end: ymd(addDays(fromYmd(last), 1)), allDay: true, at: fromYmd(date.value) };
      }
      const s = at(date.value, startTime.value || '09:00');
      let e = at(multiDay && endDate.value >= date.value ? endDate.value : date.value, endTime.value || '10:00');
      if (e <= s) e = addDays(e, 1); // an end before the start means it runs past midnight
      return { start: s.toISOString(), end: e.toISOString(), allDay: false, at: s };
    };

    // Pomodoro: split the block into work and rest chunks (a timed block only).
    const blockMinutes = () => { const r = range(); return r.allDay ? 0 : Math.round((new Date(r.end) - new Date(r.start)) / 60000); };
    const pomo = pomodoroField(src?.pomodoro, { duration: blockMinutes });
    const pomoRow = h('div', { class: 'row top' }, icon('clock'), pomo.el);

    const sync = () => {
      const r = range();
      for (const el of [startTime, endTime, dash]) el.hidden = r.allDay;
      untilRow.hidden = !r.allDay && !multiDay;
      pomoRow.hidden = r.allDay;
      pomo.sync();
      const st = piStatus(r.at, r.allDay, callBefore);
      callHint.textContent = st.text;
      callHint.className = st.tone;
      call.disabled = !st.allowed && !call.checked;
      callWhen.hidden = !call.checked || !st.allowed;
      if (!callWhen.hidden) {
        const day = (d) => (sameDay(d, r.at) ? '' : `, ${sameDay(d, addDays(r.at, -1)) ? 'day before' : fmtDay(d)}`);
        const usual = piCallTime(r.at);
        const options = callSlots(r.at).map((s) => ({ before: Math.round((r.at - s) / 60000), at: s }));
        if (callBefore != null && !options.some((o) => o.before === callBefore)) options.push({ before: callBefore, at: piCallTime(r.at, callBefore).at });
        callWhen.replaceChildren(
          h('option', { value: '' }, `Usual time: ${fmtTime(usual.at)}${day(usual.at)}`),
          ...options.sort((a, b) => a.at - b.at).map((o) => h('option', { value: o.before, selected: o.before === callBefore },
            `Call at ${fmtTime(o.at)}${day(o.at)}${piCallTime(r.at, o.before).quiet ? ' · quiet hours' : ''}`)));
        callWhen.value = callBefore == null ? '' : String(callBefore);
      }
    };
    for (const el of [date, startTime, endTime, endDate, allDay]) el.addEventListener('input', sync);
    call.addEventListener('change', sync);

    const save = async () => {
      if (busy) return;
      busy = true;
      const r = range();
      const data = {
        title: title.value.trim(), start: r.start, end: r.end, allDay: r.allDay, calendarId: calendarPick.value,
        ...(notes ? { notes: cleanNote(notes.value) } : {}), piCall: call.checked && !r.allDay, tags: tags.get(),
      };
      const callChanged = data.piCall && callBefore !== (src?.callBefore ?? null);
      if (callChanged) data.callBefore = callBefore;
      try {
        let saved = null;
        if (!src) {
          saved = await onyx.createEvent(data);
          if (S.settings.defaultCalendar !== data.calendarId) saveSettings({ defaultCalendar: data.calendarId }, true);
        } else if (readOnly) {
          // A read-only calendar can still carry tags and a phone reminder: both live in Onyx.
          if (data.piCall !== !!src.piCall || callChanged) await onyx.setCall({ id: src.id, title: src.title, start: src.start, allDay: src.allDay }, data.piCall, data.piCall ? callBefore : null);
          if (!sameTags(data.tags, src.tags)) await onyx.setTags(src.id, data.tags);
          if (cleanNote(memo.value) !== (src.memo || '')) await onyx.setMemo(src.id, memo.value);
        } else {
          saved = await onyx.updateEvent(src.id, data);
        }
        if (saved?.warning) toast(saved.warning, 'warn');
        // The split is kept in Onyx, by the entry's id (a new id when it moved calendar).
        const split = r.allDay ? null : pomo.get();
        const id = saved?.id || src?.id;
        if (id && !samePomodoro(split, saved?.pomodoro ?? src?.pomodoro)) await savePomodoro(id, split);
        closePopover();
        refetch();
        refreshPomodoros();
        if (!sameTags(data.tags, src?.tags)) reloadTags();
      } catch (err) {
        busy = false;
        toast(err.message, 'error');
      }
    };

    const remove = async () => {
      try {
        await onyx.deleteEvent(src.id);
        closePopover();
        refetch();
      } catch (err) {
        toast(err.message, 'error');
      }
    };

    const nodes = [
      title,
      src && originRow(src),
      h('div', { class: 'row' }, icon('clock'), date, startTime, dash, endTime),
      untilRow,
      h('div', { class: 'row' }, icon('calendar'), calendarPick, h('label', { class: 'check' }, allDay, 'All day')),
      notes && h('div', { class: 'row top' }, icon('note'), notes),
      readOnly && src.notes && h('div', { class: 'row top pop-meta' }, icon('note'), h('div', { class: 'note-text' }, src.notes)),
      memo && h('div', { class: 'row top' }, icon('note'), memo),
      h('div', { class: 'row' }, icon('tag'), tags.el),
      pomoRow,
      src?.location && h('div', { class: 'row pop-meta' }, icon('pin'), src.location),
      S.settings.pi.enabled && h('div', { class: 'row pi-row' }, icon('phone'),
        h('div', { class: 'txt' }, h('b', null, 'Phone reminder'), callHint, callWhen),
        h('label', { class: 'switch' }, call, h('span'))),
      readOnly && h('div', { class: 'pop-meta' }, 'This calendar is read-only here. ',
        src.link && h('a', { href: '#', onclick: (e) => { e.preventDefault(); onyx.open(src.link); } }, 'Open it in the browser')),
      h('div', { class: 'pop-actions' },
        src && !readOnly && h('button', { class: 'btn danger', onclick: remove }, icon('trash'), 'Delete'),
        h('div', { class: 'grow' }),
        h('button', { class: 'btn ghost', onclick: () => closePopover() }, 'Cancel'),
        h('button', { class: 'btn primary', onclick: save }, src ? 'Save' : 'Add block')),
    ];
    showPopover(anchor, nodes);
    sync();
    title.addEventListener('keydown', (e) => { if (e.key === 'Enter') save(); });
    for (const box of [notes, memo]) if (box) box.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) save(); });
    if (!readOnly && !MOBILE) title.focus();
  }

  // ------------------------------------------------------------ tasks

  const REPEAT = {
    daily: 'Every day', weekdays: 'Every weekday', weekly: 'Every week', biweekly: 'Every 2 weeks', monthly: 'Every month', yearly: 'Every year',
  };
  const ordinal = (n) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] || 'th')}`;
  const REPEAT_SHORT = { daily: 'daily', weekdays: 'weekdays', weekly: 'weekly', biweekly: '2 weeks', monthly: 'monthly', yearly: 'yearly' };

  /** "Every day at 6:00 PM" for a repeating series (series.js). */
  const seriesText = (s) => `${s.rule ? REPEAT[s.rule] : s.everyDays ? `Every ${s.everyDays} days` : 'Repeats'}${s.time ? ` at ${fmtTime(at('2000-01-01', s.time))}` : ''}`;
  const repeatBadge = (t) => (t.series ? (REPEAT_SHORT[t.series.rule] || 'repeated') : t.repeat ? REPEAT_SHORT[t.repeat] : null);

  async function loadTasks(force) {
    try {
      const res = await onyx.tasks(force);
      tasks = res.tasks;
      showProblems(res.errors);
    } catch (err) {
      toast(err.message, 'error');
    }
    renderTasks();
    loadGoals();
  }

  async function loadGoals() {
    try {
      goals = await onyx.goals();
    } catch (err) {
      if (!outdated(err)) toast(err.message, 'error');
    }
    renderGoals();
  }

  function callBadge(t) {
    if (!t.call || t.call.past) return null;
    const when = new Date(t.call.at);
    return t.call.quiet
      ? h('span', { class: 'call off', title: `No call: ${fmtTime(when)} is inside quiet hours (${quietLabel()})` }, icon('phone'), 'quiet hours')
      : h('span', { class: 'call', title: 'The Raspberry Pi will phone you' }, icon('phone'), fmtTime(when));
  }

  function taskRow(t) {
    const when = t.start ? `${fmtDay(new Date(t.start))}, ${fmtTime(new Date(t.start))}` : t.date ? fmtDay(fromYmd(t.date)) : '';
    // Draggable onto a cluster on the globe (see dropOnGlobe).
    const row = h('div', {
      class: 'task', css: { '--c': t.color }, draggable: !MOBILE,
      ondragstart: (e) => taskDragStart(t, e), ondragend: taskDragEnd,
    },
      h('button', { class: 'tick', title: 'Mark done (moves it to Archived)', onclick: () => completeTask(t, row) }, icon('check')),
      h('div', { class: 'task-body', onclick: (e) => openTask(t, e.currentTarget.getBoundingClientRect()) },
        h('div', { class: 'task-name' }, t.label),
        h('div', { class: 'task-meta' }, when && h('span', null, when), callBadge(t),
          repeatBadge(t) && h('span', {
            class: 'rep',
            title: t.series && !t.series.managed ? `${seriesText(t.series)}, set in Google Tasks (${t.series.count} open copies)` : `${REPEAT[t.repeat]}: Onyx adds the next one when this is done`,
          }, icon('repeat'), repeatBadge(t)),
          t.goal && h('span', { class: 'goal-chip', css: { '--g': t.goal.color }, title: `A step toward: ${t.goal.title}` }, icon('flag'), t.goal.title),
          h('span', null, t.listName),
          (t.tags || []).map((tag) => h('span', { class: 'mini-tag', css: { '--t': tagColor(tag) } }, `#${tag}`)),
          dateBubble(t), carryChips(t)),
        notePreview(notesOf(t))));
    return row;
  }

  /** Moves a task to another day, keeping its time of day. */
  function moveToDay(t, day) {
    return onyx.moveTask(t.id, t.time ? { start: at(day, t.time).toISOString() } : { date: day });
  }

  const dayWord = (days) => (days === 0 ? 'today' : days === 1 ? 'tomorrow' : fmtDay(addDays(new Date(), days)));

  /** One tap to carry a task from an earlier day to today or tomorrow (the date chip picks any other day). */
  function carryChips(t) {
    if (!t.date || t.date >= ymd(new Date()) || t.mirror || !t.provider) return null;
    const go = (days) => async (e) => {
      e.stopPropagation();
      try {
        await moveToDay(t, ymd(addDays(new Date(), days)));
        toast(`"${t.label}" moved to ${dayWord(days)}`);
        await loadTasks(true);
        refetch(true);
      } catch (err) {
        toast(err.message, 'error');
      }
    };
    return [
      h('button', { class: 'carry-chip', title: 'Move it to today', onclick: go(0) }, 'Today'),
      h('button', { class: 'carry-chip', title: 'Move it to tomorrow', onclick: go(1) }, 'Tomorrow'),
    ];
  }

  /** Carries every task from earlier days to today or tomorrow in one go. */
  async function carryOver(list, days) {
    const day = ymd(addDays(new Date(), days));
    // Copies of a repeat set up in Google Tasks are left alone: the next copy is already coming.
    const movable = list.filter((t) => !t.mirror && t.provider && !(t.series && !t.series.managed));
    const skipped = list.length - movable.length;
    let moved = 0;
    const failed = [];
    for (const t of movable) {
      try { await moveToDay(t, day); moved++; } catch (err) { failed.push(err.message); }
    }
    const note = skipped ? ` (${skipped} repeating ${skipped === 1 ? 'copy' : 'copies'} left as they are)` : '';
    if (!movable.length) {
      toast('These are copies of a task that repeats in Google Tasks, so the next one comes by itself. Open one and use "Clear missed" to let the old ones go.');
      return;
    }
    if (failed.length) toast(`Moved ${moved}, but ${failed.length} could not be moved: ${failed[0]}`, 'warn');
    else toast(`${moved} ${moved === 1 ? 'task' : 'tasks'} moved to ${dayWord(days)}. A fresh start.${note}`);
    await loadTasks(true);
    refetch(true);
  }

  /**
   * The small date chip at the end of a task's line: tap it, pick a day, and the task
   * moves there (as dragging it in the calendar does; a time it has stays the same).
   */
  function dateBubble(t) {
    if (t.mirror || !t.provider) return null;
    const today = ymd(new Date());
    const label = !t.date ? 'Date' : t.date === today ? 'Today' : t.date === ymd(addDays(new Date(), 1)) ? 'Tomorrow'
      : fromYmd(t.date).toLocaleDateString([], { month: 'short', day: 'numeric' });
    const input = h('input', { type: 'date', value: t.date || '', tabindex: -1, 'aria-hidden': 'true' });
    input.addEventListener('click', (e) => e.stopPropagation());
    input.addEventListener('change', async () => {
      const day = input.value;
      if (day === (t.date || '')) return;
      try {
        if (day) await onyx.moveTask(t.id, t.time ? { start: at(day, t.time).toISOString() } : { date: day });
        else if (t.dateInName) throw new Error('This task has its date written in its name. Pick another day instead.');
        else await onyx.updateTask(t.id, { due: null });
        toast(day ? `"${t.label}" moved to ${fmtDay(fromYmd(day))}` : `"${t.label}" has no date now`);
        await loadTasks(true);
        refetch(true);
      } catch (err) {
        input.value = t.date || '';
        toast(err.message, 'error');
      }
    });
    const open = (e) => {
      e.stopPropagation();
      try { input.showPicker(); } catch { input.focus(); input.click(); }
    };
    return h('button', {
      class: `date-bubble${t.date && t.date < today ? ' earlier' : ''}${t.date ? '' : ' none'}`,
      title: t.date ? `Due ${fmtDay(fromYmd(t.date))}. Click to pick another day` : 'Pick a day for it',
      onclick: open,
    }, icon('calendar'), label, input);
  }

  // A task marked done is archived: it stays in Google Tasks / To Do as completed, the
  // Archived tab reads it back by the day it was done, and Undo marks it not done again.
  const undoStack = []; // tasks archived this session, newest last
  function syncUndo() {
    const last = undoStack.at(-1);
    $('#undo-btn').disabled = !last;
    $('#undo-btn').title = last ? `Undo: bring back "${last.label}" (Ctrl+Z)` : 'Nothing to undo';
  }

  // ---- ticking off: a pop, a check, a small burst and a soft click

  const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

  function checkMark() {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 12 12');
    svg.setAttribute('class', 'check');
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    line.setAttribute('d', 'M2.6 6.3 5 8.6 9.5 3.6');
    svg.append(line);
    return svg;
  }

  /** The chime: a soft click, then a bright rising four-note arpeggio that rings out. */
  function doneSound() {
    try {
      const ctx = chime.ctx || (chime.ctx = new AudioContext());
      ctx.resume?.();
      const t0 = ctx.currentTime;
      const noise = ctx.createBuffer(1, Math.round(ctx.sampleRate * 0.03), ctx.sampleRate);
      const data = noise.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length) ** 3;
      const tick = ctx.createBufferSource();
      tick.buffer = noise;
      const band = ctx.createBiquadFilter();
      band.type = 'bandpass';
      band.frequency.value = 2600;
      const tg = ctx.createGain();
      tg.gain.value = 0.5;
      tick.connect(band).connect(tg).connect(ctx.destination);
      tick.start(t0);
      const tone = (type, f0, f1, at, len, vol) => {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = type;
        o.frequency.setValueAtTime(f0, t0 + at);
        o.frequency.exponentialRampToValueAtTime(f1, t0 + at + len * 0.4);
        g.gain.setValueAtTime(0.0001, t0 + at);
        g.gain.exponentialRampToValueAtTime(vol, t0 + at + 0.008);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + at + len);
        o.connect(g).connect(ctx.destination);
        o.start(t0 + at);
        o.stop(t0 + at + len + 0.02);
      };
      tone('triangle', 620, 1240, 0.005, 0.1, 0.12); // the click
      [1046.5, 1318.5, 1568, 2093].forEach((f, i) => {   // C, E, G, C: the chime
        tone('sine', f, f, 0.05 + i * 0.075, 0.9 - i * 0.12, 0.11 - i * 0.015);
        tone('triangle', f * 2, f * 2, 0.05 + i * 0.075, 0.25, 0.02);
      });
    } catch { /* no sound: the circle still fills */ }
    try { navigator.vibrate?.(14); } catch { /* no buzz on this device */ }
  }

  /** A ring and sparks from a point on the screen, in the entry's colour. */
  function burstAt(el, color) {
    if (reducedMotion()) return;
    const r = el.getBoundingClientRect();
    const burst = h('div', { class: 'done-burst', css: { left: `${r.left + r.width / 2}px`, top: `${r.top + r.height / 2}px`, '--c': color || 'var(--accent)' } },
      h('span', { class: 'ring' }),
      ...Array.from({ length: 8 }, (_, i) => h('i', { css: { '--a': `${i * 45 + 22}deg`, '--d': `${16 + (i % 2) * 7}px` } })));
    document.body.append(burst);
    setTimeout(() => burst.remove(), 800);
  }

  function celebrate(entry, dot, color) {
    entry.classList.add('is-done', 'done-anim');
    dot.replaceChildren(checkMark());
    burstAt(dot, color);
    doneSound();
  }

  /** Marks a task done. `hold`: keep it in view this long first, so its animation can play. Returns true when done. */
  async function completeTask(t, row, hold = 0) {
    const t0 = Date.now();
    row?.classList.add('done');
    if (row) { doneSound(); burstAt(row.querySelector('.tick') || row, t.color); }
    try {
      const res = await onyx.updateTask(t.id, { done: true });
      const wait = hold - (Date.now() - t0);
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      undoStack.push({ id: t.id, label: t.label });
      if (undoStack.length > 30) undoStack.shift();
      syncUndo();
      const next = res?.next?.date ? `. Next one: ${fmtDay(fromYmd(res.next.date))}` : '';
      toast(`Done: "${t.label}"${next}`, '', { label: 'Undo', run: () => restoreTask(t.id, t.label) });
      await loadTasks();
      refetch();
      return true;
    } catch (err) {
      row?.classList.remove('done');
      toast(err.message, 'error');
      return false;
    }
  }

  async function restoreTask(id, label) {
    try {
      await onyx.updateTask(id, { done: false });
      const i = undoStack.findIndex((u) => u.id === id);
      if (i >= 0) undoStack.splice(i, 1);
      syncUndo();
      toast(`Restored "${label}"`);
      await loadTasks();
      if (taskTab === 'archived') loadArchive();
      refetch();
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  const undoLast = () => { const last = undoStack.at(-1); if (last) restoreTask(last.id, last.label); };

  // ------------------------------------------------------------ archived tasks

  let taskTab = 'open';
  let archive = { day: '', tasks: [] };
  let archiveSeq = 0;

  function setTaskTab(tab) {
    taskTab = tab;
    for (const b of $('#task-tabs').children) b.classList.toggle('on', b.dataset.tab === tab);
    $('#task-add').hidden = tab !== 'open';
    $('#archive-bar').hidden = tab !== 'archived';
    if (tab === 'archived') {
      if (!$('#archive-date').value) $('#archive-date').value = ymd(new Date());
      loadArchive();
    } else {
      renderTasks();
    }
  }

  async function loadArchive() {
    const day = $('#archive-date').value || ymd(new Date());
    const mine = ++archiveSeq;
    if (archive.day !== day) {
      archive = { day, tasks: [] };
      $('#task-count').textContent = '';
      $('#task-items').replaceChildren(h('div', { class: 'empty' }, 'Loading…'));
    }
    try {
      const res = await onyx.archivedTasks(day, day);
      if (mine !== archiveSeq) return;
      archive = { day, tasks: res.tasks };
      showProblems(res.errors);
    } catch (err) {
      if (mine !== archiveSeq) return;
      toast(err.message, 'error');
    }
    if (taskTab === 'archived') renderArchive();
  }

  function shiftArchive(days) {
    const cur = $('#archive-date').value || ymd(new Date());
    $('#archive-date').value = ymd(addDays(fromYmd(cur), days));
    loadArchive();
  }

  function archivedRow(t) {
    const due = t.start ? `${fmtDay(new Date(t.start))}, ${fmtTime(new Date(t.start))}` : t.date ? fmtDay(fromYmd(t.date)) : '';
    const forget = async () => {
      if (!confirm(`Delete "${t.label}" for good? It is removed from ${PROVIDER[t.provider] || 'its'} tasks too, and cannot be brought back.`)) return;
      try {
        await onyx.deleteTask(t.id);
        toast(`Deleted "${t.label}"`);
        loadArchive();
      } catch (err) {
        toast(err.message, 'error');
      }
    };
    return h('div', { class: 'task archived', css: { '--c': t.color } },
      h('button', { class: 'tick', title: 'Restore: mark it not done', onclick: () => restoreTask(t.id, t.label) }, icon('check')),
      h('div', { class: 'task-body', title: 'Click the tick to restore it' },
        h('div', { class: 'task-name' }, t.label),
        h('div', { class: 'task-meta' },
          t.completed && h('span', null, `Done ${fmtTime(new Date(t.completed))}`),
          due && h('span', null, `was due ${due}`), h('span', null, t.listName),
          (t.tags || []).map((tag) => h('span', { class: 'mini-tag', css: { '--t': tagColor(tag) } }, `#${tag}`))),
        notePreview(notesOf(t))),
      h('button', { class: 'row-del', title: 'Delete forever', onclick: forget }, icon('trash')));
  }

  function renderArchive() {
    const box = $('#task-items');
    const shown = archive.tasks.filter((t) => !t.mirror && visible(t.listId) && matchesFilter(t.tags));
    $('#task-count').textContent = shown.length || '';
    const day = archive.day;
    const label = day === ymd(new Date()) ? 'today' : day === ymd(addDays(new Date(), -1)) ? 'yesterday' : `on ${fmtDay(fromYmd(day))}`;
    if (!shown.length) {
      box.replaceChildren(h('div', { class: 'empty' }, tagFilter.size
        ? `No tasks with the selected tags were completed ${label}.`
        : `Nothing was completed ${label}. Tasks you tick off land here, sorted by the day you did them.`));
      return;
    }
    box.replaceChildren(h('div', { class: 'task-section static' }, `Completed ${label}`), ...shown.map(archivedRow));
  }

  for (const b of $('#task-tabs').children) b.addEventListener('click', () => setTaskTab(b.dataset.tab));
  $('#archive-date').addEventListener('change', () => loadArchive());
  $('#archive-prev').addEventListener('click', () => shiftArchive(-1));
  $('#archive-next').addEventListener('click', () => shiftArchive(1));
  $('#archive-today').addEventListener('click', () => { $('#archive-date').value = ymd(new Date()); loadArchive(); });

  function renderTasks() {
    const lists = S.calendars.filter((c) => c.kind === 'tasklist');
    const pick = $('#task-list');
    const chosen = pick.value;
    pick.replaceChildren(...lists.map((c) => h('option', { value: c.id }, c.name)));
    if (lists.some((c) => c.id === chosen)) pick.value = chosen;
    pick.hidden = lists.length < 2;
    for (const el of $('#task-add').querySelectorAll('input, button, select')) el.disabled = !lists.length;
    $('#task-tabs').hidden = !lists.length;
    if (taskTab === 'archived' && lists.length) return renderArchive();

    const box = $('#task-items');
    const shown = tasks.filter((t) => !t.mirror && !t.done && visible(t.listId) && matchesFilter(t.tags));
    $('#task-count').textContent = shown.length || '';
    if (!lists.length) {
      box.replaceChildren(h('div', { class: 'empty' }, 'Connect Google or Outlook to see your tasks here.',
        h('div', { css: { 'margin-top': '12px' } }, h('button', { class: 'btn', onclick: () => openSettings('calendars') }, 'Connect an account'))));
      return;
    }
    if (!shown.length) {
      box.replaceChildren(h('div', { class: 'empty' }, tagFilter.size
        ? 'No open tasks with the selected tags.'
        : 'Nothing to do. Add a task above; put a time in its name and the Pi will phone you about it.'));
      return;
    }
    const today = ymd(new Date());
    const sortKey = (t) => t.start || (t.date ? `${t.date}T99` : '9999');
    // Tasks from earlier days are not "overdue": they are carried on, one at a time or all at once.
    const earlier = shown.filter((t) => t.date && t.date < today);
    const groups = [
      ['From earlier', earlier, 'earlier'],
      ['Today', shown.filter((t) => t.date === today)],
      ['Upcoming', shown.filter((t) => t.date && t.date > today)],
      ['No date', shown.filter((t) => !t.date)],
    ];
    // Each group folds away under its header (remembered on this device); its tasks are cards.
    const shut = shutTaskGroups();
    const group = ([name, items, cls]) => {
      const key = cls || name.toLowerCase().replace(/\s+/g, '-');
      const closed = shut.has(key);
      const toggle = () => {
        if (closed) shut.delete(key); else shut.add(key);
        try { localStorage.setItem('onyx.task-groups-shut', JSON.stringify([...shut])); } catch { /* this visit only */ }
        renderTasks();
      };
      const head = h('div', {
        class: `task-section${cls ? ` ${cls}` : ''}${closed ? ' shut' : ''}`, role: 'button', tabindex: '0', 'aria-expanded': String(!closed),
        title: cls === 'earlier' ? 'Plans change. Carry these to a new day whenever you are ready.' : closed ? `Show ${name.toLowerCase()}` : `Fold ${name.toLowerCase()} away`,
        onclick: (e) => { if (!e.target.closest('.carry')) toggle(); },
        onkeydown: (e) => { if ((e.key === 'Enter' || e.key === ' ') && !e.target.closest('.carry')) { e.preventDefault(); toggle(); } },
      },
        h('span', null, name), h('span', { class: 'sec-count' }, items.length), h('span', { class: 'grow' }),
        cls === 'earlier' && h('span', { class: 'carry-set' },
          h('button', { class: 'carry', title: 'Move all of these to today', onclick: () => carryOver(earlier, 0) }, '→ Today'),
          h('button', { class: 'carry', title: 'Move all of these to tomorrow', onclick: () => carryOver(earlier, 1) }, '→ Tomorrow')));
      return h('section', { class: 'task-group' }, head,
        !closed && h('div', { class: 'task-cards' }, items.sort((a, b) => sortKey(a).localeCompare(sortKey(b))).map(taskRow)));
    };
    box.replaceChildren(...groups.filter(([, items]) => items.length).map(group));
  }

  /** Which task groups are folded away (From earlier, Today, Upcoming, No date). */
  function shutTaskGroups() {
    try { return new Set(JSON.parse(localStorage.getItem('onyx.task-groups-shut') || '[]')); } catch { return new Set(); }
  }

  function openTask(t, anchor) {
    const name = h('input', { type: 'text', class: 'pop-title', value: t.title, spellcheck: false });
    const tags = tagField(t.tags);
    const st = t.call && !t.call.past
      ? (t.call.quiet ? { text: `No call: ${fmtTime(new Date(t.call.at))} is inside quiet hours.`, tone: 'warn' } : { text: `The Pi phones you at ${fmtTime(new Date(t.call.at))}.`, tone: 'ok' })
      : { text: t.time ? 'No call for this one.' : 'Put a time in the name (like 3pm or 1500) and the Pi will phone you.', tone: '' };
    const run = async (fn) => {
      try {
        await fn();
        closePopover();
        await loadTasks();
        refetch();
      } catch (err) {
        toast(err.message, 'error');
      }
    };
    // The due date: changing it here does what dragging the task in the calendar does.
    const date = !t.mirror && h('input', { type: 'date', value: t.date || '', title: 'Due date' });
    // Notes are the task's own notes in Google Tasks / To Do, so they show there too.
    const notes = notesField(t.notes);
    // Repeating: Onyx adds the next one (with the next date) when this one is done.
    const weekday = t.date ? fromYmd(t.date).toLocaleDateString([], { weekday: 'long' }) : '';
    const dayNum = t.date ? fromYmd(t.date).getDate() : '';
    const repeatLabel = (rule) => ({
      weekly: weekday ? `Every week on ${weekday}` : REPEAT.weekly,
      biweekly: weekday ? `Every 2 weeks on ${weekday}` : REPEAT.biweekly,
      monthly: dayNum ? `Every month on the ${ordinal(dayNum)}` : REPEAT.monthly,
    }[rule] || REPEAT[rule]);
    // A task that repeats in Google Tasks is edited as a series (openSeries), not given a second repeat here.
    const repeatPick = !t.mirror && t.provider && !(t.series && !t.series.managed) && h('select', { title: 'Repeat' },
      h('option', { value: '' }, 'Does not repeat'),
      Object.keys(REPEAT).map((rule) => h('option', { value: rule }, repeatLabel(rule))));
    if (repeatPick) repeatPick.value = t.repeat || '';
    // Pomodoro: a start time and a length (Google Tasks have neither), split into chunks.
    const pomoTime = h('input', { type: 'time', value: t.time || '', step: 300, title: 'When it starts (written into the name, which the Pi reads)' });
    const pomo = !t.mirror && t.provider && pomodoroField(t.pomodoro, { length: true, extra: [h('span', null, 'At'), pomoTime] });
    const save = () => run(async () => {
      const patch = {};
      if (name.value.trim() && name.value.trim() !== t.title) patch.title = name.value.trim();
      if (cleanNote(notes.value) !== cleanNote(t.notes)) patch.notes = cleanNote(notes.value);
      const picked = tags.get();
      if (!sameTags(picked, t.tags)) patch.tags = picked;
      if (Object.keys(patch).length) await onyx.updateTask(t.id, patch);
      if (patch.tags) reloadTags();
      if (date && date.value && date.value !== (t.date || '')) {
        await onyx.moveTask(t.id, t.time ? { start: at(date.value, t.time).toISOString() } : { date: date.value });
      } else if (date && !date.value && t.date && !t.dateInName) {
        await onyx.updateTask(t.id, { due: null });
      }
      if (repeatPick && repeatPick.value !== (t.repeat || '')) {
        await onyx.repeatTask(t.id, repeatPick.value || null);
        toast(repeatPick.value ? `${repeatLabel(repeatPick.value)}. When it is done, the next one is added.` : 'No longer repeats');
      }
      if (pomo) {
        const split = pomo.get();
        if (split) {
          const time = pomoTime.value || t.time;
          if (!time) throw new Error('Give it a start time, so the timer knows when to begin.');
          if (time !== t.time) {
            const day = (date && date.value) || t.date || ymd(new Date());
            await onyx.moveTask(t.id, { start: at(day, time).toISOString() });
          }
        }
        if (!samePomodoro(split, t.pomodoro)) await savePomodoro(t.id, split);
        refreshPomodoros();
      }
    });
    showPopover(anchor, [
      name,
      originRow(t),
      h('div', { class: 'pop-meta' }, [t.listName, t.start ? `${fmtDay(new Date(t.start))}, ${fmtTime(new Date(t.start))}` : t.date ? fmtDay(fromYmd(t.date)) : 'No date'].filter(Boolean).join('  ·  ')),
      t.goal && h('button', { class: 'row goal-link', css: { '--g': t.goal.color }, title: 'Open the goal', onclick: (e) => openGoalById(t.goal.id, e.currentTarget.getBoundingClientRect()) },
        icon('flag'), h('span', null, 'A step toward ', h('b', null, t.goal.title))),
      date && h('div', { class: 'row' }, icon('calendar'), date),
      repeatPick && h('div', { class: 'row' }, icon('repeat'), repeatPick),
      pomo && h('div', { class: 'row top' }, icon('clock'), pomo.el),
      t.series && !t.series.managed && h('button', { class: 'row goal-link series-link', css: { '--g': '#a9b4ff' }, title: 'Edit every copy of this repeating task', onclick: (e) => openSeries(t.series, e.currentTarget.getBoundingClientRect()) },
        icon('repeat'), h('span', null, h('b', null, seriesText(t.series)), ` · set in Google Tasks · ${t.series.count} open copies. Edit all`)),
      h('div', { class: 'row top' }, icon('note'), notes),
      h('div', { class: 'row' }, icon('tag'), tags.el),
      S.settings.pi.enabled && t.provider === 'google' && h('div', { class: 'row pi-row' }, icon('phone'),
        h('div', { class: 'txt' }, h('b', null, 'Phone reminder'), h('small', { class: st.tone }, st.text))),
      h('div', { class: 'pop-actions' },
        h('button', { class: 'btn complete', title: 'Mark it done: it moves to the Archived tab (Undo brings it back)', onclick: () => { closePopover(); completeTask(t); } }, icon('check'), 'Complete'),
        h('div', { class: 'grow' }),
        h('button', { class: 'btn primary', onclick: save }, 'Save')),
    ]);
    name.addEventListener('keydown', (e) => { if (e.key === 'Enter') save(); });
    notes.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) save(); });
  }

  /**
   * A repeating task as one thing: its name, time and notes go to every open copy in
   * Google Tasks. How often it repeats can be changed here only for repeats Onyx keeps;
   * Google's API has no way to change the repeat of a task set up in Google Tasks.
   */
  function openSeries(s, anchor) {
    const copies = tasks.filter((t) => t.series?.key === s.key);
    const first = copies[0] || {};
    const name = h('input', { type: 'text', class: 'pop-title', value: s.label, spellcheck: false });
    const time = h('input', { type: 'time', value: s.time || '', step: 300, title: 'Time (the Pi phones about it)' });
    const notes = notesField(first.notes);
    const rule = h('select', { disabled: !s.managed, title: s.managed ? 'How often' : 'Set in Google Tasks' },
      s.managed && h('option', { value: '' }, 'Does not repeat'),
      !s.rule && !s.managed && h('option', { value: '' }, s.everyDays ? `Every ${s.everyDays} days` : 'Repeats (how often is unclear)'),
      Object.keys(REPEAT).map((r) => h('option', { value: r }, REPEAT[r])));
    rule.value = s.rule || '';
    const today = ymd(new Date());
    const save = async () => {
      const data = { label: name.value.trim(), time: time.value || '' };
      if (cleanNote(notes.value) !== cleanNote(first.notes)) data.notes = cleanNote(notes.value);
      if (s.managed && (rule.value || null) !== s.rule) data.rule = rule.value || null;
      try {
        const res = await onyx.updateSeries(s.key, data);
        if (res.warnings?.length) toast(`Saved, but: ${res.warnings.join('  ·  ')}`, 'warn');
        else toast(res.changed ? `Updated ${res.changed} ${res.changed === 1 ? 'copy' : 'copies'} in Google Tasks` : 'Saved');
        closePopover();
        await loadTasks();
        refetch();
      } catch (err) {
        toast(err.message, 'error');
      }
    };
    const clear = async () => {
      try {
        const res = await onyx.clearSeries(s.key);
        toast(`Cleared ${res.done} missed ${res.done === 1 ? 'copy' : 'copies'}`);
        closePopover();
        await loadTasks();
        refetch();
      } catch (err) {
        toast(err.message, 'error');
      }
    };
    showPopover(anchor, [
      name,
      originRow(first),
      h('div', { class: 'pop-meta' }, `${seriesText(s)}  ·  ${first.listName || ''}  ·  ${s.count} open ${s.count === 1 ? 'copy' : 'copies'}`),
      h('div', { class: 'row' }, icon('repeat'), rule, h('span', { class: 'dash' }, 'at'), time),
      h('p', { class: 'pop-meta' }, s.managed
        ? 'Onyx keeps this repeat: when it is done, the next one is added to Google Tasks.'
        : 'This repeats in Google Tasks, which does not let other apps change how often, so change that in the Google Tasks app. The name, time and notes here go to every open copy.'),
      h('div', { class: 'row top' }, icon('note'), notes),
      copies.length > 1 && h('div', { class: 'series-copies' }, copies.map((t) => h('span', { class: t.date && t.date < today ? 'late' : '' },
        t.date ? fmtDay(fromYmd(t.date)) : 'No date'))),
      h('div', { class: 'pop-actions' },
        s.overdue > 0 && !s.managed && h('button', { class: 'btn', title: 'Missed days pile up in Google Tasks; this ticks them off (the newest stays)', onclick: clear },
          icon('check'), `Clear ${s.overdue} missed`),
        h('div', { class: 'grow' }),
        h('button', { class: 'btn ghost', onclick: () => closePopover() }, 'Cancel'),
        h('button', { class: 'btn primary', onclick: save }, 'Save')),
    ]);
    name.addEventListener('keydown', (e) => { if (e.key === 'Enter') save(); });
  }

  // The add bar: a name, and optionally a due date (picked, or Today / Tomorrow).
  const syncQuickDates = () => {
    for (const b of document.querySelectorAll('.quick-date')) {
      b.classList.toggle('on', $('#task-date').value === ymd(addDays(new Date(), Number(b.dataset.days))));
    }
  };
  for (const b of document.querySelectorAll('.quick-date')) {
    b.addEventListener('click', () => {
      const day = ymd(addDays(new Date(), Number(b.dataset.days)));
      $('#task-date').value = $('#task-date').value === day ? '' : day; // a second click clears it
      syncQuickDates();
    });
  }
  $('#task-date').addEventListener('input', syncQuickDates);

  $('#task-add').addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = $('#task-title');
    const title = input.value.trim();
    if (!title) { input.focus(); return; }
    const due = $('#task-date').value;
    input.value = '';
    try {
      const t = await onyx.createTask({ title, listId: $('#task-list').value || undefined, ...(due ? { due } : {}) });
      $('#task-date').value = '';
      syncQuickDates();
      const when = t.start ? `${fmtDay(new Date(t.start))}, ${fmtTime(new Date(t.start))}` : t.date ? fmtDay(fromYmd(t.date)) : '';
      toast(when ? `Added for ${when}` : 'Added');
      await loadTasks();
      refetch();
    } catch (err) {
      input.value = title;
      toast(err.message, 'error');
    }
  });

  // ------------------------------------------------------------ news
  // A collapsible tab on the right: the latest videos from YouTube news channels (read
  // by the PC from each channel's feed), a player, and the channels' 24/7 live streams.

  const YT = 'https://www.youtube-nocookie.com';
  const NEWS_REFRESH_MS = 10 * 60 * 1000;
  const news = { stories: [], channels: [], at: 0, filter: 'all', current: null, playing: false, loading: false, problems: '', shown: '' };

  const newsOpen = () => (MOBILE ? document.body.classList.contains('drawer-news') : $('#layout').classList.contains('news-open'));

  function setNewsOpen(open) {
    if (MOBILE) {
      document.body.classList.remove('drawer-left', 'drawer-right');
      document.body.classList.toggle('drawer-news', open);
    } else {
      $('#layout').classList.toggle('news-open', open);
      if (S.settings.newsPanel !== open) saveSettings({ newsPanel: open }, true);
      applyPanelWidths(); // the panels give way so the calendar keeps its room
      requestAnimationFrame(() => calendar.updateSize());
    }
    if (!open) return stopNews();
    if (Date.now() - news.at > 5 * 60 * 1000) loadNews(); else renderNews();
  }

  /** Collapsing the tab stops whatever is playing. */
  function stopNews() {
    news.playing = false;
    renderPlayer();
  }

  async function loadNews(force) {
    if (news.loading) return;
    news.loading = true;
    $('#news-refresh').classList.add('spin');
    if (!news.stories.length) renderNews();
    try {
      const res = await onyx.news(force);
      news.stories = res.stories;
      news.channels = res.channels;
      news.at = Date.now();
      const problems = res.errors.join('  ·  ');
      if (problems && problems !== news.problems) toast(`News: ${problems}`, 'warn');
      news.problems = problems;
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      news.loading = false;
      $('#news-refresh').classList.remove('spin');
    }
    // The panel opens on the newest story that has been watched at all: a stream that is
    // only scheduled (no views yet) would just say "Live in 2 hours".
    const first = news.stories.find((s) => s.views !== 0) || news.stories[0];
    if (!news.current && first) news.current = { kind: 'video', ...first };
    renderNews();
  }

  const ago = (iso) => {
    const min = Math.max(0, Math.round((Date.now() - new Date(iso)) / 60000));
    if (min < 1) return 'just now';
    if (min < 60) return `${min}m ago`;
    if (min < 48 * 60) return `${Math.round(min / 60)}h ago`;
    return `${Math.round(min / 1440)}d ago`;
  };
  const okVideo = (id) => /^[\w-]{11}$/.test(id || '');
  const okChannel = (id) => /^UC[\w-]{22}$/.test(id || '');
  const shownStories = () => news.stories.filter((s) => news.filter === 'all' || s.channelId === news.filter);
  const watchUrl = (c) => (c.kind === 'live' ? `https://www.youtube.com/channel/${c.channelId}/live` : `https://www.youtube.com/watch?v=${c.id}`);

  function embedUrl(c) {
    const q = 'autoplay=1&rel=0&playsinline=1&enablejsapi=1';
    return c.kind === 'live' ? `${YT}/embed/live_stream?channel=${c.channelId}&${q}` : `${YT}/embed/${c.id}?${q}`;
  }

  // Tamkeen, the Arabic study app: when it is installed on this device, a toggle in the
  // News panel sends news videos to its player (clickable captions, word lookups) instead
  // of playing them here. Live streams still play here: Tamkeen needs a video's captions.
  const tamkeen = { installed: false, on: (() => { try { return localStorage.getItem('onyx.news-tamkeen') === '1'; } catch { return false; } })() };

  function renderTamkeen() {
    const b = $('#news-tamkeen');
    b.hidden = !tamkeen.installed;
    b.classList.toggle('on', tamkeen.on);
    b.setAttribute('aria-pressed', String(tamkeen.on));
    b.title = tamkeen.on
      ? 'On: news videos open in Tamkeen\'s player. Click to play them here again'
      : 'Open news videos in Tamkeen\'s player, with clickable captions';
  }

  $('#news-tamkeen').addEventListener('click', () => {
    tamkeen.on = !tamkeen.on;
    try { localStorage.setItem('onyx.news-tamkeen', tamkeen.on ? '1' : '0'); } catch { /* remembered for this visit only */ }
    renderTamkeen();
    toast(tamkeen.on ? 'News videos now open in Tamkeen' : 'News videos play here again');
  });

  onyx.tamkeen?.info().then((info) => { tamkeen.installed = !!info?.installed; renderTamkeen(); if (news.current) renderPlayer(); }).catch(() => {});

  async function openInTamkeen(c) {
    if (news.playing) { news.playing = false; renderNews(); } // one player at a time
    try {
      await onyx.tamkeen.watch(c.id);
      toast(`Opening "${c.title || 'the video'}" in Tamkeen`);
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  function play(c) {
    if (c.kind === 'live' ? !okChannel(c.channelId) : !okVideo(c.id)) return;
    if (tamkeen.on && tamkeen.installed && c.kind === 'video') {
      news.current = c;
      renderNews();
      openInTamkeen(c);
      return;
    }
    news.current = c;
    news.playing = true;
    renderNews();
  }

  /** The story after the one playing, in the list as filtered; used by Next and when a video ends. */
  function playNext() {
    const list = shownStories();
    const i = list.findIndex((s) => s.id === news.current?.id);
    const next = list[i + 1] || list[0];
    if (next && next.id !== news.current?.id) play({ kind: 'video', ...next });
  }

  // With enablejsapi, the player reports its state to the page once it is asked to.
  window.addEventListener('message', (e) => {
    if (e.origin !== YT || e.source !== $('#news-player iframe')?.contentWindow) return;
    let data;
    try { data = JSON.parse(e.data); } catch { return; }
    const state = data.event === 'onStateChange' ? data.info : data.info?.playerState;
    if (state === 0 && news.current?.kind === 'video') playNext(); // 0: ended
  });

  function renderPlayer() {
    const c = news.current;
    const key = c ? `${c.kind}:${c.id || c.channelId}:${news.playing}` : `none:${news.loading}`;
    const box = $('#news-player');
    // Re-rendering must not reload a video that is already playing.
    if (key !== news.shown || !box.firstChild) {
      news.shown = key;
      const screen = h('div', { class: 'news-screen' });
      if (!c) {
        screen.append(h('div', { class: 'news-empty-screen' }, news.loading ? 'Loading the news…' : 'No stories yet. Pick some channels with the button above.'));
      } else if (news.playing) {
        const frame = h('iframe', {
          src: embedUrl(c), title: c.title || `${c.channel} live`, allow: 'autoplay; encrypted-media; picture-in-picture; fullscreen',
          allowFullscreen: true, referrerPolicy: 'strict-origin-when-cross-origin',
        });
        frame.addEventListener('load', () => frame.contentWindow?.postMessage(JSON.stringify({ event: 'listening', id: 1, channel: 'widget' }), YT));
        screen.append(frame);
      } else {
        const poster = h('button', { class: 'news-poster', title: 'Play', onclick: () => play(c) }, h('span', { class: 'play' }, icon('play')));
        if (c.kind === 'video' && okVideo(c.id)) poster.style.backgroundImage = `url("https://i.ytimg.com/vi/${c.id}/hqdefault.jpg")`;
        screen.append(poster);
      }
      box.replaceChildren(screen, h('div', { class: 'news-now' }));
    }
    const now = box.querySelector('.news-now');
    if (!c) { now.replaceChildren(); return; }
    now.replaceChildren(
      h('div', { class: 'title' }, c.kind === 'live' ? h('span', { class: 'badge-live' }, 'LIVE') : null, c.kind === 'live' ? ` ${c.channel}` : c.title),
      h('div', { class: 'meta' },
        h('span', null, c.kind === 'live' ? '24/7 stream' : `${c.channel} · ${ago(c.published)}`),
        h('span', { class: 'grow' }),
        c.kind === 'video' && shownStories().length > 1 && h('button', { class: 'btn', title: 'Play the next story', onclick: playNext }, icon('next'), 'Next'),
        c.kind === 'video' && tamkeen.installed && h('button', { class: 'btn', title: 'Open it in Tamkeen\'s player', onclick: () => openInTamkeen(c) }, 'Tamkeen'),
        h('button', { class: 'btn', title: 'Open it on YouTube', onclick: () => onyx.open(watchUrl(c)) }, icon('link'), 'YouTube')));
  }

  function renderFilter() {
    const on = news.channels.filter((c) => c.on);
    if (news.filter !== 'all' && !on.some((c) => c.id === news.filter)) news.filter = 'all';
    const chip = (label, active, onclick, cls = '') => h('button', { class: `news-chip ${cls}${active ? ' on' : ''}`, onclick }, cls === 'live' && h('i'), label);
    const pick = (id) => { news.filter = id; renderNews(); };
    const live = news.channels.filter((c) => c.live && okChannel(c.id));
    $('#news-filter').replaceChildren(
      h('div', { class: 'news-chips' },
        chip('All', news.filter === 'all', () => pick('all')),
        on.map((c) => chip(c.name, news.filter === c.id, () => pick(c.id)))),
      live.length > 0 && h('div', { class: 'news-chips', title: 'Channels with a 24/7 live stream' },
        h('span', { class: 'news-chips-label' }, 'Live'),
        live.map((c) => chip(c.name, news.current?.kind === 'live' && news.current.channelId === c.id && news.playing,
          () => play({ kind: 'live', channelId: c.id, channel: c.name }), 'live'))));
  }

  function renderList() {
    const box = $('#news-list');
    const list = shownStories();
    $('#news-updated').textContent = list.length || '';
    if (!list.length) {
      box.replaceChildren(h('div', { class: 'empty' }, news.loading ? 'Loading…'
        : news.channels.some((c) => c.on) ? 'No new stories right now.' : 'No channels are switched on. Pick some with the button above.'));
      return;
    }
    box.replaceChildren(...list.map((s) => {
      const thumb = h('div', { class: 'news-thumb' });
      if (okVideo(s.id)) thumb.style.backgroundImage = `url("https://i.ytimg.com/vi/${s.id}/mqdefault.jpg")`;
      return h('button', { class: `news-row${news.current?.id === s.id && news.playing ? ' playing' : ''}`, title: s.title, onclick: () => play({ kind: 'video', ...s }) },
        thumb, h('div', null, h('div', { class: 't' }, s.title), h('div', { class: 'm' }, h('b', null, s.channel), ` · ${ago(s.published)}`)));
    }));
  }

  function renderNews() {
    renderPlayer();
    renderFilter();
    renderList();
  }

  /** Which channels feed the panel: switch them on and off, add any YouTube channel. */
  function openNewsChannels(anchor) {
    const list = h('div', { class: 'news-channels' });
    const input = h('input', { type: 'text', placeholder: '@handle or channel link', spellcheck: false, autocomplete: 'off' });
    const change = async (fn) => {
      try {
        news.channels = await fn();
        draw();
        loadNews();
      } catch (err) {
        toast(err.message, 'error');
      }
    };
    const draw = () => list.replaceChildren(...news.channels.map((c) => h('label', null,
      h('input', { type: 'checkbox', checked: c.on, onchange: (e) => change(() => onyx.setNewsChannel(c.id, e.target.checked)) }),
      h('span', null, c.name), c.live && h('small', null, 'LIVE'),
      h('button', { class: 'x', title: `Remove ${c.name}`, onclick: (e) => { e.preventDefault(); change(() => onyx.removeNewsChannel(c.id)); } }, icon('x')))));
    const add = async () => {
      const text = input.value.trim();
      if (!text) return input.focus();
      addBtn.disabled = true;
      try {
        news.channels = await onyx.addNewsChannel(text);
        input.value = '';
        toast(`Added ${news.channels.at(-1)?.name || 'the channel'}`);
        draw();
        loadNews();
      } catch (err) {
        toast(err.message, 'error');
      }
      addBtn.disabled = false;
    };
    const addBtn = h('button', { class: 'btn primary', onclick: add }, 'Add');
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') add(); });
    draw();
    showPopover(anchor, [
      h('b', null, 'News channels'),
      h('p', { class: 'pop-meta' }, 'Stories from the channels switched on, newest first. LIVE channels also have a 24/7 stream.'),
      list,
      h('div', { class: 'row' }, input, addBtn),
      h('div', { class: 'pop-actions' },
        h('button', { class: 'btn ghost', onclick: () => change(() => onyx.resetNewsChannels()) }, 'Reset to the default list'),
        h('div', { class: 'grow' }),
        h('button', { class: 'btn', onclick: () => closePopover() }, 'Done')),
    ]);
  }

  function buildNews() {
    const tab = $('#news-tab');
    tab.prepend(icon('news'));
    if (MOBILE) document.body.append(tab); // a fixed handle can't live inside the sliding drawer
    tab.onclick = () => setNewsOpen(!newsOpen());
    $('#news-close').append(icon(MOBILE ? 'x' : 'right'));
    $('#news-close').onclick = () => setNewsOpen(false);
    $('#news-refresh').append(icon('refresh'));
    $('#news-refresh').onclick = () => loadNews(true);
    $('#news-channels').append(icon('sliders'));
    $('#news-channels').onclick = (e) => openNewsChannels(e.currentTarget.getBoundingClientRect());
    setInterval(() => { if (newsOpen()) loadNews(); }, NEWS_REFRESH_MS);
    if (!MOBILE && S.settings.newsPanel) setNewsOpen(true);
  }

  // ------------------------------------------------------------ goals
  // A long-term goal: a name, a time frame and the steps toward it. Each step is a real
  // task (Tasks panel, calendar, Google), the time frame is one bar on the calendar, and
  // the globe shows the whole goal as one node.

  function renderGoals() {
    const box = $('#goal-list');
    const add = (e) => openGoal(null, e.currentTarget.getBoundingClientRect());
    box.replaceChildren(
      h('div', { class: 'group-head' }, h('span', null, 'Goals'), h('button', { class: 'link-btn', onclick: add }, '+ New goal')),
      ...goals.length
        ? goals.map((g) => {
          const p = g.progress;
          const left = Math.round((fromYmd(g.end) - fromYmd(ymd(new Date()))) / 86400000);
          const due = left < 0 ? 'past its target date' : left === 0 ? 'target today' : left < 60 ? `${left} days left` : `until ${fromYmd(g.end).toLocaleDateString([], { month: 'short', year: 'numeric' })}`;
          return h('div', { class: `goal-row ${visible(g.id) ? 'on' : ''}`, css: { '--c': g.color } },
            h('button', { class: 'box', title: visible(g.id) ? 'Shown on the calendar. Click to hide.' : 'Hidden from the calendar. Click to show.', onclick: () => toggleCalendar(g.id) }, icon('check')),
            h('button', { class: 'goal-main', title: 'Open the goal', onclick: (e) => openGoal(g, e.currentTarget.getBoundingClientRect()) },
              h('span', { class: 'goal-top' }, h('span', { class: 'name' }, g.title), h('span', { class: 'pct' }, p.total ? `${p.percent}%` : '')),
              h('span', { class: 'goal-track' }, h('i', { css: { width: `${p.percent}%` } })),
              h('span', { class: 'goal-when' }, due)));
        })
        : [h('p', { class: 'side-hint' }, 'Set a long-term goal with a target date and the steps to get there.')]);
  }

  async function openGoalById(id, anchor) {
    let g = goals.find((x) => x.id === id);
    if (!g) { await loadGoals(); g = goals.find((x) => x.id === id); }
    if (g) openGoal(g, anchor); else toast('That goal no longer exists.', 'error');
  }

  function openGoal(g, anchor) {
    const lists = S.calendars.filter((c) => c.kind === 'tasklist');
    const title = h('input', { type: 'text', class: 'pop-title', placeholder: 'What do you want to achieve?', value: g ? g.title : '', spellcheck: false });
    const start = h('input', { type: 'date', value: g ? g.start : ymd(new Date()), title: 'Starts' });
    const end = h('input', { type: 'date', value: g ? g.end : ymd(addDays(new Date(), 90)), title: 'Target date' });
    let color = g ? g.color : COLORS[goals.length % COLORS.length];
    const swatches = h('div', { class: 'swatches' });
    const palette = COLORS.includes(color) ? COLORS : [color, ...COLORS];
    const drawSwatches = () => swatches.replaceChildren(...palette.map((c) => h('button', {
      class: `swatch${c === color ? ' on' : ''}`, css: { '--c': c }, title: 'Colour', onclick: () => { color = c; drawSwatches(); },
    })));
    drawSwatches();
    const notes = notesField(g?.notes, 'Why it matters, and how you will know you got there');
    const tags = tagField(g ? g.tags : [...tagFilter].map((t) => tagInfo(t)?.name || t));
    const listPick = !g && lists.length > 1 && h('select', { class: 'goal-list-pick', title: 'The task list the steps go into' },
      lists.map((c) => h('option', { value: c.id }, `${c.name}  ·  ${c.accountLabel}`)));
    if (listPick) listPick.value = (lists.find((c) => c.id === S.settings.pi.taskList) || lists.find((c) => c.provider === 'google') || lists[0]).id;

    const steps = (g?.steps || []).map((s) => ({ ...s }));
    const stepBox = h('div', { class: 'goal-steps' });
    // The progress bar follows every tick at once (a tick is saved straight away).
    const progressBox = h('div', { class: 'goal-progress', css: { '--c': color } });
    const drawProgress = (p) => {
      progressBox.hidden = !p || !p.total;
      if (p) progressBox.replaceChildren(h('span', { class: 'goal-track' }, h('i', { css: { width: `${p.percent}%` } })), h('span', null, `${p.percent}%  ·  ${p.done} of ${p.total} steps complete`));
    };
    drawProgress(g?.progress);

    // Ticking a step of a saved goal saves it at once and moves the progress bar.
    const tick = async (s, done, box) => {
      if (!g || !s.id) { if (s.repeat) s.doneToday = done; else s.done = done; return drawSteps(); }
      box.disabled = true;
      try {
        const saved = await onyx.setGoalStep(g.id, s.id, done);
        for (const fresh of saved.steps) {
          const mine = steps.find((x) => x.id === fresh.id);
          if (mine) Object.assign(mine, { done: fresh.done, count: fresh.count, target: fresh.target, doneToday: fresh.doneToday, taskId: fresh.taskId, due: fresh.repeat ? mine.due : fresh.due });
        }
        Object.assign(g, saved);
        goals = goals.map((x) => (x.id === saved.id ? saved : x));
        drawProgress(saved.progress);
        drawSteps();
        renderGoals();
        loadTasks();
        refetch();
        if (done) toast(s.repeat ? `${s.title}: done today (${saved.steps.find((x) => x.id === s.id)?.count || 1} so far)` : `${s.title}: done`);
      } catch (err) {
        box.disabled = false;
        box.checked = !done;
        toast(err.message, 'error');
      }
    };

    const HOW_OFTEN = [['', 'Once'], ['daily', 'Daily'], ['weekdays', 'Weekdays'], ['weekly', 'Weekly']];
    const drawSteps = (focus) => {
      stepBox.replaceChildren(...steps.map((s, i) => {
        const name = h('input', { type: 'text', value: s.title, placeholder: `Step ${i + 1}`, spellcheck: false, oninput: (e) => { s.title = e.target.value; } });
        name.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') { e.preventDefault(); steps.splice(i + 1, 0, { title: '', due: null, done: false }); drawSteps(i + 1); }
          if (e.key === 'Backspace' && !name.value && steps.length > 1) { e.preventDefault(); steps.splice(i, 1); drawSteps(Math.max(0, i - 1)); }
        });
        const often = h('select', { class: 'step-often', title: 'How often: once, or a habit that repeats until the target date' },
          HOW_OFTEN.map(([v, l]) => h('option', { value: v }, l)));
        often.value = s.repeat || '';
        often.onchange = () => { s.repeat = often.value || null; if (s.repeat) s.done = false; drawSteps(); };
        const checked = s.repeat ? !!s.doneToday : !!s.done;
        const box = h('input', { type: 'checkbox', checked, title: s.repeat ? 'Done today' : 'Done' });
        box.onchange = () => tick(s, box.checked, box);
        const days = { daily: 'days', weekdays: 'days', weekly: 'weeks' }[s.repeat];
        // The step's task carries its time and pomodoro split: the button opens it.
        const task = s.taskId && tasks.find((x) => x.id === s.taskId);
        const timer = task && h('button', {
          class: `x pomo-btn${task.pomodoro ? ' on' : ''}`,
          title: task.pomodoro ? `Pomodoro: ${task.pomodoro.work} min work, ${task.pomodoro.rest} min rest${task.time ? ` at ${fmtTime(at('2000-01-01', task.time))}` : ''}` : 'Pomodoro: give this step a time and split it into work and rest chunks',
          onclick: (e) => { const rect = e.currentTarget.getBoundingClientRect(); closePopover(); openTask(task, rect); },
        }, icon('clock'));
        return h('div', { class: `goal-step${!s.repeat && s.done ? ' done' : ''}${s.repeat ? ' habit' : ''}` },
          box,
          name,
          often,
          s.repeat
            ? h('span', { class: 'step-count', title: `Done ${s.count || 0} of the ${s.target || '…'} ${days} until the target date` },
              s.target ? `${s.count || 0}/${s.target} ${days}` : 'new')
            : h('input', { type: 'date', value: s.due || '', title: 'Due', onchange: (e) => { s.due = e.target.value || null; } }),
          h('input', { type: 'time', class: 'step-time', value: s.time || '', step: 300, title: 'Time of day (optional): the step goes on your calendar at that time', onchange: (e) => { s.time = e.target.value || null; } }),
          timer,
          h('button', { class: 'x', title: 'Remove this step (its task is deleted)', onclick: () => { steps.splice(i, 1); drawSteps(); } }, icon('x')));
      }));
      if (focus != null) stepBox.querySelectorAll('input[type=text]')[focus]?.focus();
    };
    if (!steps.length) steps.push({ title: '', due: null, done: false });
    drawSteps();

    // Spreads the steps without a date evenly from today (or the start) to the target date.
    const spread = () => {
      const undated = steps.filter((s) => s.title.trim() && !s.due && !s.done && !s.repeat);
      if (!undated.length) return toast('Every step already has a date.');
      const from = fromYmd(start.value > ymd(new Date()) ? start.value : ymd(new Date()));
      const span = Math.max(0, Math.round((fromYmd(end.value) - from) / 86400000));
      undated.forEach((s, k) => { s.due = ymd(addDays(from, Math.round((span * (k + 1)) / undated.length))); });
      drawSteps();
    };

    let busy = false;
    const save = async () => {
      if (busy) return;
      busy = true;
      const picked = tags.get();
      const data = {
        title: title.value.trim(), start: start.value, end: end.value, color, notes: cleanNote(notes.value), tags: picked,
        steps: steps.filter((s) => s.title.trim()).map((s) => ({ id: s.id, title: s.title.trim(), due: s.repeat ? null : s.due || null, time: s.time || null, done: !!s.done, repeat: s.repeat || null })),
        ...(listPick ? { listId: listPick.value } : {}),
      };
      try {
        const res = g ? await onyx.updateGoal(g.id, data) : await onyx.createGoal(data);
        if (res.warnings?.length) toast(`Saved, but: ${res.warnings.join('  ·  ')}`, 'warn');
        else if (!g) toast(`Goal set: ${res.steps.length} ${res.steps.length === 1 ? 'step' : 'steps'}${lists.length ? ' added to your tasks' : ''}`);
        closePopover();
        await loadTasks();
        refetch();
        if (!sameTags(picked, g?.tags)) reloadTags();
      } catch (err) {
        busy = false;
        toast(err.message, 'error');
      }
    };
    const remove = async () => {
      const open = g.steps.filter((s) => s.taskId && !s.done).length;
      if (!confirm(`Delete the goal "${g.title}"?${open ? ` Its ${open} open ${open === 1 ? 'step is' : 'steps are'} deleted from your tasks too.` : ''}`)) return;
      try {
        await onyx.deleteGoal(g.id);
        closePopover();
        await loadTasks();
        refetch();
        reloadTags();
      } catch (err) {
        toast(err.message, 'error');
      }
    };

    showPopover(anchor, [
      title,
      g && originRow({ kind: 'goal', listId: g.listId }),
      progressBox,
      h('div', { class: 'row' }, icon('calendar'), start, h('span', { class: 'dash' }, 'to'), end),
      h('div', { class: 'row' }, icon('tag'), tags.el),
      h('div', { class: 'row top' }, icon('note'), notes),
      h('div', { class: 'row goal-look' }, h('span', { class: 'ico' }), swatches, listPick || null),
      h('div', { class: 'goal-steps-head' }, h('b', null, 'Steps'),
        h('div', { class: 'grow' }),
        h('button', { class: 'link-btn', title: 'Give the steps without a date evenly spaced dates up to the target', onclick: spread }, 'Spread dates'),
        h('button', { class: 'link-btn', onclick: () => { steps.push({ title: '', due: null, done: false }); drawSteps(steps.length - 1); } }, '+ Add step')),
      stepBox,
      h('p', { class: 'pop-meta' }, lists.length
        ? 'Each step becomes a task in your Tasks panel, calendar and Google. On the globe the goal is one node.'
        : 'Connect Google or Outlook so the steps also become tasks.'),
      h('div', { class: 'pop-actions' },
        g && h('button', { class: 'btn danger', onclick: remove }, icon('trash'), 'Delete'),
        h('div', { class: 'grow' }),
        h('button', { class: 'btn ghost', onclick: () => closePopover() }, 'Cancel'),
        h('button', { class: 'btn primary', onclick: save }, g ? 'Save' : 'Set goal')),
    ], null, { wide: true });
    if (!MOBILE && !g) title.focus();
  }

  // ------------------------------------------------------------ sidebar

  function renderMini() {
    const first = new Date(miniMonth.getFullYear(), miniMonth.getMonth(), 1);
    const offset = (first.getDay() - S.settings.weekStart + 7) % 7;
    const view = calendar.view;
    const today = new Date();
    const cells = [];
    for (let i = 0; i < 7; i++) {
      cells.push(h('span', { class: 'dow' }, new Date(2023, 0, 1 + ((i + S.settings.weekStart) % 7)).toLocaleDateString([], { weekday: 'narrow' })));
    }
    for (let i = 0; i < 42; i++) {
      const d = new Date(first.getFullYear(), first.getMonth(), 1 - offset + i);
      const inView = view.type !== 'dayGridMonth' && d >= view.currentStart && d < view.currentEnd;
      cells.push(h('button', {
        class: [d.getMonth() !== first.getMonth() && 'out', sameDay(d, today) && 'today', inView && 'in-view',
          inView && (sameDay(d, view.currentStart) || i % 7 === 0) && 'first',
          inView && (sameDay(addDays(d, 1), view.currentEnd) || i % 7 === 6) && 'last'].filter(Boolean).join(' '),
        onclick: () => {
          calendar.gotoDate(d);
          if (graph.on) { graph.anchor = d; if (graph.kind === 'range') graph.kind = 'week'; renderGraphBar(); loadGraph(); }
          closeDrawers();
        },
      }, h('i', null, d.getDate())));
    }
    const step = (n) => { miniMonth = new Date(first.getFullYear(), first.getMonth() + n, 1); renderMini(); };
    $('#mini').replaceChildren(
      h('div', { class: 'mini-head' },
        h('b', null, first.toLocaleDateString([], { month: 'long', year: 'numeric' })),
        h('span', null,
          h('button', { class: 'icon-btn', onclick: () => step(-1) }, icon('left')),
          h('button', { class: 'icon-btn', onclick: () => step(1) }, icon('right')))),
      h('div', { class: 'mini-grid' }, cells));
  }

  function toggleCalendar(id) {
    const hidden = { ...S.settings.hidden };
    if (hidden[id]) delete hidden[id]; else hidden[id] = true;
    S.settings.hidden = hidden;
    renderSidebar();
    renderTasks();
    saveSettings({ hidden }, true).then(() => refetch());
  }

  function renderSidebar() {
    const groups = new Map();
    for (const c of S.calendars) {
      if (!groups.has(c.account)) groups.set(c.account, { label: c.accountLabel, provider: c.provider, items: [] });
      groups.get(c.account).items.push(c);
    }
    $('#calendars').replaceChildren(...[...groups.values()].map((g) => h('div', null,
      h('div', { class: 'group-head' }, h('span', null, g.label)),
      g.items.map((c) => h('button', { class: `cal ${visible(c.id) ? 'on' : ''}`, css: { '--c': c.color }, title: visible(c.id) ? 'Shown on the master calendar. Click to hide.' : 'Hidden. Click to show.', onclick: () => toggleCalendar(c.id) },
        h('span', { class: 'box' }, icon('check')),
        h('span', { class: 'name' }, c.name),
        h('span', { class: 'tag' }, c.kind === 'tasklist' ? 'tasks' : ''))))));
    renderGoals();
    renderTagList();
  }

  function toggleTagFilter(name) {
    const key = name.toLowerCase();
    if (tagFilter.has(key)) tagFilter.delete(key); else tagFilter.add(key);
    renderTagList();
    renderTasks();
    refetch();
  }

  function cycleTagColor(tag) {
    const next = COLORS[(COLORS.indexOf(tag.color) + 1) % COLORS.length];
    act(() => onyx.setTagColor(tag.name, next));
  }

  // Double-click a tag's name to rename it; renaming onto an existing tag merges the two.
  function renameTagInline(tag, label) {
    const input = h('input', { type: 'text', class: 'tag-rename', value: tag.name, spellcheck: false });
    const done = (keep) => {
      const name = input.value.trim().replace(/^#+/, '');
      if (keep && name && name !== tag.name) act(() => onyx.renameTag(tag.name, name));
      else renderTagList();
    };
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') done(true); if (e.key === 'Escape') { e.stopPropagation(); done(false); } });
    input.addEventListener('blur', () => done(true));
    label.replaceWith(input);
    input.focus();
    input.select();
  }

  function renderTagList() {
    const box = $('#tag-list');
    if (!S.tags.length) {
      box.replaceChildren(h('div', { class: 'group-head' }, h('span', null, 'Tags')),
        h('p', { class: 'side-hint' }, 'Tag any block, event or task to group it. Tags stay in Onyx.'));
      return;
    }
    box.replaceChildren(
      h('div', { class: 'group-head' }, h('span', null, 'Tags'),
        tagFilter.size > 0 && h('button', { class: 'link-btn', onclick: () => { tagFilter.clear(); renderTagList(); renderTasks(); refetch(); } }, 'Show all')),
      ...S.tags.map((t) => {
        const label = h('span', { class: 'name', ondblclick: (e) => { e.stopPropagation(); renameTagInline(t, label); } }, `#${t.name}`);
        const on = tagFilter.has(t.name.toLowerCase());
        return h('div', { class: `cal tagrow ${on ? 'on' : ''} ${tagFilter.size && !on ? 'faded' : ''}`, css: { '--c': t.color }, title: 'Click to show only this tag. Double-click to rename.', onclick: () => toggleTagFilter(t.name) },
          h('button', { class: 'swatch', title: 'Change colour', onclick: (e) => { e.stopPropagation(); cycleTagColor(t); } }),
          label,
          h('span', { class: 'tag' }, t.count),
          h('button', { class: 'del', title: 'Delete this tag everywhere', onclick: (e) => {
            e.stopPropagation();
            if (confirm(`Remove #${t.name} from ${t.count} ${t.count === 1 ? 'entry' : 'entries'}?`)) { tagFilter.delete(t.name.toLowerCase()); act(() => onyx.deleteTag(t.name)); }
          } }, icon('x')));
      }));
  }

  // ------------------------------------------------------------ settings

  async function saveSettings(patch, quiet) {
    try {
      const next = await onyx.settings(patch);
      if (!quiet) applyState(next);
      else { S.settings = next.settings; S.mcp = next.mcp; S.tags = next.tags; }
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  // ------------------------------------------------------------ panel widths
  // The sidebar, Tasks and News panels are widened or narrowed by dragging their inner
  // edge; the widths are kept per PC (settings.panels). Double-click an edge for the usual width.
  const PANELS = {
    side: { prop: '--side-w', def: 248, min: 200, max: 480, edge: 'right', grip: () => $('#layout'), el: () => $('#sidebar') },
    tasks: { prop: '--tasks-w', def: 300, min: 230, max: 700, edge: 'left', grip: () => $('#tasks'), el: () => $('#tasks') },
    news: { prop: '--news-open-w', def: 380, min: 300, max: 960, edge: 'left', grip: () => $('#news'), el: () => $('#news') },
  };
  const CALENDAR_MIN = 380; // the calendar always keeps at least this much width

  function clampPanel(key, px) {
    const p = PANELS[key];
    const shown = (k) => {
      const r = PANELS[k].el().getBoundingClientRect();
      return r.width && getComputedStyle(PANELS[k].el()).display !== 'none' ? r.width : 0;
    };
    const others = Object.keys(PANELS).filter((k) => k !== key).reduce((sum, k) => sum + shown(k), 0);
    const room = ($('#layout').clientWidth || window.innerWidth) - others - CALENDAR_MIN;
    return Math.round(Math.max(p.min, Math.min(px, p.max, Math.max(p.min, room))));
  }

  function applyPanelWidths() {
    if (MOBILE) return;
    const saved = S?.settings?.panels || {};
    // When room is short, Tasks gives way first, then the sidebar, then News.
    for (const k of ['tasks', 'side', 'news']) $('#layout').style.setProperty(PANELS[k].prop, `${clampPanel(k, saved[k] || PANELS[k].def)}px`);
  }

  function savePanelWidth(key, px) {
    S.settings.panels = { ...(S.settings.panels || {}), [key]: px };
    saveSettings({ panels: { [key]: px } }, true);
  }

  if (!MOBILE) {
    for (const [key, p] of Object.entries(PANELS)) {
      const grip = h('div', { class: `panel-grip ${key}`, title: 'Drag to resize · double-click for the usual width' });
      p.grip().prepend(grip);
      grip.addEventListener('pointerdown', (e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        grip.setPointerCapture(e.pointerId);
        const startX = e.clientX;
        const startW = p.el().getBoundingClientRect().width;
        let width = startW;
        let frame = 0;
        grip.classList.add('on');
        document.body.classList.add('resizing');
        const move = (ev) => {
          const dx = ev.clientX - startX;
          width = clampPanel(key, startW + (p.edge === 'left' ? -dx : dx));
          $('#layout').style.setProperty(p.prop, `${width}px`);
          if (!frame) frame = requestAnimationFrame(() => { frame = 0; calendar?.updateSize(); });
        };
        const up = () => {
          grip.removeEventListener('pointermove', move);
          grip.removeEventListener('pointerup', up);
          grip.removeEventListener('pointercancel', up);
          grip.classList.remove('on');
          document.body.classList.remove('resizing');
          calendar?.updateSize();
          if (Math.round(width) !== Math.round(startW)) savePanelWidth(key, width);
        };
        grip.addEventListener('pointermove', move);
        grip.addEventListener('pointerup', up);
        grip.addEventListener('pointercancel', up);
      });
      grip.addEventListener('dblclick', () => {
        $('#layout').style.setProperty(p.prop, `${clampPanel(key, p.def)}px`);
        calendar?.updateSize();
        savePanelWidth(key, null);
      });
    }
    window.addEventListener('resize', applyPanelWidths);
  }

  function applyState(next) {
    S = next;
    applyPanelWidths();
    calendar.setOption('firstDay', S.settings.weekStart);
    for (const [k, v] of Object.entries(timeFormats())) calendar.setOption(k, v);
    $('#layout').classList.toggle('no-tasks', !S.settings.tasksPanel);
    $('#toggle-tasks').classList.toggle('on', S.settings.tasksPanel);
    calendar.updateSize();
    renderSidebar();
    renderMini();
    renderTasks();
    if (!$('#modal').hidden) openSettings(settingsTab);
  }

  /** Runs something that changes accounts or calendars, then redraws everything. */
  async function act(fn, done) {
    try {
      const next = await fn();
      if (next?.errors?.length) toast(next.errors.join('  ·  '), 'error');
      if (next?.settings) applyState(next);
      refetch(true);
      loadTasks(true);
      if (done) toast(done);
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  const field = (title, hint, control) => h('div', { class: 'field' }, h('div', { class: 'txt' }, h('b', null, title), hint && h('small', null, hint)), control);
  const toggle = (checked, onchange, disabled) => h('label', { class: 'switch' }, h('input', { type: 'checkbox', checked, disabled, onchange: (e) => onchange(e.target.checked) }), h('span'));
  // Tailscale's addresses (100.64.0.0/10) reach the PC from any network, not just its wifi.
  const isTailscale = (address) => /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(address);
  /** How to set up Tailscale, so the phone reaches the PC away from home. */
  const tailscaleSteps = (on) => h('div', { class: 'card' },
    h('h4', null, 'Use your phone away from home'),
    h('p', null, 'Tailscale is a free app that links your devices privately over the internet, so the phone reaches this calendar from mobile data or any wifi.'),
    h('ol', null,
      h('li', null, 'Install Tailscale on the PC and sign in.'),
      h('li', null, 'Install Tailscale on the phone and sign in with the same account.'),
      h('li', null, on === 'phone'
        ? 'Open Onyx once while the phone can reach the PC (at home, or with Tailscale on). It picks up the PC\'s Tailscale address by itself; this box goes away when it has.'
        : 'Open Onyx on the phone once while it can reach this PC. It picks up the Tailscale address by itself, no new scan needed.')),
    h('div', { class: 'row' }, h('button', { class: 'btn', onclick: () => onyx.open(on === 'phone' ? 'https://play.google.com/store/apps/details?id=com.tailscale.ipn' : 'https://tailscale.com/download') },
      icon('link'), on === 'phone' ? 'Get Tailscale for Android' : 'Download Tailscale')));
  const copyBtn = (text, label = 'Copy') => h('button', { class: 'btn', onclick: () => onyx.copy(text).then(() => toast('Copied')) }, label);

  const PANES = {
    calendars() {
      const msId = h('input', { type: 'text', placeholder: 'Application (client) ID', value: S.microsoft.clientId, spellcheck: false });
      const feedName = h('input', { type: 'text', placeholder: 'Name, e.g. Work Outlook' });
      const feedUrl = h('input', { type: 'url', placeholder: 'https://… or webcal://… link ending in .ics', spellcheck: false });
      const localName = h('input', { type: 'text', placeholder: 'Name, e.g. Deep work' });
      let color = COLORS[1];
      const swatches = h('span', { class: 'swatches' }, COLORS.slice(0, 8).map((c) => h('button', {
        css: { '--c': c }, class: c === color ? 'on' : '',
        onclick: (e) => { color = c; for (const b of swatches.children) b.classList.toggle('on', b === e.currentTarget); },
      })));
      return [
        h('h3', null, 'Calendars'),
        h('p', { class: 'lead' }, 'Everything you connect here is merged into one master calendar. Use the sidebar to switch individual calendars on and off.'),
        S.accounts.length > 0 && h('div', { class: 'card' }, h('h4', null, 'Connected'),
          S.accounts.map((a) => h('div', { class: 'acct' }, h('span', { class: 'badge' }, PROVIDER[a.provider]), h('span', { class: 'who' }, a.label),
            h('button', { class: 'btn danger', onclick: () => act(() => onyx.removeAccount(a.id), 'Removed') }, 'Remove')))),
        h('div', { class: 'card' },
          h('h4', null, 'Google Calendar and Tasks', S.google.ready && h('span', { class: 'badge ok' }, 'Credentials loaded')),
          h('p', null, 'Google needs a credentials file that identifies this app as yours. If Hermes already reads your Google Tasks, you can reuse the same file it uses.'),
          h('div', { class: 'row' },
            h('button', { class: 'btn', onclick: () => act(() => onyx.loadGoogleCredentials()) }, S.google.ready ? 'Replace credentials file' : '1.  Choose credentials file'),
            h('button', { class: 'btn primary', disabled: !S.google.ready, onclick: () => act(() => onyx.connectGoogle(), 'Google connected') }, S.google.ready ? 'Sign in with Google' : '2.  Sign in with Google'))),
        h('div', { class: 'card' },
          h('h4', null, 'Outlook (Microsoft account)'),
          h('p', null, 'Microsoft needs a free app registration. The README has the two-minute steps. Paste its ID here, then sign in. Work accounts that block this can use a calendar link instead.'),
          h('div', { class: 'row' }, msId, h('button', { class: 'btn primary', onclick: () => act(() => onyx.connectMicrosoft(msId.value), 'Outlook connected') }, 'Sign in with Microsoft'))),
        h('div', { class: 'card' },
          h('h4', null, 'Calendar link (read-only)'),
          h('p', null, 'Works with any calendar that can be published as an .ics link: Outlook ("Publish a calendar"), iCloud, sports schedules, and so on. No sign-in needed.'),
          h('div', { class: 'row' }, feedName, feedUrl,
            h('button', { class: 'btn', onclick: () => act(() => onyx.addFeed({ name: feedName.value, url: feedUrl.value }), 'Calendar added') }, 'Add'))),
        h('div', { class: 'card' },
          h('h4', null, 'On this PC'),
          h('p', null, S.desktops?.desktops?.length > 1 ? 'Local calendars for time blocks. They are kept in Onyx, on your linked desktops, not in Google or Outlook.' : 'Local calendars for time blocks. They stay on this computer.'),
          S.calendars.filter((c) => c.account === 'local').map((c) => h('div', { class: 'acct' },
            h('span', { class: 'swatches' }, h('button', { css: { '--c': c.color }, disabled: true })), h('span', { class: 'who' }, c.name),
            h('button', { class: 'btn danger', onclick: () => act(() => onyx.removeLocalCalendar(c.id)) }, 'Remove'))),
          h('div', { class: 'row' }, localName, swatches,
            h('button', { class: 'btn', onclick: () => act(() => onyx.addLocalCalendar(localName.value, color)) }, 'Add'))),
      ];
    },

    pi() {
      const pi = S.settings.pi;
      const lists = S.calendars.filter((c) => c.kind === 'tasklist' && c.provider === 'google');
      const set = (patch) => saveSettings({ pi: patch }).then(() => { refetch(true); loadTasks(true); });
      return [
        h('h3', null, 'Raspberry Pi calls'),
        h('p', { class: 'lead' }, 'Your Pi phones you (and sends an ntfy alert) about any Google Task with a time in its name. Turn on "Phone reminder" for a block or event and Onyx keeps a matching task for the Pi, so the call follows the event if you move it. Nothing on the Pi needs to change, and calls still happen when this PC is off.'),
        h('div', { class: 'card' },
          field('Show Pi phone reminders', 'Adds the phone switch to blocks and events, and shows which tasks the Pi will call about.', toggle(pi.enabled, (v) => set({ enabled: v }))),
          field('Task list for reminders', lists.length ? 'Where the matching tasks are kept. The Pi reads every list.' : 'Connect a Google account first.',
            h('select', { disabled: !lists.length, value: pi.taskList, onchange: (e) => set({ taskList: e.target.value }) },
              lists.map((c) => h('option', { value: c.id, selected: c.id === pi.taskList }, c.name)))),
          field('Call this long before', 'Minutes. Must match lead_minutes in the Pi\'s config.json.',
            h('input', { type: 'number', min: 5, max: 720, value: pi.leadMinutes, onchange: (e) => set({ leadMinutes: Number(e.target.value) }) })),
          field('Quiet hours', 'The Pi skips calls in this window. Must match the Pi\'s config.json.',
            h('span', { class: 'row' },
              h('input', { type: 'time', value: pi.quietStart, onchange: (e) => set({ quietStart: e.target.value }) }), 'to',
              h('input', { type: 'time', value: pi.quietEnd, onchange: (e) => set({ quietEnd: e.target.value }) })))),
      ];
    },

    mcp() {
      const m = S.mcp;
      const set = (patch) => saveSettings({ mcp: patch });
      const host = m.addresses[0] || '127.0.0.1';
      const url = `http://${host}:${m.port}/mcp`;
      const hermes = `mcp_servers:\n  onyx:\n    url: ${url}\n    headers:\n      Authorization: "Bearer ${m.token}"`;
      const curl = `curl -H "Authorization: Bearer ${m.token}" "http://${host}:${m.port}/api/agenda?days=1"`;
      return [
        h('h3', null, 'MCP server'),
        h('p', { class: 'lead' }, 'Lets Hermes, the Pi or any other agent read the master calendar and add to it while this app is running. Every request needs the token below.'),
        h('div', { class: 'card' },
          field('Server', m.error || (m.running ? `Running on port ${m.port}` : 'Off'),
            h('span', { class: 'row' }, h('span', { class: `badge ${m.running ? 'ok' : m.error ? 'bad' : ''}` }, m.running ? 'Running' : m.error ? 'Error' : 'Off'), toggle(m.enabled, (v) => set({ enabled: v })))),
          field('Reachable from your network', 'On: the Pi and other devices on your wifi can connect. Off: only this PC. Windows may ask you to allow it through the firewall.', toggle(m.lan, (v) => set({ lan: v }))),
          field('Port', null, h('input', { type: 'number', min: 1024, max: 65535, value: m.port, onchange: (e) => set({ port: Number(e.target.value) }) }))),
        m.running && h('div', { class: 'card' },
          h('h4', null, 'Address'),
          h('pre', { class: 'code' }, [...m.addresses.map((a) => `http://${a}:${m.port}/mcp`), `http://127.0.0.1:${m.port}/mcp   (this PC)`, `http://host.docker.internal:${m.port}/mcp   (from Docker on this PC)`].join('\n')),
          h('div', { class: 'row' }, copyBtn(url, 'Copy address'), copyBtn(m.token, 'Copy token'))),
        m.running && h('div', { class: 'card' },
          h('h4', null, 'Hermes config'),
          h('p', null, 'Add this under mcp_servers in Hermes\' config.yaml.'),
          h('pre', { class: 'code' }, hermes),
          h('div', { class: 'row' }, copyBtn(hermes))),
        m.running && h('div', { class: 'card' },
          h('h4', null, 'Plain JSON, for scripts on the Pi'),
          h('pre', { class: 'code' }, curl),
          h('div', { class: 'row' }, copyBtn(curl))),
      ];
    },

    general() {
      const s = S.settings;
      const writable = S.calendars.filter((c) => c.kind === 'calendar' && c.writable);
      return [
        h('h3', null, 'General'),
        h('p', { class: 'lead' }, 'How the calendar looks and behaves.'),
        h('div', { class: 'card' },
          field('New blocks go to', 'The calendar picked first when you drag out a block.',
            h('select', { onchange: (e) => saveSettings({ defaultCalendar: e.target.value }) },
              writable.map((c) => h('option', { value: c.id, selected: c.id === s.defaultCalendar }, c.account === 'local' ? c.name : `${c.name}  ·  ${c.accountLabel}`)))),
          onyx.checkUpdate && field('Updates', `You have Onyx ${onyx.isPhone ? 'for Android' : S.version}. New versions are checked for automatically, and a popup offers them.`,
            h('button', { class: 'btn', onclick: () => checkForUpdate(true) }, icon('update'), 'Check now')),
          field('Now / Next bar', 'A strip under the top bar: what you are doing now, what is next, and how much time is left before it. It chimes 5 minutes before and as it starts (the bell on the bar mutes it).',
            toggle(s.nextBar !== false, (v) => saveSettings({ nextBar: v }).then(tickNext))),
          field('Popups', 'A popup over everything, ringing, when the Pi phones you about something, and another as it starts. Snooze brings it back in 5 minutes.',
            toggle(s.popups !== false, (v) => saveSettings({ popups: v }))),
          field('24-hour time', null, toggle(!s.hour12, (v) => saveSettings({ hour12: !v }))),
          field('Week starts on', null,
            h('select', { onchange: (e) => saveSettings({ weekStart: Number(e.target.value) }) },
              [['Sunday', 0], ['Monday', 1], ['Saturday', 6]].map(([n, v]) => h('option', { value: v, selected: v === s.weekStart }, n)))),
          !onyx.isPhone && field('Keep running when closed', 'Closing the window hides it in the system tray, so the MCP server and your phone stay connected. Quit from the tray icon.', toggle(s.closeToTray, (v) => saveSettings({ closeToTray: v }))),
          !onyx.isPhone && field('Start with Windows', 'Starts hidden in the tray when you sign in.', toggle(s.launchAtLogin, (v) => saveSettings({ launchAtLogin: v })))),
      ];
    },

    // Desktop: the QR code the Android app scans to connect.
    phone() {
      const box = h('div', { class: 'card pair' }, h('p', null, 'Loading…'));
      onyx.pairing().then((p) => {
        const tailscale = p.addresses.map((a) => a.replace(/:\d+$/, '')).find(isTailscale);
        if (!p.running || !p.lan) {
          box.replaceChildren(h('h4', null, 'Turn on the server first'),
            h('p', null, 'The phone connects through the MCP server. In the MCP server tab, switch the server on and turn on "Reachable from your network".'),
            h('div', { class: 'row' }, h('button', { class: 'btn', onclick: () => openSettings('mcp') }, 'Open MCP server settings')));
          return;
        }
        box.replaceChildren(
          h('div', { class: 'pair-grid' },
            h('img', { class: 'qr', src: p.qr, alt: 'Pairing QR code' }),
            h('div', null,
              h('h4', null, 'Connect your phone'),
              h('ol', null,
                h('li', null, 'Install Onyx Calendar for Android: the .apk on the GitHub release page.'),
                h('li', null, 'Point the phone\'s camera at this code and open the link, then tap Open in Onyx. (Or tap Scan QR code in the Onyx app.)'),
                h('li', null, 'It connects by itself.')),
              h('p', null, 'To type it in instead, use an address below and the token.'))),
          h('pre', { class: 'code' }, `Addresses: ${p.addresses.join('   ')}\nToken:     ${p.token}`),
          h('div', { class: 'row' }, copyBtn(p.link, 'Copy pairing link'), copyBtn(p.token, 'Copy token')),
          field('Away from home', tailscale
            ? `On: phones reach this PC from any network through Tailscale (${tailscale}).`
            : 'Off: phones reach this PC only on the same wifi. Set up Tailscale below to use them anywhere.',
          h('span', { class: `badge ${tailscale ? 'ok' : ''}` }, tailscale ? 'On' : 'Off')));
        if (!tailscale) box.after(tailscaleSteps('pc'));
      }).catch((err) => box.replaceChildren(h('p', null, err.message)));
      return [
        h('h3', null, 'Phone'),
        h('p', { class: 'lead' }, 'The Android app shows this calendar, your tasks and tags, and can add and change entries. It talks to Onyx on this PC, so this PC needs to be on: on the same wifi, or from anywhere with Tailscale.'),
        box,
      ];
    },

    // Desktop: other PCs running Onyx, kept in step with this one.
    desktops() {
      const box = h('div', null, h('div', { class: 'card' }, h('p', null, 'Loading…')));
      const run = async (fn, done) => {
        try {
          const next = await fn();
          if (next?.settings) applyState(next); else openSettings('desktops');
          if (done) toast(done);
        } catch (err) {
          toast(err.message, 'error');
        }
      };
      const ago = (t) => {
        const s = Math.max(0, Math.round((Date.now() - t) / 1000));
        return s < 60 ? 'just now' : s < 3600 ? `${Math.round(s / 60)} min ago` : s < 86400 ? `${Math.round(s / 3600)} h ago` : new Date(t).toLocaleDateString();
      };
      const short = (a) => a.replace(/:4747$/, '');
      onyx.desktops().then((d) => {
        const m = S.mcp;
        const off = !m.running || !m.lan;
        const others = d.desktops.filter((x) => !x.self);
        const linked = d.linked && others.length > 0;
        const address = h('input', { type: 'text', placeholder: 'Its address, e.g. 192.168.1.20', spellcheck: false });
        const code = h('input', { type: 'text', class: 'code-input', placeholder: 'ABCD-2345', spellcheck: false, autocomplete: 'off', maxlength: 9 });
        const join = () => run(() => onyx.joinDesktop(address.value, code.value), 'Linked. Everything is now shared with the other desktop.');
        code.addEventListener('keydown', (e) => { if (e.key === 'Enter') join(); });
        box.replaceChildren(...[
          off && h('div', { class: 'card' },
            h('h4', null, 'Turn on the server first'),
            h('p', null, 'Desktops reach each other through the MCP server, like the phone does. In the MCP server tab, switch the server on and turn on "Reachable from your network".'),
            h('div', { class: 'row' }, h('button', { class: 'btn', onclick: () => openSettings('mcp') }, 'Open MCP server settings'))),
          linked && h('div', { class: 'card' },
            h('h4', null, 'Linked desktops', h('span', { class: 'badge ok' }, `${others.length + 1} PCs`)),
            d.desktops.map((x) => h('div', { class: 'acct desk' },
              h('span', { class: `badge ${x.self ? '' : x.online ? 'ok' : 'bad'}` }, x.self ? 'This PC' : x.online ? 'Online' : 'Offline'),
              h('span', { class: 'who' }, x.name,
                h('small', null, x.self
                  ? (x.addresses.length ? x.addresses.map(short).join('  ·  ') : 'Not reachable: the server is off')
                  : x.online ? `Synced ${ago(x.seen)}` : [x.seen ? `Last synced ${ago(x.seen)}` : 'Not synced yet', x.error].filter(Boolean).join(' · '))),
              !x.self && !x.online && h('button', { class: 'btn', title: 'Take it off the list (a desktop that is still linked comes back when it next syncs)', onclick: () => run(() => onyx.forgetDesktop(x.id)) }, 'Remove'))),
            h('p', { class: 'hint' }, 'Changes reach the others within seconds while they are on, and as soon as they come back otherwise. Your phone uses whichever desktop is on.'),
            h('div', { class: 'row' },
              h('button', { class: 'btn', onclick: () => run(() => onyx.syncDesktops(), 'Synced') }, icon('update'), 'Sync now'),
              h('button', { class: 'btn danger', onclick: () => {
                if (confirm('Unlink this desktop? It keeps what it has now, but stops sharing changes with the others.')) run(() => onyx.leaveDesktops(), 'Unlinked');
              } }, 'Unlink this desktop'))),
          h('div', { class: 'card' },
            h('h4', null, 'Link another desktop'),
            d.invite
              ? [h('p', null, 'On the other PC, install Onyx and open Settings → Desktops. Under "Join a linked desktop", enter this PC\'s address and the code. The code works once, for 10 minutes.'),
                h('div', { class: 'link-code' }, d.invite.code),
                h('pre', { class: 'code' }, `This PC's address:  ${d.invite.addresses.map(short).join('   or   ') || '(turn on the server first)'}`),
                h('div', { class: 'row' }, copyBtn(d.invite.code, 'Copy code'), h('button', { class: 'btn', onclick: () => run(() => onyx.cancelInvite()) }, 'Cancel'))]
              : [h('p', null, 'Shows a one-time code to type into Onyx on the other PC. After that, both share your Google credentials and sign-ins, tags, notes, goals, repeats, memos, pins and settings.'),
                h('div', { class: 'row' }, h('button', { class: 'btn primary', disabled: off, onclick: () => run(() => onyx.inviteDesktop()) }, 'Show a link code'))]),
          !linked && h('div', { class: 'card' },
            h('h4', null, 'Join a linked desktop'),
            h('p', null, 'Use this on the new PC, with the address and code shown on the PC that is already set up. This PC gets everything from that one, nothing needs setting up again. Where both have the same setting, the other PC\'s wins.'),
            h('div', { class: 'row' }, address, code, h('button', { class: 'btn primary', disabled: off, onclick: join }, 'Join')),
            h('p', { class: 'hint' }, 'A phone paired with only this PC needs pairing again afterwards (from either PC).')),
        ].filter(Boolean));
        if (d.invite) setTimeout(() => { if (settingsTab === 'desktops' && !$('#modal').hidden) openSettings('desktops'); }, Math.max(1000, d.invite.expires - Date.now() + 500));
      }).catch((err) => box.replaceChildren(h('div', { class: 'card' }, h('p', null, err.message))));
      return [
        h('h3', null, 'Desktops'),
        h('p', { class: 'lead' }, 'Run Onyx on more than one PC and keep them the same. Load your Google credentials file on one, and every linked desktop has it.'),
        box,
      ];
    },

    // Desktop: Notion and Google Drive, for pinning documents to the globe.
    connections() {
      const n = S.notion || {};
      const key = h('input', { type: 'text', placeholder: 'Internal integration secret (starts with ntn_ or secret_)', spellcheck: false, autocomplete: 'off' });
      const google = S.accounts.filter((a) => a.provider === 'google');
      return [
        h('h3', null, 'Notion & Drive'),
        h('p', { class: 'lead' }, 'Pin Notion pages and Google Drive files to the globe, then tag them into clusters next to your calendar and notes. Onyx only reads their titles and links.'),
        h('div', { class: 'card' },
          h('h4', null, 'Notion', n.connected && h('span', { class: 'badge ok' }, n.workspace ? `Connected · ${n.workspace}` : 'Connected')),
          n.connected
            ? [h('p', null, `Using the integration "${n.name || 'Notion'}". Only pages shared with it can be found: in Notion, open a page, then ••• → Connections → add it. Sharing a top-level page shares everything inside it.`),
              h('div', { class: 'row' }, h('button', { class: 'btn danger', onclick: () => act(() => onyx.disconnectNotion(), 'Notion disconnected') }, 'Disconnect'))]
            : [h('ol', null,
              h('li', null, 'Open notion.so/my-integrations and choose New integration. Type: Internal. Pick your workspace.'),
              h('li', null, 'Under Capabilities, "Read content" is enough. Save, then copy the Internal Integration Secret.'),
              h('li', null, 'Paste it below and press Connect.'),
              h('li', null, 'In Notion, open the pages you want, then ••• → Connections → add your integration.')),
            h('div', { class: 'row' }, key,
              h('button', { class: 'btn', onclick: () => onyx.open('https://www.notion.so/my-integrations') }, 'Open Notion'),
              h('button', { class: 'btn primary', onclick: () => act(() => onyx.connectNotion(key.value), 'Notion connected') }, 'Connect'))]),
        h('div', { class: 'card' },
          h('h4', null, 'Google Drive', google.length > 0 && h('span', { class: 'badge' }, google.map((a) => a.label).join(', '))),
          h('p', null, google.length
            ? 'Drive uses your Google sign-in. If you connected Google before Drive was added, sign in once more so Onyx may read file names, and make sure the Google Drive API is enabled in your Google Cloud project (APIs & Services → Library).'
            : 'Connect a Google account first (Calendars tab). Drive uses the same sign-in.'),
          google.length > 0 && h('div', { class: 'row' },
            h('button', { class: 'btn', onclick: () => act(() => onyx.connectGoogle(), 'Google signed in again') }, 'Sign in with Google again'),
            h('button', { class: 'btn', onclick: () => onyx.open('https://console.cloud.google.com/apis/library/drive.googleapis.com') }, 'Enable the Drive API'))),
      ];
    },

    // Phone: keys and links typed or picked here are saved in Onyx on the PC, so both use them.
    keys() {
      const n = S.notion || {};
      const notionKey = h('input', { type: 'text', placeholder: 'Notion integration secret (ntn_…)', spellcheck: false, autocomplete: 'off' });
      const msId = h('input', { type: 'text', placeholder: 'Application (client) ID', value: S.microsoft.clientId, spellcheck: false });
      const feedName = h('input', { type: 'text', placeholder: 'Name, e.g. Work Outlook' });
      const feedUrl = h('input', { type: 'url', placeholder: 'https://… or webcal://… (.ics link)', spellcheck: false });
      const file = h('input', { type: 'file', accept: '.json,application/json', hidden: true, onchange: async (e) => {
        const f = e.target.files?.[0];
        if (f) act(async () => onyx.setGoogleCredentials(await f.text()), 'Google credentials saved on your PC');
      } });
      return [
        h('h3', null, 'Keys & accounts'),
        h('p', { class: 'lead' }, 'Anything you enter here is saved in Onyx on your PC, so the PC and this phone both use it, and keys entered on the PC show up here. Signing in to Google or Microsoft happens on the PC, in its browser.'),
        h('div', { class: 'card' },
          h('h4', null, 'Notion', n.connected && h('span', { class: 'badge ok' }, n.workspace ? `Connected · ${n.workspace}` : 'Connected')),
          n.connected
            ? h('div', { class: 'row' }, h('button', { class: 'btn danger', onclick: () => act(() => onyx.disconnectNotion(), 'Notion disconnected') }, 'Disconnect'))
            : [h('p', null, 'Paste the secret of your Notion integration (notion.so/my-integrations), then share pages with it in Notion: ••• → Connections.'),
              h('div', { class: 'row' }, notionKey, h('button', { class: 'btn primary', onclick: () => act(() => onyx.connectNotion(notionKey.value), 'Notion connected') }, 'Connect'))]),
        h('div', { class: 'card' },
          h('h4', null, 'Google', S.google.ready && h('span', { class: 'badge ok' }, 'Credentials saved')),
          h('p', null, 'Pick the Google credentials file (client_secret_….json) from this phone. Then finish on the PC: Settings → Calendars → Sign in with Google.'),
          h('div', { class: 'row' }, file, h('button', { class: 'btn', onclick: () => file.click() }, S.google.ready ? 'Replace credentials file' : 'Choose credentials file')),
          S.accounts.filter((a) => a.provider === 'google').map((a) => h('div', { class: 'acct' }, h('span', { class: 'badge' }, 'Google'), h('span', { class: 'who' }, a.label)))),
        h('div', { class: 'card' },
          h('h4', null, 'Outlook'),
          h('p', null, 'The app registration ID. Then on the PC: Settings → Calendars → Sign in with Microsoft.'),
          h('div', { class: 'row' }, msId, h('button', { class: 'btn', onclick: () => act(() => onyx.setMicrosoftClient(msId.value), 'Saved on your PC') }, 'Save'))),
        h('div', { class: 'card' },
          h('h4', null, 'Calendar link (read-only)'),
          h('p', null, 'Any calendar published as an .ics link. No sign-in needed.'),
          h('div', { class: 'row' }, feedName, feedUrl,
            h('button', { class: 'btn', onclick: () => act(() => onyx.addFeed({ name: feedName.value, url: feedUrl.value }), 'Calendar added') }, 'Add'))),
      ];
    },

    // Phone: which PC it is connected to.
    connection() {
      const c = onyx.connection();
      return [
        h('h3', null, 'Connection'),
        h('p', { class: 'lead' }, 'This phone shows the calendar from Onyx on your PC. Accounts are added and removed on the PC.'),
        h('div', { class: 'card' },
          field('Status', c?.online === false ? 'Not reachable right now: showing the last sync.' : `Connected through ${c?.last || c?.addresses?.[0] || '…'}`,
            h('span', { class: `badge ${c?.online === false ? 'bad' : 'ok'}` }, c?.online === false ? 'Offline' : 'Online')),
          field('PC addresses', (c?.addresses || []).join('  ·  '), null),
          field('Away from home', c?.anywhere?.length
            ? `Works from any network through Tailscale (${c.anywhere[0].replace(/:\d+$/, '')}). Keep Tailscale on, on both this phone and the PC.`
            : 'Off: this phone reaches the PC only on the same wifi. Set up Tailscale below to use Onyx anywhere.',
          h('span', { class: `badge ${c?.anywhere?.length ? 'ok' : ''}` }, c?.anywhere?.length ? 'On' : 'Off')),
          h('div', { class: 'row' },
            onyx.canScan && h('button', { class: 'btn', onclick: (e) => scanToPair(e.currentTarget) }, icon('qr'), 'Scan a new code'),
            h('button', { class: 'btn danger', onclick: () => {
              if (confirm('Disconnect this phone from your PC?')) { onyx.unpair(); location.reload(); }
            } }, 'Disconnect'))),
        !c?.anywhere?.length && tailscaleSteps('phone'),
        // Linked desktops share one calendar and one token: whichever is on answers this phone.
        S.desktops?.desktops?.length > 1 && h('div', { class: 'card' },
          h('h4', null, 'Your desktops'),
          h('p', null, 'These PCs keep the same calendar. The phone uses whichever one is on.'),
          S.desktops.desktops.map((x) => {
            const here = (c?.last && x.addresses.includes(c.last));
            return h('div', { class: 'acct desk' },
              h('span', { class: `badge ${here ? 'ok' : x.online ? 'ok' : ''}` }, here ? 'In use' : x.online ? 'Online' : 'Off'),
              h('span', { class: 'who' }, x.name, h('small', null, x.addresses.map((a) => a.replace(/:4747$/, '')).join('  ·  '))));
          }),
          h('div', { class: 'row' }, h('button', { class: 'btn', onclick: () => act(() => onyx.syncDesktops(), 'Synced') }, icon('update'), 'Sync them now'))),
        S.accounts.length > 0 && h('div', { class: 'card' }, h('h4', null, 'Accounts on the PC'),
          S.accounts.map((a) => h('div', { class: 'acct' }, h('span', { class: 'badge' }, PROVIDER[a.provider]), h('span', { class: 'who' }, a.label)))),
      ];
    },
  };

  let settingsTab = onyx.isPhone ? 'connection' : 'calendars';
  function openSettings(tab = settingsTab) {
    const tabs = onyx.isPhone
      ? [['connection', 'Connection'], ['keys', 'Keys & accounts'], ['pi', 'Pi calls'], ['general', 'General']]
      : [['calendars', 'Calendars'], ['connections', 'Notion & Drive'], ['phone', 'Phone'], ['desktops', 'Desktops'], ['pi', 'Pi calls'], ['mcp', 'MCP server'], ['general', 'General']];
    if (!tabs.some(([id]) => id === tab)) tab = tabs[0][0];
    settingsTab = tab;
    closePopover();
    closeDrawers();
    const modal = $('#modal');
    const scroll = $('.pane', modal)?.scrollTop || 0;
    const pane = h('div', { class: 'pane' }, h('button', { class: 'icon-btn close', onclick: closeSettings }, icon('x')), PANES[tab]());
    modal.replaceChildren(h('div', { class: 'sheet' },
      h('nav', null, h('h2', null, 'Settings'),
        tabs.map(([id, name]) => h('button', { class: id === tab ? 'on' : '', onclick: () => openSettings(id) }, name)),
        h('div', { class: 'ver' }, `Onyx Calendar ${S.version}`)),
      pane));
    modal.hidden = false;
    pane.scrollTop = scroll;
  }
  function closeSettings() { $('#modal').hidden = true; $('#modal').replaceChildren(); }
  $('#modal').addEventListener('mousedown', (e) => { if (e.target === $('#modal')) closeSettings(); });

  // ------------------------------------------------------------ globe view
  // Entries in a date range, plus notes and pinned Notion pages / Drive files,
  // orbiting around clusters on a 3D globe (graph.js).

  const graph = {
    on: false, kind: 'week', anchor: new Date(), from: '', to: '', groupBy: 'tags', view: null, seq: 0,
    show: { tasks: true, goals: true, notes: true, notion: true, drive: true, web: true, local: true }, // what joins the calendar entries
    lib: { notes: [], pins: [] },
    events: [],          // the last range's entries, so the clusters can be redrawn without fetching
    hidden: readHidden(), // tag clusters switched off in the Clusters tab ('' stands for untagged)
    clustersOpen: false,
  };

  // Which tag clusters are switched off is a per-screen preference, kept in this browser.
  function readHidden() {
    try { return new Set(JSON.parse(localStorage.getItem('onyx.globe.hidden') || '[]')); } catch { return new Set(); }
  }
  function saveHidden() {
    try { localStorage.setItem('onyx.globe.hidden', JSON.stringify([...graph.hidden])); } catch { /* not kept: still works for now */ }
  }
  // Whether the globe's toolbar shows everything or just the period picker. Per screen too;
  // on the phone it starts folded, since it would cover a third of the globe.
  function readBarOpen() {
    try { return JSON.parse(localStorage.getItem('onyx.globe.bar')) ?? !MOBILE; } catch { return !MOBILE; }
  }
  function saveBarOpen() {
    try { localStorage.setItem('onyx.globe.bar', JSON.stringify(graph.barOpen)); } catch { /* not kept: still works for now */ }
  }
  window.onyxDebug = { globe: () => graph.view }; // lets tests find nodes on the canvas

  // Where notes and outside documents gather when they have no tags.
  const SOURCES = {
    goals: { label: 'Goals', color: '#ffb547' },
    notes: { label: 'Notes', color: '#e4e0ff' },
    notion: { label: 'Notion', color: '#c4c4cc' },
    drive: { label: 'Drive', color: '#3ddc97' },
    web: { label: 'Links', color: '#9fd0ff' },
    local: { label: 'Files', color: '#ffd28a' },
  };

  function graphRange() {
    const a = graph.anchor;
    const day = new Date(a.getFullYear(), a.getMonth(), a.getDate());
    if (graph.kind === 'day') return [day, addDays(day, 1)];
    if (graph.kind === 'week') {
      const s = addDays(day, -((day.getDay() - S.settings.weekStart + 7) % 7));
      return [s, addDays(s, 7)];
    }
    if (graph.kind === 'month') return [new Date(a.getFullYear(), a.getMonth(), 1), new Date(a.getFullYear(), a.getMonth() + 1, 1)];
    const s = fromYmd(graph.from);
    const e = addDays(fromYmd(graph.to >= graph.from ? graph.to : graph.from), 1);
    return [s, e];
  }

  /** The phone's top bar has room for "Oct 15–17", not "Oct 15 – 17, 2026": the year only
   *  when it isn't this year. `end` is the day after the last one shown. */
  function shortTitle(start, end, type) {
    const last = addDays(end, -1);
    const year = (d) => (d.getFullYear() !== new Date().getFullYear() ? { year: 'numeric' } : {});
    if (type === 'timeGridDay' || type === 'day') return start.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric', ...year(start) });
    if (type === 'dayGridMonth' || type === 'month') return start.toLocaleDateString([], { month: 'long', ...year(start) });
    const md = { month: 'short', day: 'numeric' };
    if (ymd(start) === ymd(last)) return start.toLocaleDateString([], { ...md, ...year(start) });
    if (start.getMonth() === last.getMonth() && start.getFullYear() === last.getFullYear()) {
      return `${start.toLocaleDateString([], md)}–${last.getDate()}${year(last).year ? `, ${last.getFullYear()}` : ''}`;
    }
    const lastYear = start.getFullYear() !== last.getFullYear() ? { year: 'numeric' } : year(last);
    return `${start.toLocaleDateString([], md)} – ${last.toLocaleDateString([], { ...md, ...lastYear })}`;
  }

  function graphTitle([s, e]) {
    if (MOBILE) return shortTitle(s, e, graph.kind);
    const last = addDays(e, -1);
    if (graph.kind === 'day') return s.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
    if (graph.kind === 'month') return s.toLocaleDateString([], { month: 'long', year: 'numeric' });
    const opts = { month: 'short', day: 'numeric' };
    return `${s.toLocaleDateString([], opts)} – ${last.toLocaleDateString([], { ...opts, year: 'numeric' })}`;
  }

  function shiftGraph(n) {
    if (n === 0) graph.anchor = new Date();
    else if (graph.kind === 'day') graph.anchor = addDays(graph.anchor, n);
    else if (graph.kind === 'week') graph.anchor = addDays(graph.anchor, 7 * n);
    else if (graph.kind === 'month') graph.anchor = new Date(graph.anchor.getFullYear(), graph.anchor.getMonth() + n, 1);
    else {
      const [s, e] = graphRange();
      const span = Math.round((e - s) / 86400000);
      const from = n === 0 ? new Date() : addDays(s, span * n);
      graph.from = ymd(from);
      graph.to = ymd(addDays(from, span - 1));
    }
    renderGraphBar();
    loadGraph();
  }

  const sourceItem = (key, fields) => {
    const group = [key, SOURCES[key].label, SOURCES[key].color];
    return { color: SOURCES[key].color, calendarId: `src:${key}`, calendarName: SOURCES[key].label, home: group, source: group, start: null, ...fields };
  };

  /**
   * Where an untagged task starts out on the globe: Overdue, Today, Tomorrow, its day, or No date.
   * Only a starting place: dragging it onto a tag or another day moves it.
   */
  function dueGroup(date) {
    const today = ymd(new Date());
    if (!date) return ['due:none', 'No date', '#8a8a94'];
    if (date < today) return ['due:overdue', 'From earlier', '#d9b26b'];
    if (date === today) return [`due:${date}`, 'Today', '#f1f1f4'];
    if (date === ymd(addDays(new Date(), 1))) return [`due:${date}`, 'Tomorrow', '#c9c9d2'];
    return [`due:${date}`, fromYmd(date).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' }), '#a8b0c8'];
  }

  const taskItem = (t) => ({
    id: t.id, title: t.label, color: t.color, calendarId: t.listId, calendarName: t.listName, tags: t.tags || [],
    start: t.start || t.date || null, allDay: !t.start, kind: 'task', task: t, home: dueGroup(t.date), notes: notesOf(t),
  });

  function graphItems(events) {
    // A goal is one node: its time-frame bar and its steps' tasks are not drawn on their own.
    // A repeating task is one node too, not one per copy.
    const inSeries = new Set(tasks.filter((t) => t.series).map((t) => t.id));
    const items = events.filter((e) => visible(e.calendarId) && matchesFilter(e.tags) && e.kind !== 'goal' && !e.goal && !inSeries.has(e.id)).map((e) => {
      const t = e.kind === 'task' ? tasks.find((x) => x.id === e.id) : null;
      return t ? taskItem(t) : {
        id: e.id, title: e.title, color: e.color, calendarId: e.calendarId, calendarName: e.calendarName,
        tags: e.tags || [], start: e.start, allDay: e.allDay, kind: e.kind, src: e, notes: notesOf(e),
      };
    });
    if (graph.show.tasks) {
      // Tasks with no date, and overdue ones (whatever range is picked), join the dated tasks in range.
      const shown = new Set(items.map((i) => i.id));
      const today = ymd(new Date());
      for (const t of tasks) {
        if (shown.has(t.id) || t.mirror || t.done || t.goal || t.series || !visible(t.listId) || !matchesFilter(t.tags)) continue;
        if (!t.date || t.date < today) items.push(taskItem(t));
      }
      const seen = new Set();
      for (const t of tasks) {
        const s = t.series;
        if (!s || seen.has(s.key) || t.goal || !visible(t.listId)) continue;
        seen.add(s.key);
        const copies = tasks.filter((x) => x.series?.key === s.key);
        const tags = [...new Set(copies.flatMap((x) => x.tags || []))];
        if (!matchesFilter(tags)) continue;
        const next = copies.find((x) => x.date && x.date >= today) || copies.at(-1);
        items.push({
          id: `series:${s.key}`, title: `${s.label} (repeated)`, color: t.color, calendarId: t.listId, calendarName: t.listName, tags,
          start: next.start || next.date || null, allDay: !next.start, kind: 'series', series: s,
          home: ['repeat', 'Repeating', '#a9b4ff'],
          notes: `${seriesText(s)}${s.managed ? '' : ' (set in Google Tasks)'}\n${s.count} open ${s.count === 1 ? 'copy' : 'copies'}${s.overdue ? `, ${s.overdue} overdue` : ''}`,
        });
      }
    }
    // Goals span months, so they show whatever range is picked.
    if (graph.show.goals) {
      for (const g of goals) {
        if (!visible(g.id) || !matchesFilter(g.tags)) continue;
        const p = g.progress;
        items.push(sourceItem('goals', {
          id: g.id, title: p.total ? `${g.title} · ${p.percent}%` : g.title, tags: g.tags, kind: 'goal', shape: 'goal',
          color: g.color, goal: g, progress: p.percent / 100,
          notes: [g.notes, ...g.steps.map((s) => (s.repeat
            ? `↻ ${s.title}  (${s.count || 0} of ${s.target} ${s.repeat === 'weekly' ? 'weeks' : 'days'}${s.doneToday ? ', done today' : ''})`
            : `${s.done ? '✓' : '○'} ${s.title}${s.due ? `  (${fmtDay(fromYmd(s.due))})` : ''}`))].filter(Boolean).join('\n'),
        }));
      }
    }
    // Notes, Notion pages and Drive files have no date: they show whatever the range.
    if (graph.show.notes) {
      for (const n of graph.lib.notes) {
        if (matchesFilter(n.tags)) items.push(sourceItem('notes', { id: n.id, title: n.title, tags: n.tags, kind: 'note', shape: 'diamond', note: n, notes: (n.body || '').trim() }));
      }
    }
    for (const p of graph.lib.pins) {
      if (graph.show[p.source] && matchesFilter(p.tags)) {
        items.push(sourceItem(p.source, { id: p.id, title: p.title, tags: p.tags, kind: 'pin', shape: 'square', pin: p, notes: notesOf(p) }));
      }
    }
    // Tag clusters switched off in the Clusters tab: their clusters go, and so does anything
    // that only belonged to them ('' stands for everything without a tag).
    if (!graph.hidden.size) return items;
    return items.flatMap((it) => {
      const tags = it.tags || [];
      if (!tags.length) return graph.hidden.has('') ? [] : [it];
      const kept = tags.filter((t) => !graph.hidden.has(t.toLowerCase()));
      return kept.length ? [{ ...it, tags: kept }] : [];
    });
  }

  async function loadGraph() {
    const seq = ++graph.seq;
    const range = graphRange();
    $('#range').textContent = graphTitle(range);
    let events = [];
    try {
      const [ev, lib] = await Promise.all([onyx.events(range[0].toISOString(), range[1].toISOString()), onyx.globe()]);
      events = ev.events;
      graph.lib = lib;
    } catch (err) {
      toast(err.message, 'error');
    }
    if (seq !== graph.seq || !graph.on) return;
    graph.events = events;
    drawGraph();
  }

  /** Builds the globe from what was last loaded: quick, so the Clusters tab can call it on every tick. */
  function drawGraph() {
    if (!graph.on || !graph.view) return;
    renderClusters();
    const items = graphItems(graph.events);
    const data = OnyxGraph.build(items, {
      groupBy: graph.groupBy, tagColor,
      dayLabel: (key) => fromYmd(key).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' }),
    });
    graph.view.setData(data);
    const clusters = data.nodes.filter((n) => n.hub).length;
    $('#graph-stats').textContent = items.length ? `${items.length} ${items.length === 1 ? 'item' : 'items'}  ·  ${clusters} ${clusters === 1 ? 'cluster' : 'clusters'}` : '';
    $('#graph-empty').hidden = items.length > 0;
  }

  // ---- the Clusters tab: which tag clusters the globe shows

  function renderClusters() {
    const box = $('#graph-clusters');
    const toggle = (key, on) => {
      if (on) graph.hidden.delete(key); else graph.hidden.add(key);
      saveHidden();
      drawGraph(); // straight away: no Save
    };
    const head = h('button', { class: 'clusters-tab', title: 'Pick which tag clusters the globe shows', onclick: () => { graph.clustersOpen = !graph.clustersOpen; renderClusters(); } },
      icon('tag'), 'Clusters', graph.hidden.size > 0 && h('span', { class: 'count' }, `${graph.hidden.size} off`));
    if (!graph.clustersOpen) { box.replaceChildren(head); box.classList.remove('open'); return; }
    box.classList.add('open');
    const row = (key, label, color, count) => h('label', { class: 'cluster-row', css: { '--t': color } },
      h('input', { type: 'checkbox', checked: !graph.hidden.has(key), onchange: (e) => toggle(key, e.target.checked) }),
      h('span', { class: 'dot' }), h('span', { class: 'name' }, label), count != null && h('span', { class: 'n' }, count));
    box.replaceChildren(head,
      h('div', { class: 'clusters-body' },
        h('div', { class: 'clusters-all' },
          h('button', { class: 'link-btn inline', onclick: () => { graph.hidden.clear(); saveHidden(); drawGraph(); } }, 'Show all'),
          h('button', { class: 'link-btn inline', onclick: () => { for (const t of S.tags) graph.hidden.add(t.name.toLowerCase()); graph.hidden.add(''); saveHidden(); drawGraph(); } }, 'Hide all')),
        S.tags.length
          ? S.tags.map((t) => row(t.name.toLowerCase(), `#${t.name}`, t.color, t.count))
          : h('p', { class: 'pop-meta' }, 'No tags yet: tag anything to give it a cluster.'),
        row('', 'Without a tag', '#8a8a94', null)));
  }

  // ---- dragging a task from the Tasks panel onto a cluster

  let draggedTask = null;
  let dragHinted = false;

  function taskDragStart(t, e) {
    draggedTask = t;
    e.dataTransfer.setData('text/plain', t.label);
    e.dataTransfer.effectAllowed = 'move';
    document.body.classList.add('dragging-task');
    if (!graph.on && !dragHinted) {
      dragHinted = true;
      toast('Open the globe view (G) to drop tasks into its clusters.');
    }
  }

  function taskDragEnd() {
    draggedTask = null;
    graph.view?.dragOver();
    document.body.classList.remove('dragging-task');
  }

  /** What a dragged task stands for on the globe: its goal, its repeating series, or itself. */
  function globeItemFor(t) {
    if (t.goal) {
      const g = goals.find((x) => x.id === t.goal.id);
      if (g) return { id: g.id, kind: 'goal', tags: g.tags || [], goal: g, home: ['goals'] };
    }
    if (t.series) {
      const copies = tasks.filter((x) => x.series?.key === t.series.key);
      return { id: `series:${t.series.key}`, kind: 'series', series: t.series, tags: [...new Set(copies.flatMap((x) => x.tags || []))], home: ['repeat'] };
    }
    return taskItem(t);
  }

  function watchGlobeDrops() {
    const box = $('#graph');
    // Files and folders dragged in from File Explorer or the desktop (only on the PC).
    const filesDragged = (e) => !draggedTask && !!onyx.addFiles && [...(e.dataTransfer?.types || [])].includes('Files');
    box.addEventListener('dragover', (e) => {
      if (filesDragged(e) && graph.view) {
        e.preventDefault();
        const hit = graph.view.dragOver(e.clientX, e.clientY, 'Add to the globe');
        e.dataTransfer.dropEffect = 'copy';
        return hit;
      }
      if (!draggedTask || !graph.view) return;
      e.preventDefault();
      const hit = graph.view.dragOver(e.clientX, e.clientY, draggedTask.label);
      e.dataTransfer.dropEffect = hit ? 'move' : 'none';
    });
    box.addEventListener('dragleave', (e) => { if (!box.contains(e.relatedTarget)) graph.view?.dragOver(); });
    box.addEventListener('drop', async (e) => {
      if (filesDragged(e) && graph.view) {
        e.preventDefault();
        const hit = graph.view.dragOver(e.clientX, e.clientY, '');
        graph.view.dragOver();
        const paths = [...e.dataTransfer.files].map((f) => onyx.pathOf(f)).filter(Boolean);
        if (!paths.length) return;
        // Dropped on a tag's cluster: the files take that tag.
        const tag = hit?.key.startsWith('tag:') ? (tagInfo(hit.key.slice(4))?.name || hit.key.slice(4)) : null;
        try {
          afterFilesAdded(await onyx.addFiles(paths, tag ? [tag] : []), tag ? [tag] : []);
        } catch (err) {
          toast(err.message, 'error');
        }
        return;
      }
      if (!draggedTask || !graph.view) return;
      e.preventDefault();
      const t = draggedTask;
      const hit = graph.view.dragOver(e.clientX, e.clientY, t.label);
      taskDragEnd();
      if (!hit) return toast('Drop it on a cluster.');
      await moveOnGlobe(globeItemFor(t), hit.key, null, hit.label);
    });
  }

  function pickFromGraph(item, rect) {
    if (item.kind === 'task') {
      openTask(item.task || tasks.find((t) => t.id === item.id) || { id: item.id, title: item.title, label: item.title, listName: item.calendarName, tags: item.tags }, rect);
    } else if (item.kind === 'goal') {
      openGoal(item.goal, rect);
    } else if (item.kind === 'series') {
      openSeries(item.series, rect);
    } else if (item.kind === 'note') {
      openNote(item.note, rect);
    } else if (item.kind === 'pin') {
      openPin(item.pin, rect);
    } else {
      const src = item.src;
      openEditor({ src, start: toDate(src.start), end: toDate(src.end), allDay: src.allDay }, rect);
    }
  }

  // Dragging something onto another cluster on the globe.
  //   onto a tag            -> it takes that tag (instead of the tag it came from)
  //   onto Today / a day    -> a task gets that due date (and leaves the tag it came from)
  //   onto No date          -> a task loses its due date
  //   onto its own Notes / Notion / Drive / Untagged cluster -> it loses the tag it came from
  async function moveOnGlobe(item, toKey, fromKey, toLabel) {
    const tagOf = (key) => (key?.startsWith('tag:') ? (tagInfo(key.slice(4))?.name || key.slice(4)) : null);
    const fromTag = tagOf(fromKey);
    const without = (item.tags || []).filter((t) => t !== fromTag);
    const saveTags = (next) => {
      if (item.kind === 'note') return onyx.updateNote(item.id, { tags: next });
      if (item.kind === 'pin') return onyx.updatePin(item.id, { tags: next });
      if (item.kind === 'series') return Promise.all(item.series.ids.map((id) => onyx.setTags(id, next)));
      return onyx.setTags(item.id, next);
    };
    try {
      let done;
      if (toKey.startsWith('tag:')) {
        const to = tagOf(toKey);
        await saveTags([...without.filter((t) => t.toLowerCase() !== to.toLowerCase()), to]);
        done = `Moved to #${to}`;
      } else if (toKey.startsWith('home:due:') || toKey.startsWith('day:')) {
        const t = item.task;
        if (!t) throw new Error('Only tasks can be moved to a day here. Drag events in the calendar view.');
        const raw = toKey.replace(/^home:due:|^day:/, '');
        if (raw === 'overdue') throw new Error('Drop it on Today, Tomorrow, another day or No date.');
        if (t.dateInName) throw new Error('This task has its date written in its name. Change the name to move it.');
        const due = raw === 'none' ? null : raw;
        await onyx.updateTask(t.id, { due, ...(fromTag ? { tags: without } : {}) });
        done = due ? `Moved to ${toLabel}` : 'Date removed';
      } else if (toKey === 'untagged' || toKey === `home:${item.home?.[0]}`) {
        if (!fromTag) throw new Error('It is already there.');
        await saveTags(without);
        done = `Removed #${fromTag}`;
      } else {
        throw new Error(`It can't go into ${toLabel}. Drop it on a tag, or a task on a day.`);
      }
      toast(done);
      await loadTasks();
      reloadTags();
      refetch();
    } catch (err) {
      toast(err.message, 'warn');
      loadGraph(); // puts it back
    }
  }

  /** Tags a new note or pin starts with: the ones picked in the sidebar, if any. */
  const startingTags = () => [...tagFilter].map((t) => tagInfo(t)?.name || t);

  const afterGlobeChange = async (changedTags) => {
    closePopover();
    await loadGraph();
    if (changedTags) reloadTags();
  };

  // ------------------------------------------------------------ notes

  function openNote(note, anchor) {
    const title = h('input', { type: 'text', class: 'pop-title', placeholder: 'Note title', value: note ? note.title : '', spellcheck: false });
    const body = h('textarea', { class: 'note-body', rows: 9, placeholder: 'Write anything…', value: note ? note.body : '', spellcheck: true });
    const tags = tagField(note ? note.tags : startingTags());
    let busy = false;
    const save = async () => {
      if (busy) return;
      busy = true;
      const data = { title: title.value, body: body.value, tags: tags.get() };
      try {
        if (note) await onyx.updateNote(note.id, data); else await onyx.createNote(data);
        await afterGlobeChange(!sameTags(data.tags, note?.tags));
      } catch (err) {
        busy = false;
        toast(err.message, 'error');
      }
    };
    showPopover(anchor, [
      title,
      body,
      h('div', { class: 'row' }, icon('tag'), tags.el),
      h('p', { class: 'pop-meta' }, 'Tags place the note in clusters on the globe. Notes stay in Onyx.'),
      h('div', { class: 'pop-actions' },
        note && h('button', { class: 'btn danger', onclick: async () => {
          try { await onyx.deleteNote(note.id); await afterGlobeChange(true); } catch (err) { toast(err.message, 'error'); }
        } }, icon('trash'), 'Delete'),
        h('div', { class: 'grow' }),
        h('button', { class: 'btn ghost', onclick: () => closePopover() }, 'Cancel'),
        h('button', { class: 'btn primary', onclick: save }, note ? 'Save' : 'Add note')),
    ], null, { wide: true });
    title.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); body.focus(); } });
    body.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) save(); });
    if (!MOBILE) (note ? body : title).focus();
  }

  // ------------------------------------------------------------ Notion pages and Drive files

  const KIND_LABEL = { link: 'Web link', dir: 'Folder', word: 'Document', audio: 'Audio', text: 'Text file', page: 'Notion page', database: 'Notion database', doc: 'Google Doc', sheet: 'Google Sheet', slides: 'Google Slides', folder: 'Drive folder', form: 'Google Form', pdf: 'PDF', image: 'Image', video: 'Video', file: 'File' };

  function openPin(pin, anchor) {
    const web = pin.source === 'web';
    const local = pin.source === 'local';
    const named = web || local; // their names on the globe are Onyx's own, so they can be renamed
    const tags = tagField(pin.tags);
    const notes = notesField(pin.notes, web ? 'Your notes on this link' : local ? 'Your notes on this file' : `Your notes on this ${SOURCES[pin.source].label} item (kept in Onyx)`);
    const name = named && h('input', { type: 'text', class: 'pop-title', value: pin.title, spellcheck: false });
    const save = async () => {
      const picked = tags.get();
      const patch = { tags: picked };
      if (cleanNote(notes.value) !== (pin.notes || '')) patch.notes = notes.value;
      if (named && name.value.trim() && name.value.trim() !== pin.title) patch.title = name.value.trim();
      try { await onyx.updatePin(pin.id, patch); await afterGlobeChange(!sameTags(picked, pin.tags)); } catch (err) { toast(err.message, 'error'); }
    };
    // A file or folder opens with its own app on the PC; the phone can only list it.
    const openLocal = (reveal) => onyx.openFile(pin.id, reveal).catch((err) => toast(err.message, 'error'));
    const openButtons = local
      ? (onyx.openFile
        ? [h('button', { class: 'btn', title: 'Show it in File Explorer', onclick: () => openLocal(true) }, 'Show in folder'),
          h('button', { class: 'btn', disabled: !!pin.missing, onclick: () => openLocal(false) }, icon('link'), 'Open')]
        : [])
      : [h('button', { class: 'btn', onclick: () => onyx.open(pin.url) }, icon('link'), 'Open')];
    notes.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) save(); });
    showPopover(anchor, [
      named ? name : h('div', { class: 'pin-head' }, h('span', { class: `src-badge ${pin.source}` }, SOURCES[pin.source].label), h('b', null, pin.title)),
      local && h('div', { class: 'origin', css: { '--o': SOURCES.local.color } }, h('span', { class: 'origin-badge' }, pin.kind === 'dir' ? 'Folder on this PC' : 'File on this PC'),
        h('span', { class: 'origin-text' }, onyx.openFile ? '' : 'Open it from Onyx on the PC')),
      h('p', { class: `pop-meta${pin.missing ? ' problem' : ''}` }, web ? pin.url : local ? (pin.missing ? `Not found any more: ${pin.path}` : pin.path) : KIND_LABEL[pin.kind] || 'Document'),
      h('div', { class: 'row top' }, icon('note'), notes),
      h('div', { class: 'row' }, icon('tag'), tags.el),
      h('div', { class: 'pop-actions' },
        h('button', { class: 'btn danger', title: local ? 'Take it off the globe (the file itself is not touched)' : `Take it off the globe (it stays in ${SOURCES[pin.source].label})`, onclick: async () => {
          try { await onyx.removePin(pin.id); await afterGlobeChange(true); } catch (err) { toast(err.message, 'error'); }
        } }, icon('x'), 'Remove'),
        h('div', { class: 'grow' }),
        ...openButtons,
        h('button', { class: 'btn primary', onclick: save }, 'Save')),
    ]);
  }

  /** Pins files or a folder from this PC to the globe (the PC's own file picker), with tags. */
  function openAddFile(anchor) {
    const suggest = h('div', { class: 'picker-suggest' });
    const tags = tagField(startingTags(), (picked) => suggest.replaceChildren(...S.tags.slice(0, 14).map((t) => h('button', {
      class: `tag-pick${picked.some((x) => x.toLowerCase() === t.name.toLowerCase()) ? ' on' : ''}`, css: { '--t': t.color }, onclick: () => tags.toggle(t.name),
    }, `#${t.name}`))));
    const pick = async (folders) => {
      const picked = tags.get();
      try {
        const pins = await onyx.pickFiles(folders, picked);
        if (!pins.length) return; // the picker was closed
        afterFilesAdded(pins, picked);
        closePopover();
      } catch (err) {
        toast(err.message, 'error');
      }
    };
    showPopover(anchor, [
      h('b', null, 'Add from this PC'),
      h('div', { class: 'row' }, icon('tag'), tags.el),
      S.tags.length > 0 && suggest,
      h('p', { class: 'pop-meta' }, 'Or drag files and folders from File Explorer or the desktop straight onto the globe: drop them on a tag\'s cluster to tag them.'),
      h('div', { class: 'pop-actions' },
        h('button', { class: 'btn ghost', onclick: () => closePopover() }, 'Cancel'),
        h('div', { class: 'grow' }),
        h('button', { class: 'btn', onclick: () => pick(true) }, 'Choose a folder…'),
        h('button', { class: 'btn primary', onclick: () => pick(false) }, 'Choose files…')),
    ]);
  }

  function afterFilesAdded(pins, picked) {
    const ids = new Set(pins.map((p) => p.id));
    graph.lib.pins = [...graph.lib.pins.filter((p) => !ids.has(p.id)), ...pins];
    if (!graph.show.local) { graph.show.local = true; renderGraphBar(); }
    const what = pins.length === 1 ? `"${pins[0].title}"` : `${pins.length} items`;
    toast(`Added ${what} to the globe${picked.length ? ` with ${picked.map((t) => `#${t}`).join(' ')}` : ''}`);
    loadGraph();
    if (picked.length) reloadTags();
  }

  /** Pins any web link to the globe, with a name, tags and notes. */
  function openAddLink(anchor) {
    const url = h('input', { type: 'url', class: 'pop-title', placeholder: 'Paste a link…  https://', spellcheck: false, autocomplete: 'off' });
    const name = h('input', { type: 'text', placeholder: 'Name (optional: the site\'s name is used)', spellcheck: false });
    const suggest = h('div', { class: 'picker-suggest' });
    const tags = tagField(startingTags(), (picked) => suggest.replaceChildren(...S.tags.slice(0, 14).map((t) => h('button', {
      class: `tag-pick${picked.some((x) => x.toLowerCase() === t.name.toLowerCase()) ? ' on' : ''}`, css: { '--t': t.color }, onclick: () => tags.toggle(t.name),
    }, `#${t.name}`))));
    const notes = notesField('', 'Notes (optional)');
    let busy = false;
    const add = async () => {
      if (busy) return;
      if (!url.value.trim()) { url.focus(); return; }
      busy = true;
      const picked = tags.get();
      try {
        const pin = await onyx.addPin({ source: 'web', url: url.value.trim(), title: name.value.trim(), tags: picked, notes: cleanNote(notes.value) });
        graph.lib.pins = [...graph.lib.pins.filter((p) => p.id !== pin.id), pin];
        if (!graph.show.web) { graph.show.web = true; renderGraphBar(); }
        toast(`Added "${pin.title}"${picked.length ? ` with ${picked.map((t) => `#${t}`).join(' ')}` : ''}`);
        closePopover();
        loadGraph();
        if (picked.length) reloadTags();
      } catch (err) {
        busy = false;
        toast(err.message, 'error');
      }
    };
    url.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); name.focus(); } });
    name.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } });
    showPopover(anchor, [
      url,
      h('div', { class: 'row' }, icon('link'), name),
      h('div', { class: 'row' }, icon('tag'), tags.el),
      S.tags.length > 0 && suggest,
      h('div', { class: 'row top' }, icon('note'), notes),
      h('div', { class: 'pop-actions' }, h('div', { class: 'grow' }),
        h('button', { class: 'btn ghost', onclick: () => closePopover() }, 'Cancel'),
        h('button', { class: 'btn primary', onclick: add }, 'Add to globe')),
    ]);
    if (!MOBILE) url.focus();
  }

  /** Search Notion or Drive and pin results to the globe. */
  function openPicker(source, anchor) {
    const label = SOURCES[source].label;
    const input = h('input', { type: 'text', class: 'pop-title', placeholder: `Search ${label}…`, spellcheck: false, autocomplete: 'off' });
    const list = h('div', { class: 'picker-list' }, h('p', { class: 'pop-meta' }, 'Loading…'));
    const pinned = () => new Set(graph.lib.pins.map((p) => p.id));
    let seq = 0;
    let timer = null;

    const render = (results) => {
      const on = pinned();
      if (!results.length) {
        list.replaceChildren(h('p', { class: 'pop-meta' }, source === 'notion'
          ? 'Nothing found. Notion only shows Onyx the pages you share with it: in Notion, open a page, then ••• → Connections → add your integration.'
          : 'Nothing found.'));
        return;
      }
      list.replaceChildren(...results.map((r) => {
        const id = `${r.source}/${r.ref}`;
        const add = h('button', { class: `btn ${on.has(id) ? '' : 'primary'}`, disabled: on.has(id) }, on.has(id) ? 'On globe' : 'Add');
        const row = h('div', { class: 'picker-row' },
          h('span', { class: 'picker-icon' }, r.icon || (r.source === 'drive' ? '▤' : '◧')),
          h('div', { class: 'picker-text' }, h('b', null, r.title),
            h('small', null, [KIND_LABEL[r.kind], r.account, r.edited && new Date(r.edited).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })].filter(Boolean).join('  ·  '))),
          add);
        const pin = async (tags, btn) => {
          btn.disabled = true;
          try {
            const saved = await onyx.addPin({ ...r, tags });
            graph.lib.pins = [...graph.lib.pins.filter((p) => p.id !== saved.id), saved];
            closeAsk();
            add.textContent = 'On globe';
            add.classList.remove('primary');
            add.disabled = true;
            toast(tags.length ? `Added with ${tags.map((t) => `#${t}`).join(' ')}` : `Added to ${label}`);
            loadGraph();
            if (tags.length) reloadTags();
          } catch (err) {
            btn.disabled = false;
            toast(err.message, 'error');
          }
        };
        // Add first asks which tags (if any) it should carry: tags place it in clusters on the globe.
        add.onclick = () => {
          if (row.nextElementSibling?.classList.contains('picker-ask')) return closeAsk();
          closeAsk();
          const suggest = h('div', { class: 'picker-suggest' });
          const refresh = (picked) => suggest.replaceChildren(...S.tags.slice(0, 14).map((t) => {
            const isOn = picked.some((x) => x.toLowerCase() === t.name.toLowerCase());
            return h('button', { class: `tag-pick${isOn ? ' on' : ''}`, css: { '--t': t.color }, onclick: () => field.toggle(t.name) }, `#${t.name}`);
          }));
          const field = tagField(startingTags(), refresh);
          const addTagged = h('button', { class: 'btn primary', onclick: (e) => pin(field.get(), e.currentTarget) }, 'Add');
          const ask = h('div', { class: 'picker-ask' },
            h('div', { class: 'picker-ask-q' }, icon('tag'), h('span', null, 'Add a tag?'), h('small', null, 'optional: tags group it on the globe')),
            field.el,
            S.tags.length > 0 && suggest,
            h('div', { class: 'picker-ask-actions' },
              h('button', { class: 'btn ghost', onclick: (e) => pin([], e.currentTarget) }, 'No tag'),
              h('div', { class: 'grow' }),
              h('button', { class: 'btn ghost', onclick: closeAsk }, 'Cancel'),
              addTagged));
          // Enter in an empty tag box adds the item (Enter after typing a tag just adds the tag).
          field.input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.defaultPrevented && !field.input.value.trim()) { e.preventDefault(); addTagged.click(); } });
          row.classList.add('asking');
          row.after(ask);
          ask.scrollIntoView({ block: 'nearest' });
          if (!MOBILE) field.input.focus();
        };
        return row;
      }));
    };
    function closeAsk() {
      list.querySelector('.picker-ask')?.remove();
      list.querySelector('.picker-row.asking')?.classList.remove('asking');
    }

    const run = async () => {
      const mine = ++seq;
      try {
        const results = source === 'notion' ? await onyx.searchNotion(input.value) : await onyx.searchDrive(input.value);
        if (mine === seq) render(results);
      } catch (err) {
        if (mine !== seq) return;
        list.replaceChildren(h('p', { class: 'pop-meta problem' }, err.message),
          !onyx.isPhone && h('button', { class: 'btn', onclick: () => openSettings(source === 'notion' ? 'connections' : 'calendars') }, 'Open settings'));
      }
    };
    input.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(run, 300); });
    showPopover(anchor, [
      input,
      list,
      h('p', { class: 'pop-meta' }, 'Click Add on an item to choose its tags, or add it without one.'),
      h('div', { class: 'pop-actions' }, h('div', { class: 'grow' }), h('button', { class: 'btn ghost', onclick: () => closePopover() }, 'Done')),
    ], null, { wide: true });
    if (!MOBILE) input.focus();
    run();
  }

  /** Tells the globe how much of the canvas the toolbar (top) and the footer (bottom) cover. */
  function fitGlobe() {
    if (!graph.view || !graph.on) return;
    const canvas = $('#graph-canvas').getBoundingClientRect();
    const bar = $('#graph-bar').getBoundingClientRect();
    const foot = $('#graph-foot')?.getBoundingClientRect();
    const top = bar.height ? bar.bottom - canvas.top + 8 : 0;
    const bottom = foot?.height ? canvas.bottom - foot.top + 8 : 0;
    graph.view.setInsets(top, bottom);
  }

  function renderGraphBar() {
    const seg = (options, current, onPick) => h('div', { class: 'segmented' },
      options.map(([value, label]) => h('button', { class: value === current ? 'on' : '', onclick: () => onPick(value) }, label)));
    const from = h('input', { type: 'date', value: graph.from, onchange: () => { graph.from = from.value; loadGraph(); } });
    const to = h('input', { type: 'date', value: graph.to, onchange: () => { graph.to = to.value; loadGraph(); } });
    const chip = (key, label, title) => h('button', {
      class: `chip-toggle ${graph.show[key] ? 'on' : ''}`, title,
      onclick: () => { graph.show[key] = !graph.show[key]; renderGraphBar(); loadGraph(); },
    }, label);
    const addBtn = (label, fn) => h('button', { class: 'btn add-btn', onclick: (e) => fn(e.currentTarget.getBoundingClientRect()) }, icon('plus'), label);
    graph.barOpen ??= readBarOpen();
    const open = graph.barOpen;
    const toggle = h('button', {
      class: `icon-btn bar-toggle ${open ? 'open' : ''}`, title: open ? 'Fewer options' : 'More options: clusters, what to show, and adding items',
      'aria-expanded': String(open), onclick: () => { graph.barOpen = !open; saveBarOpen(); renderGraphBar(); },
    }, icon('down'));
    $('#graph-bar').classList.toggle('folded', !open);
    $('#graph-bar').replaceChildren(h('div', { class: 'bar-row' },
      seg([['day', 'Day'], ['week', 'Week'], ['month', 'Month'], ['range', 'Range']], graph.kind, (k) => {
        if (k === 'range' && graph.kind !== 'range') {
          const [s, e] = graphRange();
          graph.from = ymd(s);
          graph.to = ymd(addDays(e, -1));
        } else if (k !== 'range' && graph.kind === 'range') {
          graph.anchor = fromYmd(graph.from);
        }
        graph.kind = k;
        renderGraphBar();
        loadGraph();
      }),
      graph.kind === 'range' && h('span', { class: 'range-pick' }, from, h('span', { class: 'dash' }, 'to'), to),
      // The arrow sits by the period picker; on the phone, at the end of that line.
      MOBILE && h('div', { class: 'bar-spacer' }), toggle, MOBILE && open && h('div', { class: 'bar-break' }),
      open && [
        h('span', { class: 'bar-label' }, 'Cluster by'),
        seg([['tags', 'Tags'], ['calendars', 'Sources'], ['days', 'Days']], graph.groupBy, (g) => { graph.groupBy = g; renderGraphBar(); loadGraph(); }),
        h('span', { class: 'bar-label' }, 'Show'),
        chip('tasks', 'Tasks', 'Tasks that have no date'),
        chip('goals', 'Goals', 'Long-term goals: one node each, standing for all of its steps'),
        chip('notes', 'Notes', 'Notes written in Onyx'),
        chip('notion', 'Notion', 'Notion pages pinned to the globe'),
        chip('drive', 'Drive', 'Google Drive files pinned to the globe'),
        chip('web', 'Links', 'Web links pinned to the globe'),
        chip('local', 'Files', 'Files and folders from this PC pinned to the globe'),
        h('div', { class: 'grow' }),
        addBtn('Note', (r) => openNote(null, r)),
        addBtn('Notion', (r) => openPicker('notion', r)),
        addBtn('Drive', (r) => openPicker('drive', r)),
        addBtn('Link', (r) => openAddLink(r)),
        onyx.pickFiles && addBtn('File', (r) => openAddFile(r))]));
  }

  function openGraph() {
    closePopover();
    closeDrawers();
    if (!graph.on) {
      const v = calendar.view.type;
      graph.kind = v === 'timeGridDay' ? 'day' : v === 'dayGridMonth' ? 'month' : 'week';
      graph.anchor = calendar.getDate();
      const [s, e] = graphRange();
      graph.from = ymd(s);
      graph.to = ymd(addDays(e, -1));
    }
    graph.on = true;
    $('#graph').hidden = false;
    if (!graph.view) {
      graph.view = OnyxGraph.create($('#graph-canvas'), { onPick: pickFromGraph, onMove: moveOnGlobe });
      // The globe centres between the toolbar and the footer, and follows them as they change.
      new ResizeObserver(fitGlobe).observe($('#graph-bar'));
      new ResizeObserver(fitGlobe).observe($('#graph'));
    }
    for (const b of document.querySelectorAll('[data-view]')) b.classList.remove('on');
    $('#globe-toggle').classList.add('on');
    $('#globe-toggle').title = 'Back to the calendar (G)';
    renderGraphBar();
    loadGraph();
  }

  function closeGraph() {
    graph.on = false;
    $('#graph').hidden = true;
    $('#globe-toggle').classList.remove('on');
    $('#globe-toggle').title = 'Globe view (G)';
    $('#range').textContent = calendar.view.title;
    for (const b of document.querySelectorAll('[data-view]')) b.classList.toggle('on', b.dataset.view === calendar.view.type);
    calendar.updateSize();
  }

  /** The globe button: flips between the globe and the calendar. */
  function toggleGlobe() {
    if (graph.on) closeGraph(); else openGraph();
  }

  function pickView(view) {
    if (view === 'graph') return toggleGlobe();
    if (graph.on) closeGraph();
    calendar.changeView(view);
    for (const b of document.querySelectorAll('[data-view]')) b.classList.toggle('on', b.dataset.view === view);
    closeDrawers();
  }

  // ------------------------------------------------------------ updates
  // The desktop app updates itself from GitHub releases (updater.js); the phone
  // checks for a newer APK and hands the download to the browser (remote.js).

  const dismissedUpdates = new Set(); // versions waved away with "Later" this session

  function closeUpdateDialog() { $('#update-dialog').hidden = true; $('#update-dialog').replaceChildren(); }

  function showUpdateDialog(u) {
    const box = $('#update-dialog');
    const later = () => { dismissedUpdates.add(u.version); closeUpdateDialog(); };
    let body;
    if (u.status === 'available') {
      body = [
        h('div', { class: 'upd-icon' }, icon('update')),
        h('h3', null, `Onyx ${u.version} is available`),
        h('p', { class: 'upd-sub' }, u.current ? `You have ${u.current}.` : 'A new version is ready to install.'),
        u.notes && h('div', { class: 'upd-notes' }, u.notes.replace(/^#+\s*/gm, '').replace(/\*\*/g, '').trim()),
        onyx.isPhone && h('p', { class: 'upd-sub' }, 'Onyx downloads the update itself; Android then asks you to tap Install. Your connection to the PC is kept.'),
        h('div', { class: 'pop-actions' },
          h('div', { class: 'grow' }),
          h('button', { class: 'btn ghost', onclick: later }, 'Later'),
          h('button', { class: 'btn primary', onclick: () => installUpdate() }, 'Update now')),
      ];
    } else if (u.status === 'downloading') {
      body = [
        h('div', { class: 'upd-icon spin' }, icon('update')),
        h('h3', null, `Downloading Onyx ${u.version || ''}`),
        h('div', { class: 'upd-bar' }, h('i', { css: { width: `${u.percent || 0}%` } })),
        h('p', { class: 'upd-sub' }, `${u.percent || 0}%  ·  `),
      ];
    } else if (u.status === 'ready') {
      body = [h('div', { class: 'upd-icon spin' }, icon('update')), h('h3', null, 'Installing…'), h('p', { class: 'upd-sub' }, 'Onyx closes, updates and opens again in a few seconds.')];
    } else if (u.status === 'installing') {
      body = [
        h('div', { class: 'upd-icon' }, icon('update')),
        h('h3', null, `Install Onyx ${u.version || ''}`),
        h('p', { class: 'upd-sub' }, 'Android is asking to install the update: tap Install (or Update). Onyx restarts on the new version; your connection to the PC is kept.'),
        h('div', { class: 'pop-actions' }, h('div', { class: 'grow' }), h('button', { class: 'btn primary', onclick: closeUpdateDialog }, 'OK')),
      ];
    } else if (u.status === 'permission') {
      body = [
        h('div', { class: 'upd-icon' }, icon('update')),
        h('h3', null, 'Allow Onyx to install updates'),
        h('p', { class: 'upd-sub' }, 'Android opened a settings page: switch on "Allow from this source", come back, and tap Update now again. This is only needed once.'),
        h('div', { class: 'pop-actions' }, h('div', { class: 'grow' }),
          h('button', { class: 'btn ghost', onclick: closeUpdateDialog }, 'Later'),
          h('button', { class: 'btn primary', onclick: () => installUpdate() }, 'Update now')),
      ];
    } else if (u.status === 'handoff') {
      body = [
        h('div', { class: 'upd-icon' }, icon('update')),
        h('h3', null, 'Downloading in your browser'),
        h('p', { class: 'upd-sub' }, 'When it finishes, tap the download to install. The first time, Android asks you to allow installs from your browser.'),
        h('div', { class: 'pop-actions' }, h('div', { class: 'grow' }), h('button', { class: 'btn primary', onclick: closeUpdateDialog }, 'OK')),
      ];
    } else {
      return closeUpdateDialog();
    }
    box.replaceChildren(h('div', { class: 'upd-card' }, body));
    box.hidden = false;
  }

  /** The Update button (manual) and the background checks (automatic) end up here. */
  function onUpdateState(u, manual) {
    $('#update-btn').classList.toggle('has-update', u.status === 'available' || u.status === 'downloading');
    $('#update-btn').title = u.status === 'available' ? `Onyx ${u.version} is available` : 'Check for updates';
    if (['downloading', 'ready', 'installing', 'permission', 'handoff'].includes(u.status) && !$('#update-dialog').hidden) return showUpdateDialog(u);
    if (u.status === 'available' && (manual || !dismissedUpdates.has(u.version))) return showUpdateDialog(u);
    if (!manual) return;
    if (u.status === 'current') toast(`You're on the latest version${u.version ? ` (${u.version})` : ''}.`);
    else if (u.status === 'error' || u.status === 'dev') toast(u.error, 'warn');
  }

  async function checkForUpdate(manual) {
    if (!onyx.checkUpdate) return;
    const btn = $('#update-btn');
    btn.classList.add('spin');
    try {
      onUpdateState(await onyx.checkUpdate(), manual);
    } catch (err) {
      if (manual) toast(err.message, 'error');
    }
    btn.classList.remove('spin');
  }

  async function installUpdate() {
    try {
      const u = await onyx.installUpdate();
      if (u.status === 'error') { toast(u.error, 'error'); closeUpdateDialog(); }
      else showUpdateDialog(u);
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  // ------------------------------------------------------------ chrome and start-up

  function closeDrawers() {
    if (document.body.classList.contains('drawer-news')) setNewsOpen(false);
    document.body.classList.remove('drawer-left', 'drawer-right');
  }

  function newBlock() {
    if (graph.on) closeGraph();
    const now = new Date();
    const base = calendar.view.type === 'dayGridMonth' || (now >= calendar.view.currentStart && now < calendar.view.currentEnd) ? now : calendar.view.currentStart;
    const start = new Date(base.getFullYear(), base.getMonth(), base.getDate(), base === now ? now.getHours() + 1 : 9, 0);
    const r = $('#new-block').getBoundingClientRect();
    closeDrawers();
    openEditor({ start, end: new Date(start.getTime() + 3600000), allDay: false }, { left: r.left, right: r.right, top: r.bottom + 8, bottom: r.bottom + 8 });
  }

  async function refreshAll() {
    const btn = $('#refresh');
    btn.classList.add('spin');
    await act(() => onyx.refresh());
    if (taskTab === 'archived') await loadArchive();
    btn.classList.remove('spin');
  }

  const nav = (n) => {
    if (graph.on) return shiftGraph(n);
    if (n === 0) calendar.today(); else if (n < 0) calendar.prev(); else calendar.next();
  };

  function buildChrome() {
    $('#prev').append(icon('left'));
    $('#next').append(icon('right'));
    $('#refresh').append(icon('refresh'));
    $('#toggle-tasks').append(icon('tasks'));
    $('#open-settings').append(icon('sliders'));
    $('#menu').append(icon('menu'));
    $('#fab').append(icon('plus'));
    $('#new-block').append(icon('plus'), 'New block');
    $('#add-calendar').append(icon('plus'), onyx.isPhone ? 'Settings' : 'Add calendar');
    $('#globe-toggle').append(icon('globe'));
    $('#globe-toggle').onclick = toggleGlobe;
    watchGlobeDrops();
    $('#undo-btn').append(icon('undo'));
    $('#undo-btn').onclick = undoLast;
    $('#archive-prev').append(icon('left'));
    $('#archive-next').append(icon('right'));
    $('#update-btn').append(icon('update'));
    $('#update-btn').onclick = () => checkForUpdate(true);
    $('#update-btn').hidden = !onyx.checkUpdate;
    $('#graph-reset').append(icon('target'));
    $('#graph-reset').onclick = () => graph.view?.resetCamera();
    $('#today').onclick = () => nav(0);
    $('#prev').onclick = () => nav(-1);
    $('#next').onclick = () => nav(1);
    $('#range').onclick = () => { if (MOBILE) nav(0); };
    $('#refresh').onclick = refreshAll;
    $('#new-block').onclick = newBlock;
    $('#fab').onclick = newBlock;
    $('#add-calendar').onclick = () => openSettings(onyx.isPhone ? 'connection' : 'calendars');
    $('#open-settings').onclick = () => openSettings();
    $('#menu').onclick = () => document.body.classList.toggle('drawer-left');
    $('#scrim').onclick = closeDrawers;
    $('#toggle-tasks').onclick = () => {
      if (MOBILE) document.body.classList.toggle('drawer-right');
      else saveSettings({ tasksPanel: !S.settings.tasksPanel });
    };
    for (const b of document.querySelectorAll('[data-view]')) b.onclick = () => pickView(b.dataset.view);

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        window.onyxBack();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'z' && !e.target.closest?.('input, textarea, select') && undoStack.length) {
        e.preventDefault();
        undoLast();
        return;
      }
      if (e.target.closest('input, textarea, select') || e.ctrlKey || e.altKey || e.metaKey || !$('#modal').hidden || !$('#popover').hidden) return;
      const views = { d: 'timeGridDay', w: 'timeGridWeek', m: 'dayGridMonth', a: 'listWeek', g: 'graph' };
      const key = e.key.toLowerCase();
      if (views[key]) pickView(views[key]);
      else if (key === 't') nav(0);
      else if (key === 'n') { e.preventDefault(); newBlock(); }
      else if (key === 'r') refreshAll();
      else if (e.key === 'ArrowLeft') nav(-1);
      else if (e.key === 'ArrowRight') nav(1);
    });
  }

  // Escape on the desktop, the back button on Android: close the top-most thing.
  window.onyxBack = () => {
    if (!$('#update-dialog').hidden) { if (!$('.upd-bar') && !$('.upd-icon.spin')) closeUpdateDialog(); }
    else if (!$('#popover').hidden) closePopover();
    else if (!$('#modal').hidden) closeSettings();
    else if (['drawer-left', 'drawer-right', 'drawer-news'].some((c) => document.body.classList.contains(c))) closeDrawers();
    else if (graph.on) closeGraph();
    else return false;
    return true;
  };

  /** Opens the phone's QR scanner; a scanned pairing code connects and restarts the app. */
  async function scanToPair(button) {
    const label = [...button.childNodes];
    button.disabled = true;
    button.replaceChildren('Scanning…');
    try {
      if (await onyx.scan()) { location.reload(); return; }
    } catch (err) {
      toast(err.message, 'error');
    }
    button.disabled = false;
    button.replaceChildren(...label);
  }

  // Android, before it is paired with a PC (or when the PC can't be reached at all).
  function showConnect(problem) {
    const address = h('input', { type: 'text', placeholder: 'PC address, e.g. 192.168.1.20', spellcheck: false, autocomplete: 'off', inputMode: 'url' });
    const token = h('input', { type: 'text', placeholder: 'Token', spellcheck: false, autocomplete: 'off' });
    const go = h('button', { class: 'btn primary wide', type: 'submit' }, 'Connect');
    const form = h('form', { class: 'connect-form', onsubmit: async (e) => {
      e.preventDefault();
      go.disabled = true;
      go.textContent = 'Connecting…';
      try {
        const value = address.value.trim();
        if (value.startsWith('onyx://')) await onyx.pairLink(value);
        else await onyx.pair({ addresses: value.split(/[\s,]+/), token: token.value });
        location.reload();
      } catch (err) {
        toast(err.message, 'error');
        go.disabled = false;
        go.textContent = 'Connect';
      }
    } }, address, token, go);
    const scan = h('button', { class: 'btn primary wide scan-btn', onclick: () => scanToPair(scan) }, icon('qr'), 'Scan QR code');
    $('#connect').replaceChildren(h('div', { class: 'connect-card' },
      h('div', { class: 'brand big' }, h('span', { class: 'mark' }), 'Onyx'),
      h('h2', null, onyx.paired() ? 'Can\'t reach your PC' : 'Connect to your PC'),
      problem && h('p', { class: 'problem' }, problem),
      h('ol', null,
        h('li', null, 'On your PC, open Onyx Calendar, then Settings → Phone.'),
        h('li', null, onyx.canScan ? 'Tap Scan QR code below and point this phone at the code.' : 'Enter the address and token shown there.')),
      onyx.canScan && scan,
      h('p', { class: 'or' }, onyx.canScan ? 'Or type it in instead:' : 'Address and token (or paste the pairing link into the address box):'),
      form,
      onyx.paired() && h('button', { class: 'btn ghost wide', onclick: () => location.reload() }, 'Try again')));
    $('#connect').hidden = false;
  }

  async function init() {
    document.body.classList.toggle('mobile', MOBILE);
    document.body.classList.toggle('phone', !!onyx.isPhone);
    window.addEventListener('onyx:toast', (e) => toast(e.detail, 'error'));
    if (onyx.isPhone && !onyx.paired()) return showConnect();
    try {
      S = await onyx.state();
    } catch (err) {
      if (onyx.isPhone) return showConnect(err.message);
      throw err;
    }
    buildChrome();
    $('#layout').classList.toggle('no-tasks', !S.settings.tasksPanel && !MOBILE);
    $('#toggle-tasks').classList.toggle('on', S.settings.tasksPanel && !MOBILE);
    buildCalendar();
    buildNews();
    refreshPomodoros();
    setInterval(() => { tickPomodoro(); tickNext(); tickPopups(); }, 1000);
    setInterval(refreshPomodoros, 60000);

    // A tap on a home-screen widget (phone): open the globe, or the calendar on that day.
    const openFromWidget = (d) => {
      if (!d) return;
      window.onyxPendingOpen = null;
      closePopover();
      closeDrawers();
      if (d.view === 'globe') {
        if (!graph.on) toggleGlobe();
      } else {
        if (graph.on) closeGraph();
        if (d.date) calendar.gotoDate(d.date);
      }
    };
    window.addEventListener('onyx:open', (e) => openFromWidget(e.detail));
    openFromWidget(window.onyxPendingOpen);
    renderSidebar();
    loadTasks();

    // Something changed outside the window: an agent wrote through MCP, the
    // calendar lists finished loading, or (on the phone) the regular check.
    // A newer version found by the background check pops up; download progress updates the popup.
    if (onyx.onUpdate) {
      onyx.onUpdate((u) => onUpdateState(u, false));
      onyx.updateState().then((u) => { if (u?.status === 'available') onUpdateState(u, false); }).catch(() => {});
    }
    onyx.onChanged(async () => {
      try {
        applyState(await onyx.state());
      } catch { /* offline: keep what is shown */ }
      refetch();
      loadTasks();
    });
    if (onyx.onOnline) {
      onyx.onOnline((ok) => {
        toast(ok ? 'Connected to your PC again.' : 'Your PC is out of reach. Showing the last sync.', ok ? '' : 'warn');
        if (ok) { refetch(true); loadTasks(true); }
      });
    }
    setInterval(() => { refetch(true); loadTasks(true); }, 5 * 60000);
    window.addEventListener('resize', () => { if (!MOBILE) closePopover(); });
  }

  init().catch((err) => toast(err.message, 'error'));
})();
