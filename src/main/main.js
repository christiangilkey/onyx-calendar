const { app, BrowserWindow, Menu, Tray, clipboard, dialog, ipcMain, nativeImage, session, shell } = require('electron');
const fs = require('fs');
const path = require('path');

// Lets a test run use a throwaway settings folder instead of the real one.
if (process.env.ONYX_USER_DATA) app.setPath('userData', process.env.ONYX_USER_DATA);

const store = require('./store');
const accounts = require('./accounts');
const hub = require('./hub');
const mcp = require('./mcp');
const api = require('./api');
const updater = require('./updater');

const { state } = api;

const ICON = path.join(__dirname, '../assets/icon.png');
const SMOKE_SHOT = process.env.ONYX_SMOKE; // test runs: save a screenshot here, then quit

let win = null;
let tray = null;
let quitting = false;

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', showWindow);
  app.whenReady().then(boot);
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
  createWindow();
  if (!SMOKE_SHOT) createTray();
  await mcp.start(() => win?.webContents.send('changed'));
  hub.refreshCalendars().then(() => win?.webContents.send('changed')).catch(() => {});
  updater.start((s) => win?.webContents.send('update', s));
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
  open: (url) => { if (/^https:\/\//i.test(String(url))) shell.openExternal(url); },
  copy: (text) => clipboard.writeText(String(text)),
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
