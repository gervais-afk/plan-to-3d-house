/**
 * R+1 CHECKER — Contrôles de conformité pour maisons à étages
 * Vérifie la cohérence architecturale entre le RDC et l'étage :
 * - Présence et cohérence des trémies d'escalier
 * - Adéquation des murs porteurs entre niveaux
 * - Éclairage naturel des pièces
 * - Hauteurs sous plafond
 * - Cohérence des surfaces entre niveaux
 * 
 * Retourne un rapport de conformité avec erreurs, warnings et suggestions.
 * Compatible navigateur et Node.js (module.exports).
 */
const RPlus1Checker = (() => {
  'use strict';

  // =====================================================================
  // CONFIGURATION DES CONTRÔLES
  // =====================================================================

  const RULES = {
    stairwell: {
      name: 'Trémie d\'escalier',
      description: 'Vérifie la présence et la cohérence des trémies entre niveaux',
      severity: 'error'
    },
    loadBearingWalls: {
      name: 'Murs porteurs',
      description: 'Vérifie l\'alignement des murs porteurs entre niveaux',
      severity: 'warning'
    },
    naturalLight: {
      name: 'Éclairage naturel',
      description: 'Vérifie que chaque pièce habitable a au moins une fenêtre',
      severity: 'warning'
    },
    ceilingHeight: {
      name: 'Hauteur sous plafond',
      description: 'Vérifie la hauteur minimale sous plafond (2.20m)',
      severity: 'warning'
    },
    surfaceConsistency: {
      name: 'Cohérence des surfaces',
      description: 'Vérifie que la surface de l\'étage est cohérente avec le RDC',
      severity: 'info'
    }
  };

  const THRESHOLDS = {
    minCeilingHeight: 2.20, // m
    maxSurfaceRatio: 1.20, // étage max 120% du RDC
    minSurfaceRatio: 0.30, // étage min 30% du RDC
    wallAlignmentTolerance: 0.15, // m (tolérance d'alignement des murs)
    stairwellSizeTolerance: 0.50 // m (tolérance de taille des trémies)
  };

  // =====================================================================
  // CONTRÔLE 1 : TRÉMIES D'ESCALIER
  // =====================================================================

  /**
   * Vérifie la présence et la cohérence des trémies entre niveaux.
   * 
   * Règles :
   * - Si des escaliers existent au RDC, il doit y avoir une trémie à l'étage
   * - Les dimensions doivent être cohérentes
   * - La position doit être alignée
   * 
   * @param {object} level0 — données du RDC
   * @param {object} level1 — données de l'étage
   * @returns {object} — {valid: boolean, errors: string[], warnings: string[]}
   */
  function checkStairwells(level0, level1) {
    const errors = [];
    const warnings = [];
    
    const stairwells0 = Array.isArray(level0.stairwells) ? level0.stairwells : [];
    const stairwells1 = Array.isArray(level1.stairwells) ? level1.stairwells : [];
    
    // Si pas d'escalier au RDC, pas de vérification nécessaire
    if (stairwells0.length === 0) {
      return { valid: true, errors, warnings };
    }
    
    // Si escaliers au RDC mais pas de trémie à l'étage
    if (stairwells1.length === 0) {
      errors.push('Escalier détecté au RDC mais aucune trémie à l\'étage');
      return { valid: false, errors, warnings };
    }
    
    // Vérifie la cohérence des dimensions
    for (const s0 of stairwells0) {
      const width0 = Math.abs(s0.xMax - s0.xMin);
      const depth0 = Math.abs(s0.zMax - s0.zMin);
      
      // Cherche une trémie correspondante à l'étage
      let found = false;
      for (const s1 of stairwells1) {
        const width1 = Math.abs(s1.xMax - s1.xMin);
        const depth1 = Math.abs(s1.zMax - s1.zMin);
        
        // Tolérance sur les dimensions
        if (Math.abs(width0 - width1) < THRESHOLDS.stairwellSizeTolerance &&
            Math.abs(depth0 - depth1) < THRESHOLDS.stairwellSizeTolerance) {
          found = true;
          
          // Vérifie l'alignement
          const center0 = [(s0.xMin + s0.xMax) / 2, (s0.zMin + s0.zMax) / 2];
          const center1 = [(s1.xMin + s1.xMax) / 2, (s1.zMin + s1.zMax) / 2];
          const distance = Math.hypot(center0[0] - center1[0], center0[1] - center1[1]);
          
          if (distance > THRESHOLDS.stairwellSizeTolerance) {
            warnings.push(`Trémie mal alignée entre RDC et étage (décalage ${distance.toFixed(2)}m)`);
          }
        }
      }
      
      if (!found) {
        errors.push('Trémie d\'escalier au RDC sans correspondance à l\'étage (dimensions incohérentes)');
      }
    }
    
    return { valid: errors.length === 0, errors, warnings };
  }

  // =====================================================================
  // CONTRÔLE 2 : MURS PORTEURS
  // =====================================================================

  /**
   * Vérifie l'alignement des murs porteurs entre niveaux.
   * 
   * Règles :
   * - Les murs porteurs de l'étage devraient être supportés par des murs au RDC
   * - Tolérance d'alignement configurable
   * 
   * @param {object} level0 — données du RDC
   * @param {object} level1 — données de l'étage
   * @returns {object} — {valid: boolean, errors: string[], warnings: string[]}
   */
  function checkLoadBearingWalls(level0, level1) {
    const errors = [];
    const warnings = [];
    
    const walls0 = (Array.isArray(level0.walls) ? level0.walls : [])
      .filter(w => w.type === 'ext' || w.loadBearing);
    const walls1 = (Array.isArray(level1.walls) ? level1.walls : [])
      .filter(w => w.type === 'ext' || w.loadBearing);
    
    // Vérifie si des murs porteurs du RDC disparaissent à l'étage
    for (const wall0 of walls0) {
      if (!Array.isArray(wall0.from) || !Array.isArray(wall0.to)) continue;
      
      const center0 = [
        (wall0.from[0] + wall0.to[0]) / 2,
        (wall0.from[1] + wall0.to[1]) / 2
      ];
      
      // Cherche un mur correspondant à l'étage
      let supported = false;
      for (const wall1 of walls1) {
        if (!Array.isArray(wall1.from) || !Array.isArray(wall1.to)) continue;
        
        const center1 = [
          (wall1.from[0] + wall1.to[0]) / 2,
          (wall1.from[1] + wall1.to[1]) / 2
        ];
        
        const distance = Math.hypot(center0[0] - center1[0], center0[1] - center1[1]);
        
        if (distance < THRESHOLDS.wallAlignmentTolerance) {
          supported = true;
          break;
        }
      }
      
      if (!supported) {
        warnings.push(`Mur porteur du RDC non supporté à l'étage (position: ${center0[0].toFixed(2)}, ${center0[1].toFixed(2)})`);
      }
    }
    
    if (walls1.length === 0 && walls0.length > 0) {
      return { valid: true, errors, warnings };
    }
    
    // Pour chaque mur porteur de l'étage, vérifie s'il est supporté
    for (const wall1 of walls1) {
      if (!Array.isArray(wall1.from) || !Array.isArray(wall1.to)) continue;
      
      // Centre du mur de l'étage
      const center1 = [
        (wall1.from[0] + wall1.to[0]) / 2,
        (wall1.from[1] + wall1.to[1]) / 2
      ];
      
      // Cherche un mur support au RDC
      let supported = false;
      for (const wall0 of walls0) {
        if (!Array.isArray(wall0.from) || !Array.isArray(wall0.to)) continue;
        
        // Distance point-segment (le centre du mur haut par rapport au mur bas)
        const dx = wall0.to[0] - wall0.from[0];
        const dz = wall0.to[1] - wall0.from[1];
        const len2 = dx * dx + dz * dz;
        
        if (len2 < 0.001) continue;
        
        let t = ((center1[0] - wall0.from[0]) * dx + (center1[1] - wall0.from[1]) * dz) / len2;
        t = Math.max(0, Math.min(1, t));
        
        const closestX = wall0.from[0] + t * dx;
        const closestZ = wall0.from[1] + t * dz;
        const distance = Math.hypot(center1[0] - closestX, center1[1] - closestZ);
        
        if (distance < THRESHOLDS.wallAlignmentTolerance) {
          supported = true;
          break;
        }
      }
      
      if (!supported) {
        warnings.push(`Mur porteur à l'étage non supporté par un mur au RDC (position: ${center1[0].toFixed(2)}, ${center1[1].toFixed(2)})`);
      }
    }
    
    return { valid: true, errors, warnings }; // Warnings seulement, pas d'erreurs bloquantes
  }

  // =====================================================================
  // CONTRÔLE 3 : ÉCLAIRAGE NATUREL
  // =====================================================================

  /**
   * Vérifie que chaque pièce habitable a au moins une fenêtre.
   * 
   * @param {object} level1 — données de l'étage
   * @returns {object} — {valid: boolean, errors: string[], warnings: string[]}
   */
  function checkNaturalLight(level1) {
    const errors = [];
    const warnings = [];
    
    const rooms = Array.isArray(level1.rooms) ? level1.rooms : [];
    
    for (const room of rooms) {
      if (!room.habitable) continue;
      
      // Cherche les murs adjacents à cette pièce
      const roomBounds = room.poly ? {
        xMin: Math.min(...room.poly.map(p => p[0])),
        xMax: Math.max(...room.poly.map(p => p[0])),
        zMin: Math.min(...room.poly.map(p => p[1])),
        zMax: Math.max(...room.poly.map(p => p[1]))
      } : room.bounds;
      
      if (!roomBounds) continue;
      
      // Cherche une fenêtre sur les murs adjacents
      const walls = Array.isArray(level1.walls) ? level1.walls : [];
      let hasWindow = false;
      
      for (const wall of walls) {
        if (!Array.isArray(wall.from) || !Array.isArray(wall.to)) continue;
        
        // Vérifie si le mur est adjacent à la pièce
        const wallCenter = [
          (wall.from[0] + wall.to[0]) / 2,
          (wall.from[1] + wall.to[1]) / 2
        ];
        
        const isAdjacent = wallCenter[0] >= roomBounds.xMin - 0.5 &&
                          wallCenter[0] <= roomBounds.xMax + 0.5 &&
                          wallCenter[1] >= roomBounds.zMin - 0.5 &&
                          wallCenter[1] <= roomBounds.zMax + 0.5;
        
        if (isAdjacent && Array.isArray(wall.openings)) {
          if (wall.openings.some(op => op.type === 'window' || op.type === 'bay')) {
            hasWindow = true;
            break;
          }
        }
      }
      
      if (!hasWindow) {
        const roomName = room.name || `Pièce ${room.id || 'inconnue'}`;
        warnings.push(`Pièce habitable sans fenêtre : ${roomName}`);
      }
    }
    
    return { valid: true, errors, warnings }; // Warnings seulement
  }

  // =====================================================================
  // CONTRÔLE 4 : HAUTEUR SOUS PLAFOND
  // =====================================================================

  /**
   * Vérifie la hauteur minimale sous plafond.
   * 
   * @param {object} project — données du projet
   * @returns {object} — {valid: boolean, errors: string[], warnings: string[]}
   */
  function checkCeilingHeight(project) {
    const errors = [];
    const warnings = [];
    
    const floorHeight = project.config?.floorHeight || 3.0;
    
    if (floorHeight < THRESHOLDS.minCeilingHeight) {
      errors.push(`Hauteur sous plafond insuffisante : ${floorHeight.toFixed(2)}m < ${THRESHOLDS.minCeilingHeight}m`);
    }
    
    return { valid: errors.length === 0, errors, warnings };
  }

  // =====================================================================
  // CONTRÔLE 5 : COHÉRENCE DES SURFACES
  // =====================================================================

  /**
   * Vérifie que la surface de l'étage est cohérente avec le RDC.
   * 
   * Règles :
   * - L'étage ne devrait pas dépasser 120% du RDC
   * - L'étage devrait être au moins 30% du RDC (sinon pourquoi un étage ?)
   * 
   * @param {object} level0 — données du RDC
   * @param {object} level1 — données de l'étage
   * @returns {object} — {valid: boolean, errors: string[], warnings: string[]}
   */
  function checkSurfaceConsistency(level0, level1) {
    const errors = [];
    const warnings = [];
    
    // Calcule les surfaces habitables
    const calcHabitableSurface = (level) => {
      const rooms = Array.isArray(level.rooms) ? level.rooms : [];
      return rooms.reduce((sum, room) => {
        if (!room.habitable) return sum;
        const bounds = room.poly ? {
          xMin: Math.min(...room.poly.map(p => p[0])),
          xMax: Math.max(...room.poly.map(p => p[0])),
          zMin: Math.min(...room.poly.map(p => p[1])),
          zMax: Math.max(...room.poly.map(p => p[1]))
        } : room.bounds;
        
        if (!bounds) return sum;
        return sum + (bounds.xMax - bounds.xMin) * (bounds.zMax - bounds.zMin);
      }, 0);
    };
    
    const surface0 = calcHabitableSurface(level0);
    const surface1 = calcHabitableSurface(level1);
    
    if (surface0 === 0) {
      return { valid: true, errors, warnings };
    }
    
    const ratio = surface1 / surface0;
    
    if (ratio > THRESHOLDS.maxSurfaceRatio) {
      warnings.push(`Surface étage/RDC = ${(ratio * 100).toFixed(0)}% > ${THRESHOLDS.maxSurfaceRatio * 100}% (débord important ?)`);
    }
    
    if (ratio < THRESHOLDS.minSurfaceRatio) {
      warnings.push(`Surface étage/RDC = ${(ratio * 100).toFixed(0)}% < ${THRESHOLDS.minSurfaceRatio * 100}% (petit étage)`);
    }
    
    return { valid: true, errors, warnings }; // Infos seulement
  }

  // =====================================================================
  // RAPPORT COMPLET
  // =====================================================================

  /**
   * Génère un rapport de conformité complet R+1.
   * 
   * @param {object} level0 — données du RDC
   * @param {object} level1 — données de l'étage
   * @param {object} project — données du projet
   * @returns {object} — rapport complet
   */
  function generateReport(level0, level1, project) {
    const checks = {
      stairwell: checkStairwells(level0, level1),
      loadBearingWalls: checkLoadBearingWalls(level0, level1),
      naturalLight: checkNaturalLight(level1),
      ceilingHeight: checkCeilingHeight(project),
      surfaceConsistency: checkSurfaceConsistency(level0, level1)
    };
    
    // Compile tous les messages
    const allErrors = [];
    const allWarnings = [];
    
    for (const [rule, result] of Object.entries(checks)) {
      const ruleInfo = RULES[rule];
      
      for (const error of result.errors) {
        allErrors.push({
          severity: ruleInfo.severity,
          rule: ruleInfo.name,
          message: error
        });
      }
      
      for (const warning of result.warnings) {
        allWarnings.push({
          severity: 'warning',
          rule: ruleInfo.name,
          message: warning
        });
      }
    }
    
    const valid = allErrors.length === 0;
    
    return {
      valid,
      score: valid ? 100 : Math.max(0, 100 - allErrors.length * 25),
      checks,
      errors: allErrors,
      warnings: allWarnings,
      summary: {
        errors: allErrors.length,
        warnings: allWarnings.length,
        passed: Object.values(checks).filter(c => c.valid).length,
        total: Object.keys(checks).length
      }
    };
  }

  // =====================================================================
  // API PUBLIQUE
  // =====================================================================

  return {
    generateReport,
    checkStairwells,
    checkLoadBearingWalls,
    checkNaturalLight,
    checkCeilingHeight,
    checkSurfaceConsistency,
    RULES,
    THRESHOLDS
  };
})();

if (typeof module !== 'undefined') module.exports = RPlus1Checker;
