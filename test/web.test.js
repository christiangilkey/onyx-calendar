// Onyx on the web (npm run web): the phone app's files with the engine, set to run with no PC, installable,
// published with each release, and offered by the PC (Settings → Desktops) at its address.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { buildWww } = require('../scripts/build-mobile');

test('the web build runs on the engine with no PC, and can be installed', () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'onyx-web-'));
  try {
    buildWww(out, { web: true });
    const html = fs.readFileSync(path.join(out, 'index.html'), 'utf8');
    assert.match(html, /<script src="web\.js"><\/script>\s*<script src="engine\.js"><\/script>\s*<script src="remote\.js"><\/script>/);
    assert.ok(!html.includes('mock.js'), 'no demo data');
    assert.match(html, /connect-src 'self' https:/);
    assert.ok(!/connect-src[^;"]*http:/.test(html), 'https only: no plain-http PC to reach');
    assert.match(html, /<link rel="manifest" href="manifest\.webmanifest">/);
    assert.match(fs.readFileSync(path.join(out, 'web.js'), 'utf8'), /window\.ONYX_WEB = true;/);
    const manifest = JSON.parse(fs.readFileSync(path.join(out, 'manifest.webmanifest'), 'utf8'));
    assert.equal(manifest.start_url, './');
    for (const icon of manifest.icons) assert.ok(fs.existsSync(path.join(out, icon.src)), icon.src);
    assert.ok(fs.statSync(path.join(out, 'engine.js')).size > 500000);
  } finally {
    fs.rmSync(out, { recursive: true, force: true });
  }
});

test('each release publishes it, and the PC offers it at that address', () => {
  const wf = fs.readFileSync(path.join(__dirname, '../.github/workflows/android.yml'), 'utf8');
  assert.match(wf, /\n  web:\r?\n    needs: release\r?\n/);
  assert.match(wf, /run: npm run web/);
  assert.match(wf, /git push -f "https:\/\/x-access-token:\$\{GH_TOKEN\}@github\.com\/\$\{GITHUB_REPOSITORY\}\.git" gh-pages/);
  assert.match(fs.readFileSync(path.join(__dirname, '../src/renderer/app.js'), 'utf8'), /const WEB_APP = 'https:\/\/christiangilkey\.github\.io\/onyx-calendar\/';/);
});
