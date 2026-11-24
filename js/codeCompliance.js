/**
 * CODE COMPLIANCE — Vérification de conformité réglementaire
 * 
 * Vérifie automatiquement la conformité d'un projet selon :
 * - PLU (Plan Local d'Urbanisme) : CES, COS, hauteur, recul, espaces verts
 * - RE2020 (Réglementation Environnementale) : Bbio simplifié, baies vitrées
 * - PMR (Personnes à Mobilité Réduite) : accessibilité
 * - Habitabilité : surfaces minimales, hauteur sous plafond
 * 
 * Compatible navigateur et Node.js.
 */
const CodeCompliance = (() => {
  'use strict';

  // =====================================================================
  // RÈGLES RÉGLEMENTAIRES
  // =====================================================================

  const PLU_RULES = {
    // Coefficient d'Emprise au Sol (max 40% en zone résidentielle)
    maxCES: 0.40,
    // Coefficient d'Occupation des Sol (max 1.5 en zone résidentielle)
    maxCOS: 1.5,
    // Hauteur maximale (12m en zone résidentielle)
    maxHeight: 12,
    // Recul par rapport aux limites (3m minimum)
    minSetback: 3,
    // Espaces verts minimum (20% de la surface du terrain)
    minGreenSpace: 0.20
  };

  const RE2020_RULES = {
    // Besoin Bioclimatique (Bbio) max selon zone
    // Zone H1a (nord) : 60, H2c (sud) : 50, H3 (littoral) : 45
    maxBbio: {
      H1: 60,
      H2: 55,
      H3: 45
    },
    // Ratio baies vitrées / surface habitable (min 1/6)
    minBayRatio: 1 / 6,
    // Surface de baies minimum par pièce habitable
    minBayPerRoom: 0.5 // m²
  };

  const PMR_RULES = {
    // Largeur minimum passage
    minCirculationWidth: 1.20,
    // Largeur minimum porte
    minDoorWidth: 0.90,
    // Pente maximum rampe
    maxRampSlope: 0.05,
    // Espace rotation minimum
    minRotationDiameter: 1.50,
    // Hauteur seuil maximum
    maxThresholdHeight: 0.02
  };

  const HABITABILITY_RULES = {
    // Surfaces minimales par type de pièce (m²)
    minSurface: {
      sejour: 14,
      chambre: 9,
      cuisine: 7,
      sdb: 3.5,
      wc: 1.5,
      bureau: 6,
      default: 5
    },
    // Hauteur sous plafond minimum
    minCeilingHeight: 2.20,
    // Éclairage naturel obligatoire pour pièces habitables
    requireNaturalLight: true
  };

  // =====================================================================
  // VÉRIFICATION PLU
  // =====================================================================

  /**
   * Vérifie la conformité au PLU.
   * @param {object} project — { rooms, walls, terrain }
   * @param {object} terrain — { area, width, depth }
   * @returns {object} — { compliant: bool, violations: [], warnings: [] }
   */
  function checkPLU(project, terrain) {
    const violations = [];
    const warnings = [];
    
    if (!terrain || !terrain.area) {
      return { compliant: true, violations, warnings: ['Terrain non défini, vérification PLU ignorée'] };
    }
    
    // 1. CES (Coefficient d'Emprise au Sol)
    const builtArea = computeBuiltArea(project);
    const ces = builtArea / terrain.area;
    
    if (ces > PLU_RULES.maxCES) {
      violations.push({
        rule: 'CES',
        value: round2(ces * 100) + '%',
        limit: (PLU_RULES.maxCES * 100) + '%',
        message: `Emprise au sol ${(ces * 100).toFixed(1)}% dépasse le maximum autorisé ${PLU_RULES.maxCES * 100}%`
      });
    }
    
    // 2. COS (Coefficient d'Occupation des Sol)
    const totalFloorArea = computeTotalFloorArea(project);
    const cos = totalFloorArea / terrain.area;
    
    if (cos > PLU_RULES.maxCOS) {
      violations.push({
        rule: 'COS',
        value: round2(cos),
        limit: PLU_RULES.maxCOS,
        message: `COS ${cos.toFixed(2)} dépasse le maximum autorisé ${PLU_RULES.maxCOS}`
      });
    }
    
    // 3. Hauteur maximale
    const maxHeight = computeMaxHeight(project);
    if (maxHeight > PLU_RULES.maxHeight) {
      violations.push({
        rule: 'Hauteur',
        value: round2(maxHeight) + 'm',
        limit: PLU_RULES.maxHeight + 'm',
        message: `Hauteur ${maxHeight.toFixed(2)}m dépasse le maximum autorisé ${PLU_RULES.maxHeight}m`
      });
    }
    
    // 4. Recul par rapport aux limites
    const setbacks = computeSetbacks(project, terrain);
    if (setbacks.min < PLU_RULES.minSetback) {
      warnings.push({
        rule: 'Recul',
        value: round2(setbacks.min) + 'm',
        limit: PLU_RULES.minSetback + 'm',
        message: `Recul minimum ${setbacks.min.toFixed(2)}m inférieur au recommandé ${PLU_RULES.minSetback}m`
      });
    }
    
    // 5. Espaces verts
    const greenSpace = computeGreenSpace(project, terrain);
    const greenRatio = greenSpace / terrain.area;
    
    if (greenRatio < PLU_RULES.minGreenSpace) {
      warnings.push({
        rule: 'Espaces verts',
        value: round2(greenRatio * 100) + '%',
        limit: (PLU_RULES.minGreenSpace * 100) + '%',
        message: `Espaces verts ${(greenRatio * 100).toFixed(1)}% inférieurs au minimum recommandé ${PLU_RULES.minGreenSpace * 100}%`
      });
    }
    
    return {
      compliant: violations.length === 0,
      violations,
      warnings,
      metrics: {
        ces: round2(ces),
        cos: round2(cos),
        maxHeight: round2(maxHeight),
        minSetback: round2(setbacks.min),
        greenRatio: round2(greenRatio)
      }
    };
  }

  function computeBuiltArea(project) {
    const rooms = project.rooms || [];
    return rooms.reduce((sum, r) => sum + (r.area || 0), 0);
  }

  function computeTotalFloorArea(project) {
    // Pour l'instant, même chose que builtArea (pas de multi-niveaux)
    return computeBuiltArea(project);
  }

  function computeMaxHeight(project) {
    // Hauteur par défaut si non spécifiée
    return project.config?.height || 2.5;
  }

  function computeSetbacks(project, terrain) {
    const rooms = project.rooms || [];
    if (rooms.length === 0) return { min: 0 };
    
    const bounds = computeBounds(rooms);
    
    // Recul par rapport aux 4 côtés du terrain
    const setbacks = [
      bounds.xMin - (terrain.xMin || 0),
      (terrain.xMax || terrain.width) - bounds.xMax,
      bounds.zMin - (terrain.zMin || 0),
      (terrain.zMax || terrain.depth) - bounds.zMax
    ];
    
    return { min: Math.min(...setbacks) };
  }

  function computeGreenSpace(project, terrain) {
    const builtArea = computeBuiltArea(project);
    return terrain.area - builtArea;
  }

  // =====================================================================
  // VÉRIFICATION RE2020
  // =====================================================================

  /**
   * Vérifie la conformité RE2020 (simplifié).
   * @param {object} project
   * @param {string} climateZone — 'H1'|'H2'|'H3'
   * @returns {object}
   */
  function checkRE2020(project, climateZone = 'H2') {
    const violations = [];
    const warnings = [];
    
    const rooms = project.rooms || [];
    const habitableRooms = rooms.filter(r => r.habitable !== false);
    
    // 1. Ratio baies vitrées / surface habitable
    const totalHabitableArea = habitableRooms.reduce((sum, r) => sum + (r.area || 0), 0);
    const totalBayArea = computeTotalBayArea(project);
    const bayRatio = totalBayArea / totalHabitableArea;
    
    if (bayRatio < RE2020_RULES.minBayRatio) {
      violations.push({
        rule: 'Ratio baies',
        value: `1/${round2(1 / bayRatio)}`,
        limit: `1/${round2(1 / RE2020_RULES.minBayRatio)}`,
        message: `Ratio baies/surface 1/${(1 / bayRatio).toFixed(1)} inférieur au minimum 1/${(1 / RE2020_RULES.minBayRatio).toFixed(0)}`
      });
    }
    
    // 2. Baies vitrées par pièce habitable
    for (const room of habitableRooms) {
      const bayArea = computeRoomBayArea(room);
      if (bayArea < RE2020_RULES.minBayPerRoom) {
        warnings.push({
          rule: 'Baies par pièce',
          room: room.name || room.id,
          value: round2(bayArea) + 'm²',
          limit: RE2020_RULES.minBayPerRoom + 'm²',
          message: `Pièce "${room.name || room.id}" : surface vitrée ${bayArea.toFixed(2)}m² inférieure au recommandé ${RE2020_RULES.minBayPerRoom}m²`
        });
      }
    }
    
    // 3. Bbio simplifié (estimation)
    const bbioEstimate = estimateBbio(project, climateZone);
    const maxBbio = RE2020_RULES.maxBbio[climateZone] || RE2020_RULES.maxBbio.H2;
    
    if (bbioEstimate > maxBbio) {
      warnings.push({
        rule: 'Bbio',
        value: round2(bbioEstimate),
        limit: maxBbio,
        message: `Bbio estimé ${bbioEstimate.toFixed(1)} dépasse le maximum ${maxBbio} pour zone ${climateZone} (vérification simplifiée)`
      });
    }
    
    return {
      compliant: violations.length === 0,
      violations,
      warnings,
      metrics: {
        bayRatio: round2(bayRatio),
        totalBayArea: round2(totalBayArea),
        bbioEstimate: round2(bbioEstimate),
        climateZone
      }
    };
  }

  function computeTotalBayArea(project) {
    const walls = project.walls || [];
    let total = 0;
    
    for (const wall of walls) {
      const openings = wall.openings || [];
      for (const op of openings) {
        if (op.type === 'window' || op.type === 'bay') {
          total += (op.w || 1) * (op.h || 1.2);
        }
      }
    }
    
    return total;
  }

  function computeRoomBayArea(room) {
    // Estimation : 20% de la surface de la pièce (simplifié)
    return (room.area || 0) * 0.20;
  }

  function estimateBbio(project, climateZone) {
    // Estimation très simplifiée du Bbio
    // Facteurs : orientation, isolation, baies vitrées
    
    const rooms = project.rooms || [];
    const totalArea = rooms.reduce((sum, r) => sum + (r.area || 0), 0);
    const totalBayArea = computeTotalBayArea(project);
    
    // Bbio de base selon zone
    let bbio = climateZone === 'H1' ? 50 : climateZone === 'H3' ? 40 : 45;
    
    // Pénalité si ratio baies faible
    const bayRatio = totalBayArea / totalArea;
    if (bayRatio < 0.15) bbio += 10;
    
    // Bonus si bonne compacité
    const bounds = computeBounds(rooms);
    const emprise = (bounds.xMax - bounds.xMin) * (bounds.zMax - bounds.zMin);
    const compactness = totalArea / emprise;
    if (compactness > 0.85) bbio -= 5;
    
    return Math.max(0, bbio);
  }

  // =====================================================================
  // VÉRIFICATION PMR
  // =====================================================================

  /**
   * Vérifie la conformité PMR (accessibilité).
   * @param {object} project
   * @returns {object}
   */
  function checkPMR(project) {
    const violations = [];
    const warnings = [];
    
    const rooms = project.rooms || [];
    const walls = project.walls || [];
    
    // 1. Largeur des circulations
    // (Simplifié : on vérifie que les passages entre pièces sont suffisants)
    const circulations = detectCirculations(project);
    for (const circ of circulations) {
      if (circ.width < PMR_RULES.minCirculationWidth) {
        violations.push({
          rule: 'Circulation',
          location: circ.location || 'Non spécifié',
          value: round2(circ.width) + 'm',
          limit: PMR_RULES.minCirculationWidth + 'm',
          message: `Largeur circulation ${circ.width.toFixed(2)}m inférieure au minimum ${PMR_RULES.minCirculationWidth}m`
        });
      }
    }
    
    // 2. Largeur des portes
    for (const wall of walls) {
      const openings = wall.openings || [];
      for (const op of openings) {
        if (op.type === 'door' && op.w < PMR_RULES.minDoorWidth) {
          violations.push({
            rule: 'Porte PMR',
            value: round2(op.w) + 'm',
            limit: PMR_RULES.minDoorWidth + 'm',
            message: `Largeur porte ${op.w.toFixed(2)}m inférieure au minimum ${PMR_RULES.minDoorWidth}m`
          });
        }
      }
    }
    
    // 3. Présence d'une chambre et SDB au RDC (pour PMR)
    const hasGroundFloorBedroom = rooms.some(r => r.type === 'chambre' && (r.level === 0 || !r.level));
    const hasGroundFloorBathroom = rooms.some(r => r.type === 'sdb' && (r.level === 0 || !r.level));
    
    if (!hasGroundFloorBedroom) {
      warnings.push({
        rule: 'Chambre RDC',
        message: 'Aucune chambre détectée au RDC (recommandé pour PMR)'
      });
    }
    
    if (!hasGroundFloorBathroom) {
      warnings.push({
        rule: 'SDB RDC',
        message: 'Aucune salle de bain détectée au RDC (recommandé pour PMR)'
      });
    }
    
    return {
      compliant: violations.length === 0,
      violations,
      warnings,
      metrics: {
        circulationsChecked: circulations.length,
        doorsChecked: walls.reduce((sum, w) => sum + (w.openings?.length || 0), 0)
      }
    };
  }

  function detectCirculations(project) {
    // Détection simplifiée : espaces entre pièces
    const rooms = project.rooms || [];
    const circulations = [];
    
    // Pour l'instant, on estime que les circulations sont les espaces non bâtis
    // Cette fonction devrait être améliorée avec une analyse topologique
    
    return circulations;
  }

  // =====================================================================
  // VÉRIFICATION HABITABILITÉ
  // =====================================================================

  /**
   * Vérifie l'habitabilité (surfaces minimales, hauteur).
   * @param {object} project
   * @returns {object}
   */
  function checkHabitability(project) {
    const violations = [];
    const warnings = [];
    
    const rooms = project.rooms || [];
    
    for (const room of rooms) {
      const area = room.area || 0;
      const minRequired = HABITABILITY_RULES.minSurface[room.type] || HABITABILITY_RULES.minSurface.default;
      
      // 1. Surface minimum
      if (area < minRequired) {
        violations.push({
          rule: 'Surface minimum',
          room: room.name || room.id,
          type: room.type,
          value: round2(area) + 'm²',
          limit: minRequired + 'm²',
          message: `Pièce "${room.name || room.id}" : surface ${area.toFixed(2)}m² inférieure au minimum ${minRequired}m² pour type ${room.type}`
        });
      }
      
      // 2. Hauteur sous plafond
      const height = room.height || project.config?.height || 2.5;
      if (height < HABITABILITY_RULES.minCeilingHeight) {
        violations.push({
          rule: 'Hauteur sous plafond',
          room: room.name || room.id,
          value: round2(height) + 'm',
          limit: HABITABILITY_RULES.minCeilingHeight + 'm',
          message: `Pièce "${room.name || room.id}" : hauteur ${height.toFixed(2)}m inférieure au minimum ${HABITABILITY_RULES.minCeilingHeight}m`
        });
      }
    }
    
    return {
      compliant: violations.length === 0,
      violations,
      warnings,
      metrics: {
        roomsChecked: rooms.length
      }
    };
  }

  // =====================================================================
  // RAPPORT COMPLET
  // =====================================================================

  /**
   * Génère un rapport de conformité complet.
   * @param {object} project
   * @param {object} options — { terrain, climateZone, checkPMR: bool }
   * @returns {object}
   */
  function generateComplianceReport(project, options = {}) {
    const report = {
      timestamp: new Date().toISOString(),
      checks: {}
    };
    
    // 1. PLU
    if (options.terrain) {
      report.checks.plu = checkPLU(project, options.terrain);
    }
    
    // 2. RE2020
    report.checks.re2020 = checkRE2020(project, options.climateZone);
    
    // 3. PMR
    if (options.checkPMR !== false) {
      report.checks.pmr = checkPMR(project);
    }
    
    // 4. Habitabilité
    report.checks.habitability = checkHabitability(project);
    
    // Synthèse
    const allChecks = Object.values(report.checks);
    const allViolations = allChecks.flatMap(c => c.violations || []);
    const allWarnings = allChecks.flatMap(c => c.warnings || []);
    
    report.summary = {
      compliant: allViolations.length === 0,
      totalViolations: allViolations.length,
      totalWarnings: allWarnings.length,
      violations: allViolations,
      warnings: allWarnings
    };
    
    return report;
  }

  // =====================================================================
  // UTILITAIRES
  // =====================================================================

  function computeBounds(rooms) {
    if (rooms.length === 0) return { xMin: 0, xMax: 10, zMin: 0, zMax: 10 };
    
    const allBounds = rooms.map(r => r.bounds).filter(Boolean);
    if (allBounds.length === 0) return { xMin: 0, xMax: 10, zMin: 0, zMax: 10 };
    
    return {
      xMin: Math.min(...allBounds.map(b => b.xMin)),
      xMax: Math.max(...allBounds.map(b => b.xMax)),
      zMin: Math.min(...allBounds.map(b => b.zMin)),
      zMax: Math.max(...allBounds.map(b => b.zMax))
    };
  }

  function round2(n) {
    return Math.round(n * 100) / 100;
  }

  // =====================================================================
  // EXPORT
  // =====================================================================

  return {
    // Vérifications individuelles
    checkPLU,
    checkRE2020,
    checkPMR,
    checkHabitability,
    
    // Rapport complet
    generateComplianceReport,
    
    // Règles
    PLU_RULES,
    RE2020_RULES,
    PMR_RULES,
    HABITABILITY_RULES
  };
})();

// Compatibilité Node.js
if (typeof module !== 'undefined' && module.exports) {
  module.exports = CodeCompliance;
}
