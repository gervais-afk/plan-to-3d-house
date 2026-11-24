/**
 * VECTORIZATION — Vectorisation intelligente + Export DXF
 * 
 * Convertit les détections de sketchRecognition en vecteurs exportables
 * vers les formats CAD standards (DXF, SVG).
 * 
 * Limites documentées :
 * - Export DXF simplifié (entités basiques : LINE, ARC, POLYLINE)
 * - Ne gère pas les attributs DXF avancés (calques, styles de texte)
 * - IFC/gbXML non supportés (voir bimExport.js)
 * 
 * Compatible navigateur et Node.js.
 */
const Vectorization = (() => {
  'use strict';

  // =====================================================================
  // CONVERSION VERS VECTEURS
  // =====================================================================

  /**
   * Convertit les murs détectés en vecteurs optimisés.
   * @param {Array} walls — murs de sketchRecognition
   * @param {object} options — { simplify, snapToGrid }
   * @returns {Array} — vecteurs optimisés
   */
  function wallsToVectors(walls, options = {}) {
    const opts = {
      simplify: true,
      snapToGrid: 0.05, // 5cm
      ...options
    };

    let vectors = walls.map(wall => ({
      type: 'wall',
      points: [wall.from, wall.to],
      thickness: wall.thick || 0.15,
      layer: wall.type === 'ext' ? 'ARCH-WALL-EXT' : 'ARCH-WALL-INT',
      loadBearing: wall.loadBearing || false,
      metadata: {
        length: Math.hypot(
          wall.to[0] - wall.from[0],
          wall.to[1] - wall.from[1]
        ),
        angle: Math.atan2(
          wall.to[1] - wall.from[1],
          wall.to[0] - wall.from[0]
        )
      }
    }));

    if (opts.simplify) {
      vectors = simplifyVectors(vectors);
    }

    if (opts.snapToGrid > 0) {
      vectors = snapToGrid(vectors, opts.snapToGrid);
    }

    return vectors;
  }

  /**
   * Simplifie les vecteurs (fusion colinéaires, suppression doublons).
   */
  function simplifyVectors(vectors) {
    const simplified = [];
    const used = new Set();

    for (let i = 0; i < vectors.length; i++) {
      if (used.has(i)) continue;

      let current = { ...vectors[i], points: [...vectors[i].points] };
      used.add(i);

      // Chercher vecteurs colinéaires connectés
      let changed = true;
      while (changed) {
        changed = false;
        for (let j = 0; j < vectors.length; j++) {
          if (used.has(j)) continue;
          const other = vectors[j];

          if (areColinear(current, other, 0.01)) {
            // Fusionner
            const allPoints = [...current.points, ...other.points];
            const start = allPoints.reduce((min, p) => 
              p[0] + p[1] < min[0] + min[1] ? p : min, allPoints[0]);
            const end = allPoints.reduce((max, p) => 
              p[0] + p[1] > max[0] + max[1] ? p : max, allPoints[0]);
            
            current.points = [start, end];
            used.add(j);
            changed = true;
          }
        }
      }

      simplified.push(current);
    }

    return simplified;
  }

  /**
   * Vérifie si deux vecteurs sont colinéaires.
   */
  function areColinear(v1, v2, tolerance) {
    const p1 = v1.points[0];
    const p2 = v1.points[1];
    const p3 = v2.points[0];
    const p4 = v2.points[1];

    // Calculer l'aire du quadrilatère (si ~0, colinéaire)
    const area = Math.abs(
      (p2[0] - p1[0]) * (p4[1] - p3[1]) -
      (p2[1] - p1[1]) * (p4[0] - p3[0])
    );

    return area < tolerance;
  }

  /**
   * Snappe les points sur une grille.
   */
  function snapToGrid(vectors, gridSize) {
    return vectors.map(v => ({
      ...v,
      points: v.points.map(p => [
        Math.round(p[0] / gridSize) * gridSize,
        Math.round(p[1] / gridSize) * gridSize
      ])
    }));
  }

  // =====================================================================
  // EXPORT DXF
  // =====================================================================

  /**
   * Exporte les vecteurs au format DXF (AutoCAD).
   * @param {Array} vectors
   * @param {object} options — { units, precision }
   * @returns {string} — contenu DXF
   */
  function exportToDXF(vectors, options = {}) {
    const opts = {
      units: 'meters',
      precision: 4,
      ...options
    };

    const lines = [];
    
    // En-tête DXF
    lines.push('0', 'SECTION');
    lines.push('2', 'HEADER');
    lines.push('9', '$ACADVER');
    lines.push('1', 'AC1015'); // AutoCAD 2000
    lines.push('9', '$INSUNITS');
    lines.push('70', opts.units === 'meters' ? '6' : '1'); // 6 = meters, 1 = inches
    lines.push('0', 'ENDSEC');

    // Table des calques
    lines.push('0', 'SECTION');
    lines.push('2', 'TABLES');
    lines.push('0', 'TABLE');
    lines.push('2', 'LAYER');
    lines.push('70', '3'); // Nombre de calques

    // Calques standards
    const layers = ['ARCH-WALL-EXT', 'ARCH-WALL-INT', 'ARCH-DOOR', 'ARCH-WINDOW'];
    layers.forEach(layer => {
      lines.push('0', 'LAYER');
      lines.push('2', layer);
      lines.push('70', '0');
      lines.push('62', layer.includes('EXT') ? '7' : '8'); // Couleur
      lines.push('6', 'CONTINUOUS');
    });

    lines.push('0', 'ENDTAB');
    lines.push('0', 'ENDSEC');

    // Entités
    lines.push('0', 'SECTION');
    lines.push('2', 'ENTITIES');

    for (const vector of vectors) {
      if (vector.type === 'wall' && vector.points.length === 2) {
        // Ligne (mur)
        const [p1, p2] = vector.points;
        lines.push('0', 'LINE');
        lines.push('8', vector.layer); // Calque
        lines.push('10', p1[0].toFixed(opts.precision));
        lines.push('20', p1[1].toFixed(opts.precision));
        lines.push('30', '0.0');
        lines.push('11', p2[0].toFixed(opts.precision));
        lines.push('21', p2[1].toFixed(opts.precision));
        lines.push('31', '0.0');

        // Épaisseur (optionnel)
        if (vector.thickness) {
          lines.push('39', vector.thickness.toFixed(opts.precision));
        }
      } else if (vector.type === 'opening') {
        // Ouverture (arc ou ligne)
        if (vector.arc) {
          // Arc de porte
          lines.push('0', 'ARC');
          lines.push('8', vector.layer);
          lines.push('10', vector.center[0].toFixed(opts.precision));
          lines.push('20', vector.center[1].toFixed(opts.precision));
          lines.push('30', '0.0');
          lines.push('40', vector.radius.toFixed(opts.precision));
          lines.push('50', vector.startAngle.toFixed(opts.precision));
          lines.push('51', vector.endAngle.toFixed(opts.precision));
        } else if (vector.points && vector.points.length >= 2) {
          // Ligne (fenêtre)
          const [p1, p2] = vector.points;
          lines.push('0', 'LINE');
          lines.push('8', vector.layer);
          lines.push('10', p1[0].toFixed(opts.precision));
          lines.push('20', p1[1].toFixed(opts.precision));
          lines.push('30', '0.0');
          lines.push('11', p2[0].toFixed(opts.precision));
          lines.push('21', p2[1].toFixed(opts.precision));
          lines.push('31', '0.0');
        }
      }
    }

    lines.push('0', 'ENDSEC');
    lines.push('0', 'EOF');

    return lines.join('\n');
  }

  /**
   * Exporte les vecteurs au format SVG.
   * @param {Array} vectors
   * @param {object} options — { viewBox, scale }
   * @returns {string} — contenu SVG
   */
  function exportToSVG(vectors, options = {}) {
    const opts = {
      viewBox: '0 0 100 100',
      scale: 1,
      strokeWidth: 0.1,
      ...options
    };

    const lines = [];
    lines.push('<?xml version="1.0" encoding="UTF-8"?>');
    lines.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${opts.viewBox}">`);
    
    // Styles
    lines.push('<style>');
    lines.push('.wall-ext { stroke: #000; stroke-width: 0.25; fill: none; }');
    lines.push('.wall-int { stroke: #666; stroke-width: 0.15; fill: none; }');
    lines.push('.door { stroke: #000; stroke-width: 0.1; fill: none; }');
    lines.push('.window { stroke: #000; stroke-width: 0.1; fill: none; }');
    lines.push('</style>');

    // Entités
    for (const vector of vectors) {
      if (vector.type === 'wall' && vector.points.length === 2) {
        const [p1, p2] = vector.points;
        const layerClass = vector.layer === 'ARCH-WALL-EXT' ? 'wall-ext' : 'wall-int';
        lines.push(`<line class="${layerClass}" x1="${p1[0]}" y1="${p1[1]}" x2="${p2[0]}" y2="${p2[1]}" />`);
      } else if (vector.type === 'opening') {
        if (vector.arc) {
          // Arc SVG
          const x = vector.center[0] + vector.radius * Math.cos(vector.startAngle);
          const y = vector.center[1] + vector.radius * Math.sin(vector.startAngle);
          const endX = vector.center[0] + vector.radius * Math.cos(vector.endAngle);
          const endY = vector.center[1] + vector.radius * Math.sin(vector.endAngle);
          const largeArc = vector.endAngle - vector.startAngle > Math.PI ? 1 : 0;
          
          lines.push(`<path class="door" d="M ${x} ${y} A ${vector.radius} ${vector.radius} 0 ${largeArc} 1 ${endX} ${endY}" />`);
        } else if (vector.points && vector.points.length >= 2) {
          const [p1, p2] = vector.points;
          lines.push(`<line class="window" x1="${p1[0]}" y1="${p1[1]}" x2="${p2[0]}" y2="${p2[1]}" />`);
        }
      }
    }

    lines.push('</svg>');

    return lines.join('\n');
  }

  // =====================================================================
  // PIPELINE COMPLET
  // =====================================================================

  /**
   * Pipeline complet : sketchRecognition → vecteurs → DXF/SVG.
   * @param {object} sketchResult — résultat de sketchRecognition
   * @param {object} options
   * @returns {object} — { vectors, dxf, svg }
   */
  function vectorize(sketchResult, options = {}) {
    if (!sketchResult || !sketchResult.walls) {
      throw new Error('Résultat sketchRecognition invalide');
    }

    // 1. Conversion murs → vecteurs
    const vectors = wallsToVectors(sketchResult.walls, options);

    // 2. Ajout ouvertures
    const openings = [];
    if (sketchResult.openings) {
      for (const opening of sketchResult.openings) {
        const openingVector = {
          type: 'opening',
          layer: opening.type === 'door' ? 'ARCH-DOOR' : 'ARCH-WINDOW',
          ...opening
        };
        openings.push(openingVector);
        vectors.push(openingVector);
      }
    }

    // 3. Export
    const dxf = exportToDXF(vectors, options);
    const svg = exportToSVG(vectors, options);

    return {
      vectors,
      dxf,
      svg,
      stats: {
        wallCount: vectors.filter(v => v.type === 'wall').length,
        openingCount: openings.length,
        totalLength: vectors
          .filter(v => v.type === 'wall' && v.metadata?.length)
          .reduce((sum, v) => sum + v.metadata.length, 0)
      }
    };
  }

  // =====================================================================
  // EXPORT
  // =====================================================================

  return {
    wallsToVectors,
    simplifyVectors,
    snapToGrid,
    exportToDXF,
    exportToSVG,
    vectorize,
    areColinear
  };
})();

// Compatibilité Node.js
if (typeof module !== 'undefined' && module.exports) {
  module.exports = Vectorization;
}
