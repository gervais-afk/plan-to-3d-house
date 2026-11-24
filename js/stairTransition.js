/**
 * STAIR TRANSITION — Transition caméra animée entre étages
 * Gère la transition fluide de la caméra entre le RDC et l'étage via une
 * trajectoire de Bézier qui évite les collisions avec la dalle et les murs.
 * 
 * Architecture :
 * 1. Détection de l'escalier (trémie + position)
 * 2. Génération de la trajectoire de Bézier (4 points de contrôle)
 * 3. Animation synchronisée (position + orientation + FOV)
 * 4. Gestion des collisions (raycast against walls)
 * 
 * Compatible navigateur (Three.js requis) et Node.js (module.exports).
 */
const StairTransition = (() => {
  'use strict';

  // =====================================================================
  // CONFIGURATION PAR DÉFAUT
  // =====================================================================

  const DEFAULTS = {
    animationDuration: 2000, // ms
    cameraHeight: 1.65, // hauteur des yeux (m)
    fovStart: 60, // FOV initial (degrés)
    fovEnd: 50, // FOV final (degrés)
    safeDistance: 0.5, // distance de sécurité aux murs (m)
    stairDepth: 0.28, // profondeur des marches (m)
    stairRise: 0.17, // hauteur des marches (m)
    landingClearance: 1.0 // dégagement au palier (m)
  };

  // =====================================================================
  // GÉOMÉTRIE UTILITAIRE
  // =====================================================================

  /** Distance euclidienne 3D entre deux points. */
  const dist3D = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);

  /** Interpolation linéaire entre deux valeurs. */
  const lerp = (a, b, t) => a + (b - a) * t;

  /** Bézier cubique pour un axe. */
  function bezier3(p0, p1, p2, p3, t) {
    const u = 1 - t;
    return u * u * u * p0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t * p3;
  }

  // =====================================================================
  // DÉTECTION DE L'ESCALIER
  // =====================================================================

  /**
   * Détecte l'escalier dans le projet et calcule ses paramètres géométriques.
   * 
   * @param {object} project — données du projet (stairwells, walls, config)
   * @param {number} fromLevel — niveau de départ (0 = RDC)
   * @param {number} toLevel — niveau d'arrivée (1 = étage)
   * @returns {object|null} — paramètres de l'escalier ou null si non trouvé
   */
  function detectStaircase(project, fromLevel = 0, toLevel = 1) {
    const stairwells = Array.isArray(project.stairwells) ? project.stairwells : [];
    
    // Cherche une trémie au niveau d'arrivée
    const stairwell = stairwells.find(s => s.level === toLevel);
    if (!stairwell) return null;
    
    // Dimensions de la trémie
    const width = Math.abs(stairwell.xMax - stairwell.xMin);
    const depth = Math.abs(stairwell.zMax - stairwell.zMin);
    
    // Centre de la trémie
    const centerX = (stairwell.xMin + stairwell.xMax) / 2;
    const centerZ = (stairwell.zMin + stairwell.zMax) / 2;
    
    // Hauteur totale
    const floorHeight = project.config?.floorHeight || 3.0;
    const totalHeight = floorHeight * (toLevel - fromLevel);
    
    // Nombre de marches
    const numSteps = Math.ceil(totalHeight / DEFAULTS.stairRise);
    
    // Détecte la direction de l'escalier (sens de montée)
    // Hypothèse : l'escalier monte dans le sens de la plus grande dimension
    const direction = depth > width ? 'z' : 'x';
    const sign = direction === 'z' ? Math.sign(stairwell.zMax - stairwell.zMin) : Math.sign(stairwell.xMax - stairwell.xMin);
    
    return {
      stairwell,
      centerX,
      centerZ,
      width,
      depth,
      totalHeight,
      numSteps,
      direction,
      sign
    };
  }

  // =====================================================================
  // GÉNÉRATION DE LA TRAJECTOIRE DE BÉZIER
  // =====================================================================

  /**
   * Génère une trajectoire de Bézier cubique pour la caméra.
   * 
   * Points de contrôle :
   * - P0 : position de départ (bas de l'escalier)
   * - P1 : point de contrôle 1 (inclinaison initiale)
   * - P2 : point de contrôle 2 (inclinaison finale)
   * - P3 : position d'arrivée (haut de l'escalier)
   * 
   * @param {object} staircase — paramètres de l'escalier
   * @param {number} fromLevel — niveau de départ
   * @param {number} toLevel — niveau d'arrivée
   * @returns {object} — trajectoire {P0, P1, P2, P3, startPoint, endPoint}
   */
  function generateBezierPath(staircase, fromLevel = 0, toLevel = 1) {
    const floorHeight = staircase.totalHeight / (toLevel - fromLevel);
    
    // P0 : position de départ (bas de l'escalier)
    const P0 = [
      staircase.centerX,
      DEFAULTS.cameraHeight + fromLevel * floorHeight,
      staircase.centerZ
    ];
    
    // P3 : position d'arrivée (haut de l'escalier)
    const P3 = [
      staircase.centerX,
      DEFAULTS.cameraHeight + toLevel * floorHeight,
      staircase.centerZ
    ];
    
    // P1 : point de contrôle 1 (début de la montée)
    // Décalé vers le bas pour créer une courbe progressive
    const P1 = [
      staircase.centerX,
      P0[1] + staircase.totalHeight * 0.3,
      staircase.centerZ
    ];
    
    // P2 : point de contrôle 2 (fin de la montée)
    // Décalé vers le haut pour amortir l'arrivée
    const P2 = [
      staircase.centerX,
      P3[1] - staircase.totalHeight * 0.3,
      staircase.centerZ
    ];
    
    return {
      P0, P1, P2, P3,
      startPoint: P0,
      endPoint: P3,
      totalHeight: staircase.totalHeight
    };
  }

  /**
   * Calcule la position de la caméra à un instant t ∈ [0, 1].
   * 
   * @param {object} path — trajectoire de Bézier
   * @param {number} t — temps normalisé (0 = début, 1 = fin)
   * @returns {number[]} — position [x, y, z]
   */
  function interpolatePosition(path, t) {
    const x = bezier3(path.P0[0], path.P1[0], path.P2[0], path.P3[0], t);
    const y = bezier3(path.P0[1], path.P1[1], path.P2[1], path.P3[1], t);
    const z = bezier3(path.P0[2], path.P1[2], path.P2[2], path.P3[2], t);
    return [x, y, z];
  }

  // =====================================================================
  // INTERPOLATION DE L'ORIENTATION
  // =====================================================================

  /**
   * Calcule l'orientation de la caméra (lookAt) à un instant t.
   * 
   * Stratégie : la caméra regarde toujours devant elle dans le sens de la montée,
   * avec une légère inclinaison vers le haut pour suivre l'escalier.
   * 
   * @param {object} path — trajectoire de Bézier
   * @param {number} t — temps normalisé
   * @param {object} staircase — paramètres de l'escalier
   * @returns {number[]} — point de regard [x, y, z]
   */
  function interpolateLookAt(path, t, staircase) {
    // Position actuelle
    const pos = interpolatePosition(path, t);
    
    // Direction de regard : légèrement devant et au-dessus
    const lookAhead = 1.0; // distance de regard devant (m)
    const lookUp = 0.3; // inclinaison vers le haut (m)
    
    // Vecteur directeur de l'escalier
    const dx = staircase.sign * (staircase.direction === 'x' ? 1 : 0) * lookAhead;
    const dz = staircase.sign * (staircase.direction === 'z' ? 1 : 0) * lookAhead;
    
    return [
      pos[0] + dx,
      pos[1] + lookUp,
      pos[2] + dz
    ];
  }

  // =====================================================================
  // INTERPOLATION DU FOV
  // =====================================================================

  /**
   * Calcule le FOV de la caméra à un instant t.
   * 
   * Stratégie : le FOV diminue progressivement pour créer un effet de zoom
   * qui guide l'attention vers le haut de l'escalier.
   * 
   * @param {number} t — temps normalisé
   * @returns {number} — FOV en degrés
   */
  function interpolateFOV(t) {
    return lerp(DEFAULTS.fovStart, DEFAULTS.fovEnd, t);
  }

  // =====================================================================
  // DÉTECTION DE COLLISIONS
  // =====================================================================

  /**
   * Vérifie si la trajectoire entre en collision avec les murs.
   * 
   * @param {object} path — trajectoire de Bézier
   * @param {Array} walls — liste des murs (avec from, to, thick)
   * @param {number} steps — nombre de points à tester (défaut 20)
   * @returns {object} — {collisions: boolean, points: Array}
   */
  function checkCollisions(path, walls, steps = 20) {
    const collisions = [];
    const margin = DEFAULTS.safeDistance;
    
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const pos = interpolatePosition(path, t);
      
      // Teste la distance à chaque mur
      for (const wall of walls) {
        if (!Array.isArray(wall.from) || !Array.isArray(wall.to)) continue;
        
        // Distance point-segment (ignorer l'axe Y pour simplifier)
        const dx = wall.to[0] - wall.from[0];
        const dz = wall.to[1] - wall.from[1];
        const len2 = dx * dx + dz * dz;
        
        if (len2 < 0.001) continue; // Mur trop court
        
        let t = ((pos[0] - wall.from[0]) * dx + (pos[2] - wall.from[1]) * dz) / len2;
        t = Math.max(0, Math.min(1, t));
        
        const closestX = wall.from[0] + t * dx;
        const closestZ = wall.from[1] + t * dz;
        const distToWall = Math.hypot(pos[0] - closestX, pos[2] - closestZ);
        
        const wallThickness = wall.thick || 0.2;
        const minDistance = wallThickness / 2 + margin;
        
        if (distToWall < minDistance) {
          collisions.push({
            t,
            position: pos,
            wall,
            distance: distToWall,
            minDistance
          });
        }
      }
    }
    
    return {
      collisions: collisions.length > 0,
      points: collisions
    };
  }

  // =====================================================================
  // ANIMATION
  // =====================================================================

  /**
   * Anime la transition de la caméra le long de la trajectoire.
   * 
   * @param {object} camera — caméra Three.js
   * @param {object} path — trajectoire de Bézier
   * @param {object} staircase — paramètres de l'escalier
   * @param {object} [options] — options (duration, onComplete, onProgress)
   * @returns {Promise} — résolution à la fin de l'animation
   */
  function animateTransition(camera, path, staircase, options = {}) {
    const {
      duration = DEFAULTS.animationDuration,
      onComplete = null,
      onProgress = null
    } = options;
    
    return new Promise((resolve) => {
      const startTime = performance.now();
      
      function animate() {
        const elapsed = performance.now() - startTime;
        const t = Math.min(1, elapsed / duration);
        
        // Position
        const pos = interpolatePosition(path, t);
        camera.position.set(pos[0], pos[1], pos[2]);
        
        // Orientation
        const lookAt = interpolateLookAt(path, t, staircase);
        camera.lookAt(lookAt[0], lookAt[1], lookAt[2]);
        
        // FOV
        camera.fov = interpolateFOV(t);
        camera.updateProjectionMatrix();
        
        // Callback de progression
        if (onProgress) {
          onProgress(t, pos, lookAt);
        }
        
        if (t < 1) {
          requestAnimationFrame(animate);
        } else {
          // Animation terminée
          if (onComplete) {
            onComplete();
          }
          resolve();
        }
      }
      
      animate();
    });
  }

  // =====================================================================
  // API PUBLIQUE
  // =====================================================================

  /**
   * Transition complète entre deux étages.
   * 
   * @param {object} camera — caméra Three.js
   * @param {object} project — données du projet
   * @param {number} fromLevel — niveau de départ
   * @param {number} toLevel — niveau d'arrivée
   * @param {object} [options] — options (duration, onComplete, onProgress)
   * @returns {Promise<object>} — {success: boolean, path: object, collisions: object}
   */
  async function transition(camera, project, fromLevel = 0, toLevel = 1, options = {}) {
    // 1. Détection de l'escalier
    const staircase = detectStaircase(project, fromLevel, toLevel);
    if (!staircase) {
      return { success: false, error: 'Aucun escalier détecté' };
    }
    
    // 2. Génération de la trajectoire
    const path = generateBezierPath(staircase, fromLevel, toLevel);
    
    // 3. Détection de collisions
    const walls = Array.isArray(project.walls) ? project.walls : [];
    const collisionCheck = checkCollisions(path, walls);
    
    if (collisionCheck.collisions) {
      return {
        success: false,
        error: 'Trajectoire en collision avec les murs',
        path,
        collisions: collisionCheck
      };
    }
    
    // 4. Animation
    await animateTransition(camera, path, staircase, options);
    
    return {
      success: true,
      path,
      staircase
    };
  }

  return {
    transition,
    detectStaircase,
    generateBezierPath,
    interpolatePosition,
    interpolateLookAt,
    interpolateFOV,
    checkCollisions,
    animateTransition,
    DEFAULTS
  };
})();

if (typeof module !== 'undefined') module.exports = StairTransition;
