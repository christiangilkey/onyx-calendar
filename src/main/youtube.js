// Your own YouTube in the News panel: your playlists (and liked videos), read with YouTube's read-only permission.
// The permission is added to a Google account already connected for the calendar (Google's incremental sign-in:
// the new sign-in keeps what the account agreed to before), so nothing else about that account changes. Played
// in the panel's own player. Browsing all of YouTube is a window of its own (main.js: openYouTube).

const store = require('./store');
const accounts = require('./accounts');
const { signIn, postForm } = require('./oauth');

const SCOPE = 'https://www.googleapis.com/auth/youtube.readonly';
const API = 'https://www.googleapis.com/youtube/v3';
const AUTH = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN = 'https://oauth2.googleapis.com/token';
const LIST = /^[\w-]{2,64}$/; // a playlist id (PL…, LL, UU…, OLAK…)

const googleAccounts = () => (store.data.accounts || []).filter((a) => a.provider === 'google');
const hasScope = (a) => String(store.data.secrets?.tokens?.[a.id]?.granted || '').split(/\s+/).includes(SCOPE);

/** The Google account YouTube is read through: the one that has agreed to it, or none. */
function account() {
  const pick = store.data.youtube?.account;
  const list = googleAccounts().filter(hasScope);
  return list.find((a) => a.id === pick) || list[0] || null;
}

/** Whether it is connected (and through which account), and whether there is a Google account to connect. */
function status() {
  const a = store.data.youtube?.off ? null : account();
  return { connected: !!a, account: a ? a.label : null, google: googleAccounts().map((x) => x.label) };
}

/**
 * Adds YouTube's read-only permission to a Google account (signed in in the browser, as for the calendar).
 * `label`: which connected account (its email), else the first. The account keeps everything it had.
 */
async function connect(label) {
  const clientId = store.data.google?.clientId;
  const clientSecret = store.data.secrets?.googleClientSecret;
  if (!clientId) throw new Error('Connect a Google account first (Settings → Accounts): YouTube is added to it.');
  const hint = (label && googleAccounts().find((a) => a.label === label)) || googleAccounts()[0];
  const { code, redirectUri, verifier } = await signIn({
    authUrl: (redirect, challenge, state) => `${AUTH}?` + new URLSearchParams({
      client_id: clientId, redirect_uri: redirect, response_type: 'code', scope: `openid email ${SCOPE}`,
      include_granted_scopes: 'true', // the calendar, mail and Drive permissions stay with the new sign-in
      ...(hint ? { login_hint: hint.label } : {}),
      code_challenge: challenge, code_challenge_method: 'S256', state,
      access_type: 'offline', prompt: 'consent',
    }),
  });
  const tokens = await postForm(TOKEN, {
    code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri,
    grant_type: 'authorization_code', code_verifier: verifier,
  });
  if (!String(tokens.scope || '').split(/\s+/).includes(SCOPE)) throw new Error('YouTube was not allowed, so your playlists can\'t be shown. Try again and tick the YouTube box.');
  const claims = JSON.parse(Buffer.from(tokens.id_token.split('.')[1], 'base64url').toString('utf8'));
  const email = claims.email || 'Google';
  // A sign-in for an account Onyx doesn't have yet would add it as a new calendar account: not what was asked.
  const known = googleAccounts().find((a) => a.label === email);
  if (!known) throw new Error(`${email} isn't one of your connected Google accounts. Pick one that is, or connect it in Settings first.`);
  // The account's sign-in is kept as the new one only when it still covers what it had (the calendar…).
  const before = String(store.data.secrets.tokens[known.id]?.granted || '').split(/\s+/).filter(Boolean);
  const now = String(tokens.scope || '').split(/\s+/);
  const lost = before.filter((s) => !now.includes(s) && !/^(openid|email|profile)$/.test(s) && !s.endsWith('/userinfo.email'));
  if (lost.length) throw new Error('Google gave back a sign-in without the calendar permissions, so it was not kept. Try again.');
  const old = store.data.secrets.tokens[known.id] || {};
  store.data.secrets.tokens[known.id] = {
    ...old,
    access: tokens.access_token,
    refresh: tokens.refresh_token || old.refresh,
    expires: Date.now() + (tokens.expires_in || 3600) * 1000,
    granted: tokens.scope,
  };
  delete store.data.secrets.tokens[known.id].client; // made with this PC's own Google client now
  store.data.youtube = { ...(store.data.youtube || {}), account: known.id, off: false };
  store.save();
  return status();
}

/** Stops reading YouTube (the account itself stays connected; Google's permission can be taken back at myaccount.google.com). */
function disconnect() {
  store.data.youtube = { ...(store.data.youtube || {}), account: null, off: true };
  store.save();
  return status();
}

function need() {
  const a = store.data.youtube?.off ? null : account();
  if (!a) {
    const err = new Error('Connect your YouTube first.');
    err.code = 'youtube-connect';
    throw err;
  }
  return a;
}

const thumbOf = (sn) => sn?.thumbnails?.medium?.url || sn?.thumbnails?.high?.url || sn?.thumbnails?.default?.url || '';

/** Your playlists, with Liked videos first: [{ id, title, count, thumb }]. */
async function playlists() {
  const a = need();
  const out = [];
  let page = '';
  for (let i = 0; i < 4; i++) { // up to 200
    const q = new URLSearchParams({ part: 'snippet,contentDetails', mine: 'true', maxResults: '50', ...(page ? { pageToken: page } : {}) });
    const res = await accounts.request(a, `${API}/playlists?${q}`);
    for (const p of res?.items || []) out.push({ id: p.id, title: p.snippet?.title || 'Untitled playlist', count: p.contentDetails?.itemCount ?? null, thumb: thumbOf(p.snippet) });
    page = res?.nextPageToken;
    if (!page) break;
  }
  return [{ id: 'LL', title: 'Liked videos', count: null, thumb: '', liked: true }, ...out];
}

/** A playlist's videos, in order: [{ id, title, channel, thumb }] (private and deleted ones left out). */
async function items(listId) {
  const a = need();
  if (!LIST.test(String(listId || ''))) throw new Error('That is not a playlist.');
  const out = [];
  let page = '';
  for (let i = 0; i < 4; i++) {
    const q = new URLSearchParams({ part: 'snippet', playlistId: listId, maxResults: '50', ...(page ? { pageToken: page } : {}) });
    const res = await accounts.request(a, `${API}/playlistItems?${q}`);
    for (const it of res?.items || []) {
      const id = it.snippet?.resourceId?.videoId;
      const title = it.snippet?.title || '';
      if (!/^[\w-]{11}$/.test(id || '') || title === 'Private video' || title === 'Deleted video') continue;
      out.push({ id, title, channel: it.snippet?.videoOwnerChannelTitle || '', thumb: thumbOf(it.snippet) });
    }
    page = res?.nextPageToken;
    if (!page) break;
  }
  return out;
}

module.exports = { status, connect, disconnect, playlists, items, SCOPE };
