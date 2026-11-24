# Documentation API — Modules Stratégiques

Documentation complète des 7 nouveaux modules implémentés pour Plan-to-3D-House.

---

## 📋 Table des matières

1. [Vectorization](#vectorization)
2. [Structural Analysis](#structural-analysis)
3. [BIM Export](#bim-export)
4. [Bioclimatic Analysis](#bioclimatic-analysis)
5. [Smart Annotations](#smart-annotations)
6. [Realtime Collaboration](#realtime-collaboration)
7. [Version Comparison](#version-comparison)

---

## Vectorization

Module de vectorisation des croquis et export vers formats vectoriels (DXF, SVG).

### Fonctions principales

#### `vectorize(sketchData, options)`
Convertit un croquis en vecteurs.

**Paramètres :**
- `sketchData` (Object) : Données du croquis
  - `strokes` (Array) : Liste des traits
  - `openings` (Array) : Liste des ouvertures
  - `walls` (Array) : Liste des murs
- `options` (Object, optionnel) :
  - `tolerance` (Number) : Tolérance de vectorisation (défaut: 5)
  - `simplify` (Boolean) : Simplifier les vecteurs (défaut: true)

**Retourne :** Object avec `vectors`, `stats`

**Exemple :**
```javascript
const result = Vectorization.vectorize({
  strokes: [{ points: [{x: 0, y: 0}, {x: 100, y: 0}] }],
  openings: [],
  walls: []
}, { tolerance: 5 });

console.log(result.vectors); // Vecteurs normalisés
console.log(result.stats); // { wallCount, openingCount, totalLength }
```

#### `exportToDXF(vectors, options)`
Exporte les vecteurs au format DXF.

**Paramètres :**
- `vectors` (Array) : Vecteurs à exporter
- `options` (Object, optionnel) :
  - `unit` (String) : Unité ('mm', 'cm', 'm') - défaut: 'mm'
  - `layer` (String) : Nom du calque - défaut: '0'

**Retourne :** String (contenu DXF)

**Exemple :**
```javascript
const dxf = Vectorization.exportToDXF(vectors, {
  unit: 'mm',
  layer: 'Walls'
});
```

#### `exportToSVG(vectors, options)`
Exporte les vecteurs au format SVG.

**Paramètres :**
- `vectors` (Array) : Vecteurs à exporter
- `options` (Object, optionnel) :
  - `width` (Number) : Largeur SVG - défaut: 800
  - `height` (Number) : Hauteur SVG - défaut: 600
  - `stroke` (String) : Couleur du trait - défaut: 'black'

**Retourne :** String (contenu SVG)

---

## Structural Analysis

Module d'analyse structurelle (charges, renforts, stabilité).

### Fonctions principales

#### `detectLoadBearingWalls(walls)`
Détecte les murs porteurs.

**Paramètres :**
- `walls` (Array) : Liste des murs

**Retourne :** Array de murs avec flag `isLoadBearing`

#### `computeLoadPath(walls, floors)`
Calcule le chemin de charge.

**Paramètres :**
- `walls` (Array) : Liste des murs
- `floors` (Array) : Liste des étages

**Retourne :** Object avec `loadPath`, `totalLoad`

#### `checkStructuralAdequacy(structure, loads)`
Vérifie l'adéquation structurelle.

**Paramètres :**
- `structure` (Object) : Données structurelles
- `loads` (Object) : Charges appliquées

**Retourne :** Object avec `isValid`, `errors`, `warnings`

#### `suggestReinforcement(structure, issues)`
Suggère des renforts.

**Paramètres :**
- `structure` (Object) : Données structurelles
- `issues` (Array) : Problèmes détectés

**Retourne :** Array de suggestions

#### `analyzeStructure(project)`
Analyse complète de la structure.

**Paramètres :**
- `project` (Object) : Projet complet

**Retourne :** Object avec `structure`, `analysis`, `recommendations`

---

## BIM Export

Module d'export vers formats BIM (IFC, gbXML).

### Fonctions principales

#### `exportToIFC(project, options)`
Exporte au format IFC (Industry Foundation Classes).

**Paramètres :**
- `project` (Object) : Projet à exporter
- `options` (Object, optionnel) :
  - `projectName` (String) : Nom du projet
  - `siteName` (String) : Nom du site
  - `buildingName` (String) : Nom du bâtiment

**Retourne :** String (contenu IFC)

**Exemple :**
```javascript
const ifc = BIMExport.exportToIFC(project, {
  projectName: 'Ma Maison',
  siteName: 'Terrain Principal',
  buildingName: 'Résidence'
});
```

#### `exportToGbXML(project, options)`
Exporte au format gbXML (Green Building XML).

**Paramètres :**
- `project` (Object) : Projet à exporter
- `options` (Object, optionnel) :
  - `buildingType` (String) : Type de bâtiment
  - `climateZone` (String) : Zone climatique

**Retourne :** String (contenu gbXML)

#### `exportAll(project, options)`
Exporte vers tous les formats.

**Retourne :** Object avec `ifc`, `gbxml`, `stats`

---

## Bioclimatic Analysis

Module d'analyse bioclimatique (orientation, ventilation, inertie).

### Fonctions principales

#### `computeBuildingOrientation(walls, openings)`
Calcule l'orientation du bâtiment.

**Paramètres :**
- `walls` (Array) : Liste des murs
- `openings` (Array) : Liste des ouvertures

**Retourne :** Object avec `orientation`, `angle`, `dominantDirection`

#### `analyzeSolarExposure(project)`
Analyse l'exposition solaire.

**Paramètres :**
- `project` (Object) : Projet avec orientation

**Retourne :** Object avec `solarGain`, `exposureByOrientation`

#### `analyzeNaturalVentilation(project)`
Analyse la ventilation naturelle.

**Paramètres :**
- `project` (Object) : Projet avec ouvertures

**Retourne :** Object avec `ventilationScore`, `crossVentilation`

#### `analyzeThermalInertia(project)`
Analyse l'inertie thermique.

**Paramètres :**
- `project` (Object) : Projet avec matériaux

**Retourne :** Object avec `inertiaScore`, `recommendations`

#### `analyzeBioclimatic(project)`
Analyse bioclimatique complète.

**Retourne :** Object avec tous les résultats et recommandations

---

## Smart Annotations

Module d'annotations intelligentes (dimensions, textes, symboles).

### Fonctions principales

#### `detectDimensions(annotations)`
Détecte les cotes de dimensions.

**Paramètres :**
- `annotations` (Array) : Liste des annotations

**Retourne :** Array de dimensions détectées

#### `detectTexts(annotations)`
Détecte les textes.

**Paramètres :**
- `annotations` (Array) : Liste des annotations

**Retourne :** Array de textes détectés

#### `detectSymbols(annotations)`
Détecte les symboles.

**Paramètres :**
- `annotations` (Array) : Liste des annotations

**Retourne :** Array de symboles détectés

#### `parseDimension(text)`
Parse une dimension textuelle.

**Paramètres :**
- `text` (String) : Texte à parser (ex: "3.50m", "250cm")

**Retourne :** Object avec `value`, `unit`

**Exemple :**
```javascript
const dim = SmartAnnotations.parseDimension("3.50m");
console.log(dim); // { value: 3.5, unit: 'm' }
```

#### `analyzeAnnotations(annotations)`
Analyse complète des annotations.

**Retourne :** Object avec `dimensions`, `texts`, `symbols`, `stats`

---

## Realtime Collaboration

Module de collaboration temps réel (sessions, conflits, historique).

### Fonctions principales

#### `createSession(projectId, initialProject)`
Crée une session de collaboration.

**Paramètres :**
- `projectId` (String) : ID du projet
- `initialProject` (Object) : Projet initial

**Retourne :** Object session

#### `joinSession(sessionId, userInfo)`
Rejoint une session.

**Paramètres :**
- `sessionId` (String) : ID de la session
- `userInfo` (Object) : { id, name, color }

**Retourne :** Object avec `session`, `user`

#### `leaveSession(sessionId, userId)`
Quitte une session.

**Paramètres :**
- `sessionId` (String) : ID de la session
- `userId` (String) : ID de l'utilisateur

#### `applyChange(sessionId, userId, change)`
Applique une modification.

**Paramètres :**
- `sessionId` (String) : ID de la session
- `userId` (String) : ID de l'utilisateur
- `change` (Object) : { type, path, value }

**Retourne :** Object avec `success`, `version`, `changeId`

**Exemple :**
```javascript
const result = RealtimeCollaboration.applyChange(
  sessionId,
  userId,
  {
    type: 'set',
    path: 'name',
    value: 'Nouveau nom'
  }
);
```

#### `undo(sessionId, userId)`
Annule la dernière modification.

#### `updateCursor(sessionId, userId, cursor)`
Met à jour la position du curseur.

**Paramètres :**
- `cursor` (Object) : { x, y }

#### `checkConflicts(sessionId, clientVersion)`
Vérifie les conflits.

**Paramètres :**
- `clientVersion` (Number) : Version du client

**Retourne :** Object avec `hasConflict`, `changes`

#### `getHistory(sessionId, options)`
Récupère l'historique.

**Paramètres :**
- `options` (Object, optionnel) : { limit, offset }

**Retourne :** Array d'historique

#### `restoreVersion(sessionId, version)`
Restaure une version précédente.

---

## Version Comparison

Module de comparaison de versions (diffs, impacts).

### Fonctions principales

#### `compareWalls(walls1, walls2, tolerance)`
Compare deux versions de murs.

**Paramètres :**
- `walls1` (Array) : Première version
- `walls2` (Array) : Deuxième version
- `tolerance` (Number) : Tolérance (défaut: 0.01)

**Retourne :** Object avec `added`, `removed`, `modified`, `unchanged`

#### `compareRooms(rooms1, rooms2)`
Compare deux versions de pièces.

**Retourne :** Object avec `added`, `removed`, `modified`, `unchanged`

#### `compareVersions(version1, version2)`
Compare deux versions complètes.

**Paramètres :**
- `version1` (Object) : Première version
- `version2` (Object) : Deuxième version

**Retourne :** Object avec `wallsDiff`, `roomsDiff`, `stats`

#### `computeImpacts(diff)`
Calcule les impacts des changements.

**Paramètres :**
- `diff` (Object) : Résultat de compareVersions

**Retourne :** Object avec `areaChange`, `roomCountChange`, `costEstimate`

#### `generateReport(comparison, impacts)`
Génère un rapport de comparaison.

**Retourne :** Object avec `summary`, `details`, `recommendations`

---

## Utilisation globale

### Import des modules

```javascript
// Dans le navigateur
<script src="js/vectorization.js"></script>
<script src="js/structuralAnalysis.js"></script>
<script src="js/bimExport.js"></script>
<script src="js/bioclimaticAnalysis.js"></script>
<script src="js/smartAnnotations.js"></script>
<script src="js/realtimeCollaboration.js"></script>
<script src="js/versionComparison.js"></script>

// Dans Node.js
const Vectorization = require('./js/vectorization.js');
const StructuralAnalysis = require('./js/structuralAnalysis.js');
// ... etc
```

### Exemple complet

```javascript
// 1. Vectoriser un croquis
const vectors = Vectorization.vectorize(sketchData);

// 2. Analyser la structure
const structure = StructuralAnalysis.analyzeStructure(project);

// 3. Analyser le bioclimatique
const bioclimatic = BioclimaticAnalysis.analyzeBioclimatic(project);

// 4. Exporter en BIM
const bimData = BIMExport.exportAll(project);

// 5. Collaborer en temps réel
const session = RealtimeCollaboration.createSession(projectId, project);
RealtimeCollaboration.joinSession(session.id, userInfo);

// 6. Comparer des versions
const comparison = VersionComparison.compareVersions(v1, v2);
const report = VersionComparison.generateReport(comparison);
```

---

## Tests

Tous les modules incluent des tests unitaires complets :

```bash
# Exécuter tous les tests
node --test tests/*.test.cjs

# Exécuter les tests d'un module spécifique
node --test tests/vectorization.test.cjs
```

**Couverture :** 244 tests unitaires, 100% de réussite
