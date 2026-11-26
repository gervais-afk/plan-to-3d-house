/**
 * LECTURE AUTOMATIQUE DU PLAN PAR IA (OpenRouter, via le relais local /api/ai/chat de serve.js)
 * Le modèle renvoie la géométrie en pixels de l'image ; on la valide avec AITopology,
 * on la convertit en mètres depuis l'échelle calibrée (touche K, obligatoire), puis on
 * consigne tout élément écarté dans la liste structurée « À vérifier » avant validation.
 */
(() => {
  'use strict';

  const isBrowser = typeof window !== 'undefined' && typeof document !== 'undefined';
  const Topology = (typeof AITopology !== 'undefined' && AITopology)
    || (isBrowser && window.AITopology)
    || (typeof require === 'function' ? require('./aiTopology.js') : null);
  const Review = (isBrowser && window.PlanProposalReview)
    || (typeof require === 'function' ? require('./planProposalReview.js') : null);

  // Modèles vision recommandés (prix OpenRouter du 18/11/2026, par million de tokens)
  const MODELS = [
    { id: 'anthropic/claude-sonnet-5.5', label: 'Claude Sonnet 5.5 — recommandé (≈ 0,05 $/plan)' },
    { id: 'google/gemini-3.5-flash', label: 'Gemini 3.5 Flash — rapide (≈ 0,04 $/plan)' },
    { id: 'openai/gpt-6.2-sol', label: 'GPT-6.2 Sol — alternative (≈ 0,05 $/plan)' },
    { id: 'openai/gpt-6-luna', label: 'GPT-6 Luna — très économique (< 0,01 $/plan)' },
    { id: 'anthropic/claude-opus-5.5', label: 'Claude Opus 5.5 — plans difficiles (≈ 0,10 $/plan)' }
  ];

  const FURN_MAP = {
    sofa: 'Canapé 3 places', armchair: 'Fauteuil', coffee_table: 'Table basse', dining_table: 'Table à manger', chair: 'Chaise',
    bed_double: 'Lit double 160', bed_single: 'Lit simple 90', nightstand: 'Chevet', wardrobe: 'Armoire', kitchen_counter: 'Plan de travail',
    fridge: 'Réfrigérateur', toilet: 'Cuvette WC', sink: 'Lave-mains', shower: 'Douche', bathtub: 'Baignoire', tv_unit: 'Meuble TV',
    plant: 'Plante', desk: 'Bureau', shelves: 'Étagères', sideboard: 'Buffet', rug: 'Tapis'
  };

  const DEFAULT_HELPERS = {
    round: (v, s = 0.01) => Math.round(Math.round(v / s) * s * 1000) / 1000,
    r2: v => Math.round(v * 100) / 100,
    wallLen: w => Math.hypot(w.to[0] - w.from[0], w.to[1] - w.from[1]),
    slugify: s => (s || 'projet').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'projet',
    projectOnWall(w, pt) {
      const ax = w.from[0], az = w.from[1];
      const dx = w.to[0] - ax, dz = w.to[1] - az;
      const L2 = dx * dx + dz * dz || 1;
      let t = ((pt.x - ax) * dx + (pt.z - az) * dz) / L2;
      t = Math.max(0, Math.min(1, t));
      const px = ax + dx * t, pz = az + dz * t;
      return { t, at: t * Math.sqrt(L2), dist: Math.hypot(pt.x - px, pt.z - pz), x: px, z: pz };
    },
    OPENINGS: {
      door: { type: 'door', w: 0.85, h: 2.1, sill: 0, hinge: 'start', side: 1 },
      window: { type: 'window', w: 1.2, h: 1.25, sill: 0.95 },
      open: { type: 'open', w: 1.4, h: 2.4, sill: 0 }
    },
    FURNITURE: [
      { name: 'Canapé 3 places', model: 'sofa', w: 1.8, d: 0.9, h: 0.8, color: '#6b6560' },
      { name: 'Fauteuil', model: 'sofa', w: 0.9, d: 0.85, h: 0.8, color: '#6b6560' },
      { name: 'Table basse', model: 'coffeeTable', w: 1.2, d: 0.6, h: 0.4, color: '#967856' },
      { name: 'Meuble TV', w: 1.8, d: 0.45, h: 0.5, color: '#2b2c2e' },
      { name: 'Tapis', w: 2.4, d: 1.7, h: 0.02, color: '#e8e0d2' },
      { name: 'Table à manger', model: 'diningTable', w: 0.9, d: 1.8, h: 0.76, color: '#8a6a4a' },
      { name: 'Chaise', model: 'chair', w: 0.45, d: 0.45, h: 0.9, color: '#2e2f31' },
      { name: 'Buffet', w: 1.6, d: 0.45, h: 0.8, color: '#5b4632' },
      { name: 'Plan de travail', w: 2.4, d: 0.6, h: 0.9, color: '#3b3f44' },
      { name: 'Réfrigérateur', model: 'fridge', w: 0.65, d: 0.65, h: 1.85, color: '#d7d9db' },
      { name: 'Lit double 160', model: 'bed', w: 1.6, d: 2.0, h: 0.5, color: '#d9d4cc' },
      { name: 'Lit simple 90', model: 'bed', w: 0.9, d: 2.0, h: 0.5, color: '#d9d4cc' },
      { name: 'Chevet', model: 'nightstand', w: 0.45, d: 0.4, h: 0.5, color: '#8a6a4a' },
      { name: 'Armoire', w: 1.2, d: 0.6, h: 2.2, color: '#efebe4' },
      { name: 'Bureau', model: 'diningTable', w: 1.2, d: 0.6, h: 0.75, color: '#8a6a4a' },
      { name: 'Cuvette WC', model: 'toilet', w: 0.4, d: 0.62, h: 0.42, color: '#f7f7f5' },
      { name: 'Lave-mains', w: 0.5, d: 0.35, h: 0.15, elev: 0.78, color: '#f7f7f5' },
      { name: 'Douche', w: 0.9, d: 0.9, h: 0.05, color: '#e8ecee' },
      { name: 'Baignoire', w: 1.7, d: 0.75, h: 0.55, color: '#f5f6f6' },
      { name: 'Plante', model: 'plantTall', w: 0.5, d: 0.5, h: 1.2, color: '#4f6b3a' },
      { name: 'Étagères', w: 1.1, d: 0.4, h: 1.8, color: '#8d8f91' }
    ]
  };

  const CALIBRATION_REQUIRED_MSG = 'Échelle non calibrée : calibrez d’abord le plan sur une cote réelle (touche K) avant de lancer la lecture IA.';

  function isPlanCalibrated(pi) {
    return !!(pi && pi.calibrated === true && Number.isFinite(pi.pxPerMeter) && pi.pxPerMeter > 0);
  }

  function assertCalibrated(pi) {
    if (!isPlanCalibrated(pi)) throw new Error(CALIBRATION_REQUIRED_MSG);
    return pi.pxPerMeter;
  }

  const INSTRUCTIONS = (W, H, withFurniture) => `You are an expert architect reading a 2D residential floor plan image (${W} × ${H} pixels).
Extract its geometry precisely. Return ONLY one JSON object, no prose, with this exact shape:
{
  "scale": { "reference": "a dimension annotation read on the plan if visible, or null" },
  "walls": [ { "x1": n, "y1": n, "x2": n, "y2": n, "kind": "exterior" | "interior" } ],
  "openings": [ { "kind": "door" | "window" | "opening", "x": n, "y": n, "width": n } ],
  "rooms": [ { "name": "label as written on the plan", "polygon": [[x, y], ...], "floor": "parquet" | "tiles" | "stone" | "concrete", "habitable": true | false } ],
  "columns": [ { "x": n, "y": n, "size": n } ],
  "uncertainZones": [ { "label": "short zone name", "reason": "blurry | undimensioned | occluded", "x": n, "y": n, "width": n, "height": n } ]${withFurniture ? `,
  "furniture": [ { "type": "${Object.keys(FURN_MAP).join('" | "')}", "x": n, "y": n, "width": n, "depth": n, "rotation": 0 | 90 | 180 | 270 } ]` : ''}
}
Rules:
- All coordinates are PIXELS of the given image: origin top-left, x to the right, y downwards. Be precise to a few pixels.
- Walls: the CENTERLINE of every wall. One entry per straight run between corners/junctions. A wall runs continuously THROUGH its doors and windows (do not split it at openings). Exterior walls form the thick outer perimeter; interior walls are the thinner partitions. Horizontal walls must have y1 = y2, vertical walls x1 = x2.
- Openings: every door (swing arc symbol), every window (thin parallel lines inside a wall) and every wide passage without door. (x, y) is the opening CENTER on the wall centerline; width is its size along the wall, in pixels.
- Rooms: every labelled space, including covered exterior spaces (porch, terrace: habitable false). The polygon follows the wall centerlines around the room, in order. Use "tiles" for kitchens, bathrooms and WC, "stone" for porches and terraces, "parquet" otherwise.
- Columns: square posts or pillars (often small filled squares), center and side length in pixels.
- Uncertainty: NEVER invent geometry in blurry, faded, handwritten, or undimensioned sketch areas. Set "uncertain": true (and optional "uncertainReason") on any wall, opening or room with low visibility or missing dimensions, and list blurry/undimensioned areas in "uncertainZones".
- Scale: scale is calibrated externally on a real dimension by the user; report a visible dimension annotation in "scale.reference" if one is clearly readable, otherwise null. Never guess a scale from doors or fixtures.${withFurniture ? '\n- Furniture: only items actually drawn on the plan. rotation = direction the FRONT of the item faces: 0 = down, 90 = right, 180 = up, 270 = left (beds: the foot of the bed; sofas: the seat side). width is along the front, depth front-to-back, in pixels.' : ''}`;

  // ---------------------------------------------------------------------------
  // Préparation de l'image (réduite à 1600 px de côté)
  // ---------------------------------------------------------------------------
  function prepareImage() {
    const E = window.EditorAPI;
    const img = E.S.planImg;
    const k = Math.min(1, 1600 / Math.max(img.width, img.height));
    const c = document.createElement('canvas');
    c.width = Math.round(img.width * k);
    c.height = Math.round(img.height * k);
    const g = c.getContext('2d');
    g.fillStyle = '#fff';
    g.fillRect(0, 0, c.width, c.height);
    g.drawImage(img, 0, 0, c.width, c.height);
    return { dataUrl: c.toDataURL('image/jpeg', 0.92), W: c.width, H: c.height, factor: img.width / c.width };
  }

  function parseJson(text) {
    const s = String(text || ''); // tolère un bloc ```json … ``` ou du texte autour
    const a = s.indexOf('{'), b = s.lastIndexOf('}');
    if (a < 0 || b < a) throw new Error('Réponse sans JSON exploitable');
    return JSON.parse(s.slice(a, b + 1));
  }

  // ---------------------------------------------------------------------------
  // Conversion pixels → mètres + validation topologique + zéro perte silencieuse
  // ---------------------------------------------------------------------------
  function cluster1D(values, tol, roundFn) {
    const sorted = values.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v);
    const out = new Array(values.length);
    let group = [];
    const flush = () => {
      if (!group.length) return;
      const mean = group.reduce((s, g) => s + g.v, 0) / group.length;
      group.forEach(g => { out[g.i] = roundFn(mean, 0.05); });
      group = [];
    };
    sorted.forEach(it => {
      if (group.length && it.v - group[group.length - 1].v > tol) flush();
      group.push(it);
    });
    flush();
    return out;
  }

  const assessProposal = Review.assessProposal;

  function convert(ai, img, opts, env) {
    const E = env || (isBrowser && window.EditorAPI) || null;
    const helper = key => (E && E[key]) || DEFAULT_HELPERS[key];
    const round = helper('round');
    const r2 = helper('r2');
    const wallLen = helper('wallLen');
    const projectOnWall = helper('projectOnWall');
    const slugify = helper('slugify');
    const OPENINGS = helper('OPENINGS');
    const FURNITURE = helper('FURNITURE');

    const S = E && E.S;
    const pi = S && S.p && S.p.config && S.p.config.planImage;
    const ppm = assertCalibrated(pi); // échelle calibrée obligatoire — jamais devinée
    const options = opts || {};
    const factor = (img && Number.isFinite(img.factor) && img.factor > 0) ? img.factor : 1;
    const origin = (pi && Array.isArray(pi.originPx) && pi.originPx.length >= 2)
      ? pi.originPx
      : [((S && S.planImg && S.planImg.width) || (img && img.W) || 0) / 2, ((S && S.planImg && S.planImg.height) || (img && img.H) || 0) / 2];

    const X = px => (px * factor - origin[0]) / ppm;
    const Z = py => (py * factor - origin[1]) / ppm;
    const posOf = (x, z) => (Number.isFinite(x) && Number.isFinite(z) ? { x: r2(x), z: r2(z) } : null);
    const polyCentroid = poly => {
      if (!Array.isArray(poly)) return null;
      const valid = poly.filter(p => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1]));
      if (!valid.length) return null;
      const sx = valid.reduce((s, p) => s + X(p[0]), 0) / valid.length;
      const sz = valid.reduce((s, p) => s + Z(p[1]), 0) / valid.length;
      return posOf(sx, sz);
    };

    const toVerify = [];
    const flag = (type, label, reason, position, extra = null) => {
      toVerify.push(Object.assign({ type, label, reason, position: position || null }, extra || {}));
    };

    const uncertainZones = Array.isArray(ai && ai.uncertainZones) ? ai.uncertainZones : [];
    const pointInUncertainZone = (px, py) => uncertainZones.find(z =>
      z && Number.isFinite(z.x) && Number.isFinite(z.y) && Number.isFinite(z.width) && Number.isFinite(z.height) &&
      px >= z.x && px <= z.x + z.width && py >= z.y && py <= z.y + z.height
    ) || null;
    uncertainZones.forEach((z, idx) => {
      if (!z || typeof z !== 'object') return;
      const cx = Number.isFinite(z.x) ? X(z.x + (Number(z.width) || 0) / 2) : NaN;
      const cz = Number.isFinite(z.y) ? Z(z.y + (Number(z.height) || 0) / 2) : NaN;
      flag('zone', String(z.label || `Zone incertaine ${idx + 1}`),
        `Zone floue ou non cotée (${z.reason || 'lisibilité insuffisante'}) — à vérifier sur le croquis source.`,
        posOf(cx, cz), { uncertain: true });
    });

    // Validation topologique préalable (avant toute injection dans le projet)
    const topology = Topology ? Topology.validate(ai || {}, ppm / factor) : null;
    const removedWallMap = new Map();
    const rejectedRoomMap = new Map();
    if (topology) {
      (topology.removedWalls || []).forEach(rw => {
        if (Number.isInteger(rw.sourceIndex)) removedWallMap.set(rw.sourceIndex, rw);
      });
      (topology.rejectedRooms || []).forEach(rr => {
        if (Number.isInteger(rr.sourceIndex)) rejectedRoomMap.set(rr.sourceIndex, rr);
      });
    }

    // Murs en mètres, remis d'équerre (aucune suppression silencieuse)
    const candidateWalls = [];
    (ai.walls || []).forEach((w, idx) => {
      const wLabel = w && w.kind === 'exterior' ? 'Mur extérieur' : 'Cloison';
      if (!w || !Number.isFinite(w.x1) || !Number.isFinite(w.y1) || !Number.isFinite(w.x2) || !Number.isFinite(w.y2)) {
        flag('mur', wLabel, 'Coordonnées invalides ou manquantes.', null);
        return;
      }
      const a = [X(w.x1), Z(w.y1)], b = [X(w.x2), Z(w.y2)];
      const mid = posOf((a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
      if (removedWallMap.has(idx)) {
        flag('mur', wLabel, removedWallMap.get(idx).reason, mid);
        return;
      }
      const dx = Math.abs(b[0] - a[0]), dz = Math.abs(b[1] - a[1]);
      if (dz < 0.12 * dx) { const z = (a[1] + b[1]) / 2; a[1] = b[1] = z; }
      else if (dx < 0.12 * dz) { const x = (a[0] + b[0]) / 2; a[0] = b[0] = x; }
      const rawLen = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (rawLen < 0.2) {
        flag('mur', wLabel, `Mur trop court (${rawLen.toFixed(2)} m < 0,20 m).`, mid);
        return;
      }
      const zoneHit = pointInUncertainZone((w.x1 + w.x2) / 2, (w.y1 + w.y2) / 2);
      const isUncertain = w.uncertain === true || Boolean(zoneHit);
      const uncertainReason = w.uncertainReason || (zoneHit ? `Zone floue ou non cotée (${zoneHit.label || zoneHit.reason || 'croquis'})` : 'Mur marqué incertain par la lecture IA');
      candidateWalls.push({ from: a, to: b, ext: w.kind === 'exterior', label: wLabel, uncertain: isUncertain, uncertainReason });
    });

    // Pièces candidates (les polygones rejetés par AITopology ou invalides sont consignés)
    const candidateRooms = [];
    (ai.rooms || []).forEach((r, idx) => {
      const rLabel = String((r && r.name) || `Pièce ${idx + 1}`);
      const rPos = polyCentroid(r && r.polygon);
      if (rejectedRoomMap.has(idx)) {
        flag('pièce', rLabel, rejectedRoomMap.get(idx).reason, rPos);
        return;
      }
      if (!r || !Array.isArray(r.polygon) || r.polygon.length < 3
          || r.polygon.some(p => !Array.isArray(p) || !Number.isFinite(p[0]) || !Number.isFinite(p[1]))) {
        flag('pièce', rLabel, `Polygone invalide (${r && Array.isArray(r.polygon) ? r.polygon.length : 0} sommet(s), 3 minimum requis).`, rPos);
        return;
      }
      candidateRooms.push(Object.assign({}, r, { label: rLabel, pts: r.polygon.map(p => [X(p[0]), Z(p[1])]) }));
    });

    // Regroupement des coordonnées par axe (murs + pièces) : supprime les décalages de quelques cm
    const xs = [], zs = [], refs = [];
    candidateWalls.forEach(w => { [w.from, w.to].forEach(p => { refs.push(p); xs.push(p[0]); zs.push(p[1]); }); });
    candidateRooms.forEach(r => r.pts.forEach(p => { refs.push(p); xs.push(p[0]); zs.push(p[1]); }));
    if (xs.length) {
      const cx = cluster1D(xs, 0.18, round), cz = cluster1D(zs, 0.18, round);
      refs.forEach((p, i) => { p[0] = cx[i]; p[1] = cz[i]; });
    }

    // Murs : longueur minimale après alignement, doublons
    const seen = new Set();
    const walls = [];
    candidateWalls.forEach(w => {
      const len = Math.hypot(w.to[0] - w.from[0], w.to[1] - w.from[1]);
      const mid = posOf((w.from[0] + w.to[0]) / 2, (w.from[1] + w.to[1]) / 2);
      if (len < 0.2) {
        flag('mur', w.label, `Mur trop court après alignement (${len.toFixed(2)} m < 0,20 m).`, mid);
        return;
      }
      const key = [w.from, w.to].map(p => p.join(',')).sort().join('|');
      if (seen.has(key)) {
        flag('mur', w.label, 'Mur doublon après alignement des coordonnées.', mid);
        return;
      }
      seen.add(key);
      const wallObj = { from: w.from, to: w.to, thick: w.ext ? 0.25 : 0.15, type: w.ext ? 'ext' : 'int', openings: [] };
      if (w.uncertain) {
        wallObj.uncertain = true;
        flag('mur', w.label, w.uncertainReason || 'Mur incertain (zone floue ou non cotée).', mid, { uncertain: true });
      }
      walls.push(wallObj);
    });

    // Ouvertures sur le mur le plus proche (aucune suppression silencieuse)
    let entrySet = false;
    const doors = [];
    (ai.openings || []).forEach(o => {
      const oLabel = o && o.kind === 'door' ? 'Porte' : o && o.kind === 'window' ? 'Fenêtre' : 'Passage';
      if (!o || !Number.isFinite(o.x) || !Number.isFinite(o.y)) {
        flag('ouverture', oLabel, 'Coordonnées invalides ou manquantes.', null);
        return;
      }
      const pt = { x: X(o.x), z: Z(o.y) };
      const oPos = posOf(pt.x, pt.z);
      let best = null;
      let nearestDist = Infinity;
      walls.forEach(w => {
        const pr = projectOnWall(w, pt);
        if (pr.dist < nearestDist) nearestDist = pr.dist;
        if (pr.dist < 0.6 && (!best || pr.dist < best.pr.dist)) best = { w, pr };
      });
      if (!best) {
        const reason = walls.length
          ? `Ouverture trop éloignée de tout mur (${nearestDist.toFixed(2)} m ≥ 0,60 m).`
          : 'Aucun mur disponible pour rattacher l’ouverture.';
        flag('ouverture', oLabel, reason, oPos);
        return;
      }
      const kind = o.kind === 'door' ? 'door' : o.kind === 'window' ? 'window' : 'open';
      const def = Object.assign({}, OPENINGS[kind]);
      def.w = Math.max(0.5, Math.min(4, round((o.width || 0) * factor / ppm, 0.05) || def.w));
      const L = wallLen(best.w);
      if (L < def.w + 0.05) {
        flag('ouverture', oLabel, `Mur trop court (${L.toFixed(2)} m) pour accueillir l’ouverture (${def.w.toFixed(2)} m).`, oPos);
        return;
      }
      def.at = r2(Math.max(def.w / 2, Math.min(L - def.w / 2, round(best.pr.at, 0.05))));
      if (best.w.openings.some(x => Math.abs(x.at - def.at) < (x.w + def.w) / 2)) {
        flag('ouverture', oLabel, 'Chevauchement avec une autre ouverture sur le même mur.', oPos);
        return;
      }
      if (o.uncertain === true || pointInUncertainZone(o.x, o.y)) {
        def.uncertain = true;
        flag('ouverture', oLabel, o.uncertainReason || 'Ouverture dans une zone floue ou non cotée.', oPos, { uncertain: true });
      }
      best.w.openings.push(def);
      if (kind === 'door' && best.w.type === 'ext') doors.push(def);
    });
    if (doors.length) { doors.sort((a, b) => b.w - a.w)[0].entry = true; entrySet = true; }

    // Pièces : rectangle → bounds, sinon polygone (bounds = emprise)
    const used = new Set(((S && S.p && S.p.rooms) || []).map(r => r.id));
    const outRooms = [];
    candidateRooms.forEach((r, i) => {
      const xsR = r.pts.map(p => p[0]), zsR = r.pts.map(p => p[1]);
      const bounds = { xMin: Math.min(...xsR), xMax: Math.max(...xsR), zMin: Math.min(...zsR), zMax: Math.max(...zsR) };
      const dx = bounds.xMax - bounds.xMin;
      const dz = bounds.zMax - bounds.zMin;
      const center = posOf((bounds.xMin + bounds.xMax) / 2, (bounds.zMin + bounds.zMax) / 2);
      if (dx <= 0.4 || dz <= 0.4) {
        flag('pièce', r.label, `Dimensions trop faibles (${dx.toFixed(2)} × ${dz.toFixed(2)} m, minimum > 0,40 m).`, center);
        return;
      }
      const uniq = r.pts.filter((p, j, a) => j === 0 || p[0] !== a[j - 1][0] || p[1] !== a[j - 1][1]);
      if (uniq.length > 1 && uniq[0][0] === uniq[uniq.length - 1][0] && uniq[0][1] === uniq[uniq.length - 1][1]) {
        uniq.pop();
      }
      if (uniq.length < 3
          || (Topology && Topology.hasSelfIntersection(uniq))
          || (Topology && Topology.polygonArea(uniq) < 0.01)) {
        flag('pièce', r.label, 'Polygone dégénéré ou auto-intersectant après alignement des coordonnées.', center);
        return;
      }
      let id = slugify(r.name || 'piece-' + (i + 1));
      while (used.has(id)) id += '-2';
      used.add(id);
      const room = { id, name: String(r.name || 'PIÈCE ' + (i + 1)).toUpperCase(), bounds, floorType: r.floor || 'parquet', habitable: r.habitable !== false, desc: '' };
      if (r.uncertain === true) {
        room.uncertain = true;
        flag('pièce', r.label, r.uncertainReason || 'Pièce non cotée ou contour flou — à vérifier.', center, { uncertain: true });
      }
      const isRect = uniq.length === 4 && uniq.every(p => (p[0] === bounds.xMin || p[0] === bounds.xMax) && (p[1] === bounds.zMin || p[1] === bounds.zMax));
      if (!isRect) room.poly = uniq;
      outRooms.push(room);
    });

    const columns = [];
    (ai.columns || []).forEach(c => {
      if (!c || !Number.isFinite(c.x) || !Number.isFinite(c.y)) {
        flag('poteau', 'Poteau', 'Coordonnées invalides ou manquantes.', null);
        return;
      }
      const size = Math.max(0.15, Math.min(0.8, round((c.size || 0) * factor / ppm, 0.05) || 0.3));
      columns.push({ name: 'Colonne', x: round(X(c.x), 0.05), z: round(Z(c.y), 0.05), size, base: r2(size + 0.15), capital: r2(size + 0.15) });
    });

    const furniture = [];
    if (options.furniture) {
      (ai.furniture || []).forEach(f => {
        const fLabel = String((f && f.type) || 'Meuble');
        if (!f || !Number.isFinite(f.x) || !Number.isFinite(f.y)) {
          flag('meuble', fLabel, 'Coordonnées invalides ou manquantes.', null);
          return;
        }
        const fPos = posOf(X(f.x), Z(f.y));
        const lib = FURNITURE.find(it => it.name === FURN_MAP[f.type]);
        if (!lib) {
          flag('meuble', fLabel, `Type de mobilier inconnu (« ${f.type || 'non précisé'} »).`, fPos);
          return;
        }
        const rot = ((Math.round((f.rotation || 0) / 90) % 4) + 4) % 4;
        const w = round((f.width || 0) * factor / ppm, 0.05) || lib.w;
        const d = round((f.depth || 0) * factor / ppm, 0.05) || lib.d;
        const item = { name: lib.name, x: round(X(f.x), 0.05), z: round(Z(f.y), 0.05), w, d, h: lib.h, elev: lib.elev || 0, color: lib.color, rotY: r2(rot * Math.PI / 2 * 10000) / 10000, dims: 'local' };
        if (lib.model) item.model = lib.model;
        furniture.push(item);
      });
    }

    return {
      walls,
      rooms: outRooms,
      columns,
      furniture,
      ppm,
      entrySet,
      reference: ai.scale && ai.scale.reference,
      topology,
      toVerify
    };
  }

  /**
   * Convertit le résultat déterministe de PdfVectorExtract (hors ligne, 0 $) en proposition
   * compatible avec la revue visuelle Lot 7 (PlanProposalReview + superposition vert/orange/rouge).
   * Principe directeur : aucune pièce ni échelle inventée ; tout élément incertain ou texte sans
   * contour fermé reste dans `toVerify` (« À vérifier ») avec ses coordonnées monde.
   */
  function vectorToProposal(vectorResult, options = {}) {
    const level = Number.isInteger(options.level) ? options.level : 0;
    const round = DEFAULT_HELPERS.round;
    const r2 = DEFAULT_HELPERS.r2;
    const slugify = DEFAULT_HELPERS.slugify;
    const rawWalls = Array.isArray(vectorResult?.walls) ? vectorResult.walls : [];
    const rawRooms = Array.isArray(vectorResult?.rooms) ? vectorResult.rooms : [];
    const rawVerify = Array.isArray(vectorResult?.toVerify) ? vectorResult.toVerify : [];

    // Calcul du décalage d'origine pour centrer la géométrie autour de (0, 0) si aucun offset n'est fourni.
    let ox = Number.isFinite(options.originOffset?.[0]) ? options.originOffset[0] : null;
    let oz = Number.isFinite(options.originOffset?.[1]) ? options.originOffset[1] : null;
    if (ox === null || oz === null) {
      const xs = [], zs = [];
      for (const w of rawWalls) {
        if (Array.isArray(w?.from) && Array.isArray(w?.to)) {
          xs.push(w.from[0], w.to[0]);
          zs.push(w.from[1], w.to[1]);
        }
      }
      if (xs.length && zs.length) {
        ox = (Math.min(...xs) + Math.max(...xs)) / 2;
        oz = (Math.min(...zs) + Math.max(...zs)) / 2;
      } else {
        ox = 0; oz = 0;
      }
    }
    const shiftX = x => round(x - ox, 0.01);
    const shiftZ = z => round(z - oz, 0.01);

    let mappedOpenings = 0;
    const walls = rawWalls
      .filter(w => Array.isArray(w?.from) && Array.isArray(w?.to))
      .map(w => {
        const openings = (Array.isArray(w.openings) ? w.openings : []).map(o => {
          mappedOpenings++;
          const base = o.type === 'window'
            ? { type: 'window', at: r2(o.at || 0), w: r2(o.w || 1.2), h: r2(o.h || 1.25), sill: r2(o.sill ?? 0.95) }
            : { type: 'door', at: r2(o.at || 0), w: r2(o.w || 0.85), h: r2(o.h || 2.1), sill: 0, hinge: o.hinge || 'start', side: o.side || 1 };
          return base;
        });
        return {
          from: [shiftX(w.from[0]), shiftZ(w.from[1])],
          to: [shiftX(w.to[0]), shiftZ(w.to[1])],
          thick: r2(w.thick || (w.type === 'int' ? 0.15 : 0.25)),
          type: w.type === 'int' ? 'int' : 'ext',
          openings,
          level,
          source: 'pdf-vector'
        };
      });

    const toVerify = [];
    const rooms = [];
    const seenIds = new Set();
    for (const r of rawRooms) {
      if (!r || !r.name) continue;
      if (Array.isArray(r.polygon) && r.polygon.length >= 3) {
        const poly = r.polygon.map(pt => [shiftX(pt[0]), shiftZ(pt[1])]);
        const pxs = poly.map(pt => pt[0]);
        const pzs = poly.map(pt => pt[1]);
        let id = slugify(r.name);
        let n = 2;
        while (seenIds.has(id)) id = `${slugify(r.name)}-${n++}`;
        seenIds.add(id);
        rooms.push({
          id,
          name: String(r.name).trim(),
          poly,
          polygon: poly,
          bounds: { xMin: Math.min(...pxs), xMax: Math.max(...pxs), zMin: Math.min(...pzs), zMax: Math.max(...pzs) },
          floorType: r.floorType || 'parquet',
          habitable: r.habitable !== false,
          level,
          source: 'pdf-vector'
        });
      } else {
        const pos = Array.isArray(r.center) && r.center.length >= 2
          ? { x: shiftX(r.center[0]), z: shiftZ(r.center[1]) }
          : null;
        toVerify.push({
          type: 'pièce',
          label: String(r.name).trim(),
          reason: 'Libellé de pièce lu dans le PDF sans contour fermé automatique — utilisez « Pièce auto » (W) sur le plan.',
          position: pos
        });
      }
    }

    for (const item of rawVerify) {
      if (!item) continue;
      let pos = null;
      if (Array.isArray(item.coords?.at) && item.coords.at.length >= 2) {
        pos = { x: shiftX(item.coords.at[0]), z: shiftZ(item.coords.at[1]) };
      } else if (Array.isArray(item.coords?.from) && Array.isArray(item.coords?.to)) {
        pos = {
          x: shiftX((item.coords.from[0] + item.coords.to[0]) / 2),
          z: shiftZ((item.coords.from[1] + item.coords.to[1]) / 2)
        };
      }
      const kindMap = { scale: 'échelle', segment: 'mur', curve: 'ouverture', text: 'texte' };
      toVerify.push({
        type: kindMap[item.kind] || String(item.kind || 'élément'),
        label: item.kind === 'scale' ? 'Échelle du PDF' : (kindMap[item.kind] || 'Élément vectoriel'),
        reason: String(item.reason || 'Élément vectoriel à vérifier sur le PDF source.'),
        position: pos,
        uncertain: true
      });
    }

    const out = {
      walls,
      rooms,
      columns: [],
      furniture: [],
      entrySet: false,
      mappedOpenings,
      source: 'pdf-vector',
      scaleConfirmed: Boolean(vectorResult?.scaleConfirmed),
      scaleProposal: vectorResult?.scaleProposal || null,
      ptsPerMeter: vectorResult?.ptsPerMeter || null,
      reference: vectorResult?.scaleProposal?.label || (vectorResult?.ptsPerMeter ? `${r2(vectorResult.ptsPerMeter)} pt/m` : null),
      topology: null,
      toVerify
    };
    const syntheticInput = {
      walls: walls.map(w => ({ x1: w.from[0], y1: w.from[1], x2: w.to[0], y2: w.to[1], kind: w.type === 'ext' ? 'exterior' : 'interior' })),
      openings: new Array(mappedOpenings).fill({ kind: 'door' }),
      rooms: rooms.map(r => ({ name: r.name, polygon: r.polygon })),
      columns: [],
      furniture: []
    };
    const assessment = assessProposal(syntheticInput, out, { mode: options.mode || 'replace' });
    return { out, assessment };
  }

  // Exposé pour les tests (conversion sans appel réseau) et le navigateur
  const api = {
    convert,
    vectorToProposal,
    assessProposal,
    applyResult,
    prepareImage,
    INSTRUCTIONS,
    isPlanCalibrated,
    assertCalibrated,
    CALIBRATION_REQUIRED_MSG
  };
  if (typeof window !== 'undefined') window.EditorAI = api;
  if (typeof module === 'object' && module.exports) module.exports = api;

  // ---------------------------------------------------------------------------
  // Dialogue
  // ---------------------------------------------------------------------------
  if (!isBrowser || !window.EditorAPI || !document.getElementById('ai-model')) return;
  const E = window.EditorAPI;
  const $ = id => document.getElementById(id);
  const sel = $('ai-model');
  const dlgAi = $('dlg-ai');
  let pendingProposal = null;
  let pendingSession = null;
  const applyButton = $('ai-apply');
  const review = $('ai-review');
  MODELS.forEach(m => {
    const opt = document.createElement('option');
    opt.value = m.id;
    opt.textContent = m.label;
    sel.appendChild(opt);
  });
  function clearPendingReview() {
    pendingProposal = null;
    pendingSession = null;
    applyButton.disabled = true;
    if (dlgAi) dlgAi.classList.remove('is-review-docked');
    if (typeof E.setReviewOverlay === 'function') E.setReviewOverlay(null);
  }
  function renderPendingReview() {
    if (!pendingProposal || !pendingSession) return;
    Review.renderReview(review, pendingProposal.assessment, {
      mode: pendingProposal.opts.mode,
      session: pendingSession,
      onFocus: item => {
        const target = pendingSession.getFocusTarget(item.id);
        if (target && typeof E.focusWorldPoint === 'function') {
          E.focusWorldPoint(target.x, target.z, target.scale);
        }
      },
      onCorrect: item => {
        if (item.type === 'pièce') {
          const next = prompt(`Nom corrigé pour « ${item.label || 'pièce'} » :`, item.label || '');
          return next === null ? false : next;
        }
        return 'Vérifié sur le plan source';
      },
      onChange: () => {
        if (typeof E.setReviewOverlay === 'function') E.setReviewOverlay(pendingSession.getOverlayItems());
        applyButton.disabled = !pendingSession.canApply();
        renderPendingReview();
      }
    });
    if (typeof E.setReviewOverlay === 'function') E.setReviewOverlay(pendingSession.getOverlayItems());
    applyButton.disabled = !pendingSession.canApply();
  }
  applyButton.disabled = true;
  applyButton.addEventListener('click', () => {
    if (!pendingProposal) return;
    if (pendingSession && !pendingSession.canApply()) {
      $('ai-status').textContent = 'Traitez d’abord toutes les anomalies bloquantes (en rouge) avant d’appliquer.';
      return;
    }
    const finalOut = pendingSession ? pendingSession.applyDecisions(pendingProposal.out) : pendingProposal.out;
    const { opts } = pendingProposal;
    applyResult(finalOut, opts);
    clearPendingReview();
    dlgAi.close();
    E.toast('Proposition IA appliquée — vérifiez le tracé dans l’éditeur.');
  });
  dlgAi.addEventListener('close', () => {
    dlgAi.classList.remove('is-review-docked');
    if (typeof E.setReviewOverlay === 'function') E.setReviewOverlay(null);
  });
  try { const saved = localStorage.getItem('ed-ai-model'); if (MODELS.some(m => m.id === saved)) sel.value = saved; } catch (e) { /* stockage indisponible */ }
  function updateCostEstimate() {
    const selected = MODELS.find(model => model.id === sel.value);
    $('ai-cost-estimate').textContent = selected
      ? `Estimation préalable pour un plan : ${selected.label.split('—').pop().trim()}. Le coût réel dépend de la taille du plan et de la réponse ; il sera affiché après l’appel.`
      : '';
  }
  sel.addEventListener('change', updateCostEstimate);
  updateCostEstimate();

  function refreshScaleStatus() {
    const pi = E.S.p && E.S.p.config && E.S.p.config.planImage;
    const ok = isPlanCalibrated(pi);
    const el = $('ai-scale');
    if (el) {
      el.textContent = ok
        ? `Calibrée (${pi.pxPerMeter.toFixed(1)} px/m) ✓`
        : 'Non calibrée — calibrez d’abord le plan sur une cote réelle (touche K)';
      el.classList.toggle('warn', !ok);
    }
    return ok;
  }

  $('btn-ai-read').onclick = async () => {
    const S = E.S;
    if (!S.planImg) { E.toast('Importez d\'abord l\'image du plan', true); return; }
    const calibrated = refreshScaleStatus();
    $('ai-mode').value = S.p.walls.length ? 'merge' : 'replace';
    clearPendingReview();
    review.textContent = '';
    if (dlgAi.open) dlgAi.close();
    dlgAi.showModal();
    if (!calibrated) {
      $('ai-status').textContent = CALIBRATION_REQUIRED_MSG;
      $('ai-run').disabled = true;
      return;
    }
    $('ai-status').textContent = 'Vérification de la clé OpenRouter…';
    $('ai-run').disabled = true;
    try {
      const st = await (await fetch('api/ai/status')).json();
      $('ai-status').textContent = st.configured ? 'Clé OpenRouter détectée sur le serveur local ✓'
        : 'Aucune clé : définissez la variable OPENROUTER_API_KEY (voir README) puis relancez start.bat.';
      $('ai-run').disabled = !st.configured;
    } catch (e) {
      $('ai-status').textContent = 'Serveur local indisponible : lancez start.bat.';
      $('ai-run').disabled = true;
    }
  };
  $('ai-cancel').onclick = () => { clearPendingReview(); dlgAi.close(); };

  $('ai-run').onclick = async () => {
    const S = E.S;
    if (!refreshScaleStatus()) {
      $('ai-status').textContent = '✗ ' + CALIBRATION_REQUIRED_MSG;
      $('ai-run').disabled = true;
      return;
    }
    const model = sel.value;
    const selectedModel = MODELS.find(item => item.id === model);
    const estimate = selectedModel ? selectedModel.label.split('—').pop().trim() : 'estimation indisponible';
    if (!confirm(`Lancer la lecture IA du plan avec ${model} ?\n\nEstimation préalable : ${estimate}. Le coût réel dépend de l’image et de la réponse et sera indiqué après l’appel.\n\nCette requête OpenRouter est facturable. Confirmer ?`)) return;
    try { localStorage.setItem('ed-ai-model', model); } catch (e) { /* stockage indisponible */ }
    const opts = { scale: 'calibrated', furniture: $('ai-furniture').checked, mode: $('ai-mode').value };
    const img = prepareImage();
    clearPendingReview();
    review.textContent = 'La lecture est une proposition : rien ne sera ajouté au projet avant votre validation.';
    $('ai-run').disabled = true;
    const t0 = performance.now();
    $('ai-status').textContent = `Analyse du plan par ${model}… (20 à 90 s)`;
    try {
      const res = await fetch('api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          temperature: 0,
          max_tokens: 12000,
          response_format: { type: 'json_object' },
          messages: [{ role: 'user', content: [
            { type: 'text', text: INSTRUCTIONS(img.W, img.H, opts.furniture) },
            { type: 'image_url', image_url: { url: img.dataUrl } }
          ] }]
        })
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error((data.error && (data.error.message || data.error)) || `HTTP ${res.status}`);
      const ai = parseJson(data.choices[0].message.content);
      const out = convert(ai, img, opts);
      const assessment = assessProposal(ai, out, opts);
      if (!out.walls.length || !out.rooms.length) {
        Review.renderReview(review, assessment, opts);
        throw new Error('La proposition ne contient pas assez de murs et de pièces pour être relue. Le projet n’a pas été modifié.');
      }
      pendingProposal = { out, opts, assessment };
      pendingSession = typeof Review.createReviewSession === 'function'
        ? Review.createReviewSession(assessment, out)
        : null;
      if (pendingSession) {
        // Passe le dialogue en panneau latéral non modal pour laisser le plan et la superposition visibles.
        if (dlgAi.open) dlgAi.close();
        dlgAi.classList.add('is-review-docked');
        if (typeof dlgAi.show === 'function') dlgAi.show();
        renderPendingReview();
      } else {
        Review.renderReview(review, assessment, opts);
        applyButton.disabled = false;
      }
      const cost = data.usage && data.usage.cost !== undefined ? ` · coût ${Number(data.usage.cost).toFixed(3)} $` : '';
      const secs = ((performance.now() - t0) / 1000).toFixed(0);
      const verifyNote = out.toVerify.length ? ` · ${out.toVerify.length} élément(s) à vérifier` : '';
      const blockNote = pendingSession && !pendingSession.canApply()
        ? ` · ${pendingSession.getBlockingPending().length} anomalie(s) bloquante(s) à traiter`
        : '';
      $('ai-status').textContent = `Proposition prête : ${out.walls.length} murs, ${assessment.mappedOpenings} ouvertures rattachées, ${out.rooms.length} pièces, ${out.columns.length} poteaux${opts.furniture ? `, ${out.furniture.length} meubles` : ''}${verifyNote}${blockNote} · ${secs} s${cost}. Rien n’est encore appliqué.`;
    } catch (e) {
      $('ai-status').textContent = '✗ ' + e.message;
    } finally {
      $('ai-run').disabled = !isPlanCalibrated(S.p && S.p.config && S.p.config.planImage);
    }
  };

  function applyResult(out, opts, env) {
    const E = env || window.EditorAPI;
    const S = E.S;
    E.commit();
    if (opts.mode === 'replace') { S.p.walls = []; S.p.rooms = []; S.p.columns = []; S.p.furniture = []; }
    if (out.entrySet) S.p.walls.forEach(w => w.openings.forEach(o => { delete o.entry; }));
    S.p.walls.push(...out.walls);
    S.p.rooms.push(...out.rooms);
    S.p.columns.push(...out.columns);
    S.p.furniture.push(...out.furniture);
    S.sel = null;
    E.fitView();
    E.refreshPanel();
    E.draw();
  }

  /**
   * Ouvre la revue visuelle Lot 7 directement à partir d'une extraction vectorielle PDF (hors ligne, 0 $).
   */
  function openVectorProposalReview(vectorResult, opts = {}) {
    const mode = opts.mode || (E.S.p.walls.length ? 'merge' : 'replace');
    const level = Number.isInteger(opts.level) ? opts.level : (E.S.activeLevel || 0);
    const { out, assessment } = vectorToProposal(vectorResult, { mode, level, originOffset: opts.originOffset });
    clearPendingReview();
    if (!out.walls.length) {
      throw new Error('Aucun mur vectoriel détecté sur cette page (PDF probablement scanné ou raster). Utilisez le calage d’échelle (K) puis le tracé manuel ou la lecture IA.');
    }
    const proposalOpts = { scale: 'vector', furniture: false, mode, source: 'pdf-vector' };
    pendingProposal = { out, opts: proposalOpts, assessment };
    pendingSession = typeof Review.createReviewSession === 'function'
      ? Review.createReviewSession(assessment, out)
      : null;
    if (dlgAi.open) dlgAi.close();
    if (pendingSession) {
      dlgAi.classList.add('is-review-docked');
      if (typeof dlgAi.show === 'function') dlgAi.show();
      renderPendingReview();
    } else {
      Review.renderReview(review, assessment, proposalOpts);
      applyButton.disabled = false;
      dlgAi.showModal();
    }
    const verifyNote = out.toVerify.length ? ` · ${out.toVerify.length} élément(s) à vérifier` : '';
    const blockNote = pendingSession && !pendingSession.canApply()
      ? ` · ${pendingSession.getBlockingPending().length} anomalie(s) bloquante(s) à traiter`
      : '';
    $('ai-status').textContent = `Extraction vectorielle PDF (hors ligne, 0,00 $) : ${out.walls.length} murs, ${out.mappedOpenings} ouvertures, ${out.rooms.length} pièces${verifyNote}${blockNote}. Rien n’est encore appliqué.`;
    return { out, assessment };
  }
  api.openVectorProposalReview = openVectorProposalReview;

  // ---------------------------------------------------------------------------
  // Dialogue d'extraction vectorielle PDF (hors ligne, 0 $)
  // ---------------------------------------------------------------------------
  const dlgVec = $('dlg-vector-pdf');
  const btnVec = $('btn-vector-pdf');
  if (dlgVec && btnVec && typeof PdfVectorExtract !== 'undefined') {
    const vecPageSelect = $('vec-page');
    const vecScaleMode = $('vec-scale-mode');
    const vecWitnessWrap = $('vec-witness-fields');
    const vecCartoucheWrap = $('vec-cartouche-fields');
    const vecDetected = $('vec-detected-scale');
    const vecWitnessPts = $('vec-witness-pts');
    const vecWitnessMeters = $('vec-witness-meters');
    const vecDenom = $('vec-denominator');
    const vecMode = $('vec-apply-mode');
    const vecStatus = $('vec-status');
    const vecRun = $('vec-run');
    const vecFile = $('vec-file');
    let cachedPdfDoc = null;
    let detectedProposal = null;

    async function loadVectorPdfBuffer(arrayBuffer, fileName) {
      if (!window.pdfjsLib) throw new Error('PDF.js local introuvable (assets/vendor/pdf.min.js).');
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'assets/vendor/pdf.worker.min.js';
      if (cachedPdfDoc) { try { cachedPdfDoc.destroy(); } catch { /* ignore */ } cachedPdfDoc = null; }
      const copy = arrayBuffer.slice(0);
      cachedPdfDoc = await window.pdfjsLib.getDocument({ data: new Uint8Array(copy) }).promise;
      vecPageSelect.replaceChildren();
      for (let i = 1; i <= cachedPdfDoc.numPages; i++) {
        vecPageSelect.append(new Option(`Page ${i} / ${cachedPdfDoc.numPages}`, String(i)));
      }
      const activeSourcePage = E.S.p?.config?.planImage?.sourcePage;
      if (Number.isInteger(activeSourcePage) && activeSourcePage >= 1 && activeSourcePage <= cachedPdfDoc.numPages) {
        vecPageSelect.value = String(activeSourcePage);
      }
      vecStatus.textContent = `PDF chargé : ${fileName || 'plan.pdf'} (${cachedPdfDoc.numPages} page${cachedPdfDoc.numPages > 1 ? 's' : ''}).`;
      await inspectSelectedPageScale();
      vecRun.disabled = false;
    }

    async function inspectSelectedPageScale() {
      detectedProposal = null;
      if (!cachedPdfDoc) return;
      try {
        const pageNum = Math.max(1, Number(vecPageSelect.value) || 1);
        const page = await cachedPdfDoc.getPage(pageNum);
        const textContent = await page.getTextContent().catch(() => ({ items: [] }));
        detectedProposal = PdfVectorExtract.detectScaleProposal(textContent.items || []);
        if (detectedProposal) {
          vecDetected.textContent = `Proposition lue dans le cartouche : ${detectedProposal.label} (non confirmée — vérifiez sur une cote témoin).`;
          if (vecDenom && !vecDenom.value) vecDenom.value = String(detectedProposal.denominator);
        } else {
          vecDetected.textContent = 'Aucune échelle lue dans le texte de cette page : saisissez une cote témoin ou utilisez l’échelle calibrée (K).';
        }
      } catch {
        vecDetected.textContent = 'Lecture du texte de la page impossible.';
      }
    }

    function syncScaleUi() {
      const m = vecScaleMode.value;
      if (vecWitnessWrap) vecWitnessWrap.hidden = m !== 'witness';
      if (vecCartoucheWrap) vecCartoucheWrap.hidden = m !== 'cartouche';
    }

    async function openVectorDialog(preferredPage = null) {
      vecMode.value = E.S.p.walls.length ? 'merge' : 'replace';
      const pi = E.S.p?.config?.planImage;
      const calibrated = isPlanCalibrated(pi);
      const calOpt = vecScaleMode.querySelector('option[value="calibrated"]');
      if (calOpt) {
        calOpt.disabled = !calibrated;
        calOpt.textContent = calibrated
          ? `Échelle calibrée du plan (${pi.pxPerMeter.toFixed(1)} px/m) ✓`
          : 'Échelle calibrée (calibrez d’abord avec K)';
      }
      vecScaleMode.value = calibrated ? 'calibrated' : 'witness';
      syncScaleUi();
      vecRun.disabled = true;
      vecStatus.textContent = '';
      if (!dlgVec.open) dlgVec.showModal();
      if (E.S.lastPdfBuffer) {
        try {
          await loadVectorPdfBuffer(E.S.lastPdfBuffer, E.S.lastPdfName);
          if (Number.isInteger(preferredPage) && preferredPage >= 1 && preferredPage <= (cachedPdfDoc?.numPages || 1)) {
            vecPageSelect.value = String(preferredPage);
            await inspectSelectedPageScale();
          }
        } catch (err) {
          vecStatus.textContent = `Lecture PDF impossible : ${err.message}`;
        }
      } else {
        vecDetected.textContent = 'Importez un PDF ci-dessous ou via « Plan PDF / image… » dans la barre d’outils.';
      }
    }

    api.openVectorDialog = openVectorDialog;
    btnVec.addEventListener('click', () => void openVectorDialog());
    vecScaleMode.addEventListener('change', syncScaleUi);
    vecPageSelect.addEventListener('change', () => void inspectSelectedPageScale());
    $('vec-cancel')?.addEventListener('click', () => dlgVec.close());
    vecFile?.addEventListener('change', async () => {
      const f = vecFile.files?.[0];
      if (!f) return;
      try {
        const buf = await f.arrayBuffer();
        E.S.lastPdfBuffer = buf;
        E.S.lastPdfName = f.name;
        await loadVectorPdfBuffer(buf, f.name);
      } catch (err) {
        vecStatus.textContent = `Fichier PDF illisible : ${err.message}`;
      }
    });

    vecRun.addEventListener('click', async () => {
      if (!cachedPdfDoc) { vecStatus.textContent = 'Sélectionnez d’abord un fichier PDF.'; return; }
      vecRun.disabled = true;
      vecStatus.textContent = 'Analyse vectorielle hors ligne des traits et arcs du PDF…';
      try {
        const pageNum = Math.max(1, Number(vecPageSelect.value) || 1);
        const page = await cachedPdfDoc.getPage(pageNum);
        const baseVp = page.getViewport({ scale: 1 });
        let extractOpts = {};
        if (vecScaleMode.value === 'calibrated') {
          const pi = E.S.p?.config?.planImage;
          const ppm = assertCalibrated(pi);
          const imgW = E.S.planImg?.width || baseVp.width;
          const pxPerPt = imgW / Math.max(1, baseVp.width);
          const ptsPerMeter = ppm / pxPerPt;
          extractOpts = {
            confirmedScale: PdfVectorExtract.confirmScale({
              detectedDenominator: detectedProposal?.denominator || null,
              witnessPdfPoints: ptsPerMeter,
              witnessRealMeters: 1
            })
          };
        } else if (vecScaleMode.value === 'witness') {
          const pts = Number(vecWitnessPts.value);
          const meters = Number(vecWitnessMeters.value);
          extractOpts = {
            confirmedScale: PdfVectorExtract.confirmScale({
              detectedDenominator: detectedProposal?.denominator || null,
              witnessPdfPoints: pts,
              witnessRealMeters: meters
            })
          };
        } else {
          const denom = Number(vecDenom.value);
          const ptsPerMeter = PdfVectorExtract.ptsPerMeterForDenominator(denom);
          if (!ptsPerMeter) throw new Error('Indiquez un dénominateur d’échelle valide (ex. 100 pour 1/100).');
          extractOpts = { ptsPerMeter };
        }
        const vecRes = await PdfVectorExtract.extractFromPdfPage(page, extractOpts);
        if (!vecRes.ok) {
          throw new Error(vecRes.toVerify?.[0]?.reason || 'Échelle non confirmée.');
        }
        if (vecScaleMode.value === 'cartouche') {
          vecRes.scaleConfirmed = false;
          vecRes.toVerify.unshift({
            kind: 'scale',
            reason: `Échelle 1/${Number(vecDenom.value)} appliquée sans cote témoin mesurée — vérifiez une longueur réelle dans l’éditeur.`,
            coords: null
          });
        }
        dlgVec.close();
        openVectorProposalReview(vecRes, { mode: vecMode.value, level: E.S.activeLevel || 0 });
      } catch (err) {
        vecStatus.textContent = `✗ ${err.message}`;
        vecRun.disabled = false;
      }
    });
  }
})();
