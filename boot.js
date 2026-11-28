// The first script the page runs. On the phone and the web app, a start that isn't over in a moment shows
// "Starting…" and what it waits for, in place of a black screen. One that takes too long offers to open
// with what is saved, or to reload, and says what stopped it, if something did. app.js marks each step
// (window.onyxStage) and 'ready' at the end.
//
// The last few starts are kept (localStorage 'onyx.starts'), so a slow one, or one that never finished,
// goes to the PC once it is in reach (app.js: sendStarts) and can be looked at there.
(() => {
  'use strict';
  const KEY = 'onyx.starts';
  const SHOW_MS = 1200;   // a start this quick shows nothing
  const LATE_MS = 10000;  // past this: the choices
  const t0 = Date.now();
  const trace = { at: new Date(t0).toISOString(), stages: [['page', 0]], errors: [], done: false, ms: 0 };
  const WORDS = {
    page: 'Starting…',
    engine: 'Loading what this phone keeps…',
    pc: 'Looking for your PC…',
    saved: 'Opening what was saved…',
    calendar: 'Drawing your calendar…',
  };
  const isPhone = () => !!(window.Capacitor?.isNativePlatform?.() || window.ONYX_WEB || /[?&]remote\b/.test(location.search));

  const read = () => { try { const v = JSON.parse(localStorage.getItem(KEY)); return Array.isArray(v) ? v : []; } catch { return []; } };
  const keep = () => {
    try {
      const list = read().filter((s) => s.at !== trace.at);
      list.push(trace);
      localStorage.setItem(KEY, JSON.stringify(list.slice(-6)));
    } catch { /* not kept: storage full or blocked */ }
  };
  const stage = () => trace.stages[trace.stages.length - 1][0];

  let box = null, late = false;
  function draw() {
    if (!box) return;
    box.querySelector('.boot-say').textContent = late ? 'This is taking longer than it should.' : WORDS[stage()] || WORDS.page;
    const more = box.querySelector('.boot-more');
    more.hidden = !late;
    if (!late) return;
    more.querySelector('.boot-step').textContent = `Still: ${(WORDS[stage()] || stage()).replace(/…$/, '')}.`;
    const err = more.querySelector('.boot-err');
    err.hidden = !trace.errors.length;
    err.textContent = trace.errors.length ? `What went wrong: ${trace.errors[trace.errors.length - 1]}` : '';
    more.querySelector('.boot-skip').hidden = typeof window.onyxBootSkip !== 'function';
  }
  function show() {
    if (trace.done || box || !isPhone() || !document.body) return;
    const btn = (cls, text, run) => { const b = document.createElement('button'); b.className = `btn ${cls}`; b.textContent = text; b.onclick = run; return b; };
    box = document.createElement('div');
    box.id = 'boot';
    box.setAttribute('role', 'status');
    const ring = document.createElement('div');
    ring.className = 'boot-ring';
    const say = document.createElement('p');
    say.className = 'boot-say';
    const more = document.createElement('div');
    more.className = 'boot-more';
    const step = document.createElement('p');
    step.className = 'boot-step';
    const err = document.createElement('p');
    err.className = 'boot-err';
    const row = document.createElement('div');
    row.className = 'boot-row';
    row.append(
      btn('primary boot-skip', 'Open with what’s saved', () => window.onyxBootSkip?.()),
      btn('boot-reload', 'Reload', () => location.reload()));
    more.append(step, err, row);
    box.append(ring, say, more);
    document.body.append(box);
    draw();
  }
  function hide() {
    if (!box) return;
    const b = box;
    box = null;
    b.classList.add('going');
    setTimeout(() => b.remove(), 200);
  }

  /** A step of the start (app.js); 'ready' ends it. */
  window.onyxStage = (name) => {
    if (trace.done) return;
    trace.stages.push([String(name), Date.now() - t0]);
    if (name === 'ready') {
      trace.done = true;
      trace.ms = Date.now() - t0;
      hide();
    }
    keep();
    draw();
  };

  // What stops a start: a script that failed to load or threw, a promise nobody caught. Said only once
  // the start is late (some of these are harmless), and kept with the start.
  const noteError = (text) => {
    if (trace.done || !text) return;
    trace.errors.push(String(text).slice(0, 200));
    if (trace.errors.length > 5) trace.errors.shift();
    keep();
    draw();
  };
  addEventListener('error', (e) => {
    const src = e.target && e.target !== window && (e.target.src || e.target.href);
    noteError(src ? `${String(src).split('/').pop()} did not load` : e.message);
  }, true);
  addEventListener('unhandledrejection', (e) => noteError(e.reason?.message || e.reason));

  keep();
  setTimeout(show, SHOW_MS);
  setTimeout(() => { late = true; show(); draw(); }, LATE_MS);
})();
