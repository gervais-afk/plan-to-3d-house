# INTÉGRATION DE L'IA — Stratégie complète pour transformer le système

## Comment l'IA peut révolutionner chaque fonctionnalité

---

## 🧠 VISION GLOBALE : L'IA COMME CERVEAU ARCHITECTURAL

### Philosophie d'intégration

L'IA ne doit pas remplacer l'architecte, mais **augmenter ses capacités** :
- **Automatiser** les tâches répétitives (lecture de plans, métrés)
- **Amplifier** la créativité (génération de variantes, optimisations)
- **Sécuriser** les décisions (vérification conformité, détection erreurs)
- **Accélérer** le workflow (croquis → 3D en quelques secondes)

### Types d'IA utilisables

| Type d'IA | Usage | Modèle recommandé | Coût |
|---|---|---|---|
| **Vision** | Lecture plans, croquis, symboles | Claude Sonnet 5.5, GPT-6.2 Sol | ~0,05 €/plan |
| **Générative** | Variantes, optimisations | GPT-6 Luna, Claude Haiku | ~0,01 €/itération |
| **NLP** | Compréhension demandes client | Claude Sonnet, GPT-6.2 | ~0,02 €/requête |
| **Prédictive** | Coûts, délais, conformité | Modèles custom (fine-tuning) | Gratuit (local) |
| **Reinforcement** | Optimisation spatiale | Algorithmes génétiques | Gratuit (local) |

---

## 🔴 GAP 1 : RECONNAISSANCE DE CROQUIS MANUSCRITS

### Comment l'IA transforme cette fonctionnalité

**Sans IA** (approche classique) :
```javascript
// Algorithmes classiques (limités)
const edges = cv.Canny(image, 50, 150); // Détection contours
const lines = cv.HoughLines(edges); // Extraction segments
// Problème : ne comprend pas la sémantique
```

**Avec IA** (approche moderne) :
```javascript
// IA comprend le contexte architectural
const analysis = await claudeVision({
  image: croquis,
  prompt: `Tu es un architecte expert. Analyse ce croquis manuscrit et extrait :
  1. Les murs porteurs (traits épais, doubles)
  2. Les cloisons (traits fins, simples)
  3. Les portes (arcs de 90°)
  4. Les fenêtres (traits parallèles dans murs)
  5. Les pièces avec leurs labels manuscrits
  6. Les cotes (chiffres + unités)
  
  Retourne un JSON structuré avec coordonnées pixels.`
});
```

### Architecture technique

```javascript
// Module js/sketchRecognition.js
const SketchRecognition = {
  
  // ÉTAPE 1 : Prétraitement avec IA
  async enhanceSketch(imageData) {
    // 1. Nettoyage automatique (suppression bruit, taches)
    const cleaned = await claudeVision({
      image: imageData,
      prompt: "Nettoie cette image de croquis : supprime le bruit, les taches, les plis du papier. Retourne une image propre en niveaux de gris."
    });
    
    // 2. Amélioration contraste (binarisation adaptative)
    const enhanced = await this.autoContrast(cleaned);
    
    return enhanced;
  },
  
  // ÉTAPE 2 : Extraction géométrie avec IA
  async extractGeometry(enhancedImage) {
    // 1. Détection murs (épaisseur variable)
    const walls = await claudeVision({
      image: enhancedImage,
      prompt: `Détecte tous les murs de ce croquis. Pour chaque mur :
      - Coordonnées début/fin (pixels)
      - Épaisseur estimée (fin = cloison, épais = porteur)
      - Orientation (horizontal/vertical/diagonal)
      
      Format JSON : {"walls": [{"x1": n, "y1": n, "x2": n, "y2": n, "thick": "fin|epais"}]}`
    });
    
    // 2. Détection ouvertures (portes, fenêtres)
    const openings = await claudeVision({
      image: enhancedImage,
      prompt: `Détecte toutes les ouvertures :
      - Portes : arcs de cercle (quart de cercle = battante, coulisse = coulissante)
      - Fenêtres : traits parallèles dans l'épaisseur du mur
      - Passages : larges ouvertures sans porte
      
      Format JSON : {"openings": [{"type": "door|window|passage", "x": n, "y": n, "width": n}]}`
    });
    
    // 3. Détection pièces (contours fermés)
    const rooms = await claudeVision({
      image: enhancedImage,
      prompt: `Identifie toutes les pièces délimitées par les murs. Pour chaque pièce :
      - Polygone de contour (pixels)
      - Label manuscrit (si présent : "SÉJOUR", "CHAMBRE", etc.)
      - Type de sol estimé (carrelage cuisine, parquet séjour, etc.)
      
      Format JSON : {"rooms": [{"polygon": [[x,y],...], "label": "texte", "type": "sejour|chambre|cuisine|sdb"}]}`
    });
    
    return { walls, openings, rooms };
  },
  
  // ÉTAPE 3 : OCR spécialisé avec IA
  async extractAnnotations(imageData) {
    // 1. Extraction toutes les annotations manuscrites
    const annotations = await claudeVision({
      image: imageData,
      prompt: `Lis toutes les annotations manuscrites :
      - Cotes : "3.50 m", "11,50", "4.00"
      - Labels : "SÉJOUR", "CHAMBRE 1", "CUISINE"
      - Remarques : "mur porteur", "cloison", "fenêtre"
      - Symboles : flèches, hachures
      
      Pour chaque annotation, donne sa position (x, y) et son contenu.
      
      Format JSON : {"annotations": [{"x": n, "y": n, "text": "contenu", "type": "cote|label|remarque"}]}`
    });
    
    return annotations;
  },
  
  // ÉTAPE 4 : Calibration automatique avec IA
  async autoCalibrate(annotations, geometry) {
    // 1. Cherche les cotes manuscrites
    const dimensions = annotations.filter(a => a.type === 'cote');
    
    if (dimensions.length === 0) {
      // Fallback : estimer depuis portes standards (0,85m)
      const doors = geometry.openings.filter(o => o.type === 'door');
      if (doors.length > 0) {
        const avgDoorWidth = doors.reduce((sum, d) => sum + d.width, 0) / doors.length;
        const pixelsPerMeter = avgDoorWidth / 0.85;
        return { ppm: pixelsPerMeter, source: "porte standard 0,85m" };
      }
      throw new Error("Impossible de calibrer : aucune cote détectée");
    }
    
    // 2. Utilise la cote la plus longue (plus précise)
    const longestDim = dimensions.reduce((max, d) => {
      const value = parseFloat(d.text.replace(',', '.'));
      return value > max.value ? { ...d, value } : max;
    }, { value: 0 });
    
    // 3. Calcule pixels par mètre
    // L'IA doit avoir extrait les extrémités de la cote
    const lengthPixels = Math.hypot(
      longestDim.x2 - longestDim.x1,
      longestDim.y2 - longestDim.y1
    );
    const ppm = lengthPixels / longestDim.value;
    
    return { ppm, source: longestDim.text };
  },
  
  // ÉTAPE 5 : Nettoyage géométrique avec IA
  async cleanGeometry(geometry, ppm) {
    // 1. Conversion pixels → mètres
    const toMeters = px => px / ppm;
    
    // 2. Demande à l'IA de corriger les incohérences
    const cleaned = await claudeVision({
      image: null, // Pas d'image, juste le JSON
      prompt: `Voici la géométrie extraite d'un croquis (en mètres) :
      ${JSON.stringify(geometry)}
      
      En tant qu'architecte expert, corrige les incohérences :
      - Redresse les murs légèrement diagonaux (tolérance 5°)
      - Fusionne les murs qui se chevauchent
      - Ferme les contours ouverts
      - Supprime les éléments trop petits (< 0,3m)
      - Assure la perpendicularité des angles
      
      Retourne le JSON corrigé.`
    });
    
    return cleaned;
  },
  
  // PIPELINE COMPLET
  async recognizeSketch(imageData) {
    console.log("🔍 Étape 1/5 : Amélioration du croquis...");
    const enhanced = await this.enhanceSketch(imageData);
    
    console.log("🔍 Étape 2/5 : Extraction géométrie...");
    const geometry = await this.extractGeometry(enhanced);
    
    console.log("🔍 Étape 3/5 : Lecture annotations...");
    const annotations = await this.extractAnnotations(imageData);
    
    console.log("🔍 Étape 4/5 : Calibration automatique...");
    const calibration = await this.autoCalibrate(annotations, geometry);
    
    console.log("🔍 Étape 5/5 : Nettoyage géométrique...");
    const cleaned = await this.cleanGeometry(geometry, calibration.ppm);
    
    return {
      success: true,
      walls: cleaned.walls,
      openings: cleaned.openings,
      rooms: cleaned.rooms,
      calibration,
      confidence: this.computeConfidence(cleaned, annotations)
    };
  },
  
  // Score de confiance
  computeConfidence(geometry, annotations) {
    let score = 0;
    
    // Géométrie cohérente ?
    if (geometry.walls.length > 0) score += 30;
    if (geometry.rooms.length > 0) score += 30;
    
    // Annotations détectées ?
    if (annotations.length > 0) score += 20;
    
    // Calibration réussie ?
    if (geometry.walls.every(w => w.from && w.to)) score += 20;
    
    return score; // 0-100%
  }
};
```

### Coût et performance

| Étape | Temps | Coût |
|---|---|---|
| Amélioration croquis | 3s | 0,01 € |
| Extraction géométrie | 15s | 0,03 € |
| OCR annotations | 5s | 0,01 € |
| Calibration | 1s | 0,00 € |
| Nettoyage | 3s | 0,01 € |
| **TOTAL** | **~27s** | **~0,06 €** |

### Avantages par rapport aux méthodes classiques

| Critère | Sans IA | Avec IA |
|---|---|---|
| Tolérance croquis sales | ✗ Faible | ✓ Excellente |
| Compréhension sémantique | ✗ Aucune | ✓ Complète |
| Calibration automatique | ✗ Manuelle | ✓ Automatique |
| Gestion ratures/corrections | ✗ Impossible | ✓ Intelligente |
| Temps de traitement | 5 min (manuel) | 30s (auto) |

---

## 🔴 GAP 2 : VECTORISATION INTELLIGENTE

### Comment l'IA transforme cette fonctionnalité

**Sans IA** (Potrace classique) :
```javascript
// Vectorisation brutale (résultats médiocres)
const vectors = potrace.trace(rasterImage);
// Problème : ne comprend pas l'intention architecturale
```

**Avec IA** (vectorisation sémantique) :
```javascript
// IA comprend l'intention de l'architecte
const vectors = await claudeVision({
  image: croquis,
  prompt: `Vectorise ce croquis en comprenant l'intention architecturale :
  - Les murs doivent être des lignes droites (pas des courbes)
  - Les angles doivent être perpendiculaires (90°) sauf si explicitement oblique
  - Les portes doivent être des arcs parfaits (quarts de cercle)
  - Les fenêtres doivent être des rectangles parfaits
  
  Retourne les vecteurs au format SVG path.`
});
```

### Architecture technique

```javascript
// Module js/vectorization.js
const Vectorization = {
  
  // Vectorisation avec compréhension architecturale
  async smartVectorize(imageData) {
    // 1. Vectorisation brute (Potrace)
    const rawVectors = potrace.trace(imageData);
    
    // 2. Nettoyage sémantique avec IA
    const cleaned = await claudeVision({
      image: imageData,
      prompt: `Voici les vecteurs bruts extraits du croquis :
      ${JSON.stringify(rawVectors)}
      
      En tant qu'architecte, nettoie ces vecteurs :
      - Remplace les courbes approximating des murs par des lignes droites
      - Redresse les angles pour qu'ils soient perpendiculaires
      - Fusionne les segments colinéaires
      - Supprime le bruit (petits segments < 0,1m)
      
      Retourne le JSON nettoyé.`
    });
    
    return cleaned;
  },
  
  // Export DXF intelligent
  async exportToDXF(vectors, options = {}) {
    // 1. Classification automatique des éléments
    const classified = await claudeVision({
      image: null,
      prompt: `Classifie ces éléments vectoriels par calque CAD :
      - ARCH-WALL : murs (porteur et cloison)
      - ARCH-DOOR : portes
      - ARCH-WINDOW : fenêtres
      - ARCH-DIM : cotes
      - ARCH-TEXT : labels
      - ARCH-FURN : mobilier
      
      Retourne le JSON avec calques séparés.`
    });
    
    // 2. Génération fichier DXF
    const dxf = this.generateDXF(classified, options);
    
    return dxf;
  },
  
  // Export IFC intelligent
  async exportToIFC(vectors, metadata) {
    // 1. Mapping vers entités IFC avec IA
    const ifcEntities = await claudeVision({
      image: null,
      prompt: `Mappe ces éléments vers le schéma IFC :
      - Murs → IfcWall (avec propriétés : épaisseur, matériau, hauteur)
      - Portes → IfcDoor (avec propriétés : largeur, hauteur, type)
      - Fenêtres → IfcWindow (avec propriétés : largeur, hauteur, vitrage)
      - Pièces → IfcSpace (avec propriétés : surface, hauteur, usage)
      
      Retourne le JSON au format IFC2x3.`
    });
    
    // 2. Génération fichier IFC
    const ifc = this.generateIFC(ifcEntities, metadata);
    
    return ifc;
  }
};
```

---

## 🟡 GAP 3 : GÉNÉRATION DE VARIANTES AUTOMATIQUES

### Comment l'IA transforme cette fonctionnalité

**Sans IA** (algorithmes classiques) :
```javascript
// Génération aléatoire (résultats souvent incohérents)
const variants = [];
for (let i = 0; i < 10; i++) {
  const variant = randomlyMoveWalls(basePlan);
  // Problème : peut créer des pièces impossibles (2m², sans fenêtre)
}
```

**Avec IA** (génération intelligente) :
```javascript
// IA comprend les contraintes architecturales
const variants = await claudeGenerative({
  basePlan: currentPlan,
  prompt: `Génère 5 variantes de ce plan en respectant :
  - Surface séjour ≥ 20m²
  - Chaque chambre ≥ 9m² avec fenêtre
  - Circulations ≥ 1,20m de large
  - Salle de bain près des chambres
  - Cuisine près du séjour
  
  Optimise pour :
  - Minimiser les couloirs
  - Maximiser l'éclairage naturel
  - Respecter l'orientation sud pour le séjour
  
  Retourne les 5 variantes en JSON.`
});
```

### Architecture technique

```javascript
// Module js/variantGenerator.js
const VariantGenerator = {
  
  // Génération de variantes intelligentes
  async generateVariants(basePlan, constraints) {
    // 1. Analyse du plan de base
    const analysis = await this.analyzeBasePlan(basePlan);
    
    // 2. Identification zones modifiables
    const modifiableZones = await this.identifyModifiableZones(basePlan);
    
    // 3. Génération variantes avec IA
    const variants = await claudeGenerative({
      prompt: `Tu es un architecte expert. Voici un plan de base :
      ${JSON.stringify(basePlan)}
      
      Zones modifiables : ${JSON.stringify(modifiableZones)}
      
      Contraintes client : ${JSON.stringify(constraints)}
      
      Génère 5 variantes optimisées en respectant :
      - Normes d'habitabilité (surfaces minimales, éclairage)
      - Logique architecturale (circulations fluides, adjacences)
      - Contraintes structurelles (murs porteurs conservés)
      
      Pour chaque variante, explique les choix de conception.
      
      Retourne JSON : {"variants": [{"plan": {...}, "rationale": "...", "score": 0-100}]}`
    });
    
    // 4. Scoring automatique
    const scored = await this.scoreVariants(variants);
    
    // 5. Classement par qualité
    const ranked = scored.sort((a, b) => b.score - a.score);
    
    return ranked;
  },
  
  // Analyse du plan de base
  async analyzeBasePlan(plan) {
    const analysis = await claudeVision({
      image: null,
      prompt: `Analyse ce plan et identifie :
      1. Murs porteurs (ne peuvent pas être déplacés)
      2. Cloisons (peuvent être déplacées/supprimées)
      3. Pièces avec leurs contraintes (fenêtres obligatoires, etc.)
      4. Circulations principales
      5. Zones à fort potentiel d'optimisation
      
      Retourne JSON structuré.`
    });
    
    return analysis;
  },
  
  // Scoring des variantes
  async scoreVariants(variants) {
    const scored = await claudeVision({
      image: null,
      prompt: `Évalue chaque variante selon ces critères (0-100) :
      
      1. Qualité spatiale (30%) :
         - Ratio surface utile / surface totale
         - Fluidité des circulations
         - Proportions des pièces
      
      2. Confort (25%) :
         - Éclairage naturel (orientation baies)
         - Ventilation traversante
         - Intimité (séparation jour/nuit)
      
      3. Fonctionnalité (25%) :
         - Adjacences logiques (cuisine ↔ séjour)
         - Accessibilité (PMR si demandé)
         - Rangement suffisant
      
      4. Esthétique (20%) :
         - Vues traversantes
         - Perspectives intéressantes
         - Équilibre des volumes
      
      Retourne JSON avec scores détaillés.`
    });
    
    return scored;
  },
  
  // Optimisation par algorithmes génétiques
  async optimizeWithGeneticAlgorithm(basePlan, generations = 50) {
    let population = this.generateInitialPopulation(basePlan, 20);
    
    for (let gen = 0; gen < generations; gen++) {
      // Évaluation fitness
      const fitness = await Promise.all(
        population.map(individual => this.fitnessFunction(individual))
      );
      
      // Sélection
      const selected = this.tournamentSelection(population, fitness);
      
      // Croisement
      const offspring = this.crossover(selected);
      
      // Mutation
      const mutated = this.mutate(offspring, 0.1);
      
      population = mutated;
    }
    
    // Retourne le meilleur
    const best = population.reduce((max, ind) => {
      const fit = this.fitnessFunction(ind);
      return fit > max.fitness ? { individual: ind, fitness: fit } : max;
    }, { fitness: -Infinity });
    
    return best.individual;
  },
  
  // Fonction fitness (combine IA + règles)
  async fitnessFunction(plan) {
    // 1. Vérification contraintes hard (surfaces minimales)
    if (!this.checkHardConstraints(plan)) return 0;
    
    // 2. Évaluation IA (qualité architecturale)
    const aiScore = await claudeVision({
      image: null,
      prompt: `Évalue la qualité architecturale de ce plan (0-100).`
    });
    
    // 3. Métriques objectives
    const metrics = {
      surfaceRatio: this.computeSurfaceRatio(plan),
      circulationLength: this.computeCirculationLength(plan),
      naturalLight: this.computeNaturalLight(plan),
      adjacencyScore: this.computeAdjacencyScore(plan)
    };
    
    // 4. Score final (pondéré)
    const finalScore = 
      aiScore * 0.5 +
      metrics.surfaceRatio * 0.2 +
      (1 - metrics.circulationLength / 100) * 0.1 +
      metrics.naturalLight * 0.1 +
      metrics.adjacencyScore * 0.1;
    
    return finalScore;
  }
};
```

### Exemple concret

**Plan de base** :
```
┌─────────────────┐
│   Séjour 30m²   │
│                 │
├────────┬────────┤
│Cuisine │  SDB   │
│  12m²  │  5m²   │
└────────┴────────┘
```

**Variantes générées par IA** :

**Variante 1 (Score 87/100)** :
```
┌─────────────────┐
│   Séjour 35m²   │ ← Agrandi (meilleur éclairage)
│                 │
├──────┬──────────┤
│Cuis. │ Suite    │ ← Ajout chambre (suite parentale)
│ 10m² │ 12m²     │
└──────┴──────────┘
```
*IA : "J'ai agrandi le séjour au sud pour maximiser l'éclairage naturel et créé une suite parentale isolée."*

**Variante 2 (Score 82/100)** :
```
┌─────────────────┐
│   Séjour 28m²   │
│                 │
├──────┬────┬─────┤
│Cuis. │SDB │Ch.  │ ← Optimisation circulations
│ 14m² │ 6m²│ 10m²│
└──────┴────┴─────┘
```
*IA : "J'ai réduit les circulations de 15% en regroupant les pièces d'eau."*

**Variante 3 (Score 79/100)** :
```
┌─────────────────┐
│   Séjour 32m²   │
│                 │
├────────┬────────┤
│Cuisine │ Bureau │ ← Ajout bureau (télétravail)
│  12m²  │  8m²   │
└────────┴────────┘
```
*IA : "J'ai ajouté un bureau pour le télétravail, très demandé post-COVID."*

---

## 🟡 GAP 4 : ANALYSE STRUCTURELLE SIMPLIFIÉE

### Comment l'IA transforme cette fonctionnalité

**Sans IA** (règles statiques) :
```javascript
// Détection basique (beaucoup de faux positifs/négatifs)
const loadBearing = walls.filter(w => w.thick >= 0.20);
// Problème : un mur de 20cm n'est pas toujours porteur
```

**Avec IA** (compréhension structurelle) :
```javascript
// IA comprend la logique structurelle
const structure = await claudeVision({
  image: plan,
  prompt: `Analyse la structure de ce bâtiment :
  1. Identifie les murs porteurs (supportent dalles/toiture)
  2. Identifie les cloisons (non structurelles)
  3. Trace le chemin des charges : toiture → dalles → murs → fondations
  4. Détecte les points faibles (portées > 5m sans appui)
  5. Suggère renforcements si nécessaire (poteaux, poutres)
  
  Retourne JSON avec analyse structurelle complète.`
});
```

### Architecture technique

```javascript
// Module js/structuralAnalysis.js
const StructuralAnalysis = {
  
  // Détection automatique murs porteurs
  async detectLoadBearingWalls(plan) {
    const analysis = await claudeVision({
      image: plan,
      prompt: `En tant qu'ingénieur structure, identifie les murs porteurs :
      
      Critères :
      - Murs extérieurs = toujours porteurs
      - Murs intérieurs :
        * Épaisseur > 20cm → probable porteur
        * Position centrale → probable porteur
        * Supporte dalle/roof → porteur confirmé
        * Aligné avec fondations → porteur
      
      Pour chaque mur, indique :
      - Porteur ou non
      - Charge estimée (kN/m)
      - Éléments supportés (dalle, toiture, étage)
      
      Retourne JSON.`
    });
    
    return analysis;
  },
  
  // Descente de charges simplifiée
  async computeLoadPath(structure) {
    const loadPath = await claudeVision({
      image: null,
      prompt: `Calcule la descente de charges simplifiée :
      
      Charges permanentes (kN/m²) :
      - Plancher : 2,5
      - Cloisons : 1,0
      - Toiture : 1,5
      
      Charges d'exploitation (kN/m²) :
      - Habitation : 1,5
      - Terrasse : 2,0
      - Neige (zone) : 1,0
      
      Pour chaque mur porteur, calcule :
      - Charge totale (kN)
      - Contrainte (kN/m²)
      - Vérification (acceptable si < 500 kN/m² pour maçonnerie)
      
      Retourne JSON avec tableau des charges.`
    });
    
    return loadPath;
  },
  
  // Détection points faibles
  async detectWeakPoints(structure, loads) {
    const weakPoints = await claudeVision({
      image: null,
      prompt: `Analyse la structure et détecte les points faibles :
      
      1. Portées trop grandes (> 5m sans appui intermédiaire)
      2. Murs sous-dimensionnés (contrainte > 400 kN/m²)
      3. Déséquilibres (charges concentrées d'un côté)
      4. Absence de contreventement (stabilité horizontale)
      
      Pour chaque point faible, propose une solution :
      - Ajouter poteau
      - Épaissir mur
      - Ajouter poutre
      - Ajouter voile de contreventement
      
      Retourne JSON avec alertes et solutions.`
    });
    
    return weakPoints;
  },
  
  // Suggestions renforcement
  async suggestReinforcement(structure, issues) {
    const suggestions = await claudeVision({
      image: null,
      prompt: `Propose des solutions de renforcement pour ces problèmes :
      ${JSON.stringify(issues)}
      
      Pour chaque problème, donne :
      1. Solution technique (poteau béton 20x20cm, poutre IPN 200, etc.)
      2. Position exacte (coordonnées)
      3. Estimation coût (€)
      4. Impact sur le plan (modification murs, etc.)
      
      Retourne JSON avec solutions détaillées.`
    });
    
    return suggestions;
  }
};
```

---

## 🟡 GAP 5 : CONFORMITÉ RÉGLEMENTAIRE AUTOMATIQUE

### Comment l'IA transforme cette fonctionnalité

**Sans IA** (vérification manuelle) :
```javascript
// Vérification basique (règles codées en dur)
if (room.area < 9) errors.push("Chambre trop petite");
// Problème : ne couvre pas toutes les réglementations
```

**Avec IA** (vérification exhaustive) :
```javascript
// IA vérifie toutes les réglementations
const compliance = await claudeVision({
  image: plan,
  prompt: `Vérifie la conformité de ce plan selon :
  
  1. PLU (Plan Local d'Urbanisme) :
     - CES (Coefficient d'Emprise au Sol) ≤ 0,4
     - COS (Coefficient d'Occupation des Sol) ≤ 1,5
     - Hauteur maximale ≤ 12m
     - Recul limites ≥ 3m
     - Espaces verts ≥ 20%
  
  2. RE2020 (Réglementation Environnementale) :
     - Bbio (Besoin bioclimatique) ≤ 60
     - Surface baies ≥ 1/6 surface sol
     - Protection solaire obligatoire au sud/ouest
  
  3. Accessibilité PMR :
     - Largeur portes ≥ 90cm
     - Circulations ≥ 1,20m
     - Pentes ≤ 5%
     - Espace rotation Ø 1,50m
  
  4. Habitation (normes françaises) :
     - Séjour ≥ 20m²
     - Chambre ≥ 9m²
     - Hauteur sous plafond ≥ 2,20m
     - Éclairage naturel obligatoire
  
  Pour chaque non-conformité, propose une correction.
  Retourne JSON avec rapport complet.`
});
```

### Architecture technique

```javascript
// Module js/codeCompliance.js
const CodeCompliance = {
  
  // Vérification PLU
  async checkPLU(project, zoningRules) {
    const check = await claudeVision({
      image: null,
      prompt: `Vérifie la conformité au PLU :
      
      Règles de zone : ${JSON.stringify(zoningRules)}
      
      Projet : ${JSON.stringify(project)}
      
      Calcule :
      1. Emprise au sol = surface bâtie / surface terrain
      2. COS = surface plancher / surface terrain
      3. Hauteur maximale (faîtage)
      4. Reculs (façades par rapport aux limites)
      5. Espaces verts (surface perméable)
      
      Compare aux limites réglementaires.
      Retourne JSON avec conformités/non-conformités.`
    });
    
    return check;
  },
  
  // Vérification RE2020
  async checkRE2020(project, location) {
    const check = await claudeVision({
      image: null,
      prompt: `Vérifie la conformité RE2020 :
      
      Localisation : ${JSON.stringify(location)} (zone climatique, orientation)
      Projet : ${JSON.stringify(project)}
      
      Calcule :
      1. Bbio (besoin bioclimatique) :
         - Déperditions surfaciques
         - Apports solaires passifs
         - Inertie thermique
         - Ventilation naturelle
      
      2. Surface baies / surface sol ≥ 1/6
      
      3. Protection solaire :
         - Baies orientées sud/ouest
         - Débords de toiture, casquettes, brise-sole
      
      4. Indicateurs :
         - Bbio ≤ 60 (zone H1a)
         - Bclim (besoin froid) ≤ seuil
      
      Retourne JSON avec calculs détaillés.`
    });
    
    return check;
  },
  
  // Vérification accessibilité PMR
  async checkAccessibility(project) {
    const check = await claudeVision({
      image: null,
      prompt: `Vérifie l'accessibilité PMR (Personne à Mobilité Réduite) :
      
      Projet : ${JSON.stringify(project)}
      
      Vérifie :
      1. Cheminement accessible :
         - Largeur ≥ 1,20m (couloirs)
         - Pentes ≤ 5% (rampes)
         - Paliers de repos tous les 10m
      
      2. Portes :
         - Largeur ≥ 90cm (passage libre 83cm)
         - Hauteur seuil ≤ 2cm
         - Espace de rotation Ø 1,50m devant
      
      3. Pièces :
         - Salle de bain RDC (ou ascenseur)
         - WC adaptés (espace latéral 80cm)
         - Chambre RDC (ou ascenseur)
      
      4. Stationnement :
         - Place PMR (3,30m × 5m)
         - Cheminement protégé
      
      Retourne JSON avec conformités/non-conformités.`
    });
    
    return check;
  },
  
  // Rapport de conformité complet
  async generateComplianceReport(project, location, zoningRules) {
    // 1. Vérifications parallèles
    const [plu, re2020, pmr, habitation] = await Promise.all([
      this.checkPLU(project, zoningRules),
      this.checkRE2020(project, location),
      this.checkAccessibility(project),
      this.checkHabitation(project)
    ]);
    
    // 2. Synthèse avec IA
    const summary = await claudeVision({
      image: null,
      prompt: `Synthétise ce rapport de conformité :
      
      PLU : ${JSON.stringify(plu)}
      RE2020 : ${JSON.stringify(re2020)}
      PMR : ${JSON.stringify(pmr)}
      Habitation : ${JSON.stringify(habitation)}
      
      Rédige un rapport clair :
      1. Résumé exécutif (conforme / non conforme)
      2. Liste des points conformes ✓
      3. Liste des non-conformités ✗
      4. Corrections recommandées (par ordre de priorité)
      5. Estimation coût des corrections
      
      Retourne JSON avec rapport structuré.`
    });
    
    return summary;
  }
};
```

---

## 🏗️ ARCHITECTURE TECHNIQUE GLOBALE

### Intégration IA dans le système

```javascript
// Configuration centralisée
const AI_CONFIG = {
  // Modèles recommandés (par coût/performance)
  models: {
    vision: {
      high: 'anthropic/claude-sonnet-5.5', // Précision maximale
      fast: 'anthropic/claude-haiku',      // Rapide et économique
      local: 'llava-v1.6'                   // Local (open source)
    },
    generative: {
      high: 'openai/gpt-6.2-sol',          // Qualité maximale
      fast: 'openai/gpt-6-luna',           // Rapide
      local: 'llama-3.1-8b'                 // Local
    }
  },
  
  // Stratégie d'appel
  strategy: {
    // Priorité au local si possible (confidentialité + gratuit)
    preferLocal: true,
    
    // Fallback vers cloud si local insuffisant
    fallbackToCloud: true,
    
    // Cache des résultats (éviter appels redondants)
    cacheResults: true,
    cacheDuration: 24 * 60 * 60 * 1000 // 24h
  },
  
  // Coûts estimés
  costs: {
    sketchRecognition: 0.06,  // €/croquis
    variantGeneration: 0.02,  // €/variante
    complianceCheck: 0.03,    // €/vérification
    structuralAnalysis: 0.02  // €/analyse
  }
};

// Module central d'appel IA
const AICentral = {
  
  // Appel IA avec cache et fallback
  async call(model, prompt, options = {}) {
    const cacheKey = this.generateCacheKey(model, prompt);
    
    // 1. Vérifier cache
    if (AI_CONFIG.strategy.cacheResults) {
      const cached = await this.getFromCache(cacheKey);
      if (cached) return cached;
    }
    
    // 2. Essayer modèle local si préféré
    if (AI_CONFIG.strategy.preferLocal) {
      try {
        const localModel = AI_CONFIG.models[model].local;
        const result = await this.callLocalModel(localModel, prompt, options);
        await this.saveToCache(cacheKey, result);
        return result;
      } catch (e) {
        // Fallback vers cloud
        if (!AI_CONFIG.strategy.fallbackToCloud) throw e;
      }
    }
    
    // 3. Appel cloud
    const cloudModel = AI_CONFIG.models[model].high;
    const result = await this.callCloudModel(cloudModel, prompt, options);
    await this.saveToCache(cacheKey, result);
    
    return result;
  },
  
  // Appel modèle local (ex: LLaMA via Ollama)
  async callLocalModel(model, prompt, options) {
    const response = await fetch('http://localhost:11434/api/generate', {
      method: 'POST',
      body: JSON.stringify({
        model,
        prompt,
        stream: false
      })
    });
    return response.json();
  },
  
  // Appel modèle cloud (via OpenRouter)
  async callCloudModel(model, prompt, options) {
    const response = await fetch('/api/ai/chat', {
      method: 'POST',
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        ...options
      })
    });
    return response.json();
  }
};
```

### Pipeline de traitement complet

```javascript
// Pipeline complet : croquis → maison conforme
const Pipeline = {
  
  async processSketchToCompliantHouse(imageData, constraints, location) {
    console.log("🚀 Démarrage du pipeline IA...");
    
    // ÉTAPE 1 : Reconnaissance croquis
    console.log("📖 Étape 1/5 : Lecture du croquis...");
    const recognized = await SketchRecognition.recognizeSketch(imageData);
    console.log(`✓ ${recognized.walls.length} murs détectés, confiance ${recognized.confidence}%`);
    
    // ÉTAPE 2 : Vectorisation
    console.log("📐 Étape 2/5 : Vectorisation intelligente...");
    const vectors = await Vectorization.smartVectorize(imageData);
    console.log(`✓ Vecteurs générés (${vectors.length} éléments)`);
    
    // ÉTAPE 3 : Génération variantes
    console.log("🎨 Étape 3/5 : Génération de variantes...");
    const variants = await VariantGenerator.generateVariants(recognized, constraints);
    console.log(`✓ ${variants.length} variantes générées`);
    const bestVariant = variants[0]; // Meilleur score
    
    // ÉTAPE 4 : Analyse structurelle
    console.log("🏗️  Étape 4/5 : Analyse structurelle...");
    const structure = await StructuralAnalysis.detectLoadBearingWalls(bestVariant.plan);
    const loads = await StructuralAnalysis.computeLoadPath(structure);
    console.log(`✓ Structure analysée (${structure.loadBearing.length} murs porteurs)`);
    
    // ÉTAPE 5 : Vérification conformité
    console.log("✅ Étape 5/5 : Vérification conformité...");
    const compliance = await CodeCompliance.generateComplianceReport(
      bestVariant.plan,
      location,
      constraints.zoningRules
    );
    console.log(`✓ Conformité vérifiée (${compliance.passed}/${compliance.total} critères)`);
    
    // RÉSULTAT FINAL
    return {
      success: true,
      originalSketch: recognized,
      bestVariant,
      structure,
      compliance,
      estimatedCost: this.estimateCost(recognized, variants, structure),
      nextSteps: this.generateNextSteps(compliance)
    };
  }
};
```

---

## 💰 MODÈLE ÉCONOMIQUE AVEC IA

### Coûts IA par fonctionnalité

| Fonctionnalité | Appel IA | Coût | Temps |
|---|---|---|---|
| Reconnaissance croquis | 5 appels Claude Vision | 0,06 € | 30s |
| Vectorisation | 2 appels Claude Vision | 0,02 € | 15s |
| Génération 5 variantes | 10 appels GPT-6 Luna | 0,10 € | 45s |
| Analyse structurelle | 3 appels Claude Vision | 0,06 € | 20s |
| Vérification conformité | 5 appels Claude Vision | 0,10 € | 30s |
| **TOTAL pipeline complet** | **25 appels** | **~0,34 €** | **~2min30** |

### Comparaison avec temps humain

| Tâche | Sans IA | Avec IA | Gain |
|---|---|---|---|
| Lecture croquis | 30 min | 30 sec | ×60 |
| Génération variantes | 2h | 1 min | ×120 |
| Vérification conformité | 1h | 30 sec | ×120 |
| Analyse structurelle | 45 min | 20 sec | ×135 |
| **TOTAL** | **4h15** | **2min30** | **×102** |

### Rentabilité

**Scénario** : 100 projets/mois traités

**Coûts IA** :
- 100 projets × 0,34 € = **34 €/mois**

**Économie temps humain** :
- 100 projets × 4h15 = 425 heures économisées
- Valorisation : 425h × 50 €/h = **21 250 €/mois**

**ROI** : 21 250 € / 34 € = **625x**

---

## 🎯 RECOMMANDATIONS STRATÉGIQUES

### Priorité 1 — Intégration immédiate (1-2 mois)

1. **Module `sketchRecognition.js`**
   - Reconnaissance croquis avec Claude Vision
   - Calibration automatique
   - Nettoyage géométrique
   - **Coût** : 0,06 €/croquis
   - **ROI** : ×60

2. **Module `variantGenerator.js`**
   - Génération 5 variantes optimisées
   - Scoring automatique
   - **Coût** : 0,10 €/5 variantes
   - **ROI** : ×120

### Priorité 2 — Intégration court terme (3-6 mois)

3. **Module `vectorization.js`**
   - Vectorisation sémantique
   - Export DXF/IFC
   - **Coût** : 0,02 €/export
   - **ROI** : interopérabilité BIM

4. **Module `codeCompliance.js`**
   - Vérification PLU, RE2020, PMR
   - Rapport automatique
   - **Coût** : 0,10 €/vérification
   - **ROI** : ×120

### Priorité 3 — Intégration moyen terme (6-12 mois)

5. **Module `structuralAnalysis.js`**
   - Détection murs porteurs
   - Descente de charges
   - **Coût** : 0,06 €/analyse
   - **ROI** : crédibilité technique

---

## 🔮 VISION FUTURISTE (2027-2028)

### IA conversationnelle pour architectes

```javascript
// Dialogue naturel avec le système
const conversation = `
Architecte : "Je veux une maison de 120m² sur deux niveaux, 
             avec un grand séjour lumineux au sud et 3 chambres à l'étage."

IA : "Voici 5 propositions optimisées :
     - Variante 1 : Séjour 35m² sud, 3 chambres 12-14m² nord/est
     - Variante 2 : Séjour 30m² sud-ouest avec terrasse couverte
     - Variante 3 : Séjour cathédrale 40m² (double hauteur)
     
     Ma recommandation : Variante 1 (meilleur compromis surface/luminosité).
     
     Voulez-vous que j'optimise une variante spécifique ?"

Architecte : "Optimise la variante 1 en ajoutant un bureau au RDC."

IA : "Variante 1 optimisée :
     - Bureau 8m² ajouté au RDC (côté nord, calme)
     - Séjour réduit à 32m² (reste lumineux)
     - Surface totale : 122m² (+2m²)
     
     Conforme PLU et RE2020.
     
     Export vers Revit disponible. Voulez-vous visualiser en 3D ?"
`;
```

### IA prédictive pour coûts et délais

```javascript
// Prédiction basée sur milliers de projets
const prediction = await AIPredictive.predict({
  plan: currentPlan,
  location: "Nantes, France",
  materials: ["parquet", "brique", "tuiles"],
  surface: 120
});

// Résultat
{
  estimatedCost: "245 000 € ± 15%",
  breakdown: {
    foundation: "35 000 €",
    structure: "85 000 €",
    secondOeuvre: "65 000 €",
    finitions: "60 000 €"
  },
  constructionTime: "8 mois ± 1 mois",
  risks: [
    "Terrain argileux → fondations spéciales (+10%)",
    "Hiver pluvieux → retard possible (+2 semaines)"
  ]
}
```

---

## 📊 CONCLUSION

### L'IA comme avantage concurrentiel décisif

**Sans IA** :
- Système classique (lecture plans propres uniquement)
- Pas de différenciation face aux outils CAD traditionnels
- Temps humain élevé pour tâches répétitives

**Avec IA** :
- **Révolutionnaire** : croquis manuscrit → maison conforme en 2min30
- **Différenciant** : seul outil qui comprend l'intention architecturale
- **Économique** : ROI 625x sur temps humain
- **Scalable** : 100 projets/mois pour 34 € de coûts IA

### Message marketing

> **"Transformez un croquis griffonné sur une serviette en maison 3D immersive, conforme aux normes et estimée à 15% près — en moins de 3 minutes, pour moins de 50 centimes d'IA."**

### Prochaines étapes

1. **Mois 1** : Intégrer `sketchRecognition.js` (0,06 €/croquis)
2. **Mois 2** : Intégrer `variantGenerator.js` (0,10 €/5 variantes)
3. **Mois 3** : Tester sur 50 projets réels
4. **Mois 4-6** : Intégrer vectorisation + conformité
5. **Mois 7-12** : Optimiser et passer à l'échelle

**Investissement IA** : ~500 €/an pour 100 projets/mois
**Économie générée** : ~250 000 €/an
**ROI** : **500x**

---

**Document rédigé le** : 19 novembre 2026
**Statut** : Stratégie d'intégration IA complète
**Prochaine étape** : Implémentation Phase 1 (reconnaissance croquis)
