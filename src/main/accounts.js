// Connected accounts: signing in, keeping access tokens fresh, and making
// authorised requests for the provider modules.

const crypto = require('crypto');
const store = require('./store');
const { signIn, postForm } = require('./oauth');

const GOOGLE = {
  auth: 'https://accounts.google.com/o/oauth2/v2/auth',
  token: 'https://oauth2.googleapis.com/token',
  // Drive: names and links only, for pinning files to the globe.
  // Gmail: starred emails read for the globe, and a block sent by email (share.js).
  scope: 'openid email https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/tasks https://www.googleapis.com/auth/drive.metadata.readonly https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.send',
};
const MICROSOFT = {
  auth: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
  token: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
  scope: 'offline_access User.Read Calendars.ReadWrite Tasks.ReadWrite Mail.Read Mail.Send',
};
// What accounts connected before sending was added agreed to: their sign-in is renewed with just that (asking
// Microsoft for more than was agreed would fail, and stop their calendars) until they are connected again.
const MICROSOFT_BEFORE_SEND = 'offline_access User.Read Calendars.ReadWrite Tasks.ReadWrite Mail.Read';

const newId = (prefix) => prefix + crypto.randomBytes(4).toString('hex');

function saveAccount(provider, label, tokens, extra = {}) {
  const { accounts, secrets } = store.data;
  let acct = accounts.find((a) => a.provider === provider && a.label === label);
  if (!acct) {
    acct = { id: newId(provider[0]), provider, label, ...extra };
    accounts.push(acct);
  }
  if (tokens) {
    const old = secrets.tokens[acct.id] || {};
    secrets.tokens[acct.id] = {
      access: tokens.access_token,
      refresh: tokens.refresh_token || old.refresh,
      expires: Date.now() + (tokens.expires_in || 3600) * 1000,
      ...(extra.scope || old.scope ? { scope: extra.scope || old.scope } : {}), // what the account agreed to (Microsoft)
    };
  }
  store.save();
  return acct;
}

async function connectGoogle() {
  const clientId = store.data.google.clientId;
  const clientSecret = store.data.secrets.googleClientSecret;
  if (!clientId) throw new Error('Load your Google credentials file first.');
  const { code, redirectUri, verifier } = await signIn({
    authUrl: (redirect, challenge, state) => `${GOOGLE.auth}?` + new URLSearchParams({
      client_id: clientId, redirect_uri: redirect, response_type: 'code', scope: GOOGLE.scope,
      code_challenge: challenge, code_challenge_method: 'S256', state,
      access_type: 'offline', prompt: 'consent',
    }),
  });
  const tokens = await postForm(GOOGLE.token, {
    code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri,
    grant_type: 'authorization_code', code_verifier: verifier,
  });
  const claims = JSON.parse(Buffer.from(tokens.id_token.split('.')[1], 'base64url').toString('utf8'));
  return saveAccount('google', claims.email || 'Google', tokens);
}

async function connectMicrosoft() {
  const clientId = store.data.microsoft.clientId.trim();
  if (!clientId) throw new Error('Enter your Microsoft application (client) ID first.');
  const { code, redirectUri, verifier } = await signIn({
    host: 'localhost',
    authUrl: (redirect, challenge, state) => `${MICROSOFT.auth}?` + new URLSearchParams({
      client_id: clientId, redirect_uri: redirect, response_type: 'code', response_mode: 'query',
      scope: MICROSOFT.scope, code_challenge: challenge, code_challenge_method: 'S256', state,
      prompt: 'select_account',
    }),
  });
  const tokens = await postForm(MICROSOFT.token, {
    code, client_id: clientId, redirect_uri: redirectUri, scope: MICROSOFT.scope,
    grant_type: 'authorization_code', code_verifier: verifier,
  });
  const res = await fetch('https://graph.microsoft.com/v1.0/me', { headers: { Authorization: `Bearer ${tokens.access_token}` } });
  const me = res.ok ? await res.json() : {};
  return saveAccount('microsoft', me.mail || me.userPrincipalName || 'Outlook', tokens, { scope: MICROSOFT.scope });
}

function addFeed(name, url) {
  url = url.trim().replace(/^webcal:/i, 'https:');
  if (!/^https?:\/\//i.test(url)) throw new Error('The link must start with https:// or webcal://');
  return saveAccount('ics', name.trim() || new URL(url).hostname, null, { url });
}

function remove(id) {
  const d = store.data;
  d.accounts = d.accounts.filter((a) => a.id !== id);
  delete d.secrets.tokens[id];
  delete d.calendars[id];
  for (const key of Object.keys(d.settings.hidden)) if (key.startsWith(id + '/')) delete d.settings.hidden[key];
  store.save();
}

const refreshing = new Map();

async function accessToken(acct, force = false) {
  const tok = store.data.secrets.tokens[acct.id];
  if (!tok) throw new Error(`${acct.label}: not signed in.`);
  if (!force && tok.expires - 60000 > Date.now()) return tok.access;
  if (!tok.refresh) throw new Error(`${acct.label}: sign in again.`);
  if (!refreshing.has(acct.id)) {
    const job = (async () => {
      const fields = acct.provider === 'google'
        ? { client_id: store.data.google.clientId, client_secret: store.data.secrets.googleClientSecret }
        : { client_id: store.data.microsoft.clientId, scope: tok.scope || MICROSOFT_BEFORE_SEND };
      try {
        const fresh = await postForm(acct.provider === 'google' ? GOOGLE.token : MICROSOFT.token,
          { ...fields, grant_type: 'refresh_token', refresh_token: tok.refresh });
        saveAccount(acct.provider, acct.label, fresh);
        return fresh.access_token;
      } catch (err) {
        if (err.code === 'invalid_grant') throw new Error(`${acct.label}: the sign-in expired. Sign in again in Settings.`);
        throw err;
      } finally {
        refreshing.delete(acct.id);
      }
    })();
    refreshing.set(acct.id, job);
  }
  return refreshing.get(acct.id);
}

/** An authorised JSON request. Returns the parsed body, or null when there is none. */
async function request(acct, url, { method = 'GET', body, headers = {} } = {}) {
  for (let attempt = 0; ; attempt++) {
    const token = await accessToken(acct, attempt > 0);
    const res = await fetch(url, {
      method,
      headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}), ...headers },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.status === 401 && attempt === 0) continue;
    if (res.status === 204) return null;
    const text = await res.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch { /* not JSON */ }
    if (!res.ok) {
      const err = new Error(`${acct.label}: ${json?.error?.message || json?.error_description || `HTTP ${res.status}`}`);
      err.status = res.status;
      throw err;
    }
    return json;
  }
}

module.exports = { connectGoogle, connectMicrosoft, addFeed, remove, request, newId };
