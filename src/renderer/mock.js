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
    { id: 'g1/tl~main/a', title: '0800 Site visit', label: 'Site visit', date: ymd(day(1)), time: '08:00', start: day(1, 8).toISOString(), call: { at: day(1, 7).toISOString(), quiet: false, past: false } },
    { id: 'g1/tl~main/b', title: 'Call Alex 2pm', label: 'Call Alex', date: ymd(day(0)), time: '14:00', start: day(0, 14).toISOString(), call: { at: day(0, 13).toISOString(), quiet: false, past: day(0, 14) < new Date() } },
    { id: 'g1/tl~main/c', title: '0700 Check flight time', label: 'Check flight time', date: ymd(day(2)), time: '07:00', start: day(2, 7).toISOString(), call: { at: day(2, 6).toISOString(), quiet: true, past: false } },
    { id: 'g1/tl~main/d', title: 'Renew passport', label: 'Renew passport', date: ymd(day(4)), time: null, start: null, call: null },
    { id: 'g1/tl~main/e', title: 'Anki 20 new words', label: 'Anki 20 new words', date: null, time: null, start: null, call: null },
    { id: 'g1/tl~main/f', title: 'Submit travel claim', label: 'Submit travel claim', date: ymd(day(-2)), time: null, start: null, call: null },
    { id: 'g1/tl~main/g', title: 'Read grammar chapter 4', label: 'Read grammar chapter 4', date: null, time: null, start: null, call: null },
  ].map((t) => ({ listId: 'g1/tl~main', listName: 'My Tasks', color: '#f5b83d', provider: 'google', notes: '', due: t.date, done: false, mirror: false, ...t }));
  Object.assign(tags, { 'g1/tl~main/a': ['work'], 'g1/tl~main/d': ['admin'], 'g1/tl~main/e': ['study', 'arabic'], 'g1/tl~main/f': ['admin', 'work'], 'g1/tl~main/g': ['arabic'] });

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
    mcp: { enabled: true, port: 4747, lan: true, running: true, error: '', token: 'preview-token', addresses: ['192.168.1.20'] },
  };
  const snapshot = () => structuredClone({ ...state, tags: allTags() });
  const merge = (target, patch) => {
    for (const [k, v] of Object.entries(patch)) {
      if (v && typeof v === 'object' && !Array.isArray(v) && k !== 'hidden') merge(target[k] ||= {}, v); else target[k] = v;
    }
  };
  const withTags = (x) => ({ ...x, tags: tags[x.id] || [] });
  const taskEvent = (t) => ({
    id: t.id, calendarId: t.listId, calendarName: t.listName, color: t.color, kind: 'task', title: t.label, location: '', notes: '', link: '',
    writable: false, piCall: !!(t.call && !t.call.quiet && !t.call.past), movable: !t.mirror && !t.done,
    ...(t.start ? { allDay: false, start: t.start, end: new Date(new Date(t.start).getTime() + 1800000).toISOString() }
      : { allDay: true, start: t.date, end: ymd(new Date(new Date(`${t.date}T00:00`).getTime() + 86400000)) }),
  });

  window.onyx = {
    state: async () => snapshot(),
    refresh: async () => snapshot(),
    events: async (start, end) => ({
      events: [...events, ...tasks.filter((t) => t.date && !t.done).map(taskEvent)]
        .filter((e) => new Date(e.end) > new Date(start) && new Date(e.start) < new Date(end))
        .filter((e) => !state.settings.hidden[e.calendarId])
        .map(withTags),
      errors: [],
    }),
    createEvent: async (d) => {
      const c = cal(d.calendarId);
      const e = { id: `${c.id}/${seq++}`, calendarId: c.id, calendarName: c.name, color: c.color, kind: 'event', location: '', link: '', writable: true, ...d, title: d.title || 'Time block' };
      delete e.tags;
      events.push(e);
      setTags(e.id, d.tags);
      return withTags(e);
    },
    updateEvent: async (id, patch) => {
      const e = events.find((x) => x.id === id);
      const { tags: newTags, ...rest } = patch;
      Object.assign(e, rest);
      if (newTags) setTags(id, newTags);
      if (patch.calendarId) Object.assign(e, { calendarName: cal(patch.calendarId).name, color: cal(patch.calendarId).color });
      return withTags(e);
    },
    deleteEvent: async (id) => { events = events.filter((x) => x.id !== id); delete tags[id]; },
    setCall: async (event, on) => { events.find((x) => x.id === event.id).piCall = on; return { piCall: on }; },
    tasks: async () => ({ tasks: tasks.map(withTags), errors: [] }),
    createTask: async (d) => { tasks.push({ id: `g1/tl~main/${seq++}`, listId: 'g1/tl~main', listName: 'My Tasks', color: '#f5b83d', provider: 'google', title: d.title, label: d.title, notes: '', due: null, date: null, time: null, start: null, done: false, mirror: false, call: null }); },
    updateTask: async (id, patch) => {
      const t = tasks.find((x) => x.id === id);
      const { tags: newTags, ...rest } = patch;
      Object.assign(t, rest);
      if (rest.title) t.label = rest.title;
      if ('due' in rest) {
        t.date = rest.due;
        t.start = rest.due && t.time ? new Date(`${rest.due}T${t.time}`).toISOString() : null;
        t.call = null;
      }
      if (newTags) setTags(id, newTags);
      return withTags(t);
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
      return withTags(t);
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
    addPin: async (r) => { const p = { id: `${r.source}/${r.ref}`, source: r.source, ref: r.ref, title: r.title, url: r.url, kind: r.kind }; pins = [...pins.filter((x) => x.id !== p.id), p]; setTags(p.id, r.tags); return withTags(p); },
    updatePin: async (id, d) => { if (d.tags) setTags(id, d.tags); return withTags(pins.find((x) => x.id === id)); },
    removePin: async (id) => { pins = pins.filter((x) => x.id !== id); delete tags[id]; },
    searchNotion: async (q) => DEMO_NOTION.filter((r) => r.title.toLowerCase().includes(String(q).toLowerCase())),
    searchDrive: async (q) => DEMO_DRIVE.filter((r) => r.title.toLowerCase().includes(String(q).toLowerCase())),
    connectNotion: async () => snapshot(),
    disconnectNotion: async () => snapshot(),
    pairing: async () => ({ link: 'onyx://pair?a=192.168.1.20%3A4747&t=preview-token', page: 'http://192.168.1.20:4747/pair#a=192.168.1.20%3A4747&t=preview-token', qr: '', addresses: ['192.168.1.20:4747'], token: 'preview-token', running: true, lan: true }),
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
