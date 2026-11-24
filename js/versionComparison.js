/**
 * VERSION COMPARISON — Comparaison de versions de plans
 * 
 * Compare deux versions d'un projet et identifie les différences :
 * - Murs ajoutés/supprimés/modifiés
 * - Pièces ajoutées/supprimées/modifiées
 * - Surfaces modifiées
 * 
 * Compatible navigateur et Node.js.
 */
const VersionComparison = (() => {
  'use strict';

  // =====================================================================
  // COMPARAISON MURS
  // =====================================================================

  /**
   * Compare les murs entre deux versions.
   * @param {Array} walls1 — murs version 1
   * @param {Array} walls2 — murs version 2
   * @param {number} tolerance — tolérance positionnelle (m)
   * @returns {object} — { added, removed, modified, unchanged }
   */
  function compareWalls(walls1, walls2, tolerance = 0.1) {
    const added = [];
    const removed = [];
    const modified = [];
    const unchanged = [];

    // Marquer les murs de v2 qui correspondent à v1
    const matched = new Set();

    for (let i = 0; i < walls1.length; i++) {
      const w1 = walls1[i];
      let found = false;

      for (let j = 0; j < walls2.length; j++) {
        if (matched.has(j)) continue;

        const w2 = walls2[j];

        if (wallsMatch(w1, w2, tolerance)) {
          matched.add(j);
          found = true;

          // Vérifier modifications (épaisseur, type)
          if (hasWallChanges(w1, w2)) {
            modified.push({
              before: w1,
              after: w2,
              changes: detectWallChanges(w1, w2)
            });
          } else {
            unchanged.push(w1);
          }
          break;
        }
      }

      if (!found) {
        removed.push(w1);
      }
    }

    // Murs de v2 non matchés = ajoutés
    for (let j = 0; j < walls2.length; j++) {
      if (!matched.has(j)) {
        added.push(walls2[j]);
      }
    }

    return { added, removed, modified, unchanged };
  }

  /**
   * Vérifie si deux murs correspondent (même position).
   */
  function wallsMatch(w1, w2, tolerance) {
    // Vérifier dans les deux sens (from→from, to→to ou from→to, to→from)
    const direct = pointsMatch(w1.from, w2.from, tolerance) && 
                   pointsMatch(w1.to, w2.to, tolerance);
    const reversed = pointsMatch(w1.from, w2.to, tolerance) && 
                     pointsMatch(w1.to, w2.from, tolerance);
    
    return direct || reversed;
  }

  /**
   * Vérifie si deux points correspondent.
   */
  function pointsMatch(p1, p2, tolerance) {
    return Math.hypot(p1[0] - p2[0], p1[1] - p2[1]) < tolerance;
  }

  /**
   * Vérifie si un mur a des changements (épaisseur, type).
   */
  function hasWallChanges(w1, w2) {
    return w1.thick !== w2.thick || w1.type !== w2.type;
  }

  /**
   * Détecte les changements sur un mur.
   */
  function detectWallChanges(w1, w2) {
    const changes = [];

    if (w1.thick !== w2.thick) {
      changes.push({
        property: 'thickness',
        before: w1.thick,
        after: w2.thick
      });
    }

    if (w1.type !== w2.type) {
      changes.push({
        property: 'type',
        before: w1.type,
        after: w2.type
      });
    }

    return changes;
  }

  // =====================================================================
  // COMPARAISON PIÈCES
  // =====================================================================

  /**
   * Compare les pièces entre deux versions.
   * @param {Array} rooms1
   * @param {Array} rooms2
   * @param {number} tolerance
   * @returns {object} — { added, removed, modified, unchanged }
   */
  function compareRooms(rooms1, rooms2, tolerance = 0.1) {
    const added = [];
    const removed = [];
    const modified = [];
    const unchanged = [];

    const matched = new Set();

    for (let i = 0; i < rooms1.length; i++) {
      const r1 = rooms1[i];
      let found = false;

      for (let j = 0; j < rooms2.length; j++) {
        if (matched.has(j)) continue;

        const r2 = rooms2[j];

        if (roomsMatch(r1, r2, tolerance)) {
          matched.add(j);
          found = true;

          if (hasRoomChanges(r1, r2)) {
            modified.push({
              before: r1,
              after: r2,
              changes: detectRoomChanges(r1, r2)
            });
          } else {
            unchanged.push(r1);
          }
          break;
        }
      }

      if (!found) {
        removed.push(r1);
      }
    }

    for (let j = 0; j < rooms2.length; j++) {
      if (!matched.has(j)) {
        added.push(rooms2[j]);
      }
    }

    return { added, removed, modified, unchanged };
  }

  /**
   * Vérifie si deux pièces correspondent (même nom ou position similaire).
   */
  function roomsMatch(r1, r2, tolerance) {
    // Match par nom
    if (r1.name === r2.name) return true;
    if (r1.id === r2.id) return true;

    // Match par position (bounds similaires)
    if (r1.bounds && r2.bounds) {
      const boundsMatch = 
        Math.abs(r1.bounds.xMin - r2.bounds.xMin) < tolerance &&
        Math.abs(r1.bounds.xMax - r2.bounds.xMax) < tolerance &&
        Math.abs(r1.bounds.zMin - r2.bounds.zMin) < tolerance &&
        Math.abs(r1.bounds.zMax - r2.bounds.zMax) < tolerance;
      
      return boundsMatch;
    }

    return false;
  }

  /**
   * Vérifie si une pièce a des changements.
   */
  function hasRoomChanges(r1, r2) {
    if (r1.area !== r2.area) return true;
    if (r1.type !== r2.type) return true;
    if (r1.habitable !== r2.habitable) return true;

    // Vérifier bounds
    if (r1.bounds && r2.bounds) {
      const boundsChanged = 
        Math.abs(r1.bounds.xMin - r2.bounds.xMin) > 0.01 ||
        Math.abs(r1.bounds.xMax - r2.bounds.xMax) > 0.01 ||
        Math.abs(r1.bounds.zMin - r2.bounds.zMin) > 0.01 ||
        Math.abs(r1.bounds.zMax - r2.bounds.zMax) > 0.01;
      
      if (boundsChanged) return true;
    }

    return false;
  }

  /**
   * Détecte les changements sur une pièce.
   */
  function detectRoomChanges(r1, r2) {
    const changes = [];

    if (r1.area !== r2.area) {
      changes.push({
        property: 'area',
        before: r1.area,
        after: r2.area,
        delta: r2.area - r1.area
      });
    }

    if (r1.type !== r2.type) {
      changes.push({
        property: 'type',
        before: r1.type,
        after: r2.type
      });
    }

    if (r1.habitable !== r2.habitable) {
      changes.push({
        property: 'habitable',
        before: r1.habitable,
        after: r2.habitable
      });
    }

    if (r1.bounds && r2.bounds) {
      const boundsChanges = [];
      if (Math.abs(r1.bounds.xMin - r2.bounds.xMin) > 0.01) {
        boundsChanges.push('xMin');
      }
      if (Math.abs(r1.bounds.xMax - r2.bounds.xMax) > 0.01) {
        boundsChanges.push('xMax');
      }
      if (Math.abs(r1.bounds.zMin - r2.bounds.zMin) > 0.01) {
        boundsChanges.push('zMin');
      }
      if (Math.abs(r1.bounds.zMax - r2.bounds.zMax) > 0.01) {
        boundsChanges.push('zMax');
      }

      if (boundsChanges.length > 0) {
        changes.push({
          property: 'bounds',
          changes: boundsChanges
        });
      }
    }

    return changes;
  }

  // =====================================================================
  // CALCUL IMPACTS
  // =====================================================================

  /**
   * Calcule l'impact des modifications.
   * @param {object} wallComparison
   * @param {object} roomComparison
   * @returns {object} — impacts
   */
  function computeImpacts(wallComparison, roomComparison) {
    const impacts = {
      surfaceDelta: 0,
      wallLengthDelta: 0,
      roomCountDelta: 0
    };

    // Delta surface
    const addedArea = roomComparison.added.reduce((sum, r) => sum + (r.area || 0), 0);
    const removedArea = roomComparison.removed.reduce((sum, r) => sum + (r.area || 0), 0);
    impacts.surfaceDelta = addedArea - removedArea;

    // Modifications de surface
    for (const mod of roomComparison.modified) {
      const areaChange = mod.changes.find(c => c.property === 'area');
      if (areaChange) {
        impacts.surfaceDelta += areaChange.delta;
      }
    }

    // Delta longueur murs
    const addedLength = wallComparison.added.reduce((sum, w) => {
      return sum + Math.hypot(w.to[0] - w.from[0], w.to[1] - w.from[1]);
    }, 0);
    const removedLength = wallComparison.removed.reduce((sum, w) => {
      return sum + Math.hypot(w.to[0] - w.from[0], w.to[1] - w.from[1]);
    }, 0);
    impacts.wallLengthDelta = addedLength - removedLength;

    // Delta nombre de pièces
    impacts.roomCountDelta = roomComparison.added.length - roomComparison.removed.length;

    return impacts;
  }

  // =====================================================================
  // COMPARAISON COMPLÈTE
  // =====================================================================

  /**
   * Compare deux versions complètes d'un projet.
   * @param {object} project1
   * @param {object} project2
   * @param {object} options
   * @returns {object}
   */
  function compareVersions(project1, project2, options = {}) {
    const tolerance = options.tolerance || 0.1;

    // Comparer murs
    const wallComparison = compareWalls(
      project1.walls || [],
      project2.walls || [],
      tolerance
    );

    // Comparer pièces
    const roomComparison = compareRooms(
      project1.rooms || [],
      project2.rooms || [],
      tolerance
    );

    // Calculer impacts
    const impacts = computeImpacts(wallComparison, roomComparison);

    // Résumé
    const summary = {
      wallsAdded: wallComparison.added.length,
      wallsRemoved: wallComparison.removed.length,
      wallsModified: wallComparison.modified.length,
      roomsAdded: roomComparison.added.length,
      roomsRemoved: roomComparison.removed.length,
      roomsModified: roomComparison.modified.length,
      surfaceDelta: Math.round(impacts.surfaceDelta * 100) / 100,
      wallLengthDelta: Math.round(impacts.wallLengthDelta * 100) / 100,
      roomCountDelta: impacts.roomCountDelta
    };

    return {
      walls: wallComparison,
      rooms: roomComparison,
      impacts,
      summary
    };
  }

  // =====================================================================
  // GÉNÉRATION RAPPORT
  // =====================================================================

  /**
   * Génère un rapport lisible des différences.
   * @param {object} comparison — résultat de compareVersions
   * @returns {string}
   */
  function generateReport(comparison) {
    const lines = [];
    const s = comparison.summary;

    lines.push('=== RAPPORT DE COMPARAISON ===');
    lines.push('');

    // Murs
    lines.push(`Murs : +${s.wallsAdded} ajoutés, -${s.wallsRemoved} supprimés, ~${s.wallsModified} modifiés`);
    
    if (comparison.walls.added.length > 0) {
      lines.push('  Murs ajoutés :');
      comparison.walls.added.forEach(w => {
        const length = Math.hypot(w.to[0] - w.from[0], w.to[1] - w.from[1]);
        lines.push(`    - ${w.type || 'mur'} de ${length.toFixed(1)}m`);
      });
    }

    if (comparison.walls.removed.length > 0) {
      lines.push('  Murs supprimés :');
      comparison.walls.removed.forEach(w => {
        const length = Math.hypot(w.to[0] - w.from[0], w.to[1] - w.from[1]);
        lines.push(`    - ${w.type || 'mur'} de ${length.toFixed(1)}m`);
      });
    }

    lines.push('');

    // Pièces
    lines.push(`Pièces : +${s.roomsAdded} ajoutées, -${s.roomsRemoved} supprimées, ~${s.roomsModified} modifiées`);

    if (comparison.rooms.added.length > 0) {
      lines.push('  Pièces ajoutées :');
      comparison.rooms.added.forEach(r => {
        lines.push(`    - ${r.name || 'Pièce'} (${r.area || 0} m²)`);
      });
    }

    if (comparison.rooms.removed.length > 0) {
      lines.push('  Pièces supprimées :');
      comparison.rooms.removed.forEach(r => {
        lines.push(`    - ${r.name || 'Pièce'} (${r.area || 0} m²)`);
      });
    }

    if (comparison.rooms.modified.length > 0) {
      lines.push('  Pièces modifiées :');
      comparison.rooms.modified.forEach(m => {
        const areaChange = m.changes.find(c => c.property === 'area');
        if (areaChange) {
          const sign = areaChange.delta > 0 ? '+' : '';
          lines.push(`    - ${m.before.name || 'Pièce'} : ${sign}${areaChange.delta.toFixed(1)} m²`);
        }
      });
    }

    lines.push('');

    // Impacts
    lines.push('Impacts :');
    lines.push(`  Surface totale : ${s.surfaceDelta > 0 ? '+' : ''}${s.surfaceDelta} m²`);
    lines.push(`  Longueur murs : ${s.wallLengthDelta > 0 ? '+' : ''}${s.wallLengthDelta} m`);
    lines.push(`  Nombre de pièces : ${s.roomCountDelta > 0 ? '+' : ''}${s.roomCountDelta}`);

    return lines.join('\n');
  }

  // =====================================================================
  // EXPORT
  // =====================================================================

  return {
    // Comparaison
    compareWalls,
    compareRooms,
    compareVersions,

    // Utilitaires
    wallsMatch,
    roomsMatch,
    pointsMatch,

    // Détection changements
    hasWallChanges,
    hasRoomChanges,
    detectWallChanges,
    detectRoomChanges,

    // Impacts
    computeImpacts,
    generateReport
  };
})();

// Compatibilité Node.js
if (typeof module !== 'undefined' && module.exports) {
  module.exports = VersionComparison;
}
