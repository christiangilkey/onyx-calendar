// A paired phone setting itself up to sync through Google Drive, so it keeps working with the PC off
// or out of reach (a VPN, another network), with no code to type.
//
// The phone asks over its pairing link (phone:setup), with a key of its own (ECDH, P-256). The PC asks
// you once, on its own screen. Once you allow it, the phone's next ask gets the Drive hand-off
// (cloud.js handoff) and the sync code, locked to that key, so nothing readable crosses the network.
// The pairing token alone is not enough: it crosses the wifi as it is, and the hand-off holds a Google
// sign-in. So the code still only ever leaves the PC with your OK given here.
//
// Asks are kept on this PC (not synced), for a week: an OK given while the phone is away reaches it
// the next time it is in reach.

const crypto = require('crypto');

const KEEP_MS = 7 * 86400000;
const MAX_WAITING = 3;
const AAD = Buffer.from('onyx-phone-setup');
const INFO = Buffer.from('onyx-phone-setup-v1');

let deps = null;
const use = (d) => { deps = d; };
function d() {
  if (deps) return deps;
  const store = require('./store');
  return {
    asks: () => (store.data.phoneAsks ??= {}),
    save: () => store.save(),
    cloud: require('./cloud'),
    token: () => require('./mcp').info().token,
    now: Date.now,
  };
}
let told = () => {};
/** Told when a phone asks (main.js: the window asks you). */
const onAsk = (fn) => { told = fn; };

const validId = (v) => typeof v === 'string' && /^[\w-]{8,64}$/.test(v);
function validPub(v) {
  if (typeof v !== 'string' || v.length > 120) return false;
  const b = Buffer.from(v, 'base64url');
  return b.length === 65 && b[0] === 4; // an uncompressed P-256 point, as WebCrypto exports it
}
const cleanName = (v) => String(v || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 40) || 'Your phone';

function prune() {
  const { asks, now } = d();
  const all = asks();
  let gone = false;
  for (const [id, a] of Object.entries(all)) if (now() - (a.at || 0) > KEEP_MS) { delete all[id]; gone = true; }
  return gone;
}

/** The asks waiting for your answer, newest first: [{ id, name, at }]. */
function pending() {
  if (prune()) d().save();
  return Object.values(d().asks()).filter((a) => !a.answer).sort((a, b) => b.at - a.at).map(({ id, name, at }) => ({ id, name, at }));
}

/** Your answer on the PC: allowed (true) or not (false). Only the window can give it (main.js), never the phone. */
function answer(id, yes) {
  const a = d().asks()[id];
  if (!a) throw new Error('That phone is no longer asking. It asks again the next time it reaches this PC.');
  a.answer = yes ? 'yes' : 'no';
  a.at = d().now();
  d().save();
  return pending();
}

/** The hand-off and the code, locked to the phone's key: ECDH, then HKDF (the pairing token as salt), then AES-GCM. */
function lockFor(pub, token, payload) {
  const ecdh = crypto.createECDH('prime256v1');
  ecdh.generateKeys();
  const shared = ecdh.computeSecret(Buffer.from(pub, 'base64url'));
  const key = Buffer.from(crypto.hkdfSync('sha256', shared, Buffer.from(String(token)), INFO, 32));
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', key, iv);
  c.setAAD(AAD);
  // WebCrypto reads AES-GCM as the ciphertext with its tag at the end.
  const sealed = Buffer.concat([c.update(JSON.stringify(payload), 'utf8'), c.final(), c.getAuthTag()]);
  return { pub: ecdh.getPublicKey().toString('base64url'), box: Buffer.concat([iv, sealed]).toString('base64url') };
}

/**
 * The phone's ask ({ id, pub, name }). Answers: { ready: false } (Drive sync isn't on or working on this
 * PC yet: asked again later), { waiting: true } (for your OK here), { declined: true }, or { pub, box }.
 */
async function request(req) {
  const { id, pub } = req || {};
  if (!validId(id) || !validPub(pub)) throw new Error('That setup request is incomplete. Update the Onyx app.');
  const { asks, save, cloud, token, now } = d();
  const all = asks();
  if (prune()) save();
  const i = cloud.info();
  if (!i.on || i.state !== 'ok' || !i.hasCode) return { ready: false };
  const a = all[id];
  if (a?.answer === 'no') return { declined: true };
  if (a?.answer === 'yes' && a.pub === pub) {
    return lockFor(pub, token(), { handoff: await cloud.handoff(), code: cloud.code() });
  }
  if (!a || a.pub !== pub) { // new, or a new key (the app was reinstalled): asked again
    all[id] = { id, name: cleanName(req.name), pub, at: now(), answer: null };
    // A few at most: anything holding the pairing token could otherwise fill the window with asks.
    const waiting = Object.values(all).filter((x) => !x.answer).sort((x, y) => y.at - x.at);
    for (const x of waiting.slice(MAX_WAITING)) delete all[x.id];
    save();
    told(pending());
  }
  return { waiting: true };
}

module.exports = { request, pending, answer, onAsk, lockFor, use, KEEP_MS };
