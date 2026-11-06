// Boards (whiteboards for long workflows; the canvas is src/renderer/boards.js): each a list of cards (steps,
// decisions, goals and sticky notes, where they sit, and which way each decision goes) and the arrows between
// them. Kept with the rest of Onyx's data and synced between PCs and the phone, one board at a time (sync.js:
// boards), the newest copy of a board winning. The app makes the ids, so a board saved offline is the same
// board once it reaches the PC.

const store = require('./store');

const KINDS = new Set(['step', 'decision', 'goal', 'note']);
const MAX_BOARDS = 200, MAX_NODES = 500, MAX_LINKS = 1000;
const text = (v, max) => String(v ?? '').slice(0, max);
const num = (v, lo, hi, d = 0) => (Number.isFinite(+v) ? Math.max(lo, Math.min(hi, Math.round(+v))) : d);
const COLOR = /^#[0-9a-f]{6}$/i;
const ID = /^[A-Za-z0-9/_-]{1,64}$/;

function list() {
  if (!Array.isArray(store.data.boards)) store.data.boards = [];
  return store.data.boards;
}

/** A board as kept: only what a board has, each within bounds; arrows only between its own cards. */
function clean(b) {
  const nodes = [];
  const seen = new Set();
  for (const n of Array.isArray(b.nodes) ? b.nodes : []) {
    if (!n || !ID.test(String(n.id)) || seen.has(n.id) || nodes.length >= MAX_NODES) continue;
    seen.add(n.id);
    const kind = KINDS.has(n.kind) ? n.kind : 'step';
    const out = { id: n.id, kind, x: num(n.x, -1e6, 1e6), y: num(n.y, -1e6, 1e6), title: text(n.title, 300), notes: text(n.notes, 4000) };
    if (n.w) out.w = num(n.w, 120, 600, 200);
    if (kind === 'step') out.minutes = num(n.minutes, 0, 12 * 60, 30);
    if ((kind === 'step' || kind === 'goal') && n.done) out.done = true;
    if (kind === 'note' && COLOR.test(String(n.color || ''))) out.color = n.color;
    if (kind === 'decision' && n.chosen) out.chosen = text(n.chosen, 64);
    if (kind === 'step' && n.placed && typeof n.placed === 'object' && n.placed.start) {
      out.placed = { start: text(n.placed.start, 40), ...(n.placed.id ? { id: text(n.placed.id, 300) } : {}) };
    }
    nodes.push(out);
  }
  const links = [];
  const ids = new Set();
  for (const l of Array.isArray(b.links) ? b.links : []) {
    if (!l || !ID.test(String(l.id)) || ids.has(l.id) || links.length >= MAX_LINKS) continue;
    if (!seen.has(l.from) || !seen.has(l.to) || l.from === l.to) continue;
    ids.add(l.id);
    links.push({ id: l.id, from: l.from, to: l.to, label: text(l.label, 80) });
  }
  // A decision's pick that is no longer one of its arrows is no pick.
  for (const n of nodes) if (n.chosen && !links.some((l) => l.id === n.chosen && l.from === n.id)) delete n.chosen;
  return { id: b.id, title: text(b.title, 120).trim() || 'Untitled board', nodes, links, created: text(b.created, 40) || new Date().toISOString(), updated: new Date().toISOString() };
}

/** Every board, the one changed last first. */
function boards() {
  return [...list()].sort((a, b) => (a.updated < b.updated ? 1 : -1));
}

/** Saves a board (made or changed in the app, whose id it keeps). */
function save(board) {
  if (!board || !/^board\/[A-Za-z0-9_-]{4,60}$/.test(String(board.id))) throw new Error('That is not a board.');
  const all = list();
  const i = all.findIndex((b) => b.id === board.id);
  if (i < 0 && all.length >= MAX_BOARDS) throw new Error(`That's the most boards (${MAX_BOARDS}). Delete one to make another.`);
  const kept = clean({ ...(i >= 0 ? { created: all[i].created } : {}), ...board });
  if (i >= 0) all[i] = kept; else all.push(kept);
  store.save();
  return kept;
}

function remove(id) {
  const all = list();
  const i = all.findIndex((b) => b.id === id);
  if (i < 0) return { ok: true };
  all.splice(i, 1);
  store.save();
  return { ok: true };
}

module.exports = { boards, save, remove, clean, MAX_NODES, MAX_LINKS };
