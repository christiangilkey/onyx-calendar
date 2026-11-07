// The phone's start (boot.js, app.js init, remote.js): never a plain black screen, never held up for good by
// a PC that is out of reach or an answer that never comes, and a slow or stuck start reaches the PC so it
// can be looked at. Also the calendar's sideways swipe, which has to take a thumb's arc.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const store = require('../src/main/store');
const bugs = require('../src/main/bugs');

store.save = () => {};
const root = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');

/** boot.js in a small stand-in for the page: its own timers, storage and elements. */
function bootPage({ phone = true } = {}) {
  const timers = [];
  const kept = new Map();
  const listeners = {};
  const el = (tag) => {
    const node = {
      tag, className: '', id: '', textContent: '', hidden: false, children: [], attrs: {}, classes: new Set(), removed: false,
      setAttribute(k, v) { this.attrs[k] = v; },
      append(...kids) { this.children.push(...kids); },
      remove() { this.removed = true; },
      classList: { add: (c) => node.classes.add(c) },
      querySelector(sel) {
        const cls = sel.replace(/^\./, '');
        const walk = (n) => { for (const k of n.children) { if (String(k.className).split(' ').includes(cls)) return k; const f = walk(k); if (f) return f; } return null; };
        return walk(this);
      },
    };
    return node;
  };
  const body = el('body');
  const window = {
    Capacitor: phone ? { isNativePlatform: () => true } : undefined,
    addEventListener: (type, fn) => { (listeners[type] ||= []).push(fn); },
  };
  const ctx = {
    window, document: { body, createElement: el }, location: { search: '', reload() { window.reloaded = true; } },
    localStorage: { getItem: (k) => (kept.has(k) ? kept.get(k) : null), setItem: (k, v) => kept.set(k, String(v)) },
    setTimeout: (fn, ms) => { timers.push({ fn, ms }); return timers.length; },
    addEventListener: window.addEventListener, Date, JSON, String, Array,
  };
  ctx.window.window = ctx.window;
  vm.runInNewContext(read('src/renderer/boot.js'), ctx);
  const run = (upTo) => { for (const t of timers.filter((x) => x.ms <= upTo && !x.done)) { t.done = true; t.fn(); } };
  const box = () => body.children.find((c) => c.id === 'boot' && !c.removed);
  const starts = () => JSON.parse(kept.get('onyx.starts') || '[]');
  return { window, run, box, starts, listeners, kept };
}

test('a quick start shows nothing; a slow one says what it waits for; a late one offers the way on', () => {
  const quick = bootPage();
  quick.window.onyxStage('engine');
  quick.window.onyxStage('ready');
  quick.run(1200);
  assert.equal(quick.box(), undefined, 'nothing flashes up on a start that is over at once');
  assert.equal(quick.starts().at(-1).done, true);

  const slow = bootPage();
  slow.window.onyxStage('engine');
  slow.window.onyxStage('pc');
  slow.run(1200);
  assert.ok(slow.box(), 'past a moment, the start screen is up in place of black');
  assert.equal(slow.box().querySelector('.boot-say').textContent, 'Looking for your PC…');
  assert.equal(slow.box().querySelector('.boot-more').hidden, true, 'no choices yet');

  slow.window.onyxBootSkip = () => { slow.skipped = true; };
  slow.listeners.unhandledrejection[0]({ reason: new Error('engine.js did not answer') });
  slow.run(10000);
  const more = slow.box().querySelector('.boot-more');
  assert.equal(more.hidden, false);
  assert.match(slow.box().querySelector('.boot-say').textContent, /longer than it should/);
  assert.equal(more.querySelector('.boot-step').textContent, 'Still: Looking for your PC.');
  assert.match(more.querySelector('.boot-err').textContent, /engine\.js did not answer/, 'what went wrong is said once it is late');
  more.querySelector('boot-skip').onclick();
  assert.equal(slow.skipped, true, '"Open with what\'s saved" lets the start go on');
  more.querySelector('boot-reload').onclick();
  assert.equal(slow.window.reloaded, true);

  slow.window.onyxStage('saved');
  slow.window.onyxStage('ready');
  slow.run(20000); // its fade
  assert.equal(slow.box(), undefined, 'gone once the calendar is up');
  const [s] = slow.starts();
  assert.deepEqual(s.stages.map((x) => x[0]), ['page', 'engine', 'pc', 'saved', 'ready'], 'each step is kept, with its time');
  assert.equal(s.done, true);
  assert.deepEqual(s.errors, ['engine.js did not answer']);
});

test('with nothing saved to open, the late start screen offers Reload only; the desktop window never shows it', () => {
  const p = bootPage();
  p.window.onyxBootSkip = null;
  p.run(10000);
  assert.equal(p.box().querySelector('.boot-more').querySelector('boot-skip').hidden, true);
  assert.equal(p.box().querySelector('.boot-more').querySelector('boot-reload').hidden, false);
  const desk = bootPage({ phone: false });
  desk.run(10000);
  assert.equal(desk.box(), undefined);
});

test('a script that fails to load is noted with its name; the last few starts are kept', () => {
  const p = bootPage();
  p.listeners.error[0]({ target: { src: 'http://localhost/engine.js' } });
  p.run(10000);
  assert.match(p.box().querySelector('.boot-err').textContent, /engine\.js did not load/);
  const list = Array.from({ length: 9 }, (_, i) => ({ at: `x${i}`, stages: [['page', 0]] }));
  p.kept.set('onyx.starts', JSON.stringify(list));
  p.window.onyxStage('pc');
  assert.equal(p.starts().length, 6, 'only the last few');
  assert.equal(p.starts().at(-1).stages.at(-1)[0], 'pc');
});

test('the start never waits for good: on the engine, on the PC, or on an answer from Android that never comes', () => {
  const app = read('src/renderer/app.js');
  assert.match(app, /stage\('engine'\);\n\s+await Promise\.race\(\[onyx\.whenReady\?\.\(\), pause\(6000\), startSkipped\]\);/);
  assert.match(app, /stage\('pc'\);\n\s+try \{\n\s+S = await firstState\(\);/);
  assert.match(app, /Promise\.race\(\[asked, Promise\.race\(\[pause\(9000\), startSkipped\]\)\.then\(\(\) => LATE\)\]\)/, 'a slow PC: what was saved opens');
  assert.match(app, /onyx\.goOffline\?\.\(\)/);
  assert.match(app, /if \(!onyx\.savedState\(\)\) \{ window\.onyxBootSkip = null; return asked; \}/, 'nothing saved: it waits for the PC');
  for (const fn of ['showRelay', 'showConnect', 'showWebSetup']) assert.match(app, new RegExp(`function ${fn}\\([^)]*\\) \\{\\n\\s+pageUp\\(\\);`), `${fn} counts as the page being up`);
  assert.equal((app.match(/window\.onyxReady = true/g) || []).length, 1, 'set in one place (pageUp), with the start screen told');

  const remote = read('src/renderer/remote.js');
  assert.match(remote, /const ready = Promise\.race\(\[booting, new Promise\(\(resolve\) => setTimeout\(\(\) => resolve\(own\), 8000\)\)\]\);/);
  assert.match(remote, /await Promise\.race\(\[\n\s+http\.request\(\{/, "Android's request has the page's own time limit too");
  assert.match(remote, /savedState: \(\) => \{ const kept = conn \? fromCache\('state', \[\]\) : null;/);
  assert.match(remote, /reportStarts: async \(list\) => call\('phone:starts', list, await appVersion\(\)\)/);
});

test('boot.js runs first, in the window, on the phone and on the web', () => {
  const html = read('src/renderer/index.html');
  assert.ok(html.indexOf('<script src="boot.js">') < html.indexOf('fullcalendar'), 'before anything else');
  const { buildWww } = require('../scripts/build-mobile');
  const os = require('os');
  for (const web of [false, true]) {
    const out = fs.mkdtempSync(path.join(os.tmpdir(), 'onyx-boot-'));
    try {
      buildWww(out, { web });
      assert.ok(fs.existsSync(path.join(out, 'boot.js')));
      const built = fs.readFileSync(path.join(out, 'index.html'), 'utf8');
      assert.ok(built.indexOf('boot.js') < built.indexOf('vendor/fullcalendar.js'));
    } finally {
      fs.rmSync(out, { recursive: true, force: true });
    }
  }
});

test('a slow or unfinished phone start is kept on the PC with its steps', () => {
  store.data.bugReports = [];
  bugs.startsFromPhone([
    { at: '2026-11-07T11:38:00.000Z', done: false, ms: 0, stages: [['page', 0], ['engine', 80], ['pc', 81]], errors: ['x'.repeat(500)] },
    { at: '2026-11-07T11:40:00.000Z', done: true, ms: 14200, stages: [['page', 0], ['ready', 14200]], errors: [] },
    { nonsense: true }, null,
  ], '1.115.0-personal.1');
  assert.equal(store.data.bugReports.length, 2);
  const [stuck, slow] = store.data.bugReports;
  assert.equal(stuck.where, 'phone-start');
  assert.equal(stuck.version, '1.115.0-personal.1');
  assert.equal(stuck.message, 'A start that never finished (last step: pc)');
  const detail = JSON.parse(stuck.stack);
  assert.deepEqual(detail.steps.at(-1), ['pc', 81]);
  assert.equal(detail.errors[0].length, 200);
  assert.equal(slow.message, 'A slow start: 14.2 s');
  assert.ok(read('src/main/api.js').includes("'phone:starts': (list, appVersion) => require('./bugs').startsFromPhone(list, appVersion)"));
  assert.match(read('src/main/mcp.js'), /const READS = new Set\(\[[^\]]*'phone:starts'/, 'no window refresh for it');
  const app = read('src/renderer/app.js');
  assert.match(app, /s\.done \? s\.ms > 8000 : s !== now/, 'only slow ones, or ones that never finished (not this one)');
  assert.match(app, /if \(ok\) \{ sendBugs\(\); sendStarts\(\); \}/);
});

test("Android's watch reloads a blank or dead page, but gives a live start screen time", () => {
  const java = read('mobile/android/app/src/main/java/com/onyxcalendar/app/MainActivity.java');
  assert.match(java, /window\.onyxReady === true \? 'up' : typeof window\.onyxStage === 'function' \? 'starting' : 'blank'/);
  assert.match(java, /else if \("\\"starting\\""\.equals\(v\) && looks\+\+ < LOOKS_WHILE_STARTING\) look\(wv, LOOK_AGAIN_MS\);\n\s+else heal\(wv\);/);
  assert.match(java, /if \(!answered\[0\] && !up\) heal\(wv\);/, 'a page that cannot answer is still healed');
});

test('a swipe takes a thumb\'s arc: more sideways than up and down, before the long press, or a scroll that swept sideways', () => {
  const app = read('src/renderer/app.js');
  const swipe = app.slice(app.indexOf('function swipeToChangeDates'), app.indexOf('const pointRect'));
  const hold = Number(swipe.match(/const HOLD_MS = (\d+);/)[1]);
  const press = Number(app.match(/longPressDelay: (\d+),/)[1]);
  assert.ok(hold < press, 'a finger that rests long enough for the calendar\'s long press is the calendar\'s');
  assert.ok(hold >= 300, 'but a swipe that starts a little slowly is still a swipe');
  assert.match(swipe, /t\.mode = Math\.abs\(t\.dx\) > Math\.abs\(t\.dy\) \? 'h' : 'v';/, 'no dead zone between a swipe and a scroll');
  assert.match(swipe, /if \(Math\.abs\(dx\) > 80 && Math\.abs\(dx\) > Math\.abs\(dy\) \* 1\.5 && !busy\(\)\) turn\(dx < 0 \? 1 : -1, false\);/);
  assert.match(swipe, /const busy = \(\) => holdNew\.on \|\| midDrag\(\);/, 'a leftover copy of an entry no longer blocks every swipe');
  assert.match(swipe, /if \(e\.changedTouches\[0\]\) track\(e\.changedTouches\[0\]\);/, 'where the finger lifted');
});
