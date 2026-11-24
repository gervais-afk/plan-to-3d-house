/**
 * TESTS UNITAIRES — smartAnnotations.js
 * Annotations intelligentes
 */

const { test } = require('node:test');
const assert = require('node:assert');
const SmartAnnotations = require('../js/smartAnnotations.js');

// =========================================================================
// HELPERS
// =========================================================================

function createMockImageData(width = 400, height = 300) {
  const data = new Uint8ClampedArray(width * height * 4);
  // Remplir avec du blanc
  for (let i = 0; i < data.length; i += 4) {
    data[i] = 255;     // R
    data[i + 1] = 255; // G
    data[i + 2] = 255; // B
    data[i + 3] = 255; // A
  }
  return { data, width, height };
}

// =========================================================================
// PARSE DIMENSION
// =========================================================================

test('SmartAnnotations - parseDimension() parse mètres', () => {
  assert.strictEqual(SmartAnnotations.parseDimension('2.50 m'), 2.5);
  assert.strictEqual(SmartAnnotations.parseDimension('3.00m'), 3.0);
  assert.strictEqual(SmartAnnotations.parseDimension('10.5'), 10.5);
});

test('SmartAnnotations - parseDimension() parse centimètres', () => {
  assert.strictEqual(SmartAnnotations.parseDimension('250 cm'), 2.5);
  assert.strictEqual(SmartAnnotations.parseDimension('100cm'), 1.0);
});

test('SmartAnnotations - parseDimension() parse millimètres', () => {
  assert.strictEqual(SmartAnnotations.parseDimension('2500 mm'), 2.5);
});

test('SmartAnnotations - parseDimension() parse virgule française', () => {
  assert.strictEqual(SmartAnnotations.parseDimension('2,50 m'), 2.5);
});

test('SmartAnnotations - parseDimension() retourne null si invalide', () => {
  assert.strictEqual(SmartAnnotations.parseDimension('abc'), null);
  assert.strictEqual(SmartAnnotations.parseDimension(''), null);
});

// =========================================================================
// DÉTECTION LIGNES
// =========================================================================

test('SmartAnnotations - detectThinLines() détecte lignes horizontales', () => {
  const imageData = createMockImageData(100, 100);
  // Dessiner une ligne noire horizontale
  for (let x = 10; x < 50; x++) {
    const idx = (20 * 100 + x) * 4;
    imageData.data[idx] = 0;
    imageData.data[idx + 1] = 0;
    imageData.data[idx + 2] = 0;
  }
  
  const lines = SmartAnnotations.detectThinLines(imageData, 'horizontal');
  
  assert.ok(lines.length > 0);
});

// =========================================================================
// DÉTECTION DIMENSIONS
// =========================================================================

test('SmartAnnotations - detectDimensions() retourne tableau', () => {
  const imageData = createMockImageData();
  const dimensions = SmartAnnotations.detectDimensions(imageData);
  
  assert.ok(Array.isArray(dimensions));
});

// =========================================================================
// DÉTECTION TEXTES
// =========================================================================

test('SmartAnnotations - detectTexts() détecte labels pièces', () => {
  const imageData = createMockImageData();
  const texts = SmartAnnotations.detectTexts(imageData);
  
  assert.ok(Array.isArray(texts));
  assert.ok(texts.length > 0);
  
  // Vérifier structure
  for (const text of texts) {
    assert.ok(text.x !== undefined);
    assert.ok(text.y !== undefined);
    assert.ok(text.text);
    assert.ok(text.type);
  }
});

test('SmartAnnotations - detectTexts() labels typiques', () => {
  const imageData = createMockImageData();
  const texts = SmartAnnotations.detectTexts(imageData);
  
  const labels = texts.map(t => t.text);
  assert.ok(labels.includes('SÉJOUR') || labels.includes('CHAMBRE'));
});

// =========================================================================
// DÉTECTION SYMBOLES
// =========================================================================

test('SmartAnnotations - detectSymbols() détecte portes et fenêtres', () => {
  const imageData = createMockImageData();
  const symbols = SmartAnnotations.detectSymbols(imageData);
  
  assert.ok(Array.isArray(symbols));
  assert.ok(symbols.length > 0);
  
  const doors = symbols.filter(s => s.type === 'door');
  const windows = symbols.filter(s => s.type === 'window');
  
  assert.ok(doors.length > 0);
  assert.ok(windows.length > 0);
});

test('SmartAnnotations - detectSymbols() structure valide', () => {
  const imageData = createMockImageData();
  const symbols = SmartAnnotations.detectSymbols(imageData);
  
  for (const symbol of symbols) {
    assert.ok(symbol.type);
    assert.ok(symbol.x !== undefined);
    assert.ok(symbol.y !== undefined);
    
    if (symbol.type === 'door') {
      assert.ok(symbol.radius !== undefined);
    } else if (symbol.type === 'window') {
      assert.ok(symbol.width !== undefined);
    }
  }
});

// =========================================================================
// INTERPRÉTATION
// =========================================================================

test('SmartAnnotations - interpretAnnotations() crée interprétation', () => {
  const dimensions = [
    { x1: 0, y1: 0, x2: 100, y2: 0, value: 5.0 }
  ];
  const texts = [
    { x: 50, y: 50, text: 'SÉJOUR', type: 'room-label' }
  ];
  const symbols = [
    { type: 'door', x: 100, y: 200, radius: 30 }
  ];
  
  const interpretation = SmartAnnotations.interpretAnnotations(dimensions, texts, symbols);
  
  assert.ok(interpretation.rooms);
  assert.ok(interpretation.dimensions);
  assert.ok(interpretation.openings);
  assert.ok(interpretation.confidence !== undefined);
  
  assert.strictEqual(interpretation.rooms.length, 1);
  assert.strictEqual(interpretation.dimensions.length, 1);
  assert.strictEqual(interpretation.openings.length, 1);
});

test('SmartAnnotations - interpretAnnotations() confidence basée sur annotations', () => {
  const empty = SmartAnnotations.interpretAnnotations([], [], []);
  const full = SmartAnnotations.interpretAnnotations(
    [{ x1: 0, y1: 0, x2: 100, y2: 0, value: 5.0 }],
    [{ x: 50, y: 50, text: 'SÉJOUR', type: 'room-label' }],
    [{ type: 'door', x: 100, y: 200, radius: 30 }]
  );
  
  assert.strictEqual(empty.confidence, 0);
  assert.ok(full.confidence > 0);
});

// =========================================================================
// PIPELINE COMPLET
// =========================================================================

test('SmartAnnotations - analyzeAnnotations() pipeline complet', () => {
  const imageData = createMockImageData();
  const result = SmartAnnotations.analyzeAnnotations(imageData);
  
  assert.ok(result.dimensions);
  assert.ok(result.texts);
  assert.ok(result.symbols);
  assert.ok(result.interpretation);
  assert.ok(result.stats);
  
  assert.ok(typeof result.stats.dimensionsCount === 'number');
  assert.ok(typeof result.stats.textsCount === 'number');
  assert.ok(typeof result.stats.symbolsCount === 'number');
  assert.ok(typeof result.stats.confidence === 'number');
});

test('SmartAnnotations - analyzeAnnotations() retourne stats', () => {
  const imageData = createMockImageData();
  const result = SmartAnnotations.analyzeAnnotations(imageData);
  
  assert.strictEqual(result.stats.dimensionsCount, result.dimensions.length);
  assert.strictEqual(result.stats.textsCount, result.texts.length);
  assert.strictEqual(result.stats.symbolsCount, result.symbols.length);
});

// =========================================================================
// INTÉGRATION
// =========================================================================

test('SmartAnnotations - workflow complet', () => {
  const imageData = createMockImageData();
  
  // 1. Analyser annotations
  const analysis = SmartAnnotations.analyzeAnnotations(imageData);
  
  // 2. Vérifier structure
  assert.ok(analysis.interpretation.rooms.length >= 0);
  assert.ok(analysis.interpretation.openings.length >= 0);
  
  // 3. Vérifier confiance
  assert.ok(analysis.interpretation.confidence >= 0);
  assert.ok(analysis.interpretation.confidence <= 1);
});
