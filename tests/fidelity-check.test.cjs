/**
 * Tests unitaires pour FidelityCheck (AXE 2 — Sublimation IA fidèle)
 * 
 * Note : Les tests complets nécessitent un environnement navigateur (HTMLCanvasElement).
 * Ici, nous testons les fonctions utilitaires qui fonctionnent dans Node.js.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const FidelityCheck = require('../js/fidelityCheck.js');

// ============================================================================
// Tests des fonctions utilitaires (fonctionnent dans Node.js)
// ============================================================================

test('toGrayscale : conversion RGB → niveaux de gris', () => {
  // Simule une petite image 2x2 en RGBA
  const mockImageData = {
    data: new Uint8ClampedArray([
      255, 0, 0, 255,    // Rouge
      0, 255, 0, 255,    // Vert
      0, 0, 255, 255,    // Bleu
      128, 128, 128, 255 // Gris
    ]),
    width: 2,
    height: 2
  };
  
  const gray = FidelityCheck.toGrayscale(mockImageData);
  
  assert.equal(gray.length, 4);
  // Rouge → ~76 (0.299 * 255)
  assert.ok(Math.abs(gray[0] - 76.245) < 0.1);
  // Vert → ~150 (0.587 * 255)
  assert.ok(Math.abs(gray[1] - 149.685) < 0.1);
  // Bleu → ~29 (0.114 * 255)
  assert.ok(Math.abs(gray[2] - 29.07) < 0.1);
  // Gris → 128
  assert.ok(Math.abs(gray[3] - 128) < 0.1);
});

test('sobelEdges : détection de contours sur image uniforme (pas de contours)', () => {
  // Image 4x4 uniforme (tous les pixels à 128)
  const gray = new Float32Array(16).fill(128);
  const edges = FidelityCheck.sobelEdges(gray, 4, 4);
  
  assert.equal(edges.length, 16);
  // Pas de contours dans une image uniforme
  // Les bords de l'image ne sont pas calculés (padding), donc on vérifie l'intérieur
  assert.equal(edges[5], 0); // Centre de l'image
  assert.equal(edges[6], 0);
  assert.equal(edges[9], 0);
  assert.equal(edges[10], 0);
});

test('sobelEdges : détection de contours sur image avec ligne verticale', () => {
  // Image 4x4 avec une ligne verticale au milieu (gauche=0, droite=255)
  const gray = new Float32Array([
    0, 0, 255, 255,
    0, 0, 255, 255,
    0, 0, 255, 255,
    0, 0, 255, 255
  ]);
  const edges = FidelityCheck.sobelEdges(gray, 4, 4);
  
  // La ligne de contour devrait être détectée entre les colonnes 1 et 2
  // Les valeurs de gradient devraient être élevées à cette frontière
  assert.ok(edges[5] > 100, `Contour détecté (gradient=${edges[5].toFixed(1)})`);
  assert.ok(edges[6] > 100, `Contour détecté (gradient=${edges[6].toFixed(1)})`);
  assert.ok(edges[9] > 100, `Contour détecté (gradient=${edges[9].toFixed(1)})`);
  assert.ok(edges[10] > 100, `Contour détecté (gradient=${edges[10].toFixed(1)})`);
});

test('structuralSimilarity : images identiques → similarité = 1', () => {
  const edges1 = new Float32Array([100, 200, 150, 180]);
  const edges2 = new Float32Array([100, 200, 150, 180]);
  
  const similarity = FidelityCheck.structuralSimilarity(edges1, edges2, 2, 2);
  
  assert.ok(similarity > 0.99, `Similarité proche de 1 (${similarity.toFixed(3)})`);
  assert.ok(similarity <= 1.0, 'Similarité <= 1');
});

test('structuralSimilarity : images complètement différentes → similarité faible', () => {
  const edges1 = new Float32Array([0, 0, 0, 0]);
  const edges2 = new Float32Array([255, 255, 255, 255]);
  
  const similarity = FidelityCheck.structuralSimilarity(edges1, edges2, 2, 2);
  
  assert.ok(similarity < 0.5, `Similarité faible (${similarity.toFixed(3)})`);
  assert.ok(similarity >= 0, 'Similarité >= 0');
});

test('structuralSimilarity : images partiellement similaires → similarité intermédiaire', () => {
  const edges1 = new Float32Array([100, 150, 200, 180]);
  const edges2 = new Float32Array([120, 140, 190, 170]); // Légèrement différentes
  
  const similarity = FidelityCheck.structuralSimilarity(edges1, edges2, 2, 2);
  
  assert.ok(similarity > 0.7, `Similarité intermédiaire (${similarity.toFixed(3)})`);
  assert.ok(similarity < 1.0, 'Similarité < 1');
});

test('structuralSimilarity : bornes [0, 1]', () => {
  const edges1 = new Float32Array([0, 0, 0, 0]);
  const edges2 = new Float32Array([0, 0, 0, 0]);
  
  const similarity = FidelityCheck.structuralSimilarity(edges1, edges2, 2, 2);
  
  assert.ok(similarity >= 0, 'Similarité >= 0');
  assert.ok(similarity <= 1, 'Similarité <= 1');
});

// ============================================================================
// Tests d'intégration (nécessitent un mock de canvas)
// ============================================================================

test('Module exporté : toutes les fonctions sont disponibles', () => {
  assert.equal(typeof FidelityCheck.checkFidelity, 'function');
  assert.equal(typeof FidelityCheck.toGrayscale, 'function');
  assert.equal(typeof FidelityCheck.sobelEdges, 'function');
  assert.equal(typeof FidelityCheck.structuralSimilarity, 'function');
});

// ============================================================================
// Documentation : tests nécessitant un navigateur
// ============================================================================

test('Documentation : checkFidelity nécessite un environnement navigateur', () => {
  // Ce test documente que checkFidelity nécessite HTMLCanvasElement
  // qui n'est pas disponible dans Node.js standard
  assert.ok(true, 'checkFidelity doit être testé dans un environnement navigateur');
  
  // Exemple de test navigateur (à exécuter dans un navigateur ou avec jsdom) :
  /*
  const canvas1 = document.createElement('canvas');
  canvas1.width = 100;
  canvas1.height = 100;
  const ctx1 = canvas1.getContext('2d');
  ctx1.fillStyle = 'white';
  ctx1.fillRect(0, 0, 100, 100);
  ctx1.fillStyle = 'black';
  ctx1.fillRect(25, 25, 50, 50);
  
  const canvas2 = document.createElement('canvas');
  canvas2.width = 100;
  canvas2.height = 100;
  const ctx2 = canvas2.getContext('2d');
  ctx2.fillStyle = 'white';
  ctx2.fillRect(0, 0, 100, 100);
  ctx2.fillStyle = 'black';
  ctx2.fillRect(26, 26, 50, 50); // Légèrement décalé
  
  const result = await FidelityCheck.checkFidelity(canvas1, canvas2);
  assert.ok(result.score > 80, 'Images similaires → score élevé');
  assert.ok(result.passed, 'Score > 50% → passed');
  */
});
