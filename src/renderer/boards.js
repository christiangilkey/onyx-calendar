// Boards: whiteboards for long, hard workflows. A canvas of steps, decisions, goals and sticky notes joined
// by arrows: what has to happen, in what order, and which way each decision goes. At a decision you pick the
// branch you are taking; the route is the way through the board given those picks, and its steps can go to
// the calendar, each as a block of its own (app.js: openBoards, planBoard).
//
// The pure parts (the route, back-to-back times, the arrows' paths) run in node too, for the tests; mount()
// is the canvas itself, in the browser: drag the background to move around, pinch or Ctrl+wheel to zoom,
// drag a card to move it, drag its + to another card to join them (or to empty space for a new step).
(function () {
  const KINDS = {
    step: { label: 'Step', icon: '▭', w: 200, empty: 'Untitled step' },
    decision: { label: 'Decision', icon: '◆', w: 220, empty: 'What is the question?' },
    goal: { label: 'Goal', icon: '⚑', w: 200, empty: 'What is the goal?' },
    note: { label: 'Note', icon: '✎', w: 180, empty: 'A note' },
  };
  const MIN = 60000;
  const NOTE_COLORS = ['#f7d774', '#9fe3a8', '#8fd3ff', '#f4a6c8', '#c9b8ff'];
  const routed = (n) => n && n.kind !== 'note';
  const byPlace = (a, b) => (a.y - b.y) || (a.x - b.x);

  /** The ways out of each card, and which of them the route follows (at a decision: the branch picked). */
  function graphOf(board) {
    const nodes = (board.nodes || []).filter(routed);
    const byId = new Map(nodes.map((n) => [n.id, n]));
    const links = (board.links || []).filter((l) => byId.has(l.from) && byId.has(l.to) && l.from !== l.to);
    const out = new Map(nodes.map((n) => [n.id, []]));
    const into = new Map(nodes.map((n) => [n.id, 0]));
    for (const l of links) { out.get(l.from).push(l); into.set(l.to, into.get(l.to) + 1); }
    const followed = (n) => (n.kind === 'decision' ? out.get(n.id).filter((l) => l.id === n.chosen) : out.get(n.id));
    return { nodes, byId, links, out, into, followed };
  }

  /**
   * The route through a board: from each card nothing leads to, along every arrow, except that at a decision
   * only the branch picked is taken (none picked: the route stops there, and the decision is `open`).
   * { order: the cards on it, each after all that lead to it; open: decisions still to pick; off: the cards
   * not on it; links: the arrows it takes }. Sticky notes are never on it.
   */
  function route(board) {
    const g = graphOf(board);
    const open = g.nodes.filter((n) => n.kind === 'decision' && g.out.get(n.id).length && !g.out.get(n.id).some((l) => l.id === n.chosen)).map((n) => n.id);
    // Where it starts: each card nothing leads to, and for a loop that nothing outside leads into (a way back
    // to the start, say), its left-most card. Found by spreading along every arrow, whatever the picks.
    const roots = g.nodes.filter((n) => !g.into.get(n.id));
    const reach = new Set();
    const spread = (s) => {
      const st = [s];
      while (st.length) {
        const x = st.pop();
        if (reach.has(x.id)) continue;
        reach.add(x.id);
        for (const l of g.out.get(x.id)) st.push(g.byId.get(l.to));
      }
    };
    roots.forEach(spread);
    for (let left = g.nodes.filter((n) => !reach.has(n.id)); left.length; left = left.filter((n) => !reach.has(n.id))) {
      const s = [...left].sort((a, b) => (a.x - b.x) || (a.y - b.y))[0];
      roots.push(s);
      spread(s);
    }
    const on = new Set();
    const stack = [...roots];
    while (stack.length) {
      const n = stack.pop();
      if (!n || on.has(n.id)) continue;
      on.add(n.id);
      for (const l of g.followed(n)) stack.push(g.byId.get(l.to));
    }
    const taken = g.links.filter((l) => on.has(l.from) && on.has(l.to) && g.followed(g.byId.get(l.from)).includes(l));
    // Each after everything on the route that leads to it; among equals, top to bottom, then left to right.
    const need = new Map([...on].map((id) => [id, 0]));
    for (const l of taken) need.set(l.to, need.get(l.to) + 1);
    const ready = [...on].filter((id) => !need.get(id)).map((id) => g.byId.get(id));
    const order = [];
    while (ready.length) {
      ready.sort(byPlace);
      const n = ready.shift();
      order.push(n.id);
      for (const l of taken) if (l.from === n.id) { need.set(l.to, need.get(l.to) - 1); if (!need.get(l.to)) ready.push(g.byId.get(l.to)); }
    }
    for (const n of [...on].map((id) => g.byId.get(id)).sort(byPlace)) if (!order.includes(n.id)) order.push(n.id); // a loop on it
    return { order, open, off: new Set(g.nodes.filter((n) => !on.has(n.id)).map((n) => n.id)), links: new Set(taken.map((l) => l.id)) };
  }

  /** The steps on the route, in order: what goes to the calendar. */
  function planSteps(board) {
    const byId = new Map((board.nodes || []).map((n) => [n.id, n]));
    return route(board).order.map((id) => byId.get(id)).filter((n) => n.kind === 'step');
  }

  /** Steps one after another from `start` (ms), each its own length (30 min when it has none): [{ id, start, end }]. */
  function backToBack(steps, start, gapMinutes = 0) {
    let t = start;
    return steps.map((s) => {
      const len = Math.max(5, Math.min(12 * 60, Number(s.minutes) || 30)) * MIN;
      const slot = { id: s.id, start: t, end: t + len };
      t += len + Math.max(0, gapMinutes) * MIN;
      return slot;
    });
  }

  /** The default name of a decision's next branch: Yes, then No, then Option 3, 4… */
  const branchName = (count) => ['Yes', 'No'][count] || `Option ${count + 1}`;

  /**
   * An arrow from box a to box b ({ x, y, w, h }): out of the side facing b, into the side facing a, curved.
   * { d: the SVG path, mid: its middle point (for the label), end, angle }.
   */
  function linkPath(a, b) {
    const ac = { x: a.x + a.w / 2, y: a.y + a.h / 2 }, bc = { x: b.x + b.w / 2, y: b.y + b.h / 2 };
    const dx = bc.x - ac.x, dy = bc.y - ac.y;
    // Side by side in two columns but far apart up and down (the end of one column to the top of the next): out of
    // the side and along the gap between the columns, so the arrow never runs over the cards of either.
    const apart = b.x >= a.x + a.w || a.x >= b.x + b.w;
    const sideways = (apart && Math.abs(dy) > a.h + b.h) || Math.abs(dx) * (a.h + b.h) >= Math.abs(dy) * (a.w + b.w);
    let p1, p2, c1, c2;
    if (sideways) {
      const s = Math.sign(dx) || 1;
      p1 = { x: ac.x + (s * a.w) / 2, y: ac.y };
      p2 = { x: bc.x - (s * b.w) / 2, y: bc.y };
      const k = Math.max(30, Math.abs(p2.x - p1.x) / 2);
      c1 = { x: p1.x + s * k, y: p1.y };
      c2 = { x: p2.x - s * k, y: p2.y };
    } else {
      const s = Math.sign(dy) || 1;
      p1 = { x: ac.x, y: ac.y + (s * a.h) / 2 };
      p2 = { x: bc.x, y: bc.y - (s * b.h) / 2 };
      const k = Math.max(30, Math.abs(p2.y - p1.y) / 2);
      c1 = { x: p1.x, y: p1.y + s * k };
      c2 = { x: p2.x, y: p2.y - s * k };
    }
    const r = (v) => Math.round(v * 10) / 10;
    const mid = { x: (p1.x + 3 * c1.x + 3 * c2.x + p2.x) / 8, y: (p1.y + 3 * c1.y + 3 * c2.y + p2.y) / 8 };
    return { d: `M${r(p1.x)} ${r(p1.y)} C${r(c1.x)} ${r(c1.y)} ${r(c2.x)} ${r(c2.y)} ${r(p2.x)} ${r(p2.y)}`, mid, start: p1, end: p2 };
  }

  /** The board's grid (Ctrl while dragging snaps a card's corner to it): a number to the nearest step. */
  const GRID = 20;
  const snap = (v, step = GRID) => Math.round(v / step) * step;

  /** The cards a band ({ x0, y0, x1, y1 }, in the board's units, any corners) touches, given each card's box. */
  function inBand(nodes, band, boxOf) {
    const x0 = Math.min(band.x0, band.x1), x1 = Math.max(band.x0, band.x1), y0 = Math.min(band.y0, band.y1), y1 = Math.max(band.y0, band.y1);
    return nodes.filter((n) => { const b = boxOf(n); return b.x < x1 && b.x + b.w > x0 && b.y < y1 && b.y + b.h > y0; }).map((n) => n.id);
  }

  /** A short length: "45 min", "1 h 30 min". */
  const lengthText = (m) => {
    const n = Math.round(Number(m) || 0);
    if (!n) return '';
    return n >= 60 ? `${Math.floor(n / 60)} h${n % 60 ? ` ${n % 60} min` : ''}` : `${n} min`;
  };

  /** A new id for a card or an arrow, unique enough within a board. */
  const newId = (p) => `${p}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

  /** A board made fresh, or the worked example that shows how decisions and the route go. */
  function newBoard(title = 'New board', example = false) {
    const b = { id: newId('board/'), title: String(title || 'New board'), nodes: [], links: [], created: new Date().toISOString(), updated: new Date().toISOString() };
    if (!example) return b;
    b.title = title === 'New board' ? 'Example: move to a new place' : b.title;
    const n = (kind, x, y, title, extra = {}) => { const o = { id: newId('n'), kind, x, y, title, notes: '', ...extra }; b.nodes.push(o); return o; };
    const link = (from, to, label = '') => { const l = { id: newId('l'), from: from.id, to: to.id, label }; b.links.push(l); return l; };
    const goal = n('goal', 40, 160, 'Moved in by the end of the month');
    const budget = n('step', 300, 160, 'Work out the budget', { minutes: 45 });
    const q = n('decision', 560, 150, 'Rent or buy?');
    const rent = n('step', 840, 40, 'Shortlist 5 rentals', { minutes: 90 });
    const view = n('step', 1100, 40, 'Book viewings', { minutes: 30 });
    const buy = n('step', 840, 300, 'Talk to the bank about a mortgage', { minutes: 60 });
    const agent = n('step', 1100, 300, 'Find an estate agent', { minutes: 45 });
    const pack = n('step', 1380, 160, 'Pack and book the movers', { minutes: 120 });
    n('note', 300, 330, 'Pick a branch on "Rent or buy?" and the route lights up. Plan it puts its steps in the calendar.', { color: NOTE_COLORS[0] });
    link(goal, budget);
    link(budget, q);
    const yes = link(q, rent, 'Rent');
    link(q, buy, 'Buy');
    link(rent, view);
    link(buy, agent);
    link(view, pack);
    link(agent, pack);
    q.chosen = yes.id;
    return b;
  }

  // ------------------------------------------------------------ drawing on the board (the pencil and the eraser)
  // A stroke: { id, color: '#rrggbb', width (the board's units), pts: [x0, y0, x1, y1, …] } in the board's units, so
  // it moves and zooms with the cards. Kept with the board (src/main/boards.js cleanStrokes).

  /** A stroke's points as a smooth SVG path: a curve through the middle of each pair of points. A single point: a dot. */
  function inkPath(pts) {
    const n = Math.floor((pts || []).length / 2);
    if (!n) return '';
    const r = (v) => Math.round(v * 10) / 10;
    if (n === 1) return `M${r(pts[0])} ${r(pts[1])} l0.01 0`;
    if (n === 2) return `M${r(pts[0])} ${r(pts[1])} L${r(pts[2])} ${r(pts[3])}`;
    let d = `M${r(pts[0])} ${r(pts[1])}`;
    for (let i = 1; i < n - 1; i++) {
      const x = pts[i * 2], y = pts[i * 2 + 1], mx = (x + pts[i * 2 + 2]) / 2, my = (y + pts[i * 2 + 3]) / 2;
      d += ` Q${r(x)} ${r(y)} ${r(mx)} ${r(my)}`;
    }
    return `${d} L${r(pts[(n - 1) * 2])} ${r(pts[(n - 1) * 2 + 1])}`;
  }

  /** Fewer points for the same line (Ramer–Douglas–Peucker, within `tol`), as whole numbers. */
  function simplifyInk(pts, tol = 0.8) {
    const n = Math.floor((pts || []).length / 2);
    if (n <= 2) return (pts || []).slice(0, n * 2).map(Math.round);
    const keep = new Uint8Array(n);
    keep[0] = keep[n - 1] = 1;
    const stack = [[0, n - 1]];
    while (stack.length) {
      const [a, b] = stack.pop();
      const ax = pts[a * 2], ay = pts[a * 2 + 1], bx = pts[b * 2], by = pts[b * 2 + 1];
      const dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy) || 1;
      let far = -1, best = tol;
      for (let i = a + 1; i < b; i++) {
        const d = Math.abs(dy * pts[i * 2] - dx * pts[i * 2 + 1] + bx * ay - by * ax) / len;
        if (d > best) { best = d; far = i; }
      }
      if (far > 0) { keep[far] = 1; stack.push([a, far], [far, b]); }
    }
    const out = [];
    for (let i = 0; i < n; i++) if (keep[i]) out.push(Math.round(pts[i * 2]), Math.round(pts[i * 2 + 1]));
    return out;
  }

  /** Points no further apart than `step`: a long straight bit gets points along it (so the eraser can cut it). */
  function densify(pts, step) {
    const out = [];
    for (let i = 0; i + 1 < pts.length; i += 2) {
      if (i >= 2) {
        const px = pts[i - 2], py = pts[i - 1], dx = pts[i] - px, dy = pts[i + 1] - py;
        const k = Math.floor(Math.hypot(dx, dy) / step);
        for (let j = 1; j <= k; j++) out.push(px + (dx * j) / (k + 1), py + (dy * j) / (k + 1));
      }
      out.push(pts[i], pts[i + 1]);
    }
    return out;
  }

  /**
   * The drawing with what the eraser went over taken out: every stroke loses its points within `r` of the eraser's
   * path (flat points), and splits where it was cut; what is left of each keeps its colour and width. A stroke the
   * eraser never came near is kept as it was (the same object). `newIdFn` names the pieces of a cut stroke.
   */
  function eraseInk(strokes, path, r, newIdFn = () => newId('s')) {
    const ep = densify(path || [], Math.max(1, r / 2));
    if (!ep.length) return strokes || [];
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (let i = 0; i < ep.length; i += 2) { x0 = Math.min(x0, ep[i]); x1 = Math.max(x1, ep[i]); y0 = Math.min(y0, ep[i + 1]); y1 = Math.max(y1, ep[i + 1]); }
    const near = (x, y) => {
      for (let i = 0; i < ep.length; i += 2) if ((ep[i] - x) ** 2 + (ep[i + 1] - y) ** 2 <= r * r) return true;
      return false;
    };
    const out = [];
    for (const st of strokes || []) {
      const reach = r + (st.width || 1) / 2;
      // Near it at all? Each bit of the line (not just its points: a long straight bit has none in its middle).
      let hit = false;
      for (let i = 0; i + 1 < st.pts.length && !hit; i += 2) {
        const x = st.pts[i], y = st.pts[i + 1], px = i ? st.pts[i - 2] : x, py = i ? st.pts[i - 1] : y;
        if (Math.max(x, px) >= x0 - reach && Math.min(x, px) <= x1 + reach && Math.max(y, py) >= y0 - reach && Math.min(y, py) <= y1 + reach) hit = true;
      }
      if (!hit) { out.push(st); continue; } // nowhere near: as it was
      const dense = densify(st.pts, Math.max(1, r / 3));
      const pieces = [];
      let cur = [];
      for (let i = 0; i + 1 < dense.length; i += 2) {
        if (near(dense[i], dense[i + 1])) { if (cur.length) pieces.push(cur); cur = []; } else cur.push(dense[i], dense[i + 1]);
      }
      if (cur.length) pieces.push(cur);
      if (pieces.length === 1 && pieces[0].length === dense.length) { out.push(st); continue; } // went close, cut nothing
      for (const p of pieces) if (p.length >= 4) out.push({ id: newIdFn(), color: st.color, width: st.width, pts: simplifyInk(p, 0.6) });
    }
    return out;
  }

  /** A colour from the wheel: hue 0–360, saturation and brightness 0–1, as '#rrggbb'. */
  function hsvToHex(h, s, v) {
    const f = (k) => { const n = (k + h / 60) % 6; return v - v * s * Math.max(0, Math.min(n, 4 - n, 1)); };
    return `#${[f(5), f(3), f(1)].map((c) => Math.round(c * 255).toString(16).padStart(2, '0')).join('')}`;
  }
  /** '#rrggbb' as { h, s, v }, to put the wheel's marker where a colour already is. */
  function hexToHsv(hex) {
    const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || ''));
    if (!m) return { h: 0, s: 0, v: 1 };
    const [r, g, b] = [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16) / 255);
    const max = Math.max(r, g, b), d = max - Math.min(r, g, b);
    let h = 0;
    if (d) h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return { h: Math.round(((h * 60) + 360) % 360), s: max ? d / max : 0, v: max };
  }

  // ------------------------------------------------------------ cards from a list

  /** Text as rows of cells: copied from a spreadsheet (tabs between cells, quoted when a cell has line breaks), or one line a row. */
  function rowsOf(text) {
    const s = String(text || '').replace(/\r\n?/g, '\n');
    if (!s.includes('\t')) return s.split('\n').map((line) => [line]);
    const rows = [];
    let row = [], cell = '', quoted = false;
    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      if (quoted) {
        if (c !== '"') cell += c;
        else if (s[i + 1] === '"') { cell += '"'; i++; } else quoted = false;
      } else if (c === '"' && cell === '') quoted = true;
      else if (c === '\t') { row.push(cell); cell = ''; } else if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; } else cell += c;
    }
    row.push(cell);
    rows.push(row);
    return rows;
  }

  const BULLET = /^(?:[-*•▪◦–]|\d{1,3}[.)]|\[[ xX]?\])\s+/;
  const STEP_NO = /^(?:step\s*)?([a-z]?\d{1,3}(?:\.\d{1,3})?[a-z]?)[.):]?$/i;
  /** A heading: "# Phase", "Phase one:", or a short line in capitals ("1 PRODUCT RESEARCH"). */
  const isHeading = (t) => /^#{1,6}\s*\S/.test(t) || (/:$/.test(t) && t.length <= 80)
    || (t.length <= 60 && /[A-Z].*[A-Z].*[A-Z]/.test(t) && !/[a-z]/.test(t));
  const headingText = (t) => t.replace(/^#{1,6}\s*/, '').replace(/:$/, '').trim();
  /** A name short enough for a card; the whole text goes in its details when it had to be cut. */
  function shorten(t) {
    if (t.length <= 100) return { title: t, cut: false };
    const end = t.slice(0, 100).search(/(?<=[a-z0-9)])[.:;!?](\s|$)|\s[—–-]\s/i);
    if (end >= 20) return { title: t.slice(0, end).trim(), cut: true };
    const sp = t.lastIndexOf(' ', 90);
    return { title: `${t.slice(0, sp > 40 ? sp : 90).trim()}…`, cut: true };
  }

  /**
   * Cards made from a pasted list: rows from a spreadsheet, or a plain list with one step a line. They go down in
   * columns: a row that is only a heading ("PHASE 1: BRAND FOUNDATION", "Launch:", "# Week 2") starts a new
   * column with its goal at the top, and its steps under it. Every card is joined to the next by an arrow, in
   * order: down a column, and from the end of one column to the top of the next (along the gap between them, so
   * no arrow crosses a card). A long column goes on at the top of the next. In spreadsheet rows, a step number in
   * the first cell ("1", "6b", "0.1", "D1") goes before the name in the next cell, and the cells after it become
   * the details, under their column names when the rows start with a header row. The cards start at (x0, y0):
   * below what the board already has. Returns { nodes, links }.
   */
  function fromList(text, { x0 = 40, y0 = 40 } = {}) {
    const COL_X = 260, GAP_Y = 40, PER_COL = 10;
    const nodes = [], links = [];
    let header = null, col = -1, inCol = 0, y = y0, prev = null;
    // A card's height on the board, near enough: about 20 letters a line of its name, and the rest of the card.
    const tall = (title) => 64 + 20 * Math.min(6, Math.max(1, Math.ceil(title.length / 20)));
    const newCol = () => { col += 1; inCol = 0; y = y0; };
    const place = (kind, title, notes) => {
      if (col < 0 || inCol >= PER_COL) newCol(); // a long column goes on in the next one
      const n = { id: newId('n'), kind, x: x0 + col * COL_X, y, title: title.slice(0, 300), notes: notes.slice(0, 4000) };
      if (kind === 'step') n.minutes = 30;
      nodes.push(n);
      if (prev) links.push({ id: newId('l'), from: prev.id, to: n.id, label: '' });
      prev = n;
      inCol += 1;
      y += tall(n.title) + GAP_Y;
      return n;
    };
    const rows = rowsOf(text);
    const sheet = rows.some((r) => r.length > 1);
    for (const raw of rows) {
      if (nodes.length >= 400) break;
      const cells = raw.map((c) => String(c).replace(/[ \t]+\n/g, '\n').trim());
      const filled = cells.filter(Boolean);
      if (!filled.length) continue;
      const first = cells.findIndex(Boolean);
      // A heading: a new column, with its goal at the top (the last card before it leads to it).
      if (filled.length === 1 && first === 0 && isHeading(filled[0].replace(BULLET, ''))) {
        if (col < 0 || inCol > 0) newCol();
        place('goal', headingText(filled[0].replace(BULLET, '')), '');
        continue;
      }
      // The spreadsheet's own column names, before its first step: they label the details.
      if (sheet && !header && !nodes.length && filled.length > 1 && filled.every((c) => c.length <= 30 && !/^\d/.test(c))) {
        header = cells;
        continue;
      }
      let num = '', at = first;
      const no = STEP_NO.exec(cells[first]);
      if (no && filled.length > 1) { num = no[1]; at = cells.findIndex((c, i) => i > first && c); }
      const name = cells[at].replace(BULLET, '').replace(/\s*\n\s*/g, ' ');
      const { title, cut } = shorten(name);
      const details = cells.map((c, i) => (i > at && c ? (header?.[i] ? `${header[i]}: ${c}` : c) : null)).filter(Boolean);
      if (cut) details.unshift(name);
      place('step', num ? `${num}${/[.]|^[a-z]/i.test(num) ? '' : '.'} ${title}` : title, details.join('\n\n'));
    }
    return { nodes, links };
  }

  // ------------------------------------------------------------ the canvas (browser only)

  const NS = 'http://www.w3.org/2000/svg';
  const el = (tag, cls, text) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  };
  const svgEl = (tag, attrs) => {
    const e = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs || {})) e.setAttribute(k, v);
    return e;
  };

  /**
   * The canvas in `space`, showing `o.board` (changed in place; o.onChange(board) after each change, to save).
   * o.onOpen(node) opens a card's editor, o.onOpenLink(link, rect) an arrow's; o.when(placed) says when a step
   * is in the calendar; o.cam / o.onCam keep where the view was. Returns { draw, add, fit, select, setBoard,
   * setRoute, center }.
   */
  function mount(space, o) {
    let board = o.board;
    let cam = { x: 40, y: 40, z: 1, ...(o.cam || {}) };
    let sel = null;
    let showRoute = o.route !== false;
    const world = el('div', 'wb-world');
    const lines = svgEl('svg', { class: 'wb-lines', 'aria-hidden': 'true' });
    const defs = svgEl('defs');
    for (const [id, cls] of [['wb-arrow', 'wb-tip'], ['wb-arrow-on', 'wb-tip on']]) {
      const m = svgEl('marker', { id, viewBox: '0 0 10 10', refX: '9', refY: '5', markerWidth: '7', markerHeight: '7', orient: 'auto-start-reverse' });
      m.append(svgEl('path', { d: 'M0 0 L10 5 L0 10 z', class: cls }));
      defs.append(m);
    }
    const temp = svgEl('svg', { class: 'wb-lines wb-temp-box', 'aria-hidden': 'true' });
    const tempPath = svgEl('path', { class: 'wb-link wb-temp', 'marker-end': 'url(#wb-arrow-on)' });
    temp.append(tempPath);
    const labels = el('div', 'wb-labels');
    const cards = el('div', 'wb-cards');
    // The drawing: under everything else, in the board's own units (a 1×1 box that shows all of it, overflowing).
    const ink = svgEl('svg', { class: 'wb-ink', viewBox: '0 0 1 1', 'aria-hidden': 'true' });
    world.append(ink, lines, labels, cards, temp);
    // What a press on the board does: 'move' (pick, drag, pan), 'pen' (draw) or 'eraser' (rub out).
    let tool = 'move';
    let pen = { color: '#f1f1f4', size: 3 };
    const inkUndo = []; // the drawing as it was before each stroke, rub or clear (this visit)
    const strokesOf = () => (Array.isArray(board.strokes) ? board.strokes : []);
    const strokeEl = (st) => svgEl('path', { d: inkPath(st.pts), stroke: st.color, 'stroke-width': st.width, class: 'wb-stroke' });
    function drawInk() { ink.replaceChildren(...strokesOf().map(strokeEl)); }
    const keepInkUndo = () => { inkUndo.push(strokesOf()); if (inkUndo.length > 60) inkUndo.shift(); };
    // The quick options for the card picked (o.quick builds them): over it, at full size whatever the zoom.
    const quick = el('div', 'wb-quick');
    quick.setAttribute('role', 'toolbar');
    quick.hidden = true;
    space.replaceChildren(world, quick);
    temp.style.display = 'none';
    const sizes = new Map();
    let quickFor = null; // the card the options were made for

    /** Puts the quick options over the card picked (under it, near the top), or hides them. */
    function placeQuick() {
      const c = sel && !act?.moved && cards.querySelector(`.wb-card[data-id="${CSS.escape(sel)}"]`);
      if (!c || !o.quick) { quick.hidden = true; return; }
      if (quickFor !== sel) { quick.replaceChildren(o.quick(node(sel))); quickFor = sel; }
      quick.hidden = false;
      const s = space.getBoundingClientRect(), r = c.getBoundingClientRect();
      const qh = quick.offsetHeight || 44, qw = quick.offsetWidth || 200;
      const below = r.top - s.top < qh + 14;
      const x = Math.max(qw / 2 + 6, Math.min(s.width - qw / 2 - 6, r.left - s.left + r.width / 2));
      quick.style.left = `${Math.round(x)}px`;
      quick.style.top = `${Math.round(below ? r.bottom - s.top + 10 : r.top - s.top - 10)}px`;
      quick.classList.toggle('below', below);
    }
    /** The quick options made again (a change to the card picked: done, its colour). */
    const freshQuick = () => { quickFor = null; placeQuick(); };

    // Several cards picked at once (Shift and a band, or Shift+click): they move, tick off and delete together.
    const multi = new Set();
    const multiNodes = () => board.nodes.filter((n) => multi.has(n.id));
    const tellMulti = () => o.onMulti?.(multiNodes());
    const apply = () => {
      world.style.transform = `translate(${Math.round(cam.x)}px, ${Math.round(cam.y)}px) scale(${cam.z})`;
      space.style.setProperty('--z', String(cam.z));
      space.style.setProperty('--gx', `${Math.round(cam.x)}px`);
      space.style.setProperty('--gy', `${Math.round(cam.y)}px`);
      // Zoomed out, every 2nd or 4th line of the grid shows (never closer than 12px); cards still snap to every one.
      let gs = GRID * cam.z;
      while (gs < 12) gs *= 2;
      space.style.setProperty('--gs', `${gs}px`);
      o.onCam?.({ ...cam });
      placeQuick();
    };
    const toWorld = (cx, cy) => {
      const r = space.getBoundingClientRect();
      return { x: (cx - r.left - cam.x) / cam.z, y: (cy - r.top - cam.y) / cam.z };
    };
    const node = (id) => board.nodes.find((n) => n.id === id);
    const box = (n) => ({ x: n.x, y: n.y, w: sizes.get(n.id)?.w || n.w || KINDS[n.kind]?.w || 200, h: sizes.get(n.id)?.h || 70 });
    const changed = () => { board.updated = new Date().toISOString(); o.onChange?.(board); };

    function cardEl(n, r) {
      const k = KINDS[n.kind] || KINDS.step;
      const off = showRoute && r.off.has(n.id), open = r.open.includes(n.id);
      const c = el('div', `wb-card k-${n.kind}${n.done ? ' done' : ''}${sel === n.id ? ' sel' : ''}${multi.has(n.id) ? ' multi' : ''}${off ? ' off' : ''}${open ? ' open' : ''}${showRoute && r.order.includes(n.id) ? ' on' : ''}`);
      c.dataset.id = n.id;
      c.tabIndex = 0;
      c.style.left = `${n.x}px`;
      c.style.top = `${n.y}px`;
      c.style.width = `${n.w || k.w}px`;
      if (n.kind === 'note') c.style.setProperty('--note', n.color || NOTE_COLORS[0]);
      c.setAttribute('role', 'group');
      c.setAttribute('aria-label', `${k.label}: ${n.title || k.empty}`);
      if (n.kind !== 'note') c.append(el('div', 'wb-kind', `${k.icon} ${k.label}${n.kind === 'step' && n.done ? ' · done' : ''}`));
      c.append(el('div', `wb-title${n.title ? '' : ' empty'}`, n.title || k.empty));
      if (n.kind === 'note' && n.notes) c.append(el('div', 'wb-body', n.notes));
      const meta = [];
      if (n.kind === 'step' && n.minutes) meta.push(el('span', 'wb-chip', lengthText(n.minutes)));
      if (n.placed && o.when) meta.push(el('span', 'wb-chip cal', `📅 ${o.when(n.placed)}`));
      if (n.kind !== 'note' && n.notes) meta.push(el('span', 'wb-chip', '📝'));
      if (meta.length) { const m = el('div', 'wb-meta'); m.append(...meta); c.append(m); }
      if (n.kind === 'decision') {
        const outs = board.links.filter((l) => l.from === n.id && node(l.to));
        const ways = el('div', 'wb-ways');
        if (!outs.length) ways.append(el('span', 'wb-way-hint', 'Drag + to add the ways it can go'));
        else {
          ways.append(el('span', 'wb-way-q', open ? 'Which way?' : 'Taking:'));
          for (const l of outs) {
            const b = el('button', `wb-way${n.chosen === l.id ? ' on' : ''}`, l.label || 'Branch');
            b.type = 'button';
            b.dataset.node = n.id;
            b.dataset.link = l.id;
            b.title = n.chosen === l.id ? 'The way you are taking (tap again to undecide)' : 'Take this way';
            ways.append(b);
          }
        }
        c.append(ways);
      }
      // Ticked off or not: the box at the top right of every card.
      const check = el('button', `wb-check${n.done ? ' on' : ''}`);
      check.type = 'button';
      check.dataset.node = n.id;
      check.title = n.done ? 'Done. Tap to untick it' : 'Tick it off';
      check.setAttribute('aria-label', check.title);
      check.setAttribute('aria-pressed', String(!!n.done));
      check.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>'; // constant markup
      c.append(check);
      const plus = el('button', 'wb-plus', '+');
      plus.type = 'button';
      plus.title = n.kind === 'decision' ? 'Drag to a card to add a way it can go, or tap for a new one' : 'Drag to a card to join them, or tap for the next step';
      plus.setAttribute('aria-label', plus.title);
      c.append(plus);
      return c;
    }

    function measure() {
      for (const c of cards.children) sizes.set(c.dataset.id, { w: c.offsetWidth, h: c.offsetHeight });
    }

    /** The SVG box: big enough for every card and the arrows between them, in the world's own units. */
    function frame(svg, pts) {
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const p of pts) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); }
      if (!Number.isFinite(x0)) { x0 = y0 = 0; x1 = y1 = 1; }
      x0 -= 200; y0 -= 200; x1 += 200; y1 += 200;
      svg.setAttribute('viewBox', `${x0} ${y0} ${x1 - x0} ${y1 - y0}`);
      Object.assign(svg.style, { left: `${x0}px`, top: `${y0}px`, width: `${x1 - x0}px`, height: `${y1 - y0}px` });
    }

    function drawLines(r = route(board)) {
      const pts = [];
      for (const n of board.nodes) { const b = box(n); pts.push({ x: b.x, y: b.y }, { x: b.x + b.w, y: b.y + b.h }); }
      frame(lines, pts);
      lines.replaceChildren(defs);
      labels.replaceChildren();
      for (const l of board.links) {
        const a = node(l.from), b = node(l.to);
        if (!a || !b) continue;
        const p = linkPath(box(a), box(b));
        const taken = r.links.has(l.id);
        const dim = showRoute && !taken && (a.kind !== 'note' && b.kind !== 'note');
        const cls = `wb-link${taken && showRoute ? ' on' : ''}${dim ? ' off' : ''}`;
        lines.append(svgEl('path', { d: p.d, class: cls, 'marker-end': `url(#${taken && showRoute ? 'wb-arrow-on' : 'wb-arrow'})` }));
        const hit = svgEl('path', { d: p.d, class: 'wb-hit' });
        hit.dataset.link = l.id;
        lines.append(hit);
        if (l.label || a.kind === 'decision') {
          const t = el('button', `wb-label${taken && showRoute ? ' on' : ''}${dim ? ' off' : ''}`, l.label || 'Branch');
          t.type = 'button';
          t.dataset.link = l.id;
          t.style.left = `${p.mid.x}px`;
          t.style.top = `${p.mid.y}px`;
          labels.append(t);
        }
      }
    }

    function draw() {
      const r = route(board);
      drawInk();
      cards.replaceChildren(...board.nodes.map((n) => cardEl(n, r)));
      measure();
      drawLines(r);
      if (sel && !node(sel)) sel = null;
      for (const id of [...multi]) if (!node(id)) multi.delete(id);
      quickFor = null; // made again for the card as it is now
      apply();
      o.onDraw?.(r);
      o.onPick?.(sel ? node(sel) : null); // the card picked, as it is now (app.js: its panel), or none
    }

    // ---- adding
    const free = (x, y) => {
      let p = { x, y };
      for (let i = 0; i < 40 && board.nodes.some((n) => Math.abs(n.x - p.x) < 40 && Math.abs(n.y - p.y) < 30); i++) p = { x: p.x + 30, y: p.y + 30 };
      return p;
    };
    function add(kind = 'step', at = null, extra = {}) {
      const k = KINDS[kind] ? kind : 'step';
      const r = space.getBoundingClientRect();
      const c = at || toWorld(r.left + r.width / 2, r.top + r.height / 2);
      const p = at ? { x: Math.round(c.x), y: Math.round(c.y) } : free(Math.round(c.x - KINDS[k].w / 2), Math.round(c.y - 35));
      const n = { id: newId('n'), kind: k, x: p.x, y: p.y, title: '', notes: '', ...(k === 'step' ? { minutes: 30 } : {}), ...(k === 'note' ? { color: NOTE_COLORS[board.nodes.filter((x) => x.kind === 'note').length % NOTE_COLORS.length] } : {}), ...extra };
      board.nodes.push(n);
      sel = n.id;
      changed();
      draw();
      return n;
    }
    function join(from, to) {
      const a = node(from);
      if (!a || from === to || board.links.some((l) => l.from === from && l.to === to)) return null;
      const label = a.kind === 'decision' ? branchName(board.links.filter((l) => l.from === from).length) : '';
      const l = { id: newId('l'), from, to, label };
      board.links.push(l);
      return l;
    }
    /** The next step after a card: to its right (below, once the right is taken), joined to it. */
    function after(from, at) {
      const a = node(from), b = box(a);
      const ways = board.links.filter((l) => l.from === from).length;
      const p = at || free(b.x + b.w + 90, b.y + (a.kind === 'decision' ? ways * 140 - 40 : 0));
      const n = { id: newId('n'), kind: 'step', x: Math.round(p.x), y: Math.round(p.y), title: '', notes: '', minutes: 30 };
      board.nodes.push(n);
      join(from, n.id);
      sel = n.id;
      changed();
      draw();
      return n;
    }

    // ---- moving about: one pointer drags (the view, a card or a new arrow), two pinch to zoom
    const pts = new Map();
    let act = null;
    const zoomAt = (cx, cy, k) => {
      const z = Math.max(0.25, Math.min(2.5, cam.z * k));
      const r = space.getBoundingClientRect();
      const wx = (cx - r.left - cam.x) / cam.z, wy = (cy - r.top - cam.y) / cam.z;
      cam = { x: cx - r.left - wx * z, y: cy - r.top - wy * z, z };
      apply();
    };
    const pinchInfo = () => {
      const [a, b] = [...pts.values()];
      return { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    };
    // Press and hold (a finger or a pen): on a card it lifts the card to move; on empty space it offers to add
    // a card right there. A finger that slides off a card it hasn't picked moves the board instead, so a full
    // board can still be moved about; the mouse drags cards straight away, and right-clicks for the same.
    const HOLD_MS = 450;
    const buzz = () => { try { navigator.vibrate?.(12); } catch { /* no buzz on this device */ } };
    let touchAt = 0;
    const pickCard = (id) => {
      sel = id;
      for (const c of cards.children) c.classList.toggle('sel', c.dataset.id === id);
      quickFor = null;
      placeQuick();
      o.onPick?.(node(id));
    };
    const held = (a) => {
      if (act !== a || a.moved) return;
      buzz();
      if (a.type === 'card') {
        a.picked = a.lifted = true;
        a.el.classList.add('lifted');
        pickCard(a.n.id);
      } else if (a.type === 'pan') {
        act = null;
        if (sel) { sel = null; draw(); }
        o.onAddHere?.(toWorld(a.x0, a.y0), { x: a.x0, y: a.y0 });
      }
    };
    space.addEventListener('pointerdown', (e) => {
      if (e.button > 0) return;
      if (e.target.closest('.wb-quick')) return; // its own buttons
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size === 2) {
        const p = pinchInfo();
        if (act?.type === 'draw') act.live?.remove(); // two fingers: a pinch, not a line
        tempEnd();
        clearTimeout(act?.hold);
        act = { type: 'pinch', d0: p.d, z0: cam.z, w: toWorld(p.x, p.y) };
        placeQuick();
        return;
      }
      if (pts.size > 2) return;
      const t = e.target;
      if (t.closest('input, textarea, select')) return;
      const touchy = e.pointerType !== 'mouse';
      if (touchy) touchAt = Date.now();
      const card = t.closest('.wb-card');
      const base = { x0: e.clientX, y0: e.clientY, moved: false, id: e.pointerId, touchy, cx: cam.x, cy: cam.y };
      if (tool !== 'move') {
        const w = toWorld(e.clientX, e.clientY);
        if (tool === 'pen') {
          const live = svgEl('path', { class: 'wb-stroke', stroke: pen.color, 'stroke-width': Math.max(1, Math.min(40, pen.size / cam.z)) });
          ink.append(live);
          act = { ...base, type: 'draw', pts: [w.x, w.y], live, width: Math.max(1, Math.min(40, Math.round((pen.size / cam.z) * 10) / 10)) };
          live.setAttribute('d', inkPath(act.pts));
        } else {
          act = { ...base, type: 'erase', before: strokesOf(), last: w, r: 12 / cam.z };
          const now = strokesOf(), after = eraseInk(now, [w.x, w.y], act.r);
          if (after.length !== now.length || after.some((x, i) => x !== now[i])) { board.strokes = after; drawInk(); }
        }
        e.preventDefault();
        return;
      }
      if (t.closest('.wb-check') && card) { const id = card.dataset.id; act = { ...base, type: 'tap', run: () => { const n = node(id); if (!n) return; n.done = !n.done; changed(); draw(); } }; }
      else if (t.closest('.wb-way')) { const w = t.closest('.wb-way'); act = { ...base, type: 'tap', run: () => choose(w.dataset.node, w.dataset.link) }; }
      else if (t.closest('.wb-plus') && card) act = { ...base, type: 'link', from: card.dataset.id };
      else if (card) {
        const n = node(card.dataset.id);
        act = { ...base, type: 'card', n, nx: n.x, ny: n.y, el: card, picked: !touchy || sel === n.id, shift: e.shiftKey };
        // One of several picked: they all go with it, the same way.
        if (multi.has(n.id) && multi.size > 1) act.group = multiNodes().map((m) => ({ n: m, x: m.x, y: m.y, el: cards.querySelector(`.wb-card[data-id="${CSS.escape(m.id)}"]`) }));
      } else if (e.shiftKey && !touchy && !t.closest('.wb-label, .wb-hit')) {
        const band = el('div', 'wb-band');
        space.append(band);
        act = { ...base, type: 'band', band, w0: toWorld(e.clientX, e.clientY), keep: new Set(multi) };
      } else if (t.closest('.wb-label, .wb-hit')) { const l = t.closest('[data-link]'); act = { ...base, type: 'tap', run: () => o.onOpenLink?.(board.links.find((x) => x.id === l.dataset.link), l.getBoundingClientRect()) }; }
      else act = { ...base, type: 'pan' };
      if (touchy && (act.type === 'card' || act.type === 'pan')) { const a = act; a.hold = setTimeout(() => held(a), HOLD_MS); }
      if (act.type !== 'tap') e.preventDefault();
    });
    // The mouse's right button: the card's quick options, or what to add at that spot.
    space.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      if (Date.now() - touchAt < 1500) return; // a finger's long press: already handled
      if (tool !== 'move') return; // drawing: no menus
      const card = e.target.closest('.wb-card');
      if (card) pickCard(card.dataset.id);
      else if (!e.target.closest('.wb-quick, .wb-label')) o.onAddHere?.(toWorld(e.clientX, e.clientY), { x: e.clientX, y: e.clientY });
    });
    const onMove = (e) => {
      if (!pts.has(e.pointerId)) return;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (!act) return;
      if (act.type === 'pinch') {
        if (pts.size < 2) return;
        const p = pinchInfo();
        const z = Math.max(0.25, Math.min(2.5, act.z0 * (p.d / act.d0)));
        const r = space.getBoundingClientRect();
        cam = { x: p.x - r.left - act.w.x * z, y: p.y - r.top - act.w.y * z, z };
        apply();
        return;
      }
      if (e.pointerId !== act.id) return;
      if (act.type === 'draw') {
        const w = toWorld(e.clientX, e.clientY), n = act.pts.length;
        if (Math.hypot(w.x - act.pts[n - 2], w.y - act.pts[n - 1]) * cam.z < 1.5) return; // too close to the last point
        act.pts.push(w.x, w.y);
        if (!act.raf) act.raf = requestAnimationFrame(() => { if (act?.type === 'draw') { act.raf = 0; act.live.setAttribute('d', inkPath(act.pts)); } });
        return;
      }
      if (act.type === 'erase') {
        const w = toWorld(e.clientX, e.clientY);
        const now = strokesOf(), after = eraseInk(now, [act.last.x, act.last.y, w.x, w.y], act.r);
        act.last = w;
        if (after.length !== now.length || after.some((x, i) => x !== now[i])) { board.strokes = after; drawInk(); }
        return;
      }
      const dx = e.clientX - act.x0, dy = e.clientY - act.y0;
      if (!act.moved && Math.hypot(dx, dy) > (act.touchy ? 8 : 5)) {
        act.moved = true;
        clearTimeout(act.hold);
        if (act.type === 'card' && !act.picked) act.type = 'pan'; // a finger across a card not picked: the board moves
        if (act.type === 'card' || act.type === 'link') placeQuick(); // out of the way while it moves
      }
      if (!act.moved) return;
      if (act.type === 'tap') { act = null; return; }
      if (act.type === 'pan') { cam.x = act.cx + dx; cam.y = act.cy + dy; apply(); }
      else if (act.type === 'band') {
        const r = space.getBoundingClientRect();
        Object.assign(act.band.style, { left: `${Math.min(act.x0, e.clientX) - r.left}px`, top: `${Math.min(act.y0, e.clientY) - r.top}px`, width: `${Math.abs(dx)}px`, height: `${Math.abs(dy)}px` });
        const w = toWorld(e.clientX, e.clientY);
        const hits = new Set([...act.keep, ...inBand(board.nodes, { x0: act.w0.x, y0: act.w0.y, x1: w.x, y1: w.y }, box)]);
        for (const c of cards.children) c.classList.toggle('multi', hits.has(c.dataset.id));
        act.hits = hits;
      } else if (act.type === 'card') {
        // Ctrl (Cmd on a Mac) held: the card's corner goes to the board's grid, and the grid shows.
        const grid = e.ctrlKey || e.metaKey;
        space.classList.toggle('snapping', grid);
        let x = act.nx + dx / cam.z, y = act.ny + dy / cam.z;
        if (grid) { x = snap(x); y = snap(y); }
        const mx = Math.round(x) - act.nx, my = Math.round(y) - act.ny;
        for (const g of act.group || [{ n: act.n, x: act.nx, y: act.ny, el: act.el }]) {
          g.n.x = g.x + mx;
          g.n.y = g.y + my;
          if (g.el) { g.el.style.left = `${g.n.x}px`; g.el.style.top = `${g.n.y}px`; g.el.classList.add('dragging'); }
        }
        drawLines();
      } else if (act.type === 'link') {
        const a = box(node(act.from)), w = toWorld(e.clientX, e.clientY);
        const p = linkPath(a, { x: w.x - 1, y: w.y - 1, w: 2, h: 2 });
        frame(temp, [a, { x: a.x + a.w, y: a.y + a.h }, w]);
        temp.style.display = '';
        tempPath.setAttribute('d', p.d);
        for (const c of cards.children) c.classList.toggle('target', c.dataset.id !== act.from && c.contains(document.elementFromPoint(e.clientX, e.clientY)));
      }
    };
    const tempEnd = () => {
      temp.style.display = 'none';
      for (const c of cards.querySelectorAll('.target')) c.classList.remove('target');
    };
    const onUp = (e) => {
      if (!pts.has(e.pointerId)) return;
      pts.delete(e.pointerId);
      const a = act;
      if (!a) return;
      if (a.type === 'pinch') { if (pts.size < 2) act = null; return; }
      if (e.pointerId !== a.id) return;
      clearTimeout(a.hold);
      act = null;
      if (a.type === 'draw') {
        cancelAnimationFrame(a.raf);
        a.live.remove();
        const pts = simplifyInk(a.pts, Math.max(0.3, 0.6 / cam.z));
        if (pts.length < 2) return;
        keepInkUndo();
        board.strokes = [...strokesOf(), { id: newId('s'), color: pen.color, width: a.width, pts }];
        drawInk();
        changed();
        return;
      }
      if (a.type === 'erase') {
        if (strokesOf() !== a.before) { inkUndo.push(a.before); if (inkUndo.length > 60) inkUndo.shift(); changed(); }
        return;
      }
      if (a.type === 'tap') { a.run(); return; }
      if (a.type === 'band') {
        a.band.remove();
        multi.clear();
        for (const id of a.hits || a.keep) multi.add(id);
        sel = null;
        draw();
        tellMulti();
        return;
      }
      if (a.type === 'pan') {
        if (!a.moved && (sel || multi.size)) { sel = null; const had = multi.size; multi.clear(); draw(); if (had) tellMulti(); } else placeQuick();
        return;
      }
      if (a.type === 'card') {
        a.el.classList.remove('lifted');
        space.classList.remove('snapping');
        if (a.moved && a.group) { changed(); draw(); o.onMovedMany?.(a.group.map((g) => ({ id: g.n.id, x: g.x, y: g.y }))); return; }
        if (a.moved) { sel = a.n.id; changed(); draw(); return; }
        // Shift+click: in or out of the cards picked together (the one picked on its own joins them).
        if (a.shift) {
          if (sel && sel !== a.n.id && !multi.size) multi.add(sel);
          if (multi.has(a.n.id)) multi.delete(a.n.id); else multi.add(a.n.id);
          sel = null;
          draw();
          tellMulti();
          return;
        }
        // A plain click: just this card, the others let go.
        if (multi.size) { multi.clear(); draw(); tellMulti(); }
        if (a.lifted) { placeQuick(); return; } // held and let go: picked, with its options
        if (sel === a.n.id) o.onOpen?.(a.n); // a tap on the card picked: open it
        else pickCard(a.n.id);
        return;
      }
      if (a.type === 'link') {
        tempEnd();
        if (!a.moved) { after(a.from); return; }
        const over = document.elementFromPoint(e.clientX, e.clientY)?.closest?.('.wb-card');
        if (over && over.dataset.id !== a.from) {
          if (join(a.from, over.dataset.id)) { changed(); draw(); }
          return;
        }
        const w = toWorld(e.clientX, e.clientY);
        after(a.from, { x: w.x - KINDS.step.w / 2, y: w.y - 30 });
      }
    };
    const onCancel = (e) => {
      pts.delete(e.pointerId);
      clearTimeout(act?.hold);
      if (act?.type === 'link') tempEnd();
      if (act?.type === 'draw') act.live.remove();
      if (act?.type === 'erase' && strokesOf() !== act.before) { inkUndo.push(act.before); changed(); }
      if (act?.type === 'band') act.band.remove();
      if (act?.type === 'card') { act.el.classList.remove('lifted'); space.classList.remove('snapping'); if (act.moved) { changed(); draw(); } }
      act = null;
      placeQuick();
    };
    addEventListener('pointermove', onMove);
    addEventListener('pointerup', onUp);
    addEventListener('pointercancel', onCancel);
    space.addEventListener('dblclick', (e) => {
      if (tool !== 'move') return;
      const card = e.target.closest('.wb-card');
      if (card && !e.target.closest('.wb-plus, .wb-way, .wb-check')) o.onOpen?.(node(card.dataset.id));
      else if (!card && !e.target.closest('.wb-label')) { const w = toWorld(e.clientX, e.clientY); add('step', { x: w.x - KINDS.step.w / 2, y: w.y - 30 }); o.onOpen?.(node(sel)); }
    });
    // The browser scrolls the board itself to show a card that takes the focus (a click, Tab) when it is partly out of
    // sight, which would put the cards out of step with the view: the scroll becomes a move of the view instead.
    space.addEventListener('scroll', () => {
      if (!space.scrollLeft && !space.scrollTop) return;
      cam = { ...cam, x: cam.x - space.scrollLeft, y: cam.y - space.scrollTop };
      space.scrollLeft = 0;
      space.scrollTop = 0;
      apply();
    });
    space.addEventListener('wheel', (e) => {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * 0.01));
      else { cam.x -= e.deltaX; cam.y -= e.deltaY; apply(); }
    }, { passive: false });
    const onKey = (e) => {
      if (!multi.size || !space.isConnected || !space.offsetParent || e.target.closest?.('input, textarea, select, [contenteditable]')) return;
      if ((e.key === 'Delete' || e.key === 'Backspace') && o.onDeleteMany) { e.preventDefault(); o.onDeleteMany(multiNodes()); }
    };
    addEventListener('keydown', onKey);
    space.addEventListener('keydown', (e) => {
      const card = e.target.closest?.('.wb-card');
      if (!card || multi.size) return;
      if (e.key === 'Enter') { e.preventDefault(); o.onOpen?.(node(card.dataset.id)); }
      else if ((e.key === 'Delete' || e.key === 'Backspace') && o.onDelete) { e.preventDefault(); o.onDelete(node(card.dataset.id)); }
    });

    function choose(nodeId, linkId) {
      const n = node(nodeId);
      if (!n) return;
      n.chosen = n.chosen === linkId ? null : linkId;
      changed();
      draw();
    }

    /** The whole board in view (zoomed out as far as needed, never in past full size). */
    function fit() {
      if (!board.nodes.length && !strokesOf().length) { cam = { x: 40, y: 40, z: 1 }; apply(); return; }
      const r = space.getBoundingClientRect();
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const n of board.nodes) { const b = box(n); x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y); x1 = Math.max(x1, b.x + b.w); y1 = Math.max(y1, b.y + b.h); }
      for (const st of strokesOf()) for (let i = 0; i + 1 < st.pts.length; i += 2) { x0 = Math.min(x0, st.pts[i]); x1 = Math.max(x1, st.pts[i]); y0 = Math.min(y0, st.pts[i + 1]); y1 = Math.max(y1, st.pts[i + 1]); }
      const pad = 40;
      const z = Math.max(0.25, Math.min(1, (r.width - pad * 2) / (x1 - x0 || 1), (r.height - pad * 2) / (y1 - y0 || 1)));
      // Too small to read (a phone, a wide board): readable instead, from its left edge, to be moved along.
      // (A board taller than the view starts at its top, where its columns begin.)
      if (z < 0.55) cam = { x: pad - x0 * 0.55, y: (y1 - y0) * 0.55 > r.height - pad * 2 ? pad - y0 * 0.55 : (r.height - (y1 - y0) * 0.55) / 2 - y0 * 0.55, z: 0.55 };
      else cam = { x: (r.width - (x1 - x0) * z) / 2 - x0 * z, y: (r.height - (y1 - y0) * z) / 2 - y0 * z, z };
      apply();
    }

    const api = {
      draw,
      add,
      after,
      fit,
      zoom: (k) => { const r = space.getBoundingClientRect(); zoomAt(r.left + r.width / 2, r.top + r.height / 2, k); },
      select: (id) => { sel = id; draw(); },
      /** Moves the view just enough that a card is in sight (`bottom`: px covered at the foot, the phone's panel). */
      reveal: (id, { bottom = 0 } = {}) => {
        const n = node(id);
        if (!n) return;
        const r = space.getBoundingClientRect(), b = box(n), m = 24;
        const sx = cam.x + b.x * cam.z, sy = cam.y + b.y * cam.z, sw = b.w * cam.z, sh = b.h * cam.z;
        let dx = 0, dy = 0;
        if (sx + sw > r.width - m) dx = r.width - m - (sx + sw);
        if (sx + dx < m) dx = m - sx;
        if (sy + sh > r.height - bottom - m) dy = r.height - bottom - m - (sy + sh);
        if (sy + dy < m) dy = m - sy;
        if (dx || dy) { cam = { ...cam, x: cam.x + dx, y: cam.y + dy }; apply(); }
      },
      selected: () => node(sel),
      setBoard: (b, c) => { board = b; sel = null; multi.clear(); inkUndo.length = 0; if (c) cam = { ...cam, ...c }; draw(); },
      /** What a press on the board does: 'move', 'pen' or 'eraser'. */
      setTool: (t) => {
        tool = ['pen', 'eraser'].includes(t) ? t : 'move';
        space.classList.toggle('drawing', tool !== 'move');
        space.dataset.tool = tool;
        if (tool !== 'move' && sel) { sel = null; draw(); } // a card picked is put down while drawing
      },
      tool: () => tool,
      setPen: (p) => { pen = { ...pen, ...(p || {}) }; },
      /** The drawing back as it was before the last stroke, rub or clear. False when there is nothing to undo. */
      undoInk: () => { if (!inkUndo.length) return false; board.strokes = inkUndo.pop(); drawInk(); changed(); return true; },
      canUndoInk: () => inkUndo.length > 0,
      clearInk: () => { if (!strokesOf().length) return false; keepInkUndo(); board.strokes = []; drawInk(); changed(); return true; },
      inkCount: () => strokesOf().length,
      /** The cards picked together (Shift), and letting them go. */
      picked: () => multiNodes(),
      clearPicked: () => { if (!multi.size) return false; multi.clear(); draw(); tellMulti(); return true; },
      /** Puts cards back where they were (undo of moving several): [{ id, x, y }]. */
      placeAt: (spots) => { for (const p of spots || []) { const n = node(p.id); if (n) { n.x = p.x; n.y = p.y; } } changed(); draw(); },
      setRoute: (on) => { showRoute = !!on; draw(); },
      destroy: () => { removeEventListener('keydown', onKey); removeEventListener('pointermove', onMove); removeEventListener('pointerup', onUp); removeEventListener('pointercancel', onCancel); },
    };
    draw();
    return api;
  }

  const api = { KINDS, NOTE_COLORS, route, planSteps, backToBack, branchName, linkPath, lengthText, newBoard, newId, fromList, rowsOf, mount, inkPath, simplifyInk, eraseInk, hsvToHex, hexToHsv, GRID, snap, inBand };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else globalThis.OnyxBoards = api;
})();
