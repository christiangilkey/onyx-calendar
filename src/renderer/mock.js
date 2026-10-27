// Demo data for previewing the window in a plain browser (`npm run preview`).
// Inside the real app the preload script (desktop) or remote.js (Android) has
// already defined window.onyx, and this file does nothing.
(() => {
  if (window.onyx) return;

  const pad = (n) => String(n).padStart(2, '0');
  const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const day = (offset, h = 0, m = 0) => new Date(today.getFullYear(), today.getMonth(), today.getDate() + offset, h, m);

  const calendars = [
    { id: 'local/blocks', account: 'local', accountLabel: 'On this PC', provider: 'local', kind: 'calendar', name: 'Time Blocks', color: '#8b7cff', writable: true },
    { id: 'g1/personal', account: 'g1', accountLabel: 'you@gmail.com', provider: 'google', kind: 'calendar', name: 'Personal', color: '#4aa8ff', writable: true },
    { id: 'g1/family', account: 'g1', accountLabel: 'you@gmail.com', provider: 'google', kind: 'calendar', name: 'Family', color: '#5fd38d', writable: true },
    { id: 'g1/tl~main', account: 'g1', accountLabel: 'you@gmail.com', provider: 'google', kind: 'tasklist', name: 'My Tasks', color: '#f5b83d', writable: true },
    { id: 'm1/work', account: 'm1', accountLabel: 'you@outlook.com', provider: 'microsoft', kind: 'calendar', name: 'Calendar', color: '#ff9f4a', writable: true },
    { id: 'i1/feed', account: 'i1', accountLabel: 'Team schedule', provider: 'ics', kind: 'calendar', name: 'Team schedule', color: '#3fd0c9', writable: false },
  ];
  const cal = (id) => calendars.find((c) => c.id === id);

  const TAG_COLORS = ['#8b7cff', '#4aa8ff', '#3fd0c9', '#5fd38d', '#f5b83d', '#ff9f4a', '#ff6b6b', '#ff7eb6'];
  const tagColors = { study: '#8b7cff', arabic: '#3fd0c9', health: '#5fd38d', work: '#ff9f4a', family: '#4aa8ff', admin: '#f5b83d', writing: '#ff7eb6' };
  const tags = {}; // id -> tags

  let seq = 1;
  const ev = (calendarId, title, offset, sh, sm, eh, em, extra = {}, tagList = []) => {
    const e = {
      id: `${calendarId}/${seq++}`, calendarId, calendarName: cal(calendarId).name, color: cal(calendarId).color, kind: 'event',
      title, start: day(offset, sh, sm).toISOString(), end: day(offset, eh, em).toISOString(), allDay: false,
      location: '', notes: '', link: '', writable: cal(calendarId).writable, piCall: false, ...extra,
    };
    if (tagList.length) tags[e.id] = tagList;
    return e;
  };
  const dow = today.getDay();
  let events = [
    ev('local/blocks', 'Deep work: Arabic', 0, 9, 0, 11, 0, { piCall: true }, ['study', 'arabic']),
    ev('local/blocks', 'Gym', 0, 17, 30, 18, 30, {}, ['health']),
    ev('m1/work', 'Team sync', 0, 11, 30, 12, 0, {}, ['work']),
    ev('m1/work', 'Project review', 1, 13, 0, 14, 30, { location: 'Room 4B' }, ['work']),
    ev('g1/personal', 'Dentist', 1, 15, 0, 16, 0, { piCall: true }, ['health']),
    ev('g1/family', 'Dinner with Sam', 2, 18, 30, 20, 0, {}, ['family']),
    ev('i1/feed', 'Board meeting', 2, 13, 0, 14, 0, {}, ['work']),
    ev('local/blocks', 'Writing block', 2, 8, 0, 10, 30, {}, ['writing']),
    ev('m1/work', 'Budget planning', -1, 10, 0, 11, 30, {}, ['work', 'admin']),
    ev('local/blocks', 'Study: Sec+', -1, 14, 0, 16, 0, {}, ['study']),
    ev('local/blocks', 'Arabic flashcards', 1, 19, 0, 19, 45, {}, ['study', 'arabic']),
    ev('local/blocks', 'Run', 2, 7, 0, 7, 45, {}, ['health']),
    ev('local/blocks', 'Sec+ practice exam', 3, 16, 0, 18, 0, {}, ['study']),
    ev('g1/personal', 'Car service', 3 - (dow > 3 ? 7 : 0), 8, 30, 9, 30, {}, ['admin']),
    ev('i1/feed', 'Formation', 1, 6, 0, 6, 45),
    { ...ev('g1/family', 'Leave', 3, 0, 0, 0, 0, {}, ['family']), allDay: true, start: ymd(day(3)), end: ymd(day(5)) },
  ];
  let tasks = [
    { id: 'g1/tl~main/in1', title: 'Renew car insurance', label: 'Renew car insurance', arrived: true, provider: 'google', listName: 'My Tasks', date: null, time: null, start: null, call: null, notes: 'Quote from the broker is in my email.' },
    { id: 'g1/tl~main/in2', title: 'Pick up dry cleaning', label: 'Pick up dry cleaning', arrived: true, provider: 'google', listName: 'My Tasks', date: null, time: null, start: null, call: null },
    { id: 'g1/tl~main/in3', title: 'Reply to Dana about the budget', label: 'Reply to Dana about the budget', arrived: true, provider: 'microsoft', listName: 'Outlook Tasks', date: null, time: null, start: null, call: null },
    { id: 'g1/tl~main/a', title: '0800 Site visit', label: 'Site visit', date: ymd(day(1)), time: '08:00', start: day(1, 8).toISOString(), call: { at: day(1, 7).toISOString(), quiet: false, past: false } },
    { id: 'g1/tl~main/b', title: 'Call Alex 2pm', label: 'Call Alex', date: ymd(day(0)), time: '14:00', start: day(0, 14).toISOString(), call: { at: day(0, 13).toISOString(), quiet: false, past: day(0, 14) < new Date() } },
    { id: 'g1/tl~main/c', title: '0700 Check flight time', label: 'Check flight time', date: ymd(day(2)), time: '07:00', start: day(2, 7).toISOString(), call: { at: day(2, 6).toISOString(), quiet: true, past: false } },
    { id: 'g1/tl~main/d', title: 'Renew passport', label: 'Renew passport', date: ymd(day(4)), time: null, start: null, call: null, notes: 'Bring 2 photos and the old passport.\nForm DS-82, fee $130.' },
    { id: 'g1/tl~main/e', title: 'Anki 20 new words', label: 'Anki 20 new words', date: null, time: null, start: null, call: null },
    { id: 'g1/tl~main/f', title: 'Submit travel claim', label: 'Submit travel claim', date: ymd(day(-2)), time: null, start: null, call: null },
    { id: 'g1/tl~main/g', title: 'Read grammar chapter 4', label: 'Read grammar chapter 4', date: null, time: null, start: null, call: null },
    { id: 'g1/tl~main/h', title: 'Book dentist', label: 'Book dentist', date: ymd(day(0)), time: null, start: null, call: null, done: true, completed: day(0, 9).toISOString() },
    { id: 'g1/tl~main/i', title: 'Pay phone bill', label: 'Pay phone bill', date: ymd(day(-1)), time: null, start: null, call: null, done: true, completed: day(-1, 18).toISOString() },
  ].map((t) => ({ listId: 'g1/tl~main', listName: 'My Tasks', color: '#f5b83d', provider: 'google', notes: '', due: t.date, done: false, mirror: false, ...t }));  Object.assign(tags, { 'g1/tl~main/a': ['work'], 'g1/tl~main/d': ['admin'], 'g1/tl~main/e': ['study', 'arabic'], 'g1/tl~main/f': ['admin', 'work'], 'g1/tl~main/g': ['arabic'] });

  // Globe-only items: notes, and pinned Notion pages and Drive files.
  let notes = [
    { id: 'note/1', title: 'Arabic verb patterns', body: 'Form I-X cheat sheet…', kind: 'note' },
    { id: 'note/2', title: 'Sec+ weak areas', body: 'PKI, port numbers', kind: 'note' },
    { id: 'note/3', title: 'Gift ideas', body: '', kind: 'note' },
    { id: 'note/4', title: 'Random thought', body: '', kind: 'note' },
  ];
  let pins = [
    { id: 'notion/a1', source: 'notion', ref: 'a1', title: 'Study plan 2026', url: 'https://www.notion.so/', kind: 'page' },
    { id: 'notion/a2', source: 'notion', ref: 'a2', title: 'Reading list', url: 'https://www.notion.so/', kind: 'database' },
    { id: 'drive/d1', source: 'drive', ref: 'd1', title: 'Q4 budget', url: 'https://drive.google.com/', kind: 'sheet' },
    { id: 'drive/d2', source: 'drive', ref: 'd2', title: 'Arabic flashcards export', url: 'https://drive.google.com/', kind: 'doc' },
  ];
  Object.assign(tags, { 'note/1': ['arabic', 'study'], 'note/2': ['study'], 'note/3': ['family'], 'notion/a1': ['study'], 'drive/d1': ['work', 'admin'], 'drive/d2': ['arabic'] });
  // The News panel: a few channels and stories (video id, channel, title, minutes ago).
  let newsChannels = [
    { id: 'UC16niRr50-MSBwiO3YDb3RA', name: 'BBC News', on: true },
    { id: 'UChqUTb7kYRX8-EiaN3XFrSQ', name: 'Reuters', on: true },
    { id: 'UCeY0bbntWzzVIaj2z3QigXg', name: 'NBC News', on: true, live: true },
    { id: 'UCNye-wNBqNL5ZzHSJj3l8Bg', name: 'Al Jazeera English', on: true, live: true },
    { id: 'UCknLrEdhRCp1aegoMqRaCZg', name: 'DW News', on: false, live: true },
  ];
  const DEMO_NEWS = [
    ['uo819k4cjhs', 'UC16niRr50-MSBwiO3YDb3RA', 'Global news podcast: the day\'s top stories', 14],
    ['jl4aqRIrwD0', 'UChqUTb7kYRX8-EiaN3XFrSQ', 'LIVE: Students protest over education costs', 38],
    ['pE3naHw-avw', 'UCeY0bbntWzzVIaj2z3QigXg', 'Morning headlines: what you need to know today', 55],
    ['JA_iZjKVYUk', 'UC16niRr50-MSBwiO3YDb3RA', 'Behind the scenes of a new TV drama', 95],
    ['5tQNnrjqkFI', 'UChqUTb7kYRX8-EiaN3XFrSQ', 'King visits city on the north African coast', 140],
    ['nhK-Cw9pNXs', 'UCeY0bbntWzzVIaj2z3QigXg', 'Recovery after surgery "proceeding as expected"', 210],
  ];

  const DEMO_NOTION = [
    { source: 'notion', ref: 'a1', title: 'Study plan 2026', url: 'https://www.notion.so/', kind: 'page', icon: '📚' },
    { source: 'notion', ref: 'a2', title: 'Reading list', url: 'https://www.notion.so/', kind: 'database', icon: '📖' },
    { source: 'notion', ref: 'a3', title: 'Trip packing list', url: 'https://www.notion.so/', kind: 'page', icon: '🧳' },
  ];
  const DEMO_DRIVE = [
    { source: 'drive', ref: 'd1', title: 'Q4 budget', url: 'https://drive.google.com/', kind: 'sheet', account: 'you@gmail.com' },
    { source: 'drive', ref: 'd2', title: 'Arabic flashcards export', url: 'https://drive.google.com/', kind: 'doc', account: 'you@gmail.com' },
    { source: 'drive', ref: 'd3', title: 'Lease agreement.pdf', url: 'https://drive.google.com/', kind: 'pdf', account: 'you@gmail.com' },
  ];

  const allTags = () => {
    const counts = {};
    for (const list of Object.values(tags)) for (const t of list) counts[t] = (counts[t] || 0) + 1;
    return Object.keys(counts).sort().map((name) => ({ name, color: tagColors[name] || TAG_COLORS[0], count: counts[name] }));
  };
  const setTags = (id, list) => {
    const clean = [...new Set((list || []).map((t) => String(t).replace(/^#/, '').trim()).filter(Boolean))];
    for (const t of clean) if (!tagColors[t]) tagColors[t] = TAG_COLORS[Object.keys(tagColors).length % TAG_COLORS.length];
    if (clean.length) tags[id] = clean; else delete tags[id];
    return clean;
  };

  const state = {
    version: 'preview',
    settings: {
      hidden: {}, view: 'timeGridWeek', hour12: true, weekStart: 0, tasksPanel: true, closeToTray: true, launchAtLogin: false,
      defaultCalendar: 'local/blocks',
      pi: { enabled: true, taskList: 'g1/tl~main', leadMinutes: 60, quietStart: '22:00', quietEnd: '07:00' },
      mcp: { enabled: true, port: 4747, lan: true },
    },
    accounts: [
      { id: 'g1', provider: 'google', label: 'you@gmail.com' },
      { id: 'm1', provider: 'microsoft', label: 'you@outlook.com' },
      { id: 'i1', provider: 'ics', label: 'Team schedule', url: 'https://example.com/team.ics' },
    ],
    calendars,
    google: { ready: true },
    microsoft: { clientId: '' },
    notion: { connected: true, name: 'Onyx', workspace: 'My workspace' },
    mcp: { enabled: true, port: 4747, lan: true, running: true, error: '', token: 'preview-token', addresses: ['192.168.1.20'], peers: ['192.168.1.31:4747'] },
    desktops: { linked: true, device: 'a1', name: 'DESKTOP-MAIN', invite: null, desktops: [
      { id: 'a1', self: true, name: 'DESKTOP-MAIN', version: 'preview', addresses: ['192.168.1.20:4747', '100.101.12.7:4747'], online: true, seen: Date.now(), error: '' },
      { id: 'b2', self: false, name: 'LAPTOP', version: 'preview', addresses: ['192.168.1.31:4747'], online: true, seen: Date.now() - 12000, error: '' },
      { id: 'c3', self: false, name: 'OFFICE-PC', version: 'preview', addresses: ['10.0.0.8:4747'], online: false, seen: Date.now() - 3 * 86400000, error: 'Not reachable.' },
    ] },
  };
  const snapshot = () => structuredClone({ ...state, tags: allTags() });
  const merge = (target, patch) => {
    for (const [k, v] of Object.entries(patch)) {
      if (v && typeof v === 'object' && !Array.isArray(v) && k !== 'hidden') merge(target[k] ||= {}, v); else target[k] = v;
    }
  };
  // Magic add (preview): loads the real planner file once, then plans like the PC does without Claude.
  let magicLib = null;
  async function magicRun(text, date, o, given, travel, inboxIds = []) {
    magicLib ||= await new Promise((ok, no) => {
      if (window.OnyxMagicPlan) return ok(window.OnyxMagicPlan);
      const sc = document.createElement('script');
      sc.src = '../main/magic-plan.js';
      sc.onload = () => ok(window.OnyxMagicPlan); sc.onerror = () => no(new Error('planner not found'));
      document.head.append(sc);
    });
    const m = state.settings.magic || {};
    const home = o.home ?? m.home ?? '';
    const [y, mo, d] = date.split('-').map(Number);
    const day = new Date(y, mo - 1, d);
    const at = (hm) => { const [h, mi] = hm.split(':').map(Number); return new Date(y, mo - 1, d, h, mi).getTime(); };
    let from = at(o.start || m.start || '08:00');
    const to = at(o.end || m.end || '21:00');
    if (Date.now() > from && Date.now() < +day + 86400000) from = Math.max(from, Date.now() + 300000);
    if (to <= from) throw new Error('The day is over: pick tomorrow.');
    // Like the PC: the entries and the timed tasks of that day.
    const all = (await window.onyx.events(day.toISOString(), new Date(+day + 86400000).toISOString())).events;
    const busy = all.filter((e) => (e.kind === 'event' || e.kind === 'task') && !e.allDay && e.start && e.end)
      .map((e) => ({ start: +new Date(e.start), end: +new Date(e.end), place: e.location || null, title: e.title }));
    // The tasks that arrived from other apps and were picked: each is one task, keeping its id.
    const arrived = inboxIds.map((id) => tasks.find((t) => t.id === id)).filter(Boolean)
      .flatMap((t) => magicLib.estimateLocal(t.label).slice(0, 1).map((g) => ({ ...g, ref: t.id, ...(t.minutes ? { minutes: t.minutes, why: 'Length given by the app that sent it' } : {}) })));
    const list = magicLib.normalizeTasks(given || [...arrived, ...(text && text.trim() ? magicLib.estimateLocal(text) : [])]);
    if (!list.length) throw new Error('No tasks found in that. Put one on each line.');
    const r = magicLib.schedule(busy, list, { day, from, to, home: home || 'Home', travel: travel || [], lunch: (o.lunch ?? m.lunch) !== false });
    const iso = (ms) => new Date(ms).toISOString();
    return {
      source: given ? 'edited' : 'local', warning: '', tasks: list, travel: travel || [],
      blocks: r.blocks.map((b) => ({ idx: b.idx, part: b.part, ref: b.ref, title: b.title, start: iso(b.start), end: iso(b.end), minutes: b.minutes, travel: b.travel, place: b.place, why: b.why, kind: b.kind })),
      unplaced: r.unplaced.map((u) => ({ idx: u.idx, ref: u.task.ref, title: u.task.title, minutes: u.task.minutes, reason: u.reason })),
    };
  }

  const inboxDismissed = new Set();
  // Preview only: a task arrives from another app (window.__arrive('Call the landlord')).
  window.__arrive = (title, provider = 'google') => tasks.push({ id: `g1/tl~main/in${Date.now()}`, title, label: title, arrived: true, provider, listName: 'My Tasks', date: null, time: null, start: null, call: null });
  const withTags = (x) => ({ ...x, tags: tags[x.id] || [] });

  // Goals and repeating tasks (goals.js, repeat.js), kept simple.
  const repeats = {};      // task id -> rule
  // Pomodoro splits (hub.js setPomodoro), with a study block that is on right now for the timer.
  const pomodoros = {};
  const blockTasks = {}, blockTicks = {}; // a block's tasks (hub.js setBlockTasks), and each day's ticks
  const blockLinks = { 'local/blocks/1': [{ url: 'https://www.notion.so/', title: 'Study plan 2026', source: 'notion', kind: 'page', icon: '📚' }] }; // a block's links (hub.setBlockLinks)
  const eventColors = {};                  // a block's own colour (hub.js setEventColor)
  {
    const now = Date.now();
    events.push({
      id: 'local/blocks/pomo', calendarId: 'local/blocks', calendarName: 'Time Blocks', color: '#8b7cff', kind: 'event', title: 'Arabic study',
      start: new Date(now - 24 * 60000 - 50000).toISOString(), end: new Date(now + 96 * 60000).toISOString(), allDay: false,
      writable: true, location: '', notes: '', link: '',
    });
    pomodoros['local/blocks/pomo'] = { work: 25, rest: 5 };
    blockTasks['local/blocks/pomo'] = [{ id: 'a1', text: 'Review last week\'s flashcards' }, { id: 'a2', text: 'Read chapter 4' }, { id: 'a3', text: 'Write 10 new sentences' }];
    blockTicks['local/blocks/pomo'] = ['a1'];
  }
  const spawned = {};      // done task id -> the one added after it
  let goals = [{
    id: 'goal/arabic', title: 'Reach B1 Arabic', notes: 'Pass the OPI at level 2.', start: ymd(day(-30)), end: ymd(day(150)), color: '#ffb547', listId: 'g1/tl~main',
    steps: [
      { id: 's1', title: 'Learn the alphabet and its sounds', due: ymd(day(-20)), done: true, taskId: null },
      { id: 's2', title: 'Anki 20 new words', due: null, done: false, taskId: 'g1/tl~main/e', repeat: 'daily', log: [ymd(day(-3)), ymd(day(-2)), ymd(day(-1))].map((date) => ({ date, taskId: null })) },
      { id: 's3', title: 'Read grammar chapter 4', due: null, done: false, taskId: 'g1/tl~main/g' },
    ],
  }];
  tags['goal/arabic'] = ['study'];
  repeats['g1/tl~main/e'] = 'daily';
  // A task that repeats in Google Tasks: missed days pile up as copies with the same name.
  for (const n of [-2, -1, 0]) {
    tasks.push({ id: `g1/tl~main/stretch${n}`, listId: 'g1/tl~main', listName: 'My Tasks', color: '#f5b83d', provider: 'google', title: 'Stretch 07:30', label: 'Stretch', notes: '', due: ymd(day(n)), date: ymd(day(n)), time: '07:30', start: day(n, 7, 30).toISOString(), done: false, mirror: false, call: null });
  }
  const goalOf = (id) => { const g = goals.find((x) => x.steps.some((s) => s.taskId === id)); return g ? { id: g.id, title: g.title, color: g.color } : null; };
  const taskOut = (t) => ({ ...withTags(t), goal: goalOf(t.id), repeat: repeats[t.id] || null, pomodoro: pomodoros[t.id] || null });
  /** Marks copies of the same task (or ones Onyx repeats) as one series, as series.js does. */
  const withSeries = (list) => {
    const groups = new Map();
    for (const t of list) { const k = `${t.listId}|${t.label.toLowerCase()}`; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(t); }
    for (const [key, copies] of groups) {
      const managed = copies.find((t) => repeats[t.id]);
      if (copies.length < 2 && !managed) continue;
      copies.sort((a, b) => String(a.date).localeCompare(String(b.date)));
      const s = {
        key, label: copies[0].label, count: copies.length, rule: managed ? repeats[managed.id] : 'daily', everyDays: null,
        time: copies.find((t) => t.time)?.time || null, managed: !!managed, ids: copies.map((t) => t.id),
        overdue: copies.filter((t) => t.date && t.date < ymd(new Date())).length,
      };
      for (const t of copies) t.series = s;
    }
    return list;
  };
  const timesDue = (rule, start, end) => {
    const span = Math.round((new Date(`${end}T00:00`) - new Date(`${start}T00:00`)) / 86400000) + 1;
    return rule === 'weekly' ? Math.ceil(span / 7) : rule === 'weekdays' ? Math.round((span * 5) / 7) : span;
  };
  const goalOut = (g) => {
    const steps = g.steps.map((s) => {
      const t = s.taskId && tasks.find((x) => x.id === s.taskId);
      const base = t ? { ...s, title: t.title, due: t.date, done: s.repeat ? false : !!t.done } : { ...s };
      if (!s.repeat) return base;
      const log = s.log || [];
      return { ...base, count: log.length, target: timesDue(s.repeat, g.start, g.end), doneToday: log.some((e) => e.date === ymd(new Date())) };
    });
    const share = steps.reduce((sum, s) => sum + (s.repeat ? Math.min(1, s.count / s.target) : s.done ? 1 : 0), 0);
    const done = steps.filter((s) => (s.repeat ? s.count >= s.target : s.done)).length;
    return { ...g, steps, tags: tags[g.id] || [], progress: { done, total: steps.length, percent: steps.length ? Math.round((share / steps.length) * 100) : 0 } };
  };
  const nextDay = (date, rule) => {
    const d = new Date(`${date}T00:00`);
    const step = { daily: 1, weekdays: 1, weekly: 7, biweekly: 14 }[rule];
    do {
      if (step) d.setDate(d.getDate() + step); else if (rule === 'monthly') d.setMonth(d.getMonth() + 1); else d.setFullYear(d.getFullYear() + 1);
    } while (ymd(d) <= ymd(new Date()) || (rule === 'weekdays' && (d.getDay() === 0 || d.getDay() === 6)));
    return ymd(d);
  };
  const addTask = (d) => {
    const t = { id: `g1/tl~main/${seq++}`, listId: 'g1/tl~main', listName: 'My Tasks', color: '#f5b83d', provider: 'google', title: d.title, label: d.title, notes: d.notes || '', due: d.due || null, date: d.due || null, time: null, start: null, done: false, mirror: false, call: null, backburner: !!d.backburner && !d.due };
    if (d.inbox) Object.assign(t, { arrived: true, from: String(d.inbox) }); // made for Magic add (a Hyperfocus "Not now", the MCP server)
    tasks.push(t);
    if (d.tags) setTags(t.id, d.tags);
    return t;
  };
  async function syncGoalSteps(g, incoming) {
    const old = new Map(g.steps.map((s) => [s.id, s]));
    g.steps = (incoming || []).filter((s) => s.title?.trim()).map((raw) => {
      const s = old.get(raw.id) || { id: `s${seq++}`, taskId: null };
      old.delete(s.id);
      const rule = raw.repeat || null;
      Object.assign(s, { title: raw.title.trim(), due: rule ? s.due || raw.due || ymd(new Date()) : raw.due || null, done: rule ? false : !!raw.done });
      for (const k of ['phase', 'measure', 'minutes', 'until', 'time']) if (k in raw) { if (raw[k]) s[k] = raw[k]; else delete s[k]; }
      if (rule) { s.repeat = rule; s.log ||= []; } else delete s.repeat;
      const t = s.taskId && tasks.find((x) => x.id === s.taskId);
      if (t) Object.assign(t, { title: s.title, label: s.title, due: s.due, date: s.due, done: s.done, completed: s.done ? new Date().toISOString() : null });
      else if (!s.done) s.taskId = addTask({ title: s.title, due: s.due, notes: `A step toward: ${g.title}` }).id;
      if (rule) repeats[s.taskId] = rule; else delete repeats[s.taskId];
      return s;
    });
    for (const s of old.values()) if (s.taskId) tasks = tasks.filter((x) => x.id !== s.taskId || x.done);
  }

  const taskEvent = (t) => ({
    id: t.id, calendarId: t.listId, calendarName: t.listName, color: t.color, kind: 'task', title: t.label, location: '', notes: t.notes || '', link: '',
    goal: goalOf(t.id), repeat: repeats[t.id] || null, pomodoro: pomodoros[t.id] || null, leaveBy: t.leaveBy || null,
    writable: false, piCall: !!(t.call && !t.call.quiet && !t.call.past), movable: !t.mirror && !t.done,
    ...(t.start ? { allDay: false, start: t.start, end: new Date(new Date(t.start).getTime() + (pomodoros[t.id]?.minutes || t.minutes || 30) * 60000).toISOString() }
      : { allDay: true, start: t.date, end: ymd(new Date(new Date(`${t.date}T00:00`).getTime() + 86400000)) }),
  });

  window.onyx = {
    state: async () => snapshot(),
    refresh: async () => snapshot(),
    events: async (start, end) => ({
      events: [...events, ...tasks.filter((t) => t.date && !t.mirror).map((t) => ({ ...taskEvent(t), done: !!t.done })),
        ...goals.map(goalOut).map((g) => ({
          id: g.id, calendarId: g.id, calendarName: 'Goals', color: g.color, kind: 'goal', title: g.title, allDay: true,
          start: g.start, end: ymd(new Date(new Date(`${g.end}T00:00`).getTime() + 86400000)), notes: g.notes, writable: false, progress: g.progress,
        }))]
        .filter((e) => new Date(e.end) > new Date(start) && new Date(e.start) < new Date(end))
        .filter((e) => !state.settings.hidden[e.calendarId])
        .map((e) => ({ ...withTags(e), pomodoro: pomodoros[e.id] || null,
          ...(e.kind === 'event' && eventColors[e.id] ? { color: eventColors[e.id], calColor: e.color, ownColor: true } : {}),
          ...(e.kind === 'event' && blockLinks[e.seriesId || e.id]?.length ? { links: blockLinks[e.seriesId || e.id] } : {}),
          ...(e.kind === 'event' && blockTasks[e.id]?.length ? { taskList: blockTasks[e.id].map((t) => ({ ...t, done: (blockTicks[e.id] || []).includes(t.id) })) } : {}) })),
      errors: [],
    }),
    setPomodoro: async (id, cfg) => { if (cfg) pomodoros[id] = cfg; else delete pomodoros[id]; return pomodoros[id] || null; },
    setBlockLinks: async (key, items) => { const list = (items || []).filter((l) => /^https?:\/\//.test(l.url || '')).map((l) => ({ url: l.url, title: l.title || l.url, source: l.source || 'web', ...(l.kind ? { kind: l.kind } : {}), ...(l.icon ? { icon: l.icon } : {}) })); if (list.length) blockLinks[key] = list; else delete blockLinks[key]; return list; },
    setBlockTasks: async (key, items) => { const list = (items || []).filter((t) => t.text?.trim()).map((t) => ({ id: t.id || Math.random().toString(36).slice(2, 10), text: t.text.trim() })); if (list.length) blockTasks[key] = list; else delete blockTasks[key]; return list; },
    setEventColor: async (key, color) => { if (color) eventColors[key] = color; else delete eventColors[key]; return eventColors[key] || null; },
    tickBlockTask: async (id, taskId, done) => { const s = new Set(blockTicks[id] || []); if (done) s.add(taskId); else s.delete(taskId); blockTicks[id] = [...s]; return blockTicks[id]; },
    goals: async () => goals.map(goalOut),
    createGoal: async (d) => {
      if (!d.title) throw new Error('A goal needs a name.');
      const g = { id: `goal/${seq++}`, title: d.title, notes: d.notes || '', start: d.start, end: d.end, color: d.color, listId: 'g1/tl~main', steps: [] };
      goals.push(g);
      setTags(g.id, d.tags);
      await syncGoalSteps(g, d.steps);
      return { ...goalOut(g), warnings: [] };
    },
    updateGoal: async (id, d) => {
      const g = goals.find((x) => x.id === id);
      for (const k of ['title', 'notes', 'start', 'end', 'color']) if (k in d) g[k] = d[k]; // what was sent, as the PC does
      if (d.tags) setTags(id, d.tags);
      if ('steps' in d) await syncGoalSteps(g, d.steps);
      return { ...goalOut(g), warnings: [] };
    },
    deleteGoal: async (id) => {
      const g = goals.find((x) => x.id === id);
      for (const s of g.steps) if (s.taskId) tasks = tasks.filter((x) => x.id !== s.taskId || x.done);
      goals = goals.filter((x) => x !== g);
      delete tags[id];
    },
    repeatTask: async (id, rule) => {
      const t = tasks.find((x) => x.id === id);
      if (rule) repeats[id] = rule; else delete repeats[id];
      if (rule && !t.date) Object.assign(t, { due: ymd(new Date()), date: ymd(new Date()) });
      return taskOut(t);
    },
    shareSenders: async () => ({ senders: [{ id: 'g1', label: 'you@gmail.com', provider: 'google' }, { id: 'm1', label: 'you@outlook.com', provider: 'microsoft' }], recents: ['sam@example.com'] }),
    shareEmail: async (d) => {
      const to = String(d.to || '').split(/[\s,;]+/).filter(Boolean);
      if (!to.length) throw new Error('Enter who to send it to.');
      if (d.accountId === 'm1') throw new Error('To send from you@outlook.com, connect it again once in Settings → Calendars: Onyx now asks to send email too.');
      window.onyxSent = [...(window.onyxSent || []), d];
      return { sent: to.length, to, from: 'you@gmail.com' };
    },
    sharePages: async (q) => ({ connected: true, pages: [{ ref: 'p1', title: 'Weekly plan', url: 'https://notion.so/p1', kind: 'page', icon: '🗓️' }, { ref: 'p2', title: 'Reading list', url: 'https://notion.so/p2', kind: 'page', icon: '' }]
      .filter((p) => !q || p.title.toLowerCase().includes(String(q).toLowerCase())) }),
    shareNotion: async (d) => { window.onyxSentNotion = [...(window.onyxSentNotion || []), d]; return { ok: true }; },
    createEvent: async (d) => {
      const c = cal(d.calendarId);
      const e = { id: `${c.id}/${seq++}`, calendarId: c.id, calendarName: c.name, color: c.color, kind: 'event', location: '', link: '', writable: true, ...d, title: d.blank ? '' : d.title || 'Time block' };
      delete e.tags;
      if (d.recur) e.seriesId = e.id; // shown as one block: enough to see the repeat in the window
      events.push(e);
      setTags(e.id, d.tags);
      return withTags(e);
    },
    updateEvent: async (id, patch) => {
      const e = events.find((x) => x.id === id);
      const { tags: newTags, seriesId, from, ...rest } = patch;
      Object.assign(e, rest);
      if (newTags) setTags(id, newTags);
      if (patch.calendarId) Object.assign(e, { calendarName: cal(patch.calendarId).name, color: cal(patch.calendarId).color });
      return withTags(e);
    },
    setLeaveBy: async (id, minutes) => { const e = events.find((x) => x.id === id); if (e) e.leaveBy = minutes || null; return e?.leaveBy ?? null; },
    ackCall: async (id) => { const e = events.find((x) => x.id === id); if (e) e.callAck = true; return true; },
    deleteEvent: async (id) => { events = events.filter((x) => x.id !== id); delete tags[id]; },
    setCall: async (event, on, before) => { const e = events.find((x) => x.id === event.id); e.piCall = on; e.callBefore = on ? before ?? null : null; return { piCall: on, callBefore: e.callBefore }; },
    tasks: async () => ({
      tasks: withSeries(tasks.filter((t) => !t.done).map(taskOut)), errors: [],
      inbox: tasks.filter((t) => t.arrived && !t.start && !t.done && !inboxDismissed.has(t.id)).map((t) => t.id),
    }),
    updateSeries: async (key, d) => {
      const copies = withSeries(tasks.filter((t) => !t.done).map(taskOut)).filter((t) => t.series?.key === key);
      if (d.rule !== undefined && !copies[0]?.series.managed) throw new Error('Google Tasks does not let other apps change how often its tasks repeat. Change that in the Google Tasks app; the name, time and notes can be changed here.');
      for (const c of copies) {
        const t = tasks.find((x) => x.id === c.id);
        Object.assign(t, { label: d.label, title: d.time ? `${d.label} ${d.time}` : d.label, time: d.time || null, ...('notes' in d ? { notes: d.notes } : {}) });
      }
      return { changed: copies.length, warnings: [] };
    },
    stopSeries: async (key) => {
      const copies = withSeries(tasks.filter((t) => !t.done).map(taskOut)).filter((t) => t.series?.key === key);
      tasks = tasks.filter((t) => !copies.some((c) => c.id === t.id));
      return { deleted: copies.length, warnings: [] };
    },
    clearSeries: async (key) => {
      const copies = withSeries(tasks.filter((t) => !t.done).map(taskOut)).filter((t) => t.series?.key === key);
      const late = copies.filter((t) => t.date < ymd(new Date()));
      const keep = late.length === copies.length ? late.at(-1) : null;
      for (const c of late) if (c !== keep) Object.assign(tasks.find((x) => x.id === c.id), { done: true, completed: new Date().toISOString() });
      return { done: late.length - (keep ? 1 : 0) };
    },
    setGoalStep: async (id, stepId, done) => {
      const g = goals.find((x) => x.id === id);
      const s = g.steps.find((x) => x.id === stepId);
      const today = ymd(new Date());
      if (s.repeat) {
        s.log ||= [];
        if (done && !s.log.some((e) => e.date === today)) s.log.push({ date: today, taskId: null });
        if (!done) s.log = s.log.filter((e) => e.date !== today);
      } else {
        s.done = done;
        const t = s.taskId && tasks.find((x) => x.id === s.taskId);
        if (t) Object.assign(t, { done, completed: done ? new Date().toISOString() : null });
      }
      return goalOut(g);
    },
    archivedTasks: async (from, to = from) => {
      const min = new Date(`${from}T00:00`), max = new Date(new Date(`${to}T00:00`).getTime() + 86400000);
      const done = tasks.filter((t) => t.done && t.completed && new Date(t.completed) >= min && new Date(t.completed) < max);
      return { tasks: done.sort((a, b) => b.completed.localeCompare(a.completed)).map(withTags), errors: [] };
    },
    createTask: async (d) => taskOut(addTask(d)),
    emails: async () => ({ emails: [
      { id: 'mail:g1:1', provider: 'gmail', account: 'you@gmail.com', subject: 'Flight confirmation: SFO → JFK', from: 'United Airlines', date: new Date().toISOString(), preview: 'Your trip on Oct 22 is confirmed.', link: 'https://mail.google.com', tags: [] },
      { id: 'mail:m1:2', provider: 'outlook', account: 'you@outlook.com', subject: 'Quarterly report draft', from: 'Dana', date: new Date(Date.now() - 86400000).toISOString(), preview: 'Can you look over section 3 by Friday?', link: 'https://outlook.office.com/mail/', tags: ['work'] },
    ], problems: [] }),
    setEventDone: async (id, done) => { const e = events.find((x) => x.id === id); if (e) e.done = !!done; return !!done; },
    setBackburner: async (id, on) => { const t = tasks.find((x) => x.id === id); if (t) t.backburner = !!on; return !!on; },
    updateTask: async (id, patch) => {
      const t = tasks.find((x) => x.id === id);
      const { tags: newTags, ...rest } = patch;
      Object.assign(t, rest);
      if ('done' in rest) t.completed = rest.done ? new Date().toISOString() : null;
      if (rest.title) t.label = rest.title;
      if ('due' in rest) {
        t.date = rest.due;
        t.start = rest.due && t.time ? new Date(`${rest.due}T${t.time}`).toISOString() : null;
        t.call = null;
      }
      if (newTags) setTags(id, newTags);
      if (rest.done === true && repeats[id]) {
        // A repeating task done: the next one, and the rule (and goal step) move to it.
        const next = addTask({ title: t.title, due: nextDay(t.date || ymd(new Date()), repeats[id]), notes: t.notes, tags: tags[id] });
        repeats[next.id] = repeats[id];
        delete repeats[id];
        spawned[id] = next.id;
        for (const g of goals) for (const s of g.steps) if (s.taskId === id) s.taskId = next.id;
        return { ...taskOut(t), next: taskOut(next) };
      }
      if (rest.done === false && spawned[id] && repeats[spawned[id]]) {
        const nextId = spawned[id];
        repeats[id] = repeats[nextId];
        delete repeats[nextId];
        for (const g of goals) for (const s of g.steps) if (s.taskId === nextId) s.taskId = id;
        tasks = tasks.filter((x) => x.id !== nextId);
        delete spawned[id];
      }
      return taskOut(t);
    },
    resizeTask: async (id, to) => {
      const t = tasks.find((x) => x.id === id);
      if (to.start && (!t.start || +new Date(to.start) !== +new Date(t.start))) await window.onyx.moveTask(id, { start: to.start });
      t.minutes = to.minutes;
      return taskOut(t);
    },
    dismissInbox: async (id) => { inboxDismissed.add(id); return true; },
    receiveTask: async (link) => {
      const q = new URL(link).searchParams;
      const id = `g1/tl~main/in${Date.now()}`;
      tasks.push({ id, title: q.get('title'), label: q.get('title'), arrived: true, from: q.get('from') || 'app', provider: 'google', listName: 'My Tasks', date: q.get('due') || ymd(day(0)), time: null, start: null, call: null, minutes: Number(q.get('minutes')) || null });
      return { taskId: id, title: q.get('title'), date: q.get('due') || ymd(day(0)), minutes: Number(q.get('minutes')) || null, from: q.get('from') || 'app', created: true };
    },
    takeMagicLink: async () => { const d = window.__magicLink || null; window.__magicLink = null; return d; },
    onMagicLink: (fn) => { window.__onMagicLink = fn; },
    planTask: async (id, to) => {
      const t = tasks.find((x) => x.id === id);
      const prev = { title: t.title, due: t.due || null, minutes: t.minutes || null, leaveBy: t.leaveBy || null, state: 'new' };
      await window.onyx.moveTask(id, { start: to.start });
      t.minutes = to.minutes; t.leaveBy = to.leaveBy || null; inboxDismissed.add(id);
      return { task: taskOut(t), prev };
    },
    unplanTask: async (id, prev) => {
      const t = tasks.find((x) => x.id === id);
      Object.assign(t, { date: prev.due, due: prev.due, time: null, start: null, minutes: prev.minutes, leaveBy: prev.leaveBy });
      inboxDismissed.delete(id);
      return true;
    },
    moveTask: async (id, to) => {
      const t = tasks.find((x) => x.id === id);
      if (to.start) {
        const d = new Date(to.start);
        t.date = ymd(d); t.due = t.date; t.time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; t.start = d.toISOString();
      } else {
        t.date = to.date; t.due = to.date; t.time = null; t.start = null;
      }
      t.call = null;
      return taskOut(t);
    },
    deleteTask: async (id) => { tasks = tasks.filter((x) => x.id !== id); delete tags[id]; },
    setTags: async (id, list) => setTags(id, list),
    setTagColor: async (tag, color) => { tagColors[tag] = color; return snapshot(); },
    renameTag: async (from, to) => {
      for (const [id, list] of Object.entries(tags)) tags[id] = [...new Set(list.map((t) => (t === from ? to : t)))];
      tagColors[to] ||= tagColors[from];
      return snapshot();
    },
    deleteTag: async (tag) => {
      for (const [id, list] of Object.entries(tags)) { tags[id] = list.filter((t) => t !== tag); if (!tags[id].length) delete tags[id]; }
      return snapshot();
    },
    globe: async () => ({ notes: notes.map(withTags), pins: pins.map(withTags) }),
    createNote: async (d) => { const n = { id: `note/${seq++}`, title: d.title || 'Untitled note', body: d.body || '', created: new Date().toISOString(), updated: new Date().toISOString(), kind: 'note' }; notes.push(n); setTags(n.id, d.tags); return withTags(n); },
    updateNote: async (id, d) => { const n = notes.find((x) => x.id === id); Object.assign(n, { title: d.title ?? n.title, body: d.body ?? n.body }); if (d.tags) setTags(id, d.tags); return withTags(n); },
    deleteNote: async (id) => { notes = notes.filter((x) => x.id !== id); delete tags[id]; },
    addPin: async (r) => {
      if (r.source === 'web') {
        let u; try { u = new URL(/^www\./i.test(r.url) ? `https://${r.url}` : r.url); } catch { throw new Error('That is not a web address.'); }
        r = { ...r, url: u.href, ref: u.href, title: r.title || u.hostname.replace(/^www\./, ''), kind: 'link' };
      }
      const p = { id: `${r.source}/${r.ref}`, source: r.source, ref: r.ref, title: r.title, url: r.url, kind: r.kind, notes: r.notes || '' };
      pins = [...pins.filter((x) => x.id !== p.id), p]; setTags(p.id, r.tags); return withTags(p);
    },
    // The preview has no file system: picking "finds" a file, dropping uses the file's name.
    addFiles: async (paths, t) => paths.map((p) => {
      const name = p.split(/[\\/]/).pop();
      const pin = { id: `local/${p}`, source: 'local', ref: p, title: name, url: '', path: p, kind: /\.pdf$/i.test(p) ? 'pdf' : /\./.test(name) ? 'file' : 'dir', notes: '' };
      pins = [...pins.filter((x) => x.id !== pin.id), pin];
      if (t?.length) setTags(pin.id, t);
      return withTags(pin);
    }),
    pickFiles: async (folders, t) => window.onyx.addFiles([folders ? 'C:\\Users\\you\\Documents\\Arabic course' : 'C:\\Users\\you\\Desktop\\Lease agreement.pdf'], t),
    openFile: async () => {},
    pathOf: (file) => `C:\\Users\\you\\Desktop\\${file.name}`,
    updatePin: async (id, d) => { const p = pins.find((x) => x.id === id); if (d.tags) setTags(id, d.tags); if ('notes' in d) p.notes = d.notes; return withTags(p); },
    news: async (force, mode) => {
      const on = newsChannels.filter((c) => c.on);
      const stories = DEMO_NEWS.filter(([, ch]) => on.some((c) => c.id === ch)).map(([id, ch, title, min]) => ({
        id, title, channelId: ch, channel: newsChannels.find((c) => c.id === ch).name,
        published: new Date(Date.now() - min * 60000).toISOString(), thumb: `https://i.ytimg.com/vi/${id}/mqdefault.jpg`,
      }));
      return { stories, channels: structuredClone(newsChannels), errors: [], language: mode === 'tamkeen' ? { code: 'ar', name: 'Arabic' } : null };
    },
    setNewsChannel: async (id, on) => { newsChannels.find((c) => c.id === id).on = on; return structuredClone(newsChannels); },
    removeNewsChannel: async (id) => { newsChannels = newsChannels.filter((c) => c.id !== id); return structuredClone(newsChannels); },
    resetNewsChannels: async () => structuredClone(newsChannels),
    addNewsChannel: async (input) => {
      const handle = String(input).replace(/^.*@/, '').trim();
      if (!/^[\w.-]{3,30}$/.test(handle)) throw new Error('Paste a YouTube channel link or its @handle.');
      newsChannels.push({ id: `UC${handle.padEnd(22, 'x').slice(0, 22)}`, name: handle, on: true, custom: true });
      return structuredClone(newsChannels);
    },
    setMemo: async (id, text) => { const e = events.find((x) => x.id === id); if (e) e.memo = String(text || '').trimEnd(); return e?.memo || ''; },
    removePin: async (id) => { pins = pins.filter((x) => x.id !== id); delete tags[id]; },
    searchNotion: async (q) => DEMO_NOTION.filter((r) => r.title.toLowerCase().includes(String(q).toLowerCase())),
    searchDrive: async (q) => DEMO_DRIVE.filter((r) => r.title.toLowerCase().includes(String(q).toLowerCase())),
    connectNotion: async () => snapshot(),
    disconnectNotion: async () => snapshot(),
    pairing: async () => ({ link: 'onyx://pair?a=192.168.1.20%3A4747&t=preview-token', page: 'http://192.168.1.20:4747/pair#a=192.168.1.20%3A4747&t=preview-token', qr: '', addresses: ['192.168.1.20:4747'], token: 'preview-token', running: true, lan: true }),
    settings: async (patch) => { merge(state.settings, patch); return snapshot(); },
    // Linked desktops (sync.js on the PC).
    desktops: async () => structuredClone(state.desktops),
    inviteDesktop: async () => { state.desktops.invite = { code: 'K7QM-4XPA', expires: Date.now() + 600000, addresses: ['192.168.1.20:4747', '100.101.12.7:4747'] }; return structuredClone(state.desktops); },
    cancelInvite: async () => { state.desktops.invite = null; return structuredClone(state.desktops); },
    joinDesktop: async (address, code) => {
      if (String(code).replace(/[^a-z0-9]/gi, '').length !== 8) throw new Error('The code is 8 letters and numbers, like ABCD-2345.');
      return snapshot();
    },
    leaveDesktops: async () => { state.desktops = { linked: false, device: 'a1', name: 'DESKTOP-MAIN', invite: null, desktops: [] }; return structuredClone(state.desktops); },
    forgetDesktop: async (id) => { state.desktops.desktops = state.desktops.desktops.filter((x) => x.id !== id); return structuredClone(state.desktops); },
    tamkeen: { info: async () => ({ installed: true }), watch: async (id) => { window.lastTamkeen = id; return true; } },
    // Magic add for goals (preview): a plan made up from the outline's lines, then the real fitting (src/main/goal-plan.js).
    planGoal: async (o = {}) => {
      const P = await new Promise((ok, no) => {
        if (window.OnyxGoalPlan) return ok(window.OnyxGoalPlan);
        const sc = document.createElement('script');
        sc.src = '../main/goal-plan.js';
        sc.onload = () => ok(window.OnyxGoalPlan); sc.onerror = () => no(new Error('planner not found'));
        document.head.append(sc);
      });
      await new Promise((r) => setTimeout(r, 900));
      if (!String(o.title || '').trim()) throw new Error('Give the goal a name first.');
      const today = ymd(new Date()), start = o.start || today, end = o.end;
      const level = o.level || 3;
      const t0 = new Date(start + 'T00:00').getTime();
      const span = Math.max(14, Math.round((new Date(end + 'T00:00') - t0) / 86400000));
      const at = (days) => ymd(new Date(t0 + Math.round(days) * 86400000));
      const phases = [
        { name: 'Foundations', start, end: at(span / 3), milestone: 'The basics in place' },
        { name: 'Build', start: at(span / 3), end: at((2 * span) / 3), milestone: 'Half of the work done' },
        { name: 'Finish', start: at((2 * span) / 3), end, milestone: o.title },
      ];
      const lines = String(o.outline || '').split(/\r?\n/).map((l) => l.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '').trim()).filter(Boolean);
      const tasks = [];
      lines.forEach((l, i) => {
        const done = /\[x\]|✓|\bdone\b/i.test(l);
        const name = l.replace(/\[x\]|✓|\(?\bdone\b\)?/gi, '').trim();
        tasks.push({ title: done ? name : `Finish ${name} (1 part)`, measure: '1 part finished', phase: 1 + (i % 3), repeat: 'once', start: done ? today : at(((i % 3) + 0.5) * (span / 3)), minutes: 45, when: 'any', done });
      });
      const habits = [['Practise for 20 minutes', 'daily', 20, 'morning'], ['Review the week in 15 minutes', 'weekly', 15, 'evening'], ['Write 200 words', 'weekdays', 30, 'afternoon'], ['Read 10 pages', 'daily', 25, 'evening'], ['Do 1 timed drill', 'weekdays', 15, 'morning']];
      for (let p = 0; p < 3; p++) {
        for (const [t, r, m, w] of habits.slice(0, level)) tasks.push({ title: `${t} (${phases[p].name.toLowerCase()})`, measure: t, phase: p + 1, repeat: r, start: phases[p].start, until: phases[p].end, minutes: m, when: w });
      }
      const n = level * 6;
      for (let k = 0; k < n; k++) tasks.push({ title: `Complete practice set ${k + 1} of ${n}`, measure: `Set ${k + 1} checked`, phase: 1 + Math.floor((k * 3) / n), repeat: 'once', start: at(((k + 1) * span) / (n + 1)), minutes: 40, when: 'any' });
      const plan = P.normalize({ phases, tasks }, { start, end, today });
      const busy = events.filter((e) => !e.allDay).map((e) => ({ start: +new Date(e.start), end: +new Date(e.end) }));
      if (o.fit !== false) P.fitTimes(plan.steps, busy, { today, end });
      for (const s of plan.steps) s.sessions = P.timesIn(s.repeat, s.due, s.until || s.due);
      return { ...plan, summary: P.summary(plan.steps, { start: start > today ? start : today, end }), level };
    },
    breakdown: async (title, opts = {}) => {
      const all = ['Clear a space to work', 'Gather what you need', `Open what "${title}" needs`, 'Do the first small part', 'Take a short look at it', 'Do the next part', 'Check it over', 'Tidy up', 'Tick it off', 'Take a breath', 'Tell someone it is done', 'Plan what comes next'];
      return all.slice(0, [3, 4, 6, 9, 12][(opts.level || 3) - 1]);
    },
    setAiKey: async () => snapshot(),
    // Hyperfocus sessions (focus.js on the PC), kept for this visit.
    logFocus: async (s) => { (window.focusLog ||= []).push(s); return s; },
    focusSessions: async () => window.focusLog || [],
    focusStart: async (s) => { window.focusActive = s; return { id: 'f1', reach: s.escalate ? 'push' : null, warning: null }; },
    focusEnd: async () => { const had = !!window.focusActive; window.focusActive = null; return had; },
    // Hermes asking for a session (start_focus): in the preview, window.onyxAskFocus({ title, minutes }).
    onFocusRequest: (fn) => { window.onyxAskFocus = (req) => { window.focusAsk = { taskId: null, minutes: null, ...req }; fn(); }; },
    takeFocusRequest: async () => { const r = window.focusAsk || null; window.focusAsk = null; return r; },
    focusInsights: async () => {
      const F = window.OnyxFocus, list = window.focusLog || [];
      return { best: F.bestWindow(list), hours: F.focusHours(list).filter((h) => h.count), now: F.hourScore(list, new Date().getHours()), rated: list.filter((s) => s.rating).length, needed: F.BEST_MIN_RATED };
    },
    focusNext: async ({ current = {}, rating = null, minutes = 0 } = {}) => {
      if (!window.OnyxMagicPlan) await magicRun('x', ymd(new Date()), {}).catch(() => {}); // loads the real planner
      const kindOf = (t) => window.OnyxMagicPlan?.estimateLocal(t)[0]?.kind || 'other';
      return window.OnyxFocus.rotation(tasks.map(withTags), { current, today: ymd(new Date()), kindOf, rating, minutes })
        .map((x) => ({ ...x, task: { id: x.task.id, title: x.task.label || x.task.title, minutes: x.task.minutes || null } }));
    },
    // Magic add: the same planner the PC uses (src/main/magic-plan.js), with the offline estimate.
    magicPlan: async (text, date, o = {}, inboxIds = []) => magicRun(text, date, o, null, null, inboxIds),
    magicReplan: async (tasks, travel, date, o = {}) => magicRun(null, date, o, tasks, travel),
    magicRemember: async (o) => { Object.assign(state.settings.magic ||= {}, o); return snapshot(); },
    syncDesktops: async () => structuredClone({ ...state.desktops, invite: null }),
    loadGoogleCredentials: async () => snapshot(),
    connectGoogle: async () => snapshot(),
    connectMicrosoft: async () => snapshot(),
    addFeed: async () => snapshot(),
    removeAccount: async () => snapshot(),
    addLocalCalendar: async () => snapshot(),
    removeLocalCalendar: async () => snapshot(),
    open: async () => {},
    copy: async () => {},
    onChanged: () => {},
    // A pretend update, so the popup and its progress bar can be seen in the preview.
    checkUpdate: async () => ({ ...update }),
    installUpdate: async () => {
      update = { ...update, status: 'downloading', percent: 0 };
      const timer = setInterval(() => {
        update = { ...update, percent: Math.min(100, update.percent + 20) };
        if (update.percent >= 100) { clearInterval(timer); update = { ...update, status: 'ready' }; }
        for (const fn of updateListeners) fn({ ...update });
      }, 400);
      return { ...update };
    },
    updateState: async () => ({ ...update }),
    onUpdate: (fn) => updateListeners.add(fn),
  };
  let update = { status: 'available', current: '1.3.0', version: '1.4.0', notes: 'What\'s new\n\n- An update button\n- Popups for new versions' };
  const updateListeners = new Set();
})();
