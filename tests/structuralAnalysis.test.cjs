/**
 * TESTS UNITAIRES — structuralAnalysis.js
 * Analyse structurelle simplifiée
 */

const { test } = require('node:test');
const assert = require('node:assert');
const StructuralAnalysis = require('../js/structuralAnalysis.js');

// =========================================================================
// DONNÉES DE TEST
// =========================================================================

const simpleProject = {
  rooms: [
    { id: 'sejour', name: 'Séjour', area: 30, bounds: { xMin: 0, xMax: 6, zMin: 0, zMax: 5 } }
  ],
  walls: [
    { from: [0, 0], to: [10, 0], thick: 0.25, type: 'ext' },
    { from: [10, 0], to: [10, 8], thick: 0.25, type: 'ext' },
    { from: [10, 8], to: [0, 8], thick: 0.25, type: 'ext' },
    { from: [0, 8], to: [0, 0], thick: 0.25, type: 'ext' },
    { from: [5, 0], to: [5, 8], thick: 0.15, type: 'int' }
  ],
  config: { height: 2.5 }
};

// =========================================================================
// DÉTECTION MURS PORTEURS
// =========================================================================

test('StructuralAnalysis - detectLoadBearingWalls() détecte murs extérieurs', () => {
  const result = StructuralAnalysis.detectLoadBearingWalls(simpleProject);

  // Les 4 murs extérieurs devraient être porteurs
  assert.ok(result.loadBearingWalls.length >= 4);
  assert.strictEqual(result.stats.total, 5);
  assert.ok(result.stats.ratio > 0.7);
});

test('StructuralAnalysis - detectLoadBearingWalls() exclut cloisons fines', () => {
  const project = {
    walls: [
      { from: [0, 0], to: [5, 0], thick: 0.10, type: 'int' },
      { from: [0, 0], to: [5, 0], thick: 0.25, type: 'ext' }
    ]
  };

  const result = StructuralAnalysis.detectLoadBearingWalls(project);

  // Le mur extérieur devrait être porteur, pas la cloison fine
  assert.ok(result.loadBearingWalls.some(lbw => lbw.wall.type === 'ext'));
});

test('StructuralAnalysis - analyzeWall() calcule score porteur', () => {
  const wall = { from: [0, 0], to: [10, 0], thick: 0.25, type: 'ext' };
  const analysis = StructuralAnalysis.analyzeWall(wall, simpleProject);

  assert.strictEqual(analysis.isLoadBearing, true);
  assert.ok(analysis.score >= 3);
  assert.ok(analysis.reasons.length > 0);
});

test('StructuralAnalysis - countConnections() compte connexions', () => {
  const wall = { from: [0, 0], to: [10, 0] };
  const walls = [
    wall,
    { from: [0, 0], to: [0, 8] },
    { from: [10, 0], to: [10, 8] }
  ];

  const count = StructuralAnalysis.countConnections(wall, walls);

  assert.strictEqual(count, 2);
});

// =========================================================================
// CALCUL DES CHARGES
// =========================================================================

test('StructuralAnalysis - computeLoadPath() calcule charges', () => {
  const result = StructuralAnalysis.computeLoadPath(simpleProject);

  assert.ok(result.wallLoads.length > 0);
  assert.ok(result.totalLoad > 0);
  assert.ok(result.stats.maxLoad > 0);
  assert.ok(result.stats.avgLoad > 0);
});

test('StructuralAnalysis - computeWallLoad() calcule charge mur', () => {
  const wall = { from: [0, 0], to: [10, 0], thick: 0.25, type: 'ext' };
  const load = StructuralAnalysis.computeWallLoad(wall, simpleProject.rooms, simpleProject);

  assert.ok(load.permanentLoad > 0);
  assert.ok(load.liveLoad >= 0);
  assert.ok(load.climateLoad >= 0);
  assert.ok(load.totalLoad > 0);
  assert.ok(load.stress > 0);
  assert.strictEqual(load.length, 10);
});

test('StructuralAnalysis - computeWallLoad() murs extérieurs supportent plus', () => {
  const extWall = { from: [0, 0], to: [10, 0], thick: 0.25, type: 'ext' };
  const intWall = { from: [0, 0], to: [10, 0], thick: 0.15, type: 'int' };

  const extLoad = StructuralAnalysis.computeWallLoad(extWall, simpleProject.rooms, simpleProject);
  const intLoad = StructuralAnalysis.computeWallLoad(intWall, simpleProject.rooms, simpleProject);

  // Mur extérieur devrait supporter plus (toiture + charges climatiques)
  assert.ok(extLoad.totalLoad > intLoad.totalLoad);
});

// =========================================================================
// VÉRIFICATION DIMENSIONNEMENT
// =========================================================================

test('StructuralAnalysis - checkStructuralAdequacy() vérifie murs', () => {
  const result = StructuralAnalysis.checkStructuralAdequacy(simpleProject);

  assert.ok(result.checks.length > 0);
  assert.ok(result.stats.adequate > 0);
  assert.ok(result.stats.avgUtilization > 0);
});

test('StructuralAnalysis - checkStructuralAdequacy() retourne structure valide', () => {
  const project = {
    walls: [
      { from: [0, 0], to: [10, 0], thick: 0.15, type: 'ext', material: 'wood' }
    ],
    rooms: [
      { id: 'room1', name: 'Room 1', area: 50, bounds: { xMin: 0, xMax: 10, zMin: 0, zMax: 5 } }
    ],
    config: { height: 3 }
  };

  const result = StructuralAnalysis.checkStructuralAdequacy(project);

  // Vérifie que la structure de retour est valide
  assert.ok(result.checks.length > 0);
  assert.ok(result.stats.adequate >= 0);
  assert.ok(result.stats.avgUtilization >= 0);
});

test('StructuralAnalysis - checkStructuralAdequacy() calcule ratio utilisation', () => {
  const result = StructuralAnalysis.checkStructuralAdequacy(simpleProject);

  for (const check of result.checks) {
    assert.ok(check.utilizationRatio > 0);
    assert.ok(check.utilizationRatio < 10); // devrait être raisonnable
  }
});

// =========================================================================
// SUGGESTIONS RENFORCEMENT
// =========================================================================

test('StructuralAnalysis - suggestReinforcement() propose solutions', () => {
  const adequacy = {
    errors: [
      {
        wall: { from: [0, 0], to: [10, 0], thick: 0.15 },
        message: 'Mur sous-dimensionné',
        utilizationRatio: 1.5
      }
    ],
    warnings: []
  };

  const suggestions = StructuralAnalysis.suggestReinforcement(adequacy);

  assert.strictEqual(suggestions.length, 1);
  assert.ok(suggestions[0].solutions.length >= 2);
  assert.strictEqual(suggestions[0].solutions[0].type, 'épaississement');
});

test('StructuralAnalysis - suggestReinforcement() gère warnings', () => {
  const adequacy = {
    errors: [],
    warnings: [
      {
        wall: { from: [0, 0], to: [10, 0], thick: 0.20 },
        message: 'Mur proche limite',
        utilizationRatio: 0.85
      }
    ]
  };

  const suggestions = StructuralAnalysis.suggestReinforcement(adequacy);

  assert.strictEqual(suggestions.length, 1);
  assert.strictEqual(suggestions[0].solutions[0].type, 'surveillance');
});

// =========================================================================
// ANALYSE COMPLÈTE
// =========================================================================

test('StructuralAnalysis - analyzeStructure() analyse complète', () => {
  const result = StructuralAnalysis.analyzeStructure(simpleProject);

  assert.ok(result.loadBearing);
  assert.ok(result.loadPath);
  assert.ok(result.adequacy);
  assert.ok(result.reinforcements);
  assert.ok(result.summary);

  assert.strictEqual(result.summary.totalWalls, 5);
  assert.ok(result.summary.totalLoad > 0);
});

test('StructuralAnalysis - analyzeStructure() projet vide', () => {
  const result = StructuralAnalysis.analyzeStructure({ rooms: [], walls: [] });

  assert.strictEqual(result.loadBearing.stats.total, 0);
  assert.strictEqual(result.summary.totalLoad, 0);
});

// =========================================================================
// CONSTANTES
// =========================================================================

test('StructuralAnalysis - MATERIALS définit propriétés', () => {
  assert.ok(StructuralAnalysis.MATERIALS.masonry);
  assert.ok(StructuralAnalysis.MATERIALS.reinforcedConcrete);
  assert.ok(StructuralAnalysis.MATERIALS.wood);

  assert.ok(StructuralAnalysis.MATERIALS.masonry.density > 0);
  assert.ok(StructuralAnalysis.MATERIALS.masonry.compressiveStrength > 0);
});

test('StructuralAnalysis - LOADS définit charges', () => {
  assert.ok(StructuralAnalysis.LOADS.permanent);
  assert.ok(StructuralAnalysis.LOADS.live);
  assert.ok(StructuralAnalysis.LOADS.climate);

  assert.ok(StructuralAnalysis.LOADS.permanent.roof > 0);
  assert.ok(StructuralAnalysis.LOADS.live.habitation > 0);
});

test('StructuralAnalysis - SAFETY_FACTORS définit coefficients', () => {
  assert.ok(StructuralAnalysis.SAFETY_FACTORS.gammaG > 1);
  assert.ok(StructuralAnalysis.SAFETY_FACTORS.gammaQ > 1);
  assert.ok(StructuralAnalysis.SAFETY_FACTORS.gammaM > 1);
});
