// Demo data for previewing the window in a plain browser (`npm run preview`).
// Inside the real app the preload script has already defined window.onyx, and
// this file does nothing.
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

  let seq = 1;
  const ev = (calendarId, title, offset, sh, sm, eh, em, extra = {}) => ({
    id: `${calendarId}/${seq++}`, calendarId, calendarName: cal(calendarId).name, color: cal(calendarId).color, kind: 'event',
    title, start: day(offset, sh, sm).toISOString(), end: day(offset, eh, em).toISOString(), allDay: false,
    location: '', notes: '', link: '', writable: cal(calendarId).writable, piCall: false, ...extra,
  });
  const dow = today.getDay();
  let events = [
    ev('local/blocks', 'Deep work: Arabic', 0, 9, 0, 11, 0, { piCall: true }),
    ev('local/blocks', 'Gym', 0, 17, 30, 18, 30),
    ev('m1/work', 'Team sync', 0, 11, 30, 12, 0),
    ev('m1/work', 'Project review', 1, 13, 0, 14, 30, { location: 'Room 4B' }),
    ev('g1/personal', 'Dentist', 1, 15, 0, 16, 0, { piCall: true }),
    ev('g1/family', 'Dinner with Sam', 2, 18, 30, 20, 0),
    ev('i1/feed', 'Board meeting', 2, 13, 0, 14, 0),
    ev('local/blocks', 'Writing block', 2, 8, 0, 10, 30),
    ev('m1/work', 'Budget planning', -1, 10, 0, 11, 30),
    ev('local/blocks', 'Study: Sec+', -1, 14, 0, 16, 0),
    ev('g1/personal', 'Car service', 3 - (dow > 3 ? 7 : 0), 8, 30, 9, 30),
    ev('i1/feed', 'Formation', 1, 6, 0, 6, 45),
    { ...ev('g1/family', 'Leave', 3, 0, 0, 0, 0), allDay: true, start: ymd(day(3)), end: ymd(day(5)) },
  ];
  let tasks = [
    { id: 'g1/tl~main/a', title: '0800 Site visit', label: 'Site visit', date: ymd(day(1)), time: '08:00', start: day(1, 8).toISOString(), call: { at: day(1, 7).toISOString(), quiet: false, past: false } },
    { id: 'g1/tl~main/b', title: 'Call Alex 2pm', label: 'Call Alex', date: ymd(day(0)), time: '14:00', start: day(0, 14).toISOString(), call: { at: day(0, 13).toISOString(), quiet: false, past: day(0, 14) < new Date() } },
    { id: 'g1/tl~main/c', title: '0700 Check flight time', label: 'Check flight time', date: ymd(day(2)), time: '07:00', start: day(2, 7).toISOString(), call: { at: day(2, 6).toISOString(), quiet: true, past: false } },
    { id: 'g1/tl~main/d', title: 'Renew passport', label: 'Renew passport', date: ymd(day(4)), time: null, start: null, call: null },
    { id: 'g1/tl~main/e', title: 'Anki 20 new words', label: 'Anki 20 new words', date: null, time: null, start: null, call: null },
    { id: 'g1/tl~main/f', title: 'Submit travel claim', label: 'Submit travel claim', date: ymd(day(-2)), time: null, start: null, call: null },
  ].map((t) => ({ listId: 'g1/tl~main', listName: 'My Tasks', color: '#f5b83d', provider: 'google', notes: '', due: t.date, done: false, mirror: false, ...t }));

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
    mcp: { enabled: true, port: 4747, lan: true, running: true, error: '', token: 'preview-token', addresses: ['192.168.1.20'] },
  };
  const snapshot = () => structuredClone(state);
  const merge = (target, patch) => {
    for (const [k, v] of Object.entries(patch)) {
      if (v && typeof v === 'object' && !Array.isArray(v) && k !== 'hidden') merge(target[k] ||= {}, v); else target[k] = v;
    }
  };
  const taskEvent = (t) => ({
    id: t.id, calendarId: t.listId, calendarName: t.listName, color: t.color, kind: 'task', title: t.label, location: '', notes: '', link: '',
    writable: false, piCall: !!(t.call && !t.call.quiet && !t.call.past),
    ...(t.start ? { allDay: false, start: t.start, end: new Date(new Date(t.start).getTime() + 1800000).toISOString() }
      : { allDay: true, start: t.date, end: ymd(new Date(new Date(`${t.date}T00:00`).getTime() + 86400000)) }),
  });

  window.onyx = {
    state: async () => snapshot(),
    refresh: async () => snapshot(),
    events: async () => ({ events: [...events, ...tasks.filter((t) => t.date && !t.done).map(taskEvent)], errors: [] }),
    createEvent: async (d) => {
      const c = cal(d.calendarId);
      const e = { id: `${c.id}/${seq++}`, calendarId: c.id, calendarName: c.name, color: c.color, kind: 'event', location: '', link: '', writable: true, ...d, title: d.title || 'Time block' };
      events.push(e);
      return e;
    },
    updateEvent: async (id, patch) => {
      const e = events.find((x) => x.id === id);
      Object.assign(e, patch);
      if (patch.calendarId) Object.assign(e, { calendarName: cal(patch.calendarId).name, color: cal(patch.calendarId).color });
      return e;
    },
    deleteEvent: async (id) => { events = events.filter((x) => x.id !== id); },
    setCall: async (event, on) => { events.find((x) => x.id === event.id).piCall = on; return { piCall: on }; },
    tasks: async () => ({ tasks, errors: [] }),
    createTask: async (d) => { tasks.push({ id: `g1/tl~main/${seq++}`, listId: 'g1/tl~main', listName: 'My Tasks', color: '#f5b83d', provider: 'google', title: d.title, label: d.title, notes: '', due: null, date: null, time: null, start: null, done: false, mirror: false, call: null }); },
    updateTask: async (id, patch) => { const t = tasks.find((x) => x.id === id); Object.assign(t, patch); if (patch.title) t.label = patch.title; },
    deleteTask: async (id) => { tasks = tasks.filter((x) => x.id !== id); },
    settings: async (patch) => { merge(state.settings, patch); return snapshot(); },
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
  };
})();
