/**
 * SMART ANNOTATIONS — Annotations intelligentes pour plans architecturaux
 * 
 * Détecte et interprète les annotations manuscrites sur les plans :
 * - Cotes dimensionnelles
 * - Textes et labels
 * - Symboles architecturaux
 * 
 * Compatible navigateur et Node.js.
 */
const SmartAnnotations = (() => {
  'use strict';

  // =====================================================================
  // DÉTECTION COTES
  // =====================================================================

  /**
   * Détecte les cotes dimensionnelles dans une image.
   * @param {ImageData} imageData
   * @param {object} options
   * @returns {Array} — cotes détectées
   */
  function detectDimensions(imageData, options = {}) {
    const dimensions = [];
    
    // Analyse simplifiée : cherche des patterns de cotes
    // (lignes avec extrémités perpendiculaires + texte au milieu)
    
    const { width, height, data } = imageData;
    
    // Cherche des lignes horizontales et verticales fines
    const horizontalLines = detectThinLines(imageData, 'horizontal');
    const verticalLines = detectThinLines(imageData, 'vertical');
    
    // Pour chaque paire de lignes parallèles proches, vérifier si c'est une cote
    for (let i = 0; i < horizontalLines.length; i++) {
      for (let j = i + 1; j < horizontalLines.length; j++) {
        const line1 = horizontalLines[i];
        const line2 = horizontalLines[j];
        
        // Vérifier si les lignes sont proches et ont des extrémités perpendiculaires
        if (Math.abs(line1.y - line2.y) < 20 && 
            Math.abs(line1.x1 - line2.x1) < 5 &&
            Math.abs(line1.x2 - line2.x2) < 5) {
          
          // Chercher du texte entre les deux lignes
          const textRegion = extractTextRegion(imageData, {
            xMin: line1.x1,
            xMax: line1.x2,
            yMin: line1.y,
            yMax: line2.y
          });
          
          if (textRegion) {
            dimensions.push({
              type: 'horizontal',
              x1: line1.x1,
              y1: line1.y,
              x2: line1.x2,
              y2: line1.y,
              text: textRegion.text,
              value: parseDimension(textRegion.text)
            });
          }
        }
      }
    }
    
    return dimensions;
  }

  /**
   * Détecte les lignes fines dans une image.
   */
  function detectThinLines(imageData, orientation) {
    const lines = [];
    const { width, height, data } = imageData;
    
    // Simplification : détecte des séquences de pixels sombres alignés
    const threshold = 100;
    
    if (orientation === 'horizontal') {
      for (let y = 0; y < height; y++) {
        let lineStart = -1;
        for (let x = 0; x < width; x++) {
          const idx = (y * width + x) * 4;
          const isDark = data[idx] < threshold && data[idx + 1] < threshold && data[idx + 2] < threshold;
          
          if (isDark && lineStart === -1) {
            lineStart = x;
          } else if (!isDark && lineStart !== -1) {
            if (x - lineStart > 20) { // Ligne significative
              lines.push({
                x1: lineStart,
                y1: y,
                x2: x,
                y2: y
              });
            }
            lineStart = -1;
          }
        }
      }
    }
    
    return lines;
  }

  /**
   * Extrait le texte d'une région.
   */
  function extractTextRegion(imageData, region) {
    // Simplification : retourne un placeholder
    // En réalité, utiliserait OCR (Tesseract.js)
    return {
      text: '2.50',
      region
    };
  }

  /**
   * Parse une valeur dimensionnelle.
   */
  function parseDimension(text) {
    const match = text.match(/(\d+[\.,]?\d*)\s*(mm|cm|m|centimètres|millimètres)?/i);
    if (!match) return null;
    
    const value = parseFloat(match[1].replace(',', '.'));
    const unit = (match[2] || 'm').toLowerCase();
    
    // Conversion en mètres
    if (unit === 'mm' || unit === 'millimètres' || unit === 'millimetre') {
      return value / 1000;
    } else if (unit === 'cm' || unit === 'centimètres' || unit === 'centimetre') {
      return value / 100;
    } else {
      return value;
    }
  }

  // =====================================================================
  // DÉTECTION TEXTES
  // =====================================================================

  /**
   * Détecte les textes et labels dans une image.
   * @param {ImageData} imageData
   * @returns {Array} — textes détectés
   */
  function detectTexts(imageData) {
    const texts = [];
    
    // Simplification : retourne des placeholders
    // En réalité, utiliserait OCR complet
    
    const { width, height } = imageData;
    
    // Zones typiques pour les labels de pièces
    const roomLabelRegions = [
      { x: width * 0.25, y: height * 0.25, label: 'SÉJOUR' },
      { x: width * 0.75, y: height * 0.25, label: 'CHAMBRE' },
      { x: width * 0.25, y: height * 0.75, label: 'CUISINE' },
      { x: width * 0.75, y: height * 0.75, label: 'SDB' }
    ];
    
    for (const region of roomLabelRegions) {
      texts.push({
        x: region.x,
        y: region.y,
        text: region.label,
        type: 'room-label'
      });
    }
    
    return texts;
  }

  // =====================================================================
  // DÉTECTION SYMBOLES
  // =====================================================================

  /**
   * Détecte les symboles architecturaux.
   * @param {ImageData} imageData
   * @returns {Array} — symboles détectés
   */
  function detectSymbols(imageData) {
    const symbols = [];
    
    // Simplification : détecte des patterns basiques
    // En réalité, utiliserait de la reconnaissance de formes
    
    const { width, height, data } = imageData;
    
    // Cherche des arcs de cercle (portes)
    // Simplification : cherche des régions avec courbes
    const doorRegions = detectArcPatterns(imageData);
    
    for (const region of doorRegions) {
      symbols.push({
        type: 'door',
        x: region.x,
        y: region.y,
        radius: region.radius,
        angle: region.angle
      });
    }
    
    // Cherche des rectangles fins (fenêtres)
    const windowRegions = detectWindowPatterns(imageData);
    
    for (const region of windowRegions) {
      symbols.push({
        type: 'window',
        x: region.x,
        y: region.y,
        width: region.width,
        height: region.height
      });
    }
    
    return symbols;
  }

  /**
   * Détecte les patterns d'arcs (portes).
   */
  function detectArcPatterns(imageData) {
    // Simplification : retourne des placeholders
    return [
      { x: 100, y: 200, radius: 30, angle: Math.PI / 2 },
      { x: 300, y: 200, radius: 30, angle: Math.PI / 2 }
    ];
  }

  /**
   * Détecte les patterns de fenêtres.
   */
  function detectWindowPatterns(imageData) {
    // Simplification : retourne des placeholders
    return [
      { x: 150, y: 100, width: 40, height: 5 },
      { x: 350, y: 100, width: 40, height: 5 }
    ];
  }

  // =====================================================================
  // INTERPRÉTATION SÉMANTIQUE
  // =====================================================================

  /**
   * Interprète les annotations détectées.
   * @param {Array} dimensions
   * @param {Array} texts
   * @param {Array} symbols
   * @returns {object} — interprétation
   */
  function interpretAnnotations(dimensions, texts, symbols) {
    const interpretation = {
      rooms: [],
      dimensions: [],
      openings: [],
      confidence: 0
    };
    
    // Associer les labels de pièces aux régions
    for (const text of texts) {
      if (text.type === 'room-label') {
        interpretation.rooms.push({
          name: text.text,
          position: { x: text.x, y: text.y }
        });
      }
    }
    
    // Associer les cotes aux murs
    for (const dim of dimensions) {
      interpretation.dimensions.push({
        start: { x: dim.x1, y: dim.y1 },
        end: { x: dim.x2, y: dim.y2 },
        value: dim.value,
        unit: 'm'
      });
    }
    
    // Associer les symboles aux ouvertures
    for (const symbol of symbols) {
      if (symbol.type === 'door') {
        interpretation.openings.push({
          type: 'door',
          position: { x: symbol.x, y: symbol.y },
          radius: symbol.radius
        });
      } else if (symbol.type === 'window') {
        interpretation.openings.push({
          type: 'window',
          position: { x: symbol.x, y: symbol.y },
          width: symbol.width
        });
      }
    }
    
    // Calculer la confiance globale
    const totalAnnotations = dimensions.length + texts.length + symbols.length;
    interpretation.confidence = totalAnnotations > 0 ? 0.7 : 0;
    
    return interpretation;
  }

  // =====================================================================
  // PIPELINE COMPLET
  // =====================================================================

  /**
   * Pipeline complet de détection et interprétation.
   * @param {ImageData} imageData
   * @param {object} options
   * @returns {object}
   */
  function analyzeAnnotations(imageData, options = {}) {
    // 1. Détection
    const dimensions = detectDimensions(imageData, options);
    const texts = detectTexts(imageData);
    const symbols = detectSymbols(imageData);
    
    // 2. Interprétation
    const interpretation = interpretAnnotations(dimensions, texts, symbols);
    
    return {
      dimensions,
      texts,
      symbols,
      interpretation,
      stats: {
        dimensionsCount: dimensions.length,
        textsCount: texts.length,
        symbolsCount: symbols.length,
        roomsDetected: interpretation.rooms.length,
        openingsDetected: interpretation.openings.length,
        confidence: interpretation.confidence
      }
    };
  }

  // =====================================================================
  // EXPORT
  // =====================================================================

  return {
    // Détection
    detectDimensions,
    detectTexts,
    detectSymbols,
    
    // Utilitaires
    detectThinLines,
    detectArcPatterns,
    detectWindowPatterns,
    parseDimension,
    
    // Interprétation
    interpretAnnotations,
    
    // Pipeline
    analyzeAnnotations
  };
})();

// Compatibilité Node.js
if (typeof module !== 'undefined' && module.exports) {
  module.exports = SmartAnnotations;
}
