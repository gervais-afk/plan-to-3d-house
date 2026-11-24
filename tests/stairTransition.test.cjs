/**
 * Tests unitaires pour js/stairTransition.js
 * Transition caméra animée entre étages
 */

const { test } = require('node:test');
const assert = require('node:assert');
const StairTransition = require('../js/stairTransition.js');

// Mock de caméra Three.js
const createMockCamera = () => ({
  position: { x: 0, y: 1.65, z: 0, set: function(x, y, z) { this.x = x; this.y = y; this.z = z; } },
  fov: 60,
  lookAt: function() {},
  updateProjectionMatrix: function() {}
});

// Données de test : projet avec escalier
const createTestProject = () => ({
  stairwells: [
    { xMin: 5, xMax: 6.5, zMin: 8, zMax: 10, level: 1 }
  ],
  walls: [
    { from: [0, 0], to: [10, 0], thick: 0.2, type: 'ext', level: 0 },
    { from: [10, 0], to: [10, 12], thick: 0.2, type: 'ext', level: 0 },
    { from: [10, 12], to: [0, 12], thick: 0.2, type: 'ext', level: 0 },
    { from: [0, 12], to: [0, 0], thick: 0.2, type: 'ext', level: 0 }
  ],
  config: {
    floorHeight: 2.8
  }
});

test('StairTransition - detectStaircase() devrait détecter un escalier dans le projet', () => {
  const project = createTestProject();
  const staircase = StairTransition.detectStaircase(project);
  
  assert.ok(staircase !== null);
  assert.ok(staircase.width > 0);
  assert.ok(staircase.depth > 0);
  assert.ok(staircase.centerX > 0);
  assert.ok(staircase.centerZ > 0);
});

test('StairTransition - detectStaircase() devrait retourner null si pas d\'escalier', () => {
  const project = createTestProject();
  project.stairwells = [];
  
  const staircase = StairTransition.detectStaircase(project);
  
  assert.strictEqual(staircase, null);
});

test('StairTransition - generateBezierPath() devrait générer une trajectoire de Bézier cubique', () => {
  const staircase = {
    centerX: 5.75,
    centerZ: 9,
    width: 1.5,
    depth: 2,
    totalHeight: 2.8,
    numSteps: 16,
    direction: 'z',
    sign: 1
  };
  
  const path = StairTransition.generateBezierPath(staircase);
  
  assert.ok(path.P0 !== undefined);
  assert.ok(path.P1 !== undefined);
  assert.ok(path.P2 !== undefined);
  assert.ok(path.P3 !== undefined);
  assert.strictEqual(path.startPoint, path.P0);
  assert.strictEqual(path.endPoint, path.P3);
});

test('StairTransition - generateBezierPath() devrait calculer les points de contrôle correctement', () => {
  const staircase = {
    centerX: 5.75,
    centerZ: 9,
    width: 1.5,
    depth: 2,
    totalHeight: 2.8,
    numSteps: 16,
    direction: 'z',
    sign: 1
  };
  
  const path = StairTransition.generateBezierPath(staircase);
  
  // P0 : position de départ
  assert.strictEqual(path.P0[1], StairTransition.DEFAULTS.cameraHeight);
  
  // P3 : position d'arrivée
  assert.strictEqual(path.P3[1], StairTransition.DEFAULTS.cameraHeight + staircase.totalHeight);
});

test('StairTransition - interpolatePosition() devrait calculer une position le long de la trajectoire', () => {
  const path = {
    P0: [0, 1.65, 0],
    P1: [0, 2.5, 0],
    P2: [0, 3.5, 0],
    P3: [0, 4.45, 0]
  };
  
  const posStart = StairTransition.interpolatePosition(path, 0);
  const posEnd = StairTransition.interpolatePosition(path, 1);
  const posMid = StairTransition.interpolatePosition(path, 0.5);
  
  assert.strictEqual(posStart[1], 1.65);
  assert.strictEqual(posEnd[1], 4.45);
  assert.ok(posMid[1] > 1.65 && posMid[1] < 4.45);
});

test('StairTransition - interpolatePosition() devrait interpoler progressivement la hauteur', () => {
  const path = {
    P0: [0, 1.65, 0],
    P1: [0, 2.5, 0],
    P2: [0, 3.5, 0],
    P3: [0, 4.45, 0]
  };
  
  let prevY = 0;
  for (let t = 0; t <= 1; t += 0.1) {
    const pos = StairTransition.interpolatePosition(path, t);
    assert.ok(pos[1] >= prevY, `La hauteur devrait augmenter progressivement à t=${t}`);
    prevY = pos[1];
  }
});

test('StairTransition - interpolateLookAt() devrait calculer un point de regard', () => {
  const path = {
    P0: [0, 1.65, 0],
    P1: [0, 2.5, 0],
    P2: [0, 3.5, 0],
    P3: [0, 4.45, 0]
  };
  
  const staircase = {
    direction: 'z',
    sign: 1
  };
  
  const lookAt = StairTransition.interpolateLookAt(path, 0.5, staircase);
  
  assert.ok(Array.isArray(lookAt));
  assert.strictEqual(lookAt.length, 3);
  assert.ok(lookAt[1] > 1.65, 'Le regard devrait être au-dessus de la position de départ');
});

test('StairTransition - interpolateFOV() devrait ajuster le FOV pour dynamiser la montée', () => {
  const fovStart = StairTransition.interpolateFOV(0);
  const fovEnd = StairTransition.interpolateFOV(1);
  const fovMid = StairTransition.interpolateFOV(0.5);
  
  assert.strictEqual(fovStart, StairTransition.DEFAULTS.fovStart);
  assert.strictEqual(fovEnd, StairTransition.DEFAULTS.fovEnd);
  assert.ok(fovMid !== fovStart || fovMid !== fovEnd, 'Le FOV devrait varier le long de la trajectoire');
});

test('StairTransition - checkCollisions() devrait détecter les collisions avec les murs', () => {
  const path = {
    P0: [5, 1.65, 9],
    P1: [5, 2.5, 9],
    P2: [5, 3.5, 9],
    P3: [5, 4.45, 9]
  };
  
  // Mur qui bloque la trajectoire
  const walls = [
    { from: [4.5, 8], to: [4.5, 10], thick: 0.2, type: 'ext' }
  ];
  
  const collision = StairTransition.checkCollisions(path, walls);
  
  assert.ok(collision.collisions, 'Devrait détecter une collision');
  assert.ok(collision.points.length > 0);
});

test('StairTransition - checkCollisions() devrait valider une trajectoire sans collision', () => {
  const path = {
    P0: [5, 1.65, 9],
    P1: [5, 2.5, 9],
    P2: [5, 3.5, 9],
    P3: [5, 4.45, 9]
  };
  
  // Murs éloignés de la trajectoire
  const walls = [
    { from: [0, 0], to: [10, 0], thick: 0.2, type: 'ext' },
    { from: [10, 0], to: [10, 12], thick: 0.2, type: 'ext' }
  ];
  
  const collision = StairTransition.checkCollisions(path, walls);
  
  assert.strictEqual(collision.collisions, false, 'Ne devrait pas détecter de collision');
  assert.strictEqual(collision.points.length, 0);
});

test('StairTransition - checkCollisions() devrait ignorer les murs trop éloignés', () => {
  const path = {
    P0: [5, 1.65, 9],
    P1: [5, 2.5, 9],
    P2: [5, 3.5, 9],
    P3: [5, 4.45, 9]
  };
  
  // Mur très éloigné
  const walls = [
    { from: [20, 20], to: [25, 25], thick: 0.2, type: 'ext' }
  ];
  
  const collision = StairTransition.checkCollisions(path, walls);
  
  assert.strictEqual(collision.collisions, false);
});

test('StairTransition - animateTransition() devrait animer la caméra le long de la trajectoire', async (t) => {
  // Sauté dans Node.js car requestAnimationFrame n'existe pas
  t.skip('requestAnimationFrame non disponible dans Node.js');
});

test('StairTransition - animateTransition() devrait appeler les callbacks de progression', async (t) => {
  // Sauté dans Node.js car requestAnimationFrame n'existe pas
  t.skip('requestAnimationFrame non disponible dans Node.js');
});

test('StairTransition - animateTransition() devrait respecter la durée spécifiée', async (t) => {
  // Sauté dans Node.js car requestAnimationFrame n'existe pas
  t.skip('requestAnimationFrame non disponible dans Node.js');
});

test('StairTransition - transition() devrait effectuer une transition complète entre étages', async (t) => {
  // Sauté dans Node.js car requestAnimationFrame n'existe pas
  t.skip('requestAnimationFrame non disponible dans Node.js');
});

test('StairTransition - transition() devrait gérer l\'absence d\'escalier', async () => {
  const camera = createMockCamera();
  const project = createTestProject();
  project.stairwells = []; // Pas d'escalier
  
  const result = await StairTransition.transition(camera, project, 0, 1);
  
  assert.strictEqual(result.success, false);
  assert.ok(result.error !== undefined);
});

test('StairTransition - transition() devrait détecter les collisions avant l\'animation', async () => {
  const camera = createMockCamera();
  const project = createTestProject();
  
  // Ajoute un mur qui bloque l'escalier
  project.walls.push({
    from: [5.5, 8], to: [5.5, 10], thick: 0.2, type: 'ext', level: 0
  });
  
  const result = await StairTransition.transition(camera, project, 0, 1);
  
  // La transition devrait échouer à cause de la collision
  assert.strictEqual(result.success, false);
  assert.ok(result.collisions !== undefined);
});
