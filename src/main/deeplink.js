// Links other apps can open to hand Onyx a task, or a board:
//
//   onyx://task?title=<text>&minutes=<1-600>&due=<YYYY-MM-DD>&notes=<text>&id=<stable id>&from=<app>&n=<anything>
//
// title is required. minutes is how long the person expects it to take (Magic add plans that
// length). due defaults to today. id lets a second send of the same thing replace the first
// instead of adding another (kept per `from`). from names the app ("tamkeen"); n is ignored
// (a changing value makes Android treat each send as a new link). Everything is validated and
// clamped here: a link is untrusted input from any web page or app.

const clean = (v, max) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

function validDay(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ''));
  if (!m) return null;
  const d = new Date(+m[1], +m[2] - 1, +m[3]);
  return d.getFullYear() === +m[1] && d.getMonth() === +m[2] - 1 && d.getDate() === +m[3] ? s : null;
}

/** The task a link asks for, or null when it is not a task link or has no title. */
function parseTaskLink(raw) {
  let url;
  try { url = new URL(String(raw).trim()); } catch { return null; }
  if (url.protocol !== 'onyx:' || url.hostname.toLowerCase() !== 'task') return null;
  const q = url.searchParams;
  const title = clean(q.get('title'), 120);
  if (!title) return null;
  const mins = /^\d+(\.\d+)?$/.test(String(q.get('minutes') || '').trim()) ? Math.round(parseFloat(q.get('minutes'))) : null;
  const id = String(q.get('id') || '').trim();
  const from = String(q.get('from') || '').trim().toLowerCase();
  return {
    title,
    minutes: mins && mins >= 1 ? Math.min(mins, 600) : null,
    due: validDay(q.get('due')),
    notes: String(q.get('notes') || '').trim().slice(0, 1000),
    id: /^[\w.:-]{1,80}$/.test(id) ? id : null,
    from: /^[a-z0-9][a-z0-9-]{0,23}$/.test(from) ? from : 'app',
  };
}

/**
 * A board another app hands over (the PC):
 *
 *   onyx://board?title=<name>&text=<the list>
 *
 * text is what would be pasted on a board: rows from a spreadsheet (tabs between cells) or one step a line.
 * The window makes the cards from it (boards.js fromList) on a new board with that name. Null when it is not
 * a board link or has nothing in it. Like a task link, it is untrusted input: kept to a size, never run.
 */
function parseBoardLink(raw) {
  let url;
  try { url = new URL(String(raw).trim()); } catch { return null; }
  if (url.protocol !== 'onyx:' || url.hostname.toLowerCase() !== 'board') return null;
  const text = String(url.searchParams.get('text') || '').slice(0, 60000);
  if (!text.trim()) return null;
  return { title: clean(url.searchParams.get('title'), 120) || 'From a link', text };
}

module.exports = { parseTaskLink, parseBoardLink, validDay };
