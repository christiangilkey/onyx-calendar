// The 3D graph view: entries orbit around cluster hubs (a tag, a calendar or a
// day), drawn on a plain canvas with a small 3D force simulation.
//
//   OnyxGraph.build(items, options)  -> { nodes, links }
//   OnyxGraph.create(canvas, { onPick })  -> { setData, resetCamera, setInsets, destroy }
/* exported OnyxGraph */
(() => {
  'use strict';

  const UNTAGGED = '#5a5a64';

  /**
   * items: [{ id, title, color, calendarId, calendarName, tags, start, allDay, kind, shape?, home?, source? }]
   * groupBy: 'tags' | 'calendars' | 'days'
   * shape: 'diamond' (notes), 'square' (documents) or 'goal' (a ring showing `progress`, 0..1); circles otherwise.
   * home:   [key, label, colour], the cluster an item starts in when it has no tag:
   *         Overdue / Today / Tomorrow / a day / No date for tasks; Notes, Notion or Drive.
   * source: [key, label, colour], used instead of the calendar when grouping by source
   *         (and for undated items when grouping by day): Notes, Notion, Drive.
   * Every hub carries its `key`, which is what a drag-and-drop on the globe reports.
   */
  function build(items, { groupBy, tagColor, dayLabel }) {
    const nodes = [];
    const links = [];
    const hubs = new Map();
    const hubFor = (key, label, color, order = 0) => {
      if (!hubs.has(key)) {
        const hub = { id: `hub:${key}`, key, hub: true, label, color, count: 0, order };
        hubs.set(key, hub);
        nodes.push(hub);
      }
      return hubs.get(key);
    };
    const place = ([key, label, color, order = Infinity], prefix) => [`${prefix}:${key}`, label, color, order];

    for (const item of items) {
      const node = { id: item.id, hub: false, label: item.title, color: item.color, shape: item.shape, item };
      nodes.push(node);
      let groups;
      if (groupBy === 'tags') {
        groups = item.tags.length
          ? item.tags.map((t) => [`tag:${t.toLowerCase()}`, `#${t}`, tagColor(t)])
          : [item.home ? place(item.home, 'home') : ['untagged', 'Untagged', UNTAGGED]];
        node.color = item.tags.length ? tagColor(item.tags[0]) : item.home ? item.color : '#8a8a94';
      } else if (groupBy === 'calendars') {
        groups = [item.source ? place(item.source, 'home') : [`cal:${item.calendarId}`, item.calendarName, item.color]];
      } else if (item.start) {
        const key = dayKey(item);
        groups = [[`day:${key}`, dayLabel(key), '#c9c9d2', Date.parse(`${key}T00:00`)]];
      } else {
        groups = [item.source ? place(item.source, 'home') : ['day:none', 'No date', '#c9c9d2', Infinity]];
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

  /**
   * onPick(item, rect): an item was clicked.
   * onMove(item, toKey, fromKey, toLabel): an item was dragged onto another cluster's hub.
   */
  function create(canvas, { onPick } = {}) {
    const ctx = canvas.getContext('2d');
    let nodes = [];
    let links = [];
    let neighbours = new Map(); // node id -> ids it is linked to
    let alpha = 1;
    let width = 0, height = 0, dpr = 1;
    // What covers the canvas at the top (the toolbar) and bottom (the footer), so the globe
    // sits in the middle of what is left. `midY` eases to it when the toolbar folds or opens.
    const insets = { top: 0, bottom: 0 };
    let midY = null;
    const targetMidY = () => insets.top + Math.max(0, height - insets.top - insets.bottom) / 2;

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

    // The globe: cluster hubs live on the surface of a sphere of this radius, and
    // their entries gather around them in little balls of their own. An entry with
    // several tags is pulled between its hubs, through the inside of the globe.
    let sphere = 0;      // radius the hubs are held to (0: a single hub sits in the middle)
    let globe = 220;     // radius of the wireframe drawn around everything (eased)

    const randomDir = () => {
      const t = Math.random() * Math.PI * 2, u = 2 * Math.random() - 1, r = Math.sqrt(1 - u * u);
      return { x: r * Math.cos(t), y: u, z: r * Math.sin(t) };
    };

    function setData(data) {
      const old = new Map(nodes.map((n) => [n.id, n]));
      nodes = data.nodes;
      links = data.links;
      const hubs = nodes.filter((n) => n.hub);
      sphere = hubs.length <= 1 ? 0 : 150 + 42 * Math.sqrt(hubs.length);
      const spine = links.some((l) => l.spine);
      // Hubs are spread evenly over the sphere (a Fibonacci lattice); days go round the equator, in order.
      const ordered = spine ? [...hubs].sort((x, y) => x.order - y.order) : hubs;
      ordered.forEach((h, i) => {
        const prev = old.get(h.id);
        if (prev) { Object.assign(h, { x: prev.x, y: prev.y, z: prev.z }); return; }
        let dir;
        if (spine) {
          const a = (i / ordered.length) * Math.PI * 2;
          dir = { x: Math.cos(a), y: Math.sin(a * 3) * 0.18, z: Math.sin(a) };
        } else {
          const y = 1 - (2 * (i + 0.5)) / ordered.length, r = Math.sqrt(1 - y * y), a = i * 2.39996323;
          dir = { x: Math.cos(a) * r, y, z: Math.sin(a) * r };
        }
        Object.assign(h, { x: dir.x * sphere, y: dir.y * sphere, z: dir.z * sphere });
      });
      const firstHub = new Map();
      for (const l of links) if (!l.a.hub && l.b.hub && !firstHub.has(l.a.id)) firstHub.set(l.a.id, l.b);
      const around = sphere ? 46 : 120;
      for (const n of nodes) {
        n.vx = 0; n.vy = 0; n.vz = 0;
        n.mass = n.hub ? 3 + Math.sqrt(n.count) : 1;
        if (n.hub) continue;
        const prev = old.get(n.id);
        if (prev) { Object.assign(n, { x: prev.x, y: prev.y, z: prev.z }); continue; }
        // Start next to its hub, so clusters form at once instead of untangling.
        const hub = firstHub.get(n.id) || { x: 0, y: 0, z: 0 };
        const d = randomDir();
        Object.assign(n, { x: hub.x + d.x * around, y: hub.y + d.y * around, z: hub.z + d.z * around });
      }
      for (const l of links) if (!l.spine) l.len = around;
      if (!old.size) cam.goal = Math.min(1700, Math.max(560, (sphere || 140) * 3.3));
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
        if (p.hub) {
          // Held to the sphere's surface (or to the middle, when there is only one hub).
          const d = Math.sqrt(p.x * p.x + p.y * p.y + p.z * p.z) || 1;
          const f = sphere ? ((sphere - d) / d) * 0.08 * alpha : -0.05 * alpha;
          p.vx += p.x * f; p.vy += p.y * f; p.vz += p.z * f;
        } else {
          const g = 0.0008 * alpha;
          p.vx -= p.x * g; p.vy -= p.y * g; p.vz -= p.z * g;
        }
        if (p.pinned) { p.vx = 0; p.vy = 0; p.vz = 0; continue; } // being dragged: the pointer decides
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
      return { x: width / 2 + x1 * s, y: (midY ?? targetMidY()) + y2 * s, s, depth };
    }

    const lit = (n) => !focus || n === focus || neighbours.get(focus.id)?.has(n.id);

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

      // The globe grows and shrinks smoothly with whatever is on it.
      let extent = 0;
      for (const n of nodes) extent = Math.max(extent, Math.sqrt(n.x * n.x + n.y * n.y + n.z * n.z));
      globe += (Math.max(120, extent * 1.12) - globe) * 0.06;
      const center = project({ x: 0, y: 0, z: 0 });
      drawAtmosphere(center);
      drawGlobe(center, false);

      for (const n of nodes) n.p = project(n);
      // Near side bright, far side dim: what makes it read as a ball rather than a flat web.
      const fade = (p) => Math.max(0.2, Math.min(1, 1 - 0.75 * ((p.depth - (center.depth - globe)) / (2 * globe))));

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
        const rr = Math.max(n.shape ? r * 1.35 : r, 1.2);
        if (n.shape === 'diamond') { // notes
          ctx.moveTo(p.x, p.y - rr); ctx.lineTo(p.x + rr, p.y); ctx.lineTo(p.x, p.y + rr); ctx.lineTo(p.x - rr, p.y); ctx.closePath();
        } else if (n.shape === 'square') { // Notion pages and Drive files
          ctx.roundRect(p.x - rr * 0.85, p.y - rr * 0.85, rr * 1.7, rr * 1.7, rr * 0.35);
        } else if (n.shape === 'goal') { // a goal: bigger, with its progress as a ring
          ctx.arc(p.x, p.y, rr * 1.25, 0, Math.PI * 2);
        } else {
          ctx.arc(p.x, p.y, rr, 0, Math.PI * 2);
        }
        ctx.fill();
        if (n.shape === 'goal') {
          const ring = rr * 1.25 + Math.max(2.5, 2.2 * p.s);
          ctx.lineWidth = Math.max(1.2, 1.4 * p.s);
          ctx.strokeStyle = `rgba(255,255,255,${0.16 * a})`;
          ctx.beginPath();
          ctx.arc(p.x, p.y, ring, 0, Math.PI * 2);
          ctx.stroke();
          ctx.strokeStyle = rgba(n.color, 0.95 * a);
          ctx.beginPath();
          ctx.arc(p.x, p.y, ring, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, Math.max(0, n.item?.progress || 0)));
          ctx.stroke();
        }
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

        // Clusters are always named; an entry's name shows only once its cluster is picked
        // (or, with a mouse, while pointing at the entry itself).
        const labelled = n.hub || n === hover || (focus && on);
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
      drawGlobe(center, true);
      drawHeld();
    }

    // While an item is being dragged: a dashed line to the cluster it would join, and its name.
    // An item dragged in from outside the canvas (the Tasks panel) is drawn the same way.
    function drawHeld() {
      const outside = incoming && !held?.active;
      if (!outside && (!held?.active || !held.node.p)) return;
      const p = outside ? incoming : held.node.p;
      const t = outside ? incoming.target : held.target;
      const name = outside ? incoming.label : held.node.label;
      ctx.save();
      if (t?.p) {
        const r = (6 + Math.sqrt(t.count) * 2.2) * t.p.s;
        ctx.setLineDash([5, 5]);
        ctx.strokeStyle = 'rgba(255,255,255,0.8)';
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(t.p.x, t.p.y); ctx.stroke();
        ctx.setLineDash([]);
        ctx.strokeStyle = rgba(t.color, 0.95);
        ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.arc(t.p.x, t.p.y, r + 9, 0, Math.PI * 2); ctx.stroke();
      }
      ctx.fillStyle = 'rgba(255,255,255,0.95)';
      ctx.beginPath(); ctx.arc(p.x, p.y, 6, 0, Math.PI * 2); ctx.fill();
      ctx.font = '600 12px "Segoe UI",Inter,Roboto,system-ui,sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      const text = t ? `Move to ${t.label}` : name;
      const w = ctx.measureText(text).width + 16;
      ctx.fillStyle = 'rgba(14,14,16,0.92)';
      ctx.beginPath(); ctx.roundRect(p.x + 12, p.y - 13, w, 26, 8); ctx.fill();
      ctx.fillStyle = '#f1f1f4';
      ctx.fillText(text, p.x + 20, p.y);
      ctx.restore();
    }

    function drawAtmosphere(center) {
      if (center.depth < 10) return;
      const r = globe * center.s;
      const g = ctx.createRadialGradient(center.x, center.y, r * 0.2, center.x, center.y, r * 1.18);
      g.addColorStop(0, 'rgba(139,124,255,0.035)');
      g.addColorStop(0.82, 'rgba(139,124,255,0.05)');
      g.addColorStop(0.9, 'rgba(160,150,255,0.09)');
      g.addColorStop(1, 'rgba(139,124,255,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(center.x, center.y, r * 1.18, 0, Math.PI * 2);
      ctx.fill();
    }

    // Latitude and longitude lines, split into the half facing the camera and the half behind.
    function drawGlobe(center, front) {
      const R = globe;
      const SEG = 72;
      const rings = [];
      for (const lat of [-60, -30, 0, 30, 60]) {
        const c = Math.cos(lat * Math.PI / 180), y = Math.sin(lat * Math.PI / 180) * R;
        rings.push((t) => ({ x: R * c * Math.cos(t), y, z: R * c * Math.sin(t) }));
      }
      for (let k = 0; k < 6; k++) {
        const lon = (k * Math.PI) / 6;
        rings.push((t) => ({ x: R * Math.cos(t) * Math.cos(lon), y: R * Math.sin(t), z: R * Math.cos(t) * Math.sin(lon) }));
      }
      ctx.beginPath();
      for (const ring of rings) {
        let prev = project(ring(0));
        for (let i = 1; i <= SEG; i++) {
          const p = project(ring((i / SEG) * Math.PI * 2));
          const near = (prev.depth + p.depth) / 2 < center.depth;
          if (near === front && p.depth > 10 && prev.depth > 10) {
            ctx.moveTo(prev.x, prev.y);
            ctx.lineTo(p.x, p.y);
          }
          prev = p;
        }
      }
      ctx.strokeStyle = front ? 'rgba(170,160,255,0.085)' : 'rgba(139,124,255,0.04)';
      ctx.lineWidth = front ? 1 : 0.8;
      ctx.stroke();
    }

    function frame() {
      tick();
      const idle = performance.now() - lastInput > 2500 && !drag;
      if (drag) {
        // nothing: the pointer is steering
      } else if (Math.abs(spin.yaw) > 0.0001 || Math.abs(spin.pitch) > 0.0001) {
        cam.yaw += spin.yaw; cam.pitch = clampPitch(cam.pitch + spin.pitch);
        spin.yaw *= 0.965; spin.pitch *= 0.965; // a flick keeps the globe turning for a while
      } else if (idle) {
        cam.yaw += 0.0022;
      }
      const goal = focus ? focus : { x: 0, y: 0, z: 0 };
      cam.look.x += (goal.x - cam.look.x) * 0.07;
      cam.look.y += (goal.y - cam.look.y) * 0.07;
      cam.look.z += (goal.z - cam.look.z) * 0.07;
      if (cam.goal) {
        cam.dist += (cam.goal - cam.dist) * 0.08;
        if (Math.abs(cam.goal - cam.dist) < 1) cam.goal = null;
      }
      const mid = targetMidY();
      midY = midY == null || Math.abs(mid - midY) < 0.5 ? mid : midY + (mid - midY) * 0.15;
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

    // Dragging an item (not a hub) moves just that item around the globe, to look at it or
    // make room; it never changes the item (tags and dates are changed in its window).
    let held = null; // { node, active }
    let incoming = null; // { x, y, label, target }: something dragged over the canvas from elsewhere

    /** Undoes the camera rotation: a screen-space step at scale s becomes a world-space step. */
    function screenToWorld(dx, dy, s) {
      const x1 = dx / s, y2 = dy / s, z2 = 0;
      const cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch);
      const y0 = y2 * cp + z2 * sp, z1 = -y2 * sp + z2 * cp;
      const cy = Math.cos(cam.yaw), sy = Math.sin(cam.yaw);
      return { x: x1 * cy + z1 * sy, y: y0, z: -x1 * sy + z1 * cy };
    }

    function hubUnder(x, y, except) {
      let best = null, bestD = Infinity;
      for (const n of nodes) {
        if (!n.hub || n === except || !n.p || n.p.depth < 10) continue;
        const r = (6 + Math.sqrt(n.count) * 2.2) * n.p.s + 22;
        const d = Math.hypot(n.p.x - x, n.p.y - y);
        if (d < r && d < bestD) { best = n; bestD = d; }
      }
      return best;
    }


    function onDown(e) {
      try { canvas.setPointerCapture(e.pointerId); } catch { /* a synthetic pointer can't be captured */ }
      pointers.set(e.pointerId, local(e));
      lastInput = performance.now();
      spin = { yaw: 0, pitch: 0 };
      if (pointers.size === 1) {
        drag = { start: local(e), last: local(e), moved: 0, t: performance.now() };
        const n = pick(drag.start.x, drag.start.y);
        if (n && !n.hub) held = { node: n, active: false };
      } else {
        held = null;
        drag = { pinch: pinchDistance(), dist: cam.dist, moved: 99 };
      }
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
        if (h !== hover) {
          hover = h;
          canvas.style.cursor = h ? 'pointer' : 'grab';
          // An item's notes show as its tooltip.
          canvas.title = h?.item?.notes ? `${h.item.title}\n\n${h.item.notes.slice(0, 600)}` : '';
        }
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
      if (held) {
        if (!held.active && drag.moved > 6) { held.active = true; held.node.pinned = true; }
        if (held.active) {
          const step = screenToWorld(dx, dy, held.node.p?.s || 1);
          held.node.x += step.x; held.node.y += step.y; held.node.z += step.z;
          canvas.style.cursor = 'grabbing';
        }
        return;
      }
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
      const h = held;
      held = null;
      if (h?.active) {
        h.node.pinned = false;
        alpha = Math.max(alpha, 0.5); // let it settle wherever it ends up
        return;
      }
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

    function onLeave() { if (!drag) { hover = null; canvas.title = ''; } }

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
      cam.yaw = 0.6; cam.pitch = -0.35; cam.goal = Math.min(1700, Math.max(560, (sphere || 140) * 3.3));
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
      /** Pixels of the canvas covered at the top and bottom: the globe centres in the rest. */
      setInsets: (top, bottom) => { insets.top = Math.max(0, top || 0); insets.bottom = Math.max(0, bottom || 0); },
      /**
       * Something is dragged over the canvas from outside (a task from the Tasks panel):
       * returns the cluster under the pointer, { key, label }, or null, and draws the
       * drag. Called with no point when the drag leaves or ends.
       */
      dragOver: (clientX, clientY, label) => {
        if (clientX == null) { incoming = null; return null; }
        const b = canvas.getBoundingClientRect();
        const x = clientX - b.left, y = clientY - b.top;
        lastInput = performance.now(); // hold the spin, so the cluster stays under the pointer
        const target = hubUnder(x, y, null);
        incoming = { x, y, s: 1, label, target };
        return target ? { key: target.key, label: target.label } : null;
      },
      /** Where a node (or `hub:<key>`) is drawn, in canvas pixels, and what it is: for tests and tooling. */
      locate: (id) => {
        const n = nodes.find((x) => x.id === id);
        return n?.p ? { x: n.p.x, y: n.p.y, label: n.label, hub: n.hub, links: [...(neighbours.get(n.id) || [])] } : null;
      },
      destroy() {
        cancelAnimationFrame(raf);
        observer.disconnect();
        canvas.replaceWith(canvas.cloneNode(false));
      },
    };
  }

  window.OnyxGraph = { build, create };
})();
