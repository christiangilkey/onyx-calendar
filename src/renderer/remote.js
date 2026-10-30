// The Android app's link to Onyx on the PC. It provides the same window.onyx
// commands as the desktop preload script, but runs them on the PC over the
// network (POST /app/rpc), and keeps the last answers so the calendar can still
// be read when the PC is off or out of reach. Changes made then are not lost:
// they wait in the outbox, show at once, and go to the PC when it is back.
//
// Active inside the Android app, or in a browser when the page is opened with
// "?remote" (for development). Otherwise it does nothing.
(() => {
  'use strict';
  if (window.onyx) return;
  const native = !!window.Capacitor?.isNativePlatform?.();
  if (!native && !new URLSearchParams(location.search).has('remote')) return;

  const CONN = 'onyx.connection';
  const LOCAL = 'onyx.phone-settings';
  const CACHE = 'onyx.cache.';
  const TIMEOUT_MS = 7000;
  // Commands that think or make a lot on the PC: Claude planning a day or a goal, a goal making its many tasks.
  const SLOW_MS = { 'magic:plan': 120000, 'magic:replan': 60000, 'ai:breakdown': 45000, 'goal:plan': 330000, 'goal:create': 300000, 'goal:update': 300000 };
  // Settings that belong to this phone rather than to the shared calendar.
  const PHONE_ONLY = ['view', 'tasksPanel', 'newsPanel', 'nextBar', 'popups', 'doneSound'];

  const read = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } };
  const write = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage full: the cache is optional */ } };

  let conn = read(CONN, null);           // { addresses: ['192.168.1.20:4747', ...], token, last }
  let local = read(LOCAL, { view: 'timeGrid3', tasksPanel: false });
  let online = true;
  const listeners = new Set();

  function setOnline(value) {
    if (online === value) return;
    online = value;
    document.documentElement.classList.toggle('offline', !online);
    for (const fn of listeners) fn(online);
  }

  async function post(address, name, args, op, timeout = TIMEOUT_MS) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), timeout);
    try {
      const res = await fetch(`http://${address}/app/rpc`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${conn.token}` },
        body: JSON.stringify({ name, args, ...(op ? { op } : {}) }),
        signal: ctl.signal,
      });
      if (res.status === 401) {
        throw Object.assign(new Error('The PC no longer accepts this phone. Pair it again from Onyx on the PC: Settings → Phone.'), { final: true });
      }
      return await res.json();
    } finally {
      clearTimeout(timer);
    }
  }

  // Tailscale's addresses (100.64.0.0/10) reach the PC from any network, not just its wifi.
  const isTailscale = (address) => /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(address);
  // Addresses the PC reports itself (wifi and Tailscale), as opposed to ones typed in by hand.
  const isLocal = (address) => isTailscale(address) || /^(192\.168|10|172\.(1[6-9]|2\d|3[01]))\.\d+\.\d+(:\d+)?$/.test(address);

  // The PC sends its current addresses with its state, so a phone paired before Tailscale
  // was set up (or before the PC's wifi address changed) picks up the new ones by itself.
  // The address that just answered and any typed-in ones are kept; stale wifi ones are dropped.
  // `peers` are the other desktops linked to that PC: they share its token, so whichever
  // of them is on answers the phone.
  function learnAddresses(value, answered) {
    const m = value?.mcp;
    if (!Array.isArray(m?.addresses) || !m.addresses.length || !m.port) return;
    const peers = Array.isArray(m.peers) ? m.peers.filter((a) => typeof a === 'string' && /:\d+$/.test(a)) : [];
    const next = [...new Set([answered, ...m.addresses.map((a) => `${a}:${m.port}`), ...peers, ...conn.addresses.filter((a) => !isLocal(a))])];
    if (next.join() === conn.addresses.join()) return;
    conn.addresses = next;
    write(CONN, conn);
    syncWidget();
  }

  const cacheKey = (name, args) => CACHE + name + (name === 'events' ? `.${args[0]}.${args[1]}` : '');

  // Events seen in any range, so a slightly different range can still be shown offline.
  function rememberEvents(list) {
    const all = new Map(read(`${CACHE}events.all`, []).map((e) => [e.id, e]));
    for (const e of list) all.set(e.id, e);
    write(`${CACHE}events.all`, [...all.values()].sort((a, b) => (a.start < b.start ? 1 : -1)).slice(0, 2500));
  }

  function fromCache(name, args) {
    const hit = read(cacheKey(name, args), null);
    if (hit) return hit;
    if (name === 'events') {
      const [start, end] = args;
      const inRange = read(`${CACHE}events.all`, []).filter((e) => new Date(e.end) > new Date(start) && new Date(e.start) < new Date(end));
      return { events: inRange, errors: [] };
    }
    return null;
  }

  const CACHED = new Set(['state', 'events', 'tasks', 'globe', 'goals']);

  // The home-screen widgets fetch from the PC themselves: they get its address and token
  // from here, and a nudge to refresh after anything is changed in the app.
  const Widget = window.Capacitor?.Plugins?.OnyxWidget;
  // The status and navigation bars: how far they really cover the page, measured by the app
  // (env(safe-area-inset-*) can be wrong when Android already keeps the page clear of them).
  const fitBars = () => {
    const ask = Widget?.insets?.();
    ask?.then?.((r) => {
      if (!r?.known) return;
      const root = document.documentElement.style;
      root.setProperty('--safe-top', `${Math.round(r.top)}px`);
      root.setProperty('--safe-bottom', `${Math.round(r.bottom)}px`);
    }).catch?.(() => {});
  };
  if (Widget) {
    fitBars();
    addEventListener('resize', () => setTimeout(fitBars, 150));
  }
  function syncWidget() {
    if (!Widget) return;
    const ask = conn ? Widget.configure({ addresses: conn.addresses, last: conn.last || '', token: conn.token }) : Widget.configure({ clear: true });
    ask?.catch?.(() => {});
  }
  let widgetTimer = null;
  function nudgeWidget(name) {
    if (!Widget || CACHED.has(name) || !name.includes(':')) return; // only after a change
    clearTimeout(widgetTimer);
    widgetTimer = setTimeout(() => Widget.refresh()?.catch?.(() => {}), 1500);
  }

  /**
   * No PC (nor any PC linked to it) answered at any address. The title bar already says the phone is offline,
   * so this is only ever a short word, for something tapped that can't be done without the PC (a breakdown, say):
   * the calendar, the tasks and the goals show what was kept, and changes wait in the outbox.
   */
  const OFFLINE_TEXT = 'That needs your PC, and it is out of reach right now.';
  class Unreachable extends Error {
    constructor() { super(OFFLINE_TEXT); this.offline = true; }
  }
  const unreachable = () => new Unreachable();

  // Finding the PC quickly. Its addresses (wifi, Tailscale, linked PCs) are asked all at once with a
  // short wait, not one by one with a long one: when none is in reach that costs one short wait,
  // not seven seconds per address. The address that answered last is used straight away while it
  // keeps answering. Once out of reach, the phone stops waiting on the network altogether (the
  // calendar shows what it kept, changes go to the outbox) and looks for the PC in the background.
  const PROBE_MS = 3000;     // how long the "are you there?" may take
  const FRESH_MS = 30000;    // an address that answered this recently is used without asking first
  let lastOk = 0;

  /** An address that answers now: the one that answered last, while it is fresh; else the first of all to answer a quick ping. */
  async function route() {
    if (conn.last && Date.now() - lastOk < FRESH_MS) return conn.last;
    const order = [conn.last, ...conn.addresses.filter((a) => a !== conn.last)].filter(Boolean);
    let refused = null;
    const tries = order.map((a) => post(a, 'ping', [], null, PROBE_MS).then(() => a, (err) => {
      if (err.final) refused = err;
      throw err;
    }));
    try {
      return await Promise.any(tries);
    } catch {
      if (refused) throw refused; // in reach, but this phone is no longer let in
      return null;
    }
  }

  /** Sends one command to the PC (at whichever address answers); its raw answer ({ ok, value | error }). */
  async function reach(name, args, op) {
    if (!online) throw unreachable(); // known to be out of reach: no waiting (probe() looks in the background)
    const address = await route();
    if (!address) { setOnline(false); throw unreachable(); }
    let body;
    try {
      body = await post(address, name, args, op, SLOW_MS[name] || TIMEOUT_MS);
    } catch (err) {
      if (err.final) throw err;
      lastOk = 0;
      setOnline(false);
      throw unreachable();
    }
    lastOk = Date.now();
    setOnline(true);
    if (conn.last !== address) { conn.last = address; write(CONN, conn); }
    if (body.ok) learnAddresses(body.value, address);
    return body;
  }

  let probing = null;
  /** Out of reach: looks for the PC in the background (a quick ping at every address); back, the outbox goes. */
  function probe() {
    if (probing || !conn) return probing || Promise.resolve();
    probing = (async () => {
      try {
        lastOk = 0;
        const address = await route();
        if (!address) return;
        lastOk = Date.now();
        if (conn.last !== address) { conn.last = address; write(CONN, conn); }
        setOnline(true);
        await flush();
      } catch { /* not in reach yet */ } finally {
        probing = null;
      }
    })();
    return probing;
  }
  setInterval(() => { if (!online && document.visibilityState === 'visible') probe(); }, 10000);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && !online) probe(); });
  // Android says when the phone has no network at all: out of reach at once, and back to looking when it has one.
  addEventListener('offline', () => setOnline(false));
  addEventListener('online', () => probe());

  const outdated = () => {
    const pc = read(`${CACHE}state`, null)?.version;
    return Object.assign(new Error(`Onyx on your PC${pc ? ` (${pc})` : ''} is older than this app and can't do that yet. Update Onyx on the PC (Settings → Updates).`), { outdated: true });
  };

  async function call(name, ...args) {
    if (!conn) throw new Error('This phone is not connected to Onyx on your PC yet.');
    args = remap(args); // something made offline, since made on the PC: its real id
    // A change while changes are still waiting goes after them, in order; offline, it waits too.
    if (QUEUEABLE.has(name) && (outbox.length || !online)) return enqueue(name, args);
    let body;
    try {
      body = await reach(name, args);
    } catch (err) {
      if (!(err instanceof Unreachable)) throw err;
      probe(); // and keep looking for it in the background
      if (QUEUEABLE.has(name)) return enqueue(name, args);
      const cached = CACHED.has(name) ? fromCache(name, args) : null;
      if (cached) return overlay(name, args, cached);
      // Nothing kept from the PC yet, but changes made here: those at least.
      if (outbox.length && name === 'tasks') return overlay(name, args, { tasks: [], errors: [] });
      throw err;
    }
    if (!body.ok) {
      // An older Onyx on the PC doesn't know the commands newer app builds send.
      if (/^Unknown command/.test(body.error || '')) throw outdated();
      // The PC is there, but its own connection dropped: the change waits here, like one made offline.
      if (body.retry && QUEUEABLE.has(name)) return enqueue(name, args);
      throw new Error(body.error);
    }
    if (CACHED.has(name)) write(cacheKey(name, args), body.value);
    if (name === 'events') rememberEvents(body.value.events);
    nudgeWidget(name);
    return overlay(name, args, body.value);
  }

  // ------------------------------------------------------------ changes made offline: the outbox
  // With the PC out of reach, a change is not lost. It waits here (kept on the phone, through a
  // restart), in the order it was made, and shows at once on what the phone shows (overlay). Once
  // the PC, or any PC linked to it, answers, the outbox goes to it one change at a time, in order.
  // Each change carries an id the PCs remember, so one sent twice (an answer lost on the way) is
  // made once. Something made offline has a stand-in id; once the PC has made it, later changes to
  // it are sent with its real one. A change the PC turns down is set aside and reported.
  const OUTBOX = 'onyx.outbox', IDS = 'onyx.outbox.ids', FAILED = 'onyx.outbox.failed';
  const QUEUEABLE = new Set([
    'event:create', 'event:update', 'event:delete', 'event:done', 'event:leaveby', 'event:call', 'event:ack',
    'task:create', 'task:update', 'task:move', 'task:resize', 'task:delete', 'task:backburner', 'task:repeat', 'inbox:dismiss',
    'tags:set', 'memo:set', 'pomodoro:set', 'blockTasks:set', 'blockLinks:set', 'blockTasks:tick', 'eventColor:set',
    'note:create', 'note:update', 'note:delete', 'goal:step', 'goal:update', 'pin:update', 'pin:remove', 'focus:log',
  ]);
  let outbox = read(OUTBOX, []);
  const ids = read(IDS, {});
  const outboxListeners = new Set();
  const tellOutbox = (extra = {}) => { for (const fn of outboxListeners) { try { fn({ pending: outbox.length, online, ...extra }); } catch { /* one listener's problem */ } } };
  const newOp = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}${Math.random().toString(36).slice(2, 6)}`;
  const realId = (v) => (typeof v === 'string' && ids[v]) || v;
  function remap(v) {
    if (Array.isArray(v)) return v.map(remap);
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, remap(x)]));
    return realId(v);
  }
  const isTemp = (v) => typeof v === 'string' && v.startsWith('offline-') && !ids[v];
  const saveOutbox = () => { write(OUTBOX, outbox); tellOutbox(); };

  const calOf = (id) => (read(`${CACHE}state`, null)?.calendars || []).find((c) => c.id === id);
  function fakeEvent(o) {
    const d = o.args[0] || {}, cal = calOf(d.calendarId);
    return {
      id: o.temp, kind: 'event', calendarId: d.calendarId, calendarName: cal?.name || '', color: cal?.color || '#8b7cff',
      title: d.blank ? '' : d.title || '(No title)', start: d.start, end: d.end || d.start, allDay: !!d.allDay, notes: d.notes || '', location: d.location || '',
      tags: d.tags || [], writable: true, recur: d.recur || null, offline: true,
    };
  }
  function fakeTask(o) {
    const d = o.args[0] || {}, cal = calOf(d.listId);
    return {
      id: o.temp, listId: d.listId, listName: cal?.name || '', color: cal?.color || '#f5b83d', provider: cal?.provider || 'google',
      title: d.title || '', label: d.title || '', notes: d.notes || '', due: d.due || null, date: d.due || null, time: null, start: null,
      done: false, tags: d.tags || [], offline: true,
    };
  }
  const dayAfter = (ymd) => { const d = new Date(`${ymd}T00:00:00`); d.setDate(d.getDate() + 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const taskEntry = (t) => ({ id: t.id, kind: 'task', calendarId: t.listId, calendarName: t.listName, color: t.color, title: t.label || t.title,
    start: t.date, end: dayAfter(t.date), allDay: true, done: !!t.done, tags: t.tags || [], writable: true, movable: false, offline: true });

  /** What the PC's answer would be with the waiting changes already made: events and tasks show them. */
  function overlay(name, args, value) {
    if (!outbox.length || !value) return value;
    if (name === 'events' && Array.isArray(value.events)) {
      let list = value.events.slice();
      const touch = (id, fn) => { list = list.map((e) => (e.id === id || e.seriesId === id ? fn({ ...e }) : e)); };
      for (const o of outbox) {
        const [a, b, c] = remap(o.args);
        if (o.name === 'event:create') list.push(fakeEvent(o));
        else if (o.name === 'event:update') touch(a, (e) => ({ ...e, ...Object.fromEntries(['title', 'start', 'end', 'allDay', 'notes', 'location', 'tags', 'calendarId'].filter((k) => b && k in b).map((k) => [k, b[k]])) }));
        else if (o.name === 'event:delete') list = list.filter((e) => e.id !== a && !(b?.scope === 'all' && b.seriesId && e.seriesId === b.seriesId));
        else if (o.name === 'event:done') touch(a, (e) => ({ ...e, done: !!b }));
        else if (o.name === 'tags:set') touch(a, (e) => ({ ...e, tags: b || [] }));
        else if (o.name === 'eventColor:set') touch(a, (e) => ({ ...e, color: b || e.calColor || e.color, ownColor: !!b }));
        else if (o.name === 'blockTasks:set') touch(a, (e) => ({ ...e, taskList: (b || []).length ? b.map((t) => ({ id: t.id, text: t.text, done: !!e.taskList?.find((x) => x.id === t.id)?.done })) : null }));
        else if (o.name === 'blockLinks:set') touch(a, (e) => ({ ...e, links: (b || []).length ? b : null }));
        else if (o.name === 'blockTasks:tick') list = list.map((e) => (e.id === a && e.taskList ? { ...e, taskList: e.taskList.map((t) => (t.id === b ? { ...t, done: !!c } : t)) } : e));
        else if (o.name === 'task:create') { const t = fakeTask(o); if (t.date) list.push(taskEntry(t)); }
        else if (o.name === 'task:update') touch(a, (e) => ({ ...e, ...(b?.title != null ? { title: b.title } : {}), ...(b && 'done' in b ? { done: !!b.done } : {}) }));
        else if (o.name === 'task:delete') list = list.filter((e) => e.id !== a);
        else if (o.name === 'task:move' && b) {
          touch(a, (e) => {
            const was = new Date(e.end) - new Date(e.start);
            if (b.start) return { ...e, allDay: false, start: b.start, end: new Date(new Date(b.start).getTime() + (e.allDay ? 30 * 60000 : was)).toISOString() };
            return b.date ? { ...e, allDay: true, start: b.date, end: dayAfter(b.date) } : e;
          });
        } else if (o.name === 'task:resize' && b) {
          touch(a, (e) => {
            const s = b.start || e.start;
            return { ...e, start: s, ...(b.minutes ? { end: new Date(new Date(s).getTime() + b.minutes * 60000).toISOString() } : {}) };
          });
        }
      }
      const [start, end] = args;
      const inRange = (e) => !start || !end || (new Date(e.end || e.start) > new Date(start) && new Date(e.start) < new Date(end));
      return { ...value, events: list.filter(inRange) };
    }
    if (name === 'tasks' && Array.isArray(value.tasks)) {
      let list = value.tasks.slice();
      const touch = (id, fn) => { list = list.map((t) => (t.id === id ? fn({ ...t }) : t)); };
      for (const o of outbox) {
        const [a, b] = remap(o.args);
        if (o.name === 'task:create') list.push(fakeTask(o));
        else if (o.name === 'task:update') {
          touch(a, (t) => ({ ...t, ...(b?.title != null ? { title: b.title, label: b.title } : {}), ...(b && 'notes' in b ? { notes: b.notes } : {}),
            ...(b && 'due' in b ? { due: b.due, date: b.due } : {}), ...(b && 'done' in b ? { done: !!b.done } : {}) }));
          if (b?.done) list = list.filter((t) => t.id !== a); // done: off to the Archived tab, as the PC does
        } else if (o.name === 'task:delete') list = list.filter((t) => t.id !== a);
        else if (o.name === 'task:move' && b) {
          const local = (iso) => { const d = new Date(iso); return [`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`, `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`]; };
          touch(a, (t) => (b.start ? { ...t, date: local(b.start)[0], time: local(b.start)[1], start: b.start } : b.date ? { ...t, date: b.date, due: b.date, time: null, start: null } : t));
        } else if (o.name === 'task:backburner') touch(a, (t) => ({ ...t, backburner: !!b }));
        else if (o.name === 'tags:set') touch(a, (t) => ({ ...t, tags: b || [] }));
      }
      return { ...value, tasks: list };
    }
    return value;
  }

  /** Keeps a change for the PC; what the app gets back meanwhile is what it will look like. */
  function enqueue(name, args) {
    const o = { op: newOp(), name, args, at: Date.now() };
    if (/:create$/.test(name)) o.temp = `offline-${o.op}`;
    // Taken away before it ever reached the PC: its making and every change to it go, and nothing is sent.
    if (/:delete$/.test(name) && isTemp(args[0])) {
      const t = args[0];
      outbox = outbox.filter((x) => x.temp !== t && !JSON.stringify(x.args).includes(t));
      saveOutbox();
      return true;
    }
    outbox.push(o);
    saveOutbox();
    setTimeout(flush, 0);
    if (name === 'event:create') return fakeEvent(o);
    if (name === 'task:create') return fakeTask(o);
    if (/:create$/.test(name)) return { ...(args[0] || {}), id: o.temp, offline: true };
    if (/:update$/.test(name)) return { id: args[0], ...(args[1] || {}), offline: true };
    return args.length > 1 ? args[1] ?? true : true;
  }

  let flushing = false;
  let held = false; // the PC is holding changes back (its connection dropped): said once, not every try
  /** Sends the waiting changes, oldest first; stops (and keeps the rest) as soon as no PC answers. */
  async function flush() {
    if (flushing || !outbox.length || !conn) return;
    if (!online) { probe(); return; } // the outbox goes once the PC is found
    flushing = true;
    let sent = 0;
    const failed = [];
    let blocked = null;
    let waiting = null;
    tellOutbox({ syncing: true });
    try {
      while (outbox.length) {
        const o = outbox[0];
        let body;
        try {
          body = await reach(o.name, remap(o.args), o.op);
        } catch (err) {
          if (err.final) blocked = err.message;
          break; // no PC in reach (or this phone is no longer let in): the rest wait
        }
        if (!body.ok && /^Unknown command/.test(body.error || '')) { blocked = outdated().message; break; } // kept until the PC is updated
        if (!body.ok && body.retry) { // nothing was made: kept, and tried again with the next round
          if (!held) waiting = `Your PC couldn't reach the internet just now. ${outbox.length === 1 ? 'A change waits' : `${outbox.length} changes wait`} on this phone and will sync on their own.`;
          held = true;
          break;
        }
        if (body.ok) {
          if (o.temp && body.value && typeof body.value === 'object' && body.value.id) {
            ids[o.temp] = body.value.id;
            const keys = Object.keys(ids);
            for (const k of keys.slice(0, Math.max(0, keys.length - 500))) delete ids[k];
            write(IDS, ids);
          }
          sent++;
        } else if (!/no longer exists|not found|doesn't exist|does not exist|isn't there|\b404\b|\b410\b/i.test(body.error || '')) {
          failed.push({ name: o.name, error: body.error || 'It could not be saved.', at: o.at }); // gone already on the PC: nothing to do
        }
        outbox.shift();
        write(OUTBOX, outbox);
      }
    } finally {
      flushing = false;
    }
    if (sent) held = false;
    if (failed.length) write(FAILED, [...read(FAILED, []), ...failed].slice(-50));
    tellOutbox({ sent, failed, blocked, waiting });
    if (sent) nudgeWidget('outbox:sent');
  }
  // Tried again every 15 seconds while anything waits, and whenever the app comes back to the front.
  setInterval(() => { if (outbox.length) flush(); }, 15000);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && outbox.length) flush(); });
  if (outbox.length) setTimeout(flush, 1500);

  const withLocal = (state) => (state ? { ...state, settings: { ...state.settings, ...local } } : state);

  /** Reads a pairing link: onyx://pair?a=192.168.1.20:4747,100.x.y.z:4747&t=TOKEN, or the
   *  QR code's web form of it, http://192.168.1.20:4747/pair#a=...&t=TOKEN */
  function parseLink(link) {
    const url = new URL(String(link).trim());
    const params = url.protocol === 'onyx:' ? url.searchParams : new URLSearchParams(url.hash.slice(1));
    const addresses = (params.get('a') || '').split(',').map((a) => a.trim()).filter(Boolean);
    const token = params.get('t') || '';
    if (!addresses.length || !token) throw new Error('That is not an Onyx pairing link.');
    return { addresses, token };
  }

  async function pair({ addresses, token }) {
    const clean = addresses.map((a) => a.trim().replace(/^https?:\/\//, '').replace(/\/.*$/, '')).filter(Boolean)
      .map((a) => (/:\d+$/.test(a) ? a : `${a}:4747`));
    if (!clean.length || !token.trim()) throw new Error('Enter the PC\'s address and the token.');
    const previous = conn;
    conn = { addresses: clean, token: token.trim(), last: '' };
    // A new PC to try: an earlier attempt that couldn't reach one mustn't stop this one before it starts.
    online = true;
    lastOk = 0;
    try {
      const state = await call('state');
      if (!online) throw new Error('Could not reach the PC at that address.');
      write(CONN, conn);
      syncWidget();
      return state;
    } catch (err) {
      conn = previous;
      if (err instanceof Unreachable) {
        const anywhere = clean.some(isTailscale);
        throw new Error(`This phone couldn't reach your PC at ${clean.join(' or ')}. Check that Onyx is open on the PC and the phone is on the same Wi-Fi`
          + (anywhere ? ', or has Tailscale on.' : '.'));
      }
      throw err;
    }
  }

  // Updates: the newest APK on the GitHub releases page. Android installs it once
  // the browser has downloaded it (installing from inside an app isn't allowed).
  const REPO = 'christiangilkey/onyx-calendar';
  let update = { status: 'idle', current: '' };
  const updateListeners = new Set();
  const setUpdate = (patch) => { update = { ...update, ...patch }; for (const fn of updateListeners) fn(update); return update; };
  const parts = (v) => String(v).replace(/^v/, '').split(/[.-]/).map((n) => parseInt(n, 10) || 0);
  const isNewer = (a, b) => {
    const x = parts(a), y = parts(b);
    for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0);
    return false;
  };
  const appVersion = async () => {
    try { return (await window.Capacitor?.Plugins?.App?.getInfo())?.version || ''; } catch { return ''; }
  };
  // Capacitor hands links to other sites to the phone's browser instead of opening them inside the app.
  const openOutside = (url) => { if (/^https:\/\//i.test(url)) location.assign(url); };

  // Requests through the phone's own network stack (no CORS, follows GitHub's download
  // redirects); plain fetch where that isn't there.
  const nativeHttp = () => window.Capacitor?.Plugins?.CapacitorHttp;
  async function get(url, { method = 'GET', headers = {} } = {}) {
    const http = nativeHttp();
    if (http) {
      const res = await http.request({ url, method, headers, responseType: 'text', connectTimeout: 15000, readTimeout: 15000 });
      return { status: res.status, text: typeof res.data === 'string' ? res.data : JSON.stringify(res.data ?? '') };
    }
    const res = await fetch(url, { method, headers });
    return { status: res.status, text: method === 'HEAD' ? '' : await res.text() };
  }

  async function checkUpdate() {
    const current = await appVersion();
    setUpdate({ status: 'checking', current, error: '' });
    // The newest version from latest.yml, the file the desktop updater reads too: a plain
    // download, which GitHub doesn't count against its 60-checks-an-hour API limit (a home
    // connection's PCs and phones all share that, and it runs out).
    let version = '';
    try {
      const res = await get(`https://github.com/${REPO}/releases/latest/download/latest.yml`);
      if (res.status !== 200) throw new Error(`GitHub answered ${res.status}`);
      version = (res.text.match(/^version:\s*['"]?v?([\d.]+)/m) || [])[1] || '';
      if (!version) throw new Error('latest.yml has no version');
    } catch {
      return setUpdate({ status: 'error', error: 'Could not reach GitHub to check for updates.' });
    }
    if (!current || !isNewer(version, current)) return setUpdate({ status: 'current', version: current || version });
    const url = `https://github.com/${REPO}/releases/download/v${version}/Onyx-Calendar-${version}.apk`;
    // The PC's installer can land a few minutes before the APK: offer it once the APK is up.
    try {
      const apk = await get(url, { method: 'HEAD' });
      if (apk.status !== 200) return setUpdate({ status: 'current', version: current });
    } catch { /* offer it anyway; the browser says so if it isn't there yet */ }
    // The release notes come from the API, which may be out of checks: the update is offered without them then.
    let notes = '';
    try {
      const res = await get(`https://api.github.com/repos/${REPO}/releases/tags/v${version}`, { headers: { Accept: 'application/vnd.github+json' } });
      if (res.status === 200) notes = JSON.parse(res.text).body || '';
    } catch { /* no notes */ }
    return setUpdate({ status: 'available', version, notes, url });
  }

  window.ONYX_PHONE = true;
  window.onyx = {
    isPhone: true,
    offlineText: OFFLINE_TEXT,
    paired: () => !!conn,
    connection: () => (conn ? { addresses: conn.addresses, last: conn.last, online, anywhere: conn.addresses.filter(isTailscale) } : null),
    pair,
    pairLink: (link) => pair(parseLink(link)),
    // The phone's own QR scanner, so pairing never goes through the camera app or a browser.
    canScan: !!window.Capacitor?.Plugins?.CapacitorBarcodeScanner,
    scan: async () => {
      const scanner = window.Capacitor?.Plugins?.CapacitorBarcodeScanner;
      if (!scanner) throw new Error('Scanning works in the Android app.');
      let result;
      try {
        result = await scanner.scanBarcode({
          hint: 0, // QR code
          cameraDirection: 1, // back camera
          scanOrientation: 1, // portrait
          scanInstructions: 'Point at the QR code in Onyx on your PC: Settings → Phone',
        });
      } catch (err) {
        if (/cancel/i.test(err?.message || '')) return null;
        throw err;
      }
      const text = result?.ScanResult || '';
      if (!text) return null;
      if (!/^(onyx:\/\/|https?:\/\/[^/]+\/pair#)/.test(text)) throw new Error('That QR code is not an Onyx pairing code. Use the one in Settings → Phone on the PC.');
      return pair(parseLink(text));
    },
    syncDesktops: () => call('desktops:sync'),
    breakdown: (title, opts) => call('ai:breakdown', title, opts),
    logFocus: (session) => call('focus:log', session),
    focusSessions: (range) => call('focus:sessions', range),
    focusInsights: () => call('focus:insights'),
    // A session run on the phone tells the PC it is on (assistants hold their messages) and when it ends.
    focusStart: (session) => call('focus:start', session),
    focusEnd: () => call('focus:end'),
    focusNext: (info) => call('focus:next', info),
    setAiKey: (key) => call('ai:key', key),
    magicPlan: (text, date, opts, inboxIds) => call('magic:plan', text, date, opts, inboxIds),
    magicReplan: (tasks, travel, date, opts) => call('magic:replan', tasks, travel, date, opts),
    magicRemember: (opts) => call('magic:remember', opts),
    // Onyx Home (the launcher) and Onyx on the lock screen, chosen in Settings.
    launcher: Widget ? {
      info: () => Widget.launcherInfo(),
      set: (show) => Widget.setLauncher({ show }),
      setAlarm: (alarm) => Widget.setLauncher({ alarm }),
      open: (what) => Widget.launcherOpen({ what }),
      // The doomscroll saver (DoomscrollService): on or off, after how many minutes, and a ten-second look at its card.
      setDoomscroll: ({ on, minutes } = {}) => Widget.setLauncher({ ...(on != null ? { doomscroll: !!on } : {}), ...(minutes ? { doomMinutes: Math.round(minutes) } : {}) }),
      previewDoomscroll: () => (Widget.doomscrollPreview ? Widget.doomscrollPreview() : Promise.resolve({ shown: false })),
      // A Hyperfocus session on this phone, shown on Onyx Home and the lock screen (null: it is over).
      focus: (s) => Widget.setFocus?.(s ? { goal: s.goal, startedAt: s.startedAt, plannedEnd: s.plannedEnd } : { clear: true })?.catch?.(() => {}),
    } : null,
    // Tamkeen on this phone (not on the PC): checked and opened through the app's own plugin.
    tamkeen: {
      info: async () => {
        try {
          return { installed: !!(await Widget?.tamkeenInstalled?.())?.installed };
        } catch {
          return { installed: false }; // an app build from before Tamkeen support
        }
      },
      watch: async (id) => {
        if (!Widget?.openTamkeen) throw new Error('Opening Tamkeen works in the Android app.');
        try {
          await Widget.openTamkeen({ id });
        } catch (err) {
          throw new Error(err?.message || 'Could not open Tamkeen.');
        }
        return true;
      },
    },
    unpair: () => {
      conn = null;
      localStorage.removeItem(CONN);
      syncWidget();
      for (const key of Object.keys(localStorage)) if (key.startsWith(CACHE)) localStorage.removeItem(key);
    },
    onOnline: (fn) => listeners.add(fn),
    // The outbox: how many changes wait for the PC, and when they have gone (or one was turned down).
    onOutbox: (fn) => { outboxListeners.add(fn); fn({ pending: outbox.length, online }); },
    outbox: () => ({ pending: outbox.length, online, failed: read(FAILED, []) }),
    // A look that was already under way may have started before the PC was back: then one more.
    syncNow: async () => { if (!online) await probe(); if (!online) await probe(); return flush(); },

    state: async () => withLocal(await call('state')),
    refresh: async () => withLocal(await call('refresh')),
    events: (start, end, force) => call('events', start, end, force),
    createEvent: (data) => call('event:create', data),
    updateEvent: (id, patch) => call('event:update', id, patch),
    deleteEvent: (id, opts) => call('event:delete', id, opts),
    setBackburner: (id, on) => call('task:backburner', id, on),
    setEventDone: (id, done) => call('event:done', id, done),
    setTwilioToken: (token) => call('calls:token', token),
    testCall: (kind) => call('calls:test', kind),
    emails: (start, end) => call('emails', start, end),
    // The alarms coming up, set on Android's alarm clock (it wakes the phone and rings until a button is pressed).
    setAlarms: async (alarms) => { if (Widget?.setAlarms) await Widget.setAlarms({ alarms }); },
    setCall: (event, on, before, mode) => call('event:call', event, on, before, mode),
    setLeaveBy: (id, minutes) => call('event:leaveby', id, minutes),
    ackCall: (id) => call('event:ack', id),
    tasks: (force) => call('tasks', force),
    createTask: (data) => call('task:create', data),
    updateTask: (id, patch) => call('task:update', id, patch),
    moveTask: (id, to) => call('task:move', id, to),
    resizeTask: (id, to) => call('task:resize', id, to),
    planTask: (id, to) => call('task:plan', id, to),
    unplanTask: (id, prev) => call('task:unplan', id, prev),
    dismissInbox: (id) => call('inbox:dismiss', id),
    receiveTask: (link) => call('link:task', link),
    archivedTasks: (from, to) => call('tasks:archived', from, to),
    deleteTask: (id) => call('task:delete', id),
    repeatTask: (id, rule) => call('task:repeat', id, rule),
    updateSeries: (key, data) => call('series:update', key, data),
    clearSeries: (key) => call('series:clear', key),
    stopSeries: (key) => call('series:stop', key),
    goals: (force) => call('goals', force),
    createGoal: (data) => call('goal:create', data),
    updateGoal: (id, data) => call('goal:update', id, data),
    planGoal: (opts) => call('goal:plan', opts),
    deleteGoal: (id, keepTasks) => call('goal:delete', id, keepTasks),
    setGoalStep: (id, stepId, done) => call('goal:step', id, stepId, done),
    setTags: (id, tags) => call('tags:set', id, tags),
    setMemo: (id, text) => call('memo:set', id, text),
    setPomodoro: (id, cfg) => call('pomodoro:set', id, cfg),
    setBlockTasks: (key, items) => call('blockTasks:set', key, items),
    setBlockLinks: (key, items) => call('blockLinks:set', key, items),
    tickBlockTask: (id, taskId, done) => call('blockTasks:tick', id, taskId, done),
    setEventColor: (key, color) => call('eventColor:set', key, color),
    reportBugs: (list) => call('bugs:report', list),
    news: (force, mode) => call('news', force, mode),
    addNewsChannel: (input) => call('news:add', input),
    setNewsChannel: (id, on) => call('news:set', id, on),
    removeNewsChannel: (id) => call('news:remove', id),
    resetNewsChannels: () => call('news:reset'),
    globe: () => call('globe'),
    createNote: (data) => call('note:create', data),
    updateNote: (id, patch) => call('note:update', id, patch),
    deleteNote: (id) => call('note:delete', id),
    addPin: (item) => call('pin:add', item),
    updatePin: (id, patch) => call('pin:update', id, patch),
    removePin: (id) => call('pin:remove', id),
    searchNotion: (query) => call('notion:search', query),
    shareSenders: () => call('share:senders'),
    shareEmail: (data) => call('share:email', data),
    sharePages: (query) => call('share:pages', query),
    shareNotion: (data) => call('share:notion', data),
    searchDrive: (query) => call('drive:search', query),
    // Keys entered on the phone are saved in Onyx on the PC, so both use them.
    connectNotion: async (key) => withLocal(await call('notion:connect', key)),
    disconnectNotion: async () => withLocal(await call('notion:disconnect')),
    setGoogleCredentials: async (text) => withLocal(await call('google:credentials', text)),
    setMicrosoftClient: async (id) => withLocal(await call('microsoft:client', id)),
    addFeed: async (feed) => withLocal(await call('feed:add', feed)),
    setTagColor: async (tag, color) => withLocal(await call('tag:color', tag, color)),
    renameTag: async (from, to) => withLocal(await call('tag:rename', from, to)),
    deleteTag: async (tag) => withLocal(await call('tag:delete', tag)),
    addLocalCalendar: async (name, color) => withLocal(await call('local:add', name, color)),
    removeLocalCalendar: async (id) => withLocal(await call('local:remove', id)),
    settings: async (patch) => {
      const mine = {}, shared = {};
      for (const [k, v] of Object.entries(patch || {})) (PHONE_ONLY.includes(k) ? mine : shared)[k] = v;
      if (Object.keys(mine).length) { local = { ...local, ...mine }; write(LOCAL, local); }
      if (!Object.keys(shared).length) return withLocal(await call('state'));
      try {
        return withLocal(await call('settings', shared));
      } catch (err) {
        // The PC out of reach: kept on the phone at once, and sent with the other changes once it is back.
        const kept = err instanceof Unreachable && read(`${CACHE}state`, null);
        if (!kept) throw err;
        const next = { ...kept, settings: { ...kept.settings, ...shared } };
        write(`${CACHE}state`, next);
        enqueue('settings', [shared]);
        return withLocal(next);
      }
    },
    open: async (url) => openOutside(url),
    checkUpdate,
    installUpdate: async () => {
      if (!['available', 'error', 'permission'].includes(update.status)) await checkUpdate();
      if (!update.url) return update;
      const installer = window.Capacitor?.Plugins?.ApkInstaller;
      if (!installer) { openOutside(update.url); return setUpdate({ status: 'handoff' }); } // older app builds
      // Android asks once whether Onyx may install updates; after that it's one "Install" tap.
      if (!(await installer.canInstall()).allowed) {
        await installer.openInstallSettings();
        return setUpdate({ status: 'permission' });
      }
      setUpdate({ status: 'downloading', percent: 0, error: '' });
      const listener = await installer.addListener('progress', (p) => setUpdate({ status: 'downloading', percent: p.percent }));
      try {
        await installer.downloadAndInstall({ url: update.url });
        return setUpdate({ status: 'installing', percent: 100 });
      } catch (err) {
        return setUpdate({ status: 'error', error: err?.message || 'The update could not be downloaded.' });
      } finally {
        listener?.remove?.();
      }
    },
    updateState: async () => update,
    onUpdate: (fn) => updateListeners.add(fn),
    copy: async (text) => navigator.clipboard?.writeText(String(text)),
    // There is no push from the PC: check again every minute and whenever the app comes back.
    onChanged: (fn) => {
      setInterval(() => { if (document.visibilityState === 'visible') fn(); }, 60000);
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') fn(); });
    },
  };

  // Native-only: pairing links opened from the camera, the Android back button, update checks.
  const App = window.Capacitor?.Plugins?.App;
  if (App) {
    setTimeout(checkUpdate, 8000);
    setInterval(checkUpdate, 6 * 60 * 60 * 1000);
    syncWidget(); // a phone paired before the widgets existed hands them its connection now
    const handle = async (url) => {
      // The launch link is reported again after the reload below, so each link is used once.
      if (!url || !url.startsWith('onyx://') || read('onyx.used-link', '') === url) return;
      write('onyx.used-link', url);
      // Another app hands over a task: onyx://task?title=…&minutes=…&due=…&id=…&from=… The PC makes it; Magic add opens to plan it.
      if (url.startsWith('onyx://task')) {
        let detail;
        try { detail = await window.onyx.receiveTask(url); } catch (err) { detail = { error: err.message }; }
        window.onyxPendingMagic = detail;
        window.dispatchEvent(new CustomEvent('onyx:magic', { detail }));
        return;
      }
      // A tap on a home-screen widget: onyx://open?view=calendar|globe&date=YYYY-MM-DD
      if (url.startsWith('onyx://open')) {
        const q = new URL(url.replace('onyx://open', 'https://onyx.local/open')).searchParams;
        const detail = { view: q.get('view') || 'calendar', date: q.get('date') || '' };
        // The window may still be starting: it picks this up when it is ready.
        window.onyxPendingOpen = detail;
        window.dispatchEvent(new CustomEvent('onyx:open', { detail }));
        return;
      }
      try {
        await window.onyx.pairLink(url);
        location.reload();
      } catch (err) {
        // Scanning the same code again tries again, and the Connect screen says what went wrong
        // (it may not be up yet: it picks this up when it is).
        write('onyx.used-link', '');
        window.onyxPairError = err.message || 'Could not connect to the PC.';
        window.dispatchEvent(new CustomEvent('onyx:pair-failed', { detail: window.onyxPairError }));
      }
    };
    App.addListener('appUrlOpen', (e) => handle(e.url));
    App.getLaunchUrl?.().then((r) => handle(r?.url)).catch(() => {});
    App.addListener('backButton', () => {
      if (!(window.onyxBack && window.onyxBack())) App.minimizeApp?.();
    });
  }
})();
