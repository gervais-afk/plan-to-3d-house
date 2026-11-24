/**
 * AUTO-AMÉNAGEMENT DE PIÈCE
 * Place automatiquement les meubles selon les règles spatiales architecturales.
 * 
 * Normes appliquées :
 * - Mur hôte : pan le plus long sans ouverture (lit/canapé adossé)
 * - Circulation : 90 cm devant chaque porte (rayon de battement)
 * - Adossement : meuble collé au mur, centré sur le pan disponible
 * - Orientation : rotY aligné sur la normale du mur hôte
 * 
 * Compatible navigateur (<script>) et Node.js (module.exports).
 */
const AutoFurnish = (() => {
  'use strict';

  // =====================================================================
  // GÉOMÉTRIE UTILITAIRE
  // =====================================================================

  /** Distance d'un point à un segment [a, b]. */
  function pointToSegmentDist(p, a, b) {
    const dx = b[0] - a[0], dz = b[1] - a[1];
    const len2 = dx * dx + dz * dz;
    if (len2 < 1e-12) return Math.hypot(p[0] - a[0], p[1] - a[1]);
    let t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / len2;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dz));
  }

  /** Longueur d'un mur. */
  function wallLength(wall) {
    return Math.hypot(wall.to[0] - wall.from[0], wall.to[1] - wall.from[1]);
  }

  /** Normale sortante d'un mur (hypothèse : sens horaire des murs extérieurs). */
  function wallNormal(wall) {
    const dx = wall.to[0] - wall.from[0];
    const dz = wall.to[1] - wall.from[1];
    const len = Math.hypot(dx, dz);
    return [-dz / len, dx / len];
  }

  // =====================================================================
  // IDENTIFICATION DU MUR HÔTE IDÉAL
  // =====================================================================

  /**
   * Sélectionne le pan de mur le plus long sans ouverture, parmi les murs
   * adjacents à la pièce. Un mur est "sans ouverture" si aucune porte/fenêtre
   * n'est à moins de 50 cm de son centre.
   * 
   * @param {Array} walls — murs adjacents à la pièce
   * @param {Array} openings — ouvertures sur ces murs (avec .at, .w, .type)
   * @returns {object|null} — mur hôte idéal ou null
   */
  function findHostWall(walls, openings) {
    let best = null;
    let bestLen = 0;

    for (const wall of walls) {
      const len = wallLength(wall);
      if (len < 1.5) continue; // Pan trop court (< 1,5 m)

      // Vérifie si le mur a des ouvertures dans sa zone centrale
      const wallOpenings = (openings || []).filter(op => {
        const opCenter = op.at || 0;
        return Math.abs(opCenter - len / 2) < len / 2 - 0.3;
      });

      // Pénalité forte si ouverture dans le tiers central
      const hasCentralOpening = wallOpenings.length > 0;
      const effectiveLen = hasCentralOpening ? len * 0.3 : len;

      if (effectiveLen > bestLen) {
        bestLen = effectiveLen;
        best = wall;
      }
    }

    return best;
  }

  // =====================================================================
  // CALCUL DE LA POSITION ET ORIENTATION DU MEUBLE
  // =====================================================================

  /**
   * Calcule la position (x, z) et l'angle rotY pour placer un meuble
   * adossé à un mur hôte, centré sur le pan disponible.
   * 
   * @param {object} hostWall — mur hôte (from, to)
   * @param {object} furniture — meuble à placer (w, d, h)
   * @returns {{ x, z, rotY }}
   */
  function computeFurniturePlacement(hostWall, furniture) {
    // 1. Centre du mur hôte
    const midX = (hostWall.from[0] + hostWall.to[0]) / 2;
    const midZ = (hostWall.from[1] + hostWall.to[1]) / 2;

    // 2. Normale sortante du mur (direction vers l'intérieur de la pièce)
    const normal = wallNormal(hostWall);
    
    // 3. Position du meuble : centre du mur + décalage selon la normale
    //    Le meuble est adossé : son arrière touche le mur
    //    Donc son centre est décalé de (profondeur / 2) selon la normale
    const offset = furniture.d / 2;
    const x = midX + normal[0] * offset;
    const z = midZ + normal[1] * offset;

    // 4. Angle de rotation : alignement sur le mur
    //    rotY = angle de la normale du mur par rapport à l'axe Z
    const dx = hostWall.to[0] - hostWall.from[0];
    const dz = hostWall.to[1] - hostWall.from[1];
    const wallAngle = Math.atan2(dz, dx);
    const normalAngle = wallAngle + Math.PI / 2;
    const rotY = normalAngle + Math.PI; // On regarde vers l'intérieur

    return { x, z, rotY };
  }

  // =====================================================================
  // VÉRIFICATION DE LA CIRCULATION (90 cm devant les portes)
  // =====================================================================

  /**
   * Vérifie qu'un meuble placé ne bloque pas la circulation devant une porte.
   * Le rayon de battement d'une porte est de 90 cm (arc de cercle).
   * 
   * @param {object} furniture — meuble placé (x, z, w, d)
   * @param {Array} doors — portes avec { at, w, type }
   * @param {object} wall — mur supportant la porte
   * @returns {boolean} — true si la circulation est respectée
   */
  function checkCirculation(furniture, doors, wall) {
    const circulationRadius = 0.9;

    for (const door of doors) {
      if (door.type !== 'door') continue;
      
      // Centre de la porte sur le mur
      const wallLen = wallLength(wall);
      if (wallLen < 1e-6) continue;
      
      const doorCenter = [
        wall.from[0] + (door.at / wallLen) * (wall.to[0] - wall.from[0]),
        wall.from[1] + (door.at / wallLen) * (wall.to[1] - wall.from[1])
      ];

      // Distance entre le centre du meuble et le centre de la porte
      const dist = Math.hypot(furniture.x - doorCenter[0], furniture.z - doorCenter[1]);

      // Si le meuble est dans le rayon de battement, circulation bloquée
      if (dist < circulationRadius + Math.max(furniture.w, furniture.d) / 2) {
        return false;
      }
    }

    return true;
  }

  // =====================================================================
  // SÉLECTION DES MEUBLES SELON LE TYPE DE PIÈCE
  // =====================================================================

  /**
   * Sélectionne les meubles appropriés selon le nom de la pièce.
   * 
   * @param {string} roomName — nom de la pièce (ex: "CHAMBRE", "SÉJOUR")
   * @returns {Array} — liste de meubles à placer (avec priorités)
   */
  function selectFurnitureForRoom(roomName) {
    const name = (roomName || '').toLowerCase();
    
    // Bibliothèque de meubles
    const CATALOG = {
      lit_double_160: { name: 'Lit double 160', w: 1.6, d: 2.0, h: 0.5, color: '#d9d4cc' },
      lit_simple_90: { name: 'Lit simple 90', w: 0.9, d: 2.0, h: 0.5, color: '#d9d4cc' },
      chevet: { name: 'Chevet', w: 0.45, d: 0.4, h: 0.5, color: '#8a6a4a' },
      armoire: { name: 'Armoire', w: 1.2, d: 0.6, h: 2.2, color: '#efebe4' },
      canape_3: { name: 'Canapé 3 places', w: 1.8, d: 0.9, h: 0.8, color: '#6b6560' },
      canape_2: { name: 'Canapé 2 places', w: 1.5, d: 0.9, h: 0.8, color: '#6b6560' },
      table_basse: { name: 'Table basse', w: 1.2, d: 0.6, h: 0.4, color: '#967856' },
      meuble_tv: { name: 'Meuble TV', w: 1.8, d: 0.45, h: 0.5, color: '#2b2c2e' },
      table_manger: { name: 'Table à manger', w: 0.9, d: 1.8, h: 0.76, color: '#8a6a4a' },
      chaise: { name: 'Chaise', w: 0.45, d: 0.45, h: 0.9, color: '#2e2f31' },
      plan_travail: { name: 'Plan de travail', w: 2.4, d: 0.6, h: 0.9, color: '#3b3f44' },
      evier: { name: 'Évier inox', w: 0.7, d: 0.45, h: 0.03, elev: 0.9, color: '#a9adb1' },
      refrigerateur: { name: 'Réfrigérateur', w: 0.65, d: 0.65, h: 1.85, color: '#d7d9db' },
      cuvette_wc: { name: 'Cuvette WC', w: 0.4, d: 0.62, h: 0.42, color: '#f7f7f5' },
      lave_mains: { name: 'Lave-mains', w: 0.5, d: 0.35, h: 0.15, elev: 0.78, color: '#f7f7f5' },
      douche: { name: 'Douche', w: 0.9, d: 0.9, h: 0.05, color: '#e8ecee' },
      baignoire: { name: 'Baignoire', w: 1.7, d: 0.75, h: 0.55, color: '#f5f6f6' }
    };

    // Règles de sélection par type de pièce
    if (/chambre|bedroom/.test(name)) {
      return [
        { item: CATALOG.lit_double_160, priority: 'main' },
        { item: CATALOG.chevet, priority: 'secondary', count: 2 },
        { item: CATALOG.armoire, priority: 'secondary' }
      ];
    }
    
    if (/séjour|sejour|salon|living/.test(name)) {
      return [
        { item: CATALOG.canape_3, priority: 'main' },
        { item: CATALOG.table_basse, priority: 'secondary' },
        { item: CATALOG.meuble_tv, priority: 'secondary' }
      ];
    }
    
    if (/cuisine|kitchen/.test(name)) {
      return [
        { item: CATALOG.plan_travail, priority: 'main' },
        { item: CATALOG.evier, priority: 'secondary' },
        { item: CATALOG.refrigerateur, priority: 'secondary' }
      ];
    }
    
    if (/sdb|salle de bain|bathroom|eau/.test(name)) {
      return [
        { item: CATALOG.douche, priority: 'main' },
        { item: CATALOG.cuvette_wc, priority: 'secondary' },
        { item: CATALOG.lave_mains, priority: 'secondary' }
      ];
    }

    return [];
  }

  // =====================================================================
  // API PUBLIQUE
  // =====================================================================

  /**
   * Auto-aménagement complet d'une pièce.
   * 
   * @param {object} room — { name, bounds, poly?, floorType, habitable }
   * @param {Array} walls — murs adjacents à la pièce
   * @param {Array} openings — ouvertures sur ces murs
   * @returns {Array} — liste de meubles placés [{ name, x, z, w, d, h, rotY, color }]
   */
  function autoFurnishRoom(room, walls, openings) {
    const placed = [];
    
    // 1. Sélection des meubles selon le type de pièce
    const furnitureList = selectFurnitureForRoom(room.name);
    if (furnitureList.length === 0) return [];

    // 1b. Projection des ouvertures sur les murs (attribution automatique)
    //     Chaque ouverture est assignée au mur le plus proche
    const openingsPerWall = new Map();
    for (const wall of walls) openingsPerWall.set(wall, []);
    
    for (const op of (openings || [])) {
      let bestWall = null, bestDist = Infinity, bestAt = 0;
      for (const wall of walls) {
        const len = wallLength(wall);
        if (len < 1e-6) continue;
        // Calcule la position curviligne de l'ouverture sur ce mur
        // Si l'ouverture a déjà un .at, on l'utilise directement
        const opAt = typeof op.at === 'number' ? op.at : len / 2;
        const opPoint = [
          wall.from[0] + (opAt / len) * (wall.to[0] - wall.from[0]),
          wall.from[1] + (opAt / len) * (wall.to[1] - wall.from[1])
        ];
        const dist = pointToSegmentDist(opPoint, wall.from, wall.to);
        if (dist < bestDist) {
          bestDist = dist;
          bestWall = wall;
          bestAt = opAt;
        }
      }
      if (bestWall && bestDist < 1.0) {
        const wallLen = wallLength(bestWall);
        openingsPerWall.get(bestWall).push({ ...op, at: Math.min(bestAt, wallLen) });
      }
    }

    // 2. Identification du mur hôte idéal
    const hostWall = findHostWallAdvanced(walls, openingsPerWall);
    if (!hostWall) return [];

    // 3. Placement du meuble principal
    const mainFurniture = furnitureList.find(f => f.priority === 'main');
    if (mainFurniture) {
      const placement = computeFurniturePlacement(hostWall, mainFurniture.item);
      
      // Vérifie la circulation sur TOUS les murs (pas seulement le mur hôte)
      const allDoors = [];
      for (const [wall, wallOpenings] of openingsPerWall) {
        for (const op of wallOpenings) {
          if (op.type === 'door') allDoors.push({ ...op, wall });
        }
      }
      
      let circulationOk = true;
      for (const door of allDoors) {
        const wallLen = wallLength(door.wall);
        if (wallLen < 1e-6) continue;
        const doorCenter = [
          door.wall.from[0] + (door.at / wallLen) * (door.wall.to[0] - door.wall.from[0]),
          door.wall.from[1] + (door.at / wallLen) * (door.wall.to[1] - door.wall.from[1])
        ];
        const dist = Math.hypot(placement.x - doorCenter[0], placement.z - doorCenter[1]);
        if (dist < 0.9 + Math.max(mainFurniture.item.w, mainFurniture.item.d) / 2) {
          circulationOk = false;
          break;
        }
      }
      
      if (circulationOk) {
        placed.push({
          ...mainFurniture.item,
          x: Math.round(placement.x * 100) / 100,
          z: Math.round(placement.z * 100) / 100,
          rotY: Math.round(placement.rotY * 10000) / 10000,
          dims: 'local'
        });
      }
    }

    // 4. Placement des meubles secondaires (même mur hôte, décalés)
    const secondaryFurniture = furnitureList.filter(f => f.priority === 'secondary');
    for (const sec of secondaryFurniture) {
      const count = sec.count || 1;
      for (let i = 0; i < count; i++) {
        const offset = (i - (count - 1) / 2) * (sec.item.w + 0.3);
        const midX = (hostWall.from[0] + hostWall.to[0]) / 2 + offset;
        const midZ = (hostWall.from[1] + hostWall.to[1]) / 2;
        const normal = wallNormal(hostWall);
        
        const dx = hostWall.to[0] - hostWall.from[0];
        const dz = hostWall.to[1] - hostWall.from[1];
        const wallAngle = Math.atan2(dz, dx);
        const normalAngle = wallAngle + Math.PI / 2;
        const rotY = normalAngle + Math.PI;
        
        placed.push({
          ...sec.item,
          x: Math.round((midX + normal[0] * sec.item.d / 2) * 100) / 100,
          z: Math.round((midZ + normal[1] * sec.item.d / 2) * 100) / 100,
          rotY: Math.round(rotY * 10000) / 10000,
          dims: 'local'
        });
      }
    }

    return placed;
  }

  /**
   * Version avancée de findHostWall qui utilise les openings déjà projetés sur les murs.
   */
  function findHostWallAdvanced(walls, openingsPerWall) {
    let best = null;
    let bestLen = 0;

    for (const wall of walls) {
      const len = wallLength(wall);
      if (len < 1.5) continue;

      const wallOpenings = openingsPerWall.get(wall) || [];
      const hasCentralOpening = wallOpenings.some(op => {
        return Math.abs(op.at - len / 2) < len / 2 - 0.3;
      });

      const effectiveLen = hasCentralOpening ? len * 0.3 : len;

      if (effectiveLen > bestLen) {
        bestLen = effectiveLen;
        best = wall;
      }
    }

    return best;
  }

  return {
    autoFurnishRoom,
    findHostWall,
    computeFurniturePlacement,
    checkCirculation,
    selectFurnitureForRoom
  };
})();

if (typeof module !== 'undefined') module.exports = AutoFurnish;
