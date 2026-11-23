// Eye breaks (1.139.0): a small card in the corner when it is time to rest your eyes.
//
// What it goes by:
// - The 20-20-20 rule (American Optometric Association, American Academy of Ophthalmology): every
//   20 minutes of screen time, look at something 20 feet (6 m) away for 20 seconds. In a trial of
//   reminder software (Talens-Estarelles et al., Contact Lens & Anterior Eye, 2023) people took more
//   breaks and their eye strain and dry eye symptoms went down while the reminders ran. The gains
//   were gone a week after the reminders stopped, so the timer keeps running.
// - Longer breaks: NIOSH field studies of screen work (Galinsky et al., 2000 and 2007) added short
//   5-minute breaks each hour, and eye strain and discomfort went down with no loss of work done.
// - Screens cut how often you blink, so the card also says to blink slowly.
//
// Only time at the screen counts. Being away (no mouse or keyboard for 20 seconds, the PC locked or
// asleep) counts as the look-away, and 5 minutes away counts as the longer break.

const DEFAULTS = { on: true, every: 20, long: 60 };
const LOOK_SECONDS = 20;     // how long the look-away lasts
const AWAY_LOOK = 20;        // seconds away from the keyboard that count as a look-away
const AWAY_BREAK = 5 * 60;   // seconds away that count as the longer break
const SNOOZE_MIN = 5, LATER_MIN = 10;

const settingsOf = (s) => {
  const e = { ...DEFAULTS, ...(s && s.eyeBreaks) };
  const every = Math.min(120, Math.max(5, Number(e.every) || DEFAULTS.every));
  const long = Number(e.long) > 0 ? Math.min(240, Math.max(every, Number(e.long))) : 0;
  return { on: e.on !== false, every, long };
};

/**
 * The timer itself, with no Electron in it: tick(now, idleSeconds) says what to show, if anything.
 * screenMs counts time at the screen since the last look-away, breakMs since the last longer break.
 */
function createTimer(getSettings) {
  const t = { screenMs: 0, breakMs: 0, last: 0, showing: null };
  t.tick = (now, idle) => {
    const s = settingsOf(getSettings());
    const gap = t.last ? now - t.last : 0;
    t.last = now;
    if (!s.on) { t.screenMs = 0; t.breakMs = 0; return null; }
    // A long gap between ticks is the PC asleep: that is time away too.
    const away = Math.max(idle || 0, gap > 60e3 ? gap / 1000 : 0);
    if (away >= AWAY_BREAK) { t.screenMs = 0; t.breakMs = 0; return t.showing ? 'close' : null; }
    if (away >= AWAY_LOOK) { t.screenMs = 0; return t.showing === 'look' ? 'close' : null; }
    if (t.showing) return null; // a card is up: it is not screen time it is counting
    const step = Math.min(gap, 60e3);
    t.screenMs += step;
    t.breakMs += step;
    if (s.long && t.breakMs >= s.long * 60e3) return 'break';
    if (t.screenMs >= s.every * 60e3) return 'look';
    return null;
  };
  // What a button on the card did.
  t.answer = (kind, action) => {
    const s = settingsOf(getSettings());
    t.showing = null;
    if (action === 'snooze') {
      if (kind === 'break') t.breakMs = Math.max(0, s.long * 60e3 - LATER_MIN * 60e3);
      else t.screenMs = Math.max(0, s.every * 60e3 - SNOOZE_MIN * 60e3);
      return;
    }
    // Done or skipped: the count starts again (a skipped one is not asked twice).
    t.screenMs = 0;
    if (kind === 'break') t.breakMs = 0;
  };
  return t;
}

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** The card's page: a countdown, what to do, and its buttons (they report back through the title). */
function cardPage(kind) {
  const look = kind === 'look';
  const head = look ? 'Rest your eyes' : 'Screen break';
  const text = look
    ? 'Look at something at least 20 feet (6 m) away, out of a window if you can. Let your eyes relax and blink slowly a few times.'
    : 'You have been at the screen for a while. Stand up and look away from screens for 5 minutes: walk, stretch, get some water.';
  const secs = look ? LOOK_SECONDS : AWAY_BREAK;
  const buttons = look
    ? `<button class="q" data-a="snooze">In ${SNOOZE_MIN} min</button><button class="q" data-a="skip">Skip</button>`
    : `<button class="p" data-a="start">Start the break</button><button class="q" data-a="snooze">In ${LATER_MIN} min</button><button class="q" data-a="skip">Skip</button>`;
  return `<!doctype html><html><head><meta charset="utf-8"><title>Onyx</title><style>
html,body{margin:0;height:100%;background:#0b0b0e;color:#f2f2f5;font-family:"Segoe UI",system-ui,sans-serif;user-select:none;overflow:hidden}
body{box-sizing:border-box;border:1px solid #26262e;border-radius:12px;padding:16px 18px;display:flex;gap:16px;align-items:center}
.r{flex:none;position:relative;width:64px;height:64px}
.r svg{transform:rotate(-90deg)}
.n{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:17px;font-variant-numeric:tabular-nums}
.k{font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:#8b7cff;font-weight:700;margin-bottom:4px}
.m{font-size:14px;line-height:1.4;color:#d8d8de}
.b{margin-top:10px;display:flex;gap:8px;flex-wrap:wrap}
button{font:inherit;font-size:13px;font-weight:600;padding:6px 12px;border-radius:8px;border:0;cursor:pointer}
.p{background:#8b7cff;color:#0b0b10}.q{background:#1c1c24;color:#d8d8de}
</style></head><body>
<div class="r"><svg width="64" height="64"><circle cx="32" cy="32" r="28" fill="none" stroke="#1c1c24" stroke-width="5"/>
<circle id="arc" cx="32" cy="32" r="28" fill="none" stroke="#8b7cff" stroke-width="5" stroke-linecap="round" stroke-dasharray="175.9" stroke-dashoffset="0"/></svg>
<div class="n" id="n"></div></div>
<div><div class="k">${esc(head)}</div><div class="m" id="m">${esc(text)}</div><div class="b" id="b">${buttons}</div></div>
<script>
const total=${secs}, look=${look};let left=total, timer=null;
const n=document.getElementById('n'), arc=document.getElementById('arc');
const fmt=(s)=>s>=60?Math.floor(s/60)+':'+String(s%60).padStart(2,'0'):String(s);
const draw=()=>{n.textContent=fmt(left);arc.style.strokeDashoffset=String(175.9*(1-left/total));};
const run=()=>{if(timer)return;timer=setInterval(()=>{left--;draw();if(left<=0){clearInterval(timer);
document.getElementById('m').textContent=look?'Nice. Back to it.':'Break done. Welcome back.';document.getElementById('b').innerHTML='';
setTimeout(()=>{document.title='eyes:done';},look?1500:4000);}},1000);};
document.getElementById('b').addEventListener('click',(e)=>{const a=e.target.dataset&&e.target.dataset.a;if(!a)return;
if(a==='start'){e.target.remove();run();return;}document.title='eyes:'+a;});
draw();if(look)run();
</script></body></html>`;
}

const CARD_W = 400, CARD_H = 150;
let timer = null, card = null, loop = null;

/** Starts the timer in the background (main.js); it reads the settings on every tick. */
function start(store) {
  const { BrowserWindow, powerMonitor, screen } = require('electron');
  timer = createTimer(() => store.data.settings);
  let locked = false;
  powerMonitor.on('lock-screen', () => { locked = true; });
  powerMonitor.on('unlock-screen', () => { locked = false; });
  const close = () => { if (card && !card.isDestroyed()) card.destroy(); card = null; };
  const show = (kind) => {
    close();
    timer.showing = kind;
    const area = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea;
    const w = new BrowserWindow({
      x: area.x + area.width - CARD_W - 16, y: area.y + 16, width: CARD_W, height: CARD_H,
      frame: false, resizable: false, maximizable: false, minimizable: false, fullscreenable: false, skipTaskbar: true,
      alwaysOnTop: true, show: false, backgroundColor: '#0b0b0e', title: 'Onyx',
      webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false },
    });
    w.setAlwaysOnTop(true, 'screen-saver');
    w.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    w.webContents.on('will-navigate', (e) => e.preventDefault());
    w.on('page-title-updated', (e, title) => {
      const m = /^eyes:(done|skip|snooze)$/.exec(title);
      if (!m) return;
      e.preventDefault();
      timer.answer(kind, m[1] === 'done' ? 'done' : m[1]);
      close();
    });
    w.on('closed', () => { if (card === w) { card = null; if (timer.showing === kind) timer.answer(kind, 'skip'); } });
    // It shows without taking the keyboard from what you are typing in.
    w.once('ready-to-show', () => w.showInactive());
    w.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(cardPage(kind))}`);
    card = w;
  };
  timer.show = show;
  loop = setInterval(() => {
    let idle = 0;
    try { idle = locked ? AWAY_BREAK : powerMonitor.getSystemIdleTime(); } catch { idle = 0; }
    const what = timer.tick(Date.now(), idle);
    if (what === 'close') { timer.showing = null; close(); } else if (what) show(what);
  }, 5000);
}

/** Settings → Try it: shows the look-away card now. */
function test(kind = 'look') {
  if (!timer?.show) throw new Error('Eye breaks run on the PC.');
  timer.show(kind === 'break' ? 'break' : 'look');
  return true;
}

module.exports = { createTimer, settingsOf, cardPage, start, test, DEFAULTS };
