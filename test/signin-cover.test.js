// 1.138.0: an expired sign-in gets a card at the top of Settings (and its error a Sign in button), and
// the bridge screen covers every screen of the PC, with I'm back on any of them ending it everywhere.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

test('the expired sign-in is read from the error accounts.js gives', () => {
  assert.match(read('src/main/accounts.js'), /`\$\{acct\.label\}: the sign-in expired\. Sign in again in Settings\.`/);
  const app = read('src/renderer/app.js');
  const re = new RegExp(/const EXPIRED_RE = (\/.*\/);/.exec(app)[1].slice(1, -1));
  assert.equal(re.exec('me@gmail.com: the sign-in expired. Sign in again in Settings.')[1], 'me@gmail.com');
  assert.equal(re.exec('Network down'), null);
});

test('the card sits at the top of Settings, on the phone and the PC, with accounts first on the phone', () => {
  const app = read('src/renderer/app.js');
  assert.match(app, /signInCard\(\),\s*h\('label', \{ class: 'set-find' \}/, 'phone: above the search box');
  assert.match(app, /onclick: closeSettings \}, icon\('x'\)\), signInCard\(\), PANES\[tab\]\(\)\)/, 'PC: above every page');
  assert.match(app, /\? \[\['Sync & accounts', \['connection', 'keys'\]\], \['This phone'/);
  assert.match(app, /label: 'Sign in', run: \(\) => openSettings/);
});

test('the bridge screen covers the other screens and comes down from any of them', () => {
  const main = read('src/main/main.js');
  assert.match(main, /'window:cover': \(on, card\) =>/);
  assert.match(main, /coverOthers\(card\); \} else \{ win\.setFullScreen\(false\); uncoverOthers\(\); \}/);
  assert.match(main, /for \(const d of screen\.getAllDisplays\(\)\) \{\s*if \(d\.id === mine\) continue;/);
  assert.match(main, /title !== 'onyx:back'/);
  assert.match(main, /win\.webContents\.send\('bridge-back'\)/);
  assert.match(read('src/preload.js'), /onBridgeBack: \(fn\) => ipcRenderer\.on\('bridge-back', \(\) => fn\(\)\),/);
  assert.match(read('src/renderer/app.js'), /onyx\.onBridgeBack\?\.\(\(\) => bridgeScreen\.back\?\.\(\)\);/);
});

test('what goes on the other screens is escaped', () => {
  const main = read('src/main/main.js');
  const src = /const esc = [^\n]+\n/.exec(main)[0];
  const esc = new Function(`${src}; return esc;`)();
  assert.equal(esc('<script>"x" & \'y\''), '&lt;script&gt;&quot;x&quot; &amp; &#39;y&#39;');
});
