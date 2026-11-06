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
    const sideways = Math.abs(dx) * (a.h + b.h) >= Math.abs(dy) * (a.w + b.w);
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
    world.append(lines, labels, cards, temp);
    space.replaceChildren(world);
    temp.style.display = 'none';
    const sizes = new Map();

    const apply = () => {
      world.style.transform = `translate(${Math.round(cam.x)}px, ${Math.round(cam.y)}px) scale(${cam.z})`;
      space.style.setProperty('--z', String(cam.z));
      o.onCam?.({ ...cam });
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
      const c = el('div', `wb-card k-${n.kind}${n.done ? ' done' : ''}${sel === n.id ? ' sel' : ''}${off ? ' off' : ''}${open ? ' open' : ''}${showRoute && r.order.includes(n.id) ? ' on' : ''}`);
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
      cards.replaceChildren(...board.nodes.map((n) => cardEl(n, r)));
      measure();
      drawLines(r);
      apply();
      o.onDraw?.(r);
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
    space.addEventListener('pointerdown', (e) => {
      if (e.button > 0) return;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size === 2) {
        const p = pinchInfo();
        tempEnd();
        act = { type: 'pinch', d0: p.d, z0: cam.z, w: toWorld(p.x, p.y) };
        return;
      }
      if (pts.size > 2) return;
      const t = e.target;
      if (t.closest('input, textarea, select')) return;
      const card = t.closest('.wb-card');
      const base = { x0: e.clientX, y0: e.clientY, moved: false, id: e.pointerId };
      if (t.closest('.wb-way')) { const w = t.closest('.wb-way'); act = { ...base, type: 'tap', run: () => choose(w.dataset.node, w.dataset.link) }; }
      else if (t.closest('.wb-plus') && card) act = { ...base, type: 'link', from: card.dataset.id };
      else if (card) { const n = node(card.dataset.id); act = { ...base, type: 'card', n, nx: n.x, ny: n.y, el: card }; }
      else if (t.closest('.wb-label, .wb-hit')) { const l = t.closest('[data-link]'); act = { ...base, type: 'tap', run: () => o.onOpenLink?.(board.links.find((x) => x.id === l.dataset.link), l.getBoundingClientRect()) }; }
      else act = { ...base, type: 'pan', cx: cam.x, cy: cam.y };
      if (act.type !== 'tap') e.preventDefault();
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
      const dx = e.clientX - act.x0, dy = e.clientY - act.y0;
      if (!act.moved && Math.hypot(dx, dy) > 5) act.moved = true;
      if (!act.moved) return;
      if (act.type === 'tap') { act = null; return; }
      if (act.type === 'pan') { cam.x = act.cx + dx; cam.y = act.cy + dy; apply(); }
      else if (act.type === 'card') {
        act.n.x = Math.round(act.nx + dx / cam.z);
        act.n.y = Math.round(act.ny + dy / cam.z);
        act.el.style.left = `${act.n.x}px`;
        act.el.style.top = `${act.n.y}px`;
        act.el.classList.add('dragging');
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
      act = null;
      if (a.type === 'tap') { a.run(); return; }
      if (a.type === 'pan') { if (!a.moved && sel) { sel = null; draw(); } return; }
      if (a.type === 'card') {
        if (a.moved) { changed(); draw(); return; }
        if (sel === a.n.id) o.onOpen?.(a.n); // a tap on the card picked: open it
        else { sel = a.n.id; draw(); }
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
    const onCancel = (e) => { pts.delete(e.pointerId); if (act?.type === 'link') tempEnd(); if (act?.type === 'card' && act.moved) { changed(); draw(); } act = null; };
    addEventListener('pointermove', onMove);
    addEventListener('pointerup', onUp);
    addEventListener('pointercancel', onCancel);
    space.addEventListener('dblclick', (e) => {
      const card = e.target.closest('.wb-card');
      if (card && !e.target.closest('.wb-plus, .wb-way')) o.onOpen?.(node(card.dataset.id));
      else if (!card && !e.target.closest('.wb-label')) { const w = toWorld(e.clientX, e.clientY); add('step', { x: w.x - KINDS.step.w / 2, y: w.y - 30 }); o.onOpen?.(node(sel)); }
    });
    space.addEventListener('wheel', (e) => {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * 0.01));
      else { cam.x -= e.deltaX; cam.y -= e.deltaY; apply(); }
    }, { passive: false });
    space.addEventListener('keydown', (e) => {
      const card = e.target.closest?.('.wb-card');
      if (!card) return;
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
      if (!board.nodes.length) { cam = { x: 40, y: 40, z: 1 }; apply(); return; }
      const r = space.getBoundingClientRect();
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const n of board.nodes) { const b = box(n); x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y); x1 = Math.max(x1, b.x + b.w); y1 = Math.max(y1, b.y + b.h); }
      const pad = 40;
      const z = Math.max(0.25, Math.min(1, (r.width - pad * 2) / (x1 - x0 || 1), (r.height - pad * 2) / (y1 - y0 || 1)));
      // Too small to read (a phone, a wide board): readable instead, from its left edge, to be moved along.
      if (z < 0.55) cam = { x: pad - x0 * 0.55, y: (r.height - (y1 - y0) * 0.55) / 2 - y0 * 0.55, z: 0.55 };
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
      selected: () => node(sel),
      setBoard: (b, c) => { board = b; sel = null; if (c) cam = { ...cam, ...c }; draw(); },
      setRoute: (on) => { showRoute = !!on; draw(); },
      destroy: () => { removeEventListener('pointermove', onMove); removeEventListener('pointerup', onUp); removeEventListener('pointercancel', onCancel); },
    };
    draw();
    return api;
  }

  const api = { KINDS, NOTE_COLORS, route, planSteps, backToBack, branchName, linkPath, lengthText, newBoard, newId, mount };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else globalThis.OnyxBoards = api;
})();
