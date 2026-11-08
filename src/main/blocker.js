// The blocker on this PC: while a block list is on (block-rules.js says when), the PC apps on it are closed
// as they open, and its websites are turned away in the browsers.
//
// Apps: every few seconds Windows' task list is read; a blocked program found running is closed (taskkill),
// with a note saying why and until when. One already open when a list comes on gets half a minute first, to
// save what is in it.
//
// Websites: Windows' own "use a setup script" proxy setting (Internet Settings → AutoConfigURL, this Windows
// account's only, no administrator needed) points at a script Onyx serves on this PC, 127.0.0.1. It sends the
// blocked sites, and every part of them, to Onyx's little proxy here, which turns them away; everything else
// goes straight out as before. Chrome, Edge and Firefox (and web apps installed from them) all follow it. The
// setting is only there while a list with sites is on; it goes when the list goes off, when Onyx quits, and at
// the next start if Onyx was stopped without quitting. Someone who has a proxy of their own set is left alone:
// Settings → Blocker says sites can't be blocked on this PC then. Switched off there (Websites on this PC), Onyx
// never touches the setting.

const http = require('http');
const net = require('net');
const path = require('path');
const fs = require('fs');
const { execFile, execFileSync } = require('child_process');
const R = require('../renderer/block-rules');

const INTERNET = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings';
const PAC = '/onyx-block.pac';
const MINE = /^http:\/\/127\.0\.0\.1:\d+\/onyx-block\.pac/i;  // the setting as Onyx sets it
const TICK_MS = 2500;
const GRACE_MS = 30000;           // a blocked app open when its list comes on: this long to save first
const TELL_APP_MS = 60000;        // "Discord is blocked" at most once a minute for each
const TELL_SITE_MS = 5 * 60000;   // and for a site (pages pull in blocked sites' pictures and videos too)
const RECHECK_MS = 60000;         // someone's own proxy in the way: looked at again after this

const sh = (cmd, args) => new Promise((resolve, reject) => {
  execFile(cmd, args, { windowsHide: true, timeout: 15000, maxBuffer: 8 * 1024 * 1024 }, (err, out) => (err ? reject(err) : resolve(String(out))));
});

/** The programs running, from `tasklist /fo csv /nh`: their file names, lower case. */
function parseTasklist(csv) {
  const names = new Set();
  for (const line of String(csv).split(/\r?\n/)) {
    const m = /^"([^"]+)"/.exec(line.trim());
    if (m) names.add(m[1].toLowerCase());
  }
  return names;
}

/** One value from `reg query … /v name`: its text (REG_SZ) or number (REG_DWORD), or null. */
function parseReg(out, name) {
  const m = new RegExp(`^\\s*${name}\\s+(REG_\\w+)\\s+(.*)$`, 'im').exec(String(out));
  if (!m) return null;
  return m[1] === 'REG_DWORD' ? parseInt(m[2], 16) : m[2].trim();
}

/** "Discord is blocked" and what it is on for: "Deep work is on until 5:00 PM." */
function why(list, state, now) {
  return state.until ? `${list.name} is on until ${R.when(state.until, now)}.` : `${list.name} is on until you switch it off in Onyx.`;
}

/**
 * The blocker, with what it needs handed in (tests give it stand-ins; nothing here runs on its own):
 *   getLists()     the block lists            focusUntil()  a Hyperfocus session's end (ms), or 0
 *   settings()     { sites }: this PC's own   notify(title, body)
 *   run(cmd, args) → stdout (a promise)       runSync(cmd, args) → stdout, for quitting
 *   listen         false: no proxy server (tests)
 */
function createBlocker({ getLists, focusUntil = () => 0, settings = () => ({ sites: true }), notify = () => {}, run = sh, runSync = null, now = Date.now, listen = true, platform = process.platform }) {
  const win = platform === 'win32';
  let first = true;
  const onNow = new Map();      // list id -> its name, for the lists on at the last look
  const grace = new Map();      // exe -> until when it is left open (it was open as its list came on)
  const told = new Map();       // what was said (app or site) -> when
  const closed = [];            // the last apps closed: [{ label, at }]
  let sites = [];               // the sites turned away now
  let lists = [];               // the lists on now, with their states
  let pacUrl = null, version = 0, server = null, port = 0;
  let appliedKey = null, conflict = null, recheckAt = 0, lastError = null, busy = false, timer = null;

  const tell = (key, every, title, body) => {
    const t = now();
    if (t - (told.get(key) || 0) < every) return;
    told.set(key, t);
    notify(title, body);
  };

  // ------------------------------------------------------------ apps

  async function closeApps(exes, t) {
    const running = parseTasklist(await run('tasklist', ['/fo', 'csv', '/nh']));
    for (const [exe, hit] of exes) {
      if (!running.has(exe)) continue;
      if ((grace.get(exe) || 0) > t) continue;
      try {
        await run('taskkill', ['/F', '/T', '/IM', exe]);
      } catch { /* gone already, or Windows wouldn't let it be closed */ }
      closed.unshift({ label: hit.label, at: t });
      closed.length = Math.min(closed.length, 10);
      tell(`app:${exe}`, TELL_APP_MS, `${hit.label} is blocked`, why(hit.list, hit.state, t));
    }
  }

  // ------------------------------------------------------------ websites

  async function readProxy() {
    const value = async (name) => {
      try { return parseReg(await run('reg', ['query', INTERNET, '/v', name]), name); } catch { return null; } // not set
    };
    return { autoConfig: await value('AutoConfigURL'), proxyOn: (await value('ProxyEnable')) === 1 };
  }

  /** The setting off again, if it is Onyx's own (one left from before, or the one set now). */
  async function clearProxy() {
    pacUrl = null;
    const p = await readProxy();
    if (p.autoConfig && MINE.test(p.autoConfig)) await run('reg', ['delete', INTERNET, '/v', 'AutoConfigURL', '/f']);
  }

  function blockedTry(host) {
    const hit = lists.find(({ list }) => R.siteHit(host, list.sites));
    const site = hit && R.siteHit(host, hit.list.sites);
    if (hit) tell(`site:${site}`, TELL_SITE_MS, `${site} is blocked`, why(hit.list, hit.state, now()));
  }

  function blockedPage(host) {
    const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const hit = lists.find(({ list }) => R.siteHit(host, list.sites));
    const line = hit ? why(hit.list, hit.state, now()) : 'A block list in Onyx is on.';
    return `<!doctype html><meta charset="utf-8"><title>Blocked</title><body style="background:#0b0b0f;color:#e8e9ee;font:16px system-ui;display:grid;place-items:center;height:90vh;margin:0">`
      + `<div style="text-align:center"><h1 style="font-weight:600">${esc(host)} is blocked</h1><p style="color:#9aa0a8">${esc(line)}</p></div>`;
  }

  /** Onyx's proxy and the setup script, on this PC only. A site not blocked (a browser's old copy of the script) goes through. */
  function startServer() {
    if (server) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const s = http.createServer((req, res) => {
        if (req.url.startsWith(PAC)) {
          res.writeHead(200, { 'Content-Type': 'application/x-ns-proxy-autoconfig', 'Cache-Control': 'no-store' });
          res.end(R.pacScript(sites, port));
          return;
        }
        let host = null;
        try { host = new URL(req.url).hostname; } catch { /* not a proxy request */ }
        if (!host) { res.writeHead(404); res.end(); return; }
        if (R.siteHit(host, sites)) {
          blockedTry(host);
          res.writeHead(403, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(blockedPage(host));
          return;
        }
        const up = http.request(req.url, { method: req.method, headers: req.headers }, (r) => { res.writeHead(r.statusCode, r.headers); r.pipe(res); });
        up.on('error', () => { if (!res.headersSent) res.writeHead(502); res.end(); });
        req.pipe(up);
      });
      s.on('connect', (req, socket, head) => {
        const m = /^\[?([^\]]+?)\]?:(\d+)$/.exec(req.url || '');
        const host = m ? m[1] : '';
        const p = m ? +m[2] : 0;
        socket.on('error', () => {});
        if (!host || R.siteHit(host, sites) || (p !== 443 && p !== 80)) {
          if (host) blockedTry(host);
          socket.end('HTTP/1.1 403 Forbidden\r\nContent-Length: 0\r\nConnection: close\r\n\r\n');
          return;
        }
        const up = net.connect(p, host, () => {
          socket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
          if (head?.length) up.write(head);
          up.pipe(socket);
          socket.pipe(up);
        });
        up.on('error', () => socket.destroy());
        socket.on('close', () => up.destroy());
      });
      s.on('error', reject);
      s.listen(0, '127.0.0.1', () => { server = s; port = s.address().port; resolve(); });
    });
  }

  async function applySites(want, t) {
    const key = [...want].sort().join(' ');
    if (key === appliedKey) return;
    if (!want.length || !win) {
      sites = [];
      if (win && (pacUrl || first)) await clearProxy();
      appliedKey = key;
      conflict = null;
      return;
    }
    if (t < recheckAt) return;
    const p = await readProxy();
    if (p.proxyOn || (p.autoConfig && !MINE.test(p.autoConfig))) {
      // A proxy of their own (a VPN's, work's): left as it is.
      conflict = 'This PC has a proxy of its own set (Windows Settings → Network & internet → Proxy), so Onyx leaves it alone and can\'t block websites here. Apps are still blocked.';
      recheckAt = t + RECHECK_MS;
      sites = [];
      return;
    }
    conflict = null;
    sites = [...want];
    if (listen) await startServer();
    version += 1;
    const url = `http://127.0.0.1:${port}${PAC}?v=${version}`; // a new address each time: browsers read it again
    await run('reg', ['add', INTERNET, '/v', 'AutoConfigURL', '/t', 'REG_SZ', '/d', url, '/f']);
    pacUrl = url;
    appliedKey = key;
  }

  // ------------------------------------------------------------ the look every few seconds

  async function tick() {
    if (busy) return;
    busy = true;
    try {
      const t = now();
      lists = R.activeLists(getLists(), t, focusUntil());
      // Lists coming on and going off: said, and a blocked app already open gets its half minute.
      const exes = new Map(); // exe -> { list, state, label }
      for (const x of lists) for (const a of x.list.pcApps) if (!exes.has(a.exe)) exes.set(a.exe, { ...x, label: a.label });
      for (const { list, state } of lists) {
        if (onNow.has(list.id)) continue;
        for (const a of list.pcApps) grace.set(a.exe, t + GRACE_MS);
        if (!first) {
          const what = [list.sites.length && `${list.sites.length} ${list.sites.length === 1 ? 'site' : 'sites'}`, list.pcApps.length && `${list.pcApps.length} ${list.pcApps.length === 1 ? 'app' : 'apps'}`].filter(Boolean).join(' and ');
          tell(`on:${list.id}`, 0, `${list.name} is on`, [state.until ? `Until ${R.when(state.until, t)}.` : 'Until you switch it off in Onyx.',
            what && `Blocking ${what} on this PC.`, list.pcApps.length && 'A blocked app that is open now closes in 30 seconds: save your work.'].filter(Boolean).join(' '));
        }
      }
      for (const [id, name] of onNow) {
        if (lists.some((x) => x.list.id === id)) continue;
        onNow.delete(id);
        tell(`off:${id}`, 0, `${name} is off`, 'What it blocked is open again.');
      }
      for (const { list } of lists) onNow.set(list.id, list.name);
      if (exes.size && win) await closeApps(exes, t);
      const want = settings().sites === false ? [] : [...new Set(lists.flatMap((x) => x.list.sites))];
      await applySites(want, t);
      lastError = null;
    } catch (err) {
      lastError = err.message || String(err);
    } finally {
      first = false;
      busy = false;
    }
  }

  return {
    tick,
    start() { if (!timer) { timer = setInterval(tick, TICK_MS); timer.unref?.(); tick(); } },
    /** Quitting: the setting goes now, before Onyx's proxy does. */
    stop() {
      if (timer) { clearInterval(timer); timer = null; }
      if (pacUrl && win) {
        try {
          const out = runSync ? runSync('reg', ['query', INTERNET, '/v', 'AutoConfigURL']) : '';
          if (MINE.test(parseReg(out, 'AutoConfigURL') || '')) runSync('reg', ['delete', INTERNET, '/v', 'AutoConfigURL', '/f']);
        } catch { /* not there */ }
        pacUrl = null;
      }
      server?.close();
      server = null;
    },
    /** For Settings → Blocker on this PC. */
    status() {
      return {
        windows: win, sites: settings().sites !== false, blocking: sites, applied: !!pacUrl, conflict, error: lastError,
        on: lists.map(({ list, state }) => ({ id: list.id, until: state.until })), closed: closed.slice(0, 5),
      };
    },
    /** A setting changed in Settings: looked at again at once. */
    changed() { appliedKey = null; recheckAt = 0; return tick(); },
    get port() { return port; },
  };
}

// ------------------------------------------------------------ the one Onyx runs

let live = null;

function start({ notify } = {}) {
  const store = require('./store');
  live = createBlocker({
    getLists: () => store.data.blockLists || [],
    focusUntil: () => (store.data.focusActive?.plannedEnd > Date.now() ? store.data.focusActive.plannedEnd : 0),
    settings: () => store.data.blockerPc || { sites: true },
    notify: notify || (() => {}),
    runSync: (cmd, args) => String(execFileSync(cmd, args, { windowsHide: true, timeout: 5000, stdio: ['ignore', 'pipe', 'ignore'] })),
  });
  live.start();
  return live;
}

function stop() { live?.stop(); }

function status() { return live ? live.status() : { windows: process.platform === 'win32', sites: true, blocking: [], applied: false, conflict: null, on: [], closed: [] }; }

/** Settings → Blocker → Websites on this PC: { sites: true | false }. */
async function set(o = {}) {
  const store = require('./store');
  store.data.blockerPc = { ...(store.data.blockerPc || {}), ...(o.sites != null ? { sites: !!o.sites } : {}) };
  store.save();
  await live?.changed();
  return status();
}

/**
 * The programs to pick from (Settings → Blocker → Add a PC app): the ones open now with a window, then the
 * ones in the Start menu. [{ exe, label, running }], each program once.
 */
async function apps() {
  const { app, shell } = require('electron');
  const found = new Map();
  const add = (exe, label, running) => {
    const name = R.exeName(exe);
    if (!name || /unins|uninstall|_proxy\.exe$|setup\.exe$|update\.exe$|helper\.exe$|crashpad/i.test(name)) return;
    const had = found.get(name);
    found.set(name, { exe: name, label: (had && !had.running ? had.label : label) || label, running: running || !!had?.running });
  };
  try {
    const json = await sh('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
      'Get-Process | Where-Object { $_.MainWindowTitle } | Select-Object ProcessName, Path, Description | ConvertTo-Json -Compress']);
    const rows = JSON.parse(json || '[]');
    for (const p of Array.isArray(rows) ? rows : [rows]) add(p.Path || `${p.ProcessName}.exe`, p.Description || p.ProcessName, true);
  } catch { /* the Start menu still lists them */ }
  const roots = [
    path.join(process.env.ProgramData || 'C:\\ProgramData', 'Microsoft', 'Windows', 'Start Menu', 'Programs'),
    path.join(app.getPath('appData'), 'Microsoft', 'Windows', 'Start Menu', 'Programs'),
  ];
  const walk = (dir, depth) => {
    let entries = [];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory() && depth < 3) walk(full, depth + 1);
      else if (e.isFile() && /\.lnk$/i.test(e.name)) {
        try {
          const link = shell.readShortcutLink(full);
          if (/\.exe$/i.test(link.target || '')) add(link.target, e.name.replace(/\.lnk$/i, ''), false);
        } catch { /* a shortcut to something else */ }
      }
    }
  };
  for (const r of roots) walk(r, 0);
  return [...found.values()].sort((a, b) => (b.running - a.running) || a.label.localeCompare(b.label));
}

module.exports = { createBlocker, parseTasklist, parseReg, start, stop, status, set, apps, INTERNET, PAC, MINE };
