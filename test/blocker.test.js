// The blocker: block lists of websites, PC apps and phone apps, on by schedule, by hand or during Hyperfocus.
// The rules (block-rules.js), the lists kept and synced (blocklists.js), what the PC does (blocker.js, with
// Windows' commands stood in for: nothing here touches the registry or closes a real program), and the phone's
// copy of the rules (Blocker.java) held to the same lines.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const http = require('http');
const net = require('net');
const path = require('path');
const R = require('../src/renderer/block-rules');
const store = require('../src/main/store');
const lists = require('../src/main/blocklists');
const { createBlocker, parseTasklist, parseReg, MINE } = require('../src/main/blocker');

store.save = () => {};
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8').replace(/\r\n/g, '\n');
const J = 'mobile/android/app/src/main/java/com/onyxcalendar/app/';
const java = read(`${J}Blocker.java`);
const doom = read(`${J}DoomscrollService.java`);
const app = read('src/renderer/app.js');

// Local times, on a known week: Monday 9 November 2026.
const at = (day, hh, mm = 0) => new Date(2026, 10, 9 + day, hh, mm).getTime(); // day 0 = Monday
const HOUR = 3600000;
const list = (o = {}) => R.cleanList({ id: 'l1', name: 'Work hours', sites: ['youtube.com'], schedule: [], ...o });

test('a scheduled time: on inside it, off outside it, only on its days', () => {
  const l = list({ schedule: [{ days: [1, 2, 3, 4, 5], start: '09:00', end: '17:00' }] });
  assert.deepEqual(R.stateOf(l, at(0, 10)), { on: true, why: 'schedule', until: at(0, 17) });
  assert.equal(R.stateOf(l, at(0, 8, 59)).on, false);
  assert.equal(R.stateOf(l, at(0, 17)).on, false, 'the end is not part of it');
  assert.equal(R.stateOf(l, at(5, 10)).on, false, 'Saturday is not on the list');
  assert.equal(R.stateOf(l, at(5, 10)).next, at(7, 9), 'next: Monday 9:00');
});

test('a time that ends before it starts runs past midnight, the same start and end is all day', () => {
  const night = list({ schedule: [{ days: [0, 1, 2, 3, 4, 5, 6], start: '22:00', end: '07:00' }] });
  assert.deepEqual(R.windowAt(night.schedule, at(0, 23)), { start: at(0, 22), end: at(1, 7) });
  assert.deepEqual(R.windowAt(night.schedule, at(1, 3)), { start: at(0, 22), end: at(1, 7) }, 'still on after midnight');
  assert.equal(R.windowAt(night.schedule, at(1, 12)), null);
  const friday = list({ schedule: [{ days: [5], start: '23:00', end: '02:00' }] });
  assert.ok(R.windowAt(friday.schedule, at(5, 1)), 'Friday night\'s time runs into Saturday');
  assert.equal(R.windowAt(friday.schedule, at(6, 1)), null, 'Saturday night has none of its own');
  const day = list({ schedule: [{ days: [3], start: '00:00', end: '00:00' }] });
  assert.deepEqual(R.windowAt(day.schedule, at(2, 15)), { start: at(2, 0), end: at(3, 0) });
});

test('times that touch or overlap carry on: on until the last one ends', () => {
  const l = list({ schedule: [{ days: [1], start: '09:00', end: '12:00' }, { days: [1], start: '12:00', end: '17:00' }, { days: [1], start: '16:00', end: '18:30' }] });
  assert.equal(R.stateOf(l, at(0, 10)).until, at(0, 18, 30));
});

test('switched on by hand: for a while or until switched off; off in a scheduled time keeps it off until that time ends', () => {
  const l = list({ schedule: [{ days: [1], start: '09:00', end: '17:00' }] });
  const hour = R.switched(l, true, at(0, 7), { minutes: 60 });
  assert.deepEqual(R.stateOf(hour, at(0, 7, 30)), { on: true, why: 'manual', until: at(0, 8) });
  assert.equal(R.stateOf(hour, at(0, 8, 1)).on, false, 'the hour is up');
  const always = R.switched(l, true, at(0, 7));
  assert.deepEqual(R.stateOf(always, at(3, 7)), { on: true, why: 'manual', until: 0 }, 'until switched off');
  // A manual hour running into the schedule: on until the later of the two.
  assert.equal(R.stateOf(R.switched(l, true, at(0, 8, 30), { minutes: 60 }), at(0, 9, 15)).until, at(0, 17));
  const off = R.switched(l, false, at(0, 10));
  assert.equal(off.skipUntil, at(0, 17));
  assert.equal(R.stateOf(off, at(0, 11)).on, false, 'off for the rest of today\'s time');
  assert.equal(R.stateOf(off, at(1, 10)).on, false, 'Tuesday is not on its schedule anyway');
  assert.equal(R.stateOf(off, at(7, 10)).on, true, 'next Monday it comes on again');
  assert.equal(R.stateOf(off, at(0, 11)).next, at(7, 9), 'and says so');
  assert.equal(R.switched(off, true, at(0, 12)).skipUntil, 0, 'switched on again: on');
});

test('during Hyperfocus, when the list asks for it', () => {
  const l = list({ duringFocus: true });
  assert.deepEqual(R.stateOf(l, at(0, 10), at(0, 11)), { on: true, why: 'focus', until: at(0, 11) });
  assert.equal(R.stateOf(list(), at(0, 10), at(0, 11)).on, false, 'not asked for');
  assert.equal(R.stateOf(R.switched(l, false, at(0, 10), { focusUntil: at(0, 11) }), at(0, 10, 30), at(0, 11)).on, false, 'switched off for the rest of it');
});

test('sites: typed any way, kept as their host; every part of a site is on it, nothing else is', () => {
  assert.equal(R.cleanSite('https://www.YouTube.com/watch?v=1'), 'youtube.com');
  assert.equal(R.cleanSite('  m.facebook.com  '), 'm.facebook.com');
  assert.equal(R.cleanSite('*.reddit.com'), 'reddit.com');
  assert.equal(R.cleanSite('user@x.com:443/home'), 'x.com');
  for (const bad of ['youtube', 'how to focus', '', 'http://', 'a..b']) assert.equal(R.cleanSite(bad), null, bad);
  const sites = ['youtube.com', 'x.com'];
  assert.equal(R.siteHit('music.youtube.com', sites), 'youtube.com');
  assert.equal(R.siteHit('https://m.youtube.com/shorts/abc', sites), 'youtube.com');
  assert.equal(R.siteHit('notyoutube.com', sites), null, 'only the site and its parts');
  assert.equal(R.siteHit('box.com', sites), null);
  assert.equal(R.siteHit('youtube video', sites), null, 'words typed in the address bar');
  assert.equal(R.hostOf('YouTube.com.'), 'youtube.com');
});

test('PC apps are kept by their program\'s name; Windows\' own and Onyx are never closed', () => {
  assert.equal(R.exeName('C:\\Users\\me\\AppData\\Local\\Discord\\app-1.0\\Discord.exe'), 'discord.exe');
  assert.equal(R.exeName('"C:/Program Files/Steam/steam.exe"'), 'steam.exe');
  assert.equal(R.exeName('Spotify'), 'spotify.exe');
  for (const never of ['explorer.exe', 'Onyx Calendar.exe', 'taskmgr', 'svchost.exe']) assert.equal(R.exeName(never), null, never);
  const l = R.cleanList({ id: 'x', pcApps: [{ exe: 'Discord.exe' }, { exe: 'discord.exe' }, { exe: 'explorer.exe' }],
    phoneApps: [{ pkg: 'com.instagram.android', label: 'Instagram' }, { pkg: 'com.onyxcalendar.app' }, { pkg: 'not a package' }] });
  assert.deepEqual(l.pcApps, [{ exe: 'discord.exe', label: 'discord' }]);
  assert.deepEqual(l.phoneApps, [{ pkg: 'com.instagram.android', label: 'Instagram' }]);
  assert.equal(R.cleanList({ name: 'no id' }), null);
});

test('every preset is a list\'s worth: clean sites, phone apps and PC apps that are kept as they are', () => {
  for (const p of R.PRESETS) {
    const l = R.cleanList({ id: 'p', sites: p.sites, phoneApps: (p.phone || []).map(([pkg, label]) => ({ pkg, label })), pcApps: (p.pc || []).map(([exe, label]) => ({ exe, label })) });
    assert.deepEqual(l.sites, p.sites, p.name);
    assert.equal(l.phoneApps.length, (p.phone || []).length, p.name);
    assert.equal(l.pcApps.length, (p.pc || []).length, p.name);
  }
});

test('the setup script sends the blocked sites, and every part of them, to Onyx\'s proxy and the rest straight out', () => {
  const pac = R.pacScript(['youtube.com', 'https://www.reddit.com/', 'nonsense'], 51234);
  const find = new Function(`${pac}; return FindProxyForURL;`)();
  assert.equal(find('https://youtube.com/', 'youtube.com'), 'PROXY 127.0.0.1:51234');
  assert.equal(find('https://m.youtube.com/', 'M.YouTube.com'), 'PROXY 127.0.0.1:51234');
  assert.equal(find('https://old.reddit.com/', 'old.reddit.com'), 'PROXY 127.0.0.1:51234');
  assert.equal(find('https://notyoutube.com/', 'notyoutube.com'), 'DIRECT');
  assert.equal(find('https://google.com/', 'google.com'), 'DIRECT');
  assert.equal(find('https://youtube.com.', 'youtube.com.'), 'PROXY 127.0.0.1:51234');
});

test('the lists are kept and synced, the newest copy of each winning', () => {
  store.data.blockLists = [];
  store.data.blockListsAt = 0;
  const first = lists.save({ id: 'a', name: 'Work', sites: ['youtube.com'], updated: Date.now() - 5000 });
  assert.equal(first.lists.length, 1);
  assert.ok(first.at >= Date.now() - 1000, 'its time moves on');
  lists.save({ id: 'a', name: 'Older copy', updated: Date.now() - 60000 });
  assert.equal(lists.lists().lists[0].name, 'Work', 'an older copy is let go');
  const ahead = lists.save({ id: 'b', name: 'From a fast clock', updated: Date.now() + 3600000 });
  assert.ok(ahead.lists.find((l) => l.id === 'b').updated <= Date.now(), 'never dated after now');
  lists.remove('a');
  assert.deepEqual(lists.lists().lists.map((l) => l.id), ['b']);
  assert.throws(() => lists.save({ name: 'no id' }), /no id/);
  assert.match(read('src/main/sync.js'), /boards: LIST, blockLists: LIST, blockListsAt: VALUE,/, 'synced with the rest');
  assert.match(read('src/main/store-defaults.js'), /blockLists: \[\],/);
  assert.match(read('src/main/store-defaults.js'), /blockerPc: \{ sites: true \},/);
});

// ---------------------------------------------------------------- the PC (blocker.js), with Windows stood in for

function fakeWindows({ running = [], proxy = {} } = {}) {
  const calls = [];
  const reg = { AutoConfigURL: proxy.AutoConfigURL ?? null, ProxyEnable: proxy.ProxyEnable ?? 0 };
  const run = async (cmd, args) => {
    calls.push([cmd, ...args]);
    if (cmd === 'tasklist') return running.map((n) => `"${n}","1234","Console","1","10,000 K"`).join('\r\n');
    if (cmd === 'taskkill') { const i = running.findIndex((n) => n.toLowerCase() === args[args.length - 1]); if (i >= 0) running.splice(i, 1); return 'SUCCESS'; }
    if (cmd === 'reg' && args[0] === 'query') {
      const name = args[3];
      if (reg[name] == null) throw new Error('not found');
      return `\r\nHKEY_CURRENT_USER\\...\\Internet Settings\r\n    ${name}    ${name === 'ProxyEnable' ? `REG_DWORD    0x${reg[name].toString(16)}` : `REG_SZ    ${reg[name]}`}\r\n`;
    }
    if (cmd === 'reg' && args[0] === 'add') { reg[args[3]] = args[7]; return 'ok'; }
    if (cmd === 'reg' && args[0] === 'delete') { reg[args[3]] = null; return 'ok'; }
    throw new Error(`unexpected ${cmd}`);
  };
  return { calls, reg, run, running };
}

test('Windows\' answers are read right: the task list and a registry value', () => {
  assert.deepEqual([...parseTasklist('"Discord.exe","10","Console","1","1 K"\r\n"steam.exe","11","Console","1","1 K"\r\n')], ['discord.exe', 'steam.exe']);
  assert.equal(parseReg('    ProxyEnable    REG_DWORD    0x1\r\n', 'ProxyEnable'), 1);
  assert.equal(parseReg('    AutoConfigURL    REG_SZ    http://127.0.0.1:5000/onyx-block.pac?v=2\r\n', 'AutoConfigURL'), 'http://127.0.0.1:5000/onyx-block.pac?v=2');
  assert.ok(MINE.test('http://127.0.0.1:5000/onyx-block.pac?v=2'));
  assert.ok(!MINE.test('http://wpad.work.example/proxy.pac'), 'someone else\'s setup script is never taken for Onyx\'s');
});

test('on the PC: a blocked app open as its list comes on gets half a minute, then it is closed, and closed again as it opens', async () => {
  let now = at(0, 10);
  const win = fakeWindows({ running: ['Discord.exe', 'notepad.exe'] });
  const said = [];
  const l = list({ sites: [], pcApps: [{ exe: 'discord.exe', label: 'Discord' }], manual: { on: true, until: at(0, 12) } });
  const b = createBlocker({ getLists: () => [l], run: win.run, notify: (t, m) => said.push([t, m]), now: () => now, listen: false, platform: 'win32' });
  await b.tick();
  assert.ok(!win.calls.some(([c]) => c === 'taskkill'), 'not straight away');
  now += 31000;
  await b.tick();
  assert.deepEqual(win.calls.filter(([c]) => c === 'taskkill'), [['taskkill', '/F', '/T', '/IM', 'discord.exe']]);
  assert.ok(win.running.includes('notepad.exe'), 'only what is on the list');
  assert.deepEqual(said.at(-1), ['Discord is blocked', 'Work hours is on until 12:00 PM.'.replace('12:00 PM', R.when(at(0, 12), now))]);
  win.running.push('Discord.exe');
  now += 3000;
  await b.tick();
  assert.equal(win.calls.filter(([c]) => c === 'taskkill').length, 2, 'opened again: closed at once');
  now = at(0, 12, 1);
  win.running.push('Discord.exe');
  await b.tick();
  assert.equal(win.calls.filter(([c]) => c === 'taskkill').length, 2, 'the list is off: left open');
  assert.deepEqual(said.at(-1), ['Work hours is off', 'What it blocked is open again.']);
});

test('on the PC: sites go to Windows\' setup-script setting while a list is on, and only Onyx\'s own is ever taken away', async () => {
  let now = at(0, 10);
  const win = fakeWindows();
  let on = true;
  const l = () => list({ sites: ['youtube.com'], manual: { on, until: 0 } });
  const b = createBlocker({ getLists: () => [l()], run: win.run, now: () => now, listen: false, platform: 'win32' });
  await b.tick();
  assert.match(win.reg.AutoConfigURL, /^http:\/\/127\.0\.0\.1:\d+\/onyx-block\.pac\?v=1$/);
  assert.deepEqual(b.status().blocking, ['youtube.com']);
  const adds = () => win.calls.filter(([c, a]) => c === 'reg' && a === 'add').length;
  await b.tick();
  assert.equal(adds(), 1, 'set once, not on every look');
  on = false;
  now += 3000;
  await b.tick();
  assert.equal(win.reg.AutoConfigURL, null, 'taken away when the list goes off');
  // Someone's own proxy: left alone, and Settings says why.
  const theirs = fakeWindows({ proxy: { ProxyEnable: 1 } });
  const b2 = createBlocker({ getLists: () => [list({ manual: { on: true, until: 0 } })], run: theirs.run, now: () => now, listen: false, platform: 'win32' });
  await b2.tick();
  assert.ok(!theirs.calls.some(([c, a]) => c === 'reg' && (a === 'add' || a === 'delete')));
  assert.match(b2.status().conflict, /proxy of its own/);
  const script = fakeWindows({ proxy: { AutoConfigURL: 'http://wpad.work.example/proxy.pac' } });
  const b3 = createBlocker({ getLists: () => [list({ manual: { on: true, until: 0 } })], run: script.run, now: () => now, listen: false, platform: 'win32' });
  await b3.tick();
  assert.equal(script.reg.AutoConfigURL, 'http://wpad.work.example/proxy.pac', 'theirs kept');
  // Websites on this PC switched off: the setting is never touched.
  const offWin = fakeWindows();
  const b4 = createBlocker({ getLists: () => [list({ manual: { on: true, until: 0 } })], settings: () => ({ sites: false }), run: offWin.run, now: () => now, listen: false, platform: 'win32' });
  await b4.tick();
  assert.ok(!offWin.calls.some(([c, a]) => c === 'reg' && a === 'add'));
});

test('on the PC: one left from before (Onyx stopped without quitting) is taken away at the start; quitting takes it away too', async () => {
  const win = fakeWindows({ proxy: { AutoConfigURL: 'http://127.0.0.1:61000/onyx-block.pac?v=4' } });
  const b = createBlocker({ getLists: () => [], run: win.run, listen: false, platform: 'win32' });
  await b.tick();
  assert.equal(win.reg.AutoConfigURL, null);
  const win2 = fakeWindows();
  const syncCalls = [];
  const b2 = createBlocker({ getLists: () => [list({ manual: { on: true, until: 0 } })], run: win2.run, listen: false, platform: 'win32',
    runSync: (cmd, args) => { syncCalls.push([cmd, ...args]); return args[0] === 'query' ? `    AutoConfigURL    REG_SZ    ${win2.reg.AutoConfigURL}\r\n` : ''; } });
  await b2.tick();
  b2.stop();
  assert.deepEqual(syncCalls.at(-1), ['reg', 'delete', 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings', '/v', 'AutoConfigURL', '/f']);
  // Not Windows: nothing is run.
  const mac = fakeWindows();
  await createBlocker({ getLists: () => [list({ pcApps: [{ exe: 'discord.exe' }], manual: { on: true, until: 0 } })], run: mac.run, listen: false, platform: 'darwin' }).tick();
  assert.deepEqual(mac.calls, []);
});

test('on the PC: Onyx\'s proxy serves the script and turns a blocked site away, on this PC only', async () => {
  const win = fakeWindows();
  const said = [];
  const b = createBlocker({ getLists: () => [list({ sites: ['youtube.com'], manual: { on: true, until: 0 } })], run: win.run, notify: (t) => said.push(t), platform: 'win32' });
  await b.tick();
  try {
    const port = b.port;
    assert.ok(port > 0);
    assert.match(win.reg.AutoConfigURL, new RegExp(`^http://127\\.0\\.0\\.1:${port}/onyx-block\\.pac`));
    const script = await new Promise((resolve, reject) => http.get({ host: '127.0.0.1', port, path: '/onyx-block.pac?v=1' }, (res) => {
      let body = '';
      res.on('data', (c) => { body += c; });
      res.on('end', () => resolve({ type: res.headers['content-type'], body }));
    }).on('error', reject));
    assert.equal(script.type, 'application/x-ns-proxy-autoconfig');
    assert.match(script.body, /"youtube\.com"/);
    const answer = await new Promise((resolve, reject) => {
      const s = net.connect(port, '127.0.0.1', () => s.write('CONNECT www.youtube.com:443 HTTP/1.1\r\nHost: www.youtube.com:443\r\n\r\n'));
      let got = '';
      s.on('data', (c) => { got += c; });
      s.on('end', () => resolve(got));
      s.on('error', reject);
    });
    assert.match(answer, /^HTTP\/1\.1 403 Forbidden/);
    assert.deepEqual(said, ['youtube.com is blocked']);
  } finally {
    b.stop();
  }
});

// ---------------------------------------------------------------- the phone (Blocker.java, DoomscrollService)

test('the phone keeps the same rules, line for line', () => {
  for (const rule of [
    'long end = e > s ? at(day, e, zone) : at(day.plusDays(1), e, zone);',
    'for (int i = -1; i <= 7; i++) {',
    'int dow = day.getDayOfWeek().getValue() % 7; // Sunday 0, as JavaScript counts',
    'for (long[] r : all) if (r[0] <= end && r[1] > end) { more = r; break; }',
    'boolean manual = m != null && m.optBoolean("on", false) && (mu == 0 || mu > now);',
    'boolean skipped = l.optLong("skipUntil", 0) > now;',
    'boolean focus = !skipped && l.optBoolean("duringFocus", false) && focusUntil > now;',
    'if (manual && mu == 0) return 0;',
    'if (!s.isEmpty() && (h.equals(s) || h.endsWith("." + s))) return s;',
  ]) assert.ok(java.includes(rule), rule);
  const rules = read('src/renderer/block-rules.js');
  for (const rule of [
    'const end = e > s ? at(day, e) : at(addDays(day, 1), e);',
    'for (let i = -1; i <= 7; i++)',
    'const more = all.find(([s, e]) => s <= end && e > end);',
    'const manual = !!m.on && (!m.until || m.until > now);',
    'const skipped = l.skipUntil > now;',
    'const focus = !skipped && !!l.duringFocus && focusUntil > now;',
    'const until = manual && !m.until ? 0 :',
    'for (const s of sites || []) if (h === s || h.endsWith(`.${s}`)) return s;',
  ]) assert.ok(rules.includes(rule), rule);
  // The same never-covered apps.
  for (const pkg of R.NEVER_PKG) assert.ok(java.includes(`"${pkg}"`), pkg);
});

test('the phone covers what a list on now blocks, before a daily limit, with the PC off too', () => {
  assert.match(doom, /boolean blocking = screenOn && Blocker\.any\(this, now\);/);
  assert.match(doom, /Blocker\.Hit hit = blocking \? Blocker\.hit\(this, frontPkg, BROWSERS\.containsKey\(frontPkg\) \? frontHost : null, now\) : null;/);
  assert.match(doom, /if \(now >= blockQuietUntil\) showListBlock\(hit\);/);
  assert.match(doom, /cover\("list\|" \+ hit\.list \+ "\|" \+ hit\.label, hit\.label, hit\.label \+ " is blocked", hit\.list \+ " is on " \+ until \+ "\.", hit\.site != null\);/);
  assert.match(doom, /if \(!limits\(this\)\.isEmpty\(\) \|\| Blocker\.any\(this, System\.currentTimeMillis\(\)\)\) handler\.post\(this::tick\);/, 'a blocked app is covered as it opens');
  assert.ok(doom.indexOf('showListBlock(hit)') < doom.indexOf('if (name != null && leftToday(name, now) == 0)'), 'before the daily limits');
  assert.match(doom, /blocking && BROWSERS\.containsKey\(frontPkg\) \? 1_500 : TICK/, 'a new page in a browser is seen soon');
  // The lists reach the phone from the PC (when newer) and from the app at once.
  assert.match(read(`${J}LauncherData.java`), /Object b = WidgetData\.rpc\(ctx, "blockLists", new JSONArray\(\)\);/);
  assert.match(read(`${J}LauncherData.java`), /Blocker\.put\(ctx, \(\(JSONObject\) b\)\.optJSONArray\("lists"\), \(\(JSONObject\) b\)\.optLong\("at", 0\), false\);/);
  assert.match(read(`${J}OnyxWidgetPlugin.java`), /public void blocker\(PluginCall call\)/);
  assert.match(java, /if \(lists == null \|\| \(!mine && at < at\(ctx\)\)\) return false;/, 'an older copy from the PC is let go');
  const remote = read('src/renderer/remote.js');
  assert.match(remote, /'blockList:save', 'blockList:delete',/, 'changed with the PC off: sent when it is back');
  assert.match(remote, /const CACHED = new Set\(\[[^\]]*'blockLists'\]\);/);
  assert.match(remote, /await Widget\.blocker\(\{ lists: change\(Array\.isArray\(mine\?\.lists\) \? mine\.lists : \[\]\), at: Date\.now\(\), force: true \}\);/);
  assert.match(read('mobile/android/app/src/main/res/values/strings.xml'), /It is also the blocker: while one of your block lists is on, it covers the apps and sites on it\./);
});

test('every device has Settings → Blocker, and the PC starts and stops its blocker', () => {
  const api = read('src/main/api.js');
  for (const name of ["blockLists: () => require('./blocklists').lists(),", "'blockList:save': (list) => require('./blocklists').save(list),", "'blockList:delete': (id) => require('./blocklists').remove(id),"]) assert.ok(api.includes(name), name);
  const main = read('src/main/main.js');
  assert.match(main, /require\('\.\/blocker'\)\.start\(\{/);
  assert.match(main, /app\.on\('before-quit', \(\) => \{ quitting = true; require\('\.\/blocker'\)\.stop\(\); store\.flush\(\); \}\);/);
  assert.match(main, /'blocker:apps': \(\) => require\('\.\/blocker'\)\.apps\(\),/);
  assert.match(read('src/preload.js'), /blocker: \{\n\s+lists: \(\) => call\('blockLists'\),/);
  const html = read('src/renderer/index.html');
  assert.ok(html.indexOf('<script src="block-rules.js">') > 0 && html.indexOf('<script src="block-rules.js">') < html.indexOf('<script src="app.js">'), 'the rules load before the window');
  assert.match(read('scripts/build-mobile.js'), /'focus-plan\.js', 'block-rules\.js', 'remote\.js'/, 'and in the phone and web app');
  assert.match(app, /\['Focus', \['blocker'\]\]/);
  assert.match(app, /blocker: \{ name: 'Blocker', icon: 'ban'/);
  assert.match(app, /const HOW = \[\[0, 'Until I switch it off'\], \[30, '30 min'\], \[60, '1 hour'\], \[120, '2 hours'\], \[240, '4 hours'\]\];/);
  assert.match(app, /save\(B\.switched\(l, true, Date\.now\(\), \{ minutes: m \}\)\);/);
  assert.match(app, /toggle\(st\.on, \(v\) => \{ if \(v\) \{ ui\.asking = l\.id; draw\(\); \} else switchOff\(l\); \}\)/, 'switching off is always allowed');
  // The engine (phone, web) runs the lists' file: nothing in it needs a PC.
  assert.doesNotMatch(read('src/main/blocklists.js'), /require\('(electron|child_process|http|fs)'\)/);
});
