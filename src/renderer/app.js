/* global FullCalendar, onyx */
(() => {
  'use strict';

  // Titles, notes and locations come from outside calendars, so they are only
  // ever written with text nodes (h() below), never as HTML.

  const ICONS = {
    left: '<path d="M15 6l-6 6 6 6"/>',
    right: '<path d="M9 6l6 6-6 6"/>',
    refresh: '<path d="M20 12a8 8 0 1 1-2.34-5.66"/><path d="M20 4v5h-5"/>',
    sliders: '<path d="M4 7h9M19 7h1M4 17h1M11 17h9"/><circle cx="16" cy="7" r="2.4"/><circle cx="8" cy="17" r="2.4"/>',
    tasks: '<rect x="4" y="4" width="16" height="16" rx="4.5"/><path d="M8.5 12.3l2.4 2.4 4.6-5"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    phone: '<path d="M6.5 3.5h3l1.5 4-2 1.5a12 12 0 0 0 6 6l1.5-2 4 1.5v3a2 2 0 0 1-2.2 2A17 17 0 0 1 4.5 5.7a2 2 0 0 1 2-2.2z"/>',
    x: '<path d="M6 6l12 12M18 6L6 18"/>',
    trash: '<path d="M4 7h16M9 7V4h6v3M6.5 7l1 13h9l1-13"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
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
  }

  /** A row of tag chips with a text box to add more. get() returns the tags. */
  function tagField(initial) {
    let tags = [...(initial || [])];
    const listId = `tags-${Math.random().toString(36).slice(2)}`;
    const input = h('input', { type: 'text', placeholder: tags.length ? 'Add tag' : 'Add tags…', spellcheck: false, autocomplete: 'off', list: listId });
    const chips = h('span', { class: 'chips' });
    const box = h('div', { class: 'tags-field', onclick: () => input.focus() }, chips, input,
      h('datalist', { id: listId }, S.tags.map((t) => h('option', { value: t.name }))));
    const draw = () => {
      chips.replaceChildren(...tags.map((t) => h('span', { class: 'chip', css: { '--t': tagColor(t) } }, `#${t}`,
        h('button', { type: 'button', title: 'Remove tag', onclick: (e) => { e.stopPropagation(); tags = tags.filter((x) => x !== t); draw(); } }, icon('x')))));
      input.placeholder = tags.length ? 'Add tag' : 'Add tags…';
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
    input.addEventListener('change', () => { if (S.tags.some((t) => t.name === input.value)) add(); });
    draw();
    return { el: box, get: () => { if (input.value.trim()) add(); return tags; } };
  }

  const sameTags = (a, b) => (a || []).join('\n') === (b || []).join('\n');

  const fmtTime = (d) => d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: S.settings.hour12 });
  const fmtDay = (d) => d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
  const quietLabel = () => `${fmtTime(at('2000-01-01', S.settings.pi.quietStart))} to ${fmtTime(at('2000-01-01', S.settings.pi.quietEnd))}`;

  function toast(message, kind = '') {
    const el = h('div', { class: `toast ${kind}` }, message);
    $('#toasts').append(el);
    setTimeout(() => el.remove(), kind ? 7000 : 3200);
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

  function piCallTime(start) {
    const pi = S.settings.pi;
    const half = 30 * 60000;
    const callAt = new Date(Math.ceil((start.getTime() - (pi.leadMinutes + 2) * 60000) / half) * half);
    const mins = (v) => { const [a, b] = v.split(':').map(Number); return a * 60 + b; };
    const t = callAt.getHours() * 60 + callAt.getMinutes();
    const qs = mins(pi.quietStart), qe = mins(pi.quietEnd);
    return { at: callAt, quiet: qs > qe ? (t >= qs || t < qe) : (t >= qs && t < qe) };
  }

  const hasGoogleTasks = () => S.calendars.some((c) => c.kind === 'tasklist' && c.provider === 'google');

  /** What the Pi will do for something starting at `start`: { text, tone, allowed }. */
  function piStatus(start, allDay) {
    if (!hasGoogleTasks()) return { text: 'Connect Google in Settings. The Pi reads Google Tasks.', tone: '', allowed: false };
    if (allDay) return { text: 'Needs a start time, so not for all-day entries.', tone: '', allowed: false };
    if (start <= new Date()) return { text: 'This has already started.', tone: '', allowed: false };
    const call = piCallTime(start);
    if (call.quiet) return { text: `Would ring at ${fmtTime(call.at)}, inside quiet hours (${quietLabel()}), so the Pi skips it.`, tone: 'warn', allowed: true };
    return { text: `The Pi phones you at ${fmtTime(call.at)}${sameDay(call.at, start) ? '' : ' the day before'}.`, tone: 'ok', allowed: true };
  }

  // ------------------------------------------------------------ calendar grid

  const visible = (id) => !S.settings.hidden[id];

  function toFc(e) {
    return {
      id: e.id, title: e.title, start: e.start, end: e.end, allDay: e.allDay,
      backgroundColor: e.color, borderColor: e.color,
      editable: e.writable && e.kind === 'event',
      classNames: [e.kind === 'task' ? 'is-task' : 'is-event', matchesFilter(e.tags) ? '' : 'is-dim'],
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
  }

  function eventContent(arg) {
    const src = arg.event.extendedProps.src;
    // The block being dragged out has no entry behind it yet: show just its times.
    if (!src) return { domNodes: [h('div', { class: 'ev' }, h('div', { class: 'ev-title' }, h('span', { class: 't' }, arg.timeText || 'New block')))] };
    const title = h('div', { class: 'ev-title' },
      src.kind === 'task' && h('span', { class: 'dot' }),
      h('span', { class: 't' }, arg.event.title),
      src.piCall && icon('phone'),
      src.kind === 'event' && !src.writable && icon('lock'),
      src.tags?.length > 0 && h('span', { class: 'tagdots', title: src.tags.map((t) => `#${t}`).join(' ') },
        src.tags.slice(0, 4).map((t) => h('i', { css: { '--t': tagColor(t) } }))));
    return { domNodes: [h('div', { class: 'ev' }, title, arg.timeText && h('div', { class: 'ev-time' }, arg.timeText))] };
  }

  async function onMove(info) {
    const e = info.event;
    const src = e.extendedProps.src;
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
      ...timeFormats(),
      // Drag across the grid to block out time; the highlight stays until the editor closes.
      selectable: true,
      selectMirror: true,
      unselectAuto: false,
      editable: true,
      events: source,
      eventContent,
      eventDidMount: (arg) => arg.el.style.setProperty('--c', arg.event.extendedProps.src?.color || '#8b7cff'),
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
        const src = info.event.extendedProps.src;
        const anchor = info.el.getBoundingClientRect();
        if (src.kind === 'task') openTask(tasks.find((t) => t.id === src.id) || { id: src.id, title: src.title, label: src.title, listName: src.calendarName }, anchor);
        else openEditor({ src, start: toDate(src.start), end: toDate(src.end), allDay: src.allDay }, anchor);
      },
      eventDrop: onMove,
      eventResize: onMove,
      datesSet: (info) => {
        if (!graph.on) $('#range').textContent = info.view.title;
        for (const b of document.querySelectorAll('[data-view]')) b.classList.toggle('on', !graph.on && b.dataset.view === info.view.type);
        if (S.settings.view !== info.view.type) saveSettings({ view: info.view.type }, true);
        miniMonth = calendar.getDate();
        renderMini();
      },
    });
    calendar.render();
  }

  const pointRect = (ev) => {
    const x = ev ? ev.clientX : innerWidth / 2, y = ev ? ev.clientY : innerHeight / 2;
    return { left: x, right: x, top: y, bottom: y };
  };

  // ------------------------------------------------------------ popover

  function showPopover(anchor, nodes, onClose, { wide = false } = {}) {
    closePopover();
    const pop = $('#popover');
    pop.classList.toggle('wide', wide);
    pop.replaceChildren(...nodes.filter((n) => n && n.nodeType));
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
    const notes = h('textarea', { rows: 2, placeholder: 'Notes', value: src ? src.notes : '', disabled: readOnly });
    const call = h('input', { type: 'checkbox', checked: !!src?.piCall });
    const callHint = h('small');
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

    const sync = () => {
      const r = range();
      for (const el of [startTime, endTime, dash]) el.hidden = r.allDay;
      untilRow.hidden = !r.allDay && !multiDay;
      const st = piStatus(r.at, r.allDay);
      callHint.textContent = st.text;
      callHint.className = st.tone;
      call.disabled = !st.allowed && !call.checked;
    };
    for (const el of [date, startTime, endTime, endDate, allDay]) el.addEventListener('input', sync);

    const save = async () => {
      if (busy) return;
      busy = true;
      const r = range();
      const data = {
        title: title.value.trim(), start: r.start, end: r.end, allDay: r.allDay, calendarId: calendarPick.value,
        notes: notes.value, piCall: call.checked && !r.allDay, tags: tags.get(),
      };
      try {
        let saved = null;
        if (!src) {
          saved = await onyx.createEvent(data);
          if (S.settings.defaultCalendar !== data.calendarId) saveSettings({ defaultCalendar: data.calendarId }, true);
        } else if (readOnly) {
          // A read-only calendar can still carry tags and a phone reminder: both live in Onyx.
          if (data.piCall !== !!src.piCall) await onyx.setCall({ id: src.id, title: src.title, start: src.start, allDay: src.allDay }, data.piCall);
          if (!sameTags(data.tags, src.tags)) await onyx.setTags(src.id, data.tags);
        } else {
          saved = await onyx.updateEvent(src.id, data);
        }
        if (saved?.warning) toast(saved.warning, 'warn');
        closePopover();
        refetch();
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
      h('div', { class: 'row' }, icon('clock'), date, startTime, dash, endTime),
      untilRow,
      h('div', { class: 'row' }, icon('calendar'), calendarPick, h('label', { class: 'check' }, allDay, 'All day')),
      (!readOnly || src.notes) && h('div', { class: 'row' }, icon('note'), notes),
      h('div', { class: 'row' }, icon('tag'), tags.el),
      src?.location && h('div', { class: 'row pop-meta' }, icon('pin'), src.location),
      S.settings.pi.enabled && h('div', { class: 'row pi-row' }, icon('phone'),
        h('div', { class: 'txt' }, h('b', null, 'Phone reminder'), callHint),
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
    if (!readOnly && !MOBILE) title.focus();
  }

  // ------------------------------------------------------------ tasks

  async function loadTasks(force) {
    try {
      const res = await onyx.tasks(force);
      tasks = res.tasks;
      showProblems(res.errors);
    } catch (err) {
      toast(err.message, 'error');
    }
    renderTasks();
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
    const row = h('div', { class: 'task', css: { '--c': t.color } },
      h('button', { class: 'tick', title: 'Mark done', onclick: () => completeTask(t, row) }, icon('check')),
      h('div', { class: 'task-body', onclick: (e) => openTask(t, e.currentTarget.getBoundingClientRect()) },
        h('div', { class: 'task-name' }, t.label),
        h('div', { class: 'task-meta' }, when && h('span', null, when), callBadge(t), h('span', null, t.listName),
          (t.tags || []).map((tag) => h('span', { class: 'mini-tag', css: { '--t': tagColor(tag) } }, `#${tag}`)))));
    return row;
  }

  async function completeTask(t, row) {
    row?.classList.add('done');
    try {
      await onyx.updateTask(t.id, { done: true });
      await loadTasks();
      refetch();
    } catch (err) {
      row?.classList.remove('done');
      toast(err.message, 'error');
    }
  }

  function renderTasks() {
    const lists = S.calendars.filter((c) => c.kind === 'tasklist');
    const pick = $('#task-list');
    const chosen = pick.value;
    pick.replaceChildren(...lists.map((c) => h('option', { value: c.id }, c.name)));
    if (lists.some((c) => c.id === chosen)) pick.value = chosen;
    pick.hidden = lists.length < 2;
    $('#task-title').disabled = !lists.length;

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
    const groups = [
      ['Overdue', shown.filter((t) => t.date && (t.start ? new Date(t.start) < new Date() && t.date < today : t.date < today)), 'late'],
      ['Today', shown.filter((t) => t.date === today)],
      ['Upcoming', shown.filter((t) => t.date && t.date > today)],
      ['No date', shown.filter((t) => !t.date)],
    ];
    box.replaceChildren(...groups.filter(([, items]) => items.length).flatMap(([name, items, cls]) => [
      h('div', { class: `task-section ${cls || ''}` }, name),
      ...items.sort((a, b) => sortKey(a).localeCompare(sortKey(b))).map(taskRow),
    ]));
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
    const save = () => run(async () => {
      const patch = {};
      if (name.value.trim() && name.value.trim() !== t.title) patch.title = name.value.trim();
      const picked = tags.get();
      if (!sameTags(picked, t.tags)) patch.tags = picked;
      if (Object.keys(patch).length) await onyx.updateTask(t.id, patch);
      if (patch.tags) reloadTags();
    });
    showPopover(anchor, [
      name,
      h('div', { class: 'pop-meta' }, [t.listName, t.start ? `${fmtDay(new Date(t.start))}, ${fmtTime(new Date(t.start))}` : t.date ? fmtDay(fromYmd(t.date)) : 'No date'].filter(Boolean).join('  ·  ')),
      t.notes && h('div', { class: 'pop-meta' }, t.notes),
      h('div', { class: 'row' }, icon('tag'), tags.el),
      S.settings.pi.enabled && t.provider === 'google' && h('div', { class: 'row pi-row' }, icon('phone'),
        h('div', { class: 'txt' }, h('b', null, 'Phone reminder'), h('small', { class: st.tone }, st.text))),
      h('div', { class: 'pop-actions' },
        h('button', { class: 'btn danger', onclick: () => run(() => onyx.deleteTask(t.id)) }, icon('trash'), 'Delete'),
        h('div', { class: 'grow' }),
        h('button', { class: 'btn', onclick: () => run(() => onyx.updateTask(t.id, { done: true })) }, icon('check'), 'Done'),
        h('button', { class: 'btn primary', onclick: save }, 'Save')),
    ]);
    name.addEventListener('keydown', (e) => { if (e.key === 'Enter') save(); });
  }

  $('#task-add').addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = $('#task-title');
    const title = input.value.trim();
    if (!title) return;
    input.value = '';
    try {
      await onyx.createTask({ title, listId: $('#task-list').value || undefined });
      await loadTasks();
      refetch();
    } catch (err) {
      input.value = title;
      toast(err.message, 'error');
    }
  });

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

  function applyState(next) {
    S = next;
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
          h('p', null, 'Local calendars for time blocks. They stay on this computer.'),
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
                h('li', null, 'Open Onyx on the phone and tap Scan QR code.'),
                h('li', null, 'Point the phone at this code. It connects by itself.')),
              h('p', null, 'Scan with the Onyx app itself, not the camera app. To type it in instead, use an address below and the token.'))),
          h('pre', { class: 'code' }, `Addresses: ${p.addresses.join('   ')}\nToken:     ${p.token}`),
          h('div', { class: 'row' }, copyBtn(p.link, 'Copy pairing link'), copyBtn(p.token, 'Copy token')));
      }).catch((err) => box.replaceChildren(h('p', null, err.message)));
      return [
        h('h3', null, 'Phone'),
        h('p', { class: 'lead' }, 'The Android app shows this calendar, your tasks and tags, and can add and change entries. It talks to Onyx on this PC, so this PC needs to be on. Away from home, install Tailscale on both and scan again: its address is added to the code automatically.'),
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
          h('div', { class: 'row' },
            onyx.canScan && h('button', { class: 'btn', onclick: (e) => scanToPair(e.currentTarget) }, icon('qr'), 'Scan a new code'),
            h('button', { class: 'btn danger', onclick: () => {
              if (confirm('Disconnect this phone from your PC?')) { onyx.unpair(); location.reload(); }
            } }, 'Disconnect'))),
        S.accounts.length > 0 && h('div', { class: 'card' }, h('h4', null, 'Accounts on the PC'),
          S.accounts.map((a) => h('div', { class: 'acct' }, h('span', { class: 'badge' }, PROVIDER[a.provider]), h('span', { class: 'who' }, a.label)))),
      ];
    },
  };

  let settingsTab = onyx.isPhone ? 'connection' : 'calendars';
  function openSettings(tab = settingsTab) {
    const tabs = onyx.isPhone
      ? [['connection', 'Connection'], ['pi', 'Pi calls'], ['general', 'General']]
      : [['calendars', 'Calendars'], ['connections', 'Notion & Drive'], ['phone', 'Phone'], ['pi', 'Pi calls'], ['mcp', 'MCP server'], ['general', 'General']];
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
    show: { tasks: true, notes: true, notion: true, drive: true }, // what joins the calendar entries
    lib: { notes: [], pins: [] },
  };

  // Where notes and outside documents gather when they have no tags.
  const SOURCES = {
    notes: { label: 'Notes', color: '#e4e0ff' },
    notion: { label: 'Notion', color: '#c4c4cc' },
    drive: { label: 'Drive', color: '#3ddc97' },
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

  function graphTitle([s, e]) {
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

  const sourceItem = (key, fields) => ({
    color: SOURCES[key].color, calendarId: `src:${key}`, calendarName: SOURCES[key].label,
    home: [key, SOURCES[key].label, SOURCES[key].color], start: null, ...fields,
  });

  function graphItems(events) {
    const items = events.filter((e) => visible(e.calendarId) && matchesFilter(e.tags)).map((e) => ({
      id: e.id, title: e.title, color: e.color, calendarId: e.calendarId, calendarName: e.calendarName,
      tags: e.tags || [], start: e.start, allDay: e.allDay, kind: e.kind, src: e,
    }));
    if (graph.show.tasks) {
      for (const t of tasks) {
        if (t.mirror || t.done || t.date || !visible(t.listId) || !matchesFilter(t.tags)) continue;
        items.push({ id: t.id, title: t.label, color: t.color, calendarId: t.listId, calendarName: t.listName, tags: t.tags || [], start: null, kind: 'task', task: t });
      }
    }
    // Notes, Notion pages and Drive files have no date: they show whatever the range.
    if (graph.show.notes) {
      for (const n of graph.lib.notes) {
        if (matchesFilter(n.tags)) items.push(sourceItem('notes', { id: n.id, title: n.title, tags: n.tags, kind: 'note', shape: 'diamond', note: n }));
      }
    }
    for (const p of graph.lib.pins) {
      if (graph.show[p.source] && matchesFilter(p.tags)) {
        items.push(sourceItem(p.source, { id: p.id, title: p.title, tags: p.tags, kind: 'pin', shape: 'square', pin: p }));
      }
    }
    return items;
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
    const items = graphItems(events);
    const data = OnyxGraph.build(items, {
      groupBy: graph.groupBy, tagColor,
      dayLabel: (key) => fromYmd(key).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' }),
    });
    graph.view.setData(data);
    const clusters = data.nodes.filter((n) => n.hub).length;
    $('#graph-stats').textContent = items.length ? `${items.length} ${items.length === 1 ? 'item' : 'items'}  ·  ${clusters} ${clusters === 1 ? 'cluster' : 'clusters'}` : '';
    $('#graph-empty').hidden = items.length > 0;
  }

  function pickFromGraph(item, rect) {
    if (item.kind === 'task') {
      openTask(item.task || tasks.find((t) => t.id === item.id) || { id: item.id, title: item.title, label: item.title, listName: item.calendarName, tags: item.tags }, rect);
    } else if (item.kind === 'note') {
      openNote(item.note, rect);
    } else if (item.kind === 'pin') {
      openPin(item.pin, rect);
    } else {
      const src = item.src;
      openEditor({ src, start: toDate(src.start), end: toDate(src.end), allDay: src.allDay }, rect);
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

  const KIND_LABEL = { page: 'Notion page', database: 'Notion database', doc: 'Google Doc', sheet: 'Google Sheet', slides: 'Google Slides', folder: 'Drive folder', form: 'Google Form', pdf: 'PDF', image: 'Image', video: 'Video', file: 'File' };

  function openPin(pin, anchor) {
    const tags = tagField(pin.tags);
    showPopover(anchor, [
      h('div', { class: 'pin-head' }, h('span', { class: `src-badge ${pin.source}` }, SOURCES[pin.source].label), h('b', null, pin.title)),
      h('p', { class: 'pop-meta' }, KIND_LABEL[pin.kind] || 'Document'),
      h('div', { class: 'row' }, icon('tag'), tags.el),
      h('div', { class: 'pop-actions' },
        h('button', { class: 'btn danger', title: 'Take it off the globe (it stays in ' + SOURCES[pin.source].label + ')', onclick: async () => {
          try { await onyx.removePin(pin.id); await afterGlobeChange(true); } catch (err) { toast(err.message, 'error'); }
        } }, icon('x'), 'Remove'),
        h('div', { class: 'grow' }),
        h('button', { class: 'btn', onclick: () => onyx.open(pin.url) }, icon('link'), 'Open'),
        h('button', { class: 'btn primary', onclick: async () => {
          const picked = tags.get();
          try { await onyx.updatePin(pin.id, { tags: picked }); await afterGlobeChange(!sameTags(picked, pin.tags)); } catch (err) { toast(err.message, 'error'); }
        } }, 'Save')),
    ]);
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
        add.onclick = async () => {
          add.disabled = true;
          try {
            const tags = startingTags();
            const pin = await onyx.addPin({ ...r, tags });
            graph.lib.pins = [...graph.lib.pins.filter((p) => p.id !== pin.id), pin];
            add.textContent = 'On globe';
            add.classList.remove('primary');
            loadGraph();
            if (tags.length) reloadTags();
          } catch (err) {
            add.disabled = false;
            toast(err.message, 'error');
          }
        };
        return h('div', { class: 'picker-row' },
          h('span', { class: 'picker-icon' }, r.icon || (r.source === 'drive' ? '▤' : '◧')),
          h('div', { class: 'picker-text' }, h('b', null, r.title),
            h('small', null, [KIND_LABEL[r.kind], r.account, r.edited && new Date(r.edited).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })].filter(Boolean).join('  ·  '))),
          add);
      }));
    };

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
      h('p', { class: 'pop-meta' }, tagFilter.size ? `New items get the tags picked in the sidebar: ${startingTags().map((t) => `#${t}`).join(' ')}` : 'Tip: pick tags in the sidebar first and new items get them, or tag them on the globe.'),
      h('div', { class: 'pop-actions' }, h('div', { class: 'grow' }), h('button', { class: 'btn ghost', onclick: () => closePopover() }, 'Done')),
    ], null, { wide: true });
    if (!MOBILE) input.focus();
    run();
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
      h('span', { class: 'bar-label' }, 'Cluster by'),
      seg([['tags', 'Tags'], ['calendars', 'Sources'], ['days', 'Days']], graph.groupBy, (g) => { graph.groupBy = g; renderGraphBar(); loadGraph(); }),
      h('span', { class: 'bar-label' }, 'Show'),
      chip('tasks', 'Tasks', 'Tasks that have no date'),
      chip('notes', 'Notes', 'Notes written in Onyx'),
      chip('notion', 'Notion', 'Notion pages pinned to the globe'),
      chip('drive', 'Drive', 'Google Drive files pinned to the globe'),
      h('div', { class: 'grow' }),
      addBtn('Note', (r) => openNote(null, r)),
      addBtn('Notion', (r) => openPicker('notion', r)),
      addBtn('Drive', (r) => openPicker('drive', r))));
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
    if (!graph.view) graph.view = OnyxGraph.create($('#graph-canvas'), { onPick: pickFromGraph });
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

  // ------------------------------------------------------------ chrome and start-up

  function closeDrawers() { document.body.classList.remove('drawer-left', 'drawer-right'); }

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
    if (!$('#popover').hidden) closePopover();
    else if (!$('#modal').hidden) closeSettings();
    else if (document.body.classList.contains('drawer-left') || document.body.classList.contains('drawer-right')) closeDrawers();
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
    renderSidebar();
    loadTasks();

    // Something changed outside the window: an agent wrote through MCP, the
    // calendar lists finished loading, or (on the phone) the regular check.
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
