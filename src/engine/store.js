// The engine's store (in place of src/main/store.js on the phone and in a browser): the same data,
// kept in the app's own storage (IndexedDB) instead of a file. It holds what the PCs share through
// Google Drive (sync.js, cloud.js), sign-ins included, so it stays inside the app: Android keeps
// other apps out of it, and a browser keeps it to this site.
'use strict';
const { DEFAULTS, merge } = require('../main/store-defaults');

const DB = 'onyx-engine', STORE = 'kv', KEY = 'data';

/** Where the data is kept: IndexedDB, or memory where there is none (tests). */
let storage = (() => {
  if (typeof indexedDB === 'undefined') {
    let kept = null;
    return { get: async () => kept, set: async (v) => { kept = v; }, del: async () => { kept = null; } };
  }
  const open = () => new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  let db = null;
  const tx = async (mode, fn) => {
    db ??= await open();
    return new Promise((resolve, reject) => {
      const t = db.transaction(STORE, mode);
      const req = fn(t.objectStore(STORE));
      t.oncomplete = () => resolve(req?.result);
      t.onerror = () => reject(t.error);
    });
  };
  return {
    get: () => tx('readonly', (s) => s.get(KEY)),
    set: (v) => tx('readwrite', (s) => s.put(v, KEY)),
    del: () => tx('readwrite', (s) => s.delete(KEY)),
  };
})();

let data = structuredClone(DEFAULTS);
let timer = null;
let writing = Promise.resolve();
const writeHooks = [];

async function load() {
  let saved = null;
  try {
    const raw = await storage.get();
    saved = raw ? JSON.parse(raw) : null;
  } catch (err) {
    console.error('onyx: the kept copy could not be read, starting fresh:', err.message);
  }
  data = merge(structuredClone(DEFAULTS), saved || {});
  data.secrets = merge(structuredClone(DEFAULTS.secrets), saved?.secrets || {});
  return data;
}

function writeNow() {
  timer = null;
  for (const fn of writeHooks) {
    try { fn(); } catch (err) { console.error('onyx:', err.message); }
  }
  const text = JSON.stringify(data);
  writing = writing.then(() => storage.set(text)).catch((err) => console.error('onyx: could not keep the data:', err.message));
  return writing;
}

function save() {
  if (!timer) timer = setTimeout(writeNow, 150);
}

/** Writes now (and waits for it). */
function flush() {
  if (timer) { clearTimeout(timer); return writeNow(); }
  return writing;
}

/** Forgets everything kept here (working on its own turned off). */
async function reset() {
  clearTimeout(timer);
  timer = null;
  data = structuredClone(DEFAULTS);
  await writing;
  await storage.del();
}

module.exports = {
  load, save, flush, reset,
  onWrite: (fn) => writeHooks.push(fn),
  useStorage: (s) => { storage = s; },
  get data() { return data; },
};
