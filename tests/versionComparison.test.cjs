/**
 * TESTS UNITAIRES — versionComparison.js
 * Comparaison de versions de plans
 */

const { test } = require('node:test');
const assert = require('node:assert');
const VersionComparison = require('../js/versionComparison.js');

// =========================================================================
// DONNÉES DE TEST
// =========================================================================

const project1 = {
  walls: [
    { from: [0, 0], to: [10, 0], thick: 0.25, type: 'ext' },
    { from: [10, 0], to: [10, 8], thick: 0.25, type: 'ext' },
    { from: [10, 8], to: [0, 8], thick: 0.25, type: 'ext' },
    { from: [0, 8], to: [0, 0], thick: 0.25, type: 'ext' },
    { from: [5, 0], to: [5, 8], thick: 0.15, type: 'int' }
  ],
  rooms: [
    { id: 'r1', name: 'Séjour', area: 40, type: 'sejour', bounds: { xMin: 0, xMax: 5, zMin: 0, zMax: 8 }, habitable: true },
    { id: 'r2', name: 'Chambre', area: 40, type: 'chambre', bounds: { xMin: 5, xMax: 10, zMin: 0, zMax: 8 }, habitable: true }
  ]
};

const project2 = {
  walls: [
    { from: [0, 0], to: [10, 0], thick: 0.25, type: 'ext' },
    { from: [10, 0], to: [10, 8], thick: 0.25, type: 'ext' },
    { from: [10, 8], to: [0, 8], thick: 0.25, type: 'ext' },
    { from: [0, 8], to: [0, 0], thick: 0.25, type: 'ext' },
    { from: [6, 0], to: [6, 8], thick: 0.15, type: 'int' } // Déplacé
  ],
  rooms: [
    { id: 'r1', name: 'Séjour', area: 48, type: 'sejour', bounds: { xMin: 0, xMax: 6, zMin: 0, zMax: 8 }, habitable: true }, // Agrandi
    { id: 'r2', name: 'Chambre', area: 32, type: 'chambre', bounds: { xMin: 6, xMax: 10, zMin: 0, zMax: 8 }, habitable: true } // Réduit
  ]
};

// =========================================================================
// COMPARAISON MURS
// =========================================================================

test('VersionComparison - compareWalls() détecte murs identiques', () => {
  const walls = [
    { from: [0, 0], to: [10, 0], thick: 0.25, type: 'ext' }
  ];

  const result = VersionComparison.compareWalls(walls, walls);

  assert.strictEqual(result.unchanged.length, 1);
  assert.strictEqual(result.added.length, 0);
  assert.strictEqual(result.removed.length, 0);
});

test('VersionComparison - compareWalls() détecte murs ajoutés', () => {
  const walls1 = [];
  const walls2 = [
    { from: [0, 0], to: [10, 0], thick: 0.25, type: 'ext' }
  ];

  const result = VersionComparison.compareWalls(walls1, walls2);

  assert.strictEqual(result.added.length, 1);
  assert.strictEqual(result.removed.length, 0);
});

test('VersionComparison - compareWalls() détecte murs supprimés', () => {
  const walls1 = [
    { from: [0, 0], to: [10, 0], thick: 0.25, type: 'ext' }
  ];
  const walls2 = [];

  const result = VersionComparison.compareWalls(walls1, walls2);

  assert.strictEqual(result.added.length, 0);
  assert.strictEqual(result.removed.length, 1);
});

test('VersionComparison - compareWalls() détecte murs modifiés', () => {
  const walls1 = [
    { from: [0, 0], to: [10, 0], thick: 0.25, type: 'ext' }
  ];
  const walls2 = [
    { from: [0, 0], to: [10, 0], thick: 0.20, type: 'ext' } // Épaisseur changée
  ];

  const result = VersionComparison.compareWalls(walls1, walls2);

  assert.strictEqual(result.modified.length, 1);
  assert.strictEqual(result.modified[0].changes.length, 1);
  assert.strictEqual(result.modified[0].changes[0].property, 'thickness');
});

test('VersionComparison - wallsMatch() vérifie correspondance', () => {
  const w1 = { from: [0, 0], to: [10, 0] };
  const w2 = { from: [0, 0], to: [10, 0] };
  const w3 = { from: [0, 0], to: [10, 0.5] };

  assert.strictEqual(VersionComparison.wallsMatch(w1, w2, 0.1), true);
  assert.strictEqual(VersionComparison.wallsMatch(w1, w3, 0.1), false);
});

test('VersionComparison - pointsMatch() vérifie points', () => {
  const p1 = [0, 0];
  const p2 = [0.05, 0.05];
  const p3 = [1, 1];

  assert.strictEqual(VersionComparison.pointsMatch(p1, p2, 0.1), true);
  assert.strictEqual(VersionComparison.pointsMatch(p1, p3, 0.1), false);
});

// =========================================================================
// COMPARAISON PIÈCES
// =========================================================================

test('VersionComparison - compareRooms() détecte pièces identiques', () => {
  const rooms = [
    { id: 'r1', name: 'Séjour', area: 30 }
  ];

  const result = VersionComparison.compareRooms(rooms, rooms);

  assert.strictEqual(result.unchanged.length, 1);
  assert.strictEqual(result.added.length, 0);
});

test('VersionComparison - compareRooms() détecte pièces ajoutées', () => {
  const rooms1 = [];
  const rooms2 = [
    { id: 'r1', name: 'Séjour', area: 30 }
  ];

  const result = VersionComparison.compareRooms(rooms1, rooms2);

  assert.strictEqual(result.added.length, 1);
});

test('VersionComparison - compareRooms() détecte pièces supprimées', () => {
  const rooms1 = [
    { id: 'r1', name: 'Séjour', area: 30 }
  ];
  const rooms2 = [];

  const result = VersionComparison.compareRooms(rooms1, rooms2);

  assert.strictEqual(result.removed.length, 1);
});

test('VersionComparison - compareRooms() détecte pièces modifiées', () => {
  const rooms1 = [
    { id: 'r1', name: 'Séjour', area: 30 }
  ];
  const rooms2 = [
    { id: 'r1', name: 'Séjour', area: 35 }
  ];

  const result = VersionComparison.compareRooms(rooms1, rooms2);

  assert.strictEqual(result.modified.length, 1);
  const areaChange = result.modified[0].changes.find(c => c.property === 'area');
  assert.strictEqual(areaChange.delta, 5);
});

test('VersionComparison - roomsMatch() vérifie par nom', () => {
  const r1 = { name: 'Séjour', area: 30 };
  const r2 = { name: 'Séjour', area: 35 };

  assert.strictEqual(VersionComparison.roomsMatch(r1, r2, 0.1), true);
});

test('VersionComparison - roomsMatch() vérifie par bounds', () => {
  const r1 = { bounds: { xMin: 0, xMax: 5, zMin: 0, zMax: 6 } };
  const r2 = { bounds: { xMin: 0, xMax: 5, zMin: 0, zMax: 6 } };

  assert.strictEqual(VersionComparison.roomsMatch(r1, r2, 0.1), true);
});

// =========================================================================
// CALCUL IMPACTS
// =========================================================================

test('VersionComparison - computeImpacts() calcule deltas', () => {
  const wallComparison = {
    added: [{ from: [0, 0], to: [5, 0], thick: 0.25, type: 'ext' }],
    removed: [],
    modified: [],
    unchanged: []
  };

  const roomComparison = {
    added: [{ id: 'r1', area: 10 }],
    removed: [{ id: 'r2', area: 5 }],
    modified: [],
    unchanged: []
  };

  const impacts = VersionComparison.computeImpacts(wallComparison, roomComparison);

  assert.strictEqual(impacts.surfaceDelta, 5); // 10 - 5
  assert.strictEqual(impacts.wallLengthDelta, 5);
  assert.strictEqual(impacts.roomCountDelta, 0); // 1 - 1 = 0
});

// =========================================================================
// COMPARAISON COMPLÈTE
// =========================================================================

test('VersionComparison - compareVersions() comparaison complète', () => {
  const result = VersionComparison.compareVersions(project1, project2);

  assert.ok(result.walls);
  assert.ok(result.rooms);
  assert.ok(result.impacts);
  assert.ok(result.summary);

  // Le mur intérieur [5,0]→[5,8] est déplacé à [6,0]→[6,8]
  // Comme les positions ne correspondent pas, il est compté comme removed + added
  assert.ok(result.summary.wallsRemoved >= 1);
  assert.ok(result.summary.wallsAdded >= 1);
  
  // Les pièces sont modifiées (surface et bounds changés)
  assert.ok(result.summary.roomsModified >= 1);
});

test('VersionComparison - compareVersions() projets identiques', () => {
  const result = VersionComparison.compareVersions(project1, project1);

  assert.strictEqual(result.summary.wallsAdded, 0);
  assert.strictEqual(result.summary.wallsRemoved, 0);
  assert.strictEqual(result.summary.roomsAdded, 0);
  assert.strictEqual(result.summary.roomsRemoved, 0);
});

test('VersionComparison - compareVersions() avec tolérance', () => {
  const p1 = {
    walls: [{ from: [0, 0], to: [10, 0] }],
    rooms: []
  };
  const p2 = {
    walls: [{ from: [0.05, 0.05], to: [10, 0] }], // Légèrement décalé
    rooms: []
  };

  const result = VersionComparison.compareVersions(p1, p2, { tolerance: 0.1 });

  // Avec tolérance 0.1, devrait considérer comme identique
  assert.strictEqual(result.summary.wallsModified, 0);
  assert.strictEqual(result.summary.wallsAdded, 0);
});

// =========================================================================
// GÉNÉRATION RAPPORT
// =========================================================================

test('VersionComparison - generateReport() génère rapport lisible', () => {
  const comparison = VersionComparison.compareVersions(project1, project2);
  const report = VersionComparison.generateReport(comparison);

  assert.ok(typeof report === 'string');
  assert.ok(report.includes('RAPPORT DE COMPARAISON'));
  assert.ok(report.includes('Murs'));
  assert.ok(report.includes('Pièces'));
  assert.ok(report.includes('Impacts'));
});

test('VersionComparison - generateReport() inclut deltas', () => {
  const comparison = VersionComparison.compareVersions(project1, project2);
  const report = VersionComparison.generateReport(comparison);

  assert.ok(report.includes('Surface totale'));
  assert.ok(report.includes('Longueur murs'));
});
