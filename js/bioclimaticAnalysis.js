/**
 * BIOCLIMATIC ANALYSIS — Analyse bioclimatique simplifiée
 * 
 * Analyse l'orientation, l'ensoleillement et la ventilation naturelle
 * pour optimiser le confort thermique et les économies d'énergie.
 * 
 * Compatible navigateur et Node.js.
 */
const BioclimaticAnalysis = (() => {
  'use strict';

  // =====================================================================
  // CONSTANTS
  // =====================================================================

  const ORIENTATIONS = {
    NORTH: { angle: 0, label: 'Nord', solarGain: 0.3 },
    NORTHEAST: { angle: 45, label: 'Nord-Est', solarGain: 0.5 },
    EAST: { angle: 90, label: 'Est', solarGain: 0.7 },
    SOUTHEAST: { angle: 135, label: 'Sud-Est', solarGain: 0.9 },
    SOUTH: { angle: 180, label: 'Sud', solarGain: 1.0 },
    SOUTHWEST: { angle: 225, label: 'Sud-Ouest', solarGain: 0.8 },
    WEST: { angle: 270, label: 'Ouest', solarGain: 0.6 },
    NORTHWEST: { angle: 315, label: 'Nord-Ouest', solarGain: 0.4 }
  };

  const ROOM_PREFERENCES = {
    sejour: { preferredOrientation: 'SOUTH', minSunHours: 4 },
    chambre: { preferredOrientation: 'EAST', minSunHours: 2 },
    cuisine: { preferredOrientation: 'NORTH', minSunHours: 1 },
    sdb: { preferredOrientation: 'NORTH', minSunHours: 1 },
    bureau: { preferredOrientation: 'NORTH', minSunHours: 3 }
  };

  // =====================================================================
  // ORIENTATION BUILDING
  // =====================================================================

  /**
   * Calcule l'orientation principale du bâtiment.
   * @param {object} project — { rooms, walls }
   * @returns {object} — orientation principale
   */
  function computeBuildingOrientation(project) {
    const walls = project.walls || [];
    
    // Trouver les murs les plus longs (façades principales)
    const wallLengths = walls.map(w => ({
      wall: w,
      length: Math.hypot(w.to[0] - w.from[0], w.to[1] - w.from[1]),
      angle: computeWallAngle(w)
    }));
    
    wallLengths.sort((a, b) => b.length - a.length);
    
    // Les 2 murs les plus longs définissent l'orientation
    const mainWalls = wallLengths.slice(0, 2);
    
    if (mainWalls.length === 0) {
      return { orientation: 'UNKNOWN', angle: 0, confidence: 0 };
    }
    
    const avgAngle = mainWalls.reduce((sum, w) => sum + w.angle, 0) / mainWalls.length;
    const orientation = angleToOrientation(avgAngle);
    
    return {
      orientation: orientation.label,
      angle: Math.round(avgAngle),
      confidence: mainWalls.length >= 2 ? 0.8 : 0.5
    };
  }

  /**
   * Calcule l'angle d'un mur (0-360°).
   */
  function computeWallAngle(wall) {
    const dx = wall.to[0] - wall.from[0];
    const dy = wall.to[1] - wall.from[1];
    let angle = Math.atan2(dy, dx) * 180 / Math.PI;
    if (angle < 0) angle += 360;
    return angle;
  }

  /**
   * Convertit un angle en orientation cardinale.
   */
  function angleToOrientation(angle) {
    const orientations = Object.values(ORIENTATIONS);
    let closest = orientations[0];
    let minDiff = 360;
    
    for (const orient of orientations) {
      const diff = Math.abs(angle - orient.angle);
      const normalizedDiff = Math.min(diff, 360 - diff);
      if (normalizedDiff < minDiff) {
        minDiff = normalizedDiff;
        closest = orient;
      }
    }
    
    return closest;
  }

  // =====================================================================
  // ANALYSE SOLAIRE
  // =====================================================================

  /**
   * Analyse l'ensoleillement des pièces.
   * @param {object} project
   * @returns {Array} — analyse par pièce
   */
  function analyzeSolarExposure(project) {
    const rooms = project.rooms || [];
    const walls = project.walls || [];
    
    return rooms.map(room => {
      const exposure = computeRoomSolarExposure(room, walls);
      const preference = ROOM_PREFERENCES[room.type] || ROOM_PREFERENCES.sejour;
      const optimalOrientation = ORIENTATIONS[preference.preferredOrientation];
      
      return {
        room: room.name || room.id,
        type: room.type,
        orientation: exposure.orientation,
        solarGain: exposure.solarGain,
        estimatedSunHours: exposure.sunHours,
        optimalOrientation: optimalOrientation.label,
        match: exposure.orientation === optimalOrientation.label,
        recommendation: generateSolarRecommendation(room, exposure, preference)
      };
    });
  }

  /**
   * Calcule l'exposition solaire d'une pièce.
   */
  function computeRoomSolarExposure(room, walls) {
    // Simplification : utilise les murs de la pièce
    const roomWalls = walls.filter(w => 
      w.from[0] >= (room.bounds?.xMin || 0) && 
      w.to[0] <= (room.bounds?.xMax || 10) &&
      w.from[1] >= (room.bounds?.zMin || 0) &&
      w.to[1] <= (room.bounds?.zMax || 10)
    );
    
    if (roomWalls.length === 0) {
      return { orientation: 'UNKNOWN', solarGain: 0, sunHours: 0 };
    }
    
    // Orientation dominante
    const angles = roomWalls.map(w => computeWallAngle(w));
    const avgAngle = angles.reduce((sum, a) => sum + a, 0) / angles.length;
    const orientation = angleToOrientation(avgAngle);
    
    // Gain solaire estimé
    const solarGain = orientation.solarGain;
    
    // Heures d'ensoleillement estimées (simplifié)
    const sunHours = solarGain * 8; // Max 8h en plein sud
    
    return {
      orientation: orientation.label,
      solarGain,
      sunHours: Math.round(sunHours * 10) / 10
    };
  }

  /**
   * Génère des recommandations solaires.
   */
  function generateSolarRecommendation(room, exposure, preference) {
    const recommendations = [];
    
    if (exposure.sunHours < preference.minSunHours) {
      recommendations.push(`Ensoleillement insuffisant (${exposure.sunHours}h < ${preference.minSunHours}h recommandées)`);
    }
    
    if (exposure.orientation !== ORIENTATIONS[preference.preferredOrientation].label) {
      recommendations.push(`Orientation ${exposure.orientation} non optimale pour ${room.type} (préférer ${ORIENTATIONS[preference.preferredOrientation].label})`);
    }
    
    if (exposure.solarGain > 0.8 && room.type === 'chambre') {
      recommendations.push('Surchauffe estivale possible : prévoir protections solaires');
    }
    
    return recommendations;
  }

  // =====================================================================
  // ANALYSE VENTILATION
  // =====================================================================

  /**
   * Analyse la ventilation naturelle.
   * @param {object} project
   * @returns {object} — analyse ventilation
   */
  function analyzeNaturalVentilation(project) {
    const rooms = project.rooms || [];
    const walls = project.walls || [];
    
    // Chercher des ouvertures opposées (ventilation traversante)
    let crossVentilationCount = 0;
    let singleVentilationCount = 0;
    
    for (const room of rooms) {
      const openings = findRoomOpenings(room, walls);
      
      if (openings.length >= 2) {
        // Vérifier si les ouvertures sont sur des murs opposés
        const hasCrossVentilation = checkCrossVentilation(openings);
        if (hasCrossVentilation) {
          crossVentilationCount++;
        } else {
          singleVentilationCount++;
        }
      } else if (openings.length === 1) {
        singleVentilationCount++;
      }
    }
    
    const totalRooms = rooms.length;
    const crossVentilationRatio = totalRooms > 0 ? crossVentilationCount / totalRooms : 0;
    
    return {
      crossVentilationCount,
      singleVentilationCount,
      noVentilationCount: totalRooms - crossVentilationCount - singleVentilationCount,
      crossVentilationRatio: Math.round(crossVentilationRatio * 100),
      recommendation: generateVentilationRecommendation(crossVentilationRatio)
    };
  }

  /**
   * Trouve les ouvertures d'une pièce.
   */
  function findRoomOpenings(room, walls) {
    const openings = [];
    
    for (const wall of walls) {
      if (wall.openings && wall.openings.length > 0) {
        // Vérifier si le mur appartient à la pièce
        const wallInRoom = 
          wall.from[0] >= (room.bounds?.xMin || 0) && 
          wall.to[0] <= (room.bounds?.xMax || 10);
        
        if (wallInRoom) {
          openings.push(...wall.openings);
        }
      }
    }
    
    return openings;
  }

  /**
   * Vérifie si les ouvertures permettent une ventilation traversante.
   */
  function checkCrossVentilation(openings) {
    // Simplification : vérifie si les ouvertures sont sur des côtés opposés
    // En réalité, il faudrait analyser la géométrie des murs
    return openings.length >= 2;
  }

  /**
   * Génère des recommandations de ventilation.
   */
  function generateVentilationRecommendation(ratio) {
    if (ratio >= 0.7) {
      return 'Bonne ventilation naturelle traversante';
    } else if (ratio >= 0.4) {
      return 'Ventilation acceptable, mais peut être améliorée';
    } else {
      return 'Ventilation insuffisante : ajouter des ouvertures opposées';
    }
  }

  // =====================================================================
  // ANALYSE INERTIE THERMIQUE
  // =====================================================================

  /**
   * Analyse l'inertie thermique du bâtiment.
   * @param {object} project
   * @returns {object} — analyse inertie
   */
  function analyzeThermalInertia(project) {
    const walls = project.walls || [];
    const rooms = project.rooms || [];
    
    // Calcul simplifié basé sur les matériaux et surfaces
    let totalMass = 0;
    
    for (const wall of walls) {
      const length = Math.hypot(wall.to[0] - wall.from[0], wall.to[1] - wall.from[1]);
      const height = 2.5; // Hauteur standard
      const thickness = wall.thick || 0.2;
      const volume = length * height * thickness;
      
      // Densité moyenne (béton/brique)
      const density = 2000; // kg/m³
      totalMass += volume * density;
    }
    
    const totalArea = rooms.reduce((sum, r) => sum + (r.area || 0), 0);
    const massPerArea = totalArea > 0 ? totalMass / totalArea : 0;
    
    // Classification inertie
    let inertiaClass;
    if (massPerArea > 300) {
      inertiaClass = 'LOURDE';
    } else if (massPerArea > 150) {
      inertiaClass = 'MOYENNE';
    } else {
      inertiaClass = 'LÉGÈRE';
    }
    
    return {
      totalMass: Math.round(totalMass),
      totalArea: Math.round(totalArea),
      massPerArea: Math.round(massPerArea),
      inertiaClass,
      recommendation: generateInertiaRecommendation(inertiaClass)
    };
  }

  /**
   * Génère des recommandations d'inertie.
   */
  function generateInertiaRecommendation(inertiaClass) {
    switch (inertiaClass) {
      case 'LOURDE':
        return 'Bonne inertie thermique : régulation naturelle efficace';
      case 'MOYENNE':
        return 'Inertie moyenne : acceptable pour climat tempéré';
      case 'LÉGÈRE':
        return 'Inertie faible : envisager matériaux lourds (béton, pierre)';
      default:
        return 'Inertie non évaluée';
    }
  }

  // =====================================================================
  // ANALYSE COMPLÈTE
  // =====================================================================

  /**
   * Analyse bioclimatique complète.
   * @param {object} project
   * @returns {object} — rapport complet
   */
  function analyzeBioclimatic(project) {
    const orientation = computeBuildingOrientation(project);
    const solarExposure = analyzeSolarExposure(project);
    const ventilation = analyzeNaturalVentilation(project);
    const inertia = analyzeThermalInertia(project);
    
    // Score global (0-100)
    const scores = {
      orientation: orientation.confidence * 100,
      solar: solarExposure.reduce((sum, r) => sum + (r.match ? 100 : 50), 0) / Math.max(1, solarExposure.length),
      ventilation: ventilation.crossVentilationRatio,
      inertia: inertia.inertiaClass === 'LOURDE' ? 100 : inertia.inertiaClass === 'MOYENNE' ? 70 : 40
    };
    
    const globalScore = Math.round(
      scores.orientation * 0.2 +
      scores.solar * 0.3 +
      scores.ventilation * 0.3 +
      scores.inertia * 0.2
    );
    
    return {
      orientation,
      solarExposure,
      ventilation,
      inertia,
      scores,
      globalScore,
      summary: generateSummary(globalScore)
    };
  }

  /**
   * Génère un résumé de l'analyse.
   */
  function generateSummary(score) {
    if (score >= 80) {
      return 'Excellente performance bioclimatique';
    } else if (score >= 60) {
      return 'Bonne performance bioclimatique, quelques optimisations possibles';
    } else if (score >= 40) {
      return 'Performance bioclimatique moyenne, améliorations recommandées';
    } else {
      return 'Performance bioclimatique insuffisante, réorientation conseillée';
    }
  }

  // =====================================================================
  // EXPORT
  // =====================================================================

  return {
    // Orientation
    computeBuildingOrientation,
    computeWallAngle,
    angleToOrientation,
    
    // Solaire
    analyzeSolarExposure,
    computeRoomSolarExposure,
    
    // Ventilation
    analyzeNaturalVentilation,
    
    // Inertie
    analyzeThermalInertia,
    
    // Complet
    analyzeBioclimatic,
    
    // Constants
    ORIENTATIONS,
    ROOM_PREFERENCES
  };
})();

// Compatibilité Node.js
if (typeof module !== 'undefined' && module.exports) {
  module.exports = BioclimaticAnalysis;
}
