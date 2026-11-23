// Sticky notes (1.140.0): small coloured notes in windows of their own, set anywhere on the desktop,
// for thoughts, ideas and quick lists. They are kept on this PC (store.data.stickies) and come back
// where you left them when Onyx starts. A note is not a task, but its lines can become tasks: the
// lines you select, or the whole note (the first line names the task, the rest are its notes).
//
// store.data.stickies: [{ id, text, color, bounds: { x, y, width, height }, onTop, created, updated }]

const store = require('./store');

const COLORS = ['yellow', 'pink', 'blue', 'green', 'purple', 'orange'];
// The paper colour of each, so the window never flashes another colour while it loads (sticky.html has the same).
const PAPER = { yellow: '#ffe66d', pink: '#ffb1c8', blue: '#9fd3ff', green: '#b4eea0', purple: '#d2bfff', orange: '#ffc285' };
const SIZE = { width: 280, height: 260 };
const MIN = { width: 200, height: 150 };
const MAX_TEXT = 20000;

const notes = () => (store.data.stickies ??= []);
const find = (id) => notes().find((n) => n.id === id);
const newId = () => `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/** A new note: the next colour along from the last one, so notes side by side look different. */
function makeNote(at, now = Date.now()) {
  const last = notes()[notes().length - 1];
  const color = COLORS[(COLORS.indexOf(last?.color) + 1) % COLORS.length];
  const n = { id: newId(), text: '', color, bounds: { ...SIZE, ...at }, onTop: false, created: now, updated: now };
  notes().push(n);
  store.save();
  return n;
}

function setText(id, text) {
  const n = find(id);
  if (!n) return false;
  const t = String(text ?? '').slice(0, MAX_TEXT);
  if (t === n.text) return true;
  n.text = t;
  n.updated = Date.now();
  store.save();
  return true;
}

function setColor(id, color) {
  const n = find(id);
  if (!n || !COLORS.includes(color)) return false;
  n.color = color;
  store.save();
  return true;
}

function remove(id) {
  const list = notes();
  const i = list.findIndex((n) => n.id === id);
  if (i < 0) return false;
  list.splice(i, 1);
  store.save();
  return true;
}

// A list mark at the start of a line: "- ", "* ", "• ", "1. ", "[ ] ", "[x] ".
const MARK = /^\s*(?:[-*•–]\s+|\d+[.)]\s+|\[[ xX]?\]\s*)/;

/**
 * What tasks a note's text makes. The selected lines: one task each, list marks taken off.
 * The whole note: one task, named by its first line, with the other lines as its notes.
 */
function tasksFrom(text, selected) {
  const clean = (l) => l.replace(MARK, '').trim();
  if (selected && selected.trim()) {
    return selected.split(/\r?\n/).map(clean).filter(Boolean).map((title) => ({ title: title.slice(0, 500) }));
  }
  const lines = String(text || '').split(/\r?\n/);
  const first = lines.findIndex((l) => clean(l));
  if (first < 0) return [];
  const notesText = lines.slice(first + 1).join('\n').trim();
  return [{ title: clean(lines[first]).slice(0, 500), ...(notesText ? { notes: notesText } : {}) }];
}

// ---------------------------------------------------------------- the windows (Electron only)

const wins = new Map(); // note id -> BrowserWindow
let electron = null, hub = null, onChanged = () => {};

function open(n) {
  const { BrowserWindow, screen } = electron;
  const old = wins.get(n.id);
  if (old && !old.isDestroyed()) { old.show(); old.focus(); return old; }
  // A note left on a screen that is gone comes back on the main one.
  const b = n.bounds || SIZE;
  const onScreen = screen.getAllDisplays().some((d) => {
    const a = d.workArea;
    return b.x >= a.x - b.width + 60 && b.x <= a.x + a.width - 60 && b.y >= a.y && b.y <= a.y + a.height - 40;
  });
  const area = screen.getPrimaryDisplay().workArea;
  const bounds = onScreen && Number.isFinite(b.x) ? b : { ...SIZE, x: area.x + area.width - SIZE.width - 40, y: area.y + 40 };
  const w = new BrowserWindow({
    ...bounds, minWidth: MIN.width, minHeight: MIN.height, frame: false, show: false, skipTaskbar: true,
    minimizable: false, maximizable: false, fullscreenable: false, alwaysOnTop: !!n.onTop, title: 'Sticky note',
    backgroundColor: PAPER[n.color] || PAPER.yellow,
    webPreferences: { preload: require('path').join(__dirname, '../sticky-preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  w.stickyId = n.id;
  w.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  w.webContents.on('will-navigate', (e) => e.preventDefault());
  let t = null;
  const keep = () => {
    clearTimeout(t);
    t = setTimeout(() => {
      const note = find(n.id);
      if (!note || w.isDestroyed()) return;
      note.bounds = w.getBounds();
      store.save();
    }, 400);
  };
  w.on('moved', keep);
  w.on('resized', keep);
  w.on('closed', () => { if (wins.get(n.id) === w) wins.delete(n.id); });
  w.once('ready-to-show', () => w.show());
  w.loadFile(require('path').join(__dirname, '../renderer/sticky.html'), { query: { id: n.id } });
  wins.set(n.id, w);
  return w;
}

/** A new note, opened next to the mouse (or offset from the note it was made from). */
function create(from) {
  const { screen } = electron;
  let at;
  const src = from && wins.get(from);
  if (src && !src.isDestroyed()) {
    const b = src.getBounds();
    at = { x: b.x + 28, y: b.y + 28 };
  } else {
    const p = screen.getCursorScreenPoint();
    const a = screen.getDisplayNearestPoint(p).workArea;
    at = { x: Math.min(Math.max(a.x, p.x - 40), a.x + a.width - SIZE.width), y: Math.min(Math.max(a.y, p.y - 20), a.y + a.height - SIZE.height) };
  }
  const n = makeNote(at);
  const w = open(n);
  w.once('ready-to-show', () => w.focus());
  return n.id;
}

/** Brings every note to the front (from the tray, or Onyx's window). With none, makes one. */
function showAll() {
  if (!notes().length) return create();
  for (const n of notes()) {
    const w = open(n);
    if (!w.isVisible()) continue;
    w.showInactive();
    w.moveTop();
  }
  return notes().length;
}

function start(deps) {
  electron = require('electron');
  hub = deps.hub;
  onChanged = deps.onChanged || onChanged;
  const { ipcMain, BrowserWindow } = electron;
  const idOf = (e) => BrowserWindow.fromWebContents(e.sender)?.stickyId;
  const handle = (name, fn) => ipcMain.handle(`sticky:${name}`, (e, ...args) => {
    const id = idOf(e);
    if (!id || !find(id)) throw new Error('That note is gone.');
    return fn(id, BrowserWindow.fromWebContents(e.sender), ...args);
  });
  handle('load', (id) => ({ ...find(id), colors: COLORS }));
  handle('text', (id, w, text) => setText(id, text));
  handle('color', (id, w, color) => setColor(id, color));
  handle('pin', (id, w, on) => { const n = find(id); n.onTop = !!on; store.save(); w.setAlwaysOnTop(!!on); return n.onTop; });
  handle('new', (id) => create(id));
  handle('delete', (id, w) => { remove(id); w.destroy(); return true; });
  handle('task', async (id, w, selected) => {
    const list = tasksFrom(find(id).text, selected);
    if (!list.length) throw new Error('Write something first.');
    for (const t of list) await hub.createTask(t);
    onChanged();
    return list.length;
  });
  for (const n of notes()) open(n);
}

module.exports = { start, create, showAll, tasksFrom, makeNote, setText, setColor, remove, COLORS };
