// Everything the app remembers, in one JSON file in the user-data folder.
// Sign-in tokens and the Google client secret are kept in `secrets`, which is
// encrypted with the Windows account (Electron safeStorage) before it is written.

const { app, safeStorage } = require('electron');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const { DEFAULTS, merge } = require('./store-defaults');

let file = '';
let data = structuredClone(DEFAULTS);
let timer = null;
const writeHooks = []; // run just before each write (sync.js notes what changed)

function load() {
  file = path.join(app.getPath('userData'), 'onyx.json');
  let saved = {};
  try {
    saved = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    if (err.code !== 'ENOENT') console.error('onyx: settings file unreadable, starting fresh:', err.message);
  }
  let secrets;
  if (saved.secretsEnc) {
    try {
      secrets = JSON.parse(safeStorage.decryptString(Buffer.from(saved.secretsEnc, 'base64')));
    } catch (err) {
      console.error('onyx: could not unlock saved sign-ins, you will need to sign in again:', err.message);
      // The next save would write over them: a copy is kept first, so the keys aren't lost for good.
      try {
        const copy = path.join(path.dirname(file), `onyx.secrets-locked-${Date.now()}.json`);
        fs.writeFileSync(copy, JSON.stringify({ secretsEnc: saved.secretsEnc, at: new Date().toISOString(), error: err.message }), 'utf8');
      } catch { /* nowhere to keep it */ }
    }
  }
  delete saved.secretsEnc;
  data = merge(structuredClone(DEFAULTS), saved);
  data.secrets = merge(structuredClone(DEFAULTS.secrets), secrets || saved.secrets || {});
  if (!data.secrets.mcpToken) {
    data.secrets.mcpToken = crypto.randomBytes(24).toString('base64url');
    save();
  }
  return data;
}

function writeNow() {
  timer = null;
  for (const fn of writeHooks) {
    try { fn(); } catch (err) { console.error('onyx:', err.message); }
  }
  const out = { ...data };
  if (safeStorage.isEncryptionAvailable()) {
    out.secretsEnc = safeStorage.encryptString(JSON.stringify(data.secrets)).toString('base64');
    delete out.secrets;
  }
  const tmp = file + '.tmp';
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(tmp, JSON.stringify(out, null, 2), 'utf8');
  fs.renameSync(tmp, file);
}

function save() {
  if (!timer) timer = setTimeout(writeNow, 150);
}

function flush() {
  if (timer) { clearTimeout(timer); writeNow(); }
}

module.exports = { load, save, flush, onWrite: (fn) => writeHooks.push(fn), get data() { return data; } };
