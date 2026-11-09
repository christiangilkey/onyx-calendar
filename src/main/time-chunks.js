// Time chunks (src/renderer/time-chunks.js has what one is and the rules for its days): kept with the rest of
// Onyx's data and synced between PCs and the phone one chunk at a time (sync.js: timeChunks), the newest copy of
// a chunk winning. The app makes the ids, so a chunk made offline is the same chunk once it reaches the PC.
// A chunk's category is a tag, coloured like any other (hub.js).

const store = require('./store');
const rules = require('../renderer/time-chunks');

const MAX_CHUNKS = 300;

function list() {
  if (!Array.isArray(store.data.timeChunks)) store.data.timeChunks = [];
  return store.data.timeChunks;
}

/** Every chunk, earliest first by its first day and time. */
function chunks() {
  return [...list()].sort((a, b) => (a.date + a.start < b.date + b.start ? -1 : 1));
}

/** Saves a chunk (made or changed in the app, whose id it keeps). Returns every chunk. */
function save(chunk) {
  const all = list();
  const i = all.findIndex((c) => c.id === chunk?.id);
  if (i < 0 && all.length >= MAX_CHUNKS) throw new Error(`That's the most time chunks (${MAX_CHUNKS}). Delete one to make another.`);
  const kept = rules.clean({ ...(i >= 0 ? { created: all[i].created } : {}), ...chunk });
  // The category takes the spelling and colour of a tag that already exists ("study" is #Study).
  const hub = require('./hub');
  const [tag] = hub.cleanTags([kept.tag]);
  kept.tag = tag || kept.tag;
  hub.ensureColor(kept.tag);
  if (i >= 0) all[i] = kept; else all.push(kept);
  store.save();
  return chunks();
}

/**
 * Takes a chunk away: every day of it, or (`day`, 'YYYY-MM-DD') only that day of one that repeats. Returns every chunk.
 */
function remove(id, day) {
  const all = list();
  const i = all.findIndex((c) => c.id === id);
  if (i < 0) return chunks();
  const c = all[i];
  if (day && c.recur && /^\d{4}-\d{2}-\d{2}$/.test(String(day))) {
    all[i] = rules.clean({ ...c, skip: [...(c.skip || []), day] });
  } else {
    all.splice(i, 1);
  }
  store.save();
  return chunks();
}

/** A tag renamed (hub.js renameTag): its chunks follow. */
function renameTag(from, to) {
  let changed = false;
  for (const c of list()) if (c.tag === from) { c.tag = to; c.updated = new Date().toISOString(); changed = true; }
  if (changed) store.save();
}

module.exports = { chunks, save, remove, renameTag, MAX_CHUNKS };
