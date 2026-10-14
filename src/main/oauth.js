// Browser sign-in for desktop apps: open the provider's page in the user's own
// browser, and catch the answer on a one-shot local port (OAuth 2.0 with PKCE).
// Passwords are typed into Google's / Microsoft's page, never into this app.

const { shell } = require('electron');
const crypto = require('crypto');
const http = require('http');

const DONE_PAGE = (ok, text) => `<!doctype html><meta charset="utf-8"><title>Onyx Calendar</title>
<body style="margin:0;height:100vh;display:grid;place-items:center;background:#000;color:#e9e9ee;font:16px 'Segoe UI',sans-serif">
<div style="text-align:center"><div style="font-size:34px;margin-bottom:10px">${ok ? '✓' : '✕'}</div>${text}</div>`;

/**
 * Runs the sign-in. `authUrl(redirectUri, challenge, state)` builds the provider URL.
 * Resolves to { code, redirectUri, verifier }.
 */
function signIn({ authUrl, host = '127.0.0.1', timeoutMs = 5 * 60 * 1000 }) {
  const verifier = crypto.randomBytes(48).toString('base64url');
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
  const state = crypto.randomBytes(16).toString('base64url');

  return new Promise((resolve, reject) => {
    const servers = [];
    let redirectUri = '';
    const finish = (err, value) => {
      clearTimeout(timer);
      for (const s of servers) s.close();
      err ? reject(err) : resolve(value);
    };
    const timer = setTimeout(() => finish(new Error('Sign-in timed out. Try again.')), timeoutMs);

    const handler = (req, res) => {
      const url = new URL(req.url, redirectUri);
      if (!url.searchParams.has('code') && !url.searchParams.has('error')) {
        res.writeHead(404).end();
        return;
      }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      if (url.searchParams.get('state') !== state) {
        res.end(DONE_PAGE(false, 'This sign-in link did not come from Onyx Calendar.'));
        return;
      }
      const error = url.searchParams.get('error');
      if (error) {
        res.end(DONE_PAGE(false, 'Sign-in was cancelled. You can close this tab.'));
        finish(new Error(url.searchParams.get('error_description') || `Sign-in failed: ${error}`));
        return;
      }
      res.end(DONE_PAGE(true, 'Signed in. You can close this tab and go back to Onyx Calendar.'));
      finish(null, { code: url.searchParams.get('code'), redirectUri, verifier });
    };

    const first = http.createServer(handler);
    servers.push(first);
    first.on('error', (err) => finish(err));
    first.listen(0, '127.0.0.1', () => {
      const { port } = first.address();
      redirectUri = `http://${host}:${port}`;
      // "localhost" can resolve to IPv6 in the browser, so listen there too.
      if (host === 'localhost') {
        const second = http.createServer(handler);
        second.on('error', () => {});
        second.listen(port, '::1');
        servers.push(second);
      }
      shell.openExternal(authUrl(redirectUri, challenge, state)).catch((err) => finish(err));
    });
  });
}

async function postForm(url, fields) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(fields).toString(),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(body.error_description || body.error || `HTTP ${res.status}`);
    err.code = body.error;
    throw err;
  }
  return body;
}

module.exports = { signIn, postForm };
