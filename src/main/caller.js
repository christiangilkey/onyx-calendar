// How reminders reach you, set in Settings → Calls & alerts. Four ways, so it works for
// anyone, not only with a Raspberry Pi:
//
//   alarm   Onyx on your Android phone rings a full-screen alarm (no account, no server).
//   ntfy    A push notification through ntfy (free: install the ntfy app, pick a topic).
//   twilio  A real phone call from your Twilio number, placed by this PC.
//   pi      A Raspberry Pi reads a Google Tasks list and phones you (task_caller.py).
//
// For ntfy and Twilio this PC does the sending: every 30 seconds it looks for a reminder
// that has come due (an entry's escalation, or a task with a time in its name) and sends
// it once. With linked desktops, only the leading one sends.

const store = require('./store');

const TICK_MS = 30_000;
const LATE_MS = 10 * 60_000; // a reminder missed by more than this (the PC was asleep) is skipped
const METHODS = ['alarm', 'ntfy', 'twilio', 'pi'];

let hub = null; // set by start(), to avoid a require cycle
let timer = null;

const calls = () => store.data.settings.calls || {};

/** The way reminders go out: as set, or the Pi for anyone who had it set up before this setting existed. */
function method() {
  const m = calls().method;
  if (METHODS.includes(m)) return m;
  // Anyone who already had Pi reminders (a list picked, or reminders the Pi was given) keeps the Pi.
  const pi = store.data.settings.pi || {};
  const hadPi = pi.taskList || Object.values(store.data.piLinks || {}).some((l) => l.task);
  return hadPi ? 'pi' : 'alarm';
}

/** Whether this PC sends the reminders itself (ntfy or Twilio). */
const sendsHere = () => method() === 'ntfy' || method() === 'twilio';

function info() {
  const c = calls();
  return {
    method: method(),
    ntfyServer: c.ntfyServer || 'https://ntfy.sh', ntfyTopic: c.ntfyTopic || '',
    twilioSid: c.twilioSid || '', twilioFrom: c.twilioFrom || '', callTo: c.callTo || '',
    twilioToken: !!store.data.secrets.twilioToken,
  };
}

function setTwilioToken(token) {
  store.data.secrets.twilioToken = String(token || '').trim();
  store.save();
  return info();
}

// ---------------------------------------------------------------- sending

const esc = (s) => String(s).replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[c]));

async function push(title, message, urgent) {
  const c = calls();
  if (!c.ntfyTopic) throw new Error('Pick an ntfy topic first (Settings → Calls & alerts).');
  const url = `${String(c.ntfyServer || 'https://ntfy.sh').replace(/\/+$/, '')}/${encodeURIComponent(c.ntfyTopic)}`;
  const res = await fetch(url, {
    method: 'POST', body: message, signal: AbortSignal.timeout(15000),
    headers: { Title: title.replace(/[^\x20-\x7e]/g, ''), Priority: urgent ? '5' : '4', Tags: urgent ? 'rotating_light' : 'alarm_clock' },
  });
  if (!res.ok) throw new Error(`ntfy answered ${res.status}`);
}

const twilioAuth = (c, token) => ({ Authorization: `Basic ${Buffer.from(`${c.twilioSid}:${token}`).toString('base64')}` });

/** Places a call; gives its Twilio id. `detect`: tell a person from voicemail (for "was it answered?"). */
async function phoneCall(message, { detect = false } = {}) {
  const c = calls();
  const token = store.data.secrets.twilioToken;
  if (!c.twilioSid || !token || !c.twilioFrom || !c.callTo) throw new Error('Fill in the Twilio account SID, auth token, your Twilio number and the number to call.');
  const twiml = `<Response><Say>${esc(message)}</Say><Pause length="1"/><Say>${esc(message)}</Say></Response>`;
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(c.twilioSid)}/Calls.json`, {
    method: 'POST', signal: AbortSignal.timeout(20000),
    headers: { ...twilioAuth(c, token), 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ To: c.callTo, From: c.twilioFrom, Twiml: twiml, ...(detect ? { MachineDetection: 'Enable' } : {}) }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.message ? `Twilio: ${body.message}` : `Twilio answered ${res.status}`);
  return body.sid || null;
}

/**
 * Whether a call was picked up by a person: watched until it ends (a few minutes at most). Not by
 * voicemail or a machine, and not one rung out, busy or failed. Null when Twilio can't be asked.
 */
async function wasAnswered(sid, { every = 5000, upTo = 4 * 60000, fetchImpl = fetch } = {}) {
  const c = calls();
  const token = store.data.secrets.twilioToken;
  if (!sid || !c.twilioSid || !token) return null;
  const url = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(c.twilioSid)}/Calls/${encodeURIComponent(sid)}.json`;
  const until = Date.now() + upTo;
  while (Date.now() < until) {
    const res = await fetchImpl(url, { headers: twilioAuth(c, token), signal: AbortSignal.timeout(15000) }).catch(() => null);
    const call = res?.ok ? await res.json().catch(() => null) : null;
    if (call) {
      const by = String(call.answered_by || '');
      if (/^machine|^fax/.test(by)) return false;
      if (by === 'human' && (call.status === 'in-progress' || call.status === 'completed')) return true;
      if (['busy', 'failed', 'no-answer', 'canceled'].includes(call.status)) return false;
      if (call.status === 'completed') return Number(call.duration) >= 4; // answered, with no word on who
    }
    await new Promise((r) => setTimeout(r, every));
  }
  return null;
}

/** Sends one reminder the way it is set up: a call (Twilio) or a push (ntfy). */
async function send(kind, title, message, { detect = false } = {}) {
  const m = method();
  if (m === 'twilio' && kind !== 'push') return phoneCall(message, { detect });
  if (m === 'twilio' && kind === 'push') {
    if (calls().ntfyTopic) return push(title, message, false);
    return phoneCall(message); // no push set up: a call is the next best thing
  }
  if (m === 'ntfy') return push(title, message, kind !== 'push');
  throw new Error('This PC sends reminders only with ntfy or Twilio set up.');
}

/** A test from Settings: a call or a push, right now. */
async function test(kind = 'call') {
  const m = method();
  if (m === 'alarm') throw new Error('With "Alarm on my phone", the Onyx app on your Android phone rings. Set a block a minute ahead to try it.');
  if (m === 'pi') throw new Error('The Pi phones you from its own setup; its test is "task_caller.py --dry-run" on the Pi.');
  await send(kind, 'Onyx test', 'This is a test reminder from Onyx Calendar. Reminders will reach you like this.');
  return true;
}

// ---------------------------------------------------------------- the watch

const clock = (d) => d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

function inQuiet(at) {
  const pi = store.data.settings.pi || {};
  try {
    return require('./taskname').inQuietHours(at, pi.quietStart, pi.quietEnd);
  } catch {
    return false;
  }
}

async function tick() {
  if (!hub || !sendsHere()) return;
  if (!require('./sync').leads()) return;
  const now = Date.now();
  const fired = store.data.callsFired || (store.data.callsFired = {});
  let events;
  try {
    ({ events } = await hub.getEvents(new Date(now - 2 * 3600000).toISOString(), new Date(now + 26 * 3600000).toISOString()));
  } catch {
    return; // calendars unreachable: next time
  }
  for (const e of events) {
    if (e.allDay || e.done || e.callAck) continue;
    const alerts = (e.piAlerts || []).length ? e.piAlerts : e.callAt ? [{ at: e.callAt, kind: 'call' }] : [];
    for (const a of alerts) {
      if (a.kind === 'alarm') continue; // the phone rings for these itself
      const at = new Date(a.at);
      const due = at.getTime();
      if (due > now || now - due > LATE_MS) continue;
      const key = `${e.id}|${a.at}|${a.kind}`;
      if (fired[key]) continue;
      fired[key] = new Date(now).toISOString();
      store.save();
      if (inQuiet(at)) continue;
      const start = new Date(e.start);
      const mins = Math.round((start.getTime() - now) / 60000);
      const when = mins > 1 ? `starts in ${mins} minutes, at ${clock(start)}` : mins >= -1 ? 'is starting now' : `started ${-mins} minutes ago`;
      const leave = e.leaveBy ? ` It starts with ${e.leaveBy} minutes of travel: leave at ${clock(start)}, there by ${clock(new Date(start.getTime() + e.leaveBy * 60000))}.` : '';
      try {
        const critical = a.critical ? ` This is call ${a.critical} of ${(e.piAlerts || []).filter((x) => x.critical).length}.` : '';
        const sid = await send(a.kind, e.title, `Reminder: ${e.title} ${when}.${leave}${critical}`, { detect: !!a.critical });
        // Critical: a call answered (by you, not voicemail) is as good as "Leaving now": no more calls about it.
        if (a.critical && sid && method() === 'twilio') {
          wasAnswered(sid).then((yes) => (yes ? hub.ackPiCall(e.id) : null)).catch((err) => console.error('onyx: could not check the call:', err.message));
        }
      } catch (err) {
        console.error('onyx: could not send a reminder:', err.message);
      }
    }
  }
  // Forget sends older than two days.
  const cut = now - 2 * 86400000;
  let changed = false;
  for (const [k, v] of Object.entries(fired)) if (new Date(v).getTime() < cut) { delete fired[k]; changed = true; }
  if (changed) store.save();
}

function start(h) {
  hub = h;
  if (timer) return;
  timer = setInterval(() => tick().catch((err) => console.error('onyx: reminders:', err.message)), TICK_MS);
  timer.unref?.();
}

module.exports = { METHODS, method, sendsHere, info, setTwilioToken, test, send, wasAnswered, tick, start };
