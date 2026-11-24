/**
 * TESTS UNITAIRES — bioclimaticAnalysis.js
 * Analyse bioclimatique
 */

const { test } = require('node:test');
const assert = require('node:assert');
const BioclimaticAnalysis = require('../js/bioclimaticAnalysis.js');

// =========================================================================
// MOCK DATA
// =========================================================================

const mockProject = {
  rooms: [
    { id: 'sejour', name: 'Séjour', type: 'sejour', area: 30, bounds: { xMin: 0, xMax: 6, zMin: 0, zMax: 5 } },
    { id: 'chambre', name: 'Chambre', type: 'chambre', area: 12, bounds: { xMin: 6, xMax: 10, zMin: 0, zMax: 3 } }
  ],
  walls: [
    { from: [0, 0], to: [10, 0], thick: 0.25, openings: [{ type: 'window', w: 2 }] },
    { from: [10, 0], to: [10, 8], thick: 0.25, openings: [] },
    { from: [10, 8], to: [0, 8], thick: 0.25, openings: [{ type: 'window', w: 1.5 }] },
    { from: [0, 8], to: [0, 0], thick: 0.25, openings: [] },
    { from: [6, 0], to: [6, 3], thick: 0.15, openings: [] }
  ]
};

// =========================================================================
// ORIENTATION
// =========================================================================

test('BioclimaticAnalysis - computeBuildingOrientation() calcule orientation', () => {
  const result = BioclimaticAnalysis.computeBuildingOrientation(mockProject);
  
  assert.ok(result.orientation);
  assert.ok(typeof result.angle === 'number');
  assert.ok(result.confidence > 0);
});

test('BioclimaticAnalysis - computeWallAngle() calcule angle mur', () => {
  const wall = { from: [0, 0], to: [10, 0] };
  const angle = BioclimaticAnalysis.computeWallAngle(wall);
  
  assert.strictEqual(angle, 0); // Mur horizontal vers la droite
});

test('BioclimaticAnalysis - angleToOrientation() convertit angle en orientation', () => {
  const orient = BioclimaticAnalysis.angleToOrientation(0);
  assert.strictEqual(orient.label, 'Nord');
  
  const orient2 = BioclimaticAnalysis.angleToOrientation(180);
  assert.strictEqual(orient2.label, 'Sud');
});

// =========================================================================
// ANALYSE SOLAIRE
// =========================================================================

test('BioclimaticAnalysis - analyzeSolarExposure() analyse pièces', () => {
  const result = BioclimaticAnalysis.analyzeSolarExposure(mockProject);
  
  assert.ok(Array.isArray(result));
  assert.ok(result.length > 0);
  
  const firstRoom = result[0];
  assert.ok(firstRoom.room);
  assert.ok(firstRoom.orientation);
  assert.ok(typeof firstRoom.solarGain === 'number');
  assert.ok(typeof firstRoom.estimatedSunHours === 'number');
  assert.ok(Array.isArray(firstRoom.recommendation));
});

test('BioclimaticAnalysis - computeRoomSolarExposure() calcule exposition', () => {
  const room = mockProject.rooms[0];
  const exposure = BioclimaticAnalysis.computeRoomSolarExposure(room, mockProject.walls);
  
  assert.ok(exposure.orientation);
  assert.ok(typeof exposure.solarGain === 'number');
  assert.ok(typeof exposure.sunHours === 'number');
});

// =========================================================================
// ANALYSE VENTILATION
// =========================================================================

test('BioclimaticAnalysis - analyzeNaturalVentilation() analyse ventilation', () => {
  const result = BioclimaticAnalysis.analyzeNaturalVentilation(mockProject);
  
  assert.ok(typeof result.crossVentilationCount === 'number');
  assert.ok(typeof result.singleVentilationCount === 'number');
  assert.ok(typeof result.crossVentilationRatio === 'number');
  assert.ok(result.recommendation);
});

// =========================================================================
// ANALYSE INERTIE
// =========================================================================

test('BioclimaticAnalysis - analyzeThermalInertia() analyse inertie', () => {
  const result = BioclimaticAnalysis.analyzeThermalInertia(mockProject);
  
  assert.ok(typeof result.totalMass === 'number');
  assert.ok(typeof result.totalArea === 'number');
  assert.ok(typeof result.massPerArea === 'number');
  assert.ok(['LOURDE', 'MOYENNE', 'LÉGÈRE'].includes(result.inertiaClass));
  assert.ok(result.recommendation);
});

// =========================================================================
// ANALYSE COMPLÈTE
// =========================================================================

test('BioclimaticAnalysis - analyzeBioclimatic() analyse complète', () => {
  const result = BioclimaticAnalysis.analyzeBioclimatic(mockProject);
  
  assert.ok(result.orientation);
  assert.ok(Array.isArray(result.solarExposure));
  assert.ok(result.ventilation);
  assert.ok(result.inertia);
  assert.ok(result.scores);
  assert.ok(typeof result.globalScore === 'number');
  assert.ok(result.summary);
});

test('BioclimaticAnalysis - analyzeBioclimatic() score global cohérent', () => {
  const result = BioclimaticAnalysis.analyzeBioclimatic(mockProject);
  
  assert.ok(result.globalScore >= 0);
  assert.ok(result.globalScore <= 100);
});

// =========================================================================
// CONSTANTES
// =========================================================================

test('BioclimaticAnalysis - ORIENTATIONS définit 8 directions', () => {
  assert.strictEqual(Object.keys(BioclimaticAnalysis.ORIENTATIONS).length, 8);
  
  for (const [key, orient] of Object.entries(BioclimaticAnalysis.ORIENTATIONS)) {
    assert.ok(orient.label);
    assert.ok(typeof orient.angle === 'number');
    assert.ok(typeof orient.solarGain === 'number');
  }
});

test('BioclimaticAnalysis - ROOM_PREFERENCES définit préférences par pièce', () => {
  assert.ok(BioclimaticAnalysis.ROOM_PREFERENCES.sejour);
  assert.ok(BioclimaticAnalysis.ROOM_PREFERENCES.chambre);
  
  for (const [type, pref] of Object.entries(BioclimaticAnalysis.ROOM_PREFERENCES)) {
    assert.ok(pref.preferredOrientation);
    assert.ok(typeof pref.minSunHours === 'number');
  }
});
