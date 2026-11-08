// Block lists (the blocker: apps on the PC, apps on the phone and websites, on by schedule, by hand or
// during Hyperfocus; the rules are src/renderer/block-rules.js). Kept with the rest of Onyx's data and
// synced between PCs, the phone and the web app one list at a time (sync.js: blockLists), the newest copy
// of a list winning. The app makes the ids, so a list saved on the phone while the PC is off is the same
// list once it reaches the PC. This file has no Electron in it: the phone's and the web app's engine run
// it too. What the PC does about the lists (closing apps, turning sites away) is src/main/blocker.js; the
// phone's is Blocker.java, with a copy of the lists it keeps for when the PC can't be reached.
//
// store.data.blockListsAt: when any list last changed here (ms), so the phone knows whose copy is newer.

const store = require('./store');
const R = require('../renderer/block-rules');

function all() {
  if (!Array.isArray(store.data.blockLists)) store.data.blockLists = [];
  return store.data.blockLists;
}

const at = () => Math.max(Number(store.data.blockListsAt) || 0, ...all().map((l) => l.updated || 0));

/** Every list, and when they last changed: { lists, at }. */
function lists() {
  return { lists: R.cleanLists(all()), at: at() };
}

/** A list added or changed. An older copy than the one kept (it was changed elsewhere since) is let go. */
function save(list) {
  const clean = R.cleanList(list);
  if (!clean) throw new Error('That block list has no id.');
  const now = Date.now();
  // A copy from a phone or PC whose clock runs ahead is kept, but never dated after now here.
  clean.updated = Math.min(clean.updated || now, now);
  const kept = all();
  const i = kept.findIndex((l) => l.id === clean.id);
  if (i >= 0 && (kept[i].updated || 0) > clean.updated) return lists();
  if (i < 0 && kept.length >= R.MAX_LISTS) throw new Error(`Onyx keeps up to ${R.MAX_LISTS} block lists.`);
  if (i >= 0) kept[i] = clean; else kept.push(clean);
  store.data.blockListsAt = Math.max(at(), now);
  store.save();
  return lists();
}

function remove(id) {
  const kept = all();
  const i = kept.findIndex((l) => l.id === id);
  if (i >= 0) {
    kept.splice(i, 1);
    store.data.blockListsAt = Math.max(at(), Date.now());
    store.save();
  }
  return lists();
}

module.exports = { lists, save, remove };
