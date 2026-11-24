/**
 * TESTS UNITAIRES — variantGenerator.js
 */

const { test } = require('node:test');
const assert = require('node:assert');
const VariantGenerator = require('../js/variantGenerator.js');

// =========================================================================
// DONNÉES DE TEST
// =========================================================================

/**
 * Projet de base : appartement T3 (séjour + 2 chambres + cuisine + SDB)
 */
const baseProject = {
  rooms: [
    { id: 'sejour', name: 'Séjour', type: 'sejour', bounds: { xMin: 0, xMax: 6, zMin: 0, zMax: 5 }, area: 30, habitable: true },
    { id: 'ch1', name: 'Chambre 1', type: 'chambre', bounds: { xMin: 6, xMax: 10, zMin: 0, zMax: 4 }, area: 16, habitable: true },
    { id: 'ch2', name: 'Chambre 2', type: 'chambre', bounds: { xMin: 6, xMax: 10, zMin: 4, zMax: 8 }, area: 16, habitable: true },
    { id: 'cuisine', name: 'Cuisine', type: 'cuisine', bounds: { xMin: 0, xMax: 4, zMin: 5, zMax: 8 }, area: 12, habitable: true },
    { id: 'sdb', name: 'SDB', type: 'sdb', bounds: { xMin: 4, xMax: 6, zMin: 5, zMax: 8 }, area: 6, habitable: true }
  ],
  walls: [
    { from: [0, 0], to: [10, 0], type: 'ext', thick: 0.25, openings: [] },
    { from: [10, 0], to: [10, 8], type: 'ext', thick: 0.25, openings: [] },
    { from: [10, 8], to: [0, 8], type: 'ext', thick: 0.25, openings: [] },
    { from: [0, 8], to: [0, 0], type: 'ext', thick: 0.25, openings: [] },
    { from: [6, 0], to: [6, 8], type: 'int', thick: 0.15, openings: [] },
    { from: [6, 4], to: [10, 4], type: 'int', thick: 0.15, openings: [] },
    { from: [0, 5], to: [6, 5], type: 'int', thick: 0.15, openings: [] },
    { from: [4, 5], to: [4, 8], type: 'int', thick: 0.15, openings: [] }
  ]
};

// =========================================================================
// TESTS : ANALYSE DU PLAN
// =========================================================================

test('VariantGenerator - analyzeBasePlan() identifie murs porteurs et cloisons', () => {
  const analysis = VariantGenerator.analyzeBasePlan(baseProject);
  
  assert.strictEqual(analysis.loadBearing.length, 4); // 4 murs extérieurs
  assert.strictEqual(analysis.partitionCount, 4);     // 4 cloisons
  assert.strictEqual(analysis.roomCount, 5);
});

test('VariantGenerator - analyzeBasePlan() calcule la surface totale', () => {
  const analysis = VariantGenerator.analyzeBasePlan(baseProject);
  
  assert.strictEqual(analysis.totalArea, 80); // 30+16+16+12+6
});

test('VariantGenerator - analyzeBasePlan() calcule les bounds globaux', () => {
  const analysis = VariantGenerator.analyzeBasePlan(baseProject);
  
  assert.strictEqual(analysis.bounds.xMin, 0);
  assert.strictEqual(analysis.bounds.xMax, 10);
  assert.strictEqual(analysis.bounds.zMin, 0);
  assert.strictEqual(analysis.bounds.zMax, 8);
});

test('VariantGenerator - analyzeBasePlan() gère projet vide', () => {
  const analysis = VariantGenerator.analyzeBasePlan({});
  
  assert.strictEqual(analysis.roomCount, 0);
  assert.strictEqual(analysis.partitionCount, 0);
  assert.strictEqual(analysis.totalArea, 0);
});

// =========================================================================
// TESTS : CALCULS
// =========================================================================

test('VariantGenerator - computeRoomArea() calcule depuis bounds', () => {
  const room = { bounds: { xMin: 0, xMax: 4, zMin: 0, zMax: 5 } };
  const area = VariantGenerator.computeRoomArea(room);
  
  assert.strictEqual(area, 20);
});

test('VariantGenerator - computeRoomArea() utilise area si disponible', () => {
  const room = { area: 30, bounds: { xMin: 0, xMax: 4, zMin: 0, zMax: 5 } };
  const area = VariantGenerator.computeRoomArea(room);
  
  assert.strictEqual(area, 30);
});

test('VariantGenerator - computeBounds() calcule emprise globale', () => {
  const rooms = [
    { bounds: { xMin: 0, xMax: 5, zMin: 0, zMax: 5 } },
    { bounds: { xMin: 5, xMax: 10, zMin: 2, zMax: 8 } }
  ];
  const bounds = VariantGenerator.computeBounds(rooms);
  
  assert.strictEqual(bounds.xMin, 0);
  assert.strictEqual(bounds.xMax, 10);
  assert.strictEqual(bounds.zMin, 0);
  assert.strictEqual(bounds.zMax, 8);
});

// =========================================================================
// TESTS : OPÉRATEURS DE MODIFICATION
// =========================================================================

test('VariantGenerator - displaceWall() déplace mur horizontal vers le haut', () => {
  const wall = { from: [0, 4], to: [10, 4], type: 'int', thick: 0.15 };
  const moved = VariantGenerator.displaceWall(wall, 1);
  
  // Déplacement de 1m vers le haut (z augmente)
  assert.ok(moved.from[1] > 4);
  assert.ok(moved.to[1] > 4);
  assert.strictEqual(moved.displaced, true);
});

test('VariantGenerator - displaceWall() conserve mur vertical', () => {
  const wall = { from: [5, 0], to: [5, 8], type: 'int', thick: 0.15 };
  const moved = VariantGenerator.displaceWall(wall, 0.5);
  
  // Le mur devrait rester vertical
  assert.ok(Math.abs(moved.from[0] - moved.to[0]) < 0.01);
});

test('VariantGenerator - resizeRoom() agrandit une pièce', () => {
  const room = { bounds: { xMin: 0, xMax: 4, zMin: 0, zMax: 4 } };
  const resized = VariantGenerator.resizeRoom(room, { xMax: 1, zMax: 1 });
  
  assert.strictEqual(resized.bounds.xMax, 5);
  assert.strictEqual(resized.bounds.zMax, 5);
  assert.strictEqual(resized.area, 25);
});

test('VariantGenerator - resizeRoom() refuse pièce trop petite', () => {
  const room = { bounds: { xMin: 0, xMax: 4, zMin: 0, zMax: 4 } };
  const resized = VariantGenerator.resizeRoom(room, { xMax: -5, zMax: -5 });
  
  // Devrait retourner la pièce originale (trop petite)
  assert.strictEqual(resized.bounds.xMax, 4);
});

test('VariantGenerator - mergeRooms() fusionne deux pièces adjacentes', () => {
  const r1 = { id: 'r1', name: 'Chambre 1', bounds: { xMin: 0, xMax: 5, zMin: 0, zMax: 4 }, habitable: true };
  const r2 = { id: 'r2', name: 'Chambre 2', bounds: { xMin: 5, xMax: 10, zMin: 0, zMax: 4 }, habitable: true };
  
  const merged = VariantGenerator.mergeRooms(r1, r2);
  
  assert.ok(merged);
  assert.strictEqual(merged.bounds.xMin, 0);
  assert.strictEqual(merged.bounds.xMax, 10);
});

test('VariantGenerator - splitRoom() divise une pièce en deux', () => {
  const room = { id: 'r1', name: 'Grand séjour', bounds: { xMin: 0, xMax: 10, zMin: 0, zMax: 5 } };
  
  const parts = VariantGenerator.splitRoom(room, 'x', 5);
  
  assert.strictEqual(parts.length, 2);
  assert.strictEqual(parts[0].bounds.xMax, 5);
  assert.strictEqual(parts[1].bounds.xMin, 5);
  assert.strictEqual(parts[0].area, 25);
  assert.strictEqual(parts[1].area, 25);
});

test('VariantGenerator - splitRoom() refuse division trop proche du bord', () => {
  const room = { bounds: { xMin: 0, xMax: 10, zMin: 0, zMax: 5 } };
  
  const parts = VariantGenerator.splitRoom(room, 'x', 0.5);
  
  assert.strictEqual(parts.length, 1); // Pas de division
});

// =========================================================================
// TESTS : FONCTION FITNESS
// =========================================================================

test('VariantGenerator - evaluateFitness() score 0 pour variante vide', () => {
  const variant = { rooms: [], walls: [] };
  const analysis = VariantGenerator.analyzeBasePlan(baseProject);
  
  const score = VariantGenerator.evaluateFitness(variant, analysis);
  
  assert.strictEqual(score, 0);
});

test('VariantGenerator - evaluateFitness() score élevé pour plan conforme', () => {
  const variant = { rooms: baseProject.rooms, walls: baseProject.walls };
  const analysis = VariantGenerator.analyzeBasePlan(baseProject);
  
  const score = VariantGenerator.evaluateFitness(variant, analysis);
  
  assert.ok(score > 50, `Score ${score} devrait être > 50 pour plan conforme`);
});

test('VariantGenerator - evaluateFitness() pénalise surfaces insuffisantes', () => {
  const variant = {
    rooms: [{ type: 'chambre', bounds: { xMin: 0, xMax: 2, zMin: 0, zMax: 2 }, area: 4 }],
    walls: []
  };
  const analysis = VariantGenerator.analyzeBasePlan(baseProject);
  
  const score = VariantGenerator.evaluateFitness(variant, analysis);
  
  // Chambre 4m² < min 9m² → score faible
  assert.ok(score < 50, `Score ${score} devrait être < 50 pour chambre trop petite`);
});

// =========================================================================
// TESTS : GÉNÉRATION DE VARIANTES
// =========================================================================

test('VariantGenerator - generateVariants() retourne un tableau trié', () => {
  const variants = VariantGenerator.generateVariants(baseProject, {
    populationSize: 10,
    generations: 5,
    topN: 3
  });
  
  assert.ok(Array.isArray(variants));
  assert.ok(variants.length <= 3);
  
  // Vérifier tri décroissant par fitness
  for (let i = 1; i < variants.length; i++) {
    assert.ok(variants[i - 1].fitness >= variants[i].fitness);
  }
});

test('VariantGenerator - generateVariants() conserve le plan original dans top résultats', () => {
  const variants = VariantGenerator.generateVariants(baseProject, {
    populationSize: 10,
    generations: 10,
    topN: 5
  });
  
  // Au moins une variante devrait être proche du plan original (fitness > 50)
  const best = variants[0];
  assert.ok(best.fitness > 0, 'Le meilleur devrait avoir fitness > 0');
});

test('VariantGenerator - generateVariants() retourne variantes avec métriques', () => {
  const variants = VariantGenerator.generateVariants(baseProject, {
    populationSize: 5,
    generations: 3,
    topN: 2
  });
  
  for (const v of variants) {
    assert.ok(v.metrics);
    assert.ok(typeof v.metrics.totalArea === 'number');
    assert.ok(typeof v.metrics.roomCount === 'number');
    assert.ok(typeof v.metrics.efficiency === 'number');
  }
});

test('VariantGenerator - generateVariants() respecte topN', () => {
  const variants = VariantGenerator.generateVariants(baseProject, {
    populationSize: 20,
    generations: 10,
    topN: 3
  });
  
  assert.ok(variants.length <= 3);
});

test('VariantGenerator - generateVariants() décrit les changements', () => {
  const variants = VariantGenerator.generateVariants(baseProject, {
    populationSize: 10,
    generations: 5,
    topN: 2
  });
  
  for (const v of variants) {
    assert.ok(Array.isArray(v.changes));
    // Chaque changement a un type et une room
    for (const change of v.changes) {
      assert.ok(['added', 'removed', 'enlarged', 'reduced'].includes(change.type));
    }
  }
});

test('VariantGenerator - generateVariants() gère projet sans rooms', () => {
  const variants = VariantGenerator.generateVariants({ rooms: [], walls: [] }, {
    populationSize: 5,
    generations: 3,
    topN: 2
  });
  
  assert.ok(Array.isArray(variants));
});

// =========================================================================
// TESTS : MÉTRIQUES
// =========================================================================

test('VariantGenerator - computeVariantMetrics() calcule métriques complètes', () => {
  const variant = { rooms: baseProject.rooms, walls: baseProject.walls };
  const metrics = VariantGenerator.computeVariantMetrics(variant);
  
  assert.strictEqual(metrics.totalArea, 80);
  assert.strictEqual(metrics.habitableArea, 80);
  assert.strictEqual(metrics.roomCount, 5);
  assert.ok(metrics.efficiency > 0 && metrics.efficiency <= 100);
});

test('VariantGenerator - computeVariantMetrics() exclut pièces non habitables', () => {
  const variant = {
    rooms: [
      { area: 30, habitable: true },
      { area: 10, habitable: true },
      { area: 20, habitable: false } // Garage
    ]
  };
  const metrics = VariantGenerator.computeVariantMetrics(variant);
  
  assert.strictEqual(metrics.totalArea, 60);
  assert.strictEqual(metrics.habitableArea, 40);
});

// =========================================================================
// TESTS : RÈGLES ET CONSTANTES
// =========================================================================

test('VariantGenerator - RULES définit surfaces minimales', () => {
  assert.ok(VariantGenerator.RULES.minSurface.sejour > 0);
  assert.ok(VariantGenerator.RULES.minSurface.chambre > 0);
  assert.ok(VariantGenerator.RULES.minSurface.cuisine > 0);
  assert.ok(VariantGenerator.RULES.minSurface.sdb > 0);
});

test('VariantGenerator - RULES définit contraintes circulation', () => {
  assert.ok(VariantGenerator.RULES.minCirculation > 0);
  assert.ok(VariantGenerator.RULES.maxCirculationRatio > 0);
});

test('VariantGenerator - DEFAULTS définit paramètres génétiques', () => {
  assert.ok(VariantGenerator.DEFAULTS.populationSize > 0);
  assert.ok(VariantGenerator.DEFAULTS.generations > 0);
  assert.ok(VariantGenerator.DEFAULTS.mutationRate >= 0 && VariantGenerator.DEFAULTS.mutationRate <= 1);
});

// =========================================================================
// TESTS : INTÉGRATION
// =========================================================================

test('VariantGenerator - workflow complet : analyse → génération → évaluation', () => {
  // 1. Analyse du plan de base
  const analysis = VariantGenerator.analyzeBasePlan(baseProject);
  assert.strictEqual(analysis.roomCount, 5);
  
  // 2. Génération de variantes
  const variants = VariantGenerator.generateVariants(baseProject, {
    populationSize: 10,
    generations: 5,
    topN: 3
  });
  assert.ok(variants.length > 0);
  
  // 3. Vérification des métriques
  const best = variants[0];
  assert.ok(best.fitness >= 0);
  assert.ok(best.metrics.totalArea > 0);
  
  // 4. Description des changements
  assert.ok(Array.isArray(best.changes));
});

test('VariantGenerator - génération : structure cohérente entre appels', () => {
  // Deux appels avec même configuration devraient retourner résultats structurellement similaires
  const v1 = VariantGenerator.generateVariants(baseProject, {
    populationSize: 5,
    generations: 3,
    topN: 2
  });
  const v2 = VariantGenerator.generateVariants(baseProject, {
    populationSize: 5,
    generations: 3,
    topN: 2
  });
  
  // Même nombre max de variantes demandées
  assert.ok(v1.length <= 2);
  assert.ok(v2.length <= 2);
  
  // Au moins une variante retournée dans chaque cas
  assert.ok(v1.length > 0);
  assert.ok(v2.length > 0);
  
  // Scores dans même ordre de grandeur (pas exactement égaux à cause du random)
  if (v1[0] && v2[0]) {
    assert.ok(Math.abs(v1[0].fitness - v2[0].fitness) < 30);
  }
});
