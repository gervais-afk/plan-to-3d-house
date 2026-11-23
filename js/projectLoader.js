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

  // Face extérieure d'un mur orienté : sondes de part et d'autre, sur le même niveau.
  function exteriorSide(data, wall, bb = bbox(data)) {
    const rooms = data.rooms.filter(r => r.level === wall.level);
    const half = wall.thick / 2 + 0.08;
    let score = 0;
    for (const fraction of [0.2, 0.5, 0.8]) {
      const { p, n } = openingFrame(wall, { at: wall.length * fraction });
      const weight = side => Math.max(0, ...rooms.filter(r => contains(r, p.x + n.x * half * side, p.z + n.z * half * side)).map(r => r.habitable ? 2 : 1));
      score += weight(-1) - weight(1);
    }
    if (score) return Math.sign(score);
    const { p, n } = openingFrame(wall, { at: wall.length / 2 });
    return (p.x - bb.cx) * n.x + (p.z - bb.cz) * n.z < 0 ? -1 : 1;
  }

  // Le Nord est -Z par défaut, angle horaire dans le plan (90° = +X).
  function northAngle(data) {
    const degrees = Number(data.config.northDegrees);
    return Number.isFinite(degrees) ? ((degrees % 360) + 360) % 360 : 0;
  }

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

  // ---------------------------------------------------------------------------
  // ESCALIERS — une seule géométrie pour la 3D (scene.js), la visite libre (walkController.js),
  // le parcours guidé et l'éditeur. La trémie est dessinée sur l'étage `s.level`.
  //   s.stairType : 'return' (deux volées et palier, défaut) | 'straight' (une volée) | 'quarter' (quart tournant
  //                 avec palier) | 'winder' (quart tournant balancé : 3 marches dansantes) | 'helical' (hélicoïdal)
  //   s.dir       : sens de montée de la première volée : '-x' (défaut historique), '+x', '-z', '+z'
  // Repère local : u = sens de montée de la 1re volée, v = travers ; 16 contremarches par niveau.
  // Une marche est un rectangle en plan (xMin…zMax) ; les marches tournantes ajoutent leur polygone `poly`.
  // ---------------------------------------------------------------------------
  const STAIR_LANDING = 0.84, RISERS = 16, MIN_TREAD = 0.22;
  const WINDER_WIDTH = 0.9, HELIX_SWEEP = 330, HELIX_POST = 0.1;
  const STAIR_TYPES = ['return', 'straight', 'quarter', 'winder', 'helical'];
  const STAIR_DIRS = ['-x', '+x', '-z', '+z'];
  function stairFrame(s) {
    const dir = STAIR_DIRS.includes(s.dir) ? s.dir : '-x';
    const alongX = dir.endsWith('x');
    const Lu = alongX ? s.xMax - s.xMin : s.zMax - s.zMin, Lv = alongX ? s.zMax - s.zMin : s.xMax - s.xMin;
    // (u, v) → monde ; chaque sens est une rotation du cas historique '-x'.
    const toWorld = {
      '-x': (u, v) => v2(s.xMax - u, s.zMax - v),
      '+x': (u, v) => v2(s.xMin + u, s.zMin + v),
      '-z': (u, v) => v2(s.xMin + v, s.zMax - u),
      '+z': (u, v) => v2(s.xMax - v, s.zMin + u)
    }[dir];
    return { dir, alongX, Lu, Lv, toWorld };
  }
  function stairType(s) {
    if (STAIR_TYPES.includes(s.stairType)) return s.stairType;
    return 'return';
  }
  /** Une trémie trop petite donnerait des marches impossibles : on ne construit alors ni escalier ni passage. */
  function stairFits(s) {
    if (!s || ![s.xMin, s.xMax, s.zMin, s.zMax].every(Number.isFinite) || s.xMax <= s.xMin || s.zMax <= s.zMin) return false;
    const { Lu, Lv } = stairFrame(s);
    switch (stairType(s)) {
      case 'straight': return Lu >= RISERS * MIN_TREAD && Lv >= 0.8;
      case 'quarter': return Lu >= 0.8 + 8 * MIN_TREAD && Lv >= 0.8 + 8 * MIN_TREAD;
      // Balancé : 6 marches droites, 3 dansantes dans l'angle, 7 marches droites.
      case 'winder': return Lu >= 0.8 + 6 * MIN_TREAD && Lv >= 0.8 + 7 * MIN_TREAD;
      // Hélicoïdal : diamètre minimal courant d'un escalier de service intérieur.
      case 'helical': return Math.min(Lu, Lv) >= 1.6;
      default: return Lu >= STAIR_LANDING + 8 * 0.2 && Lv >= 1.5;
    }
  }
  /**
   * Géométrie complète : marches et paliers (rectangles en plan + hauteur du dessus, relative au niveau bas),
   * volées (pour les garde-corps), pied, milieu et arrivée, et la trajectoire de « Prendre l'escalier ».
   */
  function stairGeometry(s, floorHeight = 3) {
    const H = floorHeight, F = stairFrame(s), type = stairType(s), { Lu, Lv } = F;
    const upper = Math.max(1, Number(s.level) || 1);
    const rect = (u0, u1, v0, v1, y) => {
      const a = F.toWorld(u0, v0), b = F.toWorld(u1, v1);
      return { xMin: Math.min(a.x, b.x), xMax: Math.max(a.x, b.x), zMin: Math.min(a.z, b.z), zMax: Math.max(a.z, b.z), y };
    };
    // Marche polygonale (repère local) : polygone monde + emprise rectangulaire pour les tests rapides.
    const polyTread = (pts, y) => {
      const poly = pts.map(([u, v]) => { const p = F.toWorld(u, v); return [p.x, p.z]; });
      const xs = poly.map(p => p[0]), zs = poly.map(p => p[1]);
      return { xMin: Math.min(...xs), xMax: Math.max(...xs), zMin: Math.min(...zs), zMax: Math.max(...zs), y, poly };
    };
    const flights = [], landings = [];
    let bottomUV, topUV, midUV, outer;
    if (type === 'winder') {
      // Quart tournant balancé : les marches dansantes rayonnent depuis l'angle intérieur (le noyau).
      const w = Math.min(WINDER_WIDTH, Lu - 6 * MIN_TREAD, Lv - 7 * MIN_TREAD);
      const t1 = (Lu - w) / 6, t2 = (Lv - w) / 7, pivot = [Lu - w, w];
      // Rayon d'angle phi (0 = vers v = 0, 90° = vers u = Lu) jusqu'au bord extérieur du carré d'angle.
      const hit = phi => {
        const a = phi * Math.PI / 180;
        return phi <= 45 ? [Lu - w + w * Math.tan(a), 0] : [Lu, w - w / Math.tan(a)];
      };
      flights.push({ treads: Array.from({ length: 6 }, (_, i) => rect(i * t1, (i + 1) * t1, 0, w, (i + 1) * H / RISERS)) });
      flights.push({ winder: true, pivot: F.toWorld(...pivot), treads: [0, 1, 2].map(i => {
        const a0 = i * 30, a1 = (i + 1) * 30;
        const pts = [pivot, hit(a0)];
        if (a0 < 45 && a1 > 45) pts.push([Lu, 0]);
        pts.push(hit(a1));
        return polyTread(pts, (7 + i) * H / RISERS);
      }) });
      flights.push({ treads: Array.from({ length: 7 }, (_, i) => rect(Lu - w, Lu, w + i * t2, w + (i + 1) * t2, (10 + i) * H / RISERS)) });
      bottomUV = [-0.42, w / 2]; topUV = [Lu - w / 2, Lv + 0.55]; midUV = [Lu - w * 0.35, w * 0.35];
    } else if (type === 'helical') {
      // Hélicoïdal : 16 secteurs autour d'un poteau central, sur 330° (l'arrivée ne surplombe pas le départ).
      const R = Math.min(Lu, Lv) / 2 - 0.05, c = [Lu / 2, Lv / 2], step = HELIX_SWEEP / RISERS;
      const at = (deg, r) => { const a = deg * Math.PI / 180; return [c[0] + Math.cos(a) * r, c[1] + Math.sin(a) * r]; };
      const start = 180; // départ du côté u = 0, comme les autres types
      flights.push({ helical: true, centre: F.toWorld(...c), radius: R, treads: Array.from({ length: RISERS }, (_, i) => {
        const a0 = start + i * step, a1 = a0 + step;
        const outerArc = [0, 0.25, 0.5, 0.75, 1].map(k => at(a0 + (a1 - a0) * k, R));
        return polyTread([at(a0, HELIX_POST), ...outerArc, at(a1, HELIX_POST)], (i + 1) * H / RISERS);
      }) });
      // Pied et arrivée hors de la trémie : dans une trémie rectangulaire, les coins restent du vide à l'étage.
      const outside = (deg, gap) => {
        const a = deg * Math.PI / 180, du = Math.cos(a), dv = Math.sin(a);
        const exit = Math.min(du > 1e-9 ? (Lu - c[0]) / du : du < -1e-9 ? -c[0] / du : Infinity,
          dv > 1e-9 ? (Lv - c[1]) / dv : dv < -1e-9 ? -c[1] / dv : Infinity);
        return at(deg, Math.max(R + gap, exit + 0.35));
      };
      bottomUV = outside(start + step / 2, 0.42); topUV = outside(start + HELIX_SWEEP - step / 2, 0.55); midUV = at(start + HELIX_SWEEP / 2, R * 0.6);
    } else if (type === 'straight') {
      const t = Lu / RISERS, v0 = 0.06, v1 = Lv - 0.06;
      flights.push({ treads: Array.from({ length: RISERS }, (_, i) => rect(i * t, (i + 1) * t, v0, v1, (i + 1) * H / RISERS)), outerUV: [v0, v1] });
      bottomUV = [-0.42, Lv / 2]; topUV = [Lu + 0.55, Lv / 2]; midUV = [Lu / 2, Lv / 2];
    } else if (type === 'quarter') {
      const w = Math.min(1.0, Lu - 8 * MIN_TREAD, Lv - 8 * MIN_TREAD);
      const t1 = (Lu - w) / 8, t2 = (Lv - w) / 8;
      flights.push({ treads: Array.from({ length: 8 }, (_, i) => rect(i * t1, (i + 1) * t1, 0, w, (i + 1) * H / RISERS)), outerUV: [0, 0] });
      landings.push(rect(Lu - w, Lu, 0, w, H / 2));
      flights.push({ treads: Array.from({ length: 8 }, (_, i) => rect(Lu - w, Lu, w + i * t2, w + (i + 1) * t2, (9 + i) * H / RISERS)), outerUV: [Lu, Lu] });
      bottomUV = [-0.42, w / 2]; topUV = [Lu - w / 2, Lv + 0.55]; midUV = [Lu - w / 2, w / 2];
    } else {
      const width = (Lv - 0.12) / 2, t = (Lu - STAIR_LANDING) / 8;
      flights.push({ treads: Array.from({ length: 8 }, (_, i) => rect(i * t, (i + 1) * t, 0, width, (i + 1) * H / RISERS)), outerUV: [0, 0] });
      landings.push(rect(Lu - STAIR_LANDING, Lu, 0, Lv, H / 2));
      flights.push({ treads: Array.from({ length: 8 }, (_, i) => rect(Lu - STAIR_LANDING - (i + 1) * t, Lu - STAIR_LANDING - i * t, Lv - width, Lv, (9 + i) * H / RISERS)), outerUV: [Lv, Lv] });
      bottomUV = [-0.42, width / 2]; topUV = [-0.55, Lv - width / 2]; midUV = [Lu - STAIR_LANDING / 2, Lv / 2];
    }
    // Centre de marche : barycentre du polygone (marches tournantes, ligne de foulée), sinon du rectangle.
    const centre = r => r.poly
      ? v2(r.poly.reduce((s, p) => s + p[0], 0) / r.poly.length, r.poly.reduce((s, p) => s + p[1], 0) / r.poly.length)
      : v2((r.xMin + r.xMax) / 2, (r.zMin + r.zMax) / 2);
    const bottom = F.toWorld(...bottomUV), top = F.toWorld(...topUV), mid = F.toWorld(...midUV);
    const path = [{ x: bottom.x, y: 0, z: bottom.z }];
    flights.forEach((flight, k) => {
      flight.treads.forEach(r => { const c = centre(r); path.push({ x: c.x, y: r.y, z: c.z }); });
      if (landings[k]) { const c = centre(landings[k]); path.push({ x: c.x, y: landings[k].y, z: c.z }); }
    });
    path.push({ x: top.x, y: H, z: top.z });
    return { type, dir: F.dir, flights, landings, bottom, top, mid, path, lower: upper - 1, upper, rise: H };
  }
  /** Hauteur du dessus de marche ou de palier sous un point (relative au niveau bas), ou null. */
  function stairFloorAt(s, x, z, floorHeight = 3, margin = 0.08) {
    const g = stairGeometry(s, floorHeight);
    const inPoly = (poly) => {
      let isIn = false;
      for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const [xi, zi] = poly[i], [xj, zj] = poly[j];
        if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) isIn = !isIn;
      }
      return isIn;
    };
    const inside = r => x >= r.xMin - margin && x <= r.xMax + margin && z >= r.zMin - margin && z <= r.zMax + margin
      && (!r.poly || inPoly(r.poly));
    const landing = g.landings.find(inside);
    if (landing) return { y: landing.y, upperLevel: g.upper, onStair: true };
    let best = null;
    g.flights.forEach(f => f.treads.forEach(r => {
      if (!inside(r)) return;
      const cx = r.poly ? r.poly.reduce((s, p) => s + p[0], 0) / r.poly.length : (r.xMin + r.xMax) / 2;
      const cz = r.poly ? r.poly.reduce((s, p) => s + p[1], 0) / r.poly.length : (r.zMin + r.zMax) / 2;
      const d = Math.hypot(x - cx, z - cz);
      if (!best || d < best.d) best = { d, y: r.y };
    }));
    return best ? { y: best.y, upperLevel: g.upper, onStair: true } : null;
  }
  /** Pied et arrivée de l'escalier, en plan, avec le niveau bas et le niveau haut. */
  function stairEnds(s, floorHeight = 3) {
    const g = stairGeometry(s, floorHeight);
    return { bottom: g.bottom, top: g.top, mid: g.mid, lower: g.lower, upper: g.upper, geometry: g };
  }
  /** Passages par escalier : relient la pièce au pied de l'escalier à la pièce d'arrivée à l'étage. */
  function stairEdges(data) {
    const edges = [];
    (data.stairwells || []).filter(stairFits).forEach(s => {
      const ends = stairEnds(s);
      const onLevel = level => Object.assign({}, data, { rooms: (data.rooms || []).filter(r => (Number(r.level) || 0) === level) });
      const centre = v2((s.xMin + s.xMax) / 2, (s.zMin + s.zMax) / 2);
      const from = roomAtPoint(onLevel(ends.lower), ends.bottom.x, ends.bottom.z) || roomAtPoint(onLevel(ends.lower), centre.x, centre.z);
      const to = roomAtPoint(onLevel(ends.upper), ends.top.x, ends.top.z) || roomAtPoint(onLevel(ends.upper), centre.x, centre.z);
      if (from && to) edges.push({ a: from.id, b: to.id, p: ends.bottom, n: v2(1, 0), stair: s });
    });
    return edges;
  }
  /** Étapes caméra pour franchir l'escalier, à hauteur d'yeux : pied, palier, arrivée (ou l'inverse). */
  function stairWaypoints(s, floorHeight, goingUp, label) {
    const g = stairGeometry(s, floorHeight);
    const y0 = g.lower * floorHeight, H = floorHeight, eye = 1.65;
    // Point de la trajectoire situé à mi-hauteur (palier ou marche du milieu), et cibles du regard.
    const half = g.path.reduce((best, p) => Math.abs(p.y - H / 2) < Math.abs(best.y - H / 2) ? p : best, g.path[0]);
    // Au pied, le regard suit la volée : il vise la 5e marche (et non le haut d'une volée unique, à l'étage).
    const allTreads = g.flights.flatMap(f => f.treads);
    const firstTop = allTreads[Math.min(4, allTreads.length - 1)];
    const lastFlight = g.flights[g.flights.length - 1].treads;
    const lastTop = lastFlight[lastFlight.length - 1];
    const c = r => r.poly
      ? [r.poly.reduce((s, p) => s + p[0], 0) / r.poly.length, r.poly.reduce((s, p) => s + p[1], 0) / r.poly.length]
      : [(r.xMin + r.xMax) / 2, (r.zMin + r.zMax) / 2];
    const beyond = { x: g.top.x + (g.top.x - c(lastTop)[0]) * 2, z: g.top.z + (g.top.z - c(lastTop)[1]) * 2 };
    // Pied (regard le long de la première volée), milieu (regard vers l'arrivée), arrivée (regard vers l'étage).
    const up = [
      { pos: [g.bottom.x, y0 + eye, g.bottom.z], look: [c(firstTop)[0], y0 + firstTop.y + 1.3, c(firstTop)[1]] },
      { pos: [half.x, y0 + half.y + eye, half.z], look: [c(lastTop)[0], y0 + H + 1.2, c(lastTop)[1]] },
      { pos: [g.top.x, y0 + H + eye, g.top.z], look: [beyond.x, y0 + H + 1.4, beyond.z] }
    ];
    const below = { x: g.bottom.x + (g.bottom.x - c(firstTop)[0]), z: g.bottom.z + (g.bottom.z - c(firstTop)[1]) };
    const steps = goingUp ? up : up.slice().reverse().map((wp, i, all) => ({ pos: wp.pos, look: (all[i + 1] || { pos: [below.x, y0 + 1.65, below.z] }).pos.map((v, k) => k === 1 ? v - 0.25 : v) }));
    return steps.map(wp => ({ pos: wp.pos.map(n => Math.round(n * 1000) / 1000), look: wp.look.map(n => Math.round(n * 1000) / 1000), fov: 60, label, stair: true }));
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
      const candidates = [0.2, 0.5, 0.8].flatMap(u => [0.8, 0.5, 0.2].map(v => v2(
        b.xMin + (b.xMax - b.xMin) * u, b.zMin + (b.zMax - b.zMin) * v)));
      candidates.unshift(v2(b.xMin + Math.min(0.5, (b.xMax - b.xMin) * 0.2), b.zMax - Math.min(0.5, (b.zMax - b.zMin) * 0.2)));
      cam = candidates.find(p => contains(r, p.x, p.z) && Math.hypot(p.x - c.x, p.z - c.z) > 0.1) || c;
    }
    const look = v2(c.x + (c.x - cam.x) * 0.9, c.z + (c.z - cam.z) * 0.9);
    if (Math.hypot(look.x - cam.x, look.z - cam.z) < 0.001) look.z += 1;
    return { cam, look };
  }

  // ---------------------------------------------------------------------------
  // ESPACES DE CIRCULATION NON DESSINÉS (couloir, dégagement oublié dans la liste des pièces)
  // Une porte qui ouvre sur un endroit sans pièce, mais enfermé de murs dans les quatre directions,
  // donne sur un espace intérieur : on le reconstitue (rectangle grandi jusqu'aux murs et aux pièces).
  // Ces espaces servent au graphe de circulation ; ils n'entrent ni dans les surfaces ni dans le métré.
  // ---------------------------------------------------------------------------
  function segDistance(w, x, z) {
    const ax = w.from[0], az = w.from[1], dx = w.to[0] - ax, dz = w.to[1] - az;
    const L2 = dx * dx + dz * dz || 1;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L2));
    return Math.hypot(x - (ax + dx * t), z - (az + dz * t));
  }
  function inferCirculation(data) {
    const found = [];
    const levels = [...new Set((data.walls || []).map(w => Number(w.level) || 0))];
    levels.forEach(level => {
      const walls = (data.walls || []).filter(w => (Number(w.level) || 0) === level);
      const rooms = (data.rooms || []).filter(r => (Number(r.level) || 0) === level);
      if (!walls.length) return;
      const wb = bbox({ walls, rooms });
      const inWall = (x, z) => walls.some(w => segDistance(w, x, z) < (w.thick || 0.15) / 2 - 0.01);
      const inRoom = (x, z) => rooms.find(r => contains(r, x, z));
      // Enfermé : dans chaque direction, un mur avant de sortir de l'emprise.
      const enclosed = (x, z) => [[1, 0], [-1, 0], [0, 1], [0, -1]].every(([dx, dz]) => {
        for (let t = 0.1; ; t += 0.1) {
          const px = x + dx * t, pz = z + dz * t;
          if (px < wb.xMin - 0.5 || px > wb.xMax + 0.5 || pz < wb.zMin - 0.5 || pz > wb.zMax + 0.5) return false;
          if (inWall(px, pz)) return true;
        }
      });
      walls.forEach(w => (w.openings || []).forEach(op => {
        if (op.type !== 'door' && op.type !== 'open') return;
        const f = openingFrame(w, op), d = (w.thick || 0.15) / 2 + 0.3;
        [1, -1].forEach(side => {
          const p = v2(f.p.x + f.n.x * d * side, f.p.z + f.n.z * d * side);
          if (inRoom(p.x, p.z) || found.some(v => v.level === level && contains(v, p.x, p.z)) || !enclosed(p.x, p.z)) return;
          // Croissance du rectangle, côté par côté, tant que la bande ajoutée est libre (ni mur, ni pièce).
          const b = { xMin: p.x - 0.05, xMax: p.x + 0.05, zMin: p.z - 0.05, zMax: p.z + 0.05 };
          const stop = {};
          const free = (x, z) => !inWall(x, z) && !inRoom(x, z);
          const strip = (key) => {
            const step = 0.05, horiz = key === 'xMin' || key === 'xMax';
            const c = b[key] + (key.endsWith('Min') ? -step : step);
            const [lo, hi] = horiz ? [b.zMin, b.zMax] : [b.xMin, b.xMax];
            for (let t = lo; t <= hi + 1e-9; t += Math.max(0.05, (hi - lo) / 12)) {
              const x = horiz ? c : t, z = horiz ? t : c;
              if (!free(x, z)) { stop[key] = inRoom(x, z) ? 'room' : 'wall'; return false; }
            }
            b[key] = c; return true;
          };
          let grown = true;
          for (let i = 0; grown && i < 400; i++) {
            grown = false;
            for (const key of ['xMin', 'xMax', 'zMin', 'zMax']) if (!stop[key] && strip(key)) grown = true;
            if (b.xMax - b.xMin > 15 || b.zMax - b.zMin > 15) return; // pas un couloir : un vide mal fermé
          }
          // Les pièces du projet vont jusqu'à l'axe des murs : on y aligne aussi l'espace reconstitué.
          const snap = (key, value) => {
            const dir = key.endsWith('Min') ? -1 : 1, horiz = key === 'xMin' || key === 'xMax';
            const probe = 0.06 + 0.15;
            const room = rooms.find(r => contains(r, horiz ? value + dir * probe : (b.xMin + b.xMax) / 2, horiz ? (b.zMin + b.zMax) / 2 : value + dir * probe));
            if (room) return room.bounds[horiz ? (dir < 0 ? 'xMax' : 'xMin') : (dir < 0 ? 'zMax' : 'zMin')];
            const wall = walls.filter(wl => horiz ? Math.abs(wl.from[0] - wl.to[0]) < 0.01 : Math.abs(wl.from[1] - wl.to[1]) < 0.01)
              .map(wl => horiz ? wl.from[0] : wl.from[1]).filter(c => (c - value) * dir >= -0.01 && Math.abs(c - value) < 0.3)
              .sort((a, c) => Math.abs(a - value) - Math.abs(c - value))[0];
            return wall !== undefined ? wall : value;
          };
          for (const key of ['xMin', 'xMax', 'zMin', 'zMax']) b[key] = Math.round(snap(key, b[key]) * 100) / 100;
          const w = b.xMax - b.xMin, dpt = b.zMax - b.zMin;
          if (w < 0.6 || dpt < 0.6) return;
          found.push({ id: `auto-circulation-${level}-${found.length + 1}`, name: 'DÉGAGEMENT', level, bounds: b, xMin: b.xMin, xMax: b.xMax, zMin: b.zMin, zMax: b.zMax,
            habitable: false, auto: true, center: v2((b.xMin + b.xMax) / 2, (b.zMin + b.zMax) / 2), area: Math.round(w * dpt * 100) / 100 });
        });
      }));
    });
    return found;
  }

  // ---------------------------------------------------------------------------
  // TOITURE AUTOMATIQUE — seulement si aucune toiture n'a été tracée au dernier niveau.
  // config.roofStyle : 'auto' (défaut = toit-terrasse) | 'hip' (4 pans) | 'flat' (toit-terrasse) | 'none'.
  // ---------------------------------------------------------------------------
  const OPEN_SPACE = /terrasse|balcon|v[ée]randa|porche|perron|cour|jardin|all[ée]e|pergola|auvent/i;
  function roofFootprint(data) {
    const top = Math.max(0, ...(data.walls || []).map(w => Number(w.level) || 0));
    const ext = Math.max(0.1, ...(data.walls || []).filter(w => w.type === 'ext').map(w => (w.thick || 0.25) / 2));
    // Pièces couvertes : rectangle élargi jusqu'au nu extérieur des murs, ou polygone (pièce en L…).
    const rects = (data.rooms || []).filter(r => (Number(r.level) || 0) === top && !OPEN_SPACE.test(r.name || '') && r.bounds)
      .map(r => Object.assign({ xMin: r.bounds.xMin - ext, xMax: r.bounds.xMax + ext, zMin: r.bounds.zMin - ext, zMax: r.bounds.zMax + ext },
        Array.isArray(r.poly) && r.poly.length >= 3 ? { poly: r.poly } : {}));
    if (!rects.length) return null;
    const box = { xMin: Math.min(...rects.map(r => r.xMin)), xMax: Math.max(...rects.map(r => r.xMax)), zMin: Math.min(...rects.map(r => r.zMin)), zMax: Math.max(...rects.map(r => r.zMax)) };
    const inPoly = (poly, x, z) => typeof pointInPolygon === 'function' ? pointInPolygon(poly, x, z) : true;
    const covers = (r, x, z) => x >= r.xMin && x <= r.xMax && z >= r.zMin && z <= r.zMax && (!r.poly || inPoly(r.poly, x, z));
    // Part de l'emprise réellement bâtie (échantillonnage à 20 cm).
    let inside = 0, total = 0;
    for (let x = box.xMin + 0.1; x < box.xMax; x += 0.2) for (let z = box.zMin + 0.1; z < box.zMax; z += 0.2) {
      total++; if (rects.some(r => covers(r, x, z))) inside++;
    }
    return { level: top, rects, box, fill: total ? inside / total : 0 };
  }
  function hasDrawnRoof(data, level) {
    const fp = roofFootprint(data);
    if (!fp) return true;
    const area = (fp.box.xMax - fp.box.xMin) * (fp.box.zMax - fp.box.zMin);
    const covered = (data.canopies || []).filter(c => !c.auto && (c.type === 'hip' || c.type === 'slab') && (Number(c.level) || 0) >= level - 1)
      .reduce((s, c) => s + Math.max(0, Math.min(c.xMax, fp.box.xMax) - Math.max(c.xMin, fp.box.xMin)) * Math.max(0, Math.min(c.zMax, fp.box.zMax) - Math.max(c.zMin, fp.box.zMin)), 0);
    return covered >= area * 0.5;
  }
  function hipRoof(b, overhang = 0.6, pitchDeg = 27) {
    const x0 = b.xMin - overhang, x1 = b.xMax + overhang, z0 = b.zMin - overhang, z1 = b.zMax + overhang;
    const w = x1 - x0, d = z1 - z0, rise = Math.tan(pitchDeg * Math.PI / 180) * Math.min(w, d) / 2;
    const r2v = n => Math.round(n * 1000) / 1000;
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    const ridge = w >= d
      ? [[x0 + d / 2, rise, cz], [x1 - d / 2, rise, cz]]
      : [[cx, rise, z0 + w / 2], [cx, rise, z1 - w / 2]];
    const vertices = [[x0, 0, z0], [x1, 0, z0], [x1, 0, z1], [x0, 0, z1], ...ridge].map(p => p.map(r2v));
    // 0 A(nord-ouest) 1 B(nord-est) 2 C(sud-est) 3 D(sud-ouest) 4 R1 5 R2
    const faces = w >= d ? [[0, 4, 5, 1], [3, 2, 5, 4], [0, 3, 4], [1, 5, 2]] : [[0, 3, 5, 4], [1, 4, 5, 2], [0, 4, 1], [3, 2, 5]];
    return { xMin: r2v(x0), xMax: r2v(x1), zMin: r2v(z0), zMax: r2v(z1), vertices, faces, rise: r2v(rise) };
  }
  /** Toiture(s) à ajouter en 3D, ou [] si une toiture est déjà tracée ou si le style est « aucune ». */
  function autoRoof(data) {
    const style = ['hip', 'flat', 'none'].includes(data.config?.roofStyle) ? data.config.roofStyle : 'auto';
    if (style === 'none') return [];
    const fp = roofFootprint(data);
    if (!fp || hasDrawnRoof(data, fp.level)) return [];
    const y = Number(data.config?.wallHeight) || 2.8;
    // Par défaut, toit-terrasse : il suit exactement l'emprise dessinée sans inventer de volume.
    // Une toiture à pentes change la silhouette du projet : elle reste un choix explicite (« 4 pans »).
    if (style === 'hip') {
      return [Object.assign({ type: 'hip', name: 'Toiture automatique — 4 pans', level: fp.level, y, color: '#4A524C', auto: true }, hipRoof(fp.box))];
    }
    // Toit-terrasse : une dalle par volume bâti, léger débord, teinte enduit clair.
    const slabs = fp.rects.map((r, i) => Object.assign({ type: 'slab', name: `Toit-terrasse automatique ${i + 1}`, level: fp.level, y, thick: 0.3, color: '#E6E1D6', auto: true,
      xMin: r.xMin - 0.2, xMax: r.xMax + 0.2, zMin: r.zMin - 0.2, zMax: r.zMax + 0.2 }, r.poly ? { poly: r.poly.map(p => [p[0], p[1]]) } : {}));
    return slabs.concat(parapets(slabs, fp.level, y + 0.3));
  }

  /**
   * Acrotère : muret de 45 cm × 15 cm sur les seuls bords libres de la toiture-terrasse.
   * Un bord partagé entre deux volumes (dalles jointives) n'en reçoit pas. Les dalles polygonales
   * (pièce en L décrite par un contour) suivent leur contour réel.
   */
  function parapets(slabs, level, y) {
    const T = 0.15, H = 0.45, STEP = 0.1;
    const covered = (x, z, self) => slabs.some(o => o !== self && x >= o.xMin - 1e-6 && x <= o.xMax + 1e-6 && z >= o.zMin - 1e-6 && z <= o.zMax + 1e-6
      && (!o.poly || (typeof pointInPolygon !== 'function' || pointInPolygon(o.poly, x, z))));
    const out = [];
    const push = (x0, z0, x1, z1) => {
      if (Math.hypot(x1 - x0, z1 - z0) < 0.3) return;
      const r = n => Math.round(n * 1000) / 1000;
      // Segment axial (les toitures automatiques sont orthogonales) : boîte de 15 cm d'épaisseur.
      const alongX = Math.abs(z1 - z0) < Math.abs(x1 - x0);
      out.push({ type: 'slab', name: 'Acrotère', level, y, thick: H, color: '#E6E1D6', auto: true, parapet: true,
        xMin: r(alongX ? Math.min(x0, x1) : x0 - T / 2), xMax: r(alongX ? Math.max(x0, x1) : x0 + T / 2),
        zMin: r(alongX ? z0 - T / 2 : Math.min(z0, z1)), zMax: r(alongX ? z0 + T / 2 : Math.max(z0, z1)) });
    };
    slabs.forEach(s => {
      const outline = s.poly
        ? s.poly.map((p, i) => [p, s.poly[(i + 1) % s.poly.length]])
        : [[[s.xMin, s.zMin], [s.xMax, s.zMin]], [[s.xMax, s.zMin], [s.xMax, s.zMax]], [[s.xMax, s.zMax], [s.xMin, s.zMax]], [[s.xMin, s.zMax], [s.xMin, s.zMin]]];
      const cx = (s.xMin + s.xMax) / 2, cz = (s.zMin + s.zMax) / 2;
      outline.forEach(([a, b]) => {
        const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
        if (len < 0.3 || (Math.abs(a[0] - b[0]) > 1e-6 && Math.abs(a[1] - b[1]) > 1e-6)) return; // bords obliques ignorés
        // Normale vers l'extérieur de la dalle.
        let nx = -(b[1] - a[1]) / len, nz = (b[0] - a[0]) / len;
        const mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2;
        if ((mx - cx) * nx + (mz - cz) * nz < 0) { nx = -nx; nz = -nz; }
        // Morceaux du bord qui ne donnent pas sur une autre dalle.
        let runStart = null, last = null;
        const n = Math.max(1, Math.round(len / STEP));
        for (let k = 0; k <= n; k++) {
          const t = k / n, x = a[0] + (b[0] - a[0]) * t, z = a[1] + (b[1] - a[1]) * t;
          const free = !covered(x + nx * 0.05, z + nz * 0.05, s);
          if (free && runStart === null) runStart = [x, z];
          if (!free && runStart) { push(runStart[0], runStart[1], last[0], last[1]); runStart = null; }
          last = [x, z];
        }
        if (runStart) push(runStart[0], runStart[1], last[0], last[1]);
      });
    });
    return out;
  }

  /** Diagnostic pour l'éditeur : pièces non reliées à l'entrée, couloirs non dessinés, toiture. */
  function diagnose(data) {
    const copy = JSON.parse(JSON.stringify(data));
    delete copy.tourWaypoints; delete copy.renderShots;
    if (typeof normalizeHouseData === 'function') normalizeHouseData(copy);
    const voids = inferCirculation(copy);
    const graph = graphFor(copy, voids);
    const bb = bbox(copy), entry = findEntry(copy, bb);
    const ground = Object.assign({}, copy, { rooms: graph.rooms.filter(r => (Number(r.level) || 0) === 0) });
    const start = roomAtPoint(ground, entry.p.x - entry.out.x * 0.6, entry.p.z - entry.out.z * 0.6);
    const unreachable = copy.rooms.filter(r => r.habitable && r.area >= 2 && (!start || doorPath(graph.edges, start.id, r.id) === null));
    const roof = autoRoof(copy), fp = roofFootprint(copy);
    return { entryRoom: start ? start.name : null, unreachable: unreachable.map(r => ({ id: r.id, name: r.name, level: r.level })), voids, roof, footprintFill: fp ? Math.round(fp.fill * 100) / 100 : null };
  }

  /** Graphe de circulation complet : portes de chaque niveau, extérieurs d'étage distincts, escaliers, couloirs reconstitués. */
  function graphFor(data, voids) {
    const graphData = Object.assign({}, data, { rooms: (data.rooms || []).concat(voids) });
    const levels = [...new Set([0, ...graphData.rooms.map(r => Number(r.level) || 0)])].sort((a, b) => a - b);
    const edges = levels.flatMap(level => doorGraph(graphData, level).map(e => level === 0 ? e : Object.assign(e, {
      a: e.a === 'outside' ? `outside-${level}` : e.a, b: e.b === 'outside' ? `outside-${level}` : e.b
    }))).concat(stairEdges(graphData));
    return { rooms: graphData.rooms, edges, data: graphData };
  }

  function complete(data) {
    const cfg = data.config;
    const roofs = autoRoof(data);
    if (roofs.length) data.canopies = (data.canopies || []).concat(roofs);
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

    // Ordre de visite : plus proche voisin en nombre de portes, puis en distance, depuis l'entrée.
    // Chaque niveau a son graphe de portes ; les escaliers relient les niveaux entre eux.
    // L'extérieur d'un étage (balcon, terrasse haute) n'est pas celui du jardin : nœud distinct par niveau,
    // pour qu'aucun chemin ne « saute » d'un balcon au rez-de-chaussée. Les couloirs non dessinés sont
    // reconstitués pour relier les pièces qui ouvrent dessus.
    const graph = graphFor(data, inferCirculation(data));
    const edges = graph.edges, graphRooms = graph.rooms;
    const groundData = Object.assign({}, data, { rooms: graphRooms.filter(r => (Number(r.level) || 0) === 0) });
    const startRoom = roomAtPoint(groundData, entry.p.x - out.x * 0.6, entry.p.z - out.z * 0.6);
    // Parcours en profondeur du graphe des pièces depuis l'entrée : on visite d'abord les petites branches
    // (culs-de-sac voisins), puis on continue — comme un agent immobilier qui fait visiter.
    const order = [];
    const visitable = new Set(rooms.filter(r => r.area >= 5).map(r => r.id));
    const byId = new Map(graphRooms.map(r => [r.id, r]));
    const adj = new Map();
    edges.forEach(e => {
      if (String(e.a).startsWith('outside') || String(e.b).startsWith('outside')) return;
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
    // Pièces non reliées par le graphe (porte non tracée) : visitées avec leur niveau, par proximité, à la fin
    // de la séquence de ce niveau — jamais en sautant d'un étage à l'autre sans escalier.
    const rest = rooms.filter(r => r.area >= 5 && !order.includes(r));
    const levelOfRoom = r => Number(r.level) || 0;
    [...new Set(rest.map(levelOfRoom))].forEach(level => {
      const pending = rest.filter(r => levelOfRoom(r) === level);
      const first = order.findIndex(r => levelOfRoom(r) === level);
      let at = first;
      if (at >= 0) while (at + 1 < order.length && levelOfRoom(order[at + 1]) === level) at++;
      let curP = at >= 0 ? order[at].center : (order.length ? order[order.length - 1].center : entry.p);
      const chain = [];
      while (pending.length) {
        pending.sort((a, b) => Math.hypot(a.center.x - curP.x, a.center.z - curP.z) - Math.hypot(b.center.x - curP.x, b.center.z - curP.z));
        const r = pending.shift();
        chain.push(r);
        curP = r.center;
      }
      order.splice(at >= 0 ? at + 1 : order.length, 0, ...chain);
    });
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
      const fh = Number(cfg.floorHeight) || 3;
      // Niveau d'un nœud du graphe : pièce, ou extérieur d'un étage (« outside-1 » = terrasse, balcon).
      const levelOf = id => /^outside-\d+$/.test(id) ? Number(id.slice(8)) : Number(graphRooms.find(x => x.id === id)?.level) || 0;
      // Dernière pièce reliée au graphe : point de départ des chemins quand la pièce courante est isolée
      // (porte manquante), pour que l'escalier reste emprunté.
      // Seules les pièces atteignables depuis l'entrée peuvent servir d'ancre.
      let anchor = at;
      const fromEntry = id => !startRoom || doorPath(edges, startRoom.id, id) !== null;
      order.forEach(r => {
        const floorY = (Number(r.level) || 0) * fh;
        let path = doorPath(edges, at, r.id);
        if (!path && anchor !== at) path = doorPath(edges, anchor, r.id);
        if (path && fromEntry(r.id)) anchor = r.id;
        if (path) path.forEach(step => {
          const from = step.edge.a === step.into ? step.edge.b : step.edge.a;
          if (step.edge.stair) {
            // Montée (ou descente) réelle par l'escalier : pied, palier, arrivée.
            const goingUp = levelOf(step.into) > levelOf(from);
            wp.push(...stairWaypoints(step.edge.stair, fh, goingUp, goingUp ? 'MONTÉE À L’ÉTAGE' : 'DESCENTE'));
            lastDoor = null;
            return;
          }
          const into = graphRooms.find(x => x.id === step.into);
          const target = (into || r).center;
          // Une porte appartient au niveau de la pièce dans laquelle elle fait entrer.
          const doorY = levelOf(step.into) * fh;
          wp.push({ pos: [step.edge.p.x, doorY + 1.65, step.edge.p.z], look: [target.x, doorY + 1.4, target.z], fov: 60, label: r.name });
          lastDoor = step.edge;
        });
        const p = roomPose(graph.data, r, path && path.length ? lastDoor : (at === r.id ? lastDoor : null));
        wp.push({ pos: [p.cam.x, floorY + 1.65, p.cam.z], look: [p.look.x, floorY + 1.25, p.look.z], fov: 62, label: r.name, room: r.id });
        at = r.id;
      });
      const last = wp[wp.length - 1];
      wp.push({ pos: [last.pos[0], Math.max(5.0, last.pos[1] + 3.4), last.pos[2]], look: [bb.cx, 0, bb.cz], fov: 55, label: 'ENVOL' });
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

  /**
   * Empreinte de tout ce dont dépend le parcours : murs et ouvertures, pièces, trémies, hauteur d'étage.
   * Arrondie au centimètre ; change dès qu'une porte bouge ou qu'une pièce est redessinée.
   */
  function geometryVersion(data) {
    const cm = n => Math.round((Number(n) || 0) * 100);
    const pt = p => Array.isArray(p) ? p.map(cm) : [];
    const source = JSON.stringify({
      h: cm(data?.config?.floorHeight || 3),
      w: (data?.walls || []).map(w => [pt(w.from), pt(w.to), Number(w.level) || 0, cm(w.thick),
        (w.openings || []).map(o => [o.type, cm(o.at), cm(o.w), o.entry ? 1 : 0])]),
      r: (data?.rooms || []).map(r => [r.id, Number(r.level) || 0, r.habitable === false ? 0 : 1,
        ['xMin', 'xMax', 'zMin', 'zMax'].map(k => cm(r.bounds?.[k])), (r.poly || []).map(pt)]),
      s: (data?.stairwells || []).map(s => [Number(s.level) || 1, ...['xMin', 'xMax', 'zMin', 'zMax'].map(k => cm(s[k]))])
    });
    let hash = 0x811c9dc5;
    for (let i = 0; i < source.length; i++) { hash ^= source.charCodeAt(i); hash = Math.imul(hash, 0x01000193); }
    return (hash >>> 0).toString(16).padStart(8, '0');
  }

  return { complete, bbox, doorGraph, doorPath, findEntry, roomPose, exteriorSide, northAngle, stairGeometry, stairFloorAt, stairFits, stairEnds, stairEdges, stairWaypoints, geometryVersion, STAIR_TYPES, STAIR_DIRS, inferCirculation, autoRoof, roofFootprint, diagnose };
})();
window.HouseAuto = HouseAuto;

// --- Chargement synchrone du projet demandé (avant la construction de la scène) ---
(function loadProject() {
  if (typeof HOUSE_DATA === 'undefined' || typeof XMLHttpRequest === 'undefined') return;
  const params = new URLSearchParams(location.search);
  const requested = params.get('project');
  let name = window.PORTAL_CONTEXT?.project || requested || 'residence-verandas';
  window.ACTIVE_PROJECT_SLUG = /^[a-z0-9-]{1,60}$/.test(name) ? name : 'villa-serena';
  if (!/^[a-z0-9-]{1,60}$/.test(name)) { console.warn('Nom de projet invalide :', name); return; }
  const xhr = new XMLHttpRequest();
  xhr.open('GET', `projects/${name}/project.json?t=${Date.now()}`, false);
  try { xhr.send(); } catch (e) { console.warn('Projet introuvable :', name); }
  if (xhr.status !== 200 && !window.PORTAL_CONTEXT?.project && name !== 'villa-serena' && !requested) {
    name = 'villa-serena';
    window.ACTIVE_PROJECT_SLUG = name;
    xhr.open('GET', `projects/${name}/project.json?t=${Date.now()}`, false);
    try { xhr.send(); } catch (e) { console.warn('Projet introuvable :', name); }
  }
  if (xhr.status !== 200) {
    if (window.PORTAL_CONTEXT?.role) {
      window.PROJECT_ACCESS_FAILED = true;
      location.replace('portal.html?session=inaccessible');
    } else console.warn('Projet introuvable :', name);
    return;
  }

  let p;
  try {
    p = JSON.parse(xhr.responseText);
    if (!Array.isArray(p?.walls) || !Array.isArray(p?.rooms)) throw new Error('Murs ou pièces manquants');
  } catch (error) {
    window.PROJECT_DATA_INVALID = true;
    console.warn('Impossible de lire le projet :', error.message);
    return;
  }
  try { localStorage.setItem('lastProject', name); } catch { /* stockage facultatif */ }
  if (window.PORTAL_CONTEXT?.role && globalThis.crypto?.subtle) {
    const serverHash = xhr.getResponseHeader('X-Project-Model-Hash');
    if (serverHash && /^[a-f0-9]{64}$/.test(serverHash)) window.PROJECT_MODEL_HASH = Promise.resolve(serverHash);
    else {
      const bytes = new TextEncoder().encode(xhr.responseText);
      window.PROJECT_MODEL_HASH = crypto.subtle.digest('SHA-256', bytes)
        .then(buffer => Array.from(new Uint8Array(buffer), byte => byte.toString(16).padStart(2, '0')).join(''))
        .catch(() => null);
    }
  }
  const baseConfig = Object.assign({}, HOUSE_DATA.config);
  delete baseConfig.walkStart; delete baseConfig.walkBounds; delete baseConfig.planImage;
  const baseAssets = HOUSE_DATA.assets;

  Object.keys(HOUSE_DATA).forEach(k => delete HOUSE_DATA[k]);
  Object.assign(HOUSE_DATA, p);
  HOUSE_DATA.config = Object.assign(baseConfig, p.config || {});
  HOUSE_DATA.assets = p.assets || baseAssets;
  HOUSE_DATA.meta = Object.assign({ name: name.toUpperCase(), slug: name }, p.meta || {});

  try {
    normalizeHouseData(HOUSE_DATA);
    HouseAuto.complete(HOUSE_DATA);
  } catch (error) {
    window.PROJECT_DATA_INVALID = true;
    console.warn('Géométrie du projet invalide :', error.message);
    return;
  }

})();
