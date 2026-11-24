/**
 * STRUCTURAL ANALYSIS — Analyse structurelle simplifiée
 * 
 * Détecte les murs porteurs, calcule les charges et vérifie le dimensionnement.
 * 
 * Limites documentées :
 * - Calcul simplifié (pas de calcul aux éléments finis)
 * - Hypothèses standards (maçonnerie, béton armé courant)
 * - Ne remplace pas une étude de sol ni un calcul d'ingénieur
 * 
 * Compatible navigateur et Node.js.
 */
const StructuralAnalysis = (() => {
  'use strict';

  // =====================================================================
  // CONSTANTES STRUCTURELLES
  // =====================================================================

  const MATERIALS = {
    // Maçonnerie (parpaings, briques)
    masonry: {
      density: 2000, // kg/m³
      compressiveStrength: 5000, // kN/m² (5 MPa)
      minThickness: 0.20 // m
    },
    // Béton armé
    reinforcedConcrete: {
      density: 2500, // kg/m³
      compressiveStrength: 25000, // kN/m² (25 MPa)
      minThickness: 0.15 // m
    },
    // Bois
    wood: {
      density: 500, // kg/m³
      compressiveStrength: 8000, // kN/m² (8 MPa)
      minThickness: 0.12 // m
    }
  };

  const LOADS = {
    // Charges permanentes (kN/m²)
    permanent: {
      roof: 1.5, // toiture + isolation
      floor: 2.5, // plancher + revêtement
      partitions: 1.0 // cloisons
    },
    // Charges d'exploitation (kN/m²)
    live: {
      habitation: 1.5, // habitation courante
      terrace: 2.0, // terrasse
      garage: 2.5 // garage
    },
    // Charges climatiques (kN/m²)
    climate: {
      snow: 1.0, // neige (zone moyenne)
      wind: 0.8 // vent (pression/dépression)
    }
  };

  const SAFETY_FACTORS = {
    // Coefficients de sécurité
    gammaG: 1.35, // charges permanentes
    gammaQ: 1.50, // charges variables
    gammaM: 1.50 // matériaux
  };

  // =====================================================================
  // DÉTECTION MURS PORTEURS
  // =====================================================================

  /**
   * Détecte les murs porteurs dans un projet.
   * @param {object} project — { rooms, walls, levels }
   * @returns {object} — { loadBearingWalls, analysis }
   */
  function detectLoadBearingWalls(project) {
    const walls = project.walls || [];
    const loadBearingWalls = [];

    for (const wall of walls) {
      const analysis = analyzeWall(wall, project);
      
      if (analysis.isLoadBearing) {
        loadBearingWalls.push({
          wall,
          ...analysis
        });
      }
    }

    return {
      loadBearingWalls,
      stats: {
        total: walls.length,
        loadBearing: loadBearingWalls.length,
        ratio: loadBearingWalls.length / walls.length
      }
    };
  }

  /**
   * Analyse si un mur est porteur.
   */
  function analyzeWall(wall, project) {
    let score = 0;
    const reasons = [];

    // 1. Mur extérieur = porteur par défaut
    if (wall.type === 'ext') {
      score += 3;
      reasons.push('Mur extérieur');
    }

    // 2. Épaisseur > 0.20m = probablement porteur
    if (wall.thick && wall.thick >= 0.20) {
      score += 2;
      reasons.push(`Épaisseur ${wall.thick}m`);
    }

    // 3. Longueur > 3m = porteur probable
    const length = Math.hypot(
      wall.to[0] - wall.from[0],
      wall.to[1] - wall.from[1]
    );
    if (length > 3) {
      score += 1;
      reasons.push(`Longueur ${length.toFixed(1)}m`);
    }

    // 4. Connexions multiples = carrefour porteur
    const connections = countConnections(wall, project.walls);
    if (connections >= 3) {
      score += 1;
      reasons.push(`${connections} connexions`);
    }

    // 5. Supporte des éléments supérieurs (étages, toiture)
    if (wall.supports && wall.supports.length > 0) {
      score += 2;
      reasons.push('Supporte éléments supérieurs');
    }

    return {
      isLoadBearing: score >= 3,
      score,
      reasons,
      connections,
      length
    };
  }

  /**
   * Compte les connexions d'un mur avec les autres murs.
   */
  function countConnections(wall, allWalls) {
    let count = 0;
    const endpoints = [wall.from, wall.to];

    for (const other of allWalls) {
      if (other === wall) continue;

      const otherEndpoints = [other.from, other.to];
      
      for (const ep of endpoints) {
        for (const otherEp of otherEndpoints) {
          if (pointsMatch(ep, otherEp, 0.1)) {
            count++;
          }
        }
      }
    }

    return count;
  }

  /**
   * Vérifie si deux points correspondent (tolérance).
   */
  function pointsMatch(p1, p2, tolerance) {
    return Math.hypot(p1[0] - p2[0], p1[1] - p2[1]) < tolerance;
  }

  // =====================================================================
  // CALCUL DES CHARGES
  // =====================================================================

  /**
   * Calcule la descente de charges simplifiée.
   * @param {object} project
   * @returns {object} — { wallLoads, totalLoad }
   */
  function computeLoadPath(project) {
    const rooms = project.rooms || [];
    const walls = project.walls || [];
    const wallLoads = [];

    for (const wall of walls) {
      const load = computeWallLoad(wall, rooms, project);
      wallLoads.push({
        wall,
        ...load
      });
    }

    const totalLoad = wallLoads.reduce((sum, wl) => sum + wl.totalLoad, 0);

    return {
      wallLoads,
      totalLoad,
      stats: {
        maxLoad: Math.max(...wallLoads.map(wl => wl.totalLoad)),
        avgLoad: totalLoad / wallLoads.length
      }
    };
  }

  /**
   * Calcule la charge sur un mur.
   */
  function computeWallLoad(wall, rooms, project) {
    const length = Math.hypot(
      wall.to[0] - wall.from[0],
      wall.to[1] - wall.from[1]
    );

    // Charge permanente (poids propre + plancher + toiture)
    let permanentLoad = 0;

    // Poids propre du mur
    const wallHeight = project.config?.height || 2.5;
    const wallVolume = length * wall.thick * wallHeight;
    const wallMaterial = wall.material || 'masonry';
    const wallWeight = wallVolume * MATERIALS[wallMaterial].density * 9.81 / 1000; // kN
    permanentLoad += wallWeight;

    // Plancher supporté (si mur porteur)
    if (wall.type === 'ext' || wall.loadBearing) {
      const supportedArea = length * 3; // hypothèse : 3m de portée
      permanentLoad += supportedArea * LOADS.permanent.floor;
      permanentLoad += supportedArea * LOADS.permanent.partitions;
    }

    // Toiture (si mur extérieur)
    if (wall.type === 'ext') {
      const roofArea = length * 5; // hypothèse : 5m de portée toiture
      permanentLoad += roofArea * LOADS.permanent.roof;
    }

    // Charges d'exploitation
    let liveLoad = 0;
    if (wall.type === 'ext' || wall.loadBearing) {
      const supportedArea = length * 3;
      liveLoad += supportedArea * LOADS.live.habitation;
    }

    // Charges climatiques
    let climateLoad = 0;
    if (wall.type === 'ext') {
      const roofArea = length * 5;
      climateLoad += roofArea * LOADS.climate.snow;
      climateLoad += length * wallHeight * LOADS.climate.wind;
    }

    // Charge totale (avec coefficients de sécurité)
    const totalLoad = 
      permanentLoad * SAFETY_FACTORS.gammaG +
      (liveLoad + climateLoad) * SAFETY_FACTORS.gammaQ;

    // Contrainte (kN/m²)
    const bearingArea = length * wall.thick;
    const stress = totalLoad / bearingArea;

    return {
      permanentLoad,
      liveLoad,
      climateLoad,
      totalLoad,
      stress,
      length,
      bearingArea
    };
  }

  // =====================================================================
  // VÉRIFICATION DIMENSIONNEMENT
  // =====================================================================

  /**
   * Vérifie le dimensionnement des murs.
   * @param {object} project
   * @returns {object} — { checks, warnings, errors }
   */
  function checkStructuralAdequacy(project) {
    const loadPath = computeLoadPath(project);
    const checks = [];
    const warnings = [];
    const errors = [];

    for (const wallLoad of loadPath.wallLoads) {
      const wall = wallLoad.wall;
      const material = wall.material || 'masonry';
      const materialProps = MATERIALS[material];

      // Vérification contrainte
      const allowableStress = materialProps.compressiveStrength / SAFETY_FACTORS.gammaM;
      const utilizationRatio = wallLoad.stress / allowableStress;

      const check = {
        wall,
        stress: wallLoad.stress,
        allowableStress,
        utilizationRatio,
        adequate: utilizationRatio < 1.0
      };

      checks.push(check);

      if (utilizationRatio >= 1.0) {
        errors.push({
          wall,
          message: `Mur sous-dimensionné : contrainte ${wallLoad.stress.toFixed(0)} kN/m² > résistance ${allowableStress.toFixed(0)} kN/m²`,
          utilizationRatio
        });
      } else if (utilizationRatio > 0.75) {
        warnings.push({
          wall,
          message: `Mur proche de la limite : ${wallLoad.stress.toFixed(0)} kN/m² (${(utilizationRatio * 100).toFixed(0)}% de la résistance)`,
          utilizationRatio
        });
      }
    }

    return {
      checks,
      warnings,
      errors,
      stats: {
        adequate: checks.filter(c => c.adequate).length,
        inadequate: checks.filter(c => !c.adequate).length,
        avgUtilization: checks.reduce((sum, c) => sum + c.utilizationRatio, 0) / checks.length
      }
    };
  }

  // =====================================================================
  // SUGGESTIONS RENFORCEMENT
  // =====================================================================

  /**
   * Propose des solutions de renforcement.
   * @param {object} adequacy — résultat de checkStructuralAdequacy
   * @returns {Array} — suggestions
   */
  function suggestReinforcement(adequacy) {
    const suggestions = [];

    for (const error of adequacy.errors) {
      const wall = error.wall;
      const currentThickness = wall.thick || 0.20;
      const requiredThickness = currentThickness * error.utilizationRatio * 1.2; // +20% marge

      suggestions.push({
        wall,
        problem: error.message,
        solutions: [
          {
            type: 'épaississement',
            description: `Épaissir le mur de ${currentThickness}m à ${requiredThickness.toFixed(2)}m`,
            cost: 'Moyen',
            complexity: 'Élevée'
          },
          {
            type: 'matériau',
            description: 'Remplacer par du béton armé (résistance 25 MPa)',
            cost: 'Élevé',
            complexity: 'Élevée'
          },
          {
            type: 'soulagement',
            description: 'Ajouter un poteau ou une poutre pour réduire la charge',
            cost: 'Moyen',
            complexity: 'Moyenne'
          }
        ]
      });
    }

    for (const warning of adequacy.warnings) {
      suggestions.push({
        wall: warning.wall,
        problem: warning.message,
        solutions: [
          {
            type: 'surveillance',
            description: 'Surveiller les fissures potentielles',
            cost: 'Faible',
            complexity: 'Faible'
          }
        ]
      });
    }

    return suggestions;
  }

  // =====================================================================
  // ANALYSE COMPLÈTE
  // =====================================================================

  /**
   * Analyse structurelle complète.
   * @param {object} project
   * @returns {object}
   */
  function analyzeStructure(project) {
    // 1. Détection murs porteurs
    const loadBearing = detectLoadBearingWalls(project);

    // 2. Calcul descente de charges
    const loadPath = computeLoadPath(project);

    // 3. Vérification dimensionnement
    const adequacy = checkStructuralAdequacy(project);

    // 4. Suggestions renforcement
    const reinforcements = suggestReinforcement(adequacy);

    return {
      loadBearing,
      loadPath,
      adequacy,
      reinforcements,
      summary: {
        totalWalls: loadBearing.stats.total,
        loadBearingWalls: loadBearing.stats.loadBearing,
        adequateWalls: adequacy.stats.adequate,
        inadequateWalls: adequacy.stats.inadequate,
        totalLoad: loadPath.totalLoad,
        avgUtilization: adequacy.stats.avgUtilization
      }
    };
  }

  // =====================================================================
  // EXPORT
  // =====================================================================

  return {
    // Détection
    detectLoadBearingWalls,
    analyzeWall,
    countConnections,

    // Charges
    computeLoadPath,
    computeWallLoad,

    // Vérification
    checkStructuralAdequacy,
    suggestReinforcement,

    // Analyse complète
    analyzeStructure,

    // Constantes
    MATERIALS,
    LOADS,
    SAFETY_FACTORS
  };
})();

// Compatibilité Node.js
if (typeof module !== 'undefined' && module.exports) {
  module.exports = StructuralAnalysis;
}
