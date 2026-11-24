/**
 * VALIDATEUR TOPOLOGIQUE DES PLANS EXTRAITS PAR IA VISION
 * ======================================================
 *
 * Filtre les hallucinations courantes des modèles de vision (Claude, Gemini, GPT)
 * avant que le plan ne soit injecté dans l'éditeur 2D et la maquette 3D.
 *
 * Normes géométriques appliquées :
 * ─────────────────────────────────
 * 1. Fermeture de polygone   : seuil 10 cm (tolérance de lecture sur scan).
 * 2. Sommets distincts       : écart minimal 2 cm entre deux sommets consécutifs.
 * 3. Chevauchement de murs   : détection de segments colinéaires sur > 5 cm.
 * 4. Ratio pièces / emprise  : [0.60, 1.05] — en-dessous = pièces manquantes,
 *                              au-dessus = surfaces comptées en double.
 * 5. Adjacence mur / pièce   : tolérance 15 cm — un mur extérieur doit border
 *                              au moins une pièce close.
 *
 * Score de confiance (0–100) :
 *   -20 points par erreur bloquante, -5 points par avertissement (plafonné -30),
 *   bonus +5/+5 pour ≥3 / ≥5 pièces détectées, -15 si moins de 4 murs.
 *
 * Compatible navigateur (<script>) et Node.js (module.exports).
 * Aucune dépendance externe — uniquement des calculs géométriques purs.
 */
const AITopology = (() => {
  'use strict';

  // =====================================================================
  // GÉOMÉTRIE UTILITAIRE — aucune allocation inutile, tolérances explicites
  // =====================================================================

  /** Distance euclidienne entre deux points [x, z]. */
  const dist = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);

  /** Distance d'un point à un segment fini [a, b]. */
  function pointToSegmentDist(p, a, b) {
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const len2 = dx * dx + dy * dy;
    if (len2 < 1e-12) return dist(p, a);
    let t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2;
    t = Math.max(0, Math.min(1, t));
    return dist(p, [a[0] + t * dx, a[1] + t * dy]);
  }

  /** Distance d'un point à une ligne infinie passant par [a, b]. */
  function pointToLineDist(p, a, b) {
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const len = Math.hypot(dx, dy);
    if (len < 1e-9) return dist(p, a);
    return Math.abs((p[0] - a[0]) * dy - (p[1] - a[1]) * dx) / len;
  }

  /** Aire d'un polygone quelconque (formule de l'arpenteur, Shoelace). */
  function polygonArea(pts) {
    let s = 0;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      s += a[0] * b[1] - b[0] * a[1];
    }
    return Math.abs(s) / 2;
  }

  /** Point dans un polygone (algorithme du rayon horizontal). */
  function pointInPolygon(poly, x, z) {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, zi] = poly[i], [xj, zj] = poly[j];
      if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
    }
    return inside;
  }

  // =====================================================================
  // CONVERSION PIXELS → MÈTRES
  // =====================================================================

  /**
   * Convertit la sortie brute de l'IA (pixels) en mètres, en utilisant
   * l'échelle px_per_meter. Toutes les vérifications se font ensuite en mètres
   * pour que les seuils (10 cm, 5 cm, 15 cm) soient universels.
   */
  function toMeters(ai, ppm) {
    const m = v => v / ppm;
    return {
      walls: (ai.walls || []).filter(w =>
        Array.isArray(w) === false && Number.isFinite(w.x1) && Number.isFinite(w.y1)
        && Number.isFinite(w.x2) && Number.isFinite(w.y2)
        && Math.hypot(w.x2 - w.x1, w.y2 - w.y1) > 0
      ).map(w => ({
        a: [m(w.x1), m(w.y1)], b: [m(w.x2), m(w.y2)],
        kind: w.kind === 'exterior' ? 'ext' : 'int'
      })),
      rooms: (ai.rooms || []).map(r => ({
        name: String(r.name || ''),
        pts: Array.isArray(r.polygon) ? r.polygon.map(p => [m(p[0]), m(p[1])]) : [],
        floor: r.floor,
        habitable: r.habitable !== false
      })),
      openings: (ai.openings || []).map(o => ({
        kind: o.kind || 'opening',
        center: [m(o.x || 0), m(o.y || 0)],
        width: m(o.width || 0)
      })),
      columns: (ai.columns || []).map(c => ({
        center: [m(c.x || 0), m(c.y || 0)],
        size: m(c.size || 0)
      }))
    };
  }

  // =====================================================================
  // VÉRIFICATION 1 : ÉTANCHÉITÉ DES POLYGONES DE PIÈCES
  // =====================================================================

  /**
   * Chaque pièce doit former un polygone fermé :
   * - ≥ 3 sommets distincts (écart > 2 cm),
   * - dernier sommet relié au premier à 10 cm près.
   *
   * Si l'écart est entre 5 mm et 10 cm, auto-fermeture silencieuse.
   * Au-delà de 10 cm, erreur bloquante : fuite de surface.
   */
  function checkRoomPolygons(rooms, errors, warnings) {
    const cleaned = [];
    for (let i = 0; i < rooms.length; i++) {
      const r = rooms[i];
      const pts = r.pts;
      const label = r.name || `pièce ${i + 1}`;

      if (!Array.isArray(pts) || pts.length < 3) {
        errors.push(`Pièce « ${label} » : polygone invalide (${pts ? pts.length : 0} sommet(s), 3 minimum requis).`);
        continue;
      }

      // Élimination des sommets consécutifs confondus (< 2 cm)
      const distinct = [pts[0]];
      for (let j = 1; j < pts.length; j++) {
        if (dist(pts[j], distinct[distinct.length - 1]) > 0.02) distinct.push(pts[j]);
      }

      if (distinct.length < 3) {
        errors.push(`Pièce « ${label} » : moins de 3 sommets distincts après nettoyage.`);
        continue;
      }

      // Contrôle de fermeture : le dernier sommet doit coïncider avec le premier
      // (convention des polygones fermés issus de l'IA vision).
      // Trois cas :
      //   • Écart < 2 cm   : déjà fermé, supprimer le doublon circulaire.
      //   • 2 cm < écart < 10 cm : auto-fermeture + avertissement.
      //   • Écart > 10 cm  : fuite de surface, polygone rejeté.
      const closureGap = dist(distinct[0], distinct[distinct.length - 1]);

      if (closureGap < 0.02) {
        // Déjà fermé (premier ≈ dernier), supprimer le doublon
        distinct.pop();
      } else if (closureGap <= 0.10) {
        // Tolérable : auto-fermeture
        warnings.push(`Pièce « ${label} » : auto-fermeture du polygone (écart ${(closureGap * 100).toFixed(1)} cm, seuil 10 cm).`);
      } else {
        // Fuite de surface : le polygone ne se referme pas
        errors.push(`Pièce « ${label} » : polygone ouvert (écart ${closureGap.toFixed(2)} m > 10 cm). Fuite de surface probable — vérifier les angles.`);
        continue;
      }

      if (distinct.length < 3) {
        errors.push(`Pièce « ${label} » : moins de 3 sommets distincts après fermeture.`);
        continue;
      }

      cleaned.push(Object.assign({}, r, { pts: distinct }));
    }
    return cleaned;
  }

  // =====================================================================
  // VÉRIFICATION 2 : DOUBLONS ET CHEVAUCHEMENTS DE MURS
  // =====================================================================

  /**
   * Détecte deux murs dont les centres sont sur la même ligne (distance < 5 cm
   * à la ligne infinie) ET dont les projections sur l'axe se chevauchent de
   * plus de 5 cm. Le mur le plus court est retiré pour éviter la double
   * facturation de maçonnerie.
   *
   * Ne pas confondre avec deux faces opposées d'un mur : les centres extraits
   * par l'IA doivent coïncider (même axe), pas être parallèles décalés.
   */
  function checkWallOverlaps(walls, errors, warnings) {
    const cleaned = [];
    const removed = new Set();

    for (let i = 0; i < walls.length; i++) {
      if (removed.has(i)) continue;
      const wi = walls[i];
      const lenI = dist(wi.a, wi.b);
      if (lenI < 1e-6) { removed.add(i); continue; }

      for (let j = i + 1; j < walls.length; j++) {
        if (removed.has(j)) continue;
        const wj = walls[j];
        const lenJ = dist(wj.a, wj.b);
        if (lenJ < 1e-6) { removed.add(j); continue; }

        // Colinéarité : distance des 4 extrémités à la ligne de l'autre mur
        const d1 = pointToLineDist(wj.a, wi.a, wi.b);
        const d2 = pointToLineDist(wj.b, wi.a, wi.b);
        const d3 = pointToLineDist(wi.a, wj.a, wj.b);
        const d4 = pointToLineDist(wi.b, wj.a, wj.b);
        if (Math.max(d1, d2, d3, d4) > 0.05) continue;

        // Projection sur l'axe dominant du mur le plus long
        const ref = lenI >= lenJ ? wi : wj;
        const axis = Math.abs(ref.b[0] - ref.a[0]) >= Math.abs(ref.b[1] - ref.a[1]) ? 0 : 1;

        const projI = [wi.a[axis], wi.b[axis]].sort((a, b) => a - b);
        const projJ = [wj.a[axis], wj.b[axis]].sort((a, b) => a - b);
        const overlapLen = Math.min(projI[1], projJ[1]) - Math.max(projI[0], projJ[0]);

        if (overlapLen > 0.05) {
          // Retirer le plus court, garder le plus long
          if (lenI >= lenJ) {
            removed.add(j);
          } else {
            removed.add(i);
          }
          warnings.push(`Mur doublon retiré : chevauchement de ${overlapLen.toFixed(2)} m sur le même axe. Risque de double facturation évité.`);
          if (removed.has(i)) break;
        }
      }
      if (!removed.has(i)) cleaned.push(wi);
    }
    return cleaned;
  }

  // =====================================================================
  // VÉRIFICATION 3 : COUVERTURE GLOBALE (PIÈCES vs EMPRISE)
  // =====================================================================

  /**
   * Le ratio Σ(aires des pièces) / aire(Bounding Box des murs) doit être
   * dans [0.60, 1.05]. En-dessous : espaces non affectés ou pièces oubliées.
   * Au-dessus : surfaces comptées en double (chevauchement de pièces).
   *
   * Ce ratio est adimensionnel : il fonctionne aussi bien en pixels qu'en mètres.
   */
  function checkGlobalCoverage(walls, rooms, errors, warnings) {
    if (!walls.length || !rooms.length) return;

    const xs = [], zs = [];
    for (const w of walls) {
      xs.push(w.a[0], w.b[0]);
      zs.push(w.a[1], w.b[1]);
    }
    const bboxW = Math.max(...xs) - Math.min(...xs);
    const bboxH = Math.max(...zs) - Math.min(...zs);
    const bboxArea = bboxW * bboxH;
    if (bboxArea < 1) return; // emprise trop petite pour être significative

    const roomAreaSum = rooms.reduce((s, r) => s + polygonArea(r.pts), 0);
    const ratio = roomAreaSum / bboxArea;

    if (ratio < 0.60) {
      errors.push(`Couverture insuffisante : Σ pièces / emprise = ${(ratio * 100).toFixed(0)} % (minimum 60 %). Pièces manquantes ou mal délimitées.`);
    } else if (ratio > 1.05) {
      errors.push(`Chevauchement de pièces : Σ pièces / emprise = ${(ratio * 100).toFixed(0)} % (maximum 105 %). Surfaces comptées en double.`);
    } else if (ratio < 0.75) {
      warnings.push(`Couverture modérée : ${(ratio * 100).toFixed(0)} % de l'emprise. Espaces non affectés probables (circulations, murs épais).`);
    }
  }

  // =====================================================================
  // VÉRIFICATION 4 : ADJACENCE MURS EXTÉRIEURS / PIÈCES
  // =====================================================================

  /**
   * Chaque mur extérieur doit être adjacent à au moins une pièce close.
   * Un mur « flottant » (non bordé par une pièce) est souvent une
   * hallucination : ligne de cote confondue avec un mur, mur de clôture
   * intérieur, ou bruit de scan.
   *
   * Tolérance : 15 cm — le milieu du mur doit être à moins de 15 cm
   * d'une arête de pièce ou à l'intérieur d'une pièce.
   */
  function checkWallRoomAdjacency(walls, rooms, errors, warnings) {
    const extWalls = walls.filter(w => w.kind === 'ext');
    const tolerance = 0.15;
    let isolatedCount = 0;

    for (const w of extWalls) {
      const mid = [(w.a[0] + w.b[0]) / 2, (w.a[1] + w.b[1]) / 2];
      let adjacent = false;

      for (const room of rooms) {
        const pts = room.pts;
        if (pts.length < 3) continue;
        // Test d'adjacence : milieu proche d'une arête de la pièce
        for (let j = 0; j < pts.length; j++) {
          if (pointToSegmentDist(mid, pts[j], pts[(j + 1) % pts.length]) < tolerance) {
            adjacent = true;
            break;
          }
        }
        if (adjacent) break;
        // Ou milieu à l'intérieur de la pièce
        if (pointInPolygon(pts, mid[0], mid[1])) { adjacent = true; break; }
      }

      if (!adjacent) isolatedCount++;
    }

    if (isolatedCount > 0) {
      const msg = `${isolatedCount} mur(s) extérieur(s) non adjacent(s) à une pièce close — possibles hallucinations (lignes de cote, bruit de scan).`;
      if (isolatedCount > extWalls.length * 0.3) {
        errors.push(msg);
      } else {
        warnings.push(msg);
      }
    }
  }

  // =====================================================================
  // VÉRIFICATION 5 : SCORE DE CONFIANCE GLOBAL
  // =====================================================================

  function computeScore(errors, warnings, rooms, walls) {
    let score = 100;
    score -= errors.length * 20;                           // -20 par erreur
    score -= Math.min(warnings.length * 5, 30);            // -5 par alerte, plafonné -30
    if (rooms.length >= 3) score += 5;                     // bonus pièces détectées
    if (rooms.length >= 5) score += 5;
    if (walls.length < 4) score -= 15;                     // trop peu de murs
    return Math.max(0, Math.min(100, score));
  }

  // =====================================================================
  // API PUBLIQUE
  // =====================================================================

  /**
   * Valide la sortie brute de l'IA vision.
   *
   * @param {object} aiOutput — JSON extrait par l'IA (coordonnées en pixels)
   *   { walls, rooms, openings, columns, scale: { px_per_meter, reference } }
   * @param {number} [ppm] — pixels par mètre (prioritaire sur aiOutput.scale)
   * @returns {{ valid: boolean, score: number, errors: string[], warnings: string[],
   *             cleanedGeometry: object|null }}
   */
  function validate(aiOutput, ppm) {
    const errors = [];
    const warnings = [];

    // Résolution de l'échelle : paramètre explicite > champ IA > échelle estimée
    let pxPerMeter = ppm || (aiOutput.scale && aiOutput.scale.px_per_meter) || 0;
    if (!Number.isFinite(pxPerMeter) || pxPerMeter <= 0) {
      return {
        valid: false, score: 0,
        errors: ['Échelle introuvable : calibrez le plan (touche K) puis relancez avec « Celle que j\'ai calibrée », ou vérifiez que le plan contient des cotes exploitables.'],
        warnings: [],
        cleanedGeometry: null
      };
    }

    // Conversion en mètres pour des seuils universels
    const m = toMeters(aiOutput, pxPerMeter);

    // 1. Étanchéité des polygones
    const cleanedRooms = checkRoomPolygons(m.rooms, errors, warnings);

    // 2. Doublons de murs
    const cleanedWalls = checkWallOverlaps(m.walls, errors, warnings);

    // 3. Emprise globale
    checkGlobalCoverage(cleanedWalls, cleanedRooms, errors, warnings);

    // 4. Adjacence murs / pièces
    checkWallRoomAdjacency(cleanedWalls, cleanedRooms, errors, warnings);

    // 5. Score de confiance
    const score = computeScore(errors, warnings, cleanedRooms, cleanedWalls);

    return {
      valid: errors.length === 0,
      score,
      errors,
      warnings,
      cleanedGeometry: {
        walls: cleanedWalls,
        rooms: cleanedRooms,
        openings: m.openings,
        columns: m.columns
      }
    };
  }

  return {
    validate,
    // Géométrie utilitaire exposée pour tests et intégration
    dist, pointToSegmentDist, pointToLineDist, polygonArea, pointInPolygon
  };
})();

if (typeof module !== 'undefined') module.exports = AITopology;
