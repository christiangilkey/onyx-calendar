// Things that live on the globe without being calendar entries: notes written in
// Onyx, and Notion pages and Google Drive files pinned to it. Like everything
// else, they are grouped into clusters by their (Onyx-only) tags.
//
// ids:  note/<id>   notion/<page id>   drive/<file id>

const crypto = require('crypto');
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

const SOURCES = new Set(['notion', 'drive']);

function pinOut(p) {
  return { ...p, notes: p.notes || '', tags: tagsOf(p.id) };
}

function listPins() {
  return lists().pins.map(pinOut);
}

/** Pins a Notion page or Drive file to the globe (or refreshes it if already pinned). */
function addPin({ source, ref, title, url, kind = '', tags }) {
  if (!SOURCES.has(source)) throw new Error('Unknown source.');
  if (!ref || !url) throw new Error('That item has no link.');
  if (!/^https:\/\//i.test(url)) throw new Error('Only https links can be pinned.');
  const id = `${source}/${ref}`;
  const d = lists();
  let pin = d.pins.find((p) => p.id === id);
  if (pin) Object.assign(pin, { title: String(title || pin.title), url, kind });
  else {
    pin = { id, source, ref, title: String(title || 'Untitled'), url, kind, added: now() };
    d.pins.push(pin);
  }
  if (tags) hub.setTags(id, tags);
  store.save();
  return pinOut(pin);
}

function updatePin(id, patch = {}) {
  const pin = lists().pins.find((p) => p.id === id);
  if (!pin) throw new Error('That item is no longer on the globe.');
  if ('tags' in patch) hub.setTags(id, patch.tags);
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

module.exports = { listNotes, createNote, updateNote, deleteNote, listPins, addPin, updatePin, removePin, globeItems };
