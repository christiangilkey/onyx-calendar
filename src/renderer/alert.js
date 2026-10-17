// The on-screen popup (alert.html): fills itself in from the details main.js passes in
// the address, rings (for the Pi's call) or chimes (when something starts), and tells the
// app which button was pressed.
(() => {
  'use strict';
  let a = {};
  try { a = JSON.parse(new URLSearchParams(location.search).get('d') || '{}'); } catch { /* an empty popup */ }
  const $ = (id) => document.getElementById(id);
  const act = (action) => { stopRing(); window.onyxAlert?.act(action); };

  const start = new Date(a.start), end = new Date(a.end);
  const time = (d) => d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: a.hour12 !== false });
  const until = (ms) => {
    const mins = Math.max(0, Math.ceil(ms / 60000));
    if (mins < 1) return 'now';
    if (mins < 60) return `in ${mins} min`;
    return `in ${Math.floor(mins / 60)} h${mins % 60 ? ` ${String(mins % 60).padStart(2, '0')} min` : ''}`;
  };

  if (/^#[0-9a-f]{3,8}$/i.test(a.color || '')) document.documentElement.style.setProperty('--c', a.color);
  document.body.classList.add(a.kind === 'call' ? 'call' : 'start');
  const ICONS = {
    call: '<svg viewBox="0 0 24 24"><path d="M6.5 3.5h3l1.5 4-2 1.5a12 12 0 0 0 6 6l1.5-2 4 1.5v3a2 2 0 0 1-2.2 2A17 17 0 0 1 4.5 5.7a2 2 0 0 1 2-2.2z"/></svg>',
    start: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/></svg>',
  };
  $('icon').innerHTML = ICONS[a.kind === 'call' ? 'call' : 'start'];
  $('kind').textContent = a.kind === 'call' ? (a.snoozed ? 'Reminder (snoozed)' : 'Reminder call') : (a.snoozed ? 'Reminder (snoozed)' : 'Starting now');
  $('title').textContent = a.title || 'Something on your calendar';
  $('title').title = a.title || '';
  document.title = `${a.kind === 'call' ? 'Coming up' : 'Starting now'}: ${a.title || ''}`;

  function drawWhen() {
    const left = start - Date.now();
    const range = Number.isNaN(+end) ? time(start) : `${time(start)} – ${time(end)}`;
    $('when').replaceChildren();
    if (left > 30000) {
      const b = document.createElement('b');
      b.textContent = until(left);
      $('when').append(b, ` · at ${range}${a.calendar ? ` · ${a.calendar}` : ''}`);
    } else {
      $('when').textContent = `${range}${a.calendar ? ` · ${a.calendar}` : ''}`;
    }
  }
  drawWhen();
  setInterval(drawWhen, 1000);

  // ---- sound: a phone-like ring for the call (a few rings), a rising chime for the start
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
  /** One "ring-ring": two quick bursts of a warm two-tone trill. */
  function ringOnce() {
    for (const burst of [0, 0.5]) {
      for (let i = 0; i < 8; i++) {
        const at = burst + i * 0.045;
        note(i % 2 ? 1046.5 : 1318.5, at, 0.06, 0.09, 'triangle');
      }
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

  $('open').addEventListener('click', () => act('open'));
  $('snooze').addEventListener('click', () => act('snooze'));
  $('ok').addEventListener('click', () => act('dismiss'));
  $('x').addEventListener('click', () => act('dismiss'));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') act('dismiss');
    if (e.key === 'Enter') act('open');
  });
  // Not dealt with: it goes by itself after a while, so a pile does not wait for you.
  setTimeout(() => act('dismiss'), 15 * 60000);
})();
