/**
 * TESTS UNITAIRES — sketchRecognition.js
 */

const { test } = require('node:test');
const assert = require('node:assert');
const SketchRecognition = require('../js/sketchRecognition.js');

// =========================================================================
// HELPERS — Création d'ImageData mock
// =========================================================================

/**
 * Crée un ImageData mock (format RGBA plat).
 */
function createMockImageData(width, height, fillFn = () => [255, 255, 255, 255]) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [r, g, b, a] = fillFn(x, y);
      const i = (y * width + x) * 4;
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = a;
    }
  }
  return { data, width, height };
}

/**
 * Crée un ImageData avec un rectangle noir au centre (simule un croquis).
 */
function createSketchImage(width = 100, height = 100) {
  return createMockImageData(width, height, (x, y) => {
    // Rectangle noir au centre (simule des murs)
    const inRect = x > 20 && x < 80 && y > 20 && y < 80;
    // Contour du rectangle (simule murs)
    const onBorder = inRect && (x === 21 || x === 79 || y === 21 || y === 79);
    return onBorder ? [0, 0, 0, 255] : [255, 255, 255, 255];
  });
}

// =========================================================================
// TESTS : PRÉTRAITEMENT IMAGE
// =========================================================================

test('SketchRecognition - toGrayscale() convertit en niveaux de gris', () => {
  const img = createMockImageData(2, 2, (x) => {
    if (x === 0) return [255, 0, 0, 255]; // Rouge → ~76
    return [0, 255, 0, 255]; // Vert → ~150
  });
  
  const gray = SketchRecognition.toGrayscale(img);
  
  assert.strictEqual(gray.length, 4);
  assert.ok(gray[0] > 70 && gray[0] < 80); // Rouge
  assert.ok(gray[1] > 140 && gray[1] < 160); // Vert
});

test('SketchRecognition - toGrayscale() rejette imageData invalide', () => {
  assert.throws(() => SketchRecognition.toGrayscale(null));
  assert.throws(() => SketchRecognition.toGrayscale({}));
});

test('SketchRecognition - medianFilter() réduit le bruit', () => {
  const gray = new Float32Array([100, 100, 100, 100, 200, 100, 100, 100, 100]);
  const filtered = SketchRecognition.medianFilter(gray, 3, 3);
  
  // Le pixel central (200) devrait être réduit vers la médiane
  assert.ok(filtered[4] < 200);
});

test('SketchRecognition - otsuThreshold() calcule un seuil valide', () => {
  // Image bimodale : 2 pics bien séparés
  const gray = new Float32Array(100);
  for (let i = 0; i < 50; i++) gray[i] = 30;
  for (let i = 50; i < 100; i++) gray[i] = 220;
  
  const threshold = SketchRecognition.otsuThreshold(gray);
  
  // Le seuil devrait être entre les deux pics
  assert.ok(threshold > 30 && threshold < 220, `Seuil ${threshold} devrait être entre 30 et 220`);
});

test('SketchRecognition - binarize() avec seuil Otsu automatique', () => {
  const gray = new Float32Array(100);
  for (let i = 0; i < 50; i++) gray[i] = 30;
  for (let i = 50; i < 100; i++) gray[i] = 220;
  
  const binary = SketchRecognition.binarize(gray);
  
  assert.strictEqual(binary.length, 100);
  // Les pixels sombres (30) devraient être 0, les clairs (220) 255
  assert.strictEqual(binary[0], 0);
  assert.strictEqual(binary[99], 255);
});

test('SketchRecognition - binarize() avec seuil manuel', () => {
  const gray = new Float32Array([50, 100, 150, 200]);
  const binary = SketchRecognition.binarize(gray, 120);
  
  assert.strictEqual(binary[0], 0);   // 50 < 120
  assert.strictEqual(binary[1], 0);   // 100 < 120
  assert.strictEqual(binary[2], 255); // 150 > 120
  assert.strictEqual(binary[3], 255); // 200 > 120
});

test('SketchRecognition - sobelEdges() détecte les contours', () => {
  // Image avec transition noir → blanc
  const binary = new Uint8Array(9);
  binary[0] = 0; binary[1] = 0; binary[2] = 0;
  binary[3] = 0; binary[4] = 0; binary[5] = 255;
  binary[6] = 255; binary[7] = 255; binary[8] = 255;
  
  const edges = SketchRecognition.sobelEdges(binary, 3, 3);
  
  // Les contours devraient être forts près de la transition
  assert.ok(edges.length === 9);
  assert.ok(edges[4] > 0 || edges[5] > 0, 'Des contours devraient être détectés');
});

// =========================================================================
// TESTS : DÉTECTION DE LIGNES
// =========================================================================

test('SketchRecognition - detectLineSegments() retourne un tableau', () => {
  const edges = new Float32Array(100 * 100);
  // Créer une ligne horizontale forte
  for (let x = 10; x < 90; x++) {
    edges[50 * 100 + x] = 200;
  }
  
  const segments = SketchRecognition.detectLineSegments(edges, 100, 100);
  
  assert.ok(Array.isArray(segments));
  // Chaque segment a la bonne forme
  if (segments.length > 0) {
    const s = segments[0];
    assert.ok('x1' in s && 'y1' in s && 'x2' in s && 'y2' in s);
    assert.ok('angle' in s && 'length' in s);
  }
});

test('SketchRecognition - detectLineSegments() filtre les segments trop courts', () => {
  const edges = new Float32Array(50 * 50);
  // Petit segment
  for (let x = 10; x < 15; x++) {
    edges[25 * 50 + x] = 200;
  }
  
  const segments = SketchRecognition.detectLineSegments(edges, 50, 50, { minSegmentPx: 20 });
  
  // Aucun segment ne devrait passer le filtre
  assert.ok(segments.every(s => s.length >= 20));
});

test('SketchRecognition - straightenSegments() redresse les murs quasi-horizontaux', () => {
  const segments = [
    { x1: 0, y1: 10, x2: 100, y2: 12, angle: 1, length: 100, votes: 50 }
  ];
  
  const straightened = SketchRecognition.straightenSegments(segments, 5);
  
  // Les y devraient être identiques (redressé)
  assert.strictEqual(straightened[0].y1, straightened[0].y2);
  assert.strictEqual(straightened[0].straightened, true);
});

test('SketchRecognition - straightenSegments() redresse les murs quasi-verticaux', () => {
  const segments = [
    { x1: 50, y1: 0, x2: 52, y2: 100, angle: 89, length: 100, votes: 50 }
  ];
  
  const straightened = SketchRecognition.straightenSegments(segments, 5);
  
  // Les x devraient être identiques (redressé)
  assert.strictEqual(straightened[0].x1, straightened[0].x2);
});

test('SketchRecognition - straightenSegments() conserve les segments obliques', () => {
  const segments = [
    { x1: 0, y1: 0, x2: 100, y2: 100, angle: 45, length: 141, votes: 50 }
  ];
  
  const straightened = SketchRecognition.straightenSegments(segments, 5);
  
  // Ne devrait pas être redressé (45° trop loin des axes)
  assert.strictEqual(straightened[0].x1, 0);
  assert.strictEqual(straightened[0].y1, 0);
});

// =========================================================================
// TESTS : CALIBRATION
// =========================================================================

test('SketchRecognition - calibrateFromKnown() calcule px/m', () => {
  const segments = [{ length: 100 }];
  const ppm = SketchRecognition.calibrateFromKnown(segments, 5);
  
  assert.strictEqual(ppm, 20); // 100px / 5m = 20 px/m
});

test('SketchRecognition - calibrateFromKnown() avec longueur pixels explicite', () => {
  const segments = [];
  const ppm = SketchRecognition.calibrateFromKnown(segments, 10, 200);
  
  assert.strictEqual(ppm, 20); // 200px / 10m = 20 px/m
});

test('SketchRecognition - calibrateFromKnown() rejette paramètres invalides', () => {
  assert.throws(() => SketchRecognition.calibrateFromKnown([], 0, 100));
  assert.throws(() => SketchRecognition.calibrateFromKnown([], -1, 100));
});

test('SketchRecognition - estimateScaleFromDoors() retourne null sans segments', () => {
  const ppm = SketchRecognition.estimateScaleFromDoors([]);
  assert.strictEqual(ppm, null);
});

test('SketchRecognition - estimateScaleFromDoors() estime depuis portes verticales', () => {
  // Simuler des portes verticales de longueur 80px (pour 2.1m)
  const segments = [
    { angle: 90, length: 80 },
    { angle: 91, length: 82 },
    { angle: 89, length: 78 },
    { angle: 0, length: 200 }, // Horizontal, ignoré
  ];
  
  const ppm = SketchRecognition.estimateScaleFromDoors(segments);
  
  assert.ok(ppm !== null);
  assert.ok(ppm > 0);
});

// =========================================================================
// TESTS : CONVERSION VERS PROJET
// =========================================================================

test('SketchRecognition - segmentsToWalls() convertit en mètres', () => {
  const segments = [
    { x1: 0, y1: 0, x2: 200, y2: 0, angle: 0, length: 200 }
  ];
  const walls = SketchRecognition.segmentsToWalls(segments, 20);
  
  assert.strictEqual(walls.length, 1);
  assert.strictEqual(walls[0].from[0], 0);
  assert.strictEqual(walls[0].to[0], 10); // 200px / 20px/m = 10m
  assert.strictEqual(walls[0].length, 10);
});

test('SketchRecognition - segmentsToWalls() filtre les murs trop courts', () => {
  const segments = [
    { x1: 0, y1: 0, x2: 2, y2: 0, angle: 0, length: 2 },  // 0.1m < 0.3m min
    { x1: 0, y1: 0, x2: 100, y2: 0, angle: 0, length: 100 } // 5m > 0.3m
  ];
  const walls = SketchRecognition.segmentsToWalls(segments, 20);
  
  assert.strictEqual(walls.length, 1);
});

test('SketchRecognition - classifyWallsByHeuristic() identifie murs extérieurs', () => {
  const walls = [
    { from: [0, 0], to: [10, 0], length: 10 },    // Bas (z=0) → ext
    { from: [10, 0], to: [10, 8], length: 8 },    // Droite (x=10) → ext
    { from: [5, 3], to: [5, 5], length: 2 }       // Milieu (x=5, z=3-5) → int
  ];
  
  const classified = SketchRecognition.classifyWallsByHeuristic(walls);
  
  assert.strictEqual(classified[0].type, 'ext');
  assert.strictEqual(classified[1].type, 'ext');
  assert.strictEqual(classified[2].type, 'int');
  assert.strictEqual(classified[0].thick, 0.25);
  assert.strictEqual(classified[2].thick, 0.15);
});

test('SketchRecognition - mergeColinearWalls() fusionne murs connectés', () => {
  const walls = [
    { from: [0, 0], to: [5, 0], length: 5 },
    { from: [5, 0], to: [10, 0], length: 5 }
  ];
  
  const merged = SketchRecognition.mergeColinearWalls(walls);
  
  assert.strictEqual(merged.length, 1);
  assert.strictEqual(merged[0].from[0], 0);
  assert.strictEqual(merged[0].to[0], 10);
});

test('SketchRecognition - mergeColinearWalls() conserve murs non-colinéaires', () => {
  const walls = [
    { from: [0, 0], to: [10, 0], length: 10 },
    { from: [0, 0], to: [0, 8], length: 8 }
  ];
  
  const merged = SketchRecognition.mergeColinearWalls(walls);
  
  assert.strictEqual(merged.length, 2);
});

// =========================================================================
// TESTS : PIPELINE COMPLET
// =========================================================================

test('SketchRecognition - recognizeSketch() fonctionne sur image simple', async () => {
  const img = createSketchImage(100, 100);
  
  const result = await SketchRecognition.recognizeSketch(img, {
    pxPerMeter: 20
  });
  
  assert.ok(result);
  assert.strictEqual(result.width, 100);
  assert.strictEqual(result.height, 100);
  assert.ok(typeof result.segmentsDetected === 'number');
  assert.ok(typeof result.confidence === 'number');
  assert.ok(result.confidence >= 0 && result.confidence <= 100);
});

test('SketchRecognition - recognizeSketch() rejette imageData null', async () => {
  await assert.rejects(
    () => SketchRecognition.recognizeSketch(null),
    /imageData requis/
  );
});

test('SketchRecognition - recognizeSketch() retourne calibration "provided" si pxPerMeter fourni', async () => {
  const img = createSketchImage(50, 50);
  
  const result = await SketchRecognition.recognizeSketch(img, {
    pxPerMeter: 10
  });
  
  assert.strictEqual(result.calibrationSource, 'provided');
  assert.strictEqual(result.pxPerMeter, 10);
});

test('SketchRecognition - computeConfidence() retourne 0-100', () => {
  const c1 = SketchRecognition.computeConfidence({
    segmentsCount: 10,
    wallsCount: 10,
    calibrated: true,
    calibrationSource: 'known',
    enriched: true
  });
  assert.ok(c1 >= 0 && c1 <= 100);
  
  const c2 = SketchRecognition.computeConfidence({
    segmentsCount: 0,
    wallsCount: 0,
    calibrated: false,
    calibrationSource: 'none',
    enriched: false
  });
  assert.strictEqual(c2, 0);
});

// =========================================================================
// TESTS : IA (mode dégradé sans fetch)
// =========================================================================

test('SketchRecognition - enrichWithAI() sans useAI retourne "enriched: false"', async () => {
  const result = await SketchRecognition.enrichWithAI({ segments: [], walls: [] });
  
  assert.strictEqual(result.enriched, false);
});

test('SketchRecognition - enrichWithAI() avec useAI=true en Node.js échoue proprement', async () => {
  // En Node.js, fetch peut être disponible, mais pas le serveur
  const result = await SketchRecognition.enrichWithAI(
    { segments: [], walls: [], imageData: null },
    { useAI: true }
  );
  
  // Devrait échouer proprement (pas de serveur)
  assert.strictEqual(result.enriched, false);
  assert.ok(result.reason);
});

// =========================================================================
// TESTS : CONSTANTES
// =========================================================================

test('SketchRecognition - DEFAULTS contient les valeurs par défaut', () => {
  assert.ok(SketchRecognition.DEFAULTS.maxDimension > 0);
  assert.ok(SketchRecognition.DEFAULTS.minWallLength > 0);
  assert.ok(SketchRecognition.DEFAULTS.exteriorWallThick > 0);
  assert.ok(SketchRecognition.DEFAULTS.interiorWallThick > 0);
});
