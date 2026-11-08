// The blocker, the rules half: block lists (apps on the PC, apps on the phone, websites), when each is on
// (its schedule, switched on by hand for a while or until switched off, or during Hyperfocus), and which
// site an address is on. No DOM and no Electron in here, so the same rules run in the window (app.js), on
// the PC (src/main/blocker.js), in the phone's and the web app's engine, and in the tests. The phone keeps
// its own copy of the rules in Java (Blocker.java), checked against these by test/blocker.test.js.
//
// A list, as kept (store.data.blockLists, synced like boards: the newest copy of a list wins):
//   { id, name, sites: ['youtube.com'], pcApps: [{ exe: 'discord.exe', label }], phoneApps: [{ pkg, label }],
//     schedule: [{ days: [1, 2, 3, 4, 5], start: '09:00', end: '17:00' }],   days the time starts on, 0 = Sunday
//     manual: { on, until },     switched on by hand: until when (ms), 0 = until switched off
//     skipUntil,                 switched off during its scheduled time: off until then (that time's end)
//     duringFocus,               on too while a Hyperfocus session runs
//     updated }                  when it last changed (ms), so the newest copy wins
// An end at or before the start runs past midnight; the same start and end is the whole day.
// Times are milliseconds since the epoch, read in local time.

(() => {
  const MIN = 60000;
  const MAX_LISTS = 50, MAX_ITEMS = 300, MAX_WINDOWS = 20;
  const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;
  const ID = /^[A-Za-z0-9_-]{1,64}$/;
  const PKG = /^[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z0-9_]+)+$/;
  const EXE = /^[a-z0-9 ._()+&'-]{1,80}\.exe$/;
  const SITE = /^[a-z0-9-]+(\.[a-z0-9-]+)+$/;
  // Windows itself, and Onyx: never closed, whatever a list says.
  const NEVER = new Set(['explorer.exe', 'svchost.exe', 'csrss.exe', 'winlogon.exe', 'wininit.exe', 'lsass.exe', 'services.exe', 'smss.exe',
    'dwm.exe', 'sihost.exe', 'ctfmon.exe', 'conhost.exe', 'fontdrvhost.exe', 'logonui.exe', 'runtimebroker.exe', 'searchhost.exe',
    'startmenuexperiencehost.exe', 'shellexperiencehost.exe', 'textinputhost.exe', 'taskmgr.exe', 'msmpeng.exe', 'securityhealthservice.exe',
    'system', 'registry', 'onyx calendar.exe', 'electron.exe', 'taskhostw.exe', 'dllhost.exe', 'audiodg.exe', 'spoolsv.exe', 'lockapp.exe']);
  // The phone itself, and Onyx: never covered.
  const NEVER_PKG = new Set(['com.onyxcalendar.app', 'com.android.systemui', 'com.android.settings']);

  // One tap adds what each of these is, everywhere it is: its sites, its phone app, its PC app.
  const PRESETS = [
    { name: 'YouTube', sites: ['youtube.com', 'youtu.be'], phone: [['com.google.android.youtube', 'YouTube']] },
    { name: 'Instagram', sites: ['instagram.com'], phone: [['com.instagram.android', 'Instagram']] },
    { name: 'TikTok', sites: ['tiktok.com'], phone: [['com.zhiliaoapp.musically', 'TikTok'], ['com.ss.android.ugc.trill', 'TikTok (Asia)']] },
    { name: 'Facebook', sites: ['facebook.com', 'fb.com'], phone: [['com.facebook.katana', 'Facebook'], ['com.facebook.lite', 'Facebook Lite']] },
    { name: 'X', sites: ['x.com', 'twitter.com'], phone: [['com.twitter.android', 'X']] },
    { name: 'Reddit', sites: ['reddit.com'], phone: [['com.reddit.frontpage', 'Reddit']] },
    { name: 'Snapchat', sites: ['snapchat.com'], phone: [['com.snapchat.android', 'Snapchat']] },
    { name: 'Threads', sites: ['threads.net', 'threads.com'], phone: [['com.instagram.barcelona', 'Threads']] },
    { name: 'Netflix', sites: ['netflix.com'], phone: [['com.netflix.mediaclient', 'Netflix']] },
    { name: 'Twitch', sites: ['twitch.tv'], phone: [['tv.twitch.android.app', 'Twitch']] },
    { name: 'Discord', sites: ['discord.com', 'discord.gg'], phone: [['com.discord', 'Discord']], pc: [['discord.exe', 'Discord']] },
    { name: 'Steam', sites: ['steampowered.com', 'steamcommunity.com'], phone: [['com.valvesoftware.android.steam.community', 'Steam']], pc: [['steam.exe', 'Steam']] },
    { name: 'Roblox', sites: ['roblox.com'], phone: [['com.roblox.client', 'Roblox']], pc: [['robloxplayerbeta.exe', 'Roblox']] },
    { name: 'Pinterest', sites: ['pinterest.com'], phone: [['com.pinterest', 'Pinterest']] },
    { name: 'Amazon', sites: ['amazon.com'], phone: [['com.amazon.mShop.android.shopping', 'Amazon Shopping']] },
    { name: 'News', sites: ['news.google.com', 'cnn.com', 'foxnews.com', 'nytimes.com'], phone: [['com.google.android.apps.magazines', 'Google News']] },
  ];

  const text = (v, max) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
  const int = (v) => (Number.isFinite(+v) && +v > 0 ? Math.round(+v) : 0);
  const minutesOf = (t) => { const m = HHMM.exec(String(t ?? '')); return m ? +m[1] * 60 + +m[2] : null; };
  const dayStart = (t) => { const d = new Date(t); return new Date(d.getFullYear(), d.getMonth(), d.getDate()); };
  const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
  const at = (day, min) => new Date(day.getFullYear(), day.getMonth(), day.getDate(), Math.floor(min / 60), min % 60).getTime();

  // ---------------------------------------------------------------- what a list holds

  /** A site as kept: its host, lower case, without www. ("https://www.YouTube.com/watch?v=1" → "youtube.com"), or null. */
  function cleanSite(s) {
    let x = String(s ?? '').trim().toLowerCase();
    x = x.replace(/^[a-z][a-z0-9+.-]*:\/\//, '').split(/[/?#\s]/)[0].replace(/^[^@]*@/, '').replace(/:\d*$/, '');
    x = x.replace(/^\*\./, '').replace(/^\.+/, '').replace(/^www\d?\./, '').replace(/\.+$/, '');
    return SITE.test(x) && x.length <= 253 ? x : null;
  }

  /** The host an address is on ("m.youtube.com/shorts" → "m.youtube.com"), or null for words being typed. */
  function hostOf(url) {
    let x = String(url ?? '').trim().toLowerCase();
    x = x.replace(/^[a-z][a-z0-9+.-]*:\/\//, '').split(/[/?#\s]/)[0].replace(/^[^@]*@/, '').replace(/:\d*$/, '').replace(/\.+$/, '');
    return SITE.test(x) ? x : null;
  }

  /** The blocked site a host is on: the site itself or any part of it ("m.youtube.com" is on "youtube.com"), or null. */
  function siteHit(host, sites) {
    const h = hostOf(host);
    if (!h) return null;
    for (const s of sites || []) if (h === s || h.endsWith(`.${s}`)) return s;
    return null;
  }

  /** A PC app as kept: its program's file name, lower case ("C:\\…\\Discord.exe" → "discord.exe"), or null for Windows' own. */
  function exeName(s) {
    let x = String(s ?? '').trim().replace(/^"+|"+$/g, '').split(/[\\/]/).pop().toLowerCase();
    if (!x) return null;
    if (!x.endsWith('.exe')) x += '.exe';
    return EXE.test(x) && !NEVER.has(x) ? x : null;
  }

  function cleanWindow(w) {
    if (!w || typeof w !== 'object') return null;
    const days = [...new Set((Array.isArray(w.days) ? w.days : []).map(Number).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))].sort();
    if (!days.length || minutesOf(w.start) === null || minutesOf(w.end) === null) return null;
    return { days, start: w.start, end: w.end };
  }
  const cleanSchedule = (list) => (Array.isArray(list) ? list : []).map(cleanWindow).filter(Boolean).slice(0, MAX_WINDOWS);

  /** A list as kept: only what a list has, each within bounds. Null when it has no id. */
  function cleanList(l) {
    if (!l || typeof l !== 'object' || !ID.test(String(l.id ?? ''))) return null;
    const sites = [...new Set((Array.isArray(l.sites) ? l.sites : []).map(cleanSite).filter(Boolean))].slice(0, MAX_ITEMS);
    const pcApps = [];
    for (const a of Array.isArray(l.pcApps) ? l.pcApps : []) {
      const exe = exeName(a?.exe);
      if (exe && !pcApps.some((x) => x.exe === exe) && pcApps.length < MAX_ITEMS) pcApps.push({ exe, label: text(a.label, 80) || exe.replace(/\.exe$/, '') });
    }
    const phoneApps = [];
    for (const a of Array.isArray(l.phoneApps) ? l.phoneApps : []) {
      const pkg = String(a?.pkg ?? '');
      if (PKG.test(pkg) && pkg.length <= 200 && !NEVER_PKG.has(pkg) && !phoneApps.some((x) => x.pkg === pkg) && phoneApps.length < MAX_ITEMS) {
        phoneApps.push({ pkg, label: text(a.label, 80) || pkg });
      }
    }
    const m = l.manual && typeof l.manual === 'object' ? l.manual : {};
    return {
      id: l.id, name: text(l.name, 60) || 'Block list', sites, pcApps, phoneApps, schedule: cleanSchedule(l.schedule),
      manual: { on: !!m.on, until: m.on ? int(m.until) : 0 }, skipUntil: int(l.skipUntil), duringFocus: !!l.duringFocus, updated: int(l.updated),
    };
  }

  const cleanLists = (lists) => (Array.isArray(lists) ? lists : []).map(cleanList).filter(Boolean).slice(0, MAX_LISTS);

  // ---------------------------------------------------------------- when a list is on

  /** The run of one scheduled time that starts on `day`: [start, end] (ms), or null when it doesn't run that day. */
  function runOn(w, day) {
    if (!w.days.includes(day.getDay())) return null;
    const s = minutesOf(w.start), e = minutesOf(w.end);
    // An end at or before the start runs past midnight into the next day (the same time: the whole day).
    const end = e > s ? at(day, e) : at(addDays(day, 1), e);
    return [at(day, s), end];
  }

  /** Every run of the schedule from yesterday (one may still be going past midnight) to a week ahead. */
  function runs(schedule, now) {
    const list = cleanSchedule(schedule);
    const today = dayStart(now);
    const out = [];
    for (let i = -1; i <= 7; i++) for (const w of list) { const r = runOn(w, addDays(today, i)); if (r) out.push(r); }
    return out.sort((a, b) => a[0] - b[0]);
  }

  /** The scheduled time going on at `now`: { start, end }, with any times that touch it carried on, or null. */
  function windowAt(schedule, now) {
    const all = runs(schedule, now);
    const hit = all.find(([s, e]) => s <= now && now < e);
    if (!hit) return null;
    let end = hit[1];
    for (let guard = 0; guard < 64; guard++) { // 9–12 then 12–5: on until 5
      const more = all.find(([s, e]) => s <= end && e > end);
      if (!more) break;
      end = more[1];
    }
    return { start: hit[0], end };
  }

  /** When the schedule next starts after `now` (ms), within a week; null with no schedule. */
  function nextStart(schedule, now) {
    const next = runs(schedule, now).find(([s]) => s > now);
    return next ? next[0] : null;
  }

  /**
   * Whether a list is on at `now`, and why: { on, why: 'manual' | 'schedule' | 'focus', until } — until when
   * it goes off by itself (ms), 0 when only switching it off ends it. Off: { on: false, next } — when its
   * schedule starts next (or null). `focusUntil`: the end of a Hyperfocus session running now (0: none).
   */
  function stateOf(l, now, focusUntil = 0) {
    const m = l.manual || {};
    const manual = !!m.on && (!m.until || m.until > now);
    const skipped = l.skipUntil > now;
    const win = skipped ? null : windowAt(l.schedule, now);
    const focus = !skipped && !!l.duringFocus && focusUntil > now;
    // Off: when it starts next (switched off for the rest of a scheduled time: the one after that).
    if (!manual && !win && !focus) return { on: false, next: nextStart(l.schedule, skipped ? l.skipUntil - 1 : now) };
    const until = manual && !m.until ? 0 : Math.max(manual ? m.until : 0, win ? win.end : 0, focus ? focusUntil : 0);
    return { on: true, why: manual ? 'manual' : win ? 'schedule' : 'focus', until };
  }

  /** The lists on at `now`, each with its state: [{ list, state }]. */
  function activeLists(lists, now, focusUntil = 0) {
    return cleanLists(lists).map((list) => ({ list, state: stateOf(list, now, focusUntil) })).filter((x) => x.state.on);
  }

  /**
   * A list switched on (for `minutes`, 0: until switched off) or off at `now`. Off in the middle of its
   * scheduled time (or a Hyperfocus session) keeps it off until that time is over; the next one starts it again.
   */
  function switched(l, on, now, { minutes = 0, focusUntil = 0 } = {}) {
    if (on) return { ...l, manual: { on: true, until: minutes > 0 ? now + minutes * MIN : 0 }, skipUntil: 0, updated: now };
    const win = windowAt(l.schedule, now);
    const skip = Math.max(win ? win.end : 0, l.duringFocus && focusUntil > now ? focusUntil : 0);
    return { ...l, manual: { on: false, until: 0 }, skipUntil: skip, updated: now };
  }

  // ---------------------------------------------------------------- the PC's websites (src/main/blocker.js)

  /**
   * The proxy auto-config script Windows is pointed at while sites are blocked: those sites (and every part
   * of them) go to Onyx's own little proxy on this PC, which turns them away; everything else goes as always.
   */
  function pacScript(sites, port) {
    const list = JSON.stringify([...new Set((sites || []).map(cleanSite).filter(Boolean))].sort());
    return [
      '// Onyx Calendar: the sites a block list has on now. Everything else goes straight out, as always.',
      'function FindProxyForURL(url, host) {',
      `  var blocked = ${list};`,
      '  host = String(host).toLowerCase().replace(/\\.$/, "");',
      '  for (var i = 0; i < blocked.length; i++) {',
      '    var s = blocked[i];',
      `    if (host === s || host.slice(-(s.length + 1)) === "." + s) return "PROXY 127.0.0.1:${Math.round(port)}";`,
      '  }',
      '  return "DIRECT";',
      '}',
      '',
    ].join('\n');
  }

  /** "5:00 PM", or "Mon 9:00 AM" when it isn't today. */
  function when(t, now, hour12 = true) {
    const d = new Date(t);
    const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12 });
    if (dayStart(t).getTime() === dayStart(now).getTime()) return time;
    if (dayStart(t).getTime() === addDays(dayStart(now), 1).getTime()) return `tomorrow ${time}`;
    return `${d.toLocaleDateString([], { weekday: 'short' })} ${time}`;
  }

  const api = {
    PRESETS, NEVER, NEVER_PKG, MAX_LISTS, MAX_ITEMS, MAX_WINDOWS,
    cleanSite, hostOf, siteHit, exeName, cleanList, cleanLists, cleanSchedule, minutesOf,
    windowAt, nextStart, stateOf, activeLists, switched, pacScript, when,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else globalThis.OnyxBlockRules = api;
})();
