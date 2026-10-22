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

module.exports = { isBug, noteError, fromApp, BUG_RE };
