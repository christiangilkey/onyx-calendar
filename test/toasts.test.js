// The small notes along the foot of the screen (toasts): calm, short, and not again and again.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

test('a toast is a small note that a tap puts away, with a dot (not a coloured frame) for a warning', () => {
  const app = read('src/renderer/app.js');
  const fn = app.slice(app.indexOf('function toast('), app.indexOf('// ---- bugs:'));
  assert.match(fn, /onclick: \(e\) => \{ if \(!e\.target\.closest\('\.toast-action'\)\) away\(el\); \}/, 'a tap puts it away');
  assert.match(fn, /t\.classList\.add\('going'\); setTimeout\(\(\) => t\.remove\(\), 160\);/, 'and it fades out');
  const css = read('src/renderer/styles.css');
  assert.match(css, /\.toast \{\n  display: flex; align-items: flex-start; gap: 9px; max-width: min\(420px, calc\(100vw - 48px\)\);/);
  assert.match(css, /\.toast\.warn::before, \.toast\.error::before \{ content: ""/);
  assert.doesNotMatch(css, /\.toast\.error \{ border-color/, 'no red frame');
});

test('an older Onyx on the PC: a short note, said once per PC version, and the title bar says the change waits', () => {
  const remote = read('src/renderer/remote.js');
  assert.match(remote, /new Error\('Update Onyx on your PC to do this from your phone\.'\), \{ outdated: true, pc \}/);
  assert.doesNotMatch(remote, /is older than this app and can't do that yet/);
  assert.match(remote, /blockedKey = `outdated:\$\{outdated\(\)\.pc\}`;/);
  assert.match(remote, /tellOutbox\(\{ sent, failed, blocked, blockedKey, waiting \}\);/);
  const app = read('src/renderer/app.js');
  assert.match(app, /if \(key !== told\) toast\(o\.blocked, o\.blockedKey \? 'warn' : 'error'\);/, 'once, not every 15 seconds');
  assert.match(app, /localStorage\.setItem\(TOLD, key\)/, 'and not again after a restart');
  assert.match(app, /held \? `\$\{n\} \$\{n === 1 \? 'change waits' : 'changes wait'\} for a PC update`/);
  assert.match(app, /if \(err\?\.outdated\) return toast\(message, 'warn'\);/, 'a note, not an error');
  assert.match(read('src/renderer/styles.css'), /html\.sync-held\.syncing:not\(\.offline\) #titlebar::after \{ background: var\(--raise-2\);/);
});
