// My YouTube in the News panel: your playlists (YouTube's read-only permission, added to a Google account already
// connected), played in the panel, and YouTube itself to browse in a window of its own.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const store = require('../src/main/store');
const accounts = require('../src/main/accounts');

store.save = () => {};
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const SCOPE = 'https://www.googleapis.com/auth/youtube.readonly';

function setup(granted) {
  store.data.accounts = [{ id: 'g1', provider: 'google', label: 'me@gmail.com' }, { id: 'g2', provider: 'google', label: 'work@gmail.com' }];
  store.data.secrets = { tokens: { g1: { access: 'a', refresh: 'r', expires: Date.now() + 3600e3, granted: 'openid https://www.googleapis.com/auth/calendar' }, g2: { access: 'b', refresh: 'r', expires: Date.now() + 3600e3, granted } } };
  store.data.youtube = undefined;
  delete require.cache[require.resolve('../src/main/youtube')];
  return require('../src/main/youtube');
}

test('connected through the Google account that agreed to YouTube, and only that one', () => {
  let yt = setup('openid https://www.googleapis.com/auth/calendar');
  assert.deepEqual(yt.status(), { connected: false, account: null, google: ['me@gmail.com', 'work@gmail.com'] });
  yt = setup(`openid https://www.googleapis.com/auth/calendar ${SCOPE}`);
  assert.deepEqual(yt.status(), { connected: true, account: 'work@gmail.com', google: ['me@gmail.com', 'work@gmail.com'] });
  assert.equal(yt.disconnect().connected, false, 'Disconnect: no longer shown');
  assert.equal(store.data.secrets.tokens.g2.refresh, 'r', 'the account itself stays signed in');
  assert.rejects(yt.playlists(), /Connect your YouTube first/);
});

test('your playlists (Liked videos first) and a playlist\'s videos, private and deleted ones left out', async () => {
  const yt = setup(SCOPE);
  const asked = [];
  const real = accounts.request;
  accounts.request = async (acct, url) => {
    asked.push([acct.id, url]);
    if (url.includes('/playlists?')) return { items: [{ id: 'PLa', snippet: { title: 'Focus', thumbnails: { medium: { url: 'https://i.ytimg.com/x.jpg' } } }, contentDetails: { itemCount: 2 } }] };
    return { items: [
      { snippet: { title: 'Song one', resourceId: { videoId: 'abcdefghijk' }, videoOwnerChannelTitle: 'Artist' } },
      { snippet: { title: 'Private video', resourceId: { videoId: 'bcdefghijkl' } } },
      { snippet: { title: 'Deleted video', resourceId: { videoId: 'cdefghijklm' } } },
    ] };
  };
  try {
    const lists = await yt.playlists();
    assert.deepEqual(lists.map((p) => [p.id, p.title, p.count]), [['LL', 'Liked videos', null], ['PLa', 'Focus', 2]]);
    assert.match(asked[0][1], /youtube\/v3\/playlists\?part=snippet%2CcontentDetails&mine=true&maxResults=50/);
    assert.equal(asked[0][0], 'g2');
    const items = await yt.items('PLa');
    assert.deepEqual(items, [{ id: 'abcdefghijk', title: 'Song one', channel: 'Artist', thumb: '' }]);
    await assert.rejects(yt.items('bad id!'), /not a playlist/);
  } finally { accounts.request = real; }
});

test('connecting asks only for YouTube, keeps the calendar permissions, and never adds a new account', () => {
  const src = read('src/main/youtube.js');
  assert.match(src, /scope: `openid email \$\{SCOPE\}`,\s*include_granted_scopes: 'true'/);
  assert.match(src, /isn't one of your connected Google accounts/);
  assert.match(src, /if \(lost\.length\) throw new Error\('Google gave back a sign-in without the calendar permissions/);
  const api = read('src/main/api.js');
  for (const h of ['youtube:status', 'youtube:connect', 'youtube:disconnect', 'youtube:playlists', 'youtube:items']) assert.match(api, new RegExp(`'${h}':`));
  const remote = read('src/renderer/remote.js');
  assert.match(remote, /youtubePlaylists: \(\) => call\('youtube:playlists'\)/, 'the phone reads them through the PC');
  assert.doesNotMatch(remote, /connectYouTube/, 'connecting is done on the PC (its browser)');
});

test('YouTube itself: a window of its own, signed in there, only YouTube and Google sign-in pages in it', () => {
  const main = read('src/main/main.js');
  assert.match(main, /webPreferences: \{ partition: 'persist:youtube', contextIsolation: true, nodeIntegration: false, sandbox: true \}/);
  assert.match(main, /ipcMain\.handle\('youtube:browse', \(e, url\) => openYouTube\(url\)\);/);
  assert.match(main, /if \(YOUTUBE_HOSTS\.test\(u\)\) return;\s*e\.preventDefault\(\);\s*if \(\/\^https:\\\/\\\/\/i\.test\(u\)\) shell\.openExternal\(u\);/);
  assert.match(read('src/preload.js'), /browseYouTube: \(url\) => ipcRenderer\.invoke\('youtube:browse', url\),/);
});

test('the panel: News or My YouTube, playlists played with the list, never sent to Tamkeen', () => {
  const app = read('src/renderer/app.js');
  assert.match(read('src/renderer/index.html'), /<div id="news-views" class="news-views" role="tablist"/);
  assert.match(app, /tab\('news', 'News'\), tab\('mine', 'My YouTube'\)/);
  assert.match(app, /return `\$\{YT\}\/embed\/\$\{c\.id\}\?\$\{c\.list && okList\(c\.list\) \? `list=\$\{c\.list\}&` : ''\}\$\{q\}`;/);
  assert.match(app, /if \(tamkeen\.on && tamkeen\.installed && c\.kind === 'video' && !c\.list\) \{/);
  assert.match(app, /else onyx\.open\(url \|\| 'https:\/\/www\.youtube\.com\/'\); \/\/ the phone/);
});
