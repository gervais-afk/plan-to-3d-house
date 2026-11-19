/**
 * PROJECT LOADER — un fichier par maison : projects/<nom>/project.json
 * index.html?project=<nom> remplace le contenu de HOUSE_DATA (data.js reste le projet par défaut).
 * Tout ce que l'éditeur ne fournit pas est généré automatiquement (HouseAuto.complete) :
 * caméras du parcours, vues de rendu, lampes, abords, cotes, départ de la visite libre.
 */
const HouseAuto = (() => {
  const v2 = (x, z) => ({ x, z });

  function bbox(data) {
    let xMin = Infinity, xMax = -Infinity, zMin = Infinity, zMax = -Infinity;
    const add = (x, z) => { xMin = Math.min(xMin, x); xMax = Math.max(xMax, x); zMin = Math.min(zMin, z); zMax = Math.max(zMax, z); };
    data.walls.forEach(w => { add(w.from[0], w.from[1]); add(w.to[0], w.to[1]); });
    (data.rooms || []).forEach(r => { add(r.bounds.xMin, r.bounds.zMin); add(r.bounds.xMax, r.bounds.zMax); });
    if (!isFinite(xMin)) { xMin = zMin = -5; xMax = zMax = 5; }
    return { xMin, xMax, zMin, zMax, cx: (xMin + xMax) / 2, cz: (zMin + zMax) / 2, w: xMax - xMin, d: zMax - zMin, max: Math.max(xMax - xMin, zMax - zMin) };
  }

  // Position monde d'une ouverture + normale gauche du mur
  function openingFrame(w, op) {
    const dx = (w.to[0] - w.from[0]) / w.length, dz = (w.to[1] - w.from[1]) / w.length;
    return { p: v2(w.from[0] + dx * op.at, w.from[1] + dz * op.at), dir: v2(dx, dz), n: v2(-dz, dx) };
  }

  function findEntry(data, bb) {
    let best = null;
    data.walls.filter(w => (Number(w.level) || 0) === 0).forEach(w => w.openings.forEach(op => {
      if (op.type !== 'door') return;
      const score = (op.entry ? 100 : 0) + (w.type === 'ext' ? 10 : 0) + op.w;
      if (!best || score > best.score) best = { w, op, score };
    }));
    if (!best) return { p: v2(bb.cx, bb.zMax), out: v2(0, 1) };
    const f = openingFrame(best.w, best.op);
    let out = f.n;
    if ((f.p.x - bb.cx) * out.x + (f.p.z - bb.cz) * out.z < 0) out = v2(-out.x, -out.z);
    return { p: f.p, out };
  }

  const inRoom = (r, p, m = 0.25) => p.x >= r.bounds.xMin - m && p.x <= r.bounds.xMax + m && p.z >= r.bounds.zMin - m && p.z <= r.bounds.zMax + m;

  const contains = (r, x, z) => (window.roomContains ? roomContains(r, x, z) : inRoom(r, { x, z }, 0));
  const roomAtPoint = (data, x, z) => (data.rooms || []).find(r => contains(r, x, z)) || null;

  // Graphe de circulation : chaque porte / passage relie les deux espaces qu'il sépare ('outside' = extérieur)
  function doorGraph(data, level) {
    if (level !== undefined && level !== null) {
      data = Object.assign({}, data, {
        walls: (data.walls || []).filter(w => (Number(w.level) || 0) === level),
        rooms: (data.rooms || []).filter(r => (Number(r.level) || 0) === level)
      });
    }
    const edges = [];
    data.walls.forEach(w => w.openings.forEach(op => {
      if (op.type !== 'door' && op.type !== 'open') return;
      const f = openingFrame(w, op);
      const d = w.thick / 2 + 0.3;
      const ra = roomAtPoint(data, f.p.x + f.n.x * d, f.p.z + f.n.z * d);
      const rb = roomAtPoint(data, f.p.x - f.n.x * d, f.p.z - f.n.z * d);
      const a = ra ? ra.id : 'outside', b = rb ? rb.id : 'outside';
      if (a !== b) edges.push({ a, b, p: f.p, n: f.n });
    }));

    // Passages ouverts sans menuiserie : deux pièces qui se touchent là où aucun mur ne les sépare
    const segDist = (w, x, z) => {
      const ax = w.from[0], az = w.from[1], dx = w.to[0] - ax, dz = w.to[1] - az;
      const L2 = dx * dx + dz * dz || 1;
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L2));
      return Math.hypot(x - (ax + dx * t), z - (az + dz * t));
    };
    const free = (x, z) => data.walls.every(w => segDist(w, x, z) > w.thick / 2 + 0.03);
    const rs = data.rooms || [];
    for (let i = 0; i < rs.length; i++) for (let j = i + 1; j < rs.length; j++) {
      const A = rs[i].bounds, B = rs[j].bounds;
      const cands = [];
      [[A.xMax, B.xMin], [A.xMin, B.xMax]].forEach(([u, v]) => {
        if (Math.abs(u - v) < 0.06) cands.push({ axis: 'x', c: u, lo: Math.max(A.zMin, B.zMin), hi: Math.min(A.zMax, B.zMax) });
      });
      [[A.zMax, B.zMin], [A.zMin, B.zMax]].forEach(([u, v]) => {
        if (Math.abs(u - v) < 0.06) cands.push({ axis: 'z', c: u, lo: Math.max(A.xMin, B.xMin), hi: Math.min(A.xMax, B.xMax) });
      });
      cands.forEach(cd => {
        if (cd.hi - cd.lo < 0.6) return;
        let best = null, runStart = null;
        for (let t = cd.lo + 0.05; t <= cd.hi - 0.05 + 1e-9; t += 0.1) {
          const x = cd.axis === 'x' ? cd.c : t, z = cd.axis === 'x' ? t : cd.c;
          if (free(x, z) && contains(rs[i], x + (cd.axis === 'x' ? (cd.c === A.xMax ? -0.2 : 0.2) : 0), z + (cd.axis === 'z' ? (cd.c === A.zMax ? -0.2 : 0.2) : 0))) {
            if (runStart === null) runStart = t;
            if (!best || t - runStart > best.len) best = { len: t - runStart, a: runStart, b: t };
          } else runStart = null;
        }
        if (!best || best.len < 0.5) return;
        const m = (best.a + best.b) / 2;
        const p = cd.axis === 'x' ? v2(cd.c, m) : v2(m, cd.c);
        const n = cd.axis === 'x' ? v2(1, 0) : v2(0, 1);
        const ra = roomAtPoint(data, p.x + n.x * 0.3, p.z + n.z * 0.3), rb = roomAtPoint(data, p.x - n.x * 0.3, p.z - n.z * 0.3);
        if (ra && rb && ra.id !== rb.id && !edges.some(e => (e.a === ra.id && e.b === rb.id) || (e.a === rb.id && e.b === ra.id))) {
          edges.push({ a: ra.id, b: rb.id, p, n, open: true });
        }
      });
    }
    return edges;
  }

  // Plus court chemin (en nombre de portes) entre deux espaces
  function doorPath(edges, from, to) {
    if (from === to) return [];
    const prev = new Map([[from, null]]);
    const queue = [from];
    while (queue.length) {
      const cur = queue.shift();
      if (cur === to) break;
      edges.forEach(e => {
        const nxt = e.a === cur ? e.b : e.b === cur ? e.a : null;
        if (nxt && !prev.has(nxt)) { prev.set(nxt, { node: cur, edge: e }); queue.push(nxt); }
      });
    }
    if (!prev.has(to)) return null;
    const path = [];
    for (let n = to; prev.get(n); n = prev.get(n).node) path.unshift({ edge: prev.get(n).edge, into: n });
    return path;
  }

  // Direction qui entre dans la pièce `roomId` par la porte `e`
  function inward(e, roomId) {
    return e.b === roomId ? v2(-e.n.x, -e.n.z) : v2(e.n.x, e.n.z);
  }

  // Pose de caméra pour une pièce : juste après le seuil de la porte d'arrivée, regard vers le fond
  function roomPose(data, r, viaDoor) {
    const c = r.center;
    let cam = null;
    if (viaDoor) {
      const din = inward(viaDoor, r.id);
      cam = v2(viaDoor.p.x + din.x * 0.6, viaDoor.p.z + din.z * 0.6);
    }
    if (!cam) {
      const e = doorGraph(data, Number(r.level) || 0).find(x => x.a === r.id || x.b === r.id);
      if (e) { const din = inward(e, r.id); cam = v2(e.p.x + din.x * 0.6, e.p.z + din.z * 0.6); }
    }
    if (!cam) {
      const b = r.bounds;
      cam = v2(b.xMin + Math.min(0.5, (b.xMax - b.xMin) * 0.2), b.zMax - Math.min(0.5, (b.zMax - b.zMin) * 0.2));
    }
    const look = v2(c.x + (c.x - cam.x) * 0.9, c.z + (c.z - cam.z) * 0.9);
    return { cam, look };
  }

  function complete(data) {
    const cfg = data.config;
    const bb = bbox(data);
    const entry = findEntry(data, bb);
    const out = entry.out;
    const rooms = (data.rooms || []).filter(r => r.habitable);

    if (!cfg.walkStart) {
      const d = v2(-out.x, -out.z);
      cfg.walkStart = { x: entry.p.x + out.x * 3.5, z: entry.p.z + out.z * 3.5, yaw: Math.atan2(-d.x, -d.z) };
    }
    if (!cfg.walkBounds) cfg.walkBounds = { xMin: bb.xMin - 4, xMax: bb.xMax + 4, zMin: bb.zMin - 4, zMax: bb.zMax + 7 };

    if (!data.lights) {
      data.lights = rooms.filter(r => r.area >= 2.5).map(r => ({
        room: r.id, type: 'ceiling', x: r.center.x, z: r.center.z, i: r.area > 12 ? 1.0 : 0.8,
        dist: Math.max(4, Math.hypot(r.bounds.xMax - r.bounds.xMin, r.bounds.zMax - r.bounds.zMin) * 0.9)
      }));
    }

    if (!data.exterior) {
      const pathLen = 6.5, half = 0.7;
      const ax = entry.p.x + out.x * 0.15, az = entry.p.z + out.z * 0.15;
      const bx = entry.p.x + out.x * pathLen, bz = entry.p.z + out.z * pathLen;
      const m = 3.5;
      data.exterior = {
        path: { xMin: Math.min(ax, bx) - (out.x ? 0 : half), xMax: Math.max(ax, bx) + (out.x ? 0 : half),
                zMin: Math.min(az, bz) - (out.z ? 0 : half), zMax: Math.max(az, bz) + (out.z ? 0 : half) },
        hedges: [
          { xMin: bb.xMin - m, xMax: bb.xMax + m, z: bb.zMin - m }, { xMin: bb.xMin - m, xMax: bb.xMax + m, z: bb.zMax + m + 1.5 },
          { x: bb.xMin - m, zMin: bb.zMin - m, zMax: bb.zMax + m + 1.5 }, { x: bb.xMax + m, zMin: bb.zMin - m, zMax: bb.zMax + m + 1.5 }
        ].filter(h => {
          // Ouverture de la haie face à l'allée
          if (h.z !== undefined && Math.abs(out.z) > 0.5 && Math.sign(h.z - bb.cz) === Math.sign(out.z)) return false;
          if (h.x !== undefined && Math.abs(out.x) > 0.5 && Math.sign(h.x - bb.cx) === Math.sign(out.x)) return false;
          return true;
        }),
        trees: [[bb.xMin - 2.2, bb.zMin + bb.d * 0.3, 1.2], [bb.xMax + 2.3, bb.zMin - 1.0, 1.3], [bb.xMax + 2.0, bb.zMax + 1.2, 1.1], [bb.xMin - 2.0, bb.zMax + 1.6, 1.0]]
      };
    }

    if (!data.dimensions) {
      const fmt = v => v.toFixed(2) + ' m';
      data.dimensions = [
        { from: [bb.xMin, 0, bb.zMin - 0.6], to: [bb.xMax, 0, bb.zMin - 0.6], text: fmt(bb.w) },
        { from: [bb.xMax + 0.6, 0, bb.zMin], to: [bb.xMax + 0.6, 0, bb.zMax], text: fmt(bb.d) }
      ];
    }

    // Ordre de visite : plus proche voisin en nombre de portes, puis en distance, depuis l'entrée
    const edges = doorGraph(data, 0);
    const groundData = Object.assign({}, data, { rooms: (data.rooms || []).filter(r => (Number(r.level) || 0) === 0) });
    const startRoom = roomAtPoint(groundData, entry.p.x - out.x * 0.6, entry.p.z - out.z * 0.6);
    // Parcours en profondeur du graphe des pièces depuis l'entrée : on visite d'abord les petites branches
    // (culs-de-sac voisins), puis on continue — comme un agent immobilier qui fait visiter.
    const order = [];
    const visitable = new Set(rooms.filter(r => r.area >= 5).map(r => r.id));
    const byId = new Map((data.rooms || []).map(r => [r.id, r]));
    const adj = new Map();
    edges.forEach(e => {
      if (e.a === 'outside' || e.b === 'outside') return;
      [[e.a, e.b], [e.b, e.a]].forEach(([u, v]) => { if (!adj.has(u)) adj.set(u, new Set()); adj.get(u).add(v); });
    });
    if (startRoom) {
      // arbre BFS + taille des sous-arbres (en pièces à visiter)
      const parent = new Map([[startRoom.id, null]]), bfs = [startRoom.id];
      for (let i = 0; i < bfs.length; i++) (adj.get(bfs[i]) || []).forEach(v => { if (!parent.has(v)) { parent.set(v, bfs[i]); bfs.push(v); } });
      const size = new Map();
      for (let i = bfs.length - 1; i >= 0; i--) {
        const u = bfs[i];
        size.set(u, (size.get(u) || 0) + (visitable.has(u) ? 1 : 0));
        const p = parent.get(u);
        if (p) size.set(p, (size.get(p) || 0) + size.get(u));
      }
      const dfs = u => {
        if (visitable.has(u)) order.push(byId.get(u));
        const kids = [...(adj.get(u) || [])].filter(v => parent.get(v) === u);
        const cu = byId.get(u).center;
        kids.sort((a, b) => size.get(a) - size.get(b) || Math.hypot(byId.get(a).center.x - cu.x, byId.get(a).center.z - cu.z) - Math.hypot(byId.get(b).center.x - cu.x, byId.get(b).center.z - cu.z));
        kids.forEach(dfs);
      };
      dfs(startRoom.id);
    }
    // Pièces non reliées par le graphe : à la fin, par proximité
    const rest = rooms.filter(r => r.area >= 5 && !order.includes(r));
    let curP = order.length ? order[order.length - 1].center : entry.p;
    while (rest.length) {
      rest.sort((a, b) => Math.hypot(a.center.x - curP.x, a.center.z - curP.z) - Math.hypot(b.center.x - curP.x, b.center.z - curP.z));
      const r = rest.shift();
      order.push(r);
      curP = r.center;
    }
    const tanHalf = Math.tan((13 * Math.PI) / 180);

    if (!data.tourWaypoints) {
      const wp = [
        { pos: [bb.cx, (bb.max * 1.35) / (2 * tanHalf), bb.cz + 0.01], look: [bb.cx, 0, bb.cz], fov: 26, label: 'PLAN D\'ARCHITECTE 2D' },
        { pos: [bb.cx + bb.max * 0.5, bb.max * 1.55, bb.cz + bb.max * 1.2], look: [bb.cx, 1, bb.cz], fov: 38, label: 'ÉLÉVATION DES MURS' },
        { pos: [entry.p.x + out.x * 7, 1.65, entry.p.z + out.z * 7], look: [entry.p.x, 1.8, entry.p.z], fov: 50, label: 'ARRIVÉE' },
        { pos: [entry.p.x + out.x * 1.0, 1.65, entry.p.z + out.z * 1.0], look: [entry.p.x - out.x * 3, 1.6, entry.p.z - out.z * 3], fov: 55, label: 'PORTE D\'ENTRÉE' }
      ];
      // Le visiteur passe physiquement par les portes : un point de passage sur chaque seuil traversé
      let at = 'outside';
      const entryEdge = edges.find(e => Math.hypot(e.p.x - entry.p.x, e.p.z - entry.p.z) < 0.05);
      let lastDoor = entryEdge || null;
      if (startRoom) at = startRoom.id;
      order.forEach(r => {
        const floorY = (Number(r.level) || 0) * (Number(cfg.floorHeight) || 3);
        const path = doorPath(edges, at, r.id);
        if (path) path.forEach((step, i) => {
          const into = (data.rooms || []).find(x => x.id === step.into);
          const target = (into || r).center;
          const targetY = (Number(into && into.level) || 0) * (Number(cfg.floorHeight) || 3);
          wp.push({ pos: [step.edge.p.x, floorY + 1.65, step.edge.p.z], look: [target.x, targetY + 1.4, target.z], fov: 60, label: r.name });
          lastDoor = step.edge;
        });
        const p = roomPose(data, r, path && path.length ? lastDoor : (at === r.id ? lastDoor : null));
        wp.push({ pos: [p.cam.x, floorY + 1.65, p.cam.z], look: [p.look.x, floorY + 1.25, p.look.z], fov: 62, label: r.name, room: r.id });
        at = r.id;
      });
      const last = wp[wp.length - 1];
      wp.push({ pos: [last.pos[0], 5.0, last.pos[2]], look: [bb.cx, 0, bb.cz], fov: 55, label: 'ENVOL' });
      wp.push({ pos: [bb.cx - bb.max * 0.8, bb.max * 0.8, bb.cz + bb.max * 0.9], look: [bb.cx, 0.8, bb.cz], fov: 42, label: 'VUE D\'ENSEMBLE' });
      data.tourWaypoints = wp;
    }

    if (!data.renderShots) {
      const aerial = { pos: [bb.cx - bb.max * 0.87, bb.max * 0.83, bb.cz + bb.max * 0.96], look: [bb.cx, 0.6, bb.cz], fov: 40 };
      const side = v2(-out.z, out.x);
      const shots = [
        Object.assign({ id: 'vue-aerienne', label: 'Vue aérienne' }, aerial),
        { id: 'facade', label: 'Façade d\'entrée', pos: [entry.p.x + out.x * 8.5 + side.x * 3, 1.5, entry.p.z + out.z * 8.5 + side.z * 3], look: [entry.p.x, 1.6, entry.p.z], fov: 48 }
      ];
      order.forEach(r => {
        const p = roomPose(data, r);
        const slug = r.id.replace(/[^a-z0-9-]/gi, '-').toLowerCase();
        const floorY = (Number(r.level) || 0) * (Number(cfg.floorHeight) || 3);
        shots.push({ id: slug, label: r.name.charAt(0) + r.name.slice(1).toLowerCase(), pos: [p.cam.x, floorY + 1.4, p.cam.z], look: [p.look.x, floorY + 1.0, p.look.z], fov: 68, room: r.id });
      });
      shots.push(Object.assign({ id: 'soir-aerien', label: 'Vue aérienne — soir', night: true }, aerial));
      data.renderShots = shots;
    }

    data.columns = data.columns || [];
    data.canopies = data.canopies || [];
    data.furniture = data.furniture || [];
    data.decor = data.decor || [];
    data.people = data.people || [];
    return data;
  }

  return { complete, bbox, doorGraph, doorPath };
})();
window.HouseAuto = HouseAuto;

// --- Chargement synchrone du projet demandé (avant la construction de la scène) ---
(function loadProject() {
  const params = new URLSearchParams(location.search);
  const requested = params.get('project');
  const stored = localStorage.getItem('lastProject');
  let name = requested || (stored && /^[a-z0-9-]{1,60}$/.test(stored) ? stored : 'villa-serena');
  window.ACTIVE_PROJECT_SLUG = /^[a-z0-9-]{1,60}$/.test(name) ? name : 'villa-serena';
  if (!/^[a-z0-9-]{1,60}$/.test(name)) { console.warn('Nom de projet invalide :', name); return; }
  const xhr = new XMLHttpRequest();
  xhr.open('GET', `projects/${name}/project.json?t=${Date.now()}`, false);
  try { xhr.send(); } catch (e) { console.warn('Projet introuvable :', name); }
  if (xhr.status !== 200 && name !== 'villa-serena') {
    name = 'villa-serena';
    window.ACTIVE_PROJECT_SLUG = name;
    xhr.open('GET', `projects/${name}/project.json?t=${Date.now()}`, false);
    try { xhr.send(); } catch (e) { console.warn('Projet introuvable :', name); }
  }
  if (xhr.status !== 200) { console.warn('Projet introuvable :', name); return; }

  localStorage.setItem('lastProject', name);
  const p = JSON.parse(xhr.responseText);
  const baseConfig = Object.assign({}, HOUSE_DATA.config);
  delete baseConfig.walkStart; delete baseConfig.walkBounds; delete baseConfig.planImage;
  const baseAssets = HOUSE_DATA.assets;

  Object.keys(HOUSE_DATA).forEach(k => delete HOUSE_DATA[k]);
  Object.assign(HOUSE_DATA, p);
  HOUSE_DATA.config = Object.assign(baseConfig, p.config || {});
  HOUSE_DATA.assets = p.assets || baseAssets;
  HOUSE_DATA.meta = Object.assign({ name: name.toUpperCase(), slug: name }, p.meta || {});

  normalizeHouseData(HOUSE_DATA);
  HouseAuto.complete(HOUSE_DATA);

  // index.html?project=…#wp=3 : ouvre directement le parcours sur l'étape 3 (aperçu depuis l'éditeur)
  window.addEventListener('load', () => {
    const m = /wp=(\d+)/.exec(location.hash);
    if (!m) return;
    const n = HOUSE_DATA.tourWaypoints.length - 1;
    setTimeout(() => {
      const h = document.documentElement.scrollHeight - innerHeight;
      window.scrollTo(0, (h * Math.min(n, +m[1])) / n);
    }, 400);
  });

  document.addEventListener('DOMContentLoaded', () => {
    const m = HOUSE_DATA.meta;
    document.title = `${m.name} — Visite 3D interactive`;
    const t = document.querySelector('.project-title');
    if (t) t.textContent = m.name;
    const meta = document.querySelector('.project-meta');
    if (meta && m.subtitle) meta.textContent = m.subtitle;
  });
})();
