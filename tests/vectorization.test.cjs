/**
 * TESTS UNITAIRES — vectorization.js
 * Vectorisation intelligente + Export DXF/SVG
 */

const { test } = require('node:test');
const assert = require('node:assert');
const Vectorization = require('../js/vectorization.js');

// =========================================================================
// CONVERSION MURS → VECTEURS
// =========================================================================

test('Vectorization - wallsToVectors() convertit murs en vecteurs', () => {
  const walls = [
    { from: [0, 0], to: [10, 0], thick: 0.25, type: 'ext', loadBearing: true },
    { from: [5, 5], to: [5, 10], thick: 0.15, type: 'int' }
  ];

  const vectors = Vectorization.wallsToVectors(walls);

  assert.strictEqual(vectors.length, 2);
  assert.strictEqual(vectors[0].type, 'wall');
  assert.strictEqual(vectors[0].layer, 'ARCH-WALL-EXT');
  assert.strictEqual(vectors[0].loadBearing, true);
  assert.strictEqual(vectors[1].layer, 'ARCH-WALL-INT');
});

test('Vectorization - wallsToVectors() snap sur grille', () => {
  const walls = [
    { from: [0.123, 0.456], to: [10.789, 0.234], thick: 0.25, type: 'ext' }
  ];

  const vectors = Vectorization.wallsToVectors(walls, { snapToGrid: 0.5 });

  // 0.123 → 0.0, 0.456 → 0.5
  assert.strictEqual(vectors[0].points[0][0], 0.0);
  assert.strictEqual(vectors[0].points[0][1], 0.5);
});

test('Vectorization - wallsToVectors() calcule métadonnées', () => {
  const walls = [
    { from: [0, 0], to: [3, 4], thick: 0.25, type: 'ext' }
  ];

  const vectors = Vectorization.wallsToVectors(walls);

  // Triangle 3-4-5 → longueur = 5
  assert.strictEqual(vectors[0].metadata.length, 5);
  assert.ok(vectors[0].metadata.angle !== undefined);
});

test('Vectorization - wallsToVectors() désactive simplify', () => {
  const walls = [
    { from: [0, 0], to: [5, 0], thick: 0.25, type: 'ext' },
    { from: [5, 0], to: [10, 0], thick: 0.25, type: 'ext' }
  ];

  const vectors = Vectorization.wallsToVectors(walls, { simplify: false });

  // Ne devrait pas fusionner
  assert.strictEqual(vectors.length, 2);
});

// =========================================================================
// SIMPLIFICATION
// =========================================================================

test('Vectorization - simplifyVectors() fusionne colinéaires', () => {
  const vectors = [
    { type: 'wall', points: [[0, 0], [5, 0]], layer: 'ARCH-WALL-EXT' },
    { type: 'wall', points: [[5, 0], [10, 0]], layer: 'ARCH-WALL-EXT' }
  ];

  const simplified = Vectorization.simplifyVectors(vectors);

  assert.strictEqual(simplified.length, 1);
  assert.deepStrictEqual(simplified[0].points[0], [0, 0]);
  assert.deepStrictEqual(simplified[0].points[1], [10, 0]);
});

test('Vectorization - simplifyVectors() conserve non-colinéaires', () => {
  const vectors = [
    { type: 'wall', points: [[0, 0], [5, 0]], layer: 'ARCH-WALL-EXT' },
    { type: 'wall', points: [[0, 0], [0, 5]], layer: 'ARCH-WALL-EXT' }
  ];

  const simplified = Vectorization.simplifyVectors(vectors);

  assert.strictEqual(simplified.length, 2);
});

test('Vectorization - areColinear() détecte colinéarité', () => {
  const v1 = { points: [[0, 0], [5, 0]] };
  const v2 = { points: [[5, 0], [10, 0]] };
  const v3 = { points: [[0, 0], [0, 5]] };

  assert.strictEqual(Vectorization.areColinear(v1, v2, 0.01), true);
  assert.strictEqual(Vectorization.areColinear(v1, v3, 0.01), false);
});

// =========================================================================
// SNAP TO GRID
// =========================================================================

test('Vectorization - snapToGrid() aligne sur grille', () => {
  const vectors = [
    { points: [[1.23, 4.56], [7.89, 2.34]] }
  ];

  const snapped = Vectorization.snapToGrid(vectors, 0.5);

  // 1.23 → 1.0, 4.56 → 4.5, 7.89 → 8.0, 2.34 → 2.5
  assert.strictEqual(snapped[0].points[0][0], 1.0);
  assert.strictEqual(snapped[0].points[0][1], 4.5);
  assert.strictEqual(snapped[0].points[1][0], 8.0);
  assert.strictEqual(snapped[0].points[1][1], 2.5);
});

// =========================================================================
// EXPORT DXF
// =========================================================================

test('Vectorization - exportToDXF() génère DXF valide', () => {
  const vectors = [
    {
      type: 'wall',
      points: [[0, 0], [10, 0]],
      thickness: 0.25,
      layer: 'ARCH-WALL-EXT'
    }
  ];

  const dxf = Vectorization.exportToDXF(vectors);

  assert.ok(dxf.includes('0'));
  assert.ok(dxf.includes('SECTION'));
  assert.ok(dxf.includes('HEADER'));
  assert.ok(dxf.includes('ENTITIES'));
  assert.ok(dxf.includes('LINE'));
  assert.ok(dxf.includes('EOF'));
});

test('Vectorization - exportToDXF() inclut calques', () => {
  const vectors = [
    { type: 'wall', points: [[0, 0], [10, 0]], layer: 'ARCH-WALL-EXT' }
  ];

  const dxf = Vectorization.exportToDXF(vectors);

  assert.ok(dxf.includes('ARCH-WALL-EXT'));
  assert.ok(dxf.includes('LAYER'));
});

test('Vectorization - exportToDXF() inclut coordonnées', () => {
  const vectors = [
    { type: 'wall', points: [[5.5, 3.2], [10.0, 7.8]], layer: 'ARCH-WALL-EXT' }
  ];

  const dxf = Vectorization.exportToDXF(vectors);

  assert.ok(dxf.includes('5.5000'));
  assert.ok(dxf.includes('3.2000'));
  assert.ok(dxf.includes('10.0000'));
  assert.ok(dxf.includes('7.8000'));
});

test('Vectorization - exportToDXF() gère ouvertures (arcs)', () => {
  const vectors = [
    {
      type: 'opening',
      arc: true,
      center: [5, 0],
      radius: 0.9,
      startAngle: 0,
      endAngle: Math.PI / 2,
      layer: 'ARCH-DOOR'
    }
  ];

  const dxf = Vectorization.exportToDXF(vectors);

  assert.ok(dxf.includes('ARC'));
});

test('Vectorization - exportToDXF() options personnalisation', () => {
  const vectors = [
    { type: 'wall', points: [[0, 0], [10, 0]], layer: 'ARCH-WALL-EXT' }
  ];

  const dxf = Vectorization.exportToDXF(vectors, {
    units: 'inches',
    precision: 2
  });

  assert.ok(dxf.includes('1')); // inches = 1
  assert.ok(dxf.includes('0.00')); // precision 2
});

// =========================================================================
// EXPORT SVG
// =========================================================================

test('Vectorization - exportToSVG() génère SVG valide', () => {
  const vectors = [
    { type: 'wall', points: [[0, 0], [10, 0]], layer: 'ARCH-WALL-EXT' }
  ];

  const svg = Vectorization.exportToSVG(vectors);

  assert.ok(svg.includes('<?xml'));
  assert.ok(svg.includes('<svg'));
  assert.ok(svg.includes('<line'));
  assert.ok(svg.includes('</svg>'));
});

test('Vectorization - exportToSVG() inclut styles', () => {
  const vectors = [
    { type: 'wall', points: [[0, 0], [10, 0]], layer: 'ARCH-WALL-EXT' }
  ];

  const svg = Vectorization.exportToSVG(vectors);

  assert.ok(svg.includes('<style>'));
  assert.ok(svg.includes('.wall-ext'));
  assert.ok(svg.includes('.wall-int'));
});

test('Vectorization - exportToSVG() gère arcs', () => {
  const vectors = [
    {
      type: 'opening',
      arc: true,
      center: [5, 0],
      radius: 0.9,
      startAngle: 0,
      endAngle: Math.PI / 2,
      layer: 'ARCH-DOOR'
    }
  ];

  const svg = Vectorization.exportToSVG(vectors);

  assert.ok(svg.includes('<path'));
  assert.ok(svg.includes('A')); // Arc SVG
});

test('Vectorization - exportToSVG() viewBox personnalisable', () => {
  const vectors = [
    { type: 'wall', points: [[0, 0], [100, 0]], layer: 'ARCH-WALL-EXT' }
  ];

  const svg = Vectorization.exportToSVG(vectors, {
    viewBox: '0 0 200 200'
  });

  assert.ok(svg.includes('viewBox="0 0 200 200"'));
});

// =========================================================================
// PIPELINE COMPLET
// =========================================================================

test('Vectorization - vectorize() traite sketchRecognition', () => {
  const sketchResult = {
    walls: [
      { from: [0, 0], to: [10, 0], thick: 0.25, type: 'ext' },
      { from: [5, 0], to: [5, 5], thick: 0.15, type: 'int' }
    ],
    openings: [
      { type: 'door', center: [2.5, 0], radius: 0.9, startAngle: 0, endAngle: Math.PI / 2 }
    ]
  };

  const result = Vectorization.vectorize(sketchResult);

  assert.ok(result.vectors);
  assert.ok(result.dxf);
  assert.ok(result.svg);
  assert.strictEqual(result.stats.wallCount, 2);
  assert.strictEqual(result.stats.openingCount, 1);
  assert.ok(result.stats.totalLength > 0);
});

test('Vectorization - vectorize() rejette résultat invalide', () => {
  assert.throws(() => {
    Vectorization.vectorize(null);
  }, /invalide/);

  assert.throws(() => {
    Vectorization.vectorize({});
  }, /invalide/);
});

test('Vectorization - vectorize() calcule stats totales', () => {
  const sketchResult = {
    walls: [
      { from: [0, 0], to: [3, 4], thick: 0.25, type: 'ext' }, // length = 5
      { from: [5, 0], to: [5, 10], thick: 0.15, type: 'int' }  // length = 10
    ],
    openings: []
  };

  const result = Vectorization.vectorize(sketchResult);

  assert.strictEqual(result.stats.totalLength, 15);
});

test('Vectorization - vectorize() avec options', () => {
  const sketchResult = {
    walls: [
      { from: [0.123, 0.456], to: [10.789, 0.234], thick: 0.25, type: 'ext' }
    ],
    openings: []
  };

  const result = Vectorization.vectorize(sketchResult, {
    snapToGrid: 0.5,
    simplify: true
  });

  // Vérifier que le snap a été appliqué
  assert.strictEqual(result.vectors[0].points[0][0], 0.0);
  assert.strictEqual(result.vectors[0].points[0][1], 0.5);
});
