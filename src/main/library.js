// Things that live on the globe without being calendar entries: notes written in
// Onyx, and Notion pages, Google Drive files and web links pinned to it. Like
// everything else, they are grouped into clusters by their (Onyx-only) tags.
//
// ids:  note/<id>   notion/<page id>   drive/<file id>   web/<hash of the link>
//       local/<hash of the path> (a file or folder on this PC)

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const store = require('./store');
const hub = require('./hub');

const now = () => new Date().toISOString();
const newId = () => crypto.randomBytes(5).toString('hex');

function lists() {
  const d = store.data;
  if (!Array.isArray(d.notes)) d.notes = [];
  if (!Array.isArray(d.pins)) d.pins = [];
  return d;
}

const tagsOf = (id) => store.data.tags[id] || [];

// ---------------------------------------------------------------- notes

function noteOut(n) {
  return { ...n, kind: 'note', tags: tagsOf(n.id) };
}

function listNotes() {
  return lists().notes.map(noteOut).sort((a, b) => (a.updated < b.updated ? 1 : -1));
}

function createNote({ title = '', body = '', tags } = {}) {
  const note = { id: `note/${newId()}`, title: String(title).trim() || 'Untitled note', body: String(body), created: now(), updated: now() };
  lists().notes.push(note);
  if (tags) hub.setTags(note.id, tags);
  store.save();
  return noteOut(note);
}

function updateNote(id, patch = {}) {
  const note = lists().notes.find((n) => n.id === id);
  if (!note) throw new Error('That note no longer exists.');
  if ('title' in patch) note.title = String(patch.title).trim() || 'Untitled note';
  if ('body' in patch) note.body = String(patch.body);
  if ('tags' in patch) hub.setTags(id, patch.tags);
  note.updated = now();
  store.save();
  return noteOut(note);
}

function deleteNote(id) {
  const d = lists();
  if (!d.notes.some((n) => n.id === id)) throw new Error('That note no longer exists.');
  d.notes = d.notes.filter((n) => n.id !== id);
  hub.setTags(id, []);
  store.save();
}

// ---------------------------------------------------------------- pinned documents

const SOURCES = new Set(['notion', 'drive', 'web']);

// What kind of file it is, from its extension, for the label in its window.
const FILE_KINDS = [
  [/\.pdf$/i, 'pdf'], [/\.(docx?|odt|rtf|pages)$/i, 'word'], [/\.(xlsx?|csv|ods|numbers)$/i, 'sheet'],
  [/\.(pptx?|odp|key)$/i, 'slides'], [/\.(png|jpe?g|gif|webp|heic|bmp|svg)$/i, 'image'],
  [/\.(mp4|mov|mkv|avi|webm)$/i, 'video'], [/\.(mp3|wav|m4a|flac|ogg)$/i, 'audio'], [/\.(txt|md|log)$/i, 'text'],
];

function pinOut(p) {
  const out = { ...p, notes: p.notes || '', tags: tagsOf(p.id) };
  if (p.source === 'local') out.missing = !fs.existsSync(p.path); // moved or deleted since
  return out;
}

/**
 * Pins files or folders on this PC to the globe (from the file picker, or dropped on
 * it). `paths` are full paths; `tags` go on each. Returns the pins.
 */
function addLocalPins(paths, tags) {
  const out = [];
  for (const raw of (paths || []).slice(0, 50)) {
    const full = path.resolve(String(raw || ''));
    let stat;
    try { stat = fs.statSync(full); } catch { throw new Error(`Can't find ${path.basename(full) || full}.`); }
    const ref = crypto.createHash('sha1').update(full.toLowerCase()).digest('hex').slice(0, 16);
    const id = `local/${ref}`;
    const d = lists();
    let pin = d.pins.find((p) => p.id === id);
    const kind = stat.isDirectory() ? 'dir' : (FILE_KINDS.find(([re]) => re.test(full)) || [null, 'file'])[1];
    if (pin) Object.assign(pin, { path: full, kind });
    else {
      pin = { id, source: 'local', ref, title: path.basename(full) || full, url: '', path: full, kind, added: now() };
      d.pins.push(pin);
    }
    if (tags?.length) hub.setTags(id, [...new Set([...tagsOf(id), ...tags])]);
    out.push(pin);
  }
  store.save();
  return out.map(pinOut);
}

/**
 * Opens a pinned file or folder (or shows it in its folder). Only pinned items: the
 * window never hands the PC an arbitrary path to open.
 */
async function openLocal(id, reveal = false) {
  const pin = lists().pins.find((p) => p.id === id && p.source === 'local');
  if (!pin) throw new Error('That item is no longer on the globe.');
  if (!fs.existsSync(pin.path)) throw new Error(`${pin.title} is no longer at ${pin.path}.`);
  const { shell } = require('electron');
  if (reveal) return shell.showItemInFolder(pin.path);
  const problem = await shell.openPath(pin.path);
  if (problem) throw new Error(problem);
}

function listPins() {
  return lists().pins.map(pinOut);
}

/**
 * Pins a Notion page, Drive file or any web link to the globe (or refreshes it if
 * already pinned). A web link needs only its address; the title defaults to its site.
 */
function addPin({ source, ref, title, url, kind = '', tags, notes }) {
  if (!SOURCES.has(source)) throw new Error('Unknown source.');
  if (source === 'web') {
    url = String(url || '').trim();
    if (/^www\./i.test(url)) url = `https://${url}`;
    let parsed;
    try { parsed = new URL(url); } catch { throw new Error('That is not a web address.'); }
    if (!/^https?:$/.test(parsed.protocol)) throw new Error('Only web links (http or https) can be pinned.');
    url = parsed.href;
    ref = crypto.createHash('sha1').update(url).digest('hex').slice(0, 16);
    title = String(title || '').trim() || parsed.hostname.replace(/^www\./, '');
    kind = 'link';
  }
  if (!ref || !url) throw new Error('That item has no link.');
  if (source !== 'web' && !/^https:\/\//i.test(url)) throw new Error('Only https links can be pinned.');
  const id = `${source}/${ref}`;
  const d = lists();
  let pin = d.pins.find((p) => p.id === id);
  if (pin) Object.assign(pin, { title: String(title || pin.title), url, kind });
  else {
    pin = { id, source, ref, title: String(title || 'Untitled'), url, kind, added: now() };
    d.pins.push(pin);
  }
  if (notes) pin.notes = String(notes).replace(/\s+$/, '').slice(0, hub.MAX_NOTE);
  if (tags) hub.setTags(id, tags);
  store.save();
  return pinOut(pin);
}

function updatePin(id, patch = {}) {
  const pin = lists().pins.find((p) => p.id === id);
  if (!pin) throw new Error('That item is no longer on the globe.');
  if ('tags' in patch) hub.setTags(id, patch.tags);
  // A web link's or file's name on the globe is Onyx's own, so it can be renamed (Notion and Drive keep theirs).
  if ('title' in patch && (pin.source === 'web' || pin.source === 'local') && String(patch.title || '').trim()) {
    pin.title = String(patch.title).trim().slice(0, 300);
    store.save();
  }
  if ('notes' in patch) {
    // Your notes on the page or file, kept in Onyx (Notion and Drive are only read).
    pin.notes = String(patch.notes ?? '').replace(/\s+$/, '').slice(0, hub.MAX_NOTE);
    if (!pin.notes) delete pin.notes;
    store.save();
  }
  return pinOut(pin);
}

function removePin(id) {
  const d = lists();
  d.pins = d.pins.filter((p) => p.id !== id);
  hub.setTags(id, []);
  store.save();
}

/** Everything the globe shows besides calendar entries and tasks. */
function globeItems() {
  return { notes: listNotes(), pins: listPins() };
}

module.exports = { listNotes, createNote, updateNote, deleteNote, listPins, addPin, addLocalPins, openLocal, updatePin, removePin, globeItems };
