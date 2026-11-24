/**
 * Tests pour les améliorations industrielles AXE 1 :
 * - Surface au nu intérieur (roomAreaNet)
 * - Déduplication des jonctions de murs (deduplicateWallLengths)
 * - Exclusion de la zone sous-escalier < 1.80m (computeStairwellExclusion)
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const CostEstimate = require('../js/costEstimate.js');

const near = (a, b, tol = 0.01) => assert.ok(Math.abs(a - b) < tol, `${a} !== ${b} (tolerance ${tol})`);

// ============================================================================
// AXE 1.1 : Surface au nu intérieur (roomAreaNet)
// ============================================================================

test('roomAreaNet : surface rectangle simple avec murs de 0.20m', () => {
  const room = {
    bounds: { xMin: 0, zMin: 0, xMax: 5, zMax: 4 },
    wallThickness: 0.20
  };
  
  const areaBrute = CostEstimate.roomArea(room);
  const areaNette = CostEstimate.roomAreaNet(room);
  
  // Surface brute : 5 × 4 = 20 m²
  near(areaBrute, 20);
  
  // Surface nette : (5 - 0.20) × (4 - 0.20) = 4.80 × 3.80 = 18.24 m²
  // Ou avec la formule périmètre : 20 - (2×5 + 2×4) × 0.10 = 20 - 1.80 = 18.20 m²
  // (la différence vient de l'approximation de la formule périmètre)
  assert.ok(areaNette < areaBrute, 'Surface nette doit être inférieure à la surface brute');
  assert.ok(areaNette > 18, 'Surface nette > 18 m²');
  assert.ok(areaNette < 19, 'Surface nette < 19 m²');
});

test('roomAreaNet : pièce en L avec murs de 0.25m', () => {
  const room = {
    poly: [
      [0, 0], [6, 0], [6, 3], [3, 3], [3, 5], [0, 5]
    ],
    wallThickness: 0.25
  };
  
  const areaBrute = CostEstimate.roomArea(room);
  const areaNette = CostEstimate.roomAreaNet(room);
  
  // Surface brute du L : 6×3 + 3×2 = 18 + 6 = 24 m²
  near(areaBrute, 24);
  
  // Surface nette : réduction d'environ 0.25m sur chaque côté
  assert.ok(areaNette < areaBrute, 'Surface nette < surface brute');
  assert.ok(areaNette > 21, 'Surface nette > 21 m²');
  assert.ok(areaNette < 23, 'Surface nette < 23 m²');
});

test('roomAreaNet : épaisseur par défaut 0.20m si non spécifiée', () => {
  const room = {
    bounds: { xMin: 0, zMin: 0, xMax: 4, zMax: 3 }
    // wallThickness non spécifié
  };
  
  const areaBrute = CostEstimate.roomArea(room);
  const areaNette = CostEstimate.roomAreaNet(room);
  
  near(areaBrute, 12);
  
  // Avec épaisseur par défaut 0.20m
  assert.ok(areaNette < areaBrute);
  assert.ok(areaNette > 10.5, 'Surface nette > 10.5 m²');
  assert.ok(areaNette < 11.5, 'Surface nette < 11.5 m²');
});

// ============================================================================
// AXE 1.2 : Déduplication des jonctions de murs
// ============================================================================

test('deduplicateWallLengths : deux murs perpendiculaires en L', () => {
  const walls = [
    { from: [0, 0], to: [5, 0], thick: 0.20 },  // mur horizontal
    { from: [5, 0], to: [5, 4], thick: 0.20 }   // mur vertical (perpendiculaire)
  ];
  
  const netLengths = CostEstimate.deduplicateWallLengths(walls);
  
  const len0 = netLengths.get(walls[0]);
  const len1 = netLengths.get(walls[1]);
  
  // Les deux murs ont une jonction en [5, 0]
  // Chaque mur devrait voir sa longueur réduite de l'épaisseur de l'autre (0.20m)
  assert.ok(len0 < 5, 'Mur 0 raccourci par la jonction');
  assert.ok(len1 < 4, 'Mur 1 raccourci par la jonction');
  
  // Longueur nette ≈ longueur brute - 0.20
  near(len0, 4.80, 0.05);
  near(len1, 3.80, 0.05);
});

test('deduplicateWallLengths : jonction en T', () => {
  const walls = [
    { from: [0, 0], to: [6, 0], thick: 0.25 },   // mur horizontal (traverse)
    { from: [3, 0], to: [3, 4], thick: 0.15 }    // mur vertical (rencontre en T)
  ];
  
  const netLengths = CostEstimate.deduplicateWallLengths(walls);
  
  const len0 = netLengths.get(walls[0]);
  const len1 = netLengths.get(walls[1]);
  
  // Le mur vertical rencontre le mur horizontal en T
  // Le mur vertical est réduit de son épaisseur (0.15m) à la jonction
  assert.ok(len1 < 4, 'Mur vertical raccourci par la jonction en T');
  assert.ok(len1 > 3.8, 'Mur vertical > 3.8m');
  assert.ok(len1 < 3.9, 'Mur vertical < 3.9m');
  
  // Le mur horizontal n'est pas raccourci (le mur vertical ne le traverse pas)
  near(len0, 6, 0.05);
});

test('deduplicateWallLengths : pas de jonction pour murs parallèles', () => {
  const walls = [
    { from: [0, 0], to: [5, 0], thick: 0.20 },   // mur bas
    { from: [0, 4], to: [5, 4], thick: 0.20 }    // mur haut (parallèle, pas de jonction)
  ];
  
  const netLengths = CostEstimate.deduplicateWallLengths(walls);
  
  const len0 = netLengths.get(walls[0]);
  const len1 = netLengths.get(walls[1]);
  
  // Pas de jonction : longueurs inchangées
  near(len0, 5, 0.05);
  near(len1, 5, 0.05);
});

test('deduplicateWallLengths : pièce fermée avec 4 murs', () => {
  const walls = [
    { from: [0, 0], to: [5, 0], thick: 0.20 },   // bas
    { from: [5, 0], to: [5, 4], thick: 0.20 },   // droite
    { from: [5, 4], to: [0, 4], thick: 0.20 },   // haut
    { from: [0, 4], to: [0, 0], thick: 0.20 }    // gauche
  ];
  
  const netLengths = CostEstimate.deduplicateWallLengths(walls);
  
  let totalNet = 0;
  for (const len of netLengths.values()) {
    totalNet += len;
  }
  
  // Périmètre brut : 2×5 + 2×4 = 18 m
  // Chaque coin a une jonction qui réduit la longueur
  // 4 murs × 2 extrémités × 0.20m = 1.6m de réduction totale
  const totalBrut = 2 * 5 + 2 * 4;
  assert.ok(totalNet < totalBrut, 'Longueur totale nette < longueur brute');
  near(totalNet, 16.4, 0.2);
});

// ============================================================================
// AXE 1.3 : Exclusion de la zone sous-escalier < 1.80m
// ============================================================================

test('computeStairwellExclusion : escalier simple 2m × 1m', () => {
  const project = {
    config: { wallHeight: 2.80 },
    stairwells: [
      { xMin: 0, xMax: 2, zMin: 0, zMax: 1 }
    ]
  };
  
  const exclusion = CostEstimate.computeStairwellExclusion(project);
  
  // Surface de l'escalier : 2 × 1 = 2 m²
  // Fraction < 1.80m : 1.80 / 2.80 = 0.643
  // Surface exclue : 2 × 0.643 = 1.286 m²
  near(exclusion, 1.286, 0.01);
});

test('computeStairwellExclusion : escalier avec hauteur standard 3m', () => {
  const project = {
    config: { wallHeight: 3.00 },
    stairwells: [
      { xMin: 0, xMax: 2.5, zMin: 0, zMax: 1.2 }
    ]
  };
  
  const exclusion = CostEstimate.computeStairwellExclusion(project);
  
  // Surface : 2.5 × 1.2 = 3 m²
  // Fraction : 1.80 / 3.00 = 0.60
  // Exclusion : 3 × 0.60 = 1.80 m²
  near(exclusion, 1.80, 0.01);
});

test('computeStairwellExclusion : deux escaliers', () => {
  const project = {
    config: { wallHeight: 2.80 },
    stairwells: [
      { xMin: 0, xMax: 2, zMin: 0, zMax: 1 },
      { xMin: 5, xMax: 7, zMin: 3, zMax: 4 }
    ]
  };
  
  const exclusion = CostEstimate.computeStairwellExclusion(project);
  
  // Premier escalier : 2 m² × (1.80/2.80) = 1.286 m²
  // Deuxième escalier : 2 m² × (1.80/2.80) = 1.286 m²
  // Total : 2.571 m²
  near(exclusion, 2.571, 0.01);
});

test('computeStairwellExclusion : pas d\'escalier', () => {
  const project = {
    config: { wallHeight: 2.80 },
    stairwells: []
  };
  
  const exclusion = CostEstimate.computeStairwellExclusion(project);
  near(exclusion, 0, 0.01);
});

test('computeStairwellExclusion : escalier sous hauteur totale (pas d\'exclusion)', () => {
  const project = {
    config: { wallHeight: 1.70 },  // Hauteur < 1.80m
    stairwells: [
      { xMin: 0, xMax: 2, zMin: 0, zMax: 1 }
    ]
  };
  
  const exclusion = CostEstimate.computeStairwellExclusion(project);
  
  // Si wallHeight < 1.80, toute la surface est exclue (fraction = 1)
  // Mais en pratique, wallHeight devrait toujours être >= 2.50m
  // Ici : 2 m² × (1.80/1.70) = 2 × 1.059 → plafonné à 1.0 → 2 m²
  near(exclusion, 2, 0.01);
});

// ============================================================================
// Intégration : quantities() avec les nouvelles fonctionnalités
// ============================================================================

test('quantities() : expose les nouvelles métriques nettes', () => {
  const project = {
    config: { wallHeight: 2.80 },
    rooms: [
      { id: 'sejour', bounds: { xMin: 0, zMin: 0, xMax: 5, zMax: 4 }, habitable: true }
    ],
    walls: [
      { from: [0, 0], to: [5, 0], thick: 0.20, type: 'ext' },
      { from: [5, 0], to: [5, 4], thick: 0.20, type: 'ext' },
      { from: [5, 4], to: [0, 4], thick: 0.20, type: 'ext' },
      { from: [0, 4], to: [0, 0], thick: 0.20, type: 'ext' }
    ]
  };
  
  const q = CostEstimate.quantities(project);
  
  // Vérifie que les nouvelles métriques existent
  assert.ok('habitableNet' in q, 'habitableNet exposé');
  assert.ok('floorAreaNet' in q, 'floorAreaNet exposé');
  assert.ok('wall20Net' in q, 'wall20Net exposé');
  assert.ok('wallNet' in q, 'wallNet exposé');
  assert.ok('extLengthNet' in q, 'extLengthNet exposé');
  
  // Surface nette < surface brute
  assert.ok(q.habitableNet < q.habitable, 'habitableNet < habitable');
  assert.ok(q.floorAreaNet < q.floorArea, 'floorAreaNet < floorArea');
  
  // Longueur nette < longueur brute (après déduplication)
  assert.ok(q.wall20Net <= q.wall20, 'wall20Net <= wall20');
  assert.ok(q.wallNet <= q.wallGross, 'wallNet <= wallGross');
});

test('quantities() : exclusion escalier dans habitableNet', () => {
  const project = {
    config: { wallHeight: 2.80 },
    rooms: [
      { id: 'sejour', bounds: { xMin: 0, zMin: 0, xMax: 5, zMax: 4 }, habitable: true }
    ],
    walls: [],
    stairwells: [
      { xMin: 0, xMax: 2, zMin: 0, zMax: 1 }
    ]
  };
  
  const q = CostEstimate.quantities(project);
  
  // habitableNet devrait être réduit par l'exclusion de l'escalier
  const exclusion = CostEstimate.computeStairwellExclusion(project);
  assert.ok(exclusion > 0, 'Exclusion escalier > 0');
  
  // habitableNet = habitable brut - exclusion (approximativement, car roomAreaNet réduit aussi)
  assert.ok(q.habitableNet < 20, 'habitableNet réduit par l\'escalier');
});

test('estimate() : expose habitableNet et habitableNetLabel', () => {
  const project = {
    config: { wallHeight: 2.80 },
    rooms: [
      { id: 'sejour', bounds: { xMin: 0, zMin: 0, xMax: 5, zMax: 4 }, habitable: true }
    ],
    walls: [
      { from: [0, 0], to: [5, 0], thick: 0.20, type: 'ext' },
      { from: [5, 0], to: [5, 4], thick: 0.20, type: 'ext' },
      { from: [5, 4], to: [0, 4], thick: 0.20, type: 'ext' },
      { from: [0, 4], to: [0, 0], thick: 0.20, type: 'ext' }
    ]
  };
  
  const result = CostEstimate.estimate(project);
  
  assert.ok('habitableNet' in result, 'habitableNet exposé dans estimate');
  assert.ok('habitableNetLabel' in result, 'habitableNetLabel exposé dans estimate');
  assert.ok(result.habitableNet > 0, 'habitableNet > 0');
  assert.ok(typeof result.habitableNetLabel === 'string', 'habitableNetLabel est une chaîne');
  assert.ok(result.habitableNetLabel.includes('m²'), 'Label contient m²');
  assert.ok(result.habitableNetLabel.includes('nu intérieur'), 'Label mentionne le nu intérieur');
});

// ============================================================================
// Comparaison brut vs net : impact sur le chiffrage
// ============================================================================

test('Impact surface nette : réduction de 5-10% pour maison typique', () => {
  const project = {
    config: { wallHeight: 2.80 },
    rooms: [
      { id: 'sejour', bounds: { xMin: 0, zMin: 0, xMax: 6, zMax: 5 }, habitable: true },
      { id: 'chambre', bounds: { xMin: 6, zMin: 0, xMax: 10, zMax: 4 }, habitable: true },
      { id: 'cuisine', bounds: { xMin: 0, zMin: 5, xMax: 4, zMax: 8 }, habitable: true },
      { id: 'sdb', bounds: { xMin: 4, zMin: 5, xMax: 6, zMax: 8 }, habitable: true }
    ],
    walls: [
      // Contour extérieur
      { from: [0, 0], to: [10, 0], thick: 0.25, type: 'ext' },
      { from: [10, 0], to: [10, 4], thick: 0.25, type: 'ext' },
      { from: [10, 4], to: [6, 4], thick: 0.25, type: 'ext' },
      { from: [6, 4], to: [6, 5], thick: 0.15, type: 'int' },
      { from: [6, 5], to: [10, 5], thick: 0.25, type: 'ext' },
      { from: [10, 5], to: [10, 8], thick: 0.25, type: 'ext' },
      { from: [10, 8], to: [0, 8], thick: 0.25, type: 'ext' },
      { from: [0, 8], to: [0, 0], thick: 0.25, type: 'ext' },
      // Cloisons intérieures
      { from: [0, 5], to: [6, 5], thick: 0.15, type: 'int' },
      { from: [6, 0], to: [6, 4], thick: 0.15, type: 'int' },
      { from: [4, 5], to: [4, 8], thick: 0.15, type: 'int' }
    ]
  };
  
  const q = CostEstimate.quantities(project);
  
  const reduction = (q.habitable - q.habitableNet) / q.habitable;
  
  // La réduction devrait être entre 5% et 15% pour une maison typique
  assert.ok(reduction > 0.05, `Réduction > 5% (actuel: ${(reduction * 100).toFixed(1)}%)`);
  assert.ok(reduction < 0.15, `Réduction < 15% (actuel: ${(reduction * 100).toFixed(1)}%)`);
});

test('Impact déduplication murs : réduction de 5-10% sur linéaire total', () => {
  const walls = [
    { from: [0, 0], to: [5, 0], thick: 0.20 },
    { from: [5, 0], to: [5, 4], thick: 0.20 },
    { from: [5, 4], to: [0, 4], thick: 0.20 },
    { from: [0, 4], to: [0, 0], thick: 0.20 }
  ];
  
  const netLengths = CostEstimate.deduplicateWallLengths(walls);
  
  let totalBrut = 0;
  let totalNet = 0;
  for (const wall of walls) {
    totalBrut += Math.hypot(wall.to[0] - wall.from[0], wall.to[1] - wall.from[1]);
    totalNet += netLengths.get(wall);
  }
  
  const reduction = (totalBrut - totalNet) / totalBrut;
  
  // La réduction devrait être entre 5% et 10% pour des jonctions typiques
  // (4 murs × 2 extrémités × 0.20m = 1.6m sur 18m = 8.9%)
  assert.ok(reduction > 0.05, `Réduction > 5% (actuel: ${(reduction * 100).toFixed(1)}%)`);
  assert.ok(reduction < 0.10, `Réduction < 10% (actuel: ${(reduction * 100).toFixed(1)}%)`);
});
