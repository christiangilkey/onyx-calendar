// The Android app's link to Onyx on the PC. It provides the same window.onyx
// commands as the desktop preload script, but runs them on the PC over the
// network (POST /app/rpc), and keeps the last answers so the calendar can still
// be read when the PC is off or out of reach.
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
  // Settings that belong to this phone rather than to the shared calendar.
  const PHONE_ONLY = ['view', 'tasksPanel', 'newsPanel'];

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

  async function post(address, name, args) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(`http://${address}/app/rpc`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${conn.token}` },
        body: JSON.stringify({ name, args }),
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

  const CACHED = new Set(['state', 'events', 'tasks', 'globe']);

  // The home-screen widgets fetch from the PC themselves: they get its address and token
  // from here, and a nudge to refresh after anything is changed in the app.
  const Widget = window.Capacitor?.Plugins?.OnyxWidget;
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

  async function call(name, ...args) {
    if (!conn) throw new Error('This phone is not connected to Onyx on your PC yet.');
    const order = [conn.last, ...conn.addresses.filter((a) => a !== conn.last)].filter(Boolean);
    for (const address of order) {
      let body;
      try {
        body = await post(address, name, args);
      } catch (err) {
        if (err.final) throw err;
        continue; // that address is not answering: try the next one
      }
      setOnline(true);
      if (conn.last !== address) { conn.last = address; write(CONN, conn); }
      if (!body.ok) throw new Error(body.error);
      if (CACHED.has(name)) write(cacheKey(name, args), body.value);
      if (name === 'events') rememberEvents(body.value.events);
      nudgeWidget(name);
      return body.value;
    }
    setOnline(false);
    const cached = CACHED.has(name) ? fromCache(name, args) : null;
    if (cached) return cached;
    throw new Error('Can\'t reach Onyx on your PC. Check that it is running, and that the phone is on the same wifi (or on Tailscale).');
  }

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
    try {
      const state = await call('state');
      if (!online) throw new Error('Could not reach the PC at that address.');
      write(CONN, conn);
      syncWidget();
      return state;
    } catch (err) {
      conn = previous;
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

  async function checkUpdate() {
    const current = await appVersion();
    setUpdate({ status: 'checking', current, error: '' });
    try {
      const res = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, { headers: { Accept: 'application/vnd.github+json' } });
      if (!res.ok) throw new Error(`GitHub answered ${res.status}`);
      const rel = await res.json();
      const version = String(rel.tag_name || '').replace(/^v/, '');
      const apk = (rel.assets || []).find((a) => a.name.endsWith('.apk'));
      if (current && apk && isNewer(version, current)) {
        return setUpdate({ status: 'available', version, notes: rel.body || '', url: apk.browser_download_url });
      }
      return setUpdate({ status: 'current', version: current || version });
    } catch {
      return setUpdate({ status: 'error', error: 'Could not reach GitHub to check for updates.' });
    }
  }

  window.ONYX_PHONE = true;
  window.onyx = {
    isPhone: true,
    paired: () => !!conn,
    connection: () => (conn ? { addresses: conn.addresses, last: conn.last, online } : null),
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
    unpair: () => {
      conn = null;
      localStorage.removeItem(CONN);
      syncWidget();
      for (const key of Object.keys(localStorage)) if (key.startsWith(CACHE)) localStorage.removeItem(key);
    },
    onOnline: (fn) => listeners.add(fn),

    state: async () => withLocal(await call('state')),
    refresh: async () => withLocal(await call('refresh')),
    events: (start, end, force) => call('events', start, end, force),
    createEvent: (data) => call('event:create', data),
    updateEvent: (id, patch) => call('event:update', id, patch),
    deleteEvent: (id) => call('event:delete', id),
    setCall: (event, on) => call('event:call', event, on),
    tasks: (force) => call('tasks', force),
    createTask: (data) => call('task:create', data),
    updateTask: (id, patch) => call('task:update', id, patch),
    moveTask: (id, to) => call('task:move', id, to),
    archivedTasks: (from, to) => call('tasks:archived', from, to),
    deleteTask: (id) => call('task:delete', id),
    repeatTask: (id, rule) => call('task:repeat', id, rule),
    updateSeries: (key, data) => call('series:update', key, data),
    clearSeries: (key) => call('series:clear', key),
    goals: (force) => call('goals', force),
    createGoal: (data) => call('goal:create', data),
    updateGoal: (id, data) => call('goal:update', id, data),
    deleteGoal: (id, keepTasks) => call('goal:delete', id, keepTasks),
    setGoalStep: (id, stepId, done) => call('goal:step', id, stepId, done),
    setTags: (id, tags) => call('tags:set', id, tags),
    setMemo: (id, text) => call('memo:set', id, text),
    setPomodoro: (id, cfg) => call('pomodoro:set', id, cfg),
    news: (force) => call('news', force),
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
      return withLocal(Object.keys(shared).length ? await call('settings', shared) : await call('state'));
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
        window.dispatchEvent(new CustomEvent('onyx:toast', { detail: err.message }));
      }
    };
    App.addListener('appUrlOpen', (e) => handle(e.url));
    App.getLaunchUrl?.().then((r) => handle(r?.url)).catch(() => {});
    App.addListener('backButton', () => {
      if (!(window.onyxBack && window.onyxBack())) App.minimizeApp?.();
    });
  }
})();
