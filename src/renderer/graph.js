// The 3D graph view: entries orbit around cluster hubs (a tag, a calendar or a
// day), drawn on a plain canvas with a small 3D force simulation.
//
//   OnyxGraph.build(items, options)  -> { nodes, links }
//   OnyxGraph.create(canvas, { onPick })  -> { setData, resetCamera, destroy }
/* exported OnyxGraph */
(() => {
  'use strict';

  const UNTAGGED = '#5a5a64';

  /**
   * items: [{ id, title, color, calendarId, calendarName, tags, start, allDay, kind }]
   * groupBy: 'tags' | 'calendars' | 'days'
   */
  function build(items, { groupBy, tagColor, dayLabel }) {
    const nodes = [];
    const links = [];
    const hubs = new Map();
    const hubFor = (key, label, color, order = 0) => {
      if (!hubs.has(key)) {
        const hub = { id: `hub:${key}`, hub: true, label, color, count: 0, order };
        hubs.set(key, hub);
        nodes.push(hub);
      }
      return hubs.get(key);
    };

    for (const item of items) {
      const node = { id: item.id, hub: false, label: item.title, color: item.color, item };
      nodes.push(node);
      let groups;
      if (groupBy === 'tags') {
        groups = item.tags.length
          ? item.tags.map((t) => [`tag:${t.toLowerCase()}`, `#${t}`, tagColor(t)])
          : [['untagged', 'Untagged', UNTAGGED]];
        node.color = item.tags.length ? tagColor(item.tags[0]) : '#8a8a94';
      } else if (groupBy === 'calendars') {
        groups = [[`cal:${item.calendarId}`, item.calendarName, item.color]];
      } else {
        const key = item.start ? dayKey(item) : 'none';
        groups = [[`day:${key}`, item.start ? dayLabel(key) : 'No date', '#c9c9d2', item.start ? Date.parse(`${key}T00:00`) : Infinity]];
      }
      for (const [key, label, color, order] of groups) {
        const hub = hubFor(key, label, color, order);
        hub.count++;
        links.push({ a: node, b: hub, len: 42, k: 0.06 });
      }
    }

    // Days are strung together in order, like a timeline running through the cloud.
    if (groupBy === 'days') {
      const days = [...hubs.values()].filter((h) => Number.isFinite(h.order)).sort((x, y) => x.order - y.order);
      for (let i = 1; i < days.length; i++) links.push({ a: days[i - 1], b: days[i], len: 120, k: 0.05, spine: true });
    }
    return { nodes, links };
  }

  // The local calendar day an item falls on.
  function dayKey(item) {
    if (item.allDay || item.start.length === 10) return item.start.slice(0, 10);
    const d = new Date(item.start);
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  const rgba = (hex, a) => {
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  };

  function create(canvas, { onPick } = {}) {
    const ctx = canvas.getContext('2d');
    let nodes = [];
    let links = [];
    let neighbours = new Map(); // node id -> ids it is linked to
    let alpha = 1;
    let width = 0, height = 0, dpr = 1;

    // Camera: orbit angles, distance, and a point it looks at (flies to a picked cluster).
    const cam = { yaw: 0.6, pitch: -0.35, dist: 760, focal: 640, look: { x: 0, y: 0, z: 0 }, goal: null };
    let hover = null;
    let focus = null;     // a hub whose cluster is highlighted
    let lastInput = 0;
    let spin = { yaw: 0, pitch: 0 };
    const pointers = new Map();
    let drag = null;
    let raf = 0;

    // A faint field of dust far behind everything, which makes the rotation readable.
    const dust = Array.from({ length: 260 }, () => {
      const r = 900 + Math.random() * 900, t = Math.random() * Math.PI * 2, p = Math.acos(2 * Math.random() - 1);
      return { x: r * Math.sin(p) * Math.cos(t), y: r * Math.sin(p) * Math.sin(t), z: r * Math.cos(p), s: Math.random() };
    });

    function setData(data) {
      const old = new Map(nodes.map((n) => [n.id, n]));
      nodes = data.nodes;
      links = data.links;
      for (const n of nodes) {
        const prev = old.get(n.id);
        if (prev) Object.assign(n, { x: prev.x, y: prev.y, z: prev.z, vx: 0, vy: 0, vz: 0 });
        else {
          const r = (n.hub ? 260 : 320) * Math.cbrt(Math.random());
          const t = Math.random() * Math.PI * 2, p = Math.acos(2 * Math.random() - 1);
          Object.assign(n, { x: r * Math.sin(p) * Math.cos(t), y: r * Math.sin(p) * Math.sin(t), z: r * Math.cos(p), vx: 0, vy: 0, vz: 0 });
        }
        n.mass = n.hub ? 3 + Math.sqrt(n.count) : 1;
      }
      // Items start next to their first hub, so clusters form quickly instead of untangling.
      for (const l of links) {
        if (!l.a.hub && !old.has(l.a.id) && l.b.hub && !l.a.placed) {
          l.a.placed = true;
          l.a.x = l.b.x + (Math.random() - 0.5) * 80;
          l.a.y = l.b.y + (Math.random() - 0.5) * 80;
          l.a.z = l.b.z + (Math.random() - 0.5) * 80;
        }
      }
      neighbours = new Map();
      for (const l of links) {
        if (!neighbours.has(l.a.id)) neighbours.set(l.a.id, new Set());
        if (!neighbours.has(l.b.id)) neighbours.set(l.b.id, new Set());
        neighbours.get(l.a.id).add(l.b.id);
        neighbours.get(l.b.id).add(l.a.id);
      }
      if (focus && !nodes.includes(focus)) focus = null;
      if (focus) focus = nodes.find((n) => n.id === focus.id) || null;
      alpha = 1;
    }

    // ------------------------------------------------------------ physics

    function tick() {
      if (alpha < 0.004) return;
      const n = nodes.length;
      const repel = 2600;
      for (let i = 0; i < n; i++) {
        const a = nodes[i];
        for (let j = i + 1; j < n; j++) {
          const b = nodes[j];
          const dx = a.x - b.x, dy = a.y - b.y, dz = a.z - b.z;
          const d2 = dx * dx + dy * dy + dz * dz + 25;
          if (d2 > 250000) continue;
          const f = (repel * a.mass * b.mass) / (d2 * Math.sqrt(d2)) * alpha;
          a.vx += dx * f / a.mass; a.vy += dy * f / a.mass; a.vz += dz * f / a.mass;
          b.vx -= dx * f / b.mass; b.vy -= dy * f / b.mass; b.vz -= dz * f / b.mass;
        }
      }
      for (const l of links) {
        const { a, b } = l;
        const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
        const f = (d - l.len) / d * l.k * alpha;
        const wa = b.mass / (a.mass + b.mass), wb = a.mass / (a.mass + b.mass);
        a.vx += dx * f * wa; a.vy += dy * f * wa; a.vz += dz * f * wa;
        b.vx -= dx * f * wb; b.vy -= dy * f * wb; b.vz -= dz * f * wb;
      }
      for (const p of nodes) {
        const g = (p.hub ? 0.004 : 0.0015) * alpha;
        p.vx -= p.x * g; p.vy -= p.y * g; p.vz -= p.z * g;
        p.vx *= 0.82; p.vy *= 0.82; p.vz *= 0.82;
        p.x += p.vx; p.y += p.vy; p.z += p.vz;
      }
      alpha *= 0.975; // settles in about three seconds, so things hold still to be clicked
    }

    // ------------------------------------------------------------ drawing

    function project(p) {
      const x0 = p.x - cam.look.x, y0 = p.y - cam.look.y, z0 = p.z - cam.look.z;
      const cy = Math.cos(cam.yaw), sy = Math.sin(cam.yaw);
      const x1 = x0 * cy - z0 * sy, z1 = x0 * sy + z0 * cy;
      const cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch);
      const y2 = y0 * cp - z1 * sp, z2 = y0 * sp + z1 * cp;
      const depth = z2 + cam.dist;
      const s = cam.focal / Math.max(depth, 1);
      return { x: width / 2 + x1 * s, y: height / 2 + y2 * s, s, depth };
    }

    const lit = (n) => !focus || n === focus || neighbours.get(focus.id)?.has(n.id);
    const hoverNear = (n) => hover && (n === hover || neighbours.get(hover.id)?.has(n.id));

    function draw() {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);
      const glow = ctx.createRadialGradient(width / 2, height / 2, 0, width / 2, height / 2, Math.max(width, height) * 0.7);
      glow.addColorStop(0, 'rgba(139,124,255,0.055)');
      glow.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, width, height);

      for (const d of dust) {
        const p = project({ x: d.x + cam.look.x, y: d.y + cam.look.y, z: d.z + cam.look.z });
        if (p.depth < 50) continue;
        ctx.fillStyle = `rgba(255,255,255,${0.05 + d.s * 0.12})`;
        ctx.fillRect(p.x, p.y, 1.2, 1.2);
      }

      for (const n of nodes) n.p = project(n);
      const fade = (p) => Math.max(0.18, Math.min(1, 1.55 - p.depth / (cam.dist * 1.5)));

      ctx.lineCap = 'round';
      for (const l of links) {
        const pa = l.a.p, pb = l.b.p;
        if (pa.depth < 10 || pb.depth < 10) continue;
        const on = lit(l.a) && lit(l.b);
        const hot = hover && (l.a === hover || l.b === hover);
        const color = l.b.hub ? l.b.color : l.a.color;
        ctx.strokeStyle = rgba(color, (hot ? 0.75 : l.spine ? 0.35 : on ? 0.2 : 0.04) * fade(pa));
        ctx.lineWidth = (l.spine ? 1.6 : hot ? 1.4 : 0.9) * Math.min(pa.s, 1.6);
        ctx.beginPath();
        ctx.moveTo(pa.x, pa.y);
        ctx.lineTo(pb.x, pb.y);
        ctx.stroke();
      }

      const order = nodes.filter((n) => n.p.depth > 10).sort((x, y) => y.p.depth - x.p.depth);
      const few = nodes.length < 70;
      for (const n of order) {
        const { p } = n;
        const on = lit(n);
        const a = fade(p) * (on ? 1 : 0.16);
        const r = (n.hub ? 6 + Math.sqrt(n.count) * 2.2 : 3.2) * p.s;
        if (n.hub || n === hover) {
          const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r * 3.2);
          g.addColorStop(0, rgba(n.color, 0.42 * a));
          g.addColorStop(1, rgba(n.color, 0));
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(p.x, p.y, r * 3.2, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.fillStyle = rgba(n.color, a);
        ctx.beginPath();
        ctx.arc(p.x, p.y, Math.max(r, 1.2), 0, Math.PI * 2);
        ctx.fill();
        if (n.hub) {
          ctx.fillStyle = `rgba(0,0,0,${0.55 * a})`;
          ctx.beginPath();
          ctx.arc(p.x, p.y, Math.max(r * 0.42, 1), 0, Math.PI * 2);
          ctx.fill();
        }
        if (n === hover || n === focus) {
          ctx.strokeStyle = 'rgba(255,255,255,0.9)';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(p.x, p.y, r + 4, 0, Math.PI * 2);
          ctx.stroke();
        }

        const labelled = n.hub || n === hover || hoverNear(n) || (focus && on) || (few && p.s > 0.95) || p.s > 1.5;
        if (labelled && a > 0.2) {
          const size = n.hub ? Math.min(15, 10.5 + p.s * 2.5) : Math.min(13, 9.5 + p.s * 2);
          ctx.font = `${n.hub ? 600 : 500} ${size}px "Segoe UI Variable Text","Segoe UI",Inter,Roboto,system-ui,sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'top';
          const text = n.label.length > 34 ? `${n.label.slice(0, 33)}…` : n.label;
          const y = p.y + r + 5;
          ctx.fillStyle = `rgba(0,0,0,${0.7 * a})`;
          ctx.fillText(text, p.x + 1, y + 1);
          ctx.fillStyle = n.hub ? `rgba(242,242,246,${a})` : `rgba(200,200,210,${a})`;
          ctx.fillText(text, p.x, y);
          if (n.hub) {
            ctx.font = `500 ${size - 2}px "Segoe UI",Inter,Roboto,system-ui,sans-serif`;
            ctx.fillStyle = `rgba(140,140,150,${a})`;
            ctx.fillText(String(n.count), p.x, y + size + 2);
          }
        }
      }
    }

    function frame() {
      tick();
      const idle = performance.now() - lastInput > 2500 && !drag;
      if (drag) {
        // nothing: the pointer is steering
      } else if (Math.abs(spin.yaw) > 0.0001 || Math.abs(spin.pitch) > 0.0001) {
        cam.yaw += spin.yaw; cam.pitch = clampPitch(cam.pitch + spin.pitch);
        spin.yaw *= 0.94; spin.pitch *= 0.94;
      } else if (idle) {
        cam.yaw += 0.0016;
      }
      const goal = focus ? focus : { x: 0, y: 0, z: 0 };
      cam.look.x += (goal.x - cam.look.x) * 0.07;
      cam.look.y += (goal.y - cam.look.y) * 0.07;
      cam.look.z += (goal.z - cam.look.z) * 0.07;
      if (cam.goal) {
        cam.dist += (cam.goal - cam.dist) * 0.08;
        if (Math.abs(cam.goal - cam.dist) < 1) cam.goal = null;
      }
      draw();
      raf = requestAnimationFrame(frame);
    }

    const clampPitch = (v) => Math.max(-1.45, Math.min(1.45, v));

    // ------------------------------------------------------------ input

    function pick(x, y) {
      let best = null, bestD = Infinity;
      for (const n of nodes) {
        if (!n.p || n.p.depth < 10) continue;
        const r = (n.hub ? 6 + Math.sqrt(n.count) * 2.2 : 3.2) * n.p.s + 7;
        const d = Math.hypot(n.p.x - x, n.p.y - y);
        if (d < r && d - r < bestD) { best = n; bestD = d - r; }
      }
      return best;
    }

    const local = (e) => { const b = canvas.getBoundingClientRect(); return { x: e.clientX - b.left, y: e.clientY - b.top }; };

    function onDown(e) {
      canvas.setPointerCapture(e.pointerId);
      pointers.set(e.pointerId, local(e));
      lastInput = performance.now();
      spin = { yaw: 0, pitch: 0 };
      if (pointers.size === 1) drag = { start: local(e), last: local(e), moved: 0, t: performance.now() };
      else drag = { pinch: pinchDistance(), dist: cam.dist, moved: 99 };
    }

    function pinchDistance() {
      const [a, b] = [...pointers.values()];
      return Math.hypot(a.x - b.x, a.y - b.y) || 1;
    }

    function onMove(e) {
      const pt = local(e);
      if (!pointers.has(e.pointerId)) {
        // Hovering holds the slow spin, so whatever is under the pointer stays put to be clicked.
        if (e.pointerType === 'mouse') lastInput = performance.now();
        const h = pick(pt.x, pt.y);
        if (h !== hover) { hover = h; canvas.style.cursor = h ? 'pointer' : 'grab'; }
        return;
      }
      pointers.set(e.pointerId, pt);
      lastInput = performance.now();
      if (drag?.pinch) {
        cam.goal = null;
        cam.dist = Math.max(140, Math.min(2600, drag.dist * drag.pinch / pinchDistance()));
        return;
      }
      if (!drag) return;
      const dx = pt.x - drag.last.x, dy = pt.y - drag.last.y;
      drag.moved += Math.abs(dx) + Math.abs(dy);
      drag.last = pt;
      cam.yaw += dx * 0.006;
      cam.pitch = clampPitch(cam.pitch + dy * 0.006);
      spin = { yaw: dx * 0.006, pitch: dy * 0.006 };
      canvas.style.cursor = 'grabbing';
    }

    function onUp(e) {
      const pt = local(e);
      pointers.delete(e.pointerId);
      const d = drag;
      drag = pointers.size === 1 ? { start: [...pointers.values()][0], last: [...pointers.values()][0], moved: 99 } : null;
      canvas.style.cursor = hover ? 'pointer' : 'grab';
      if (!d || d.moved > 6) return;
      spin = { yaw: 0, pitch: 0 };
      const n = pick(pt.x, pt.y);
      if (!n) { focus = null; return; }
      if (n.hub) {
        focus = focus === n ? null : n;
        if (focus) cam.goal = Math.max(260, Math.min(cam.dist, 520));
        return;
      }
      const b = canvas.getBoundingClientRect();
      const r = { left: b.left + n.p.x - 6, right: b.left + n.p.x + 6, top: b.top + n.p.y - 6, bottom: b.top + n.p.y + 6 };
      if (onPick) onPick(n.item, r);
    }

    function onWheel(e) {
      e.preventDefault();
      lastInput = performance.now();
      cam.goal = null;
      cam.dist = Math.max(140, Math.min(2600, cam.dist * Math.exp(e.deltaY * 0.0012)));
    }

    function onLeave() { if (!drag) hover = null; }

    function resize() {
      const b = canvas.getBoundingClientRect();
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = b.width; height = b.height;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      cam.focal = Math.min(width, height) * (width < 600 ? 1.55 : 0.95); // phones: start closer in
    }

    function resetCamera() {
      focus = null;
      cam.yaw = 0.6; cam.pitch = -0.35; cam.goal = 760;
      spin = { yaw: 0, pitch: 0 };
    }

    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onUp);
    canvas.addEventListener('pointerleave', onLeave);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('dblclick', resetCamera);
    canvas.style.cursor = 'grab';
    canvas.style.touchAction = 'none';
    resize();
    raf = requestAnimationFrame(frame);

    return {
      setData,
      resetCamera,
      destroy() {
        cancelAnimationFrame(raf);
        observer.disconnect();
        canvas.replaceWith(canvas.cloneNode(false));
      },
    };
  }

  window.OnyxGraph = { build, create };
})();
