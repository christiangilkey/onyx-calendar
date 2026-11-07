// Bugs in Onyx itself: a slip in its own code (reading something that isn't there, say), not a
// refusal from Google, the network or a wrong entry. Each is kept with where it happened and its
// trace, so it can be found and fixed: the PC's own (its commands, from the window or the phone),
// and the ones the window and the phone met in their own code, which they send here.
const store = require('./store');
const { version } = require('../../package.json');

const MAX = 60;
// What a slip in the code says (as opposed to a network failure, which in Node is a TypeError too).
const BUG_RE = /Cannot read propert|Cannot set propert|is not a function|is not defined|is not iterable|Cannot access '|before initialization|Maximum call stack|Invalid time value|Invalid array length/;

const isBug = (err) => !!err && (err instanceof TypeError || err instanceof ReferenceError || err instanceof RangeError) && BUG_RE.test(err.message || '');
const clip = (v, n) => String(v ?? '').slice(0, n);

function add(entry) {
  const list = Array.isArray(store.data.bugReports) ? store.data.bugReports : [];
  list.push({
    at: clip(entry.at || new Date().toISOString(), 40), where: clip(entry.where || 'pc', 20), command: clip(entry.command, 60),
    version: clip(entry.version || version, 20), message: clip(entry.message, 300), stack: clip(entry.stack, 3000),
  });
  store.data.bugReports = list.slice(-MAX);
  store.save();
}

/** A command that failed on the PC: kept when the failure is a bug in Onyx. */
function noteError(err, command) {
  if (!isBug(err)) return;
  try { add({ where: 'pc', command, message: err.message, stack: err.stack }); } catch { /* never in the way of the answer */ }
}

/** Bugs the window or the phone met in their own code ([{ at, where, version, message, stack }]). */
function fromApp(list) {
  for (const b of (Array.isArray(list) ? list : []).slice(0, 30)) {
    if (!b || typeof b !== 'object' || !BUG_RE.test(String(b.message || ''))) continue;
    add({ ...b, where: b.where === 'phone' ? 'phone' : 'window', command: '' });
  }
  return true;
}

/**
 * Phone starts that were slow, or never finished (boot.js keeps each step's time): kept with the bugs, so a
 * start that hangs on the phone (a black screen) shows which step held it up. [{ at, ms, done, stages, errors }]
 */
function startsFromPhone(list, appVersion) {
  for (const s of (Array.isArray(list) ? list : []).slice(0, 10)) {
    if (!s || typeof s !== 'object' || !Array.isArray(s.stages)) continue;
    const steps = s.stages.filter((x) => Array.isArray(x)).slice(0, 20).map(([name, ms]) => [clip(name, 20), Number(ms) || 0]);
    const last = steps.length ? steps[steps.length - 1][0] : 'page';
    const errors = (Array.isArray(s.errors) ? s.errors : []).slice(0, 5).map((e) => clip(e, 200));
    add({
      at: s.at, where: 'phone-start', command: '', version: clip(appVersion, 20) || undefined,
      message: s.done ? `A slow start: ${((Number(s.ms) || 0) / 1000).toFixed(1)} s` : `A start that never finished (last step: ${last})`,
      stack: JSON.stringify({ steps, errors }),
    });
  }
  return true;
}

module.exports = { isBug, noteError, fromApp, startsFromPhone, BUG_RE };
