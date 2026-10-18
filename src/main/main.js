const { app, BrowserWindow, Menu, Tray, clipboard, dialog, ipcMain, nativeImage, screen, session, shell } = require('electron');
const fs = require('fs');
const { spawn } = require('child_process');
const path = require('path');

// Lets a test run use a throwaway settings folder instead of the real one.
if (process.env.ONYX_USER_DATA) app.setPath('userData', process.env.ONYX_USER_DATA);

const store = require('./store');
const accounts = require('./accounts');
const hub = require('./hub');
const mcp = require('./mcp');
const api = require('./api');
const library = require('./library');
const updater = require('./updater');
const sync = require('./sync');

const { state } = api;

const ICON = path.join(__dirname, '../assets/icon.png');
const SMOKE_SHOT = process.env.ONYX_SMOKE; // test runs: save a screenshot here, then quit

let win = null;
let tray = null;
let quitting = false;

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  // A link opened while Onyx runs (onyx://task…) reaches this instance as an argument of the second one.
  app.on('second-instance', (_event, argv) => {
    showWindow();
    const link = linkIn(argv);
    if (link) receiveLink(link);
  });
  app.whenReady().then(boot);
}

// ---- onyx:// links: another app hands over a task (see deeplink.js). Only task links are taken on the
// PC; pairing links are for the phone.
const linkIn = (argv) => (argv || []).find((a) => /^onyx:\/\/task/i.test(a));
let pendingLink = null; // what the window is to plan: it asks for it when it is ready

async function receiveLink(url) {
  try {
    pendingLink = await api.handlers['link:task'](url);
  } catch (err) {
    pendingLink = { error: err.message };
  }
  showWindow();
  win?.webContents.send('magic-link');
}

function showWindow() {
  if (!win) return createWindow();
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

function createWindow() {
  const saved = store.data.window || {};
  win = new BrowserWindow({
    width: saved.width || 1360, height: saved.height || 860, x: saved.x, y: saved.y,
    minWidth: 920, minHeight: 600,
    show: false,
    backgroundColor: '#000000',
    icon: ICON,
    title: 'Onyx Calendar',
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#000000', symbolColor: '#8f8f98', height: 48 },
    webPreferences: {
      preload: path.join(__dirname, '../preload.js'),
      contextIsolation: true, nodeIntegration: false, sandbox: true,
      // The pomodoro timer chimes by itself when a block starts, without a click first.
      autoplayPolicy: 'no-user-gesture-required',
      // The Now / Next bar and the pomodoro timer chime on time while the window is hidden in the tray.
      backgroundThrottling: false,
    },
  });
  if (saved.maximized) win.maximize();
  win.loadFile(path.join(__dirname, '../renderer/index.html'));
  win.once('ready-to-show', () => {
    if (!process.argv.includes('--hidden') && !SMOKE_SHOT) win.show();
  });

  // The window only ever shows the app itself; links open in the real browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e) => e.preventDefault());
  if (!app.isPackaged) {
    win.webContents.on('before-input-event', (e, input) => {
      if (input.type === 'keyDown' && input.control && input.shift && input.key.toLowerCase() === 'i') win.webContents.toggleDevTools();
    });
  }

  win.on('close', (e) => {
    store.data.window = { ...win.getNormalBounds(), maximized: win.isMaximized() };
    store.save();
    if (!quitting && store.data.settings.closeToTray) {
      e.preventDefault();
      win.hide();
    }
  });
  win.on('closed', () => { win = null; });

  // With background throttling off (so chimes keep time in the tray), the page cannot tell it
  // is hidden by itself: it is told, so the globe stops drawing while nobody can see it.
  const visibility = () => win?.webContents.send('window-visibility', !win.isVisible() || win.isMinimized());
  for (const name of ['hide', 'minimize', 'show', 'restore']) win.on(name, visibility);
  win.webContents.on('did-finish-load', visibility);

  if (SMOKE_SHOT) {
    win.webContents.once('did-finish-load', () => setTimeout(async () => {
      // Test runs can drive the window first, e.g. open a view, then wait for it to settle.
      if (process.env.ONYX_SMOKE_JS) {
        await win.webContents.executeJavaScript(process.env.ONYX_SMOKE_JS).catch((err) => console.error(err));
        await new Promise((r) => setTimeout(r, 4000));
      }
      fs.writeFileSync(SMOKE_SHOT, (await win.webContents.capturePage()).toPNG());
      quitting = true;
      app.quit();
    }, 3000));
  }
}

// ---------------------------------------------------------------- on-screen popups
// When the Pi phones about something, and when something starts, a small window pops up
// in the corner of the screen, over everything (even with Onyx hidden in the tray). The
// calendar window decides when (app.js, tickPopups); a popup only reports its button.

const ALERT_W = 384, ALERT_H = 156, ALERT_GAP = 10;
const alerts = [];

const FULL_KINDS = ['call', 'push', 'leave']; // the full-screen action card; a start is a small card

function placeAlerts() {
  const area = screen.getPrimaryDisplay().workArea;
  alerts.filter((w) => !w.isDestroyed() && !FULL_KINDS.includes(w.alertData.kind)).forEach((w, i) => {
    w.setBounds({ x: area.x + area.width - ALERT_W - 16, y: area.y + area.height - (ALERT_H + ALERT_GAP) * (i + 1) - 6, width: ALERT_W, height: ALERT_H });
  });
}

function showAlert(a) {
  if (!a || typeof a !== 'object') throw new Error('Nothing to show.');
  const data = {
    key: String(a.key || ''), kind: FULL_KINDS.includes(a.kind) ? a.kind : 'start', id: String(a.id || ''),
    leaveAt: Number.isNaN(Date.parse(a.leaveAt || '')) ? '' : String(a.leaveAt),
    steps: Array.isArray(a.steps) ? a.steps.slice(0, 8).map((s) => String(s).slice(0, 90)).filter(Boolean) : [],
    title: String(a.title || '').slice(0, 200), start: String(a.start || ''), end: String(a.end || ''),
    color: /^#[0-9a-f]{3,8}$/i.test(a.color || '') ? a.color : '', calendar: String(a.calendar || '').slice(0, 80),
    sound: a.sound !== false, hour12: a.hour12 !== false, snoozed: !!a.snoozed,
  };
  const open = alerts.find((w) => !w.isDestroyed() && w.alertData.key === data.key);
  if (open) { open.showInactive(); return true; } // the same one is already up
  // The action card covers the whole screen (dimmed, see-through) at the point of performance.
  const full = FULL_KINDS.includes(data.kind);
  const bounds = full ? screen.getPrimaryDisplay().bounds : { width: ALERT_W, height: ALERT_H };
  const w = new BrowserWindow({
    ...bounds, frame: false, resizable: false, maximizable: false, minimizable: false, fullscreenable: false,
    alwaysOnTop: true, skipTaskbar: !full, show: false, icon: ICON, title: 'Onyx',
    ...(full ? { transparent: true, backgroundColor: '#00000000', hasShadow: false } : { backgroundColor: '#0b0b0e' }),
    webPreferences: {
      preload: path.join(__dirname, '../alert-preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true,
      autoplayPolicy: 'no-user-gesture-required', backgroundThrottling: false,
    },
  });
  w.alertData = data;
  w.setAlwaysOnTop(true, 'screen-saver');
  w.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  w.webContents.on('will-navigate', (e) => e.preventDefault());
  w.loadFile(path.join(__dirname, '../renderer/alert.html'), { query: { d: JSON.stringify(data) } });
  // The small card shows without taking the keyboard from what you are typing in; the action
  // card takes it, so Enter (Leaving now) and Esc work straight away.
  w.once('ready-to-show', () => { if (full) { w.show(); w.focus(); } else w.showInactive(); });
  w.on('closed', () => { alerts.splice(alerts.indexOf(w), 1); placeAlerts(); });
  alerts.push(w);
  placeAlerts();
  return true;
}

ipcMain.on('alert:act', (e, action) => {
  const w = BrowserWindow.fromWebContents(e.sender);
  if (!w || !alerts.includes(w)) return;
  const a = w.alertData;
  if (action === 'open') { showWindow(); win?.webContents.send('alert-action', { action: 'open', alert: a }); }
  if (action === 'snooze' || action === 'leaving') win?.webContents.send('alert-action', { action, alert: a });
  w.close();
});

function createTray() {
  tray = new Tray(nativeImage.createFromPath(ICON).resize({ width: 16, height: 16 }));
  tray.setToolTip('Onyx Calendar');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Open Onyx Calendar', click: showWindow },
    { type: 'separator' },
    { label: 'Quit', click: () => { quitting = true; app.quit(); } },
  ]));
  tray.on('click', showWindow);
}

// The window is a local file, so the YouTube player in the News panel would get no
// Referer and refuse to play ("Error 153: video player configuration"). Its requests
// are given one naming the app.
function allowYouTubeEmbeds() {
  session.defaultSession.webRequest.onBeforeSendHeaders(
    { urls: ['https://www.youtube-nocookie.com/*', 'https://www.youtube.com/*'] },
    (details, done) => {
      const headers = details.requestHeaders;
      if (!headers.Referer && !headers.referer) headers.Referer = 'https://onyx-calendar.app/';
      done({ requestHeaders: headers });
    },
  );
}

async function boot() {
  store.load();
  Menu.setApplicationMenu(null);
  allowYouTubeEmbeds();
  registerIpc();
  api.onSettingsChanged(async (before, now) => {
    if (now.launchAtLogin !== before.launchAtLogin && app.isPackaged) {
      app.setLoginItemSettings({ openAtLogin: now.launchAtLogin, args: ['--hidden'] });
    }
  });
  mcp.setAppApi(api.remote);
  // Onyx opens onyx:// links (a task from Tamkeen, say); an installed copy tells Windows each start.
  if (app.isPackaged) app.setAsDefaultProtocolClient('onyx');
  ipcMain.handle('magic-link:take', () => { const d = pendingLink; pendingLink = null; return d; });
  createWindow();
  const first = linkIn(process.argv);
  if (first) receiveLink(first);
  if (!SMOKE_SHOT) createTray();
  // Tasks another app sent through magic_add that were placed at once: the window offers the undo.
  require('./magic').onPlaced((d) => win?.webContents.send('magic-placed', d));
  await mcp.start(() => win?.webContents.send('changed'));
  // Another linked desktop changed something: show it. New sign-ins need their calendars read.
  sync.start((touched) => {
    if ([...touched].some((s) => s !== 'desktops')) hub.invalidate();
    if (touched.has('accounts') || touched.has('secrets.tokens')) hub.refreshCalendars().catch(() => {}).then(() => win?.webContents.send('changed'));
    win?.webContents.send('changed');
  });
  hub.refreshCalendars().then(() => win?.webContents.send('changed')).catch(() => {});
  updater.start((s) => win?.webContents.send('update', s));
  require('./caller').start(hub); // reminders by push (ntfy) or call (Twilio), when set up
}

app.on('before-quit', () => { quitting = true; store.flush(); });
app.on('window-all-closed', () => { if (quitting || !store.data.settings.closeToTray) app.quit(); });

// ---------------------------------------------------------------- what the window can ask for

/** Reads the client id and secret from a Google credentials file the user picks. */
async function loadGoogleCredentials() {
  const pick = await dialog.showOpenDialog(win, {
    title: 'Choose your Google credentials file',
    filters: [{ name: 'JSON', extensions: ['json'] }],
    properties: ['openFile'],
  });
  if (pick.canceled) return state();
  api.setGoogleClient(fs.readFileSync(pick.filePaths[0], 'utf8'));
  return state();
}

const { afterAccountChange } = api;

// Tamkeen, the Arabic study app: news videos can be opened in its player. It takes a
// tamkeen://watch?v=<id> link as its argument, and hands it to a copy already open.
const TAMKEEN_EXE = path.join(process.env.LOCALAPPDATA || '', 'Programs', 'ArabicPodcastStudio', 'ArabicPodcastStudio.exe');
const tamkeenInstalled = () => process.platform === 'win32' && !!process.env.LOCALAPPDATA && fs.existsSync(TAMKEEN_EXE);

function watchInTamkeen(id, seconds) {
  if (!/^[\w-]{11}$/.test(String(id || ''))) throw new Error('That is not a YouTube video.');
  if (!tamkeenInstalled()) throw new Error('Tamkeen is not installed on this PC.');
  const t = Number(seconds) > 0 ? `&t=${Math.floor(Number(seconds))}` : '';
  return new Promise((resolve, reject) => {
    const child = spawn(TAMKEEN_EXE, [`tamkeen://watch?v=${id}${t}&from=onyx`], { detached: true, stdio: 'ignore', cwd: path.dirname(TAMKEEN_EXE), windowsHide: false });
    child.once('error', (err) => reject(new Error(`Could not start Tamkeen: ${err.message}`)));
    child.once('spawn', () => { child.unref(); resolve(true); });
  });
}

// The shared commands (api.js), plus the ones only the desktop can do.
const HANDLERS = {
  ...api.handlers,
  'google:load': loadGoogleCredentials,
  'google:connect': async () => { await accounts.connectGoogle(); showWindow(); return afterAccountChange(); },
  'microsoft:connect': async (clientId) => {
    store.data.microsoft.clientId = String(clientId || '').trim();
    store.save();
    await accounts.connectMicrosoft();
    showWindow();
    return afterAccountChange();
  },
  'account:remove': (id) => { accounts.remove(id); return afterAccountChange(); },
  'update:check': () => updater.check(),
  'update:install': () => updater.install(),
  'update:state': () => updater.current(),
  // Web links only (links written in notes may be http): never files or other apps' schemes.
  open: (url) => { if (/^https?:\/\/[^\s]+$/i.test(String(url))) shell.openExternal(url); },
  copy: (text) => clipboard.writeText(String(text)),
  // Files and folders on this PC, pinned to the globe. These stay off the phone's list
  // (api.remote): only someone at the PC can pick, add or open them.
  'files:pick': async (folders, tags) => {
    const res = await dialog.showOpenDialog(win, {
      title: folders ? 'Add folders to the globe' : 'Add files to the globe',
      properties: folders ? ['openDirectory', 'multiSelections'] : ['openFile', 'multiSelections'],
    });
    return res.canceled ? [] : library.addLocalPins(res.filePaths, tags);
  },
  'files:add': (paths, tags) => library.addLocalPins(paths, tags),
  'files:open': (id, reveal) => library.openLocal(id, !!reveal),
  // The on-screen popup (only the PC has windows to pop up; the phone shows it in the app).
  'alert:show': (a) => showAlert(a),
  // Tamkeen on this PC (not offered to the phone, which opens its own Tamkeen).
  'tamkeen:info': () => ({ installed: tamkeenInstalled() }),
  'tamkeen:watch': (id, seconds) => watchInTamkeen(id, seconds),
};

function registerIpc() {
  for (const [name, fn] of Object.entries(HANDLERS)) {
    // Errors cross to the window as plain messages, so they can be shown as they are.
    ipcMain.handle(name, async (_event, ...args) => {
      try {
        return { ok: true, value: await fn(...args) };
      } catch (err) {
        return { ok: false, error: err.message || String(err) };
      }
    });
  }
}
