/**
 * MULTI-LEVEL ALIGNMENT — Recalage automatique des plans R+1
 * Aligne automatiquement l'étage sur le RDC via des points d'ancrage communs
 * (trémies, murs porteurs, colonnes) pour corriger les dérives de scan.
 * 
 * Algorithme ICP (Iterative Closest Point) simplifié :
 * 1. Identification des ancres communes (trémies, colonnes)
 * 2. Calcul de la transformation optimale (translation + rotation)
 * 3. Application de la transformation à tous les éléments de l'étage
 * 4. Validation du recalage (erreur résiduelle < seuil)
 * 
 * Compatible navigateur et Node.js (module.exports).
 */
const MultiLevelAlign = (() => {
  'use strict';

  // =====================================================================
  // GÉOMÉTRIE UTILITAIRE
  // =====================================================================

  /** Distance euclidienne entre deux points. */
  const dist = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);

  /** Centre géométrique d'un rectangle (trémie ou pièce). */
  function bboxCenter(obj) {
    return [(obj.xMin + obj.xMax) / 2, (obj.zMin + obj.zMax) / 2];
  }

  /** Angle entre deux vecteurs (radians). */
  function angleBetween(v1, v2) {
    return Math.atan2(v2[1], v2[0]) - Math.atan2(v1[1], v1[0]);
  }

  // =====================================================================
  // IDENTIFICATION DES POINTS D'ANCRAGE COMMUNS
  // =====================================================================

  /**
   * Identifie les points d'ancrage communs entre deux niveaux.
   * Priorité : trémies d'escalier > colonnes > murs porteurs.
   * 
   * @param {object} level0 — données du RDC (stairwells, columns, walls)
   * @param {object} level1 — données de l'étage
   * @param {number} maxDistance — distance max pour considérer deux éléments comme communs (défaut 2m)
   * @returns {Array<{p0: number[], p1: number[], type: string}>} — paires d'ancres
   */
  function findCommonAnchors(level0, level1, maxDistance = 2.0) {
    const anchors = [];
    
    // 1. Trémies d'escalier (ancrage le plus fiable)
    const stairwells0 = Array.isArray(level0.stairwells) ? level0.stairwells : [];
    const stairwells1 = Array.isArray(level1.stairwells) ? level1.stairwells : [];
    
    for (const s0 of stairwells0) {
      const center0 = bboxCenter(s0);
      for (const s1 of stairwells1) {
        const center1 = bboxCenter(s1);
        if (dist(center0, center1) < maxDistance) {
          anchors.push({ p0: center0, p1: center1, type: 'stairwell' });
        }
      }
    }
    
    // 2. Colonnes structurelles
    const columns0 = Array.isArray(level0.columns) ? level0.columns : [];
    const columns1 = Array.isArray(level1.columns) ? level1.columns : [];
    
    for (const c0 of columns0) {
      const pos0 = [c0.x, c0.z];
      for (const c1 of columns1) {
        const pos1 = [c1.x, c1.z];
        if (dist(pos0, pos1) < maxDistance) {
          anchors.push({ p0: pos0, p1: pos1, type: 'column' });
        }
      }
    }
    
    // 3. Murs porteurs (intersections de façades)
    // Simplifié : utilise les extrémités des murs extérieurs
    const walls0 = (Array.isArray(level0.walls) ? level0.walls : [])
      .filter(w => w.type === 'ext' && Array.isArray(w.from) && Array.isArray(w.to));
    const walls1 = (Array.isArray(level1.walls) ? level1.walls : [])
      .filter(w => w.type === 'ext' && Array.isArray(w.from) && Array.isArray(w.to));
    
    // Extrait les extrémités des murs
    const endpoints0 = walls0.flatMap(w => [w.from, w.to]);
    const endpoints1 = walls1.flatMap(w => [w.from, w.to]);
    
    // Match les extrémités proches
    for (const e0 of endpoints0) {
      for (const e1 of endpoints1) {
        if (dist(e0, e1) < maxDistance) {
          anchors.push({ p0: e0, p1: e1, type: 'wall-endpoint' });
        }
      }
    }
    
    return anchors;
  }

  // =====================================================================
  // CALCUL DE LA TRANSFORMATION OPTIMALE (TRANSLATION + ROTATION)
  // =====================================================================

  /**
   * Calcule la transformation optimale (translation + rotation) pour aligner
   * les points de l'étage sur les points du RDC.
   * 
   * Utilise l'algorithme de Kabsch (moindres carrés) pour trouver la rotation
   * qui minimise l'erreur entre les paires de points homologues.
   * 
   * @param {Array<{p0: number[], p1: number[]}>} anchors — paires de points (p0 = RDC, p1 = étage)
   * @returns {{tx: number, tz: number, theta: number, error: number}} — transformation
   */
  function computeAlignment(anchors) {
    if (anchors.length < 2) {
      return { tx: 0, tz: 0, theta: 0, error: 0 };
    }
    
    // 1. Calcule les centres de masse
    const centroid0 = anchors.reduce((sum, a) => [sum[0] + a.p0[0], sum[1] + a.p0[1]], [0, 0])
      .map(v => v / anchors.length);
    const centroid1 = anchors.reduce((sum, a) => [sum[0] + a.p1[0], sum[1] + a.p1[1]], [0, 0])
      .map(v => v / anchors.length);
    
    // 2. Centre les points
    const centered = anchors.map(a => ({
      p0: [a.p0[0] - centroid0[0], a.p0[1] - centroid0[1]],
      p1: [a.p1[0] - centroid1[0], a.p1[1] - centroid1[1]]
    }));
    
    // 3. Calcule la matrice de covariance
    let cov00 = 0, cov01 = 0, cov10 = 0, cov11 = 0;
    for (const { p0, p1 } of centered) {
      cov00 += p1[0] * p0[0];
      cov01 += p1[0] * p0[1];
      cov10 += p1[1] * p0[0];
      cov11 += p1[1] * p0[1];
    }
    
    // 4. Calcule l'angle de rotation optimal (Kabsch simplifié pour 2D)
    const theta = Math.atan2(cov10 - cov01, cov00 + cov11);
    
    // 5. Calcule la translation
    const cos = Math.cos(theta);
    const sin = Math.sin(theta);
    const tx = centroid0[0] - (cos * centroid1[0] - sin * centroid1[1]);
    const tz = centroid0[1] - (sin * centroid1[0] + cos * centroid1[1]);
    
    // 6. Calcule l'erreur résiduelle
    let totalError = 0;
    for (const { p0, p1 } of anchors) {
      const aligned = applyTransform(p1, tx, tz, theta);
      totalError += dist(p0, aligned);
    }
    const error = totalError / anchors.length;
    
    return { tx, tz, theta, error };
  }

  // =====================================================================
  // APPLICATION DE LA TRANSFORMATION
  // =====================================================================

  /**
   * Applique une transformation (translation + rotation) à un point.
   * 
   * @param {number[]} point — [x, z]
   * @param {number} tx — translation X
   * @param {number} tz — translation Z
   * @param {number} theta — rotation (radians)
   * @returns {number[]} — point transformé [x, z]
   */
  function applyTransform(point, tx, tz, theta) {
    const cos = Math.cos(theta);
    const sin = Math.sin(theta);
    return [
      cos * point[0] - sin * point[1] + tx,
      sin * point[0] + cos * point[1] + tz
    ];
  }

  /**
   * Applique la transformation à tous les éléments d'un niveau.
   * 
   * @param {object} levelData — données de l'étage (walls, rooms, columns, etc.)
   * @param {{tx: number, tz: number, theta: number}} transform — transformation
   * @returns {object} — données transformées (nouvel objet, ne modifie pas l'original)
   */
  function applyAlignment(levelData, transform) {
    const { tx, tz, theta } = transform;
    
    // Clone profond pour ne pas modifier l'original
    const aligned = JSON.parse(JSON.stringify(levelData));
    
    // Transforme les murs
    if (Array.isArray(aligned.walls)) {
      for (const wall of aligned.walls) {
        if (Array.isArray(wall.from)) wall.from = applyTransform(wall.from, tx, tz, theta);
        if (Array.isArray(wall.to)) wall.to = applyTransform(wall.to, tx, tz, theta);
      }
    }
    
    // Transforme les pièces (polygones et bounds)
    if (Array.isArray(aligned.rooms)) {
      for (const room of aligned.rooms) {
        if (Array.isArray(room.poly)) {
          room.poly = room.poly.map(p => applyTransform(p, tx, tz, theta));
        }
        if (room.bounds) {
          const corners = [
            [room.bounds.xMin, room.bounds.zMin],
            [room.bounds.xMax, room.bounds.zMin],
            [room.bounds.xMax, room.bounds.zMax],
            [room.bounds.xMin, room.bounds.zMax]
          ].map(p => applyTransform(p, tx, tz, theta));
          
          room.bounds = {
            xMin: Math.min(...corners.map(p => p[0])),
            xMax: Math.max(...corners.map(p => p[0])),
            zMin: Math.min(...corners.map(p => p[1])),
            zMax: Math.max(...corners.map(p => p[1]))
          };
        }
      }
    }
    
    // Transforme les colonnes
    if (Array.isArray(aligned.columns)) {
      for (const col of aligned.columns) {
        if (typeof col.x === 'number' && typeof col.z === 'number') {
          const [newX, newZ] = applyTransform([col.x, col.z], tx, tz, theta);
          col.x = newX;
          col.z = newZ;
        }
      }
    }
    
    // Transforme les trémies
    if (Array.isArray(aligned.stairwells)) {
      for (const stairwell of aligned.stairwells) {
        const corners = [
          [stairwell.xMin, stairwell.zMin],
          [stairwell.xMax, stairwell.zMin],
          [stairwell.xMax, stairwell.zMax],
          [stairwell.xMin, stairwell.zMax]
        ].map(p => applyTransform(p, tx, tz, theta));
        
        stairwell.xMin = Math.min(...corners.map(p => p[0]));
        stairwell.xMax = Math.max(...corners.map(p => p[0]));
        stairwell.zMin = Math.min(...corners.map(p => p[1]));
        stairwell.zMax = Math.max(...corners.map(p => p[1]));
      }
    }
    
    // Transforme les meubles
    if (Array.isArray(aligned.furniture)) {
      for (const furn of aligned.furniture) {
        if (typeof furn.x === 'number' && typeof furn.z === 'number') {
          const [newX, newZ] = applyTransform([furn.x, furn.z], tx, tz, theta);
          furn.x = newX;
          furn.z = newZ;
          if (typeof furn.rotY === 'number') {
            furn.rotY += theta;
          }
        }
      }
    }
    
    return aligned;
  }

  // =====================================================================
  // VALIDATION DU RECALAGE
  // =====================================================================

  /**
   * Valide la qualité du recalage.
   * 
   * @param {{error: number, theta: number}} transform — transformation calculée
   * @param {number} maxError — erreur résiduelle max acceptable (défaut 0.10 m = 10 cm)
   * @param {number} maxRotation — rotation max acceptable (défaut 5° = 0.087 rad)
   * @returns {{valid: boolean, warnings: string[]}} — validation
   */
  function validateAlignment(transform, maxError = 0.10, maxRotation = 0.087) {
    const warnings = [];
    let valid = true;
    
    if (transform.error > maxError) {
      warnings.push(`Erreur résiduelle ${transform.error.toFixed(2)} m > ${(maxError * 100).toFixed(0)} cm — recalage imprécis`);
      valid = false;
    }
    
    if (Math.abs(transform.theta) > maxRotation) {
      const degrees = (transform.theta * 180 / Math.PI).toFixed(1);
      warnings.push(`Rotation ${degrees}° > 5° — décalage angulaire important (scan incliné ?)`);
      valid = false;
    }
    
    return { valid, warnings };
  }

  // =====================================================================
  // API PUBLIQUE
  // =====================================================================

  /**
   * Alignement complet d'un étage sur le RDC.
   * 
   * @param {object} level0 — données du RDC
   * @param {object} level1 — données de l'étage
   * @param {object} [options] — options (maxDistance, maxError, maxRotation)
   * @returns {{valid: boolean, transform: object, alignedLevel1: object, warnings: string[]}}
   */
  function alignLevels(level0, level1, options = {}) {
    const { maxDistance = 2.0, maxError = 0.10, maxRotation = 0.087 } = options;
    
    // 1. Identification des ancres
    const anchors = findCommonAnchors(level0, level1, maxDistance);
    
    if (anchors.length < 2) {
      return {
        valid: false,
        transform: null,
        alignedLevel1: level1,
        warnings: [`Seulement ${anchors.length} ancre(s) trouvée(s) — besoin d'au moins 2 pour le recalage`]
      };
    }
    
    // 2. Calcul de la transformation
    const transform = computeAlignment(anchors);
    
    // 3. Validation
    const validation = validateAlignment(transform, maxError, maxRotation);
    
    // 4. Application de la transformation
    const alignedLevel1 = applyAlignment(level1, transform);
    
    return {
      valid: validation.valid,
      transform,
      alignedLevel1,
      anchors,
      warnings: validation.warnings
    };
  }

  return {
    alignLevels,
    findCommonAnchors,
    computeAlignment,
    applyTransform,
    applyAlignment,
    validateAlignment
  };
})();

if (typeof module !== 'undefined') module.exports = MultiLevelAlign;
