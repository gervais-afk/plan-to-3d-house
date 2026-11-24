/**
 * Tests unitaires pour js/rplus1Checker.js
 * Contrôles de conformité pour maisons à étages (R+1)
 */

const { test } = require('node:test');
const assert = require('node:assert');
const RPlus1Checker = require('../js/rplus1Checker.js');

// Données de test : projet R+1 conforme
const createCompliantProject = () => ({
  level0: {
    stairwells: [
      { xMin: 5, xMax: 6.5, zMin: 8, zMax: 10, level: 0 }
    ],
    walls: [
      { from: [0, 0], to: [10, 0], thick: 0.25, type: 'ext', level: 0, openings: [{ type: 'window', at: 2.5, w: 1.2 }] },
      { from: [10, 0], to: [10, 12], thick: 0.25, type: 'ext', level: 0, openings: [] },
      { from: [10, 12], to: [0, 12], thick: 0.25, type: 'ext', level: 0, openings: [] },
      { from: [0, 12], to: [0, 0], thick: 0.25, type: 'ext', level: 0, openings: [] }
    ],
    rooms: [
      {
        id: 'sejour',
        name: 'Séjour',
        bounds: { xMin: 0, xMax: 5, zMin: 0, zMax: 6 },
        level: 0,
        area: 30,
        habitable: true,
        type: 'sejour'
      },
      {
        id: 'sdb',
        name: 'Salle de bain',
        bounds: { xMin: 5, xMax: 8, zMin: 0, zMax: 3 },
        level: 0,
        area: 9,
        habitable: true,
        type: 'sdb'
      }
    ]
  },
  level1: {
    stairwells: [
      { xMin: 5, xMax: 6.5, zMin: 8, zMax: 10, level: 1 }
    ],
    walls: [
      { from: [0, 0], to: [10, 0], thick: 0.25, type: 'ext', level: 1, openings: [{ type: 'window', at: 2.5, w: 1.2 }] },
      { from: [10, 0], to: [10, 12], thick: 0.25, type: 'ext', level: 1, openings: [] },
      { from: [10, 12], to: [0, 12], thick: 0.25, type: 'ext', level: 1, openings: [] },
      { from: [0, 12], to: [0, 0], thick: 0.25, type: 'ext', level: 1, openings: [] }
    ],
    rooms: [
      {
        id: 'chambre1',
        name: 'Chambre 1',
        bounds: { xMin: 0, xMax: 5, zMin: 0, zMax: 6 },
        level: 1,
        area: 30,
        habitable: true,
        type: 'chambre'
      }
    ]
  },
  config: {
    floorHeight: 2.8
  }
});

test('RPlus1Checker - checkStairwells() devrait valider un projet avec trémie présente', () => {
  const project = createCompliantProject();
  const result = RPlus1Checker.checkStairwells(project.level0, project.level1);
  
  assert.strictEqual(result.valid, true);
  assert.strictEqual(result.errors.length, 0);
});

test('RPlus1Checker - checkStairwells() devrait rejeter un projet sans trémie', () => {
  const project = createCompliantProject();
  project.level1.stairwells = [];
  
  const result = RPlus1Checker.checkStairwells(project.level0, project.level1);
  
  assert.strictEqual(result.valid, false);
  assert.ok(result.errors.length > 0);
  assert.ok(result.errors[0].includes('trémie'));
});

test('RPlus1Checker - checkStairwells() devrait rejeter un projet avec trémie mal dimensionnée', () => {
  const project = createCompliantProject();
  project.level1.stairwells[0].xMax = 5.3; // Trop petite (0.3m au lieu de 1.5m)
  
  const result = RPlus1Checker.checkStairwells(project.level0, project.level1);
  
  assert.strictEqual(result.valid, false);
  assert.ok(result.errors.some(e => e.includes('dimensions') || e.includes('correspondance')));
});

test('RPlus1Checker - checkLoadBearingWalls() devrait valider des murs correctement alignés', () => {
  const project = createCompliantProject();
  const result = RPlus1Checker.checkLoadBearingWalls(project.level0, project.level1);
  
  assert.strictEqual(result.valid, true);
  assert.strictEqual(result.warnings.length, 0);
});

test('RPlus1Checker - checkLoadBearingWalls() devrait avertir si un mur porteur disparaît à l\'étage', () => {
  const project = createCompliantProject();
  project.level1.walls = project.level1.walls.slice(0, 2); // Supprime 2 murs
  
  const result = RPlus1Checker.checkLoadBearingWalls(project.level0, project.level1);
  
  assert.ok(result.warnings.length > 0);
  assert.ok(result.warnings.some(w => w.includes('supporté')));
});

test('RPlus1Checker - checkLoadBearingWalls() devrait tolérer un léger décalage (< 15cm)', () => {
  const project = createCompliantProject();
  // Décale légèrement tous les murs de l'étage
  project.level1.walls = project.level1.walls.map(w => ({
    ...w,
    from: [w.from[0] + 0.1, w.from[1] + 0.1],
    to: [w.to[0] + 0.1, w.to[1] + 0.1]
  }));
  
  const result = RPlus1Checker.checkLoadBearingWalls(project.level0, project.level1);
  
  assert.strictEqual(result.valid, true);
});

test('RPlus1Checker - checkNaturalLight() devrait valider des pièces avec fenêtres', () => {
  const project = createCompliantProject();
  const result = RPlus1Checker.checkNaturalLight(project.level1);
  
  assert.strictEqual(result.valid, true);
  assert.strictEqual(result.warnings.length, 0);
});

test('RPlus1Checker - checkNaturalLight() devrait avertir si une pièce habitable n\'a pas de fenêtre', () => {
  const project = createCompliantProject();
  project.level1.walls.forEach(w => w.openings = []); // Supprime toutes les ouvertures
  
  const result = RPlus1Checker.checkNaturalLight(project.level1);
  
  assert.ok(result.warnings.length > 0);
  assert.ok(result.warnings.some(w => w.includes('fenêtre') || w.includes('éclairage')));
});

test('RPlus1Checker - checkNaturalLight() devrait ignorer les pièces non habitables', () => {
  const project = createCompliantProject();
  project.level1.rooms[0].habitable = false;
  project.level1.openings = [];
  
  const result = RPlus1Checker.checkNaturalLight(project.level1);
  
  assert.strictEqual(result.valid, true);
  assert.strictEqual(result.warnings.length, 0);
});

test('RPlus1Checker - checkCeilingHeight() devrait valider une hauteur sous plafond correcte', () => {
  const project = createCompliantProject();
  const result = RPlus1Checker.checkCeilingHeight(project);
  
  assert.strictEqual(result.valid, true);
});

test('RPlus1Checker - checkCeilingHeight() devrait rejeter une hauteur très faible', () => {
  const project = createCompliantProject();
  project.config.floorHeight = 2.0; // < 2.2m (minimum légal)
  
  const result = RPlus1Checker.checkCeilingHeight(project);
  
  assert.strictEqual(result.valid, false);
  assert.ok(result.errors.length > 0);
  assert.ok(result.errors[0].includes('Hauteur') || result.errors[0].includes('hauteur') || result.errors[0].includes('plafond'));
});

test('RPlus1Checker - checkSurfaceConsistency() devrait valider des surfaces cohérentes', () => {
  const project = createCompliantProject();
  const result = RPlus1Checker.checkSurfaceConsistency(project.level0, project.level1);
  
  assert.strictEqual(result.valid, true);
});

test('RPlus1Checker - checkSurfaceConsistency() devrait avertir si l\'étage est trop petit par rapport au RDC', () => {
  const project = createCompliantProject();
  // Surface RDC = 30m² (5x6), surface étage = 3m² (1x3) → ratio = 0.1 < 0.3
  project.level1.rooms[0].bounds = { xMin: 0, xMax: 1, zMin: 0, zMax: 3 };
  
  const result = RPlus1Checker.checkSurfaceConsistency(project.level0, project.level1);
  
  assert.ok(result.warnings.length > 0);
  assert.ok(result.warnings.some(w => w.includes('Surface') || w.includes('petit')));
});

test('RPlus1Checker - checkSurfaceConsistency() devrait avertir si l\'étage est beaucoup plus grand que le RDC', () => {
  const project = createCompliantProject();
  project.level1.rooms[0].bounds.xMax = 10; // Agrandit la surface à 60m²
  
  const result = RPlus1Checker.checkSurfaceConsistency(project.level0, project.level1);
  
  assert.ok(result.warnings.length > 0);
  assert.ok(result.warnings.some(w => w.includes('débord') || w.includes('grand')));
});

test('RPlus1Checker - generateReport() devrait générer un rapport complet', () => {
  const project = createCompliantProject();
  const report = RPlus1Checker.generateReport(project.level0, project.level1, project);
  
  assert.ok(report.valid !== undefined);
  assert.ok(report.checks !== undefined);
  assert.ok(report.errors !== undefined);
  assert.ok(report.warnings !== undefined);
  assert.ok(report.score !== undefined);
  assert.ok(report.summary !== undefined);
});

test('RPlus1Checker - generateReport() devrait retourner un score de conformité', () => {
  const project = createCompliantProject();
  const report = RPlus1Checker.generateReport(project.level0, project.level1, project);
  
  assert.ok(typeof report.score === 'number');
  assert.ok(report.score >= 0 && report.score <= 100);
});

test('RPlus1Checker - generateReport() devrait détailler tous les contrôles effectués', () => {
  const project = createCompliantProject();
  const report = RPlus1Checker.generateReport(project.level0, project.level1, project);
  
  assert.ok(report.checks !== undefined);
  assert.ok(report.checks.stairwell !== undefined);
  assert.ok(report.checks.loadBearingWalls !== undefined);
  assert.ok(report.checks.naturalLight !== undefined);
  assert.ok(report.checks.ceilingHeight !== undefined);
  assert.ok(report.checks.surfaceConsistency !== undefined);
});

test('RPlus1Checker - generateReport() devrait valider un projet parfaitement conforme', () => {
  const project = createCompliantProject();
  const report = RPlus1Checker.generateReport(project.level0, project.level1, project);
  
  assert.strictEqual(report.valid, true);
  assert.strictEqual(report.errors.length, 0);
  assert.ok(report.score >= 90);
});

test('RPlus1Checker - generateReport() devrait rejeter un projet avec erreurs critiques', () => {
  const project = createCompliantProject();
  project.level1.stairwells = []; // Pas de trémie → erreur critique
  project.level1.walls.forEach(w => w.openings = []); // Pas de fenêtres → warning
  
  const report = RPlus1Checker.generateReport(project.level0, project.level1, project);
  
  assert.strictEqual(report.valid, false);
  assert.ok(report.errors.length > 0);
  assert.ok(report.score < 80); // Score réduit par l'erreur critique
});

test('RPlus1Checker - RULES devrait contenir les règles de vérification', () => {
  assert.ok(RPlus1Checker.RULES !== undefined);
  assert.ok(RPlus1Checker.RULES.stairwell !== undefined);
  assert.ok(RPlus1Checker.RULES.loadBearingWalls !== undefined);
  assert.ok(RPlus1Checker.RULES.naturalLight !== undefined);
  assert.ok(RPlus1Checker.RULES.ceilingHeight !== undefined);
  assert.ok(RPlus1Checker.RULES.surfaceConsistency !== undefined);
});

test('RPlus1Checker - THRESHOLDS devrait contenir les seuils de tolérance', () => {
  assert.ok(RPlus1Checker.THRESHOLDS !== undefined);
  assert.ok(RPlus1Checker.THRESHOLDS.minCeilingHeight !== undefined);
  assert.ok(RPlus1Checker.THRESHOLDS.wallAlignmentTolerance !== undefined);
  assert.ok(RPlus1Checker.THRESHOLDS.stairwellSizeTolerance !== undefined);
});
