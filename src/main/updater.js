// Updates from the GitHub releases page: check, download, then install and restart.
// The installed app checks shortly after starting and every few hours; the window
// shows a popup when a newer version is out, and the Update button checks on demand.

const { app } = require('electron');
const { autoUpdater } = require('electron-updater');

const CHECK_EVERY_MS = 6 * 60 * 60 * 1000;

autoUpdater.autoDownload = false;          // only when the user says "Update now"
autoUpdater.autoInstallOnAppQuit = false;
autoUpdater.logger = null;

let send = () => {};
let state = { status: 'idle', current: app.getVersion() };
let downloading = null;

function update(patch) {
  state = { ...state, ...patch };
  send(state);
  return state;
}

/** Release notes arrive as HTML; the window shows plain text. */
function plainNotes(notes) {
  const text = Array.isArray(notes) ? notes.map((n) => n.note || '').join('\n\n') : String(notes || '');
  return text.replace(/<\/(p|li|h\d)>/gi, '\n').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\n{3,}/g, '\n\n').trim();
}

autoUpdater.on('download-progress', (p) => update({ status: 'downloading', percent: Math.round(p.percent || 0) }));
autoUpdater.on('error', (err) => { if (state.status === 'downloading') update({ status: 'error', error: err.message }); });

/** Asks GitHub for the latest release. Resolves to the state the window should show. */
async function check() {
  if (!app.isPackaged && !process.env.ONYX_UPDATE_TEST) return update({ status: 'dev', error: 'Updates work in the installed app.' });
  if (state.status === 'downloading' || state.status === 'ready') return state;
  update({ status: 'checking', error: '' });
  try {
    const result = await autoUpdater.checkForUpdates();
    const info = result?.updateInfo;
    if (result?.isUpdateAvailable && info) {
      return update({ status: 'available', version: info.version, notes: plainNotes(info.releaseNotes), date: info.releaseDate || '' });
    }
    return update({ status: 'current', version: info?.version || state.current });
  } catch (err) {
    const offline = /ENOTFOUND|ETIMEDOUT|ECONNREFUSED|net::/i.test(err.message);
    return update({ status: 'error', error: offline ? 'Could not reach GitHub to check for updates.' : err.message });
  }
}

/** Downloads the new version, then closes Onyx, installs it and starts it again. */
async function install() {
  if (state.status !== 'available' && state.status !== 'error') await check();
  if (state.status !== 'available' && state.status !== 'error') return state;
  if (!downloading) {
    update({ status: 'downloading', percent: 0, error: '' });
    downloading = autoUpdater.downloadUpdate().finally(() => { downloading = null; });
  }
  try {
    await downloading;
  } catch (err) {
    return update({ status: 'error', error: err.message });
  }
  update({ status: 'ready', percent: 100 });
  if (process.env.ONYX_UPDATE_TEST) return state; // test runs stop before installing
  setTimeout(() => autoUpdater.quitAndInstall(true, true), 800); // silent install, then restart
  return state;
}

/** Starts the background checks. `notify(state)` reaches the window. */
function start(notify) {
  send = notify;
  if (!app.isPackaged && !process.env.ONYX_UPDATE_TEST) return;
  setTimeout(check, 15000);
  setInterval(check, CHECK_EVERY_MS);
}

module.exports = { start, check, install, current: () => state };
