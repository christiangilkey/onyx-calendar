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
    stove: '<rect x="3.5" y="9" width="17" height="11.5" rx="2"/><circle cx="8.5" cy="14.5" r="2.2"/><circle cx="15.5" cy="14.5" r="2.2"/><path d="M8 3.5c-.8 1 .8 1.8 0 3M12 3c-.8 1 .8 1.8 0 3M16 3.5c-.8 1 .8 1.8 0 3"/>',
    repeat: '<path d="M4.5 10.5a6.5 6.5 0 0 1 11.3-3.8L18 9"/><path d="M18 4.5V9h-4.5"/><path d="M19.5 13.5a6.5 6.5 0 0 1-11.3 3.8L6 15"/><path d="M6 19.5V15h4.5"/>',
    news: '<rect x="3.5" y="4.5" width="17" height="12.5" rx="2.5"/><path d="M8.5 20.5h7M12 17v3.5"/><path d="M10.2 8.3l4.3 2.45-4.3 2.45z"/>',
    play: '<path d="M7 4.8v14.4L19 12z"/>',
    next: '<path d="M6 5.5v13l9-6.5z"/><path d="M18 5.5v13"/>',
    archive: '<rect x="3.5" y="4.5" width="17" height="4.5" rx="1.5"/><path d="M5.5 9v9.5a1.5 1.5 0 0 0 1.5 1.5h10a1.5 1.5 0 0 0 1.5-1.5V9M10 13h4"/>',
    clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
    bell: '<path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 1.5h-15z"/><path d="M10 20.5a2 2 0 0 0 4 0"/>',
    hammer: '<path d="M13.6 3.6l6.8 6.8-2.6 2.6-6.8-6.8z"/><path d="M12.3 8.8 4.1 17a1.8 1.8 0 0 0 2.6 2.6l8.2-8.2"/>',
    leave: '<path d="M10 4h8v16h-8"/><path d="M4 12h9M10 9l3 3-3 3"/>',
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

  /**
   * On the phone: the alarms coming up, handed to Android's alarm clock, which wakes the phone
   * and rings until a button is pressed. Each start ("Alarm as things start"), and the call time
   * of each entry whose escalation is Alarm.
   */
  let handedAlarms = '';
  function handAlarms(items) {
    if (!onyx.isPhone || !onyx.setAlarms) return;
    const now = Date.now();
    const list = [];
    for (const e of items) {
      const start = new Date(e.start).getTime();
      const base = { id: e.id, title: e.title, start, kind: e.kind };
      if (start > now) list.push({ ...base, at: start, why: 'start' });
      if (e.callMode === 'alarm' && !e.callAck) {
        for (const a of e.piAlerts || []) { const at = new Date(a.at).getTime(); if (at > now) list.push({ ...base, at, why: 'alarm' }); }
      }
    }
    list.sort((a, b) => a.at - b.at);
    const key = JSON.stringify(list.slice(0, 40));
    if (key === handedAlarms) return;
    handedAlarms = key;
    onyx.setAlarms(list.slice(0, 40)).catch(() => { handedAlarms = ''; });
  }

  async function refreshPomodoros() {
    if (!S) return;
    // One read at a time; a change made during a read is read again straight after (it was
    // dropped before, so a task just made could miss the bar).
    if (pomoRun.loading) { pomoRun.again = true; return; }
    pomoRun.loading = true;
    pomoRun.again = false;
    const now = new Date();
    const from = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1); // a block may have started yesterday
    try {
      // A week ahead, so late in the evening the next thing is still found.
      const { events } = await onyx.events(from.toISOString(), addDays(from, 9).toISOString());
      pomoRun.blocks = events.filter((e) => e.pomodoro && !e.allDay && e.end && visible(e.calendarId));
      // The next-thing bar uses the same read: every timed entry and task still to come.
      nextRun.items = events.filter((e) => !e.allDay && e.end && !e.done && (e.kind === 'event' || (e.kind === 'task' && !e.mirror)) && visible(e.calendarId));
      // And the open tasks due today with no time: shown when nothing timed is coming today.
      const today = ymd(now);
      nextRun.today = events.filter((e) => e.kind === 'task' && e.allDay && !e.done && !e.mirror && visible(e.calendarId) && String(e.start).slice(0, 10) === today);
      nextRun.loaded = true;
      handAlarms(nextRun.items);
    } catch { /* keep the last list */ }
    pomoRun.loading = false;
    tickPomodoro();
    tickNext();
    if (pomoRun.again) refreshPomodoros();
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

  // ---- the due screen (the phone): when something is about to start or has just started, it
  // takes over the app: what it is, a countdown that grows more urgent, and what to do.
  const due = { el: null, key: '', hidden: new Map() }; // key -> hidden until (ms)
  const DUE_AHEAD = 10 * 60000, DUE_AFTER = 15 * 60000;

  function tickDue() {
    if (!MOBILE || !nextRun.loaded) return;
    const now = Date.now();
    // The one that matters most: about to start (soonest first), else just started.
    const list = nextRun.items.map((e) => ({ e, s: new Date(e.start).getTime(), f: new Date(e.end).getTime() }))
      .filter((x) => !x.e.done && !x.e.callAck && x.s - now <= DUE_AHEAD && now - x.s <= DUE_AFTER && x.f > now)
      .filter((x) => (due.hidden.get(`${x.e.id}|${x.e.start}`) || 0) < now)
      .sort((a, b) => Math.abs(a.s - now) - Math.abs(b.s - now));
    const x = list[0];
    if (!x) {
      if (due.el) { due.el.remove(); due.el = null; due.key = ''; document.body.classList.remove('due-on'); }
      return;
    }
    const key = `${x.e.id}|${x.e.start}`;
    if (!due.el || due.key !== key) {
      due.el?.remove();
      due.key = key;
      const hide = (ms) => { due.hidden.set(key, ms === Infinity ? Infinity : Date.now() + ms); tickDue(); };
      const isTask = x.e.kind === 'task';
      const parts = {
        label: h('div', { class: 'due-label' }),
        title: h('div', { class: 'due-title' }, x.e.title),
        count: h('div', { class: 'due-count' }),
        sub: h('div', { class: 'due-sub' }),
        pomo: h('div', { class: 'due-pomo' }),
      };
      due.el = h('div', { class: 'due-screen', role: 'alertdialog', 'aria-live': 'assertive' },
        h('div', { class: 'due-ring' }, h('div', { class: 'due-ring-in' }, parts.count)),
        parts.label, parts.title, parts.sub, parts.pomo,
        h('div', { class: 'due-actions' },
          h('button', { class: 'btn primary', onclick: () => {
            hide(Infinity);
            if (isTask) completeTask(tasks.find((t) => t.id === x.e.id) || { id: x.e.id, label: x.e.title });
            else if (x.e.piCall) onyx.ackCall?.(x.e.id).then(() => refreshPomodoros()).catch(() => {});
          } }, isTask ? 'Done' : 'Leaving now'),
          h('button', { class: 'btn', onclick: () => hide(5 * 60000) }, 'Snooze 5 min'),
          h('button', { class: 'btn ghost', onclick: () => hide(Infinity) }, 'Dismiss'),
          h('button', { class: 'btn ghost', onclick: () => { hide(Infinity); openNextItem(x.e, { left: 20, right: 20, top: 80, bottom: 80, width: 0, height: 0 }); } }, 'Open')));
      due.parts = parts;
      document.body.append(due.el);
      document.body.classList.add('due-on');
    }
    const p = due.parts;
    const toStart = x.s - now;
    const started = toStart <= 0;
    const leaveAt = x.e.leaveBy ? x.s - x.e.leaveBy * 60000 : null;
    const left = started ? x.f - now : toStart;
    // Calm (green) over 5 minutes away, amber within 5, red from a minute before to after it starts.
    const tone = started || toStart <= 60000 || (leaveAt && leaveAt <= now) ? 'urgent' : toStart <= 5 * 60000 ? 'near' : 'calm';
    due.el.dataset.tone = tone;
    p.label.textContent = started ? (now - x.s < 60000 ? 'Starting now' : 'On now') : 'Coming up';
    p.count.textContent = countdown(left);
    p.sub.textContent = started
      ? `Started ${fmtTime(new Date(x.s))} · ends ${fmtTime(new Date(x.f))}`
      : `At ${fmtTime(new Date(x.s))}${leaveAt ? (leaveAt > now ? ` · leave by ${fmtTime(new Date(leaveAt))}` : ' · time to leave') : ''}`;
    // The ring fills toward the start, then drains through the block.
    const fill = started ? (x.f - now) / Math.max(1, x.f - x.s) : 1 - Math.min(1, toStart / DUE_AHEAD);
    due.el.style.setProperty('--fill', `${(fill * 100).toFixed(1)}%`);
    const ph = started && x.e.pomodoro ? pomodoroPhase(x.e, new Date(now)) : null;
    p.pomo.hidden = !ph;
    if (ph) {
      p.pomo.className = `due-pomo ${ph.kind}`;
      p.pomo.textContent = `${ph.kind === 'work' ? 'Work' : 'Break'} · ${countdown(ph.left)} left · round ${ph.round} of ${ph.rounds}`;
    }
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
      // A pill: [icon] NOW: name | ● 09m 22s, with a gauge that runs down.
      const pillParts = (cls) => {
        const q = {
          el: h('button', { class: `next-pill ${cls}` }),
          kindIcon: h('span', { class: 'next-kind' }),
          kind: h('b', { class: 'next-kind-label' }),
          what: h('span', { class: 'what' }),
          leave: h('span', { class: 'next-leave' }),
          live: h('span', { class: 'next-live', 'aria-hidden': 'true' }),
          count: h('span', { class: 'next-count' }),
          gauge: h('span', { class: 'next-gauge', 'aria-hidden': 'true' }, h('i')),
        };
        q.el.append(q.kindIcon, q.kind, q.what, q.leave, h('span', { class: 'next-sep', 'aria-hidden': 'true' }), q.live, q.count, q.gauge);
        q.el.addEventListener('click', (ev) => q.item && openNextItem(q.item, ev.currentTarget.getBoundingClientRect()));
        return q;
      };
      const parts = {
        label: h('button', { class: 'next-label' }),
        // The focal point: what is on now (or, when nothing is, what comes next), and beside
        // it, smaller, what comes after.
        main: pillParts('main'),
        sub: pillParts('sub'),
        tools: h('div', { class: 'next-tools' }),
        sound: h('button', { class: 'next-sound', onclick: () => {
          try { localStorage.setItem('onyx.next-sound', nextSoundOn() ? '0' : '1'); } catch { /* this visit only */ }
          toast(nextSoundOn() ? 'Chimes on: 5 minutes before, and as it starts' : 'Chimes off');
          if (nextSoundOn()) warnTone();
          tickNext();
        } }),
      };
      bar.replaceChildren(h('div', { class: 'next-row' },
        h('div', { class: 'next-side' }, parts.label),
        h('div', { class: 'next-center' }, parts.main.el, parts.sub.el),
        h('div', { class: 'next-side end' }, parts.tools, parts.sound)));
      nextRun.parts = parts;
    }
    placeStatus(!MOBILE);
    const p = nextRun.parts;
    let tone = 'calm';
    p.main.el.classList.remove('pomo-on'); // set again below while a pomodoro block is on

    // What comes next: its countdown, leave-by, and how urgent it is. The state: calm (green)
    // over 30 minutes, amber 10 to 30, escalate (red) under 10, counted to the leave-by time
    // when there is one (that is the real deadline). Its gauge runs down from when the wait
    // began (the last thing ending, or the current one starting); with nothing earlier, over the last hour.
    const showNext = (q, big) => {
      const left = next.s - now;
      const day = !sameDay(new Date(next.s), new Date()) ? ' tomorrow' : '';
      const leaveAt = next.e.leaveBy ? next.s - next.e.leaveBy * 60000 : null;
      const toGo = (leaveAt ?? next.s) - now;
      tone = toGo <= 10 * 60000 ? 'urgent' : toGo <= 30 * 60000 ? 'near' : 'calm';
      const since = Math.max(0, ...timed.filter((x) => x.f <= now).map((x) => x.f), current ? current.s : 0);
      const span = since ? next.s - since : NEXT_HORIZON_MIN * 60000;
      q.item = next.e;
      q.el.dataset.tone = tone;
      q.kindIcon.replaceChildren(icon(next.e.kind === 'task' ? 'check' : 'calendar'));
      q.kind.textContent = big && next.e.kind === 'task' ? 'Next task' : 'Next';
      q.what.textContent = next.e.title;
      q.leave.textContent = leaveAt ? (leaveAt > now ? `Leave by ${fmtTime(new Date(leaveAt))}` : 'Time to leave') : '';
      q.leave.hidden = !leaveAt;
      q.count.textContent = big ? countdown(left) : untilText(left, true);
      q.el.title = `${untilText(left)} until ${next.e.title} at ${fmtTime(new Date(next.s))}${day}${leaveAt ? `. Leave by ${fmtTime(new Date(leaveAt))}` : ''}. Click to open it`;
      q.el.style.setProperty('--left', `${(Math.max(0, Math.min(1, left / span)) * 100).toFixed(2)}%`);
      q.el.disabled = false;
      q.el.hidden = false;
      q.el.classList.remove('empty');
    };

    // Nothing timed left today: the open tasks due today (they have no time) are what is next.
    const todayList = (nextRun.today || []).filter((t) => !tasks.find((x) => x.id === t.id && x.done));
    const nextToday = next && sameDay(new Date(next.s), new Date());
    const showToday = (q) => {
      const t = todayList[0];
      q.item = t;
      q.el.dataset.tone = 'calm';
      q.kindIcon.replaceChildren(icon('check'));
      q.kind.textContent = 'To do today';
      q.what.textContent = t.title;
      q.leave.textContent = todayList.length > 1 ? `+${todayList.length - 1} more` : '';
      q.leave.hidden = todayList.length < 2;
      q.count.textContent = '';
      q.el.title = `Due today: ${todayList.map((x) => x.title).join(', ')}. Click to open it`;
      q.el.style.setProperty('--left', '0%');
      q.el.disabled = false;
      q.el.hidden = false;
      q.el.classList.remove('empty');
    };

    if (current) {
      // On now: the big pill, counting down what is left of it (amber in its last 5 minutes);
      // what comes next beside it, smaller.
      const left = current.f - now;
      const m = p.main;
      m.item = current.e;
      m.el.dataset.tone = left <= 5 * 60000 ? 'near' : 'calm';
      m.kindIcon.replaceChildren(icon(current.e.kind === 'task' ? 'check' : 'calendar'));
      m.kind.textContent = 'Now';
      m.what.textContent = current.e.title;
      m.leave.hidden = true;
      m.count.textContent = countdown(left);
      m.el.title = `${untilText(left)} left of ${current.e.title}, until ${fmtTime(new Date(current.f))}. Click to open it`;
      m.el.style.setProperty('--left', `${(Math.max(0, Math.min(1, left / (current.f - current.s))) * 100).toFixed(2)}%`);
      m.el.disabled = false;
      m.el.classList.remove('empty');
      // A pomodoro block: the pill is the timer, red for work and green for a break, counting down the chunk.
      const ph = current.e.pomodoro ? pomodoroPhase(current.e, new Date(now)) : null;
      m.el.classList.toggle('pomo-on', !!ph);
      if (ph) {
        m.el.dataset.tone = ph.kind === 'work' ? 'work' : 'rest';
        m.kindIcon.replaceChildren(icon('clock'));
        m.kind.textContent = ph.kind === 'work' ? 'Work' : 'Break';
        m.count.textContent = countdown(ph.left);
        m.leave.textContent = `round ${ph.round}/${ph.rounds}`;
        m.leave.hidden = false;
        m.el.style.setProperty('--left', `${(Math.max(0, Math.min(1, ph.left / (ph.length * 60000))) * 100).toFixed(2)}%`);
        m.el.title = `${current.e.title}: ${ph.kind === 'work' ? 'working' : 'on a break'}, ${untilText(ph.left)} left of this ${ph.kind === 'work' ? 'work' : 'break'} (round ${ph.round} of ${ph.rounds}). Ends ${fmtTime(new Date(current.f))}`;
      }
      if (next && (nextToday || !todayList.length)) showNext(p.sub, false);
      else if (todayList.length) showToday(p.sub);
      else p.sub.el.hidden = true;
      p.label.hidden = true;
    } else {
      // Nothing on: free time on the left, and what comes next as the big pill.
      p.label.hidden = false;
      p.label.replaceChildren(h('b', null, 'Now'), h('span', { class: 'what' }, 'Free time'));
      p.label.disabled = true;
      p.sub.el.hidden = true;
      if (next && (nextToday || !todayList.length)) showNext(p.main, true);
      else if (todayList.length) {
        // Tasks due today first; what is timed later (tomorrow) beside them, smaller.
        showToday(p.main);
        if (next) showNext(p.sub, false);
      } else {
        const m = p.main;
        m.item = null;
        m.el.dataset.tone = 'calm';
        m.kindIcon.replaceChildren(icon('calendar'));
        m.kind.textContent = 'Next';
        m.what.textContent = 'Nothing else timed';
        m.leave.hidden = true;
        m.count.textContent = '';
        m.el.title = '';
        m.el.disabled = true;
        m.el.classList.add('empty');
      }
    }
    drainTimers(timed.filter((x) => x.s <= now && x.f > now), now);
    const sound = nextSoundOn();
    p.sound.replaceChildren(icon(sound ? 'bell' : 'bell-off'));
    p.sound.title = sound ? 'Chimes on: 5 minutes before, and as it starts. Click to mute' : 'Chimes off. Click to turn them on';
    bar.className = tone;
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

  /**
   * A Time Timer on whatever is on now: a disc in the corner of its block that drains as the
   * time runs out, smoothly (no ticking or flashing).
   */
  function drainTimers(current, now) {
    const on = new Map(current.map((x) => [x.e.id, x]));
    for (const el of document.querySelectorAll('#calendar .fc-event[data-eid]')) {
      const x = on.get(el.dataset.eid);
      let pie = el.querySelector('.ev-timer');
      if (!x || el.classList.contains('fc-event-mirror') || !el.classList.contains('fc-timegrid-event')) { pie?.remove(); continue; }
      if (!pie) { pie = h('span', { class: 'ev-timer', 'aria-hidden': 'true' }); el.append(pie); }
      pie.style.setProperty('--timer-p', Math.max(0, Math.min(1, (x.f - now) / (x.f - x.s))).toFixed(4));
      el.title = `${untilText(x.f - now)} left`;
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
      calendar: e.calendarName || '', sound: nextSoundOn(), hour12: S.settings.hour12,
      leaveAt: e.leaveBy ? new Date(new Date(e.start).getTime() - e.leaveBy * 60000).toISOString() : '',
      steps: breakdownSteps(e), ...extra,
    };
  }

  /**
   * The 2-minute breakdown of getting going: the steps written in the entry's notes (a list),
   * or a short routine for leaving.
   */
  function breakdownSteps(e) {
    const listed = String(e.notes || '').split(/\r?\n/).map((l) => (l.match(/^\s*(?:[-*•]|\d+[.)])\s+(?:\[[ xX]?\]\s+)?(.+)$/) || [])[1]).filter(Boolean);
    if (listed.length >= 2) return listed.slice(0, 7);
    return ['Save what you are doing', 'Stand up and take a breath', 'Phone, keys, wallet', 'Shoes and jacket on', e.location ? `Head to ${e.location}` : 'Out the door'];
  }

  function showPopup(a) {
    if (onyx.alert && !onyx.isPhone) onyx.alert(a).catch(() => showAlertOverlay(a));
    else showAlertOverlay(a);
  }

  function popupAction(m) {
    const a = m?.alert;
    if (!a) return;
    if (m.action === 'leaving') {
      // The Pi makes no more calls about it (a critical one would have rung again).
      const e = nextRun.items.find((x) => x.id === a.id);
      if (e?.piCall) onyx.ackCall?.(a.id).then(() => refreshPomodoros()).catch(() => {});
      for (const s of [...popups.snoozed]) if (s.alert.id === a.id) popups.snoozed.splice(popups.snoozed.indexOf(s), 1);
      toast(`Off you go to "${a.title}". No more reminders about it.`);
    } else if (m.action === 'snooze') {
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
      // Blocks and events with a reminder on the ladder: the full-screen action card comes up as
      // the Pi reaches out (a call rings; a push chimes), at leave-by or the picked time.
      for (const e of nextRun.items) {
        if (e.kind !== 'event' || !e.piCall || e.callAck) continue;
        const start = new Date(e.start);
        if (e.piAlerts?.length) {
          for (const al of e.piAlerts) {
            const at = Date.parse(al.at);
            if (now >= at && now - at < 90000 && start.getTime() > now) fire(`${al.kind}|${e.id}|${e.start}|${al.at}`, () => popupFor(e, al.kind, { key: `${al.kind}|${e.id}|${al.at}` }));
          }
          continue;
        }
        const c = piCallTime(start, e.callBefore ?? null);
        const at = c.at.getTime();
        const kind = e.callMode === 'push' ? 'push' : 'call';
        if (!c.quiet && now >= at && now - at < 90000 && start.getTime() > now) fire(`${kind}|${e.id}|${e.start}`, () => popupFor(e, kind, { callAt: c.at.toISOString() }));
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
    // A leave-by time with no reminder from the Pi: the action card still comes up when it is time to go.
    for (const e of nextRun.items) {
      if (e.kind !== 'event' || !e.leaveBy || (e.piCall && S.settings.pi?.enabled)) continue;
      const start = new Date(e.start).getTime();
      const at = start - e.leaveBy * 60000;
      if (now >= at && now - at < 90000 && start > now) fire(`leave|${e.id}|${e.start}`, () => popupFor(e, 'leave'));
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

  /** The full-screen action card inside the app (the phone): Leaving now, Snooze, a 2-minute breakdown. */
  function showActionCard(a) {
    if (document.querySelector(`.action-card[data-key="${CSS.escape(a.key)}"]`)) return;
    const start = new Date(a.start), leaveAt = a.leaveAt ? new Date(a.leaveAt) : null;
    const when = h('div', { class: 'ac-when' });
    const leave = h('div', { class: 'ac-leave' });
    const draw = () => {
      const now = Date.now();
      when.textContent = `${start - now > 30000 ? `Starts in ${untilText(start - now)} · ` : ''}${fmtTime(start)}${a.calendar ? ` · ${a.calendar}` : ''}`;
      if (leaveAt) {
        const left = leaveAt - now;
        leave.replaceChildren(h('b', null, left > 0 ? countdown(left) : 'Now'), h('span', null, left > 0 ? `until you leave, by ${fmtTime(leaveAt)}` : `you planned to leave at ${fmtTime(leaveAt)}`));
      }
    };
    draw();
    const timer = setInterval(draw, 1000);
    let stepsTimer = null;
    const close = (action) => {
      clearInterval(timer);
      clearInterval(stepsTimer);
      if (overlayRing) { clearInterval(overlayRing); overlayRing = null; }
      shade.classList.add('leaving');
      setTimeout(() => shade.remove(), 220);
      if (action !== 'dismiss') popupAction({ action, alert: a });
    };
    const actions = h('div', { class: 'ac-actions' },
      h('button', { class: 'ac-btn go', onclick: () => close('leaving') }, h('span', { class: 'e' }, '🚀'), 'Leaving now'),
      h('button', { class: 'ac-btn', onclick: () => close('snooze') }, h('span', { class: 'e' }, '⏱️'), `Snooze ${SNOOZE_MIN}m`),
      h('button', { class: 'ac-btn', onclick: () => breakdown() }, h('span', { class: 'e' }, '🔀'), 'Need a 2-min breakdown'));
    const stepsBox = h('div', { class: 'ac-steps', hidden: true });
    const breakdown = () => {
      if (overlayRing) { clearInterval(overlayRing); overlayRing = null; }
      actions.hidden = true;
      stepsBox.hidden = false;
      const bar = h('i');
      const label = h('div', { class: 'ac-timer-label' });
      const list = h('ol', null, (a.steps?.length ? a.steps : breakdownSteps(a)).map((text) => {
        const li = h('li', { onclick: () => { li.classList.toggle('done'); doneSound(); } }, h('span', { class: 'box' }), h('span', { class: 't' }, text));
        return li;
      }));
      const endAt = Date.now() + 120000;
      const tick = () => {
        const left = endAt - Date.now();
        bar.style.width = `${Math.max(0, left / 1200)}%`;
        label.textContent = left > 0 ? countdown(left) : 'Time!';
        if (left <= 0) clearInterval(stepsTimer);
      };
      stepsBox.replaceChildren(list, h('div', { class: 'ac-timer' }, bar), label,
        h('button', { class: 'ac-btn go', onclick: () => close('leaving') }, h('span', { class: 'e' }, '🚀'), 'Leaving now'));
      tick();
      stepsTimer = setInterval(tick, 1000);
    };
    const KIND = { call: ['phone', 'Reminder call'], push: ['bell', 'Heads up'], leave: ['leave', 'Time to get going'] };
    const [ico, label] = KIND[a.kind] || KIND.leave;
    const card = h('div', { class: `action-card ${a.kind}`, 'data-key': a.key, css: { '--c': a.color || 'var(--accent)' } },
      h('div', { class: 'alert-head' }, icon(ico), h('span', null, a.snoozed ? 'Reminder (snoozed)' : label), h('span', { class: 'grow' }),
        h('button', { class: 'icon-btn', title: 'Close', onclick: () => close('dismiss') }, icon('x'))),
      h('div', { class: 'ac-title' }, a.title), when, leaveAt && leave, actions, stepsBox);
    const shade = h('div', { class: 'action-shade' }, card);
    document.body.append(shade);
    if (a.sound !== false) {
      if (a.kind === 'call') {
        clearInterval(overlayRing);
        let rings = 0;
        ringOnceHere();
        overlayRing = setInterval(() => { if (++rings >= 7) { clearInterval(overlayRing); overlayRing = null; } else ringOnceHere(); }, 2600);
      } else {
        chime('work');
      }
    }
    setTimeout(() => shade.isConnected && close('dismiss'), 30 * 60000);
  }

  function showAlertOverlay(a) {
    if (['call', 'push', 'leave'].includes(a.kind)) return showActionCard(a);
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
    else if (x.recur || x.seriesId) how += `, repeats (${recurText(x.recur).replace(/^./, (c) => c.toLowerCase())})`;
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
    const ms = action ? 8000 : kind ? 7000 : 3200;
    // The same message again (a button tapped twice) keeps the one already showing up for longer.
    const same = !action && [...$('#toasts').children].find((t) => !t.classList.contains('has-action') && t.textContent === String(message));
    if (same) {
      clearTimeout(same._timer);
      same._timer = setTimeout(() => same.remove(), ms);
      return;
    }
    const el = h('div', { class: `toast ${kind}${action ? ' has-action' : ''}` }, h('span', null, message),
      action && h('button', { class: 'toast-action', onclick: () => { el.remove(); action.run(); } }, action.label));
    $('#toasts').append(el);
    el._timer = setTimeout(() => el.remove(), ms);
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
    const grid = Math.max(1, Number(pi.checkEvery) || 30) * 60000; // how often the Pi looks
    const callAt = new Date(Math.ceil((start.getTime() - ((before ?? pi.leadMinutes) + 2) * 60000) / grid) * grid);
    const mins = (v) => { const [a, b] = v.split(':').map(Number); return a * 60 + b; };
    const t = callAt.getHours() * 60 + callAt.getMinutes();
    const qs = mins(pi.quietStart), qe = mins(pi.quietEnd);
    return { at: callAt, quiet: qs > qe ? (t >= qs || t < qe) : (t >= qs && t < qe) };
  }

  const hasGoogleTasks = () => S.calendars.some((c) => c.kind === 'tasklist' && c.provider === 'google');

  /** When the Pi reaches out (mirrors piAlerts in hub.js): the last look before the leave-by or picked time. */
  function ladderTimes(start, before, leaveBy, mode) {
    const base = before != null ? start.getTime() - before * 60000 : leaveBy ? start.getTime() - leaveBy * 60000 : null;
    if (base == null) return [];
    const grid = ((S.settings.calls?.method || S.calls?.method || 'pi') === 'pi' ? Math.max(1, Number(S.settings.pi?.checkEvery) || 30) : 1) * 60000;
    const first = Math.floor(base / grid) * grid;
    const out = [new Date(first)];
    if (mode === 'critical' && first + Math.max(grid, 600000) < start.getTime()) out.push(new Date(first + Math.max(grid, 600000)));
    return out;
  }

  function ladderText(times, mode) {
    const t = times.map((d) => fmtTime(d));
    // Said the way reminders go out (Settings → Calls & alerts).
    const how = S.settings.calls?.method || S.calls?.method || 'pi';
    const caller = { pi: 'The Pi phones you', twilio: 'Onyx phones you', ntfy: 'Onyx sends a loud push', alarm: 'Your phone rings an alarm' }[how];
    const pusher = { pi: 'The Pi sends a push alert', twilio: S.calls?.ntfyTopic ? 'Onyx sends a push' : 'Onyx phones you', ntfy: 'Onyx sends a push', alarm: 'Your phone rings an alarm' }[how];
    if (mode === 'push') return `${pusher} at ${t[0]}.`;
    if (mode === 'alarm') return `Your phone rings an alarm at ${t[0]}, until you press a button.`;
    if (mode === 'critical') return t.length > 1 ? `${caller} at ${t[0]}, and again at ${t[1]} unless you tap Leaving now.` : `${caller} at ${t[0]}.`;
    return `${caller} at ${t[0]}.`;
  }

  /** The Pi's looks it could phone at for something starting at `start` (at least 15 minutes apart): from the day before up to the start. */
  function callSlots(start) {
    const half = Math.max(15, Number(S.settings.pi?.checkEvery) || 30) * 60000;
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
      classNames: [e.kind === 'task' ? 'is-task' : e.kind === 'goal' ? 'is-goal' : 'is-event', e.kind === 'goal' ? '' : 'can-tick', e.done ? 'is-done' : '', matchesFilter(e.tags) ? '' : 'is-dim'],
      extendedProps: { src: e },
    };
  }

  async function source(info, ok) {
    try {
      const force = forceNext;
      forceNext = false;
      const { events, errors } = await onyx.events(info.start.toISOString(), info.end.toISOString(), force);
      showProblems(errors);
      ok(events.filter((e) => e.kind !== 'goal' && visible(e.calendarId) && !carriedOver(e)).map(toFc).concat(transitionBuffers(events)));
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


  // ---- transition buffers: the only stripes on the calendar
  // 15 minutes after a meeting that another meeting follows (within two hours, the same day),
  // drawn behind the grid as a striped band: time to get from one to the next. When the next
  // one starts sooner, the band runs into it and says so.
  const BUFFER_MIN = 15;
  function transitionBuffers(events) {
    if (S.settings.buffers === false) return [];
    const hard = events.filter((e) => e.kind === 'event' && !e.allDay && e.end && visible(e.calendarId))
      .map((e) => ({ e, s: new Date(e.start).getTime(), f: new Date(e.end).getTime() })).sort((a, b) => a.s - b.s);
    const out = [];
    for (const a of hard) {
      const b = hard.find((x) => x !== a && x.s >= a.f && x.s - a.f < 2 * 3600000 && sameDay(new Date(x.s), new Date(a.f)));
      if (!b) continue;
      const tight = b.s - a.f < BUFFER_MIN * 60000;
      out.push({
        id: `buffer|${a.e.id}|${a.e.start}`, start: new Date(a.f).toISOString(), end: new Date(a.f + BUFFER_MIN * 60000).toISOString(),
        display: 'background', classNames: ['transition-buffer', tight ? 'tight' : ''], extendedProps: { buffer: true, tight, next: b.e.title },
      });
    }
    return out;
  }

  /** An open task from an earlier day: it waits in the Rollover tray, not on the timeline. */
  const carriedOver = (e) => e.kind === 'task' && !e.done && !!e.start && (e.allDay ? e.start : ymd(new Date(e.start))) < ymd(new Date());

  function eventContent(arg) {
    if (arg.event.extendedProps.buffer) {
      const p = arg.event.extendedProps;
      return { domNodes: [h('span', { class: 'buffer-label', title: `Time to get to "${p.next}"` }, p.tight ? 'Transition · tight' : 'Transition')] };
    }
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
      (src.kind === 'task' || src.kind === 'event') && h('span', { class: 'dot', title: src.done ? 'Done. Tap to bring it back' : 'Mark done' }, src.done && checkMark()),
      h('span', { class: 't' }, arg.event.title),
      src.goal && h('span', { class: 'ev-goal', title: `A step toward: ${src.goal.title}` }, icon('flag')),
      src.repeat && h('span', { title: REPEAT[src.repeat] }, icon('repeat')),
      // A repeating block wears its repeat as a tag.
      src.kind === 'event' && (src.recur || src.seriesId) && h('span', { class: 'ev-recur', title: recurText(src.recur) }, icon('repeat')),
      src.pomodoro && h('span', { class: 'ev-pomo', title: `Pomodoro: ${src.pomodoro.work} min work, ${src.pomodoro.rest} min rest` }, icon('clock')),
      src.piCall && icon('phone'),
      notes && icon('note'),
      src.kind === 'event' && !src.writable && icon('lock'),
      src.tags?.length > 0 && h('span', { class: 'tagdots', title: src.tags.map((t) => `#${t}`).join(' ') },
        src.tags.slice(0, 4).map((t) => h('i', { css: { '--t': tagColor(t) } }))));
    // On the PC, hovering shows a preview card (showPeek); the phone keeps the plain tooltip.
    // A goal's step: how far along the goal is, as a bar across its block.
    const gp = src.goal?.progress;
    const goalBar = gp && gp.total > 0 && h('div', { class: 'ev-goalbar', css: { '--p': `${gp.percent}%`, '--g': src.goal.color || '#8b7cff' }, title: `${src.goal.title}: ${gp.done} of ${gp.total} steps done (${gp.percent}%)` }, h('i'));
    return { domNodes: [h('div', { class: 'ev', title: notes && MOBILE ? `${arg.event.title}\n\n${notes}` : null }, title, h('div', { class: 'ev-time' }, arg.timeText || (arg.event.allDay ? 'All day' : '')), goalBar)] };
  }

  // A preview card for the block under the pointer: its whole name, times, calendar, notes and
  // tags, which a short or narrow block cuts off. Shown after a short pause, never while dragging.
  const peek = { el: null, timer: 0 };
  document.addEventListener('scroll', () => hidePeek(), true); // the block moved away from under the card
  const dragging = () => document.body.classList.contains('dragging-entry') || document.body.classList.contains('carrying');
  function showPeek(info) {
    hidePeek();
    const src = info.event.extendedProps.src;
    if (MOBILE || !src || src.kind === 'goal' || dragging()) return;
    peek.timer = setTimeout(() => {
      if (!info.el.isConnected || dragging()) return;
      const e = info.event;
      const notes = notesOf(src);
      const when = e.allDay ? `${fmtDay(e.start)} · all day` : `${fmtDay(e.start)} · ${fmtTime(e.start)}${e.end ? ` – ${fmtTime(e.end)}` : ''}`;
      const card = h('div', { class: 'ev-peek', css: { '--c': src.color || '#8b7cff' } },
        h('div', { class: 'peek-title' }, e.title),
        h('div', { class: 'peek-when' }, when),
        h('div', { class: 'peek-cal' }, [src.kind === 'task' ? (src.done ? 'Task · done' : 'Task') : null, src.calendarName].filter(Boolean).join(' · ')),
        src.kind === 'event' && (src.recur || src.seriesId) && h('div', { class: 'peek-recur' }, icon('repeat'), recurText(src.recur)),
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
    // Colour-coded: work in red, breaks in green, each band where it really falls; the one
    // you are in now is brighter.
    const now = (Date.now() - arg.event.start) / 60000;
    const bands = pomodoroChunks(total, p).map((c) => {
      const live = now >= c.from && now < c.to;
      const col = c.kind === 'work' ? `rgba(255,107,91,${live ? 0.62 : 0.4})` : `rgba(79,209,165,${live ? 0.66 : 0.45})`;
      return `${col} ${(c.from / total) * 100}%, ${col} ${(c.to / total) * 100}%`;
    });
    if (!bands.length) return;
    arg.el.classList.add('pomo');
    arg.el.style.backgroundImage = `linear-gradient(to bottom, ${bands.join(', ')})`;
  }

  async function onMove(info) {
    const e = info.event;
    const src = e.extendedProps.src;
    if (src.kind === 'task') return moveTaskTo(info);
    const end = e.end || (e.allDay ? addDays(e.start, 1) : new Date(e.start.getTime() + 3600000));
    try {
      const times = e.allDay
        ? { start: ymd(e.start), end: ymd(end), allDay: true }
        : { start: e.start.toISOString(), end: end.toISOString(), allDay: false };
      // A day of a repeat moves them all (by as much, and to the same new time).
      const saved = await onyx.updateEvent(src.id, src.seriesId ? { ...times, seriesId: src.seriesId, from: src.start } : times);
      if (saved.warning) toast(saved.warning, 'warn');
      else if (src.seriesId) toast(`Moved every repeat of "${src.title}"`);
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
      // A real drag blocks out time; a click (even one that wobbles a little over an entry) never
      // turns into a new block by mistake. A plain click on an empty slot still opens one (dateClick).
      selectMinDistance: MOBILE ? 0 : 6,
      dateClick: (info) => {
        if (MOBILE || info.jsEvent.target.closest?.('.fc-event, .fc-more-link')) return;
        const start = info.date;
        const end = info.allDay ? addDays(start, 1) : new Date(start.getTime() + 30 * 60000);
        openEditor({ start, end, allDay: info.allDay }, pointRect(info.jsEvent));
      },
      selectMirror: true,
      unselectAuto: false,
      editable: true,
      events: source,
      eventContent,
      eventDidMount: (arg) => {
        arg.el.style.setProperty('--c', arg.event.extendedProps.src?.color || '#8b7cff');
        if (arg.event.extendedProps.src) arg.el.dataset.eid = arg.event.id; // for the timer pie (drainTimers)
        drawPomodoroStripes(arg);
        const src = arg.event.extendedProps.src;
        if (src && (src.kind === 'event' || src.kind === 'task')) {
          if (clip.selected === src.id) arg.el.classList.add('is-selected');
          // The right-click menu is for a mouse: on a touch screen a long press is how an entry is
          // picked up to drag, and the browser calls that a right-click too.
          if (!MOBILE) arg.el.addEventListener('contextmenu', (e) => {
            if (e.sourceCapabilities?.firesTouchEvents || dragging()) return;
            e.preventDefault(); e.stopPropagation(); selectEntry(src); entryMenu(e, src);
          });
        }
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
        if (src && (src.kind === 'event' || src.kind === 'task')) selectEntry(src);
        const anchor = info.el.getBoundingClientRect();
        if ((src.kind === 'task' || src.kind === 'event') && info.jsEvent.target.closest?.('.dot')) {
          const dot = info.el.querySelector('.dot');
          if (info.el.classList.contains('done-anim')) return; // already on its way
          if (src.done) {
            // Ticked: the white circle empties again and it comes back.
            info.el.classList.remove('is-done');
            dot.replaceChildren();
            if (src.kind === 'task') restoreTask(src.id, src.title); else restoreEvent(src);
            return;
          }
          // The circle pops and fills white, a check draws in, a little burst and a click.
          celebrate(info.el, dot, src.color);
          const t = tasks.find((x) => x.id === src.id) || { id: src.id, label: src.title };
          (src.kind === 'task' ? completeTask(t, null, 900) : completeEvent(src, 900)).then((ok) => {
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
    if (!MOBILE) {
      edgeArrows();
      // Right-click on an empty spot: paste there.
      $('#calendar').addEventListener('contextmenu', (e) => { if (e.target.closest('.fc-event') || e.sourceCapabilities?.firesTouchEvents || dragging()) return; e.preventDefault(); entryMenu(e, null); });
    }
  }

  // ---- copy and paste: a click highlights an entry; Ctrl+C (or right-click → Copy) copies it,
  // and Ctrl+V (or right-click → Paste here) makes a copy where the pointer is on the calendar.
  const clip = { selected: null, entry: null, x: 0, y: 0 };
  document.addEventListener('mousemove', (e) => { clip.x = e.clientX; clip.y = e.clientY; }, { passive: true });

  function selectEntry(src) {
    clip.selected = src.id;
    for (const el of document.querySelectorAll('#calendar .fc-event.is-selected')) el.classList.remove('is-selected');
    for (const el of document.querySelectorAll(`#calendar .fc-event[data-eid="${CSS.escape(src.id)}"]`)) el.classList.add('is-selected');
  }

  function copyEntry(src) {
    clip.entry = src;
    toast(`Copied "${src.title}". Ctrl+V (or right-click → Paste here) puts a copy where the pointer is.`);
  }

  /** The calendar day (and, on the time grid, the time) under a point on the screen. */
  function slotAt(x, y) {
    let day = null, time = null;
    for (const el of document.elementsFromPoint(x, y)) {
      if (!day && el.matches?.('.fc-timegrid-col[data-date], .fc-daygrid-day[data-date]')) day = el.dataset.date;
    }
    if (!day) return null;
    for (const lane of document.querySelectorAll('#calendar .fc-timegrid-slot-lane[data-time]')) {
      const r = lane.getBoundingClientRect();
      if (y >= r.top && y < r.bottom) { time = lane.dataset.time.slice(0, 5); break; }
    }
    return { day, time };
  }

  async function pasteEntry(place) {
    const src = clip.entry;
    if (!src) return toast('Nothing copied yet: click an entry and press Ctrl+C.');
    const slot = place || slotAt(clip.x, clip.y);
    if (!slot) return toast('Point at a day or time on the calendar, then paste.');
    const start = toDate(src.start), end = toDate(src.end || src.start);
    const length = Math.max(15 * 60000, end - start);
    try {
      if (src.kind === 'task') {
        const t = tasks.find((x) => x.id === src.id) || { label: src.title, listId: src.calendarId, notes: src.notes };
        const made = await onyx.createTask({ title: t.label || src.title, listId: t.listId || src.calendarId, notes: t.notes || '', due: slot.day, tags: src.tags || [] });
        const time = slot.time || (src.allDay ? null : hm(start));
        if (time) await onyx.moveTask(made.id, { start: at(slot.day, time).toISOString() });
        await loadTasks(true);
      } else {
        const allDay = !!src.allDay;
        let s, e;
        if (src.allDay) {
          s = slot.day;
          e = ymd(addDays(fromYmd(slot.day), Math.max(1, Math.round((end - start) / 86400000))));
        } else {
          const begin = at(slot.day, slot.time || hm(start));
          s = begin.toISOString();
          e = new Date(begin.getTime() + length).toISOString();
        }
        const cal = S.calendars.find((c) => c.id === src.calendarId && c.kind === 'calendar' && c.writable) ? src.calendarId : undefined;
        await onyx.createEvent({ title: src.title, notes: src.notes || '', location: src.location || '', start: s, end: e, allDay, calendarId: cal, tags: src.tags || [] });
      }
      toast(`Pasted "${src.title}"`);
      refetch(true);
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  /** The right-click menu: on an entry (copy, paste, duplicate, open) or on an empty spot (paste here). */
  function entryMenu(e, src) {
    closeMenu();
    const slot = slotAt(e.clientX, e.clientY);
    const item = (label, run, off) => h('button', { class: 'ctx-item', disabled: !!off, onclick: () => { closeMenu(); run(); } }, label);
    const menu = h('div', { class: 'ctx-menu', role: 'menu' },
      src && item('Open', () => (src.kind === 'task' ? openTask(tasks.find((t) => t.id === src.id) || { id: src.id, title: src.title, label: src.title, listName: src.calendarName }, pointRect(e)) : openEditor({ src, start: toDate(src.start), end: toDate(src.end), allDay: src.allDay }, pointRect(e)))),
      src && item('Copy   Ctrl+C', () => copyEntry(src)),
      src && item('Duplicate', () => { clip.entry = src; const d = toDate(src.start); pasteEntry({ day: ymd(addDays(d, src.allDay ? 1 : 0)), time: src.allDay ? null : hm(new Date(d.getTime() + Math.max(15 * 60000, toDate(src.end) - d))) }); }),
      item(`Paste here   Ctrl+V${clip.entry ? `: ${clip.entry.title}` : ''}`, () => pasteEntry(slot), !clip.entry || !slot));
    menu.style.left = `${Math.min(e.clientX, innerWidth - 230)}px`;
    menu.style.top = `${Math.min(e.clientY, innerHeight - 160)}px`;
    document.body.append(menu);
    setTimeout(() => document.addEventListener('mousedown', closeMenuOutside, true), 0);
  }
  function closeMenuOutside(e) { if (!e.target.closest('.ctx-menu')) closeMenu(); }
  function closeMenu() {
    document.removeEventListener('mousedown', closeMenuOutside, true);
    for (const m of document.querySelectorAll('.ctx-menu')) m.remove();
  }

  document.addEventListener('keydown', (e) => {
    if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
    if (e.target.closest?.('input, textarea, select, [contenteditable]')) return;
    const k = e.key.toLowerCase();
    if (k === 'c' && clip.selected) {
      const src = calendar?.getEventById(clip.selected)?.extendedProps?.src;
      if (src) { e.preventDefault(); copyEntry(src); }
    } else if (k === 'v' && clip.entry) {
      e.preventDefault();
      pasteEntry();
    }
  });

  /** The pointer near the calendar's left or right side: an arrow there to click to the previous or next days. */
  function edgeArrows() {
    const stage = $('#calendar').parentElement;
    const arrow = (dir) => h('button', {
      class: `edge-hover ${dir > 0 ? 'next' : 'prev'}`, title: dir > 0 ? 'Next' : 'Previous', 'aria-label': dir > 0 ? 'Next' : 'Previous',
      onclick: () => (dir > 0 ? calendar.next() : calendar.prev()),
    }, dir > 0 ? '›' : '‹');
    const prev = arrow(-1), next = arrow(1);
    stage.append(prev, next);
    const ZONE = 70;
    stage.addEventListener('mousemove', (e) => {
      if (document.body.classList.contains('dragging-entry') || graph.on) { prev.classList.remove('show'); next.classList.remove('show'); return; }
      const r = stage.getBoundingClientRect();
      const axis = Math.max(40, $('#calendar .fc-timegrid-axis')?.getBoundingClientRect().width || 0);
      prev.classList.toggle('show', e.clientX - r.left < axis + ZONE);
      next.classList.toggle('show', r.right - e.clientX < ZONE);
    });
    stage.addEventListener('mouseleave', () => { prev.classList.remove('show'); next.classList.remove('show'); });
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

  // The pointer is read on every move, but the carried copy and the edges are updated once a
  // frame, against sizes measured when the drag began: a phone sends a move event many times a
  // frame, and measuring the page each time made the drag stutter.
  const drag = { x: 0, y: 0, frame: 0, rect: null, axis: 28 };

  function dragMeasure() {
    drag.rect = $('#calendar').getBoundingClientRect();
    // The left side counts only over the time column, so the first day stays a place to drop.
    drag.axis = Math.max(28, $('#calendar .fc-timegrid-axis')?.getBoundingClientRect().width || 0);
  }

  function edgeMove(e) {
    const p = e.touches?.[0] || e;
    if (p.clientX == null) return;
    drag.x = p.clientX;
    drag.y = p.clientY;
    if (drag.frame) return;
    drag.frame = requestAnimationFrame(() => {
      drag.frame = 0;
      floatMove(drag.x, drag.y);
      if (!drag.rect) dragMeasure();
      const r = drag.rect;
      setEdge(drag.x >= r.right - EDGE_ZONE ? 1 : drag.x <= r.left + drag.axis ? -1 : 0);
    });
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

  // One kind of move event: touches on the phone (the calendar drags by touch there), the pointer elsewhere.
  const MOVE_EVENT = MOBILE || matchMedia('(pointer: coarse)').matches ? 'touchmove' : 'pointermove';

  function edgeNavStart() {
    edgeMarks();
    dragMeasure();
    document.body.classList.add('dragging-entry');
    document.addEventListener(MOVE_EVENT, edgeMove, { capture: true, passive: true });
  }

  function edgeNavStop() {
    document.body.classList.remove('dragging-entry');
    document.removeEventListener(MOVE_EVENT, edgeMove, { capture: true });
    cancelAnimationFrame(drag.frame);
    drag.frame = 0;
    drag.rect = null;
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
    for (const extra of copy.querySelectorAll('.ev-timer')) extra.remove(); // the drain pie redraws every frame
    copy.style.width = `${r.width}px`;
    copy.style.height = `${r.height}px`;
    // Inside an element with the "fc" class, so it keeps the calendar's look.
    float.box = h('div', { class: 'fc drag-float' }, copy);
    float.box.style.transform = `translate3d(${r.left}px, ${r.top}px, 0)`;
    document.body.append(float.box);
    document.body.classList.add('carrying');
  }

  function floatMove(x, y) {
    if (float.box) float.box.style.transform = `translate3d(${x - float.dx}px, ${y - float.dy}px, 0)`;
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

  // ---- dates and times you can drag: press on the hour, minute, day, month or year and drag
  // right to move it up, left to move it down. A 12-hour time gets an AM/PM picker beside it.
  const TWELVE = new Intl.DateTimeFormat([], { hour: 'numeric' }).resolvedOptions().hour12 !== false;
  const DATE_ORDER = new Intl.DateTimeFormat([], { year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(2000, 0, 2))
    .filter((p) => p.type !== 'literal').map((p) => p.type);

  function scrubbable(input) {
    if (input.dataset.scrub) return;
    input.dataset.scrub = '1';
    const isTime = input.type === 'time';
    input.classList.add('scrub');
    // Which group the pointer is on: hours / minutes (/ AM-PM), or the date's parts in the order shown.
    // Measured from the text itself (in the box's own font), not the box's width, which is wider
    // than what it shows: "07:26 AM" or "10/17/2026".
    const partAt = (x) => {
      const r = input.getBoundingClientRect();
      const cs = getComputedStyle(input);
      const ctx = partAt.ctx || (partAt.ctx = document.createElement('canvas').getContext('2d'));
      ctx.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
      const w = (s) => ctx.measureText(s).width;
      const at = x - r.left - parseFloat(cs.paddingLeft || '0') - parseFloat(cs.borderLeftWidth || '0');
      if (isTime) {
        if (at < w('00') + w(':') / 2) return 'h';
        if (!TWELVE || at < w('00:00') + w(' ') / 2) return 'm';
        return 'ap';
      }
      const lens = DATE_ORDER.map((p) => (p === 'year' ? '0000' : '00'));
      let edge = 0;
      for (let i = 0; i < 3; i++) {
        edge += w(lens[i]) + (i < 2 ? w('/') / 2 : 0);
        if (at < edge) return DATE_ORDER[i];
        edge += i < 2 ? w('/') / 2 : 0;
      }
      return DATE_ORDER[2];
    };
    const shift = (value, part, n) => {
      if (isTime) {
        let [hh, mm] = (value || '09:00').split(':').map(Number);
        if (part === 'h') hh += n;
        else if (part === 'm') mm += n * 5;
        else if (n % 2) hh += 12;
        const total = (((hh * 60 + mm) % 1440) + 1440) % 1440;
        return `${pad(Math.floor(total / 60))}:${pad(total % 60)}`;
      }
      const d = value ? fromYmd(value) : new Date();
      if (part === 'day') d.setDate(d.getDate() + n);
      else if (part === 'month') d.setMonth(d.getMonth() + n);
      else d.setFullYear(d.getFullYear() + n);
      return ymd(d);
    };
    input.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || e.pointerType === 'touch' || input.disabled) return;
      const startX = e.clientX, from = input.value, part = partAt(e.clientX);
      let dragging = false, last = 0;
      const move = (ev) => {
        const dx = ev.clientX - startX;
        if (!dragging && Math.abs(dx) < 5) return;
        if (!dragging) {
          dragging = true;
          try { input.setPointerCapture(e.pointerId); } catch { /* the drag still works while over the box */ }
          input.classList.add('scrubbing');
        }
        const n = Math.trunc(dx / (part === 'ap' ? 30 : 12));
        if (n === last) return;
        last = n;
        input.value = shift(from, part, n);
        input.dispatchEvent(new Event('input', { bubbles: true }));
      };
      const up = () => {
        input.removeEventListener('pointermove', move);
        input.removeEventListener('pointerup', up);
        input.removeEventListener('pointercancel', up);
        input.classList.remove('scrubbing');
        if (dragging) input.dispatchEvent(new Event('change', { bubbles: true }));
      };
      input.addEventListener('pointermove', move);
      input.addEventListener('pointerup', up);
      input.addEventListener('pointercancel', up);
    });
    // AM/PM, picked from a list (the box cut it off).
    if (isTime && TWELVE) {
      const ap = h('select', { class: 'ampm', title: 'AM or PM', disabled: input.disabled }, h('option', { value: 'AM' }, 'AM'), h('option', { value: 'PM' }, 'PM'));
      const sync = () => { ap.value = Number((input.value || '00:00').slice(0, 2)) >= 12 ? 'PM' : 'AM'; ap.hidden = input.hidden; };
      ap.addEventListener('change', () => {
        const hh = Number((input.value || '09:00').slice(0, 2));
        const want = ap.value === 'PM' ? (hh % 12) + 12 : hh % 12;
        input.value = `${pad(want)}:${(input.value || '09:00').slice(3, 5)}`;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
      });
      input.addEventListener('input', sync);
      input.addEventListener('change', sync);
      new MutationObserver(sync).observe(input, { attributes: true, attributeFilter: ['hidden'] });
      sync();
      input.after(ap);
    }
  }

  function showPopover(anchor, nodes, onClose, { wide = false } = {}) {
    closePopover();
    const pop = $('#popover');
    pop.classList.toggle('wide', wide);
    pop.replaceChildren(...nodes.filter((n) => n && n.nodeType));
    addLinkButtons(pop);
    for (const input of pop.querySelectorAll('input[type=time], input[type=date]')) scrubbable(input);
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

  // ---- repeating blocks: the rule in words, and the Repeat field in a block's window

  function recurNames() {
    // 2 January 2000 was a Sunday.
    const day = (i, weekday) => new Date(2000, 0, 2 + i).toLocaleDateString([], { weekday });
    return {
      dayShort: [0, 1, 2, 3, 4, 5, 6].map((i) => day(i, 'short')),
      dayLong: [0, 1, 2, 3, 4, 5, 6].map((i) => day(i, 'long')),
      month: [...Array(12)].map((_, i) => new Date(2000, i, 1).toLocaleDateString([], { month: 'short' })),
    };
  }
  function nth(n) { return `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] || 'th')}`; }
  function andList(xs) { return xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`; }

  /** "Every Monday and Wednesday", "Monthly on the 1st and 15th", "Yearly on the 1st of Mar and Sep". */
  function recurText(r) {
    if (!r) return 'Repeats';
    if (r.custom && r.freq !== 'daily' && !(r.days?.length || r.dates?.length)) return 'Repeats (set up in the calendar app)';
    const n = recurNames();
    const days = r.days || [];
    let s;
    if (r.freq === 'daily' || (r.freq === 'weekly' && days.length === 7)) s = 'Every day';
    else if (r.freq === 'weekly') s = days.length === 5 && [1, 2, 3, 4, 5].every((d) => days.includes(d)) ? 'Every weekday' : `Every ${andList(days.map((d) => n.dayLong[d]))}`;
    else if (r.freq === 'monthly') s = `Monthly on the ${andList((r.dates || []).map(nth))}`;
    else s = `Yearly on the ${andList((r.dates || []).map(nth))} of ${andList((r.months || []).map((m) => n.month[m - 1]))}`;
    return `${s}${r.custom ? ' (set up in the calendar app)' : ''}${r.until ? `, until ${fmtDay(fromYmd(r.until))}` : ''}`;
  }

  /**
   * Repeat: a checkbox, then how often (daily, weekly on which days, monthly on which dates,
   * yearly on which months and dates). `firstDay()` is the block's day, for the defaults.
   */
  function recurField(initial, firstDay, isSeries) {
    const n = recurNames();
    let on = !!initial;
    let touched = false;
    let r = initial ? { freq: initial.freq, days: [...(initial.days || [])], dates: [...(initial.dates || [])], months: [...(initial.months || [])] } : null;
    const defaults = (freq = 'weekly') => { const d = firstDay(); return { freq, days: [d.getDay()], dates: [d.getDate()], months: [d.getMonth() + 1] }; };
    const box = h('input', { type: 'checkbox', checked: on });
    const panel = h('div', { class: 'recur-panel' });
    const flip = (list, v) => (list.includes(v) ? (list.length > 1 ? list.filter((x) => x !== v) : list) : [...list, v].sort((a, b) => a - b));
    const chip = (label, active, title, onclick) => h('button', { type: 'button', class: `rchip${active ? ' on' : ''}`, title, 'aria-pressed': String(active), onclick: () => { touched = true; onclick(); draw(); } }, label);
    const draw = () => {
      panel.hidden = !on;
      if (!on) return panel.replaceChildren();
      const order = [0, 1, 2, 3, 4, 5, 6].map((i) => (i + (S.settings.weekStart || 0)) % 7);
      panel.replaceChildren(...[
        h('div', { class: 'segmented recur-freq' }, [['daily', 'Daily'], ['weekly', 'Weekly'], ['monthly', 'Monthly'], ['yearly', 'Yearly']]
          .map(([v, label]) => h('button', { type: 'button', class: r.freq === v ? 'on' : '', onclick: () => { touched = true; r.freq = v; draw(); } }, label))),
        r.freq === 'weekly' && h('div', { class: 'recur-days' }, order.map((i) => chip(n.dayShort[i], r.days.includes(i), n.dayLong[i], () => { r.days = flip(r.days, i); }))),
        r.freq === 'yearly' && h('div', { class: 'recur-months' }, n.month.map((m, i) => chip(m, r.months.includes(i + 1), m, () => { r.months = flip(r.months, i + 1); }))),
        (r.freq === 'monthly' || r.freq === 'yearly') && h('div', { class: 'recur-dates' },
          [...Array(31)].map((_, i) => chip(String(i + 1), r.dates.includes(i + 1), `The ${nth(i + 1)}`, () => { r.dates = flip(r.dates, i + 1); }))),
        h('small', { class: 'recur-text' }, icon('repeat'), `${recurText(touched ? r : initial && !touched ? initial : r)}${isSeries ? '. Changes go to every repeat.' : ''}`),
      ].filter(Boolean));
    };
    box.addEventListener('change', () => {
      on = box.checked;
      touched = true;
      if (on && !r) r = defaults();
      draw();
    });
    draw();
    return {
      el: h('div', { class: 'recur' }, h('label', { class: 'check recur-check' }, box, 'Repeat'), panel),
      /** The rule as picked, null for "does not repeat", or undefined when left as it was. */
      get: () => {
        if (initial && !touched) return undefined; // as it was (a rule set up elsewhere stays as it is)
        if (!on) return null;
        return {
          freq: r.freq, ...(r.freq === 'weekly' ? { days: r.days } : {}),
          ...(r.freq === 'monthly' || r.freq === 'yearly' ? { dates: r.dates } : {}), ...(r.freq === 'yearly' ? { months: r.months } : {}),
        };
      },
      /** The block's day changed: an untouched new repeat follows it. */
      follow: () => { if (on && !initial && !touched) { r = defaults(r.freq); draw(); } },
    };
  }

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
    // Repeat (under the calendar): every day of it is the same block, so a change to one goes to all.
    const repeatField = !readOnly && recurField(src?.recur || (src?.seriesId ? { freq: 'weekly', custom: true } : null), () => fromYmd(date.value || ymd(model.start)), !!src?.seriesId);
    if (repeatField) date.addEventListener('input', () => repeatField.follow());
    // Notes are saved with the entry; on a read-only calendar yours are kept in Onyx instead.
    const notes = !readOnly && notesField(src ? src.notes : '');
    const memo = readOnly && notesField(src.memo, 'Your notes: kept in Onyx, since this calendar is read-only');
    // The escalation ladder: how the Pi reaches out (off, a push alert, a call, or calls that
    // keep coming until "Leaving now"), at the leave-by time when there is one.
    let mode = src?.piCall ? src.callMode || 'call' : 'off';
    const call = h('input', { type: 'checkbox', checked: mode !== 'off', hidden: true });
    // Each says what it really does, with the way reminders go out (Settings → Calls & alerts).
    const via = { pi: 'the Pi', twilio: 'Onyx (Twilio)', ntfy: 'ntfy', alarm: 'your phone' }[S.settings.calls?.method || S.calls?.method || 'pi'];
    const LADDER = [
      ['off', 'bell-off', 'Off', 'No reminder'],
      ['push', 'bell', 'Push only', 'A notification on your phone, no ringing'],
      ['call', 'phone', 'Voice call', `One phone call from ${via}`],
      ['critical', 'phone', 'Critical', 'A call, then a second one 10 minutes later unless you tap Leaving now'],
      ['alarm', 'clock', 'Alarm', 'Your phone rings and vibrates full screen until you press a button'],
    ];
    const ladder = h('div', { class: 'ladder-list', role: 'radiogroup', 'aria-label': 'Escalation' },
      LADDER.map(([value, ico, label, hint]) => h('button', {
        type: 'button', class: 'ladder-opt', 'data-mode': value, role: 'radio',
        onclick: () => { mode = value; call.checked = value !== 'off'; sync(); },
      }, h('span', { class: 'lo-ico' }, icon(ico)), h('span', { class: 'lo-txt' }, h('b', null, label), h('small', null, hint)), h('span', { class: 'lo-dot' }))));
    // Leave by: how long before it starts you need to set off (travel, getting ready).
    let leaveBy = src?.leaveBy ?? null;
    const LEAVE = [0, 5, 10, 15, 20, 30, 45, 60, 90, 120];
    const leaveSel = h('select', { class: 'leave-sel', title: 'How long before it starts you need to set off' },
      LEAVE.map((m) => h('option', { value: m, selected: (leaveBy || 0) === m }, m ? `${m} min before` : 'No travel time')));
    const leaveHint = h('small', { class: 'leave-hint' });
    leaveSel.addEventListener('change', () => { leaveBy = Number(leaveSel.value) || null; sync(); });
    const callHint = h('small');
    // When the Pi phones: its usual lead time, or a half-hour picked here (kept as minutes before the start).
    // When the Pi phones: any time picked here, at the entry's own start unless changed.
    let callBefore = src?.callBefore ?? 0;
    const callWhen = h('input', { type: 'time', class: 'call-when', step: 60, title: 'When the Pi phones you (it looks every few minutes, so it rings at its first look from then)' });
    callWhen.addEventListener('change', () => {
      if (!callWhen.value) return;
      const r = range();
      callBefore = Math.round((r.at - at(ymd(r.at), callWhen.value)) / 60000);
      sync();
    });
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
      leaveHint.textContent = leaveBy && !r.allDay ? `Leave by ${fmtTime(new Date(r.at.getTime() - leaveBy * 60000))}` : '';
      for (const b of ladder.children) {
        b.classList.toggle('on', b.dataset.mode === mode);
        b.setAttribute('aria-checked', String(b.dataset.mode === mode));
      }
      const st = piStatus(r.at, r.allDay, callBefore);
      const times = mode === 'off' ? [] : ladderTimes(r.at, callBefore, leaveBy, mode);
      callHint.textContent = mode === 'off' ? 'No reminder from the Pi.'
        : !st.allowed ? st.text
        : times.length ? ladderText(times, mode)
        : st.text.replace('The Pi phones you', mode === 'push' ? 'The Pi sends a push alert' : mode === 'alarm' ? 'Your phone rings an alarm' : 'The Pi phones you');
      callHint.className = mode === 'off' ? '' : st.tone;
      ladder.classList.toggle('disabled', !st.allowed && mode === 'off');
      // With a leave-by time, that is when it reaches out; otherwise a time can be picked.
      callWhen.hidden = mode === 'off' || !st.allowed || !!leaveBy;
      // Any time of day, kept as minutes before the start (after it, too); not while it's being typed.
      if (!callWhen.hidden && document.activeElement !== callWhen) callWhen.value = hm(new Date(r.at.getTime() - (callBefore ?? 0) * 60000));
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
      data.piCall = mode !== 'off' && !r.allDay;
      const leaveChanged = (leaveBy || null) !== (src?.leaveBy ?? null);
      if (leaveChanged) data.leaveBy = leaveBy;
      const modeChanged = data.piCall && mode !== (src?.callMode || 'call');
      if (data.piCall) data.callMode = mode;
      const callChanged = data.piCall && (callBefore !== (src?.callBefore ?? null) || modeChanged || leaveChanged);
      if (callChanged) data.callBefore = callBefore;
      const rule = repeatField ? repeatField.get() : undefined;
      if (rule !== undefined && (rule || src?.recur || src?.seriesId)) data.recur = rule; // null turns a repeat off (this day becomes its last)
      if (src?.seriesId) Object.assign(data, { seriesId: src.seriesId, from: src.start });
      try {
        let saved = null;
        if (!src) {
          saved = await onyx.createEvent(data);
          if (S.settings.defaultCalendar !== data.calendarId) saveSettings({ defaultCalendar: data.calendarId }, true);
        } else if (readOnly) {
          // A read-only calendar can still carry tags and a phone reminder: both live in Onyx.
          if (leaveChanged) await onyx.setLeaveBy(src.id, leaveBy);
          if (data.piCall !== !!src.piCall || callChanged) await onyx.setCall({ id: src.id, title: src.title, start: src.start, allDay: src.allDay }, data.piCall, data.piCall ? callBefore : null, data.piCall ? mode : undefined);
          if (!sameTags(data.tags, src.tags)) await onyx.setTags(src.seriesId || src.id, data.tags);
          if (cleanNote(memo.value) !== (src.memo || '')) await onyx.setMemo(src.seriesId || src.id, memo.value);
        } else {
          saved = await onyx.updateEvent(src.id, data);
        }
        if (saved?.warning) toast(saved.warning, 'warn');
        // The split is kept in Onyx, by the entry's id (a new id when it moved calendar).
        const split = r.allDay ? null : pomo.get();
        const id = src?.seriesId || saved?.seriesId || saved?.id || src?.id; // a repeat's split is the series'
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

    // A repeat: "Delete" takes every day of it (after asking), "Skip this day" just this one.
    const remove = async (scope = 'all') => {
      if (src.seriesId && scope === 'all' && !confirm(`Delete every repeat of "${src.title}"?`)) return;
      try {
        await onyx.deleteEvent(src.id, src.seriesId ? { scope, seriesId: src.seriesId } : undefined);
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
      repeatField && h('div', { class: 'row top recur-row' }, icon('repeat'), repeatField.el),
      notes && h('div', { class: 'row top' }, icon('note'), notes),
      readOnly && src.notes && h('div', { class: 'row top pop-meta' }, icon('note'), h('div', { class: 'note-text' }, src.notes)),
      memo && h('div', { class: 'row top' }, icon('note'), memo),
      h('div', { class: 'row' }, icon('tag'), tags.el),
      // The hammer, as on a task: its steps go into the notes (yours, on a read-only calendar) or become tasks that day.
      (notes || memo) && breakdownField({
        get title() { return title.value.trim() || src?.title || 'this'; }, label: '', listId: undefined,
        get date() { return date.value || ymd(model.start); }, get tags() { return tags.get(); },
      }, notes || memo),
      pomoRow,
      src?.location && h('div', { class: 'row pop-meta' }, icon('pin'), src.location),
      h('div', { class: 'row leave-row' }, icon('leave'), h('span', { class: 'dash' }, 'Leave'), leaveSel, leaveHint),
      S.settings.pi.enabled && h('div', { class: 'row pi-row' }, icon('phone'),
        h('div', { class: 'txt' }, h('b', null, 'Escalation'), ladder, callHint, callWhen, call)),
      readOnly && h('div', { class: 'pop-meta' }, 'This calendar is read-only here. ',
        src.link && h('a', { href: '#', onclick: (e) => { e.preventDefault(); onyx.open(src.link); } }, 'Open it in the browser')),
      h('div', { class: 'pop-actions' },
        src && h('button', { class: 'btn complete', title: src.done ? 'Bring it back' : 'Mark it done (Undo brings it back)', onclick: () => { closePopover(); if (src.done) restoreEvent(src); else completeEvent(src); } },
          icon('check'), src.done ? 'Not done' : 'Complete'),
        src && !readOnly && h('button', { class: 'btn danger', title: src.seriesId ? 'Delete every repeat' : null, onclick: () => remove('all') }, icon('trash'), src.seriesId ? 'Delete all' : 'Delete'),
        src?.seriesId && !readOnly && h('button', { class: 'btn', title: 'Take just this day off; the others stay', onclick: () => remove('one') }, 'Skip this day'),
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
      toast('These are copies of a task that repeats in Google Tasks, so the next one comes by itself. Use "Let it go" on the old ones.');
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

  /** Ticks a calendar entry or time block off, as a task is (kept in Onyx: calendars have no "done"). */
  async function completeEvent(src, hold = 0) {
    const t0 = Date.now();
    try {
      await onyx.setEventDone(src.id, true);
      const wait = hold - (Date.now() - t0);
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      toast(`Done: "${src.title}"`, '', { label: 'Undo', run: () => restoreEvent(src) });
      refetch();
      return true;
    } catch (err) {
      toast(err.message, 'error');
      return false;
    }
  }

  async function restoreEvent(src) {
    try {
      await onyx.setEventDone(src.id, false);
      toast(`Restored "${src.title}"`);
      refetch();
    } catch (err) {
      toast(err.message, 'error');
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
    // Tasks from earlier days are not "overdue": they are carried over. The last two weeks wait
    // in the Rollover tray (folded up) with one-tap ways on; older ones rest in Someday, on
    // the globe's outer orbit, so the day's list stays clean.
    const earlier = shown.filter((t) => t.date && t.date < today && t.date >= somedayLine());
    const someday = shown.filter((t) => t.date && t.date < somedayLine());
    const groups = [
      ['Today', shown.filter((t) => t.date === today)],
      ['Upcoming', shown.filter((t) => t.date && t.date > today)],
      ['No date', shown.filter((t) => !t.date && !t.backburner)],
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
    box.replaceChildren(...[rolloverTray(earlier, someday), ...groups.filter(([, items]) => items.length).map(group),
      burnerBar(shown.filter((t) => !t.date && t.backburner))].filter(Boolean));
  }

  // ---- the Backburner: tasks kept for later, with no date, folded up at the foot of the list
  const burnerOpen = () => { try { return localStorage.getItem('onyx.burner-open') === '1'; } catch { return false; } };

  function burnerBar(items) {
    if (!items.length) return null;
    const open = burnerOpen();
    const toggle = () => {
      try { localStorage.setItem('onyx.burner-open', open ? '0' : '1'); } catch { /* this visit only */ }
      renderTasks();
    };
    return h('section', { class: `burner${open ? ' open' : ''}` },
      h('div', {
        class: 'burner-head', role: 'button', tabindex: '0', 'aria-expanded': String(open),
        title: open ? 'Fold the backburner away' : 'Tasks kept for later: open to schedule one',
        onclick: toggle,
        onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } },
      }, icon('stove'), h('span', null, 'Backburner'), h('span', { class: 'sec-count' }, items.length), h('span', { class: 'grow' }),
        h('span', { class: 'burner-chev' }, open ? '▾' : '▸')),
      open && h('div', { class: 'task-cards' }, items.sort((a, b) => a.label.localeCompare(b.label)).map(taskRow)),
      open && h('div', { class: 'burner-hint' }, 'Pick a day on one to schedule it; it leaves the backburner.'));
  }

  // ---- the Rollover tray: tasks carried over from earlier days, folded up at the top
  const ROLLOVER_DAYS = 14;
  const somedayLine = () => ymd(addDays(new Date(), -ROLLOVER_DAYS));
  const rolloverOpen = () => { try { return localStorage.getItem('onyx.rollover-open') === '1'; } catch { return false; } };

  function rolloverTray(items, someday) {
    if (!items.length && !someday.length) return null;
    const open = rolloverOpen();
    const toggle = () => {
      try { localStorage.setItem('onyx.rollover-open', open ? '0' : '1'); } catch { /* this visit only */ }
      renderTasks();
    };
    const head = h('div', {
      class: `rollover-head${open ? '' : ' shut'}`, role: 'button', tabindex: '0', 'aria-expanded': String(open),
      title: 'Plans change. These are carried over from earlier days: schedule them, move them later, or let them go.',
      onclick: (e) => { if (!e.target.closest('.carry')) toggle(); },
      onkeydown: (e) => { if ((e.key === 'Enter' || e.key === ' ') && !e.target.closest('.carry')) { e.preventDefault(); toggle(); } },
    },
      icon('archive'), h('span', null, 'Carried over'), h('span', { class: 'sec-count' }, items.length), h('span', { class: 'grow' }),
      items.length > 1 && h('button', { class: 'carry', title: 'Schedule all of these for today', onclick: () => carryOver(items, 0) }, 'All to today'));
    return h('section', { class: 'rollover' }, head,
      open && h('div', { class: 'rollover-items' }, items.sort((a, b) => b.date.localeCompare(a.date)).map(rolloverRow)),
      open && someday.length > 0 && h('button', {
        class: 'rollover-someday', title: 'Untouched for two weeks: they rest in Someday, on the outer orbit of the globe',
        onclick: () => { if (!graph.on) $('#globe-toggle').click(); },
      }, `${someday.length} older ${someday.length === 1 ? 'one rests' : 'ones rest'} in Someday, on the globe`));
  }

  function rolloverRow(t) {
    const go = (fn, done, undo = () => moveToDay(t, t.date)) => async (e) => {
      e.stopPropagation();
      try {
        await fn();
        toast(done, '', { label: 'Undo', run: async () => { await undo().catch((err) => toast(err.message, 'error')); await loadTasks(true); refetch(true); } });
        await loadTasks(true);
        refetch(true);
      } catch (err) {
        toast(err.message, 'error');
      }
    };
    // Move to later: the date picker, as on the date chip.
    const later = h('input', { type: 'date', class: 'rollover-date', min: ymd(addDays(new Date(), 1)), tabindex: -1, 'aria-hidden': 'true' });
    later.addEventListener('click', (e) => e.stopPropagation());
    later.addEventListener('change', () => later.value && go(() => moveToDay(t, later.value), `"${t.label}" moved to ${fmtDay(fromYmd(later.value))}`)(new Event('x')));
    const series = t.series && !t.series.managed;
    return h('div', { class: 'rollover-item', css: { '--c': t.color } },
      h('div', { class: 'ri-body', onclick: (e) => openTask(t, e.currentTarget.getBoundingClientRect()) },
        h('div', { class: 'ri-name' }, t.label),
        h('div', { class: 'ri-from' }, `from ${fmtDay(fromYmd(t.date))}`, ...(t.tags || []).map((tag) => h('span', { class: 'mini-tag', css: { '--t': tagColor(tag) } }, ` #${tag}`)))),
      h('div', { class: 'ri-actions' },
        h('button', { class: 'ri-btn', title: 'Put it on today', onclick: go(() => moveToDay(t, ymd(new Date())), `"${t.label}" is on today`) }, 'Schedule today'),
        h('button', { class: 'ri-btn', title: 'Pick a later day', onclick: (e) => { e.stopPropagation(); try { later.showPicker(); } catch { later.focus(); later.click(); } } }, 'Move to later', later),
        h('button', {
          class: 'ri-btn soft', title: series ? 'A copy of a repeat: the next one comes by itself, so this one is ticked off' : 'Take the date off: it rests in Someday until you want it',
          onclick: series
            ? go(() => onyx.updateTask(t.id, { done: true }), `Let go of "${t.label}"`, () => onyx.updateTask(t.id, { done: false }))
            : go(() => onyx.updateTask(t.id, t.dateInName ? { title: t.label, due: null } : { due: null }), `Let go: "${t.label}" rests in Someday`),
        }, 'Let it go')));
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
    // Its time (kept in the name, which the Pi reads): empty for an all-day task.
    const when = !t.mirror && h('input', { type: 'time', value: t.time || '', step: 300, title: 'Time (leave empty for all day)' });
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
      const newTime = when ? when.value : t.time;
      if (date && date.value && (date.value !== (t.date || '') || (newTime || '') !== (t.time || ''))) {
        await onyx.moveTask(t.id, newTime ? { start: at(date.value, newTime).toISOString() } : { date: date.value });
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
      date && h('div', { class: 'row' }, icon('clock'), date, when, !t.time && h('small', { class: 'pop-meta' }, 'all day')),
      repeatPick && h('div', { class: 'row' }, icon('repeat'), repeatPick),
      t.series && !t.series.managed && h('button', { class: 'row goal-link series-link', css: { '--g': '#a9b4ff' }, title: 'Edit every copy of this repeating task', onclick: (e) => openSeries(t.series, e.currentTarget.getBoundingClientRect()) },
        icon('repeat'), h('span', null, h('b', null, seriesText(t.series)), ` · set in Google Tasks · ${t.series.count} open copies. Edit all`)),
      t.series && !t.series.managed && h('div', { class: 'row series-stop-row' },
        h('button', { class: 'btn danger', title: 'End this repeat: every open copy deleted, and the ones Google Tasks still adds', onclick: () => stopSeries(t.series) }, icon('x'), 'Stop all')),
      h('div', { class: 'row top' }, icon('note'), notes),
      h('div', { class: 'row' }, icon('tag'), tags.el),
      !t.mirror && breakdownField(t, notes),
      pomo && h('div', { class: 'row top' }, icon('clock'), pomo.el),
      S.settings.pi.enabled && t.provider === 'google' && h('div', { class: 'row pi-row' }, icon('phone'),
        h('div', { class: 'txt' }, h('b', null, 'Phone reminder'), h('small', { class: st.tone }, st.text))),
      h('div', { class: 'pop-actions' },
        h('button', { class: 'btn complete', title: 'Mark it done: it moves to the Archived tab (Undo brings it back)', onclick: () => { closePopover(); completeTask(t); } }, icon('check'), 'Complete'),
        !t.mirror && h('button', { class: 'btn danger', title: 'Delete it from your tasks', onclick: () => { if (confirm(`Delete "${t.label || t.title}"?`)) run(() => onyx.deleteTask(t.id)); } }, icon('trash'), 'Delete'),
        h('div', { class: 'grow' }),
        h('button', { class: 'btn primary', onclick: save }, 'Save')),
    ]);
    name.addEventListener('keydown', (e) => { if (e.key === 'Enter') save(); });
    notes.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) save(); });
  }

  // ---- Breakdown (the hammer): a task split into steps, as finely as the hammers say

  const breakdownLevel = () => { try { return Math.min(5, Math.max(1, Number(localStorage.getItem('onyx.breakdown-level')) || 3)); } catch { return 3; } };

  /** The Breakdown row in a task's window: 1-5 hammers, Break it down, then keep the steps as a checklist or as tasks. */
  function breakdownField(t, notes) {
    let level = breakdownLevel();
    let steps = [];
    const hammers = h('div', { class: 'hammers', role: 'radiogroup', 'aria-label': 'How finely to break it down' });
    const drawHammers = () => hammers.replaceChildren(...[1, 2, 3, 4, 5].map((n) => h('button', {
      type: 'button', class: `hammer${n <= level ? ' on' : ''}`, role: 'radio', 'aria-checked': String(n === level),
      title: ['A few broad steps', 'Simple steps', 'Clear steps', 'Detailed steps', 'Tiny micro-steps'][n - 1],
      onclick: () => { level = n; try { localStorage.setItem('onyx.breakdown-level', String(n)); } catch { /* this visit */ } drawHammers(); },
    }, icon('hammer'))));
    drawHammers();
    const out = h('div', { class: 'breakdown-out', hidden: true });
    const go = h('button', { class: 'btn', onclick: async () => {
      go.disabled = true;
      go.replaceChildren(icon('hammer'), 'Breaking it down…');
      try {
        steps = await onyx.breakdown(t.label || t.title, { level, notes: cleanNote(notes.value) });
        drawSteps();
      } catch (err) {
        toast(err.message, 'error');
      } finally {
        go.disabled = false;
        go.replaceChildren(icon('hammer'), steps.length ? 'Again' : 'Break it down');
      }
    } }, icon('hammer'), 'Break it down');
    const drawSteps = () => {
      out.hidden = !steps.length;
      out.replaceChildren(
        h('ol', null, steps.map((s) => h('li', null, s))),
        h('div', { class: 'row' },
          h('button', { class: 'btn', title: 'Add them to the notes as a checklist (the 2-minute breakdown uses it too)', onclick: () => {
            const list = steps.map((s) => `- [ ] ${s}`).join('\n');
            notes.value = cleanNote(notes.value) ? `${cleanNote(notes.value)}\n\n${list}` : list;
            notes.dispatchEvent(new Event('input'));
            toast('Added to the notes. Save to keep them.');
          } }, 'Add to notes'),
          h('button', { class: 'btn', title: 'Make each step a task of its own, in the same list and on the same day', onclick: async () => {
            try {
              for (const s of steps) await onyx.createTask({ title: s, listId: t.listId, ...(t.date ? { due: t.date } : {}), tags: t.tags || [] });
              toast(`${steps.length} steps added as tasks`);
              await loadTasks(true);
              refetch(true);
            } catch (err) { toast(err.message, 'error'); }
          } }, 'Make them tasks')));
    };
    return h('div', { class: 'row top breakdown-row' }, icon('hammer'),
      h('div', { class: 'txt' }, h('div', { class: 'breakdown-head' }, h('b', null, 'Breakdown'), hammers, go), out));
  }

  /**
   * A repeating task as one thing: its name, time and notes go to every open copy in
   * Google Tasks. How often it repeats can be changed here only for repeats Onyx keeps;
   * Google's API has no way to change the repeat of a task set up in Google Tasks.
   */
  /**
   * Stop all: a repeat ended for good. Google Tasks lets no other app end its repeats, so its
   * open copies are deleted and the ones it still adds (for two months) are deleted as they come.
   */
  async function stopSeries(s) {
    const what = s.managed ? 'ends the repeat and deletes its open copies' : `deletes every open copy (${s.count}), and the copies Google Tasks adds over the next two months`;
    if (!confirm(`Stop "${s.label}"?\n\nThis ${what}.`)) return;
    try {
      const res = await onyx.stopSeries(s.key);
      if (res.warnings?.length) toast(`Stopped, but: ${res.warnings.join('  ·  ')}`, 'warn');
      else toast(`Stopped "${s.label}": ${res.deleted} ${res.deleted === 1 ? 'copy' : 'copies'} deleted`);
      closePopover();
      await loadTasks(true);
      refetch(true);
    } catch (err) {
      toast(err.message, 'error');
    }
  }

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
        toast(`Let go of ${res.done} carried-over ${res.done === 1 ? 'copy' : 'copies'}`);
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
      h('div', { class: 'row series-stop-row' }, h('button', { class: 'btn danger', onclick: () => stopSeries(s) }, icon('x'), 'Stop all'),
        h('small', { class: 'pop-meta' }, s.managed ? 'Ends this repeat and deletes its open copies.' : 'Deletes every open copy, and the ones Google Tasks adds over the next two months.')),
      h('div', { class: 'row' }, icon('repeat'), rule, h('span', { class: 'dash' }, 'at'), time),
      h('p', { class: 'pop-meta' }, s.managed
        ? 'Onyx keeps this repeat: when it is done, the next one is added to Google Tasks.'
        : 'This repeats in Google Tasks, which does not let other apps change how often, so change that in the Google Tasks app. The name, time and notes here go to every open copy.'),
      h('div', { class: 'row top' }, icon('note'), notes),
      copies.length > 1 && h('div', { class: 'series-copies' }, copies.map((t) => h('span', { class: t.date && t.date < today ? 'late' : '' },
        t.date ? fmtDay(fromYmd(t.date)) : 'No date'))),
      h('div', { class: 'pop-actions' },
        s.overdue > 0 && !s.managed && h('button', { class: 'btn', title: 'Carried-over copies pile up in Google Tasks; this lets them go (the newest stays)', onclick: clear },
          icon('check'), `Let go of ${s.overdue} carried over`),
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

  // Backburner: the little purple switch with the stove. On, the new task gets no date and
  // goes to the Backburner bar at the foot of the list, to be scheduled by hand later.
  const burner = h('input', { type: 'checkbox', 'aria-label': 'Put it on the backburner' });
  const syncBurner = () => {
    $('#task-add').classList.toggle('burner-on', burner.checked);
    for (const el of [$('#task-date'), ...document.querySelectorAll('.quick-date')]) el.disabled = burner.checked;
  };
  burner.addEventListener('change', syncBurner);
  $('#task-date').parentElement.append(h('label', { class: 'burner-toggle', title: 'Backburner: no date, kept in the Backburner bar until you schedule it' },
    icon('stove'), h('span', { class: 'burner-word' }, 'Backburner'), h('span', { class: 'switch purple' }, burner, h('span'))));

  $('#task-add').addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = $('#task-title');
    const title = input.value.trim();
    if (!title) { input.focus(); return; }
    const later = burner.checked;
    const due = later ? '' : $('#task-date').value;
    input.value = '';
    try {
      const t = await onyx.createTask({ title, listId: $('#task-list').value || undefined, ...(later ? { backburner: true } : due ? { due } : {}) });
      $('#task-date').value = '';
      burner.checked = false;
      syncBurner();
      syncQuickDates();
      const when = t.start ? `${fmtDay(new Date(t.start))}, ${fmtTime(new Date(t.start))}` : t.date ? fmtDay(fromYmd(t.date)) : '';
      toast(later && !t.date ? 'On the backburner' : when ? `Added for ${when}` : 'Added');
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
      // With the Tamkeen switch on: news in the language Tamkeen is teaching (read on the PC).
      const mode = tamkeen.on && tamkeen.installed ? 'tamkeen' : '';
      const res = await onyx.news(force, mode);
      if (mode !== news.mode) { news.filter = 'all'; news.current = null; news.playing = false; }
      news.mode = mode;
      news.stories = res.stories;
      news.channels = res.channels;
      news.language = res.language || null;
      if (mode && res.noLanguage && !news.warnedLanguage) {
        news.warnedLanguage = true;
        toast('Tamkeen\'s language could not be read on your PC, so this is the usual news. Open Tamkeen on the PC once and pick what you are learning.', 'warn');
      }
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

  $('#news-tamkeen').addEventListener('click', async () => {
    tamkeen.on = !tamkeen.on;
    try { localStorage.setItem('onyx.news-tamkeen', tamkeen.on ? '1' : '0'); } catch { /* remembered for this visit only */ }
    renderTamkeen();
    await loadNews(); // the news in the language Tamkeen teaches, or the usual channels again
    toast(tamkeen.on
      ? `${news.language ? `${news.language.name} news, ` : ''}opening in Tamkeen`
      : 'The usual news, playing here again');
  });

  onyx.tamkeen?.info().then((info) => {
    tamkeen.installed = !!info?.installed;
    renderTamkeen();
    if (tamkeen.installed && tamkeen.on && newsOpen()) loadNews(); // the language's news, not the usual
    else if (news.current) renderPlayer();
  }).catch(() => {});

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
      h('div', { class: 'title', dir: 'auto' }, c.kind === 'live' ? h('span', { class: 'badge-live' }, 'LIVE') : null, c.kind === 'live' ? ` ${c.channel}` : c.title),
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
    $('#news-filter').replaceChildren(...[
      news.language && h('div', { class: 'news-lang', title: 'The language Tamkeen is set to teach. Turn the Tamkeen switch off for the usual channels.' },
        `${news.language.name} news · from what you are learning in Tamkeen`),
      h('div', { class: 'news-chips' },
        chip('All', news.filter === 'all', () => pick('all')),
        on.map((c) => chip(c.name, news.filter === c.id, () => pick(c.id)))),
      live.length > 0 && h('div', { class: 'news-chips', title: 'Channels with a 24/7 live stream' },
        h('span', { class: 'news-chips-label' }, 'Live'),
        live.map((c) => chip(c.name, news.current?.kind === 'live' && news.current.channelId === c.id && news.playing,
          () => play({ kind: 'live', channelId: c.id, channel: c.name }), 'live'))),
    ].filter(Boolean));
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
        thumb, h('div', null, h('div', { class: 't', dir: 'auto' }, s.title), h('div', { class: 'm' }, h('b', null, s.channel), ` · ${ago(s.published)}`)));
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

  // A panel dragged 30% narrower than it can go snaps shut to a slim tab at its edge; a click
  // on the tab opens it again at its width. (News already folds to its own tab.)
  const SNAP = 0.7;
  const TAB_W = 30;
  const collapsed = (k) => !!S?.settings?.collapsed?.[k];

  function setCollapsed(key, on) {
    if (key === 'news') { setNewsOpen(!on); return; }
    S.settings.collapsed = { ...(S.settings.collapsed || {}), [key]: on };
    saveSettings({ collapsed: { [key]: on } }, true);
    applyPanelWidths();
    calendar?.updateSize();
  }

  function applyPanelWidths() {
    if (MOBILE) return;
    const saved = S?.settings?.panels || {};
    for (const k of ['side', 'tasks']) $('#layout').classList.toggle(`${k}-collapsed`, collapsed(k));
    // When room is short, Tasks gives way first, then the sidebar, then News.
    for (const k of ['tasks', 'side', 'news']) {
      $('#layout').style.setProperty(PANELS[k].prop, `${collapsed(k) ? TAB_W : clampPanel(k, saved[k] || PANELS[k].def)}px`);
    }
  }

  function savePanelWidth(key, px) {
    S.settings.panels = { ...(S.settings.panels || {}), [key]: px };
    saveSettings({ panels: { [key]: px } }, true);
  }

  if (!MOBILE) {
    for (const [key, p] of Object.entries(PANELS)) {
      const grip = h('div', { class: `panel-grip ${key}`, title: 'Drag to resize (far past its narrowest, it snaps shut to a tab) · double-click for the usual width' });
      p.grip().prepend(grip);
      // The tab a shut panel becomes (News has its own).
      if (key !== 'news') {
        const label = key === 'side' ? 'Calendars' : 'Tasks';
        p.el().prepend(h('button', { class: `panel-tab ${key}`, title: `Open ${label.toLowerCase()}`, onclick: () => setCollapsed(key, false) },
          icon(key === 'side' ? 'calendar' : 'tasks'), h('span', { class: 'panel-tab-label' }, label)));
      }
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
        let snap = false;
        const move = (ev) => {
          const dx = ev.clientX - startX;
          const wanted = startW + (p.edge === 'left' ? -dx : dx);
          // Far past its narrowest: it will snap shut when let go (it fades to say so).
          snap = wanted < p.min * SNAP;
          p.el().classList.toggle('snap-ready', snap);
          width = clampPanel(key, wanted);
          $('#layout').style.setProperty(p.prop, `${width}px`);
          if (!frame) frame = requestAnimationFrame(() => { frame = 0; calendar?.updateSize(); });
        };
        const up = () => {
          grip.removeEventListener('pointermove', move);
          grip.removeEventListener('pointerup', up);
          grip.removeEventListener('pointercancel', up);
          grip.classList.remove('on');
          document.body.classList.remove('resizing');
          p.el().classList.remove('snap-ready');
          if (snap) {
            $('#layout').style.setProperty(p.prop, `${clampPanel(key, startW)}px`); // its width, for when it opens again
            setCollapsed(key, true);
            return;
          }
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

  /** Settings: the Claude API key Breakdown uses (kept on the PC, shared with linked desktops). */
  function aiCard() {
    const ready = S.ai?.ready;
    const key = h('input', { type: 'password', placeholder: 'Claude API key (sk-ant-…)', spellcheck: false, autocomplete: 'off' });
    return h('div', { class: 'card' },
      h('h4', null, 'AI for Breakdown', ready && h('span', { class: 'badge ok' }, 'Key saved')),
      h('p', null, 'Breakdown (the hammer in a task\'s window) splits a task into steps with Claude, using your own API key. Get one at console.anthropic.com → API keys. Only the task\'s name and notes are sent.'),
      h('div', { class: 'row' }, key,
        h('button', { class: 'btn', onclick: () => onyx.open('https://console.anthropic.com/settings/keys') }, 'Get a key'),
        h('button', { class: 'btn primary', onclick: () => act(() => onyx.setAiKey(key.value), 'Key saved') }, 'Save'),
        ready && h('button', { class: 'btn danger', onclick: () => act(() => onyx.setAiKey(''), 'Key removed') }, 'Remove')));
  }

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
      // The saved choice first; the PC's summary for what it worked out (the Pi for an older setup) and the token.
      const c = { ...(S.calls || {}), ...(S.settings.calls || {}), twilioToken: !!S.calls?.twilioToken };
      c.method = S.settings.calls?.method || S.calls?.method || 'alarm';
      const setCalls = (patch) => saveSettings({ calls: patch });
      const METHOD = [
        ['alarm', 'Alarm on my phone', 'The Onyx app on your Android phone rings a full-screen alarm and vibrates until you press a button. Nothing to set up, no account.'],
        ['ntfy', 'Push notification (free)', 'This PC sends a loud push to the free ntfy app on your phone. Install ntfy, subscribe to a topic of your own, and type the same topic here.'],
        ['twilio', 'Phone call (Twilio)', 'This PC phones you through a Twilio account (pay as you go, about 1–2 cents a call). Needs a Twilio number.'],
        ['pi', 'Raspberry Pi (advanced)', 'A Raspberry Pi of your own reads a Google Tasks list and phones you, even with this PC off.'],
      ];
      const testBtn = (kind, label) => h('button', { class: 'btn', onclick: () => act(() => onyx.testCall(kind), kind === 'push' ? 'Test sent' : 'Calling you now') }, label);
      const token = h('input', { type: 'password', placeholder: c.twilioToken ? 'Saved (type to replace)' : 'Auth token', autocomplete: 'off' });
      return [
        h('h3', null, 'Calls & alerts'),
        h('p', { class: 'lead' }, 'How Onyx reaches you about what is coming up, so nothing slips by. Pick the way that suits you; each entry\'s Escalation (Push only, Voice call, Critical, Alarm) then goes out this way.'),
        h('div', { class: 'card method-pick' }, METHOD.map(([v, name, hint]) => h('label', { class: `method${c.method === v ? ' on' : ''}` },
          h('input', { type: 'radio', name: 'call-method', checked: c.method === v, onchange: () => setCalls({ method: v }) }),
          h('div', { class: 'txt' }, h('b', null, name), h('small', null, hint))))),
        c.method === 'ntfy' && h('div', { class: 'card' },
          h('h4', null, 'Push notifications with ntfy'),
          h('ol', { class: 'steps' },
            h('li', null, 'Install the free ntfy app on your phone (Play Store / App Store).'),
            h('li', null, 'In ntfy, tap + and subscribe to a topic only you would guess, like onyx-yourname-4821.'),
            h('li', null, 'Type the same topic below and press Send a test.')),
          field('Topic', 'Anyone who knows the topic can read it, so make it hard to guess.',
            h('input', { type: 'text', value: c.ntfyTopic, placeholder: 'onyx-yourname-4821', spellcheck: false, onchange: (e) => setCalls({ ntfyTopic: e.target.value.trim() }) })),
          field('Server', 'ntfy.sh unless you run your own.', h('input', { type: 'text', value: c.ntfyServer, spellcheck: false, onchange: (e) => setCalls({ ntfyServer: e.target.value.trim() || 'https://ntfy.sh' }) })),
          h('div', { class: 'row' }, testBtn('push', 'Send a test'), h('small', { class: 'pop-meta' }, 'This PC sends them, so it needs to be on (in the tray is fine).'))),
        c.method === 'twilio' && h('div', { class: 'card' },
          h('h4', null, 'Phone calls with Twilio'),
          h('ol', { class: 'steps' },
            h('li', null, 'Sign up at twilio.com and buy a phone number (about $1 a month).'),
            h('li', null, 'From the Twilio console, copy the Account SID and Auth token.'),
            h('li', null, 'Fill them in below with your Twilio number and your own number (with country code, like +15551234567), then Call me now.')),
          field('Account SID', null, h('input', { type: 'text', value: c.twilioSid, spellcheck: false, placeholder: 'AC…', onchange: (e) => setCalls({ twilioSid: e.target.value.trim() }) })),
          field('Auth token', 'Kept with Onyx\'s other keys, on this PC.', h('span', { class: 'row' }, token, h('button', { class: 'btn', onclick: () => act(() => onyx.setTwilioToken(token.value), 'Token saved') }, 'Save'))),
          field('Your Twilio number', null, h('input', { type: 'tel', value: c.twilioFrom, placeholder: '+15550001111', onchange: (e) => setCalls({ twilioFrom: e.target.value.trim() }) })),
          field('Call this number', 'Your phone.', h('input', { type: 'tel', value: c.callTo, placeholder: '+15551234567', onchange: (e) => setCalls({ callTo: e.target.value.trim() }) })),
          field('Push too (optional)', 'Push only reminders go to ntfy if you add a topic; otherwise they ring too.', h('input', { type: 'text', value: c.ntfyTopic, placeholder: 'ntfy topic', onchange: (e) => setCalls({ ntfyTopic: e.target.value.trim() }) })),
          h('div', { class: 'row' }, testBtn('call', 'Call me now'), h('small', { class: 'pop-meta' }, 'This PC places the calls, so it needs to be on (in the tray is fine).'))),
        c.method === 'alarm' && h('div', { class: 'card' },
          h('h4', null, 'Alarms on your phone'),
          h('ol', { class: 'steps' },
            h('li', null, 'Install Onyx on your Android phone and pair it (Settings → Phone).'),
            h('li', null, 'Open Onyx on the phone once; it sets the alarms with Android\'s alarm clock.'),
            h('li', null, 'Give an entry the Alarm escalation, or keep "Alarm as things start" on in the phone\'s Settings → Home & lock screen.'))),
        c.method === 'pi' && h('div', { class: 'card' },
          field('Show Pi phone reminders', 'Adds the phone switch to blocks and events, and shows which tasks the Pi will call about.', toggle(pi.enabled, (v) => set({ enabled: v }))),
          field('Task list for reminders', lists.length ? 'Where the matching tasks are kept. The Pi reads every list.' : 'Connect a Google account first.',
            h('select', { disabled: !lists.length, value: pi.taskList, onchange: (e) => set({ taskList: e.target.value }) },
              lists.map((c) => h('option', { value: c.id, selected: c.id === pi.taskList }, c.name)))),
          field('Call this long before', 'Minutes. Must match lead_minutes in the Pi\'s config.json.',
            h('input', { type: 'number', min: 5, max: 720, value: pi.leadMinutes, onchange: (e) => set({ leadMinutes: Number(e.target.value) }) })),
          field('The Pi looks every', 'Minutes between its checks (its cron job). A call comes at the last check before the time asked, so every 5 minutes lands leave-by calls right on time.',
            h('select', { onchange: (e) => set({ checkEvery: Number(e.target.value) }) },
              [5, 10, 15, 30].map((m) => h('option', { value: m, selected: (pi.checkEvery || 30) === m }, `${m} minutes`)))),
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

    // Onyx Home (the phone's launcher) and Onyx on the lock screen: the Android app only.
    launcher() {
      const box = h('div', { class: 'card' }, h('p', null, 'Checking…'));
      const allow = (on, what, label) => (on
        ? h('span', { class: 'badge ok' }, 'On')
        : h('button', { class: 'btn', onclick: () => onyx.launcher.open(what) }, label || 'Allow'));
      const draw = (info) => {
        const lock = info.show === 'lock' || info.show === 'both';
        box.replaceChildren(...[
          field('Show Onyx on', 'Your progress bars, the time until your next task, and the Pi\'s calls as they ring.',
            h('select', { onchange: (e) => onyx.launcher.set(e.target.value).then(draw).catch((err) => toast(err.message, 'error')) },
              [['home', 'Home screen'], ['lock', 'Lock screen'], ['both', 'Home and lock screen'], ['off', 'Neither']]
                .map(([v, n]) => h('option', { value: v, selected: v === info.show }, n)))),
          field('Onyx Home', info.isHome
            ? 'Onyx Home is your home screen: your apps (swipe up), a dock, widgets and search. Hold an empty spot for its options.'
            : 'A plain home screen with Onyx on it: your apps (swipe up), a dock, widgets and search. Make it your home app to use it.',
            h('div', { class: 'row' },
              h('button', { class: 'btn', onclick: () => onyx.launcher.open('launcher') }, 'Preview'),
              h('button', { class: info.isHome ? 'btn' : 'btn primary', onclick: () => onyx.launcher.open('home') }, info.isHome ? 'Change home app' : 'Make it my home app'))),
          field('Alarm for everything as it starts', 'On top of each entry\'s own Escalation: every timed entry and task rings the full-screen alarm as it starts. Off, only entries set to Alarm ring your phone.',
            toggle(info.alarm === true, (v) => onyx.launcher.setAlarm(v).then(draw).catch((err) => toast(err.message, 'error')))),
          lock && field('Notifications', 'The lock screen shows what is on now, its progress bar and a countdown to the next thing as a live notification.', allow(info.notifications, 'notifications')),
          lock && field('Over the lock screen', 'Brings the full Onyx panel up over the lock screen each time the screen turns on ("Display over other apps").', allow(info.overlay, 'overlay')),
          lock && !info.overlay && h('div', { class: 'restricted-guide' },
            h('b', null, 'Switch greyed out?'),
            h('p', null, 'Android locks this switch for apps installed from a download. To unlock it:'),
            h('ol', null,
              h('li', null, 'Tap App info below (Settings → Apps → Onyx Calendar).'),
              h('li', null, 'Tap ⋮ at the top right, then Allow restricted settings, and confirm with your PIN or fingerprint.'),
              h('li', null, 'If that option is missing, tap the greyed-out switch once first, then look again.'),
              h('li', null, 'Come back here and tap Allow: the switch turns on now.')),
            h('button', { class: 'btn', onclick: () => onyx.launcher.open('appinfo') }, 'App info')),
          field('Full-screen alarms', 'An alarm (and a call from the Pi) wakes the phone and fills the screen. Without it, it still rings and shakes, as a notification.', allow(info.fullScreen, 'fullscreen')),
        ].filter(Boolean));
      };
      const load = () => onyx.launcher.info().then(draw).catch(() => box.replaceChildren(h('p', null, 'Update the Onyx app to use this.')));
      load();
      // Back from Android's settings: show what changed.
      const back = () => { if (!box.isConnected) document.removeEventListener('visibilitychange', back); else if (!document.hidden) load(); };
      document.addEventListener('visibilitychange', back);
      return [
        h('h3', null, 'Home & lock screen'),
        h('p', { class: 'lead' }, 'Onyx on the screen you see most: your home screen, your lock screen, or both.'),
        box,
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
          field('Transition buffers', 'A striped 15 minutes after a meeting that another one follows: time to get from one to the next. The only stripes on the calendar.',
            toggle(s.buffers !== false, (v) => saveSettings({ buffers: v }).then(() => refetch()))),
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
        h('h3', null, 'Notion, Drive & AI'),
        aiCard(),
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
        aiCard(),
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
      ? [['connection', 'Connection'], ['keys', 'Keys & accounts'], ['pi', 'Calls & alerts'], ...(onyx.launcher ? [['launcher', 'Home & lock screen']] : []), ['general', 'General']]
      : [['calendars', 'Calendars'], ['connections', 'Notion, Drive & AI'], ['phone', 'Phone'], ['desktops', 'Desktops'], ['pi', 'Calls & alerts'], ['mcp', 'MCP server'], ['general', 'General']];
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
    show: { tasks: true, goals: true, notes: true, notion: true, drive: true, web: true, local: true, email: true }, // what joins the calendar entries
    lib: { notes: [], pins: [] },
    events: [],          // the last range's entries, so the clusters can be redrawn without fetching
    hidden: readHidden(), // tag clusters switched off in the Clusters tab ('' stands for untagged)
    clustersOpen: false,
    inbox: [],           // what has no tag and no date to place it: kept off the globe, in the Inbox drawer
    inboxOpen: false,
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
    email: { label: 'Emails', color: '#ff8fa3' },
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
   * Where an untagged task starts out on the globe: Carried over, Someday (two weeks and older,
   * on the outer orbit), Today, Tomorrow, its day, or No date.
   * Only a starting place: dragging it onto a tag or another day moves it.
   */
  function dueGroup(date) {
    const today = ymd(new Date());
    if (!date) return ['due:none', 'No date', '#8a8a94'];
    if (date < somedayLine()) return ['due:someday', 'Someday', '#6B7280'];
    if (date < today) return ['due:overdue', 'Carried over', '#8b93c9'];
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
          notes: `${seriesText(s)}${s.managed ? '' : ' (set in Google Tasks)'}\n${s.count} open ${s.count === 1 ? 'copy' : 'copies'}${s.overdue ? `, ${s.overdue} carried over` : ''}`,
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
    // Starred Gmail and flagged Outlook emails from these days: their own cluster, or their tags.
    if (graph.show.email) {
      for (const m of graph.emails || []) {
        if (!matchesFilter(m.tags)) continue;
        items.push(sourceItem('email', {
          id: m.id, title: m.subject, tags: m.tags, kind: 'email', shape: 'square', email: m,
          notes: `From ${m.from} · ${fmtDay(new Date(m.date))}${m.preview ? `\n\n${m.preview}` : ''}`,
        }));
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
      const [ev, lib, mail] = await Promise.all([
        onyx.events(range[0].toISOString(), range[1].toISOString()), onyx.globe(),
        onyx.emails ? onyx.emails(range[0].toISOString(), range[1].toISOString()).catch((err) => ({ emails: [], problems: [err.message] })) : null,
      ]);
      events = ev.events;
      graph.lib = lib;
      if (mail) {
        graph.emails = mail.emails || [];
        // Each account's problem once (an account to connect again for its emails).
        for (const p of mail.problems || []) if (!graph.mailWarned?.has(p)) { (graph.mailWarned ||= new Set()).add(p); toast(p, 'warn'); }
      }
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
    const all = graphItems(graph.events);
    // Clustered by tag, the unorganised (no tag, and no date or source to stand in for one)
    // wait in the Inbox drawer instead of piling up as an Untagged / No date cluster.
    const unsorted = (it) => graph.groupBy === 'tags' && !(it.tags || []).length && (!it.home || it.home[0] === 'due:none');
    // Something already done needs no sorting: done and untagged, it is left out altogether.
    const finished = (it) => unsorted(it) && (it.src?.done || it.task?.done);
    graph.inbox = all.filter((it) => unsorted(it) && !finished(it));
    const items = all.filter((it) => !unsorted(it));
    renderInbox();
    const data = OnyxGraph.build(items, {
      groupBy: graph.groupBy, tagColor,
      dayLabel: (key) => fromYmd(key).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' }),
    });
    graph.view.setData(data);
    const clusters = data.nodes.filter((n) => n.hub).length;
    $('#graph-stats').textContent = items.length ? `${items.length} ${items.length === 1 ? 'item' : 'items'}  ·  ${clusters} ${clusters === 1 ? 'cluster' : 'clusters'}` : '';
    $('#graph-empty').hidden = items.length > 0 || graph.inbox.length > 0;
  }

  // ---- the Inbox drawer: what is not organised yet, off the globe

  let draggedInbox = null; // an Inbox item being dragged onto a cluster

  function renderInbox() {
    const box = $('#graph-inbox');
    const items = graph.inbox;
    box.hidden = graph.groupBy !== 'tags';
    if (box.hidden) return;
    const n = items.length;
    const head = h('button', {
      class: `inbox-tab${n ? ' has' : ' clear'}`, 'aria-expanded': String(graph.inboxOpen),
      title: n ? 'Things with no tag and no date. Drag one onto a cluster to tag it, or click it to open it' : 'Nothing waiting: everything has a place',
      onclick: () => { graph.inboxOpen = !graph.inboxOpen; renderInbox(); },
    }, icon(n ? 'note' : 'check'), 'Inbox', h('span', { class: 'count' }, n ? String(n) : 'clear'));
    box.classList.toggle('open', graph.inboxOpen && n > 0);
    if (!graph.inboxOpen || !n) { box.replaceChildren(head); return; }
    const kindIcon = (it) => icon(it.kind === 'task' ? 'check' : it.kind === 'note' ? 'note' : 'calendar');
    const when = (it) => (it.start ? (it.allDay || it.start.length === 10 ? fmtDay(fromYmd(it.start.slice(0, 10))) : `${fmtDay(new Date(it.start))}, ${fmtTime(new Date(it.start))}`) : 'No date');
    const row = (it) => h('div', {
      class: 'inbox-row', css: { '--c': it.color || '#8a8a94' }, draggable: !MOBILE, title: 'Drag onto a cluster to tag it, or click to open',
      onclick: (e) => pickFromGraph(it, e.currentTarget.getBoundingClientRect()),
      ondragstart: (e) => { draggedInbox = it; e.dataTransfer.setData('text/plain', it.title); e.dataTransfer.effectAllowed = 'move'; },
      ondragend: () => { draggedInbox = null; graph.view?.dragOver(); },
    }, kindIcon(it), h('span', { class: 'name' }, it.title), h('span', { class: 'when' }, when(it)));
    box.replaceChildren(head, h('div', { class: 'inbox-body' },
      h('p', { class: 'inbox-tip' }, 'No tag and no date yet. Drag each onto a cluster to give it that tag.'),
      items.map(row)));
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
    const filesDragged = (e) => !draggedTask && !draggedInbox && !!onyx.addFiles && [...(e.dataTransfer?.types || [])].includes('Files');
    const draggedLabel = () => (draggedTask ? draggedTask.label : draggedInbox?.title);
    box.addEventListener('dragover', (e) => {
      if (filesDragged(e) && graph.view) {
        e.preventDefault();
        const hit = graph.view.dragOver(e.clientX, e.clientY, 'Add to the globe');
        e.dataTransfer.dropEffect = 'copy';
        return hit;
      }
      if ((!draggedTask && !draggedInbox) || !graph.view) return;
      e.preventDefault();
      const hit = graph.view.dragOver(e.clientX, e.clientY, draggedLabel());
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
      if ((!draggedTask && !draggedInbox) || !graph.view) return;
      e.preventDefault();
      const t = draggedTask;
      const item = t ? globeItemFor(t) : draggedInbox;
      const hit = graph.view.dragOver(e.clientX, e.clientY, draggedLabel());
      taskDragEnd();
      draggedInbox = null;
      if (!hit) return toast('Drop it on a cluster.');
      await moveOnGlobe(item, hit.key, null, hit.label);
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
    } else if (item.kind === 'email') {
      onyx.open(item.email.link); // opens it in Gmail or Outlook
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
      if (item.kind === 'email') { item.email.tags = next; return onyx.setTags(item.id, next); }
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
        if (raw === 'overdue' || raw === 'someday') throw new Error('Drop it on Today, Tomorrow, another day or No date.');
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
    const newMenu = (e) => {
      const anchor = e.currentTarget.getBoundingClientRect();
      const item = (ico, label, sub, fn) => h('button', { class: 'menu-item', onclick: () => { closePopover(); fn(anchor); } },
        icon(ico), h('span', null, h('b', null, label), h('small', null, sub)));
      showPopover(anchor, [h('div', { class: 'new-menu' },
        item('note', 'Note', 'Written here in Onyx', (r) => openNote(null, r)),
        item('link', 'Notion page', 'Pin a page from Notion', (r) => openPicker('notion', r)),
        item('link', 'Drive file', 'Pin a file from Google Drive', (r) => openPicker('drive', r)),
        item('link', 'Link', 'Any web address', (r) => openAddLink(r)),
        onyx.pickFiles && item('pin', 'File or folder', 'From this PC', (r) => openAddFile(r)))]);
    };
    graph.barOpen ??= readBarOpen();
    const open = graph.barOpen;
    const toggle = h('button', {
      class: `icon-btn bar-toggle ${open ? 'open' : ''}`, title: open ? 'Fewer options' : 'More options: clusters, what to show, and adding items',
      'aria-expanded': String(open), onclick: () => { graph.barOpen = !open; saveBarOpen(); renderGraphBar(); },
    }, icon('down'));
    $('#graph-bar').classList.toggle('folded', !open);
    $('#graph-bar').replaceChildren(h('div', { class: 'bar-row' },
      // Left: the period (the lens on time).
      h('div', { class: 'bar-zone lens' },
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
        MOBILE && h('div', { class: 'bar-spacer' }), toggle),
      // Middle: how it is sliced (cluster by) and what joins in (show).
      open && h('div', { class: 'bar-zone slice' },
        h('span', { class: 'bar-label' }, 'Cluster by'),
        seg([['tags', 'Tags'], ['calendars', 'Sources'], ['days', 'Days']], graph.groupBy, (g) => { graph.groupBy = g; renderGraphBar(); loadGraph(); })),
      open && h('div', { class: 'bar-zone slice' },
        h('span', { class: 'bar-label' }, 'Show'),
        h('div', { class: 'chip-group' },
          chip('tasks', 'Tasks', 'Tasks that have no date'),
          chip('goals', 'Goals', 'Long-term goals: one node each, standing for all of its steps'),
          chip('notes', 'Notes', 'Notes written in Onyx'),
          chip('notion', 'Notion', 'Notion pages pinned to the globe'),
          chip('drive', 'Drive', 'Google Drive files pinned to the globe'),
          chip('web', 'Links', 'Web links pinned to the globe'),
          chip('local', 'Files', 'Files and folders from this PC pinned to the globe'),
          chip('email', 'Emails', 'Starred Gmail and flagged Outlook emails from these days'))),
      // Right: one menu for everything that adds an item.
      open && h('div', { class: 'bar-zone create' },
        h('button', { class: 'btn primary add-btn', title: 'Add a note, a Notion page, a Drive file, a link or a file', onclick: newMenu }, icon('plus'), 'New'))));
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
    setInterval(() => { tickPomodoro(); tickNext(); tickPopups(); tickDue(); }, 1000);
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
