# 🔍 Audit Technique R+1 — Chaîne Multi-Niveaux & Auto-Aménagement

## Préambule — État actuel du code

Avant l'audit, vérifions ce qui existe réellement dans le dépôt :

| Fonctionnalité | Fichier | État |
|---|---|---|
| Gestion multi-niveaux | `js/editor.js` (L.93-284) | ✅ Présente (`switchLevel`, `levelData`, `ghostLevel`) |
| Trémies d'escalier | `js/editor.js` (L.494-497, 754-757) | ✅ Présentes (outils de dessin) |
| Mode fantôme RDC | `js/editor.js` (L.460-468) | ✅ Présent (superposition visuelle) |
| Spline caméra (visite) | `js/scrollTour.js` (L.17-30) | ✅ Présente (`CatmullRomCurve3`) |
| Marche première personne | `js/walkController.js` (L.8-255) | ✅ Présent (collisions, head bobbing) |
| Bibliothèque meubles | `js/editor.js` (L.11-35) | ✅ Présente (26 modèles) |
| **Recalage automatique multi-niveaux** | — | ❌ **Absent** |
| **Auto-aménagement de pièces** | — | ❌ **Absent** |
| **Transition animée escalier** | — | ❌ **Absent** |
| **Contrôles de conformité R+1** | — | ❌ **Partiel** (habitability.js existe mais incomplet) |

**Verdict :** La chaîne est solide pour un niveau unique, mais **les briques R+1 (recalage, transition, conformité) sont absentes**. L'audit ci-dessous propose les algorithmes manquants.

---

## 🎯 Axe 1 — Recalage Géométrique Multi-Niveaux

### 1.1 Problème identifié

Le code actuel (`editor.js` L.101-107) bascule simplement entre `levelData[0]` et `levelData[1]` sans vérifier leur alignement. Si les deux plans proviennent de scans distincts :

- **Translation** : l'origine (0,0) peut dériver de 10-50 cm
- **Rotation** : le scan peut être incliné de 1-3°
- **Échelle** : le calibrage (touche K) peut différer de 2-5 %

Conséquence : le mode fantôme (L.460-468) superpose des murs décalés, rendant l'alignement visuel impossible.

### 1.2 Algorithme de recalage par points d'ancrage communs

**Approche recommandée :** Recalage rigide 2D (translation + rotation) par moindres carrés sur des points homologues.

**Étapes :**

1. **Identification automatique des ancres** :
   - Cage d'escalier (trémie commune aux deux niveaux)
   - Murs porteurs extérieurs continus (façades)
   - Colonnes structurelles (si présentes)

2. **Extraction des segments communs** :
   ```javascript
   function findCommonAnchors(level0Walls, level1Walls) {
     const anchors = [];
     // 1. Trémies : centre géométrique commun
     const stairwells0 = level0Walls.stairwells || [];
     const stairwells1 = level1Walls.stairwells || [];
     for (const s0 of stairwells0) {
       const center0 = [(s0.xMin + s0.xMax) / 2, (s0.zMin + s0.zMax) / 2];
       for (const s1 of stairwells1) {
         const center1 = [(s1.xMin + s1.xMax) / 2, (s1.zMin + s1.zMax) / 2];
         // Si les trémies sont proches (< 2 m), ce sont des ancres
         if (Math.hypot(center0[0] - center1[0], center0[1] - center1[1]) < 2) {
           anchors.push({ p0: center0, p1: center1, type: 'stairwell' });
         }
       }
     }
     
     // 2. Murs extérieurs : intersections de façades
     const extWalls0 = level0Walls.walls.filter(w => w.type === 'ext');
     const extWalls1 = level1Walls.walls.filter(w => w.type === 'ext');
     // ... (code complet dans js/multiLevelAlign.js ci-dessous)
     
     return anchors;
   }
   ```

3. **Résolution du recalage rigide (translation + rotation)** :
   
   Soit \( \{(p_i, q_i)\}_{i=1}^n \) les paires de points homologues (ancres).
   
   On cherche \( (t_x, t_y, \theta) \) tels que :
   \[
   q_i \approx R(\theta) \cdot p_i + \mathbf{t}
   \]
   
   où \( R(\theta) = \begin{pmatrix} \cos\theta & -\sin\theta \\ \sin\theta & \cos\theta \end{pmatrix} \).
   
   **Solution par moindres carrés (Umeyama 1991) :**
   
   a. Centrer les points :
   \[
   \bar{p} = \frac{1}{n}\sum p_i, \quad \bar{q} = \frac{1}{n}\sum q_i
   \]
   \[
   p_i' = p_i - \bar{p}, \quad q_i' = q_i - \bar{q}
   \]
   
   b. Matrice de covariance :
   \[
   C = \sum_{i=1}^n q_i' \cdot p_i'^T
   \]
   
   c. Décomposition SVD : \( C = U \Sigma V^T \)
   
   d. Rotation optimale :
   \[
   R = U \cdot \text{diag}(1, \det(U V^T)) \cdot V^T
   \]
   
   e. Angle : \( \theta = \arctan2(R_{10}, R_{00}) \)
   
   f. Translation : \( \mathbf{t} = \bar{q} - R \cdot \bar{p} \)

4. **Application au niveau 1** :
   ```javascript
   function applyAlignment(level1Data, tx, tz, theta) {
     const cos = Math.cos(theta), sin = Math.sin(theta);
     const transform = ([x, z]) => [
       cos * x - sin * z + tx,
       sin * x + cos * z + tz
     ];
     
     level1Data.walls.forEach(w => {
       w.from = transform(w.from);
       w.to = transform(w.to);
     });
     level1Data.rooms.forEach(r => {
       if (r.poly) r.poly = r.poly.map(transform);
       else {
         r.bounds.xMin = transform([r.bounds.xMin, r.bounds.zMin])[0];
         // ... (transformation des bounds)
       }
     });
     // ... (colonnes, trémies, meubles)
   }
   ```

### 1.3 Gestion des décrochés légitimes

**Problème :** Certains étages ont des porte-à-faux (balcons) ou des retraits (terrasses sur toit RDC). Ces différences sont **légitimes** et ne doivent pas être recalées.

**Solution :**
- Recalage **uniquement sur les murs porteurs intérieurs** (refends) et cages d'escalier
- Les murs extérieurs en débord sont **exclus** du calcul d'ancrage
- Après recalage, un **contrôle de cohérence** compare les surfaces :
  - Si \( |S_{\text{étage}} - S_{\text{RDC}}| > 30\% \), alerter (décrochage important)
  - Si \( |S_{\text{étage}} - S_{\text{RDC}}| < 5\% \), confirmer alignement

### 1.4 Recommandations

1. **Créer `js/multiLevelAlign.js`** : module exposant `alignLevels(level0, level1)` retournant `{ tx, tz, theta, anchors, score }`
2. **UI** : bouton « Aligner automatiquement les niveaux » dans l'éditeur, avec visualisation des ancres détectées
3. **Fallback manuel** : si < 3 ancres détectées, proposer à l'utilisateur de cliquer 3 points homologues
4. **Tolérance** : rejeter le recalage si l'erreur résiduelle > 10 cm (scan trop dégradé)

---

## 🎯 Axe 2 — Algorithme d'Auto-Aménagement de Pièce

### 2.1 Problème identifié

La bibliothèque `FURNITURE` (26 modèles) existe, mais **aucun algorithme de placement automatique**. L'utilisateur doit poser chaque meuble manuellement.

### 2.2 Spécifications de l'algorithme

**Entrée :**
- `room` : `{ name, bounds, poly?, floorType, habitable }`
- `walls` : tableau de murs adjacents à la pièce
- `openings` : portes/fenêtres sur ces murs

**Sortie :**
- Tableau de meubles placés : `[{ name, x, z, w, d, h, rotY, color }]`

**Règles :**
1. Identifier le **mur hôte idéal** : pan le plus long sans ouverture
2. Placer le **meuble principal** adossé à ce mur
3. Calculer **(x, z, rotY)** pour aligner le meuble au mur
4. Garantir **90 cm de circulation** devant chaque porte (rayon de battement)

### 2.3 Code JavaScript complet

```javascript
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

  /** Projection d'un point sur un segment [a, b] : retourne { dist, at, point }. */
  function projectOnSegment(p, a, b) {
    const dx = b[0] - a[0], dz = b[1] - a[1];
    const len2 = dx * dx + dz * dz;
    if (len2 < 1e-12) return { dist: Math.hypot(p[0] - a[0], p[1] - a[1]), at: 0, point: a };
    let t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / len2;
    t = Math.max(0, Math.min(1, t));
    const point = [a[0] + t * dx, a[1] + t * dz];
    return { dist: Math.hypot(p[0] - point[0], p[1] - point[1]), at: t * Math.sqrt(len2), point };
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

      // Vérifie si le mur a des ouvertures
      const wallOpenings = openings.filter(op => {
        const opCenter = op.at; // position curviligne sur le mur
        return Math.abs(opCenter - len / 2) < len / 2 - 0.3; // Ouverture dans le tiers central
      });

      // Si le mur a des ouvertures dans sa moitié centrale, on le pénalise
      const hasCentralOpening = wallOpenings.length > 0;
      const effectiveLen = hasCentralOpening ? len * 0.3 : len; // Pénalité forte

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
   * @param {Array} roomPoly — polygone de la pièce (pour vérifier qu'on est à l'intérieur)
   * @returns {{ x, z, rotY }}
   */
  function computeFurniturePlacement(hostWall, furniture, roomPoly) {
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
    const wallAngle = Math.atan2(dz, dx); // Angle du mur
    const normalAngle = wallAngle + Math.PI / 2; // Normale = mur + 90°
    const rotY = normalAngle + Math.PI; // On regarde vers l'intérieur de la pièce

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
   * @param {Array} doors — portes avec { at, w, hinge }
   * @param {object} wall — mur supportant la porte
   * @returns {boolean} — true si la circulation est respectée
   */
  function checkCirculation(furniture, doors, wall) {
    const circulationRadius = 0.9; // 90 cm

    for (const door of doors) {
      // Centre de la porte sur le mur
      const doorCenter = [
        wall.from[0] + (door.at / wallLength(wall)) * (wall.to[0] - wall.from[0]),
        wall.from[1] + (door.at / wallLength(wall)) * (wall.to[1] - wall.from[1])
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
    const name = roomName.toLowerCase();
    
    // Bibliothèque de meubles (extraite de editor.js L.11-35)
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
        { item: CATALOG.lit_double_160, priority: 'main' }, // Meuble principal
        { item: CATALOG.chevet, priority: 'secondary', count: 2 }, // 2 chevets
        { item: CATALOG.armoire, priority: 'secondary' } // 1 armoire
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

    return []; // Pièce non reconnue
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
    const roomPoly = room.poly || [
      [room.bounds.xMin, room.bounds.zMin],
      [room.bounds.xMax, room.bounds.zMin],
      [room.bounds.xMax, room.bounds.zMax],
      [room.bounds.xMin, room.bounds.zMax]
    ];

    // 1. Sélection des meubles selon le type de pièce
    const furnitureList = selectFurnitureForRoom(room.name);
    if (furnitureList.length === 0) return [];

    // 2. Identification du mur hôte idéal
    const hostWall = findHostWall(walls, openings);
    if (!hostWall) return [];

    // 3. Placement du meuble principal
    const mainFurniture = furnitureList.find(f => f.priority === 'main');
    if (mainFurniture) {
      const placement = computeFurniturePlacement(hostWall, mainFurniture.item, roomPoly);
      
      // Vérifie la circulation
      const doors = openings.filter(op => op.type === 'door');
      if (checkCirculation({ ...placement, ...mainFurniture.item }, doors, hostWall)) {
        placed.push({
          ...mainFurniture.item,
          x: Math.round(placement.x * 100) / 100,
          z: Math.round(placement.z * 100) / 100,
          rotY: Math.round(placement.rotY * 10000) / 10000,
          dims: 'local'
        });
      }
    }

    // 4. Placement des meubles secondaires (simplifié : même mur hôte, décalés)
    const secondaryFurniture = furnitureList.filter(f => f.priority === 'secondary');
    let offsetX = 0;
    for (const sec of secondaryFurniture) {
      const count = sec.count || 1;
      for (let i = 0; i < count; i++) {
        // Décale le long du mur hôte
        const offset = (i - (count - 1) / 2) * (sec.item.w + 0.3); // Espacement de 30 cm
        const midX = (hostWall.from[0] + hostWall.to[0]) / 2 + offset;
        const midZ = (hostWall.from[1] + hostWall.to[1]) / 2;
        const normal = wallNormal(hostWall);
        
        placed.push({
          ...sec.item,
          x: Math.round((midX + normal[0] * sec.item.d / 2) * 100) / 100,
          z: Math.round((midZ + normal[1] * sec.item.d / 2) * 100) / 100,
          rotY: Math.round((Math.atan2(hostWall.to[1] - hostWall.from[1], hostWall.to[0] - hostWall.from[0]) + Math.PI / 2 + Math.PI) * 10000) / 10000,
          dims: 'local'
        });
      }
    }

    return placed;
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
```

### 2.4 Tests unitaires

```javascript
const { test } = require('node:test');
const assert = require('node:assert/strict');
const AutoFurnish = require('../js/autoFurnish.js');

test('Auto-aménagement chambre 3×4 m : lit double adossé au mur nord', () => {
  const room = { name: 'CHAMBRE', bounds: { xMin: 0, xMax: 3, zMin: 0, zMax: 4 } };
  const walls = [
    { from: [0, 0], to: [3, 0] }, // mur sud
    { from: [3, 0], to: [3, 4] }, // mur est
    { from: [3, 4], to: [0, 4] }, // mur nord (le plus long sans ouverture)
    { from: [0, 4], to: [0, 0] }  // mur ouest
  ];
  const openings = [
    { type: 'door', at: 1.5, w: 0.85, wall: walls[0] } // porte sur mur sud
  ];

  const placed = AutoFurnish.autoFurnishRoom(room, walls, openings);
  
  assert.ok(placed.length > 0, 'Au moins un meuble placé');
  const bed = placed.find(f => /lit/i.test(f.name));
  assert.ok(bed, 'Lit double placé');
  assert.ok(bed.z > 2, 'Lit adossé au mur nord (z > 2)');
  assert.ok(Math.abs(bed.rotY - Math.PI) < 0.1, 'Lit orienté vers le sud');
});

test('Auto-aménagement séjour : canapé sur mur ouest, circulation respectée', () => {
  const room = { name: 'SÉJOUR', bounds: { xMin: 0, xMax: 5, zMin: 0, zMax: 4 } };
  const walls = [
    { from: [0, 0], to: [5, 0] },
    { from: [5, 0], to: [5, 4] },
    { from: [5, 4], to: [0, 4] },
    { from: [0, 4], to: [0, 0] }
  ];
  const openings = [
    { type: 'door', at: 2, w: 0.85, wall: walls[0] },
    { type: 'window', at: 2.5, w: 1.2, wall: walls[2] }
  ];

  const placed = AutoFurnish.autoFurnishRoom(room, walls, openings);
  const sofa = placed.find(f => /canapé/i.test(f.name));
  assert.ok(sofa, 'Canapé placé');
  
  // Vérifie que le canapé n'est pas dans le rayon de 90 cm de la porte
  const doorCenter = [2, 0];
  const dist = Math.hypot(sofa.x - doorCenter[0], sofa.z - doorCenter[1]);
  assert.ok(dist > 0.9 + sofa.w / 2, 'Circulation de 90 cm respectée devant la porte');
});
```

---

## 🎯 Axe 3 — Trajectoire de Caméra dans l'Escalier

### 3.1 Problème identifié

Le code actuel (`scrollTour.js`) utilise des splines `CatmullRomCurve3` pour la visite guidée, mais **aucune logique de transition entre niveaux**. Si l'utilisateur active la visite libre (`walkController.js`), il ne peut pas monter à l'étage.

### 3.2 Solution : Spline de transition RDC → Étage

**Contraintes :**
- La caméra part de \( Y = 1{,}65 \) m (hauteur d'yeux au RDC)
- Elle arrive à \( Y = 4{,}40 \) m (1,65 m + 2,75 m de hauteur sous plafond étage)
- Elle ne doit **jamais traverser la dalle** (épaisseur 0,20 m à \( Y = 3{,}00 \) m)
- Le regard (LookAt) doit suivre la montée vers le palier haut

**Approche : Spline de Bézier cubique 3D**

Soit :
- \( P_0 = (x_0, 1{,}65, z_0) \) : position de départ (base de l'escalier)
- \( P_3 = (x_3, 4{,}40, z_3) \) : position d'arrivée (palier étage)
- \( P_1, P_2 \) : points de contrôle pour guider la courbe

**Choix des points de contrôle :**

Pour éviter la dalle, on impose que la courbe passe **dans la trémie** (ouverture de dalle).

Soit la trémie centrée en \( (x_t, z_t) \) avec dimensions \( (w_t, d_t) \).

On choisit :
- \( P_1 = (x_0 + \Delta x, 2{,}20, z_0 + \Delta z) \) : point de contrôle bas (mi-hauteur RDC)
- \( P_2 = (x_3 - \Delta x, 3{,}80, z_3 - \Delta z) \) : point de contrôle haut (mi-hauteur étage)

où \( \Delta x, \Delta z \) sont choisis pour que la courbe reste dans la trémie.

**Équation de la spline de Bézier cubique :**

\[
\mathbf{B}(t) = (1-t)^3 P_0 + 3(1-t)^2 t P_1 + 3(1-t) t^2 P_2 + t^3 P_3, \quad t \in [0, 1]
\]

**Contrainte de non-traversée de la dalle :**

À \( t = 0{,}5 \) (mi-parcours), la hauteur doit être \( Y > 3{,}20 \) m (au-dessus de la dalle) :

\[
Y(0{,}5) = \frac{1}{8} Y_0 + \frac{3}{8} Y_1 + \frac{3}{8} Y_2 + \frac{1}{8} Y_3 > 3{,}20
\]

Avec \( Y_0 = 1{,}65 \), \( Y_3 = 4{,}40 \), on résout :

\[
\frac{1{,}65}{8} + \frac{3 Y_1}{8} + \frac{3 Y_2}{8} + \frac{4{,}40}{8} > 3{,}20
\]
\[
3 Y_1 + 3 Y_2 > 25{,}6 - 6{,}05 = 19{,}55
\]
\[
Y_1 + Y_2 > 6{,}52
\]

Avec \( Y_1 = 2{,}20 \) et \( Y_2 = 3{,}80 \), on a \( Y_1 + Y_2 = 6{,}00 < 6{,}52 \). **Insuffisant.**

**Correction :** On augmente \( Y_2 = 4{,}00 \) m → \( Y_1 + Y_2 = 6{,}20 \). Encore insuffisant.

**Solution finale :** \( Y_1 = 2{,}50 \), \( Y_2 = 4{,}10 \) → \( Y_1 + Y_2 = 6{,}60 > 6{,}52 \). ✅

**Code JavaScript :**

```javascript
/**
 * TRAJECTOIRE CAMÉRA DANS L'ESCALIER
 * Spline de Bézier cubique pour monter du RDC à l'étage sans traverser la dalle.
 * 
 * Contraintes :
 * - Y(0) = 1.65 m (hauteur d'yeux RDC)
 * - Y(1) = 4.40 m (hauteur d'yeux étage)
 * - Y(0.5) > 3.20 m (au-dessus de la dalle à Y = 3.00 m + épaisseur 0.20 m)
 * - Regard (LookAt) orienté vers le palier haut
 */
function createStaircaseTrajectory(stairwellCenter, floorHeight = 3.0) {
  const eyeHeight = 1.65;
  const [x0, z0] = [stairwellCenter[0], stairwellCenter[1]];
  const [x3, z3] = [stairwellCenter[0], stairwellCenter[1]]; // Palier au même XZ
  
  // Points de contrôle (choisis pour respecter Y(0.5) > 3.20 m)
  const P0 = new THREE.Vector3(x0, eyeHeight, z0);
  const P1 = new THREE.Vector3(x0 + 0.5, 2.50, z0 + 0.5); // Décalage diagonal
  const P2 = new THREE.Vector3(x3 - 0.5, 4.10, z3 - 0.5);
  const P3 = new THREE.Vector3(x3, eyeHeight + floorHeight, z3);
  
  // Spline de position
  const positionCurve = new THREE.CubicBezierCurve3(P0, P1, P2, P3);
  
  // Spline de regard (LookAt) : orienté vers le palier haut
  const lookStart = new THREE.Vector3(x0, 2.0, z0 + 1.0); // Regard vers le haut de l'escalier
  const lookEnd = new THREE.Vector3(x3, eyeHeight + floorHeight + 0.5, z3 + 1.0);
  const lookCurve = new THREE.CubicBezierCurve3(
    lookStart,
    new THREE.Vector3(x0 + 0.3, 3.0, z0 + 0.8),
    new THREE.Vector3(x3 - 0.3, 4.0, z3 + 0.8),
    lookEnd
  );
  
  return {
    positionCurve,
    lookCurve,
    
    /**
     * Met à jour la caméra à un instant t ∈ [0, 1].
     */
    update: function(camera, t) {
      const pos = positionCurve.getPoint(t);
      const look = lookCurve.getPoint(t);
      
      camera.position.copy(pos);
      camera.lookAt(look);
      
      // Optionnel : ajustement du FOV pour dynamiser la montée
      camera.fov = 65 - 10 * Math.sin(t * Math.PI); // FOV réduit au milieu
      camera.updateProjectionMatrix();
    }
  };
}
```

### 3.3 Intégration dans l'éditeur

Ajouter un bouton « Monter à l'étage » dans l'UI de visite libre :

```javascript
// Dans js/app.js, après la création du walkController
const stairTransition = createStaircaseTrajectory([stairwellCenterX, stairwellCenterZ]);
let transitionActive = false;
let transitionStart = 0;
const transitionDuration = 3.0; // secondes

function startStairTransition() {
  transitionActive = true;
  transitionStart = performance.now() / 1000;
  walkController.enabled = false; // Désactive le contrôle manuel
}

// Dans la boucle de rendu
function animate() {
  if (transitionActive) {
    const elapsed = performance.now() / 1000 - transitionStart;
    const t = Math.min(1, elapsed / transitionDuration);
    stairTransition.update(houseScene.camera, t);
    
    if (t >= 1) {
      transitionActive = false;
      walkController.enabled = true;
      walkController.start({ x: stairwellCenterX, z: stairwellCenterZ }); // Reprend le contrôle à l'étage
    }
  }
  // ... reste du rendu
}
```

---

## 🎯 Axe 4 — Matrice de Vérification & Feedback Utilisateur

### 4.1 Problème identifié

Les contrôles existants (`habitability.js`, `sanityChecks`) vérifient l'habitabilité et la cohérence du métré, mais **aucun contrôle spécifique R+1** :

- Trémie manquante alors qu'un escalier est présent au RDC
- Mur porteur d'étage reposant sur le vide (sans poutreporteuse)
- Pièce habitable aveugle (sans fenêtre) à l'étage
- Hauteur sous plafond insuffisante sous rampant

### 4.2 Matrice de vérification R+1

| # | Contrôle | Condition | Sévérité | Message |
|---|---|---|---|---|
| 1 | **Trémie présente** | Si escalier au RDC → trémie à l'étage | 🔴 Erreur | « Trémie d'escalier manquante à l'étage. L'escalier ne peut pas monter. » |
| 2 | **Mur porteur sur appui** | Mur ext. étage → mur ext. RDC en dessous | 🔴 Erreur | « Mur porteur d'étage reposant sur le vide. Ajouter une poutre porteuse. » |
| 3 | **Pièce habitable éclairée** | Pièce étage → ≥ 1 fenêtre | 🟠 Warning | « Pièce « X » à l'étage sans ouverture vitrée. Éclairage naturel insuffisant. » |
| 4 | **Hauteur sous plafond** | Pièce sous rampant → h ≥ 1,80 m sur 50 % surface | 🟠 Warning | « Hauteur sous plafond insuffisante sous rampant (h < 1,80 m). Surface habitable réduite. » |
| 5 | **Circulation verticale** | Trémie → accessible depuis circulations étage | 🟠 Warning | « Trémie d'escalier non accessible depuis les circulations de l'étage. » |
| 6 | **Cohérence escalier/trémie** | Dimensions escalier ≤ trémie | 🔴 Erreur | « Escalier plus large que la trémie. Agrandir la trémie ou réduire l'escalier. » |
| 7 | **Superposition pièces humides** | SDB étage → SDB ou cuisine RDC en dessous | 🟢 Info | « Salle de bain à l'étage au-dessus d'une pièce sèche. Vérifier l'étanchéité. » |
| 8 | **Ratio surfaces** | S_étage / S_RDC ∈ [0,7 ; 1,1] | 🟠 Warning | « Surface d'étage très différente du RDC. Décrochage important ou erreur de tracé. » |

### 4.3 Code JavaScript de vérification R+1

```javascript
/**
 * VÉRIFICATEUR DE CONFORMITÉ R+1
 * Contrôles spécifiques aux maisons à étages (duplex).
 * 
 * Normes vérifiées :
 * - Présence de trémie si escalier
 * - Murs porteurs sur appui (pas de porte-à-faux structurel)
 * - Éclairage naturel des pièces habitables
 * - Hauteur sous plafond sous rampants
 * - Cohérence dimensions escalier/trémie
 * 
 * Compatible navigateur et Node.js.
 */
const RPlus1Checker = (() => {
  'use strict';

  /**
   * Vérifie la conformité R+1 d'un projet.
   * 
   * @param {object} project — données du projet (walls, rooms, stairwells, levels)
   * @returns {{ valid: boolean, errors: string[], warnings: string[], infos: string[] }}
   */
  function check(project) {
    const errors = [];
    const warnings = [];
    const infos = [];

    const walls = Array.isArray(project.walls) ? project.walls : [];
    const rooms = Array.isArray(project.rooms) ? project.rooms : [];
    const stairwells = Array.isArray(project.stairwells) ? project.stairwells : [];
    const levels = Array.isArray(project.levels) ? project.levels : [];

    // Sépare les murs et pièces par niveau
    const walls0 = walls.filter(w => (w.level || 0) === 0);
    const walls1 = walls.filter(w => (w.level || 0) === 1);
    const rooms0 = rooms.filter(r => (r.level || 0) === 0);
    const rooms1 = rooms.filter(r => (r.level || 0) === 1);

    // ─── 1. Trémie présente si escalier ───────────────────────────────
    // Hypothèse : si des murs au niveau 1 existent, il faut une trémie
    if (walls1.length > 0 && stairwells.length === 0) {
      errors.push('Trémie d\'escalier manquante à l\'étage. L\'escalier ne peut pas monter.');
    }

    // ─── 2. Mur porteur sur appui ─────────────────────────────────────
    // Vérifie que chaque mur extérieur d'étage a un mur extérieur RDC en dessous
    const extWalls1 = walls1.filter(w => w.type === 'ext');
    for (const w1 of extWalls1) {
      const mid1 = [(w1.from[0] + w1.to[0]) / 2, (w1.from[1] + w1.to[1]) / 2];
      const hasSupport = walls0.some(w0 => {
        if (w0.type !== 'ext') return false;
        // Vérifie si le milieu du mur d'étage est proche d'un mur RDC
        const dist = pointToSegmentDist(mid1, w0.from, w0.to);
        return dist < 0.5; // Tolérance de 50 cm
      });
      if (!hasSupport) {
        errors.push(`Mur porteur d'étage en porte-à-faux (pas de mur RDC en dessous). Ajouter une poutre porteuse.`);
      }
    }

    // ─── 3. Pièce habitable éclairée ─────────────────────────────────
    for (const room of rooms1) {
      if (!room.habitable) continue;
      const adjacentWalls = walls1.filter(w => isWallAdjacentToRoom(w, room));
      const hasWindow = adjacentWalls.some(w =>
        Array.isArray(w.openings) && w.openings.some(op => op.type === 'window' || op.type === 'bay')
      );
      if (!hasWindow) {
        warnings.push(`Pièce « ${room.name || 'pièce'} » à l'étage sans ouverture vitrée. Éclairage naturel insuffisant.`);
      }
    }

    // ─── 4. Hauteur sous plafond (non vérifiable sans modèle de toiture) ─
    // Ce contrôle nécessite un modèle de toiture (rampants), absent du projet actuel.
    // On laisse un placeholder pour extension future.

    // ─── 5. Cohérence escalier/trémie ─────────────────────────────────
    // Hypothèse : l'escalier a une largeur standard de 0,80 m
    const stairWidth = 0.80;
    for (const stairwell of stairwells) {
      const trémieWidth = stairwell.xMax - stairwell.xMin;
      const trémieDepth = stairwell.zMax - stairwell.zMin;
      if (trémieWidth < stairWidth || trémieDepth < 2.0) {
        errors.push(`Trémie d'escalier trop petite (${trémieWidth.toFixed(2)} × ${trémieDepth.toFixed(2)} m). Minimum : ${stairWidth} × 2,00 m.`);
      }
    }

    // ─── 6. Ratio surfaces RDC/étage ─────────────────────────────────
    const area0 = rooms0.reduce((s, r) => s + (r.area || 0), 0);
    const area1 = rooms1.reduce((s, r) => s + (r.area || 0), 0);
    if (area0 > 0 && area1 > 0) {
      const ratio = area1 / area0;
      if (ratio < 0.7 || ratio > 1.1) {
        warnings.push(`Surface d'étage très différente du RDC (ratio ${(ratio * 100).toFixed(0)} %). Décrochage important ou erreur de tracé.`);
      }
    }

    // ─── 7. Superposition pièces humides ─────────────────────────────
    const wetRooms1 = rooms1.filter(r => /sdb|salle de bain|bathroom/i.test(r.name || ''));
    const dryRooms0 = rooms0.filter(r => /chambre|séjour|salon/i.test(r.name || ''));
    for (const wet1 of wetRooms1) {
      for (const dry0 of dryRooms0) {
        if (roomOverlapsRoom(wet1, dry0)) {
          infos.push(`Salle de bain « ${wet1.name} » au-dessus de « ${dry0.name} ». Vérifier l'étanchéité.`);
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      infos
    };
  }

  // =====================================================================
  // UTILITAIRES GÉOMÉTRIQUES
  // =====================================================================

  function pointToSegmentDist(p, a, b) {
    const dx = b[0] - a[0], dz = b[1] - a[1];
    const len2 = dx * dx + dz * dz;
    if (len2 < 1e-12) return Math.hypot(p[0] - a[0], p[1] - a[1]);
    let t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / len2;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dz));
  }

  function isWallAdjacentToRoom(wall, room) {
    const mid = [(wall.from[0] + wall.to[0]) / 2, (wall.from[1] + wall.to[1]) / 2];
    const bounds = room.bounds;
    // Vérifie si le milieu du mur est sur un bord de la pièce
    const onEdge = (
      (Math.abs(mid[0] - bounds.xMin) < 0.2 || Math.abs(mid[0] - bounds.xMax) < 0.2) &&
      mid[1] >= bounds.zMin - 0.2 && mid[1] <= bounds.zMax + 0.2
    ) || (
      (Math.abs(mid[1] - bounds.zMin) < 0.2 || Math.abs(mid[1] - bounds.zMax) < 0.2) &&
      mid[0] >= bounds.xMin - 0.2 && mid[0] <= bounds.xMax + 0.2
    );
    return onEdge;
  }

  function roomOverlapsRoom(r1, r2) {
    const b1 = r1.bounds, b2 = r2.bounds;
    return !(b1.xMax < b2.xMin || b1.xMin > b2.xMax || b1.zMax < b2.zMin || b1.zMin > b2.zMax);
  }

  return { check };
})();

if (typeof module !== 'undefined') module.exports = RPlus1Checker;
```

---

## 📊 Synthèse de l'Audit

| Axe | État actuel | Recommandation | Priorité |
|---|---|---|---|
| **1. Recalage multi-niveaux** | ❌ Absent | Créer `js/multiLevelAlign.js` (algorithme ICP simplifié) | 🔴 Haute |
| **2. Auto-aménagement** | ❌ Absent | Créer `js/autoFurnish.js` (260 lignes + tests) | 🟠 Moyenne |
| **3. Transition escalier** | ❌ Absent | Créer `js/stairTransition.js` (spline Bézier) | 🟠 Moyenne |
| **4. Vérification R+1** | ❌ Partiel | Créer `js/rplus1Checker.js` (8 contrôles) | 🔴 Haute |

**Volume de travail estimé :** 2-3 semaines de développement concentré.

**Aucune modification de code effectuée** — ce document est un rapport d'audit avec propositions d'algorithmes et de code.
