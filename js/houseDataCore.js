/** Réglages et géométrie partagés, sans plan ni donnée d’un projet. */
const HOUSE_DEFAULT_CONFIG = {
  wallHeight: 2.8,
  floorHeight: 3.0,
  extWallThickness: 0.25,
  intWallThickness: 0.15,
  doorWidth: 0.85,
  doorHeight: 2.1,
  windowSill: 0.95,
  windowHeight: 1.25,
  elevationEnd: 0.16,            // fraction du scroll où les murs atteignent 100 %
};

const HOUSE_DEFAULT_ASSETS = {
  hdri: null,      // ex. 'assets/hdri/ciel_1k.hdr'
  // Poly Haven (CC0) — https://polyhaven.com — glTF 1k. fit : 'w' largeur seule, 'h' hauteur seule (sinon emprise)
  models: {
    // Canapés et table à manger : versions composées en code conservées (sofa_03 et WoodenTable_02
    // sont de style classique, en décalage avec la maison) — fichiers gardés dans assets/models.
    // sofa:        { url: 'assets/models/sofa_03/sofa_03_1k.gltf' },
    // diningTable: { url: 'assets/models/WoodenTable_02/WoodenTable_02_1k.gltf' },
    chair:       { url: 'assets/models/dining_chair_02/dining_chair_02_1k.gltf' },
    coffeeTable: { url: 'assets/models/modern_coffee_table_01/modern_coffee_table_01_1k.gltf' },
    nightstand:  { url: 'assets/models/painted_wooden_nightstand/painted_wooden_nightstand_1k.gltf' },
    sideTable:   { url: 'assets/models/side_table_01/side_table_01_1k.gltf' },
    terraceSet:  { url: 'assets/models/outdoor_table_chair_set_01/outdoor_table_chair_set_01_1k.gltf' },
    plantTall:   { url: 'assets/models/potted_plant_02/potted_plant_02_1k.gltf', fit: 'h' },
    plantBush:   { url: 'assets/models/potted_plant_04/potted_plant_04_1k.gltf', fit: 'h' },
    frame:       { url: 'assets/models/hanging_picture_frame_01/hanging_picture_frame_01_1k.gltf', fit: 'h' },
    vase:        { url: 'assets/models/ceramic_vase_01/ceramic_vase_01_1k.gltf', fit: 'h' }
  }
};

// ---------- NORMALISATION & CALCULS DÉRIVÉS ----------
// ---------- GÉOMÉTRIE DES PIÈCES (rectangles ou polygones) ----------
function polygonArea(poly) {
  let s = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    s += a[0] * b[1] - b[0] * a[1];
  }
  return Math.abs(s) / 2;
}

function pointInPolygon(poly, x, z) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i], [xj, zj] = poly[j];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

// Point d'étiquette : centroïde s'il est dans la pièce, sinon milieu de la plus longue bande intérieure
function polygonLabelPoint(poly) {
  let a = 0, cx = 0, cz = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i], q = poly[(i + 1) % poly.length];
    const f = p[0] * q[1] - q[0] * p[1];
    a += f; cx += (p[0] + q[0]) * f; cz += (p[1] + q[1]) * f;
  }
  if (Math.abs(a) > 1e-9) { cx /= 3 * a; cz /= 3 * a; if (pointInPolygon(poly, cx, cz)) return { x: cx, z: cz }; }
  const zs = poly.map(p => p[1]);
  const z = (Math.min(...zs) + Math.max(...zs)) / 2;
  const hits = [];
  for (let i = 0; i < poly.length; i++) {
    const [x1, z1] = poly[i], [x2, z2] = poly[(i + 1) % poly.length];
    if ((z1 > z) !== (z2 > z)) hits.push(x1 + ((z - z1) * (x2 - x1)) / (z2 - z1));
  }
  hits.sort((p, q) => p - q);
  let best = { x: (poly[0][0] + poly[1][0]) / 2, z, len: -1 };
  for (let i = 0; i + 1 < hits.length; i += 2) if (hits[i + 1] - hits[i] > best.len) best = { x: (hits[i] + hits[i + 1]) / 2, z, len: hits[i + 1] - hits[i] };
  return { x: best.x, z: best.z };
}

function roomContains(r, x, z) {
  const b = r.bounds;
  if (x < b.xMin || x > b.xMax || z < b.zMin || z > b.zMax) return false;
  return r.poly ? pointInPolygon(r.poly, x, z) : true;
}
window.roomContains = roomContains;
window.pointInPolygon = pointInPolygon;
window.polygonArea = polygonArea;
window.polygonLabelPoint = polygonLabelPoint;

// Exposée pour js/projectLoader.js (projets chargés via ?project=…) ; idempotente
function normalizeHouseData(data) {
  data.walls.forEach(w => {
    w.level = Math.max(0, Number(w.level) || 0);
    const len = Math.hypot(w.to[0] - w.from[0], w.to[1] - w.from[1]);
    w.length = len;
    if (!w.openings) w.openings = [];
    if (w.opening) {
      const op = Object.assign({}, w.opening);
      if (op.at === undefined) op.at = (op.pos !== undefined ? op.pos : 0.5) * len;
      w.openings.push(op);
      delete w.opening;
    }
    w.openings.forEach(op => {
      op.level = Math.max(0, Number(op.level === undefined ? w.level : op.level) || 0);
      if (op.h === undefined) op.h = op.type === 'door' ? data.config.doorHeight : data.config.windowHeight;
      if (op.sill === undefined) op.sill = op.type === 'window' ? data.config.windowSill : 0;
    });
    w.openings.sort((a, b) => a.at - b.at);
  });

  let habitable = 0;
  data.rooms.forEach(r => {
    r.level = Math.max(0, Number(r.level) || 0);
    // Pièce polygonale (en L, en T…) : poly = [[x, z], …] ; bounds = emprise rectangulaire
    if (Array.isArray(r.poly) && r.poly.length >= 3) {
      const xs = r.poly.map(p => p[0]), zs = r.poly.map(p => p[1]);
      r.bounds = { xMin: Math.min(...xs), xMax: Math.max(...xs), zMin: Math.min(...zs), zMax: Math.max(...zs) };
    } else delete r.poly;
    const b = r.bounds;
    const area = r.poly ? polygonArea(r.poly) : (b.xMax - b.xMin) * (b.zMax - b.zMin);
    r.area = area;
    if (!r.surface) r.surface = area.toFixed(1).replace('.', ',') + ' m²';
    r.center = Object.assign({ y: 0.05 }, r.poly ? polygonLabelPoint(r.poly) : { x: (b.xMin + b.xMax) / 2, z: (b.zMin + b.zMax) / 2 });
    if (r.habitable) habitable += area;
  });
  (data.furniture || []).forEach(item => { item.level = Math.max(0, Number(item.level) || 0); });
  (data.columns || []).forEach(item => { item.level = Math.max(0, Number(item.level) || 0); });
  (data.canopies || []).forEach(item => { item.level = Math.max(0, Number(item.level) || 0); });
  (data.stairwells || []).forEach(item => { item.level = Math.max(1, Number(item.level) || 1); });
  data.config.floorHeight = Number(data.config.floorHeight) || 3;
  data.totals = { habitable, habitableLabel: '≈ ' + Math.round(habitable) + ' m² habitables' };
  return data;
}
window.normalizeHouseData = normalizeHouseData;
