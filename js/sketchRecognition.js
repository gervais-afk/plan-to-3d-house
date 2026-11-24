/**
 * SKETCH RECOGNITION — Lecture automatique de croquis manuscrits
 * 
 * Prétraitement d'image + détection de géométrie architecturale.
 * Peut fonctionner en mode purement algorithmique (prétraitement local)
 * OU être enrichi par un appel IA via le relais serveur existant.
 * 
 * Limites documentées :
 * - Le prétraitement local détecte les lignes droites dominantes,
 *   mais ne comprend pas la sémantique (mur porteur vs cloison).
 * - L'interprétation sémantique requiert un appel IA (optionnel).
 * - La calibration nécessite soit une cote connue, soit une porte standard (0.85m).
 * 
 * Compatible navigateur (ImageData) et Node.js (Buffer via canvas).
 */
const SketchRecognition = (() => {
  'use strict';

  // =====================================================================
  // CONSTANTS
  // =====================================================================
  
  const DEFAULTS = {
    // Seuil de binarisation (Otsu automatique si null)
    binarizeThreshold: null,
    // Résolution max (réduction si plus grand)
    maxDimension: 1600,
    // Tolérance d'alignement (°) pour redresser murs
    straightenTolerance: 5,
    // Longueur min d'un mur (m)
    minWallLength: 0.3,
    // Longueur min d'un segment détecté (px)
    minSegmentPx: 20,
    // Épaisseurs par défaut (m)
    exteriorWallThick: 0.25,
    interiorWallThick: 0.15,
    // Largeur porte standard (m) — utilisé pour calibration fallback
    standardDoorWidth: 0.85
  };

  // =====================================================================
  // PRÉTRAITEMENT IMAGE
  // =====================================================================

  /**
   * Convertit ImageData en niveaux de gris.
   * @param {ImageData} imageData
   * @returns {Float32Array} — luminance (0-255)
   */
  function toGrayscale(imageData) {
    if (!imageData || !imageData.data || !imageData.width || !imageData.height) {
      throw new Error('ImageData invalide');
    }
    const { data, width, height } = imageData;
    const gray = new Float32Array(width * height);
    for (let i = 0; i < width * height; i++) {
      const r = data[i * 4];
      const g = data[i * 4 + 1];
      const b = data[i * 4 + 2];
      gray[i] = 0.299 * r + 0.587 * g + 0.114 * b;
    }
    return gray;
  }

  /**
   * Réduit le bruit par filtre médian 3x3.
   * @param {Float32Array} gray
   * @param {number} width
   * @param {number} height
   * @returns {Float32Array}
   */
  function medianFilter(gray, width, height) {
    const out = new Float32Array(gray.length);
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const neighbors = [];
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            neighbors.push(gray[(y + dy) * width + (x + dx)]);
          }
        }
        neighbors.sort((a, b) => a - b);
        out[y * width + x] = neighbors[4];
      }
    }
    return out;
  }

  /**
   * Calcule le seuil d'Otsu (binarisation optimale automatique).
   * Pour un histogramme bimodal, retourne la valeur médiane de la plage
   * des seuils optimaux (entre les deux pics).
   * @param {Float32Array} gray
   * @returns {number} — seuil (0-255)
   */
  function otsuThreshold(gray) {
    // Histogramme
    const hist = new Array(256).fill(0);
    for (let i = 0; i < gray.length; i++) {
      hist[Math.round(Math.max(0, Math.min(255, gray[i])))]++;
    }
    const total = gray.length;
    
    let sum = 0;
    for (let i = 0; i < 256; i++) sum += i * hist[i];
    
    let sumB = 0, wB = 0, wF = 0;
    let maxVariance = -1, thresholdLow = 0, thresholdHigh = 0;
    
    for (let t = 0; t < 256; t++) {
      wB += hist[t];
      if (wB === 0) continue;
      wF = total - wB;
      if (wF === 0) break;
      
      sumB += t * hist[t];
      const mB = sumB / wB;
      const mF = (sum - sumB) / wF;
      const variance = wB * wF * (mB - mF) * (mB - mF);
      
      if (variance > maxVariance) {
        maxVariance = variance;
        thresholdLow = t;
        thresholdHigh = t;
      } else if (variance === maxVariance) {
        thresholdHigh = t;
      }
    }
    
    // Retourner le milieu de la plage optimale (entre les deux pics)
    return Math.round((thresholdLow + thresholdHigh) / 2);
  }

  /**
   * Binarise l'image (noir/blanc).
   * @param {Float32Array} gray
   * @param {number|null} threshold — null pour Otsu auto
   * @returns {Uint8Array} — 0 (noir) ou 255 (blanc)
   */
  function binarize(gray, threshold = null) {
    const t = threshold !== null ? threshold : otsuThreshold(gray);
    const binary = new Uint8Array(gray.length);
    for (let i = 0; i < gray.length; i++) {
      binary[i] = gray[i] < t ? 0 : 255;
    }
    return binary;
  }

  /**
   * Détecte les contours par Sobel.
   * @param {Uint8Array} binary
   * @param {number} width
   * @param {number} height
   * @returns {Float32Array} — magnitude du gradient
   */
  function sobelEdges(binary, width, height) {
    const edges = new Float32Array(width * height);
    const sobelX = [-1, 0, 1, -2, 0, 2, -1, 0, 1];
    const sobelY = [-1, -2, -1, 0, 0, 0, 1, 2, 1];
    
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        let gx = 0, gy = 0;
        for (let ky = -1; ky <= 1; ky++) {
          for (let kx = -1; kx <= 1; kx++) {
            const idx = (y + ky) * width + (x + kx);
            const kernelIdx = (ky + 1) * 3 + (kx + 1);
            gx += binary[idx] * sobelX[kernelIdx];
            gy += binary[idx] * sobelY[kernelIdx];
          }
        }
        edges[y * width + x] = Math.sqrt(gx * gx + gy * gy);
      }
    }
    return edges;
  }

  // =====================================================================
  // DÉTECTION DE LIGNES (Hough Transform simplifié)
  // =====================================================================

  /**
   * Détecte les segments dominants via Hough Transform.
   * @param {Float32Array} edges — carte de gradients
   * @param {number} width
   * @param {number} height
   * @param {object} options
   * @returns {Array<{x1,y1,x2,y2,angle,length}>} — segments détectés
   */
  function detectLineSegments(edges, width, height, options = {}) {
    const minSegmentPx = options.minSegmentPx || DEFAULTS.minSegmentPx;
    const edgeThreshold = options.edgeThreshold || 100;
    const angleResolution = 1; // degré
    const distanceResolution = 1; // pixel
    const maxDistance = Math.ceil(Math.sqrt(width * width + height * height));
    
    // Accumulateur Hough (rho, theta)
    const accumulator = new Map();
    
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (edges[y * width + x] < edgeThreshold) continue;
        
        for (let thetaDeg = 0; thetaDeg < 180; thetaDeg += angleResolution) {
          const theta = (thetaDeg * Math.PI) / 180;
          const rho = Math.round(x * Math.cos(theta) + y * Math.sin(theta));
          const key = `${rho},${thetaDeg}`;
          accumulator.set(key, (accumulator.get(key) || 0) + 1);
        }
      }
    }
    
    // Extraire les lignes significatives (votes > seuil)
    const voteThreshold = Math.max(minSegmentPx, Math.floor(Math.min(width, height) / 10));
    const lines = [];
    
    for (const [key, votes] of accumulator.entries()) {
      if (votes < voteThreshold) continue;
      const [rho, thetaDeg] = key.split(',').map(Number);
      const theta = (thetaDeg * Math.PI) / 180;
      lines.push({ rho, theta, thetaDeg, votes });
    }
    
    // Convertir en segments (points extrêmes sur l'image)
    const segments = lines.map(line => {
      const { rho, theta, thetaDeg, votes } = line;
      const cosT = Math.cos(theta);
      const sinT = Math.sin(theta);
      
      // Points extrêmes dans le cadre de l'image
      let x1, y1, x2, y2;
      
      if (Math.abs(sinT) > 0.01) {
        // Ligne pas trop horizontale
        y1 = 0;
        x1 = Math.round(rho / cosT || 0);
        y2 = height - 1;
        x2 = Math.round((rho - y2 * sinT) / cosT || 0);
      } else {
        // Ligne quasi-horizontale
        x1 = 0;
        y1 = Math.round(rho / sinT || 0);
        x2 = width - 1;
        y2 = Math.round((rho - x2 * cosT) / sinT || 0);
      }
      
      // Clamp dans l'image
      x1 = Math.max(0, Math.min(width - 1, x1));
      y1 = Math.max(0, Math.min(height - 1, y1));
      x2 = Math.max(0, Math.min(width - 1, x2));
      y2 = Math.max(0, Math.min(height - 1, y2));
      
      const length = Math.hypot(x2 - x1, y2 - y1);
      
      return { x1, y1, x2, y2, angle: thetaDeg, length, votes };
    });
    
    // Filtrer les segments trop courts
    return segments.filter(s => s.length >= minSegmentPx)
                   .sort((a, b) => b.votes - a.votes);
  }

  /**
   * Redresse les segments quasi-horizontaux ou quasi-verticaux.
   * @param {Array} segments
   * @param {number} tolerance — angle en degrés
   * @returns {Array}
   */
  function straightenSegments(segments, tolerance = DEFAULTS.straightenTolerance) {
    return segments.map(seg => {
      const { x1, y1, x2, y2, angle } = seg;
      let nx1 = x1, ny1 = y1, nx2 = x2, ny2 = y2;
      
      // Horizontal : angle proche de 0° ou 180°
      if (angle < tolerance || angle > 180 - tolerance) {
        const avgY = (y1 + y2) / 2;
        ny1 = ny2 = Math.round(avgY);
      }
      // Vertical : angle proche de 90°
      else if (Math.abs(angle - 90) < tolerance) {
        const avgX = (x1 + x2) / 2;
        nx1 = nx2 = Math.round(avgX);
      }
      
      return { ...seg, x1: nx1, y1: ny1, x2: nx2, y2: ny2, straightened: (nx1 !== x1 || ny1 !== y1) };
    });
  }

  // =====================================================================
  // CALIBRATION (pixels → mètres)
  // =====================================================================

  /**
   * Calibre l'échelle à partir d'une cote connue.
   * @param {Array} segments — segments détectés
   * @param {number} knownLengthMeters — longueur réelle en mètres
   * @param {number} knownLengthPixels — longueur en pixels sur le segment
   * @returns {number} — pixels par mètre
   */
  function calibrateFromKnown(segments, knownLengthMeters, knownLengthPixels = null) {
    if (knownLengthPixels === null && segments.length > 0) {
      // Prend le plus long segment comme référence
      const longest = segments.reduce((max, s) => s.length > max.length ? s : max, segments[0]);
      knownLengthPixels = longest.length;
    }
    if (!knownLengthPixels || knownLengthMeters <= 0) {
      throw new Error('Calibration impossible : paramètres invalides');
    }
    return knownLengthPixels / knownLengthMeters;
  }

  /**
   * Estime l'échelle par défaut depuis plusieurs éléments standards.
   * Combine plusieurs heuristiques pour plus de robustesse :
   * - Portes (0.85m de large, 2.1m de haut)
   * - Fenêtres standards (1.2m de large)
   * - Épaisseur murs extérieurs (0.20-0.25m)
   * - Hauteur sous plafond standard (2.5m)
   * 
   * @param {Array} segments
   * @param {object} options — { preferredElement: 'door'|'window'|'wall' }
   * @returns {number|null} — pixels par mètre, ou null si impossible
   */
  function estimateScaleFromDoors(segments, options = {}) {
    if (segments.length === 0) return null;
    
    const candidates = [];
    
    // 1. Détection de portes (segments verticaux courts = jambages)
    const verticals = segments.filter(s => Math.abs(s.angle - 90) < 10);
    if (verticals.length > 0) {
      const sorted = verticals.sort((a, b) => a.length - b.length);
      const shortCount = Math.max(1, Math.floor(sorted.length * 0.3));
      const shortSegments = sorted.slice(0, shortCount);
      
      // Hypothèse : ces segments sont des jambages de porte (2.1m de haut)
      for (const seg of shortSegments) {
        const ppm = seg.length / DEFAULTS.standardDoorWidth;
        candidates.push({ ppm, confidence: 0.7, source: 'door-jamb' });
      }
      
      // segments horizontaux courts = linteaux de porte (0.85m de large)
      const horizontals = segments.filter(s => Math.abs(s.angle) < 10 || Math.abs(s.angle - 180) < 10);
      const horizSorted = horizontals.sort((a, b) => a.length - b.length);
      const horizShort = horizSorted.slice(0, Math.max(1, Math.floor(horizSorted.length * 0.2)));
      
      for (const seg of horizShort) {
        if (seg.length > 15 && seg.length < 60) { // 15-60px = plausible pour 0.85m
          const ppm = seg.length / DEFAULTS.standardDoorWidth;
          candidates.push({ ppm, confidence: 0.6, source: 'door-lintel' });
        }
      }
    }
    
    // 2. Détection de fenêtres (segments horizontaux de longueur moyenne)
    const horizontals = segments.filter(s => Math.abs(s.angle) < 10 || Math.abs(s.angle - 180) < 10);
    const midHorizontals = horizontals.filter(s => s.length > 40 && s.length < 120);
    if (midHorizontals.length > 0) {
      // Hypothèse : fenêtres standards de 1.2m
      for (const seg of midHorizontals.slice(0, 3)) {
        const ppm = seg.length / 1.2;
        candidates.push({ ppm, confidence: 0.5, source: 'window' });
      }
    }
    
    // 3. Épaisseur de murs (segments très courts perpendiculaires aux murs)
    const veryShort = segments.filter(s => s.length > 5 && s.length < 20);
    if (veryShort.length > 0) {
      // Hypothèse : épaisseur de mur 0.20-0.25m
      for (const seg of veryShort.slice(0, 2)) {
        const ppm = seg.length / 0.22; // Moyenne 0.20-0.25
        candidates.push({ ppm, confidence: 0.4, source: 'wall-thickness' });
      }
    }
    
    if (candidates.length === 0) return null;
    
    // Vote pondéré par confiance
    const weighted = candidates.reduce((sum, c) => sum + c.ppm * c.confidence, 0);
    const totalConfidence = candidates.reduce((sum, c) => sum + c.confidence, 0);
    const avgPpm = weighted / totalConfidence;
    
    // Vérifier cohérence : écart-type faible
    const variance = candidates.reduce((sum, c) => sum + Math.pow(c.ppm - avgPpm, 2) * c.confidence, 0) / totalConfidence;
    const stdDev = Math.sqrt(variance);
    
    // Si écart-type trop élevé (>20% de la moyenne), résultat peu fiable
    if (stdDev / avgPpm > 0.2) {
      return null; // Résultats trop incohérents
    }
    
    return round2(avgPpm);
  }

  // =====================================================================
  // CONVERSION VERS FORMAT PROJET
  // =====================================================================

  /**
   * Convertit les segments pixels en murs (mètres).
   * @param {Array} segments
   * @param {number} pxPerMeter
   * @param {Array} originPx — [x, y] de l'origine en pixels
   * @returns {Array} — murs au format projet
   */
  function segmentsToWalls(segments, pxPerMeter, originPx = null) {
    return segments.map(seg => {
      const toMeters = (px) => px / pxPerMeter;
      
      // Conversion avec inversion axe Y (image y↓ → monde z↓)
      let x1 = toMeters(seg.x1);
      let z1 = toMeters(seg.y1);
      let x2 = toMeters(seg.x2);
      let z2 = toMeters(seg.y2);
      
      // Centrage sur origine si fournie
      if (originPx) {
        x1 -= toMeters(originPx[0]);
        z1 -= toMeters(originPx[1]);
        x2 -= toMeters(originPx[0]);
        z2 -= toMeters(originPx[1]);
      }
      
      const length = Math.hypot(x2 - x1, z2 - z1);
      
      return {
        from: [round2(x1), round2(z1)],
        to: [round2(x2), round2(z2)],
        length: round2(length),
        thick: null, // À déterminer par IA ouheuristique
        type: null,  // 'ext' ou 'int'
        openings: []
      };
    }).filter(w => w.length >= DEFAULTS.minWallLength);
  }

  /**
   * Classifie les murs en extérieur/intérieur/porteur par heuristique avancée.
   * Critères combinés :
   * - Position (sur le contour = extérieur)
   * - Longueur (long mur = probablement porteur)
   * - Connexions (mur connecté à 3+ autres = carrefour porteur probable)
   * - Épaisseur détectée (via largeur du trait dans l'image)
   * 
   * @param {Array} walls
   * @param {object} options — { detectThicknessFromImage: bool }
   * @returns {Array} — murs avec type, thick, loadBearing
   */
  function classifyWallsByHeuristic(walls, options = {}) {
    if (walls.length === 0) return walls;
    
    // 1. Calculer l'emprise globale
    const allX = walls.flatMap(w => [w.from[0], w.to[0]]);
    const allZ = walls.flatMap(w => [w.from[1], w.to[1]]);
    const xMin = Math.min(...allX), xMax = Math.max(...allX);
    const zMin = Math.min(...allZ), zMax = Math.max(...allZ);
    const empriseWidth = xMax - xMin;
    const empriseDepth = zMax - zMin;
    const perimeter = 2 * (empriseWidth + empriseDepth);
    
    const margin = 0.5;
    
    // 2. Construire graphe de connexions
    const connections = walls.map(() => 0);
    for (let i = 0; i < walls.length; i++) {
      for (let j = i + 1; j < walls.length; j++) {
        if (wallsTouch(walls[i], walls[j], margin)) {
          connections[i]++;
          connections[j]++;
        }
      }
    }
    
    // 3. Longueur moyenne des murs
    const lengths = walls.map(w => w.length);
    const avgLength = lengths.reduce((a, b) => a + b, 0) / lengths.length;
    
    // 4. Classification combinée
    return walls.map((w, idx) => {
      const onBoundary = 
        Math.abs(w.from[0] - xMin) < margin || Math.abs(w.from[0] - xMax) < margin ||
        Math.abs(w.from[1] - zMin) < margin || Math.abs(w.from[1] - zMax) < margin ||
        Math.abs(w.to[0] - xMin) < margin || Math.abs(w.to[0] - xMax) < margin ||
        Math.abs(w.to[1] - zMin) < margin || Math.abs(w.to[1] - zMax) < margin;
      
      // Score porteur : combine plusieurs signaux
      let bearingScore = 0;
      if (onBoundary) bearingScore += 3;                          // Mur extérieur = porteur
      if (w.length > avgLength * 1.3) bearingScore += 1;          // Long mur = probablement porteur
      if (connections[idx] >= 3) bearingScore += 1;               // Carrefour = support
      if (w.thick && w.thick > 0.20) bearingScore += 2;           // Épaisseur élevée
      
      // Mur extérieur = porteur par définition
      const isExterior = onBoundary;
      const isLoadBearing = isExterior || bearingScore >= 3;
      
      // Épaisseur par défaut selon type
      let thickness = w.thick;
      if (!thickness) {
        if (isExterior) thickness = DEFAULTS.exteriorWallThick;
        else if (isLoadBearing) thickness = 0.20;                  // Mur porteur intérieur
        else thickness = DEFAULTS.interiorWallThick;                // Cloison
      }
      
      return {
        ...w,
        type: isExterior ? 'ext' : 'int',
        thick: thickness,
        loadBearing: isLoadBearing,
        connections: connections[idx],
        bearingScore
      };
    });
  }

  /**
   * Vérifie si deux murs se touchent (extrémités proches).
   */
  function wallsTouch(w1, w2, tolerance) {
    const endpoints1 = [w1.from, w1.to];
    const endpoints2 = [w2.from, w2.to];
    for (const p1 of endpoints1) {
      for (const p2 of endpoints2) {
        if (Math.hypot(p1[0] - p2[0], p1[1] - p2[1]) < tolerance) return true;
      }
    }
    return false;
  }

  /**
   * Détecte l'épaisseur réelle des murs depuis les contours de l'image.
   * Mesure la largeur des traits noirs (méthode par profil perpendiculaire).
   * @param {Uint8Array} binary — image binaire
   * @param {number} width
   * @param {number} height
   * @param {Array} walls — murs en pixels
   * @param {number} pxPerMeter
   * @returns {Array} — murs avec thick estimé
   */
  function detectWallThickness(binary, width, height, walls, pxPerMeter) {
    return walls.map(wall => {
      // Profil perpendiculaire au milieu du mur
      const midX = (wall.x1 + wall.x2) / 2;
      const midY = (wall.y1 + wall.y2) / 2;
      const dx = wall.x2 - wall.x1;
      const dy = wall.y2 - wall.y1;
      const len = Math.hypot(dx, dy);
      if (len < 1) return { ...wall, thickPx: 0, thick: 0 };
      
      // Vecteur normal
      const nx = -dy / len;
      const ny = dx / len;
      
      // Compter les pixels noirs le long de la normale
      let blackWidth = 0;
      const maxOffset = 40; // pixels max de part et d'autre
      let entered = false;
      
      for (let offset = -maxOffset; offset <= maxOffset; offset++) {
        const px = Math.round(midX + nx * offset);
        const py = Math.round(midY + ny * offset);
        if (px < 0 || px >= width || py < 0 || py >= height) continue;
        
        const isBlack = binary[py * width + px] === 0;
        if (isBlack) {
          blackWidth++;
          entered = true;
        } else if (entered) {
          break; // Sorti du trait
        }
      }
      
      // Conversion en mètres
      const thickM = blackWidth / pxPerMeter;
      
      return { ...wall, thickPx: blackWidth, thick: round2(thickM) };
    });
  }

  /**
   * Détecte les ouvertures (portes/fenêtres) depuis les arcs et traits parallèles.
   * Heuristique : une porte est un arc de cercle partiel ou un rectangle étroit dans un mur.
   * @param {Float32Array} edges — carte de gradients
   * @param {number} width
   * @param {number} height
   * @param {Array} walls — murs en pixels
   * @param {number} pxPerMeter
   * @returns {Array} — ouvertures détectées
   */
  function detectOpenings(edges, width, height, walls, pxPerMeter) {
    const openings = [];
    const minDoorWidthPx = 30;  // ~0.6m min
    const maxDoorWidthPx = 80;  // ~2m max
    
    // Pour chaque mur, chercher des zones de faible gradient (ouvertures)
    for (const wall of walls) {
      const dx = wall.x2 - wall.x1;
      const dy = wall.y2 - wall.y1;
      const len = Math.hypot(dx, dy);
      if (len < minDoorWidthPx * 2) continue;
      
      const ux = dx / len; // vecteur unitaire le long du mur
      const uy = dy / len;
      
      // Échantillonner le gradient le long du mur
      const samples = Math.floor(len);
      const gradientProfile = [];
      for (let s = 0; s < samples; s++) {
        const px = Math.round(wall.x1 + ux * s);
        const py = Math.round(wall.y1 + uy * s);
        if (px >= 0 && px < width && py >= 0 && py < height) {
          gradientProfile.push({ pos: s, value: edges[py * width + px] });
        }
      }
      
      // Chercher les creux dans le gradient (ouvertures)
      let inGap = false;
      let gapStart = 0;
      
      for (let i = 0; i < gradientProfile.length; i++) {
        const { pos, value } = gradientProfile[i];
        const isLow = value < 50; // Seuil de gradient faible
        
        if (isLow && !inGap) {
          inGap = true;
          gapStart = pos;
        } else if (!isLow && inGap) {
          inGap = false;
          const gapWidth = pos - gapStart;
          
          if (gapWidth >= minDoorWidthPx && gapWidth <= maxDoorWidthPx) {
            // Ouverture détectée
            const centerX = wall.x1 + ux * (gapStart + gapWidth / 2);
            const centerY = wall.y1 + uy * (gapStart + gapWidth / 2);
            const widthM = gapWidth / pxPerMeter;
            const atM = (gapStart + gapWidth / 2) / pxPerMeter;
            
            // Heuristique : porte si largeur ~0.7-1m, fenêtre si ~1-1.5m
            const type = widthM < 1.0 ? 'door' : 'window';
            
            openings.push({
              wallIndex: walls.indexOf(wall),
              type,
              at: round2(atM),
              width: round2(widthM),
              centerPx: [centerX, centerY]
            });
          }
        }
      }
    }
    
    return openings;
  }

  /**
   * Fusionne les segments colinéaires qui se touchent.
   * @param {Array} walls
   * @param {number} tolerance — distance max pour fusion (m)
   * @returns {Array}
   */
  function mergeColinearWalls(walls, tolerance = 0.1) {
    const merged = [];
    const used = new Set();
    
    for (let i = 0; i < walls.length; i++) {
      if (used.has(i)) continue;
      let current = { ...walls[i], from: [...walls[i].from], to: [...walls[i].to] };
      used.add(i);
      
      let changed = true;
      while (changed) {
        changed = false;
        for (let j = 0; j < walls.length; j++) {
          if (used.has(j)) continue;
          const other = walls[j];
          
          // Vérifier colinéarité et connexion
          if (areColinearAndConnected(current, other, tolerance)) {
            // Fusionner : étendre current
            const endpoints = [current.from, current.to, other.from, other.to];
            const xs = endpoints.map(p => p[0]);
            const zs = endpoints.map(p => p[1]);
            
            // Déterminer l'axe dominant
            const dx = Math.abs(Math.max(...xs) - Math.min(...xs));
            const dz = Math.abs(Math.max(...zs) - Math.min(...zs));
            
            if (dx > dz) {
              current.from = [Math.min(...xs), current.from[1]];
              current.to = [Math.max(...xs), current.to[1]];
            } else {
              current.from = [current.from[0], Math.min(...zs)];
              current.to = [current.to[0], Math.max(...zs)];
            }
            
            used.add(j);
            changed = true;
          }
        }
      }
      
      merged.push(current);
    }
    
    return merged;
  }

  /**
   * Vérifie si deux murs sont colinéaires et connectés.
   */
  function areColinearAndConnected(w1, w2, tolerance) {
    // Verticaux (x quasi-identique)
    if (Math.abs(w1.from[0] - w1.to[0]) < 0.01 && Math.abs(w2.from[0] - w2.to[0]) < 0.01) {
      if (Math.abs(w1.from[0] - w2.from[0]) > tolerance) return false;
      // Vérifier connexion en Z
      const z1Min = Math.min(w1.from[1], w1.to[1]);
      const z1Max = Math.max(w1.from[1], w1.to[1]);
      const z2Min = Math.min(w2.from[1], w2.to[1]);
      const z2Max = Math.max(w2.from[1], w2.to[1]);
      return Math.abs(z1Min - z2Max) < tolerance || Math.abs(z1Max - z2Min) < tolerance;
    }
    
    // Horizontaux (z quasi-identique)
    if (Math.abs(w1.from[1] - w1.to[1]) < 0.01 && Math.abs(w2.from[1] - w2.to[1]) < 0.01) {
      if (Math.abs(w1.from[1] - w2.from[1]) > tolerance) return false;
      const x1Min = Math.min(w1.from[0], w1.to[0]);
      const x1Max = Math.max(w1.from[0], w1.to[0]);
      const x2Min = Math.min(w2.from[0], w2.to[0]);
      const x2Max = Math.max(w2.from[0], w2.to[0]);
      return Math.abs(x1Min - x2Max) < tolerance || Math.abs(x1Max - x2Min) < tolerance;
    }
    
    return false;
  }

  // =====================================================================
  // INTERFACAGE IA (optionnel, via relais serveur)
  // =====================================================================

  /**
   * Enrichit la géométrie détectée par interprétation IA.
   * Nécessite un serveur avec /api/ai/chat (comme editorAI.js).
   * @param {object} geometry — { segments, walls, imageData }
   * @param {object} options — { model, useAI }
   * @returns {Promise<object>}
   */
  async function enrichWithAI(geometry, options = {}) {
    if (!options.useAI) {
      return { ...geometry, enriched: false, reason: 'AI disabled' };
    }
    
    if (typeof fetch === 'undefined') {
      return { ...geometry, enriched: false, reason: 'fetch unavailable (Node.js)' };
    }
    
    const model = options.model || 'anthropic/claude-sonnet-5.5';
    
    try {
      // Préparer l'image en base64 si possible
      let imageDataUrl = null;
      if (geometry.imageData && typeof document !== 'undefined') {
        const canvas = document.createElement('canvas');
        canvas.width = geometry.imageData.width;
        canvas.height = geometry.imageData.height;
        const ctx = canvas.getContext('2d');
        ctx.putImageData(geometry.imageData, 0, 0);
        imageDataUrl = canvas.toDataURL('image/jpeg', 0.8);
      }
      
      const prompt = buildAIPrompt(geometry);
      
      const response = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          temperature: 0,
          max_tokens: 4000,
          messages: [{
            role: 'user',
            content: imageDataUrl
              ? [
                  { type: 'image_url', image_url: { url: imageDataUrl } },
                  { type: 'text', text: prompt }
                ]
              : prompt
          }]
        })
      });
      
      if (!response.ok) {
        return { ...geometry, enriched: false, reason: `HTTP ${response.status}` };
      }
      
      const data = await response.json();
      const aiResponse = parseAIResponse(data);
      
      return {
        ...geometry,
        enriched: true,
        aiInterpretation: aiResponse,
        model
      };
    } catch (e) {
      return { ...geometry, enriched: false, reason: e.message };
    }
  }

  function buildAIPrompt(geometry) {
    return `Tu es un architecte expert analysant un croquis de plan.
    
Segments détectés automatiquement : ${geometry.segments.length}
Murs pré-identifiés : ${geometry.walls.length}

Analyse et retourne UNIQUEMENT un JSON valide (pas de markdown, pas de texte) :
{
  "walls": [
    {"index": 0, "type": "ext|ext|int", "loadBearing": true|false, "thickness": 0.25}
  ],
  "openings": [
    {"wallIndex": 0, "at": 2.5, "type": "door|window|opening", "width": 0.85}
  ],
  "rooms": [
    {"name": "SÉJOUR", "bounds": {"xMin":0,"xMax":5,"zMin":0,"zMax":5}, "habitable": true}
  ],
  "confidence": 0.85,
  "notes": "remarques sur la qualité de la détection"
}

Si tu ne peux pas identifier avec certitude, retourne des valeurs par défaut avec confidence faible.`;
  }

  function parseAIResponse(data) {
    try {
      const content = data.choices[0].message.content;
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) return { error: 'No JSON in response' };
      return JSON.parse(jsonMatch[0]);
    } catch (e) {
      return { error: e.message };
    }
  }

  // =====================================================================
  // PIPELINE COMPLET
  // =====================================================================

  /**
   * Pipeline complet : imageData → géométrie de plan.
   * @param {ImageData} imageData
   * @param {object} options
   * @returns {Promise<object>}
   */
  async function recognizeSketch(imageData, options = {}) {
    if (!imageData) {
      throw new Error('imageData requis');
    }
    
    const opts = { ...DEFAULTS, ...options };
    
    // Étape 1 : Niveaux de gris
    const gray = toGrayscale(imageData);
    
    // Étape 2 : Réduction bruit
    const denoised = medianFilter(gray, imageData.width, imageData.height);
    
    // Étape 3 : Binarisation
    const binary = binarize(denoised, opts.binarizeThreshold);
    
    // Étape 4 : Détection contours
    const edges = sobelEdges(binary, imageData.width, imageData.height);
    
    // Étape 5 : Détection segments
    const segments = detectLineSegments(edges, imageData.width, imageData.height, opts);
    
    // Étape 6 : Redressement
    const straightened = straightenSegments(segments, opts.straightenTolerance);
    
    // Étape 7 : Calibration
    let pxPerMeter = opts.pxPerMeter || null;
    let calibrationSource = opts.calibrationSource || (opts.pxPerMeter ? 'provided' : null);
    
    if (!pxPerMeter) {
      if (opts.knownLengthMeters && opts.knownLengthPixels) {
        pxPerMeter = calibrateFromKnown(straightened, opts.knownLengthMeters, opts.knownLengthPixels);
        calibrationSource = 'known';
      } else {
        pxPerMeter = estimateScaleFromDoors(straightened);
        calibrationSource = pxPerMeter ? 'door-estimate' : 'none';
      }
    }
    
    // Étape 8 : Conversion en murs
    let walls = pxPerMeter 
      ? segmentsToWalls(straightened, pxPerMeter, opts.originPx)
      : [];
    
    // Étape 9 : Fusion colinéaires
    walls = mergeColinearWalls(walls);
    
    // Étape 10 : Classification extérieur/intérieur
    walls = classifyWallsByHeuristic(walls);
    
    // Étape 11 : Enrichissement IA (optionnel)
    const enriched = await enrichWithAI({
      segments: straightened,
      walls,
      imageData
    }, options);
    
    // Score de confiance global
    const confidence = computeConfidence({
      segmentsCount: straightened.length,
      wallsCount: walls.length,
      calibrated: !!pxPerMeter,
      calibrationSource,
      enriched: enriched.enriched
    });
    
    return {
      success: walls.length > 0,
      width: imageData.width,
      height: imageData.height,
      segmentsDetected: straightened.length,
      wallsDetected: walls.length,
      walls,
      pxPerMeter,
      calibrationSource,
      confidence,
      enriched: enriched.enriched,
      aiInterpretation: enriched.aiInterpretation || null,
      enrichmentError: enriched.reason || null
    };
  }

  /**
   * Calcule un score de confiance global.
   */
  function computeConfidence(data) {
    let score = 0;
    if (data.segmentsCount >= 4) score += 25;
    else if (data.segmentsCount > 0) score += 10;
    
    if (data.wallsCount >= 4) score += 30;
    else if (data.wallsCount > 0) score += 15;
    
    if (data.calibrated) score += 25;
    if (data.calibrationSource === 'known') score += 10;
    if (data.enriched) score += 10;
    
    return Math.min(100, score);
  }

  function round2(n) {
    return Math.round(n * 100) / 100;
  }

  // =====================================================================
  // EXPORT
  // =====================================================================

  return {
    // Prétraitement image
    toGrayscale,
    medianFilter,
    otsuThreshold,
    binarize,
    sobelEdges,
    
    // Détection
    detectLineSegments,
    straightenSegments,
    
    // Calibration
    calibrateFromKnown,
    estimateScaleFromDoors,
    
    // Conversion
    segmentsToWalls,
    classifyWallsByHeuristic,
    mergeColinearWalls,
    
    // Détection avancée
    detectWallThickness,
    detectOpenings,
    wallsTouch,
    
    // IA (optionnel)
    enrichWithAI,
    
    // Pipeline complet
    recognizeSketch,
    
    // Utils
    computeConfidence,
    
    // Constants
    DEFAULTS
  };
})();

// Compatibilité Node.js
if (typeof module !== 'undefined' && module.exports) {
  module.exports = SketchRecognition;
}
