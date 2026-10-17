// The on-screen popup (alert.html): fills itself in from the details main.js passes in the
// address, rings (the Pi's call) or chimes, and tells the app which button was pressed.
//   kind 'start'                 a small card in the corner: Open, Snooze, Got it
//   kind 'call' | 'push' | 'leave'  the full-screen action card: Leaving now, Snooze 5m,
//                                   or a 2-minute breakdown of getting out of the door
(() => {
  'use strict';
  let a = {};
  try { a = JSON.parse(new URLSearchParams(location.search).get('d') || '{}'); } catch { /* an empty popup */ }
  const $ = (id) => document.getElementById(id);
  const act = (action) => { stopRing(); window.onyxAlert?.act(action); };
  const full = ['call', 'push', 'leave'].includes(a.kind);

  const start = new Date(a.start), end = new Date(a.end), leaveAt = a.leaveAt ? new Date(a.leaveAt) : null;
  const time = (d) => d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: a.hour12 !== false });
  const until = (ms) => {
    const mins = Math.max(0, Math.ceil(ms / 60000));
    if (mins < 1) return 'now';
    if (mins < 60) return `in ${mins} min`;
    return `in ${Math.floor(mins / 60)} h${mins % 60 ? ` ${String(mins % 60).padStart(2, '0')} min` : ''}`;
  };
  const clock = (ms) => {
    const s = Math.max(0, Math.round(ms / 1000));
    const m = Math.floor(s / 60);
    return m >= 60 ? `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m` : `${m}:${String(s % 60).padStart(2, '0')}`;
  };

  if (/^#[0-9a-f]{3,8}$/i.test(a.color || '')) document.documentElement.style.setProperty('--c', a.color);
  document.body.classList.add(full ? 'full' : 'small', a.kind || 'start');
  const ICONS = {
    call: '<svg class="i" viewBox="0 0 24 24"><path d="M6.5 3.5h3l1.5 4-2 1.5a12 12 0 0 0 6 6l1.5-2 4 1.5v3a2 2 0 0 1-2.2 2A17 17 0 0 1 4.5 5.7a2 2 0 0 1 2-2.2z"/></svg>',
    push: '<svg class="i" viewBox="0 0 24 24"><path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 1.5h-15z"/><path d="M10 20.5a2 2 0 0 0 4 0"/></svg>',
    leave: '<svg class="i" viewBox="0 0 24 24"><path d="M10 4h8v16h-8"/><path d="M4 12h9M10 9l3 3-3 3"/></svg>',
    start: '<svg class="i" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/></svg>',
  };
  $('icon').innerHTML = ICONS[a.kind] || ICONS.start;
  $('kind').textContent = a.snoozed ? 'Reminder (snoozed)'
    : { call: 'Reminder call', push: 'Heads up', leave: 'Time to get going', start: 'Starting now' }[a.kind] || 'Reminder';
  $('title').textContent = a.title || 'Something on your calendar';
  document.title = `${full ? 'Time to go' : 'Starting now'}: ${a.title || ''}`;
  $('small-row').hidden = full;
  $('actions').hidden = !full;

  function draw() {
    const now = Date.now();
    const range = Number.isNaN(+end) ? time(start) : `${time(start)} – ${time(end)}`;
    const where = a.calendar ? ` · ${a.calendar}` : '';
    $('when').replaceChildren();
    if (start - now > 30000) {
      const b = document.createElement('b');
      b.textContent = until(start - now);
      $('when').append('Starts ', b, ` · ${range}${where}`);
    } else {
      $('when').textContent = `${range}${where}`;
    }
    if (full && leaveAt) {
      $('leave').hidden = false;
      const left = leaveAt - now;
      $('leave-count').textContent = left > 0 ? clock(left) : 'Now';
      $('leave-text').textContent = left > 0 ? `until you leave, by ${time(leaveAt)}` : `you planned to leave at ${time(leaveAt)}`;
    }
  }
  draw();
  setInterval(draw, 1000);

  // ---- sound: a phone-like ring for the call (a few rings), a rising chime otherwise
  let ctx = null;
  let ringTimer = null;
  const audio = () => ctx || (ctx = new AudioContext());
  function note(f, at, len, vol, type = 'sine') {
    const c = audio(), o = c.createOscillator(), g = c.createGain(), t0 = c.currentTime + at;
    o.type = type;
    o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + len);
    o.connect(g).connect(c.destination);
    o.start(t0);
    o.stop(t0 + len + 0.02);
  }
  function ringOnce() {
    for (const burst of [0, 0.5]) {
      for (let i = 0; i < 8; i++) note(i % 2 ? 1046.5 : 1318.5, burst + i * 0.045, 0.06, 0.09, 'triangle');
      note(659.25, burst, 0.36, 0.05);
    }
  }
  function stopRing() { clearInterval(ringTimer); ringTimer = null; }
  if (a.sound !== false) {
    try {
      if (a.kind === 'call') {
        let rings = 0;
        ringOnce();
        ringTimer = setInterval(() => { if (++rings >= 7) stopRing(); else ringOnce(); }, 2600);
      } else {
        [523.25, 659.25, 783.99].forEach((f, i) => note(f, i * 0.12, 0.6, 0.16));
      }
    } catch { /* no sound: the popup still shows */ }
  }

  // ---- the 2-minute breakdown: tiny steps out of the door, with two minutes on the clock
  let stepsTimer = null;
  function breakdown() {
    stopRing();
    $('actions').hidden = true;
    $('steps-view').hidden = false;
    const list = $('steps');
    const steps = Array.isArray(a.steps) && a.steps.length ? a.steps : ['Save what you are doing', 'Stand up and take a breath', 'Phone, keys, wallet', 'Shoes and jacket on', 'Out the door'];
    list.replaceChildren(...steps.map((text) => {
      const li = document.createElement('li');
      const box = document.createElement('span');
      box.className = 'box';
      const t = document.createElement('span');
      t.className = 't';
      t.textContent = text;
      li.append(box, t);
      li.addEventListener('click', () => {
        li.classList.toggle('done');
        try { note(li.classList.contains('done') ? 1318.5 : 880, 0, 0.18, 0.1); } catch { /* quiet */ }
        if ([...list.children].every((x) => x.classList.contains('done'))) $('leaving2').focus();
      });
      return li;
    }));
    const endAt = Date.now() + 120000;
    const tick = () => {
      const left = endAt - Date.now();
      $('timer-bar').style.width = `${Math.max(0, left / 1200)}%`;
      $('timer-label').textContent = left > 0 ? clock(left) : 'Time!';
      if (left <= 0) clearInterval(stepsTimer);
    };
    tick();
    stepsTimer = setInterval(tick, 1000);
  }

  $('open').addEventListener('click', () => act('open'));
  $('snooze').addEventListener('click', () => act('snooze'));
  $('snooze2').addEventListener('click', () => act('snooze'));
  $('ok').addEventListener('click', () => act('dismiss'));
  $('x').addEventListener('click', () => act('dismiss'));
  $('leaving').addEventListener('click', () => act('leaving'));
  $('leaving2').addEventListener('click', () => act('leaving'));
  $('breakdown').addEventListener('click', breakdown);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') act('dismiss');
    if (e.key === 'Enter') act(full ? 'leaving' : 'open');
  });
  // Not dealt with: it goes by itself after a while, so a pile does not wait for you.
  setTimeout(() => act('dismiss'), (full ? 30 : 15) * 60000);
})();
