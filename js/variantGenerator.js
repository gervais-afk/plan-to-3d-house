/**
 * VARIANT GENERATOR — Génération de variantes d'agencement par algorithme génétique
 * 
 * Génère plusieurs propositions d'agencement à partir d'un plan de base,
 * en respectant des contraintes architecturales (surfaces min, circulations, etc.).
 * 
 * Algorithme : génétique simple (sélection + croisement + mutation)
 * Pas d'IA requise — tout est calculé localement.
 * 
 * Compatible navigateur et Node.js.
 */
const VariantGenerator = (() => {
  'use strict';

  // =====================================================================
  // CONSTANTES ET RÈGLES ARCHITECTURALES
  // =====================================================================

  const RULES = {
    // Surfaces minimales (m²) par type de pièce
    minSurface: {
      sejour: 14,
      chambre: 9,
      cuisine: 7,
      sdb: 3.5,
      wc: 1.5,
      bureau: 6,
      default: 5
    },
    
    // Largeurs minimales de circulation (m)
    minCirculation: 0.9,
    
    // Hauteur standard sous plafond (m)
    defaultCeilingHeight: 2.5,
    
    // Ratio max circulations / surface totale
    maxCirculationRatio: 0.20
  };

  const DEFAULTS = {
    // Nombre de variantes à générer
    populationSize: 20,
    // Nombre de générations
    generations: 50,
    // Nombre de meilleures variantes à retourner
    topN: 5,
    // Taux de mutation (0-1)
    mutationRate: 0.15,
    // Amplitude max de déplacement (m)
    maxDisplacement: 1.5,
    // Grille de snapping (m)
    gridStep: 0.05
  };

  // =====================================================================
  // ANALYSE DU PLAN DE BASE
  // =====================================================================

  /**
   * Analyse le plan et identifie les éléments modifiables.
   * @param {object} project — { rooms, walls }
   * @returns {object}
   */
  function analyzeBasePlan(project) {
    const rooms = Array.isArray(project.rooms) ? project.rooms : [];
    const walls = Array.isArray(project.walls) ? project.walls : [];
    
    // Séparer murs porteurs (extérieurs) et cloisons (intérieurs)
    const loadBearing = walls.filter(w => w.type === 'ext');
    const partitions = walls.filter(w => w.type === 'int');
    
    // Calculer emprise globale
    const bounds = computeBounds(rooms);
    
    // Calculer surface totale
    const totalArea = rooms.reduce((sum, r) => sum + (r.area || computeRoomArea(r)), 0);
    
    return {
      rooms,
      loadBearing,
      partitions,
      bounds,
      totalArea,
      partitionCount: partitions.length,
      roomCount: rooms.length
    };
  }

  /**
   * Calcule l'emprise globale des pièces.
   */
  function computeBounds(rooms) {
    if (rooms.length === 0) return { xMin: 0, xMax: 10, zMin: 0, zMax: 10 };
    
    const allBounds = rooms.map(r => r.bounds || r.poly && polyToBounds(r.poly));
    const validBounds = allBounds.filter(Boolean);
    
    return {
      xMin: Math.min(...validBounds.map(b => b.xMin)),
      xMax: Math.max(...validBounds.map(b => b.xMax)),
      zMin: Math.min(...validBounds.map(b => b.zMin)),
      zMax: Math.max(...validBounds.map(b => b.zMax))
    };
  }

  function polyToBounds(poly) {
    const xs = poly.map(p => p[0]);
    const zs = poly.map(p => p[1]);
    return {
      xMin: Math.min(...xs),
      xMax: Math.max(...xs),
      zMin: Math.min(...zs),
      zMax: Math.max(...zs)
    };
  }

  /**
   * Calcule la surface d'une pièce.
   */
  function computeRoomArea(room) {
    if (room.area) return room.area;
    if (room.bounds) {
      return (room.bounds.xMax - room.bounds.xMin) * (room.bounds.zMax - room.bounds.zMin);
    }
    if (room.poly) {
      return polygonArea(room.poly);
    }
    return 0;
  }

  function polygonArea(poly) {
    let area = 0;
    for (let i = 0; i < poly.length; i++) {
      const j = (i + 1) % poly.length;
      area += poly[i][0] * poly[j][1];
      area -= poly[j][0] * poly[i][1];
    }
    return Math.abs(area / 2);
  }

  // =====================================================================
  // OPÉRATEURS DE MODIFICATION
  // =====================================================================

  /**
   * Déplace une cloison intérieure le long de son axe normal.
   * @param {object} wall — mur à déplacer
   * @param {number} delta — déplacement (m, positif ou négatif)
   * @returns {object} — nouveau mur
   */
  function displaceWall(wall, delta) {
    const dx = wall.to[0] - wall.from[0];
    const dz = wall.to[1] - wall.from[1];
    const len = Math.hypot(dx, dz);
    if (len < 0.001) return wall;
    
    // Normal au mur
    const nx = -dz / len;
    const nz = dx / len;
    
    return {
      ...wall,
      from: [
        snap(wall.from[0] + nx * delta),
        snap(wall.from[1] + nz * delta)
      ],
      to: [
        snap(wall.to[0] + nx * delta),
        snap(wall.to[1] + nz * delta)
      ],
      displaced: true,
      displacement: delta
    };
  }

  /**
   * Redimensionne une pièce en ajustant ses bornes.
   * @param {object} room
   * @param {object} delta — { xMin, xMax, zMin, zMax }
   * @returns {object}
   */
  function resizeRoom(room, delta) {
    if (!room.bounds) return room;
    
    const newBounds = {
      xMin: snap(room.bounds.xMin + (delta.xMin || 0)),
      xMax: snap(room.bounds.xMax + (delta.xMax || 0)),
      zMin: snap(room.bounds.zMin + (delta.zMin || 0)),
      zMax: snap(room.bounds.zMax + (delta.zMax || 0))
    };
    
    // Vérifier que la pièce reste positive
    if (newBounds.xMax - newBounds.xMin < 1 || newBounds.zMax - newBounds.zMin < 1) {
      return room;
    }
    
    return {
      ...room,
      bounds: newBounds,
      area: (newBounds.xMax - newBounds.xMin) * (newBounds.zMax - newBounds.zMin)
    };
  }

  /**
   * Fusionne deux pièces adjacentes.
   */
  function mergeRooms(room1, room2) {
    const b1 = room1.bounds;
    const b2 = room2.bounds;
    if (!b1 || !b2) return null;
    
    return {
      id: `${room1.id || 'r1'}_${room2.id || 'r2'}`,
      name: `${room1.name || 'Pièce 1'} + ${room2.name || 'Pièce 2'}`,
      bounds: {
        xMin: Math.min(b1.xMin, b2.xMin),
        xMax: Math.max(b1.xMax, b2.xMax),
        zMin: Math.min(b1.zMin, b2.zMin),
        zMax: Math.max(b1.zMax, b2.zMax)
      },
      type: room1.type,
      habitable: room1.habitable && room2.habitable
    };
  }

  /**
   * Scinde une pièce en deux.
   */
  function splitRoom(room, axis, position) {
    if (!room.bounds) return [room];
    const b = room.bounds;
    
    if (axis === 'x') {
      if (position <= b.xMin + 1 || position >= b.xMax - 1) return [room];
      return [
        { ...room, bounds: { ...b, xMax: position }, area: (position - b.xMin) * (b.zMax - b.zMin) },
        { ...room, id: `${room.id}_2`, name: `${room.name || 'Pièce'} (2)`, bounds: { ...b, xMin: position }, area: (b.xMax - position) * (b.zMax - b.zMin) }
      ];
    } else {
      if (position <= b.zMin + 1 || position >= b.zMax - 1) return [room];
      return [
        { ...room, bounds: { ...b, zMax: position }, area: (b.xMax - b.xMin) * (position - b.zMin) },
        { ...room, id: `${room.id}_2`, name: `${room.name || 'Pièce'} (2)`, bounds: { ...b, zMin: position }, area: (b.xMax - b.xMin) * (b.zMax - position) }
      ];
    }
  }

  // =====================================================================
  // FONCTION FITNESS (SCORE DE QUALITÉ)
  // =====================================================================

  /**
   * Évalue la qualité d'une variante.
   * Critères combinés :
   * - Conformité surfaces (critique)
   * - Absence de chevauchements (critique)
   * - Orientation solaire (bonus si séjour au sud)
   * - Regroupement plomberie (bonus si pièces d'eau adjacentes)
   * - Compacité circulations
   * - Proportions pièces
   * 
   * @param {object} variant — { rooms, walls }
   * @param {object} baseAnalysis — analyse du plan original
   * @param {object} options — { solarOrientation: 'N'|'S'|'E'|'W', plumbingGrouping: bool }
   * @returns {number} — score 0-100
   */
  function evaluateFitness(variant, baseAnalysis, options = {}) {
    const rooms = variant.rooms;
    if (rooms.length === 0) return 0;
    
    let score = 0;
    let hardViolations = 0;
    
    // 1. Conformité des surfaces (critique)
    for (const room of rooms) {
      const minRequired = RULES.minSurface[room.type] || RULES.minSurface.default;
      const area = room.area || computeRoomArea(room);
      
      if (area < minRequired) {
        hardViolations += (minRequired - area) / minRequired;
      } else {
        score += Math.min(10, (area - minRequired) / minRequired * 5);
      }
    }
    
    if (hardViolations > 0) return Math.max(0, 50 - hardViolations * 100);
    
    // 2. Détection de chevauchements (CRITIQUE)
    const overlaps = detectOverlaps(rooms);
    if (overlaps.length > 0) {
      return 0; // Rejet total si chevauchement
    }
    
    // 3. Orientation solaire (bonus si séjour orienté favorablement)
    if (options.solarOrientation) {
      const séjour = rooms.find(r => r.type === 'sejour');
      if (séjour && séjour.bounds) {
        const favorable = isFavorablyOriented(séjour.bounds, options.solarOrientation);
        if (favorable) score += 15;
      }
    }
    
    // 4. Regroupement plomberie (bonus si pièces d'eau adjacentes)
    if (options.plumbingGrouping !== false) {
      const plumbingRooms = rooms.filter(r => ['sdb', 'wc', 'cuisine'].includes(r.type));
      if (plumbingRooms.length >= 2) {
        const grouped = arePlumbingRoomsGrouped(plumbingRooms);
        if (grouped) score += 10;
      }
    }
    
    // 5. Compacité des circulations
    const totalArea = rooms.reduce((s, r) => s + (r.area || computeRoomArea(r)), 0);
    const bounds = variant.bounds || computeBounds(rooms);
    const empriseArea = (bounds.xMax - bounds.xMin) * (bounds.zMax - bounds.zMin);
    
    const efficiency = totalArea / empriseArea;
    if (efficiency > 0.85) score += 20;
    else if (efficiency > 0.75) score += 10;
    
    // 6. Ratio pièces habitables
    const habitableArea = rooms
      .filter(r => r.habitable !== false)
      .reduce((s, r) => s + (r.area || computeRoomArea(r)), 0);
    const habitableRatio = habitableArea / totalArea;
    if (habitableRatio > 0.8) score += 10;
    
    // 7. Proportions des pièces (éviter pièces trop étroites)
    for (const room of rooms) {
      if (!room.bounds) continue;
      const w = room.bounds.xMax - room.bounds.xMin;
      const d = room.bounds.zMax - room.bounds.zMin;
      const ratio = Math.min(w, d) / Math.max(w, d);
      if (ratio > 0.5) score += 2;
    }
    
    // 8. Similarité avec plan original (bonus stabilité)
    if (baseAnalysis.totalArea > 0) {
      const areaDiff = Math.abs(totalArea - baseAnalysis.totalArea) / baseAnalysis.totalArea;
      if (areaDiff < 0.1) score += 10;
      else if (areaDiff < 0.2) score += 5;
    }
    
    return Math.min(100, Math.max(0, score));
  }

  /**
   * Détecte les chevauchements entre pièces.
   * @param {Array} rooms
   * @returns {Array} — paires de pièces qui se chevauchent
   */
  function detectOverlaps(rooms) {
    const overlaps = [];
    
    for (let i = 0; i < rooms.length; i++) {
      for (let j = i + 1; j < rooms.length; j++) {
        const r1 = rooms[i];
        const r2 = rooms[j];
        
        if (!r1.bounds || !r2.bounds) continue;
        
        // Vérifier intersection AABB
        const intersect = 
          r1.bounds.xMin < r2.bounds.xMax &&
          r1.bounds.xMax > r2.bounds.xMin &&
          r1.bounds.zMin < r2.bounds.zMax &&
          r1.bounds.zMax > r2.bounds.zMin;
        
        if (intersect) {
          // Calculer surface de chevauchement
          const overlapWidth = Math.min(r1.bounds.xMax, r2.bounds.xMax) - Math.max(r1.bounds.xMin, r2.bounds.xMin);
          const overlapDepth = Math.min(r1.bounds.zMax, r2.bounds.zMax) - Math.max(r1.bounds.zMin, r2.bounds.zMin);
          const overlapArea = overlapWidth * overlapDepth;
          
          // Tolérance : chevauchement < 0.5m² acceptable (murs partagés)
          if (overlapArea > 0.5) {
            overlaps.push({
              room1: r1.id || r1.name,
              room2: r2.id || r2.name,
              overlapArea: round2(overlapArea)
            });
          }
        }
      }
    }
    
    return overlaps;
  }

  /**
   * Vérifie si une pièce est favorablement orientée selon la direction solaire.
   * Sud = optimal pour séjour (lumière naturelle)
   * @param {object} bounds
   * @param {string} orientation — 'N'|'S'|'E'|'W'
   * @returns {boolean}
   */
  function isFavorablyOriented(bounds, orientation) {
    // Simplification : on considère que le nord est en haut (z décroissant)
    const centerX = (bounds.xMin + bounds.xMax) / 2;
    const centerZ = (bounds.zMin + bounds.zMax) / 2;
    const empriseZ = bounds.zMax - bounds.zMin;
    
    // Pièce orientée sud = dans la moitié sud de l'emprise
    const isSouth = centerZ > empriseZ / 2;
    const isNorth = centerZ < empriseZ / 2;
    const isEast = centerX < (bounds.xMin + bounds.xMax) / 2;
    const isWest = centerX > (bounds.xMin + bounds.xMax) / 2;
    
    switch (orientation) {
      case 'S': return isSouth;
      case 'N': return isNorth;
      case 'E': return isEast;
      case 'W': return isWest;
      default: return false;
    }
  }

  /**
   * Vérifie si les pièces d'eau sont regroupées (adjacentes ou proches).
   * @param {Array} plumbingRooms
   * @returns {boolean}
   */
  function arePlumbingRoomsGrouped(plumbingRooms) {
    if (plumbingRooms.length < 2) return true;
    
    // Calculer le centroïde de chaque pièce
    const centroids = plumbingRooms.map(r => {
      if (!r.bounds) return null;
      return {
        x: (r.bounds.xMin + r.bounds.xMax) / 2,
        z: (r.bounds.zMin + r.bounds.zMax) / 2
      };
    }).filter(Boolean);
    
    if (centroids.length < 2) return false;
    
    // Calculer la distance moyenne entre centroïdes
    let totalDist = 0;
    let count = 0;
    for (let i = 0; i < centroids.length; i++) {
      for (let j = i + 1; j < centroids.length; j++) {
        const dist = Math.hypot(centroids[i].x - centroids[j].x, centroids[i].z - centroids[j].z);
        totalDist += dist;
        count++;
      }
    }
    
    const avgDist = totalDist / count;
    
    // Regroupé si distance moyenne < 3m
    return avgDist < 3;
  }

  // =====================================================================
  // ALGORITHME GÉNÉTIQUE
  // =====================================================================

  /**
   * Crée un individu initial (copie du plan de base).
   */
  function createIndividual(project) {
    return {
      rooms: JSON.parse(JSON.stringify(project.rooms || [])),
      walls: JSON.parse(JSON.stringify(project.walls || [])),
      generation: 0
    };
  }

  /**
   * Mutation : applique une modification aléatoire.
   */
  function mutate(individual, analysis, maxDisp) {
    const mutated = JSON.parse(JSON.stringify(individual));
    const operation = Math.random();
    
    if (operation < 0.4 && analysis.partitionCount > 0) {
      // Déplacer une cloison
      const partIdx = Math.floor(Math.random() * mutated.walls.filter(w => w.type === 'int').length);
      const partWalls = mutated.walls.filter(w => w.type === 'int');
      if (partWalls[partIdx]) {
        const delta = (Math.random() * 2 - 1) * maxDisp;
        const idx = mutated.walls.indexOf(partWalls[partIdx]);
        mutated.walls[idx] = displaceWall(partWalls[partIdx], delta);
      }
    } else if (operation < 0.7 && mutated.rooms.length > 0) {
      // Redimensionner une pièce
      const roomIdx = Math.floor(Math.random() * mutated.rooms.length);
      const delta = {
        xMin: (Math.random() * 2 - 1) * maxDisp,
        xMax: (Math.random() * 2 - 1) * maxDisp,
        zMin: (Math.random() * 2 - 1) * maxDisp,
        zMax: (Math.random() * 2 - 1) * maxDisp
      };
      mutated.rooms[roomIdx] = resizeRoom(mutated.rooms[roomIdx], delta);
    } else if (operation < 0.85 && mutated.rooms.length >= 2) {
      // Échanger les bornes de deux pièces adjacentes
      const i = Math.floor(Math.random() * mutated.rooms.length);
      let j = Math.floor(Math.random() * mutated.rooms.length);
      while (j === i) j = Math.floor(Math.random() * mutated.rooms.length);
      
      const r1 = mutated.rooms[i];
      const r2 = mutated.rooms[j];
      if (r1.bounds && r2.bounds) {
        // Trouver l'axe d'adjacence
        if (Math.abs(r1.bounds.xMax - r2.bounds.xMin) < 0.5 || Math.abs(r2.bounds.xMax - r1.bounds.xMin) < 0.5) {
          const shift = (Math.random() * 2 - 1) * maxDisp;
          mutated.rooms[i] = resizeRoom(r1, { xMax: shift });
          mutated.rooms[j] = resizeRoom(r2, { xMin: -shift });
        }
      }
    }
    // Sinon : pas de mutation (individu conservé)
    
    return mutated;
  }

  /**
   * Croisement entre deux individus.
   */
  function crossover(parent1, parent2) {
    const child = JSON.parse(JSON.stringify(parent1));
    
    // Mixer les pièces : prendre chaque pièce de l'un ou l'autre parent
    if (parent1.rooms.length > 0 && parent2.rooms.length > 0) {
      for (let i = 0; i < child.rooms.length; i++) {
        if (Math.random() < 0.5 && i < parent2.rooms.length) {
          child.rooms[i] = JSON.parse(JSON.stringify(parent2.rooms[i]));
        }
      }
    }
    
    return child;
  }

  /**
   * Sélection par tournoi.
   */
  function tournamentSelection(population, fitnesses, tournamentSize = 3) {
    let bestIdx = -1;
    let bestFit = -Infinity;
    
    for (let i = 0; i < tournamentSize; i++) {
      const idx = Math.floor(Math.random() * population.length);
      if (fitnesses[idx] > bestFit) {
        bestFit = fitnesses[idx];
        bestIdx = idx;
      }
    }
    
    return population[bestIdx];
  }

  /**
   * Génère les variantes par algorithme génétique.
   * @param {object} project — plan de base
   * @param {object} options
   * @returns {Array} — variantes triées par score
   */
  function generateVariants(project, options = {}) {
    const opts = { ...DEFAULTS, ...options };
    const analysis = analyzeBasePlan(project);
    
    // Population initiale
    let population = [];
    for (let i = 0; i < opts.populationSize; i++) {
      population.push(createIndividual(project));
    }
    
    // Générations successives
    for (let gen = 0; gen < opts.generations; gen++) {
      // Évaluation fitness
      const fitnesses = population.map(ind => evaluateFitness(ind, analysis));
      
      // Nouvelle génération
      const newPop = [];
      
      // Élitisme : conserver le meilleur
      const bestIdx = fitnesses.indexOf(Math.max(...fitnesses));
      newPop.push(JSON.parse(JSON.stringify(population[bestIdx])));
      
      // Remplir par croisements + mutations
      while (newPop.length < opts.populationSize) {
        const p1 = tournamentSelection(population, fitnesses);
        const p2 = tournamentSelection(population, fitnesses);
        let child = crossover(p1, p2);
        
        if (Math.random() < opts.mutationRate) {
          child = mutate(child, analysis, opts.maxDisplacement);
        }
        
        newPop.push(child);
      }
      
      population = newPop;
    }
    
    // Évaluation finale et tri
    const evaluated = population.map(ind => ({
      ...ind,
      fitness: evaluateFitness(ind, analysis),
      rooms: ind.rooms,
      walls: ind.walls
    }));
    
    // Dédupliquer (variations trop similaires)
    const unique = dedupeVariants(evaluated);
    
    // Trier par fitness décroissant
    unique.sort((a, b) => b.fitness - a.fitness);
    
    // Retourner le top N
    const top = unique.slice(0, opts.topN).map((v, i) => ({
      rank: i + 1,
      fitness: round2(v.fitness),
      rooms: v.rooms,
      walls: v.walls,
      changes: describeChanges(v, project),
      metrics: computeVariantMetrics(v)
    }));
    
    return top;
  }

  /**
   * Supprime les variantes trop similaires.
   */
  function dedupeVariants(variants) {
    const unique = [];
    const threshold = 0.5; // m² de différence minimum
    
    for (const v of variants) {
      const isDuplicate = unique.some(u => {
        const areaDiff = Math.abs(
          v.rooms.reduce((s, r) => s + (r.area || 0), 0) -
          u.rooms.reduce((s, r) => s + (r.area || 0), 0)
        );
        return areaDiff < threshold;
      });
      if (!isDuplicate) unique.push(v);
    }
    
    return unique;
  }

  /**
   * Décrit les changements par rapport au plan original.
   */
  function describeChanges(variant, original) {
    const changes = [];
    const origRooms = original.rooms || [];
    
    for (const room of variant.rooms) {
      const orig = origRooms.find(r => r.id === room.id || r.name === room.name);
      if (!orig) {
        changes.push({ type: 'added', room: room.name || 'Nouvelle pièce' });
        continue;
      }
      
      const origArea = orig.area || computeRoomArea(orig);
      const newArea = room.area || computeRoomArea(room);
      const diff = newArea - origArea;
      
      if (Math.abs(diff) > 0.5) {
        changes.push({
          type: diff > 0 ? 'enlarged' : 'reduced',
          room: room.name,
          delta: round2(diff),
          newArea: round2(newArea)
        });
      }
    }
    
    // Pièces supprimées
    for (const orig of origRooms) {
      if (!variant.rooms.find(r => r.id === orig.id || r.name === orig.name)) {
        changes.push({ type: 'removed', room: orig.name });
      }
    }
    
    return changes;
  }

  /**
   * Calcule les métriques d'une variante.
   */
  function computeVariantMetrics(variant) {
    const rooms = variant.rooms || [];
    const totalArea = rooms.reduce((s, r) => s + (r.area || computeRoomArea(r)), 0);
    const habitableArea = rooms
      .filter(r => r.habitable !== false)
      .reduce((s, r) => s + (r.area || computeRoomArea(r)), 0);
    
    const bounds = computeBounds(rooms);
    const emprise = (bounds.xMax - bounds.xMin) * (bounds.zMax - bounds.zMin);
    
    return {
      totalArea: round2(totalArea),
      habitableArea: round2(habitableArea),
      roomCount: rooms.length,
      emprise: round2(emprise),
      efficiency: round2(totalArea / emprise * 100)
    };
  }

  // =====================================================================
  // UTILITAIRES
  // =====================================================================

  function snap(value) {
    return Math.round(value / DEFAULTS.gridStep) * DEFAULTS.gridStep;
  }

  function round2(n) {
    return Math.round(n * 100) / 100;
  }

  // =====================================================================
  // EXPORT
  // =====================================================================

  return {
    // Analyse
    analyzeBasePlan,
    computeBounds,
    computeRoomArea,
    
    // Opérateurs
    displaceWall,
    resizeRoom,
    mergeRooms,
    splitRoom,
    
    // Évaluation
    evaluateFitness,
    computeVariantMetrics,
    
    // Nouvelles fonctions
    detectOverlaps,
    isFavorablyOriented,
    arePlumbingRoomsGrouped,
    
    // Génération
    generateVariants,
    
    // Constants
    RULES,
    DEFAULTS
  };
})();

// Compatibilité Node.js
if (typeof module !== 'undefined' && module.exports) {
  module.exports = VariantGenerator;
}
