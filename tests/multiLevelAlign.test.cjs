/**
 * Tests unitaires pour js/multiLevelAlign.js
 * Recalage automatique des niveaux R+1 par points d'ancrage communs
 */

const { test } = require('node:test');
const assert = require('node:assert');
const MultiLevelAlign = require('../js/multiLevelAlign.js');

// Données de test : projet R+1 simple
const createTestProject = () => ({
  level0: {
    stairwells: [
      { xMin: 5, xMax: 6, zMin: 8, zMax: 10, level: 0 }
    ],
    walls: [
      { from: [0, 0], to: [10, 0], thick: 0.2, type: 'ext', level: 0 },
      { from: [10, 0], to: [10, 12], thick: 0.2, type: 'ext', level: 0 },
      { from: [10, 12], to: [0, 12], thick: 0.2, type: 'ext', level: 0 },
      { from: [0, 12], to: [0, 0], thick: 0.2, type: 'ext', level: 0 }
    ],
    rooms: [
      {
        id: 'sejour',
        name: 'Séjour',
        bounds: { xMin: 0, xMax: 5, zMin: 0, zMax: 6 },
        level: 0,
        area: 30
      }
    ]
  },
  level1: {
    stairwells: [
      { xMin: 5, xMax: 6, zMin: 8, zMax: 10, level: 1 }
    ],
    walls: [
      { from: [0, 0], to: [10, 0], thick: 0.2, type: 'ext', level: 1 },
      { from: [10, 0], to: [10, 12], thick: 0.2, type: 'ext', level: 1 },
      { from: [10, 12], to: [0, 12], thick: 0.2, type: 'ext', level: 1 },
      { from: [0, 12], to: [0, 0], thick: 0.2, type: 'ext', level: 1 }
    ],
    rooms: [
      {
        id: 'chambre',
        name: 'Chambre',
        bounds: { xMin: 0, xMax: 5, zMin: 0, zMax: 6 },
        level: 1,
        area: 30
      }
    ]
  }
});

test('MultiLevelAlign - findCommonAnchors() devrait trouver les trémies communes', () => {
  const project = createTestProject();
  const anchors = MultiLevelAlign.findCommonAnchors(project.level0, project.level1);
  
  assert.ok(Array.isArray(anchors));
  assert.ok(anchors.length > 0);
  
  const stairwellAnchors = anchors.filter(a => a.type === 'stairwell');
  assert.ok(stairwellAnchors.length > 0);
});

test('MultiLevelAlign - findCommonAnchors() devrait ignorer les éléments trop éloignés', () => {
  const project = createTestProject();
  project.level1.stairwells[0].xMin = 100; // Trémie très éloignée
  
  const anchors = MultiLevelAlign.findCommonAnchors(project.level0, project.level1, 2.0);
  
  const stairwellAnchors = anchors.filter(a => a.type === 'stairwell');
  assert.strictEqual(stairwellAnchors.length, 0);
});

test('MultiLevelAlign - findCommonAnchors() devrait accepter un paramètre de distance maximale', () => {
  const project = createTestProject();
  project.level1.stairwells[0].xMin = 7; // Décalage de 2m
  
  const anchorsStrict = MultiLevelAlign.findCommonAnchors(project.level0, project.level1, 1.0);
  const anchorsLoose = MultiLevelAlign.findCommonAnchors(project.level0, project.level1, 3.0);
  
  assert.ok(anchorsStrict.length < anchorsLoose.length);
});

test('MultiLevelAlign - computeAlignment() devrait calculer une transformation nulle pour des niveaux identiques', () => {
  const anchors = [
    { p0: [5, 5], p1: [5, 5] },
    { p0: [10, 10], p1: [10, 10] }
  ];
  
  const transform = MultiLevelAlign.computeAlignment(anchors);
  
  assert.ok(transform.tx !== undefined);
  assert.ok(transform.tz !== undefined);
  assert.ok(transform.theta !== undefined);
  assert.ok(Math.abs(transform.tx) < 0.01);
  assert.ok(Math.abs(transform.tz) < 0.01);
  assert.ok(Math.abs(transform.theta) < 0.01);
});

test('MultiLevelAlign - computeAlignment() devrait calculer une translation pure', () => {
  const anchors = [
    { p0: [5, 5], p1: [6, 5] },  // Décalage de +1 en X
    { p0: [10, 10], p1: [11, 10] }
  ];
  
  const transform = MultiLevelAlign.computeAlignment(anchors);
  
  // La translation devrait être d'environ -1 en X (pour ramener p1 vers p0)
  assert.ok(Math.abs(transform.tx + 1) < 0.5);
  assert.ok(Math.abs(transform.tz) < 0.5);
});

test('MultiLevelAlign - computeAlignment() devrait gérer au moins 2 points d\'ancrage', () => {
  const anchors = [
    { p0: [5, 5], p1: [5, 5] }
  ];
  
  const transform = MultiLevelAlign.computeAlignment(anchors);
  
  assert.ok(transform.tx !== undefined);
  assert.ok(transform.tz !== undefined);
  assert.ok(transform.theta !== undefined);
});

test('MultiLevelAlign - applyTransform() devrait appliquer une translation', () => {
  const point = [5, 10];
  const transformed = MultiLevelAlign.applyTransform(point, 2, 3, 0);
  
  assert.strictEqual(transformed[0], 7);
  assert.strictEqual(transformed[1], 13);
});

test('MultiLevelAlign - applyTransform() devrait appliquer une rotation de 90 degrés', () => {
  const point = [1, 0];
  const angle = Math.PI / 2; // 90 degrés
  const transformed = MultiLevelAlign.applyTransform(point, 0, 0, angle);
  
  assert.ok(Math.abs(transformed[0] - 0) < 0.01);
  assert.ok(Math.abs(transformed[1] - 1) < 0.01);
});

test('MultiLevelAlign - applyTransform() devrait appliquer une rotation de 180 degrés', () => {
  const point = [1, 0];
  const angle = Math.PI; // 180 degrés
  const transformed = MultiLevelAlign.applyTransform(point, 0, 0, angle);
  
  assert.ok(Math.abs(transformed[0] - (-1)) < 0.01);
  assert.ok(Math.abs(transformed[1] - 0) < 0.01);
});

test('MultiLevelAlign - applyAlignment() devrait transformer les murs', () => {
  const levelData = {
    walls: [
      { from: [0, 0], to: [10, 0], type: 'ext' },
      { from: [10, 0], to: [10, 10], type: 'ext' }
    ]
  };
  
  const transform = { tx: 1, tz: 2, theta: 0 };
  const aligned = MultiLevelAlign.applyAlignment(levelData, transform);
  
  assert.strictEqual(aligned.walls[0].from[0], 1);
  assert.strictEqual(aligned.walls[0].from[1], 2);
  assert.strictEqual(aligned.walls[0].to[0], 11);
  assert.strictEqual(aligned.walls[0].to[1], 2);
});

test('MultiLevelAlign - applyAlignment() devrait transformer les pièces avec bounds', () => {
  const levelData = {
    rooms: [
      { id: 'sejour', bounds: { xMin: 0, xMax: 5, zMin: 0, zMax: 6 } }
    ]
  };
  
  const transform = { tx: 2, tz: 3, theta: 0 };
  const aligned = MultiLevelAlign.applyAlignment(levelData, transform);
  
  assert.strictEqual(aligned.rooms[0].bounds.xMin, 2);
  assert.strictEqual(aligned.rooms[0].bounds.xMax, 7);
  assert.strictEqual(aligned.rooms[0].bounds.zMin, 3);
  assert.strictEqual(aligned.rooms[0].bounds.zMax, 9);
});

test('MultiLevelAlign - applyAlignment() devrait transformer les pièces avec polygones', () => {
  const levelData = {
    rooms: [
      { id: 'sejour', poly: [[0, 0], [5, 0], [5, 6], [0, 6]] }
    ]
  };
  
  const transform = { tx: 1, tz: 1, theta: 0 };
  const aligned = MultiLevelAlign.applyAlignment(levelData, transform);
  
  assert.strictEqual(aligned.rooms[0].poly[0][0], 1);
  assert.strictEqual(aligned.rooms[0].poly[0][1], 1);
  assert.strictEqual(aligned.rooms[0].poly[1][0], 6);
  assert.strictEqual(aligned.rooms[0].poly[1][1], 1);
});

test('MultiLevelAlign - applyAlignment() ne devrait pas modifier l\'objet original', () => {
  const levelData = {
    walls: [
      { from: [0, 0], to: [10, 0], type: 'ext' }
    ]
  };
  
  const transform = { tx: 5, tz: 5, theta: 0 };
  const aligned = MultiLevelAlign.applyAlignment(levelData, transform);
  
  assert.strictEqual(levelData.walls[0].from[0], 0);
  assert.strictEqual(aligned.walls[0].from[0], 5);
});

test('MultiLevelAlign - validateAlignment() devrait valider une transformation précise', () => {
  const transform = { tx: 0.01, tz: 0.02, theta: 0.01, error: 0.03 };
  const validation = MultiLevelAlign.validateAlignment(transform, 0.10, 0.087);
  
  assert.strictEqual(validation.valid, true);
  assert.strictEqual(validation.warnings.length, 0);
});

test('MultiLevelAlign - validateAlignment() devrait rejeter une transformation avec erreur élevée', () => {
  const transform = { tx: 0.01, tz: 0.02, theta: 0.01, error: 0.20 };
  const validation = MultiLevelAlign.validateAlignment(transform, 0.10, 0.087);
  
  assert.strictEqual(validation.valid, false);
  assert.ok(validation.warnings.length > 0);
});

test('MultiLevelAlign - validateAlignment() devrait rejeter une rotation excessive', () => {
  const transform = { tx: 0.01, tz: 0.02, theta: 0.15, error: 0.03 }; // 0.15 rad > 0.087 rad (5°)
  const validation = MultiLevelAlign.validateAlignment(transform, 0.10, 0.087);
  
  assert.strictEqual(validation.valid, false);
  assert.ok(validation.warnings.length > 0);
});

test('MultiLevelAlign - alignLevels() devrait aligner deux niveaux correctement', () => {
  const project = createTestProject();
  const result = MultiLevelAlign.alignLevels(project.level0, project.level1);
  
  assert.ok(result.transform !== null);
  assert.ok(result.alignedLevel1 !== undefined);
  assert.ok(Array.isArray(result.warnings));
});

test('MultiLevelAlign - alignLevels() devrait échouer si pas assez de points d\'ancrage', () => {
  const level0 = { stairwells: [], walls: [], rooms: [] };
  const level1 = { stairwells: [], walls: [], rooms: [] };
  
  const result = MultiLevelAlign.alignLevels(level0, level1);
  
  assert.strictEqual(result.valid, false);
  assert.ok(result.warnings.length > 0);
});

test('MultiLevelAlign - alignLevels() devrait retourner les points d\'ancrage trouvés', () => {
  const project = createTestProject();
  const result = MultiLevelAlign.alignLevels(project.level0, project.level1);
  
  assert.ok(Array.isArray(result.anchors));
  assert.ok(result.anchors.length > 0);
});

test('MultiLevelAlign - alignLevels() devrait accepter des options personnalisées', () => {
  const project = createTestProject();
  const options = { maxDistance: 5.0, maxError: 0.20, maxRotation: 0.15 };
  
  const result = MultiLevelAlign.alignLevels(project.level0, project.level1, options);
  
  assert.ok(result.transform !== null);
});
