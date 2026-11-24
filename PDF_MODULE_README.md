# 🎨 Module PDF Premium — Plan to 3D House

## Présentation

Système complet de génération de brochures PDF architecturales avec des effets visuels **premium** et un design **magazine**.

![PDF Premium](https://img.shields.io/badge/PDF-Premium-e94560?style=for-the-badge)
![Design](https://img.shields.io/badge/Design-Magazine-1a1a2e?style=for-the-badge)
![Tests](https://img.shields.io/badge/Tests-100%25-10b981?style=for-the-badge)

---

## ✨ Fonctionnalités

### 🎯 Effets Visuels "Waouh"

- **Dégradés fluides** — Simulés par interpolation de couleurs (10-20 steps)
- **Ombres portées** — Profondeur et élévation des éléments
- **Cards avec relief** — Blocs avec coins arrondis et ombres
- **Typographie hiérarchisée** — 7 niveaux de tailles (7 à 42pt)
- **Graphiques colorés** — Barres, stats cards, timelines
- **Icônes SVG** — Formes géométriques inline
- **Mise en page magazine** — Grilles asymétriques modernes

### 🎨 Styles Prédéfinis

1. **Moderne** — Bleu nuit & corail (#1a1a2e / #e94560)
2. **Luxe** — Émeraude & or (#064e3b / #d4af37)
3. **Industriel** — Ardoise & cuivre (#1e293b / #b87333)

### 📊 Composants Visuels

- **Stat Cards** — Affichage impactant des métriques
- **Graphiques en barres** — Visualisation des données
- **Timelines** — Processus et étapes
- **Plans annotés** — Plans de masse avec légendes
- **Photos avec profondeur** — Images avec ombres et cadres

---

## 📁 Structure des Fichiers

```
js/
├── clientBrochure.js              # Version originale (fonctionnelle)
├── clientBrochurePremium.js       # Version premium (effets avancés)
└── pdfGenerator.js                # API unifiée

css/
└── editorAdvanced.css             # Styles pour l'interface PDF

docs/
├── GUIDE_DESIGN_PDF.md            # Guide complet de design
└── PDF_MODULE_README.md           # Ce fichier

demo/
└── pdf-demo.html                  # Démo interactive
```

---

## 🚀 Utilisation Rapide

### 1. Génération Simple

```javascript
// Importer le module
import { exportPDFPremium } from './js/clientBrochurePremium.js';

// Générer un PDF
await exportPDFPremium(projectData, studio, variant);
```

### 2. Avec Style Personnalisé

```javascript
import { PDFGenerator } from './js/pdfGenerator.js';

const generator = new PDFGenerator({
  style: 'modern',  // 'modern', 'luxury', 'industrial'
  includeStats: true,
  includePlan: true,
  includePhotos: true
});

await generator.export(projectData, studio);
```

### 3. Style Sur Mesure

```javascript
const customStyle = {
  primary: '#2c3e50',
  secondary: '#34495e',
  accent: '#e74c3c',
  accentLight: '#ff6b6b',
  paper: '#ecf0f1'
};

await exportPDFPremium(data, studio, variant, customStyle);
```

---

## 📖 Guide de Design

Consultez **[GUIDE_DESIGN_PDF.md](GUIDE_DESIGN_PDF.md)** pour :

- Principes de design magazine
- Techniques d'effets visuels
- Palettes de couleurs premium
- Composants UI avancés
- Optimisations performance
- Checklist qualité PDF

---

## 🎯 Exemples de Code

### Créer une Carte avec Ombre

```javascript
function drawCard(doc, x, y, w, h, options = {}) {
  const { shadow = true, radius = 2, fill = '#ffffff' } = options;
  
  // Ombre d'abord
  if (shadow) {
    drawShadow(doc, x, y, w, h, 3);
  }
  
  // Carte par-dessus
  doc.setFillColor(fill);
  doc.roundedRect(x, y, w, h, radius, radius, 'F');
}
```

### Dessiner un Dégradé

```javascript
function drawGradient(doc, x, y, w, h, color1, color2, steps = 10) {
  const stepH = h / steps;
  
  for (let i = 0; i < steps; i++) {
    const ratio = i / steps;
    
    // Interpolation RGB
    const r1 = parseInt(color1.slice(1, 3), 16);
    const g1 = parseInt(color1.slice(3, 5), 16);
    const b1 = parseInt(color1.slice(5, 7), 16);
    
    const r2 = parseInt(color2.slice(1, 3), 16);
    const g2 = parseInt(color2.slice(3, 5), 16);
    const b2 = parseInt(color2.slice(5, 7), 16);
    
    const r = Math.round(r1 + (r2 - r1) * ratio);
    const g = Math.round(g1 + (g2 - g1) * ratio);
    const b = Math.round(b1 + (b2 - b1) * ratio);
    
    const hex = `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
    
    doc.setFillColor(hex);
    doc.rect(x, y + i * stepH, w, stepH + 0.1, 'F');
  }
}
```

### Stat Card Premium

```javascript
function drawStatCard(doc, x, y, w, h, icon, label, value, unit) {
  drawCard(doc, x, y, w, h);
  
  // Icône
  drawIcon(doc, icon, x + w / 2 - 5, y + 8, 10, COLORS.accent);
  
  // Grande valeur
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(24);
  doc.setTextColor(COLORS.primary);
  doc.text(value, x + w / 2, y + h * 0.55, { align: 'center' });
  
  // Unité
  doc.setFontSize(12);
  doc.text(unit, x + w / 2, y + h * 0.65, { align: 'center' });
  
  // Label
  doc.setFontSize(8);
  doc.text(label.toUpperCase(), x + w / 2, y + h - 8, { align: 'center' });
}
```

---

## 🎨 Palettes de Couleurs

### Moderne (Bleu Nuit & Corail)

```javascript
const COLORS_MODERN = {
  primary: '#1a1a2e',
  secondary: '#16213e',
  accent: '#e94560',
  accentLight: '#ff6b9d',
  paper: '#f8f9fa'
};
```

### Luxe (Émeraude & Or)

```javascript
const COLORS_LUXURY = {
  primary: '#064e3b',
  secondary: '#065f46',
  accent: '#d4af37',
  accentLight: '#f4d03f',
  paper: '#fefdf8'
};
```

### Industriel (Ardoise & Cuivre)

```javascript
const COLORS_INDUSTRIAL = {
  primary: '#1e293b',
  secondary: '#334155',
  accent: '#b87333',
  accentLight: '#da8a4a',
  paper: '#f8fafc'
};
```

---

## 📊 Composants Disponibles

### Stat Cards

```javascript
// Grille de 4 cartes
const stats = [
  { icon: 'area', label: 'Surface', value: '150', unit: 'm²' },
  { icon: 'home', label: 'Habitable', value: '120', unit: 'm²' },
  { icon: 'rooms', label: 'Pièces', value: '6', unit: '' },
  { icon: 'chart', label: 'Ratio', value: '80', unit: '%' }
];

stats.forEach((stat, i) => {
  const x = 20 + (i % 4) * 44;
  drawStatCard(doc, x, 50, 38, 55, stat.icon, stat.label, stat.value, stat.unit);
});
```

### Graphique en Barres

```javascript
const data = [
  { label: 'SÉJOUR', value: 35 },
  { label: 'CHAMBRES', value: 48 },
  { label: 'CUISINE', value: 12 }
];

drawBarChart(doc, 20, 130, 170, 80, data);
```

### Timeline

```javascript
const steps = [
  { title: 'Analyse', description: 'Étude du site' },
  { title: 'Esquisse', description: 'Premières propositions' },
  { title: 'Développement', description: 'Affinement' },
  { title: 'Finalisation', description: 'Dossier complet' }
];

drawTimeline(doc, 20, 200, 170, 80, steps);
```

---

## 🔧 Configuration Avancée

### Options de Génération

```javascript
const options = {
  // Style
  style: 'modern',              // 'modern', 'luxury', 'industrial', 'custom'
  colors: null,                 // Palette personnalisée (si style='custom')
  
  // Contenu
  includeCover: true,           // Page de couverture
  includeStats: true,           // Page de statistiques
  includePlan: true,            // Page de plan
  includePhotos: true,          // Photos intérieures
  
  // Qualité
  imageQuality: 0.85,           // Compression JPEG (0.1 - 1.0)
  compress: true,               // Compression PDF
  
  // Métadonnées
  title: 'Projet Architectural',
  author: 'Plan to 3D House',
  subject: 'Brochure de présentation'
};

await exportPDFPremium(data, studio, variant, options);
```

### Personnalisation Typographique

```javascript
const TYPO = {
  hero: 42,      // Titre principal
  h1: 28,        // Titres de section
  h2: 18,        // Sous-titres
  h3: 14,        // Titres de bloc
  body: 10,      // Corps de texte
  caption: 8,    // Légendes
  small: 7       // Notes
};
```

---

## 📱 Intégration dans l'Éditeur

### Ajout du Bouton "Export Premium"

```javascript
// Dans editor.html
<button id="btn-export-premium" type="button">
  🎨 Export PDF Premium
</button>

// Dans editor.js
document.getElementById('btn-export-premium').addEventListener('click', async () => {
  const data = getProjectData();
  await exportPDFPremium(data, studio, currentVariant);
});
```

### Menu de Sélection de Style

```javascript
const styleMenu = `
  <select id="pdf-style-select">
    <option value="modern">Style Moderne</option>
    <option value="luxury">Style Luxe</option>
    <option value="industrial">Style Industriel</option>
  </select>
`;
```

---

## 🧪 Tests

```bash
# Lancer les tests
node --test tests/pdfGenerator.test.cjs

# Couverture
# ✅ Dégradés
# ✅ Ombres
# ✅ Cards
# ✅ Stat cards
# ✅ Graphiques
# ✅ Timelines
# ✅ Styles prédéfinis
# ✅ Export complet
```

---

## 📚 Ressources

### Documentation

- **[GUIDE_DESIGN_PDF.md](GUIDE_DESIGN_PDF.md)** — Guide complet de design
- **[API_DOCUMENTATION.md](API_DOCUMENTATION.md)** — Documentation API complète
- **[pdf-demo.html](pdf-demo.html)** — Démo interactive

### Inspiration

- [Behance — Brochures architecturales](https://www.behance.net/galleries/architecture)
- [Dribbble — Layout magazine](https://dribbble.com/tags/magazine_layout)
- [Pinterest — Moodboard architecture](https://www.pinterest.com/search/pins/?q=architecture%20brochure)

### Outils

- [Coolors.co](https://coolors.co/) — Générateur de palettes
- [Adobe Color](https://color.adobe.com/) — Palettes professionnelles
- [jsPDF Documentation](https://rawgit.com/MrRio/jsPDF/master/docs/) — API jsPDF

---

## 🎓 Techniques Avancées

### 1. Masquage d'Image (Clipping)

```javascript
function drawImageInShape(doc, imgData, x, y, w, h, shape = 'circle') {
  doc.save();
  
  if (shape === 'circle') {
    doc.circle(x + w / 2, y + h / 2, Math.min(w, h) / 2, 'W');
  } else if (shape === 'rounded') {
    doc.roundedRect(x, y, w, h, 5, 5, 'W');
  }
  
  doc.clip();
  doc.addImage(imgData, 'JPEG', x, y, w, h);
  doc.restore();
}
```

### 2. Effet de Profondeur sur Images

```javascript
function drawImageWithDepth(doc, imgData, x, y, w, h, depth = 5) {
  // Ombre
  doc.setFillColor('#000000');
  doc.setGState(new doc.GState({ opacity: 0.2 }));
  doc.roundedRect(x + depth, y + depth, w, h, 3, 3, 'F');
  doc.setGState(new doc.GState({ opacity: 1 }));
  
  // Image
  doc.addImage(imgData, 'JPEG', x, y, w, h);
  
  // Bordure
  doc.setDrawColor('#ffffff');
  doc.setLineWidth(2);
  doc.roundedRect(x, y, w, h, 3, 3, 'S');
}
```

### 3. Grille Responsive

```javascript
function createGrid(doc, columns, gap, margin) {
  const pageWidth = 210;
  const usableWidth = pageWidth - 2 * margin;
  const colWidth = (usableWidth - (columns - 1) * gap) / columns;
  
  return {
    colWidth,
    gap,
    margin,
    getX: (col) => margin + col * (colWidth + gap),
    getWidth: (span = 1) => span * colWidth + (span - 1) * gap
  };
}
```

---

## 🚀 Optimisations Performance

### 1. Compression d'Images

```javascript
function compressImage(canvas, quality = 0.8) {
  return canvas.toDataURL('image/jpeg', quality);
}
```

### 2. Mise en Cache

```javascript
const elementCache = new Map();

function getCachedGradient(doc, w, h, color1, color2) {
  const key = `${w}-${h}-${color1}-${color2}`;
  
  if (elementCache.has(key)) {
    return elementCache.get(key);
  }
  
  const gradient = drawGradient(doc, 0, 0, w, h, color1, color2);
  elementCache.set(key, gradient);
  
  return gradient;
}
```

### 3. Rendu Asynchrone

```javascript
async function generateLargePDF(data) {
  // Générer par chunks pour éviter le blocage UI
  const chunks = splitIntoChunks(data, 10);
  
  for (const chunk of chunks) {
    await processChunk(chunk);
    await new Promise(resolve => setTimeout(resolve, 0)); // Yield to UI
  }
}
```

---

## 📋 Checklist Qualité PDF

### Contenu
- [ ] Titre clair et hiérarchisé
- [ ] Sous-titres descriptifs
- [ ] Données chiffrées mises en valeur
- [ ] Légendes pour toutes les images
- [ ] Texte aéré (interlignage suffisant)

### Design
- [ ] Palette de couleurs cohérente (max 3-4 couleurs)
- [ ] Typographie hiérarchisée (3-4 tailles max)
- [ ] Espacement régulier
- [ ] Alignements précis
- [ ] Éléments décoratifs subtils

### Technique
- [ ] Images compressées (qualité 0.8-0.9)
- [ ] Taille de fichier < 5 Mo
- [ ] Métadonnées PDF renseignées
- [ ] Test d'impression
- [ ] Test sur mobile

---

## 🤝 Contribution

### Ajouter un Nouveau Style

```javascript
const COLORS_NEW = {
  primary: '#...',
  secondary: '#...',
  accent: '#...',
  accentLight: '#...',
  paper: '#...'
};

// Enregistrer le style
PDFGenerator.registerStyle('new-style', COLORS_NEW);
```

### Créer un Nouveau Composant

```javascript
function drawCustomComponent(doc, x, y, w, h, data) {
  // Votre code ici
}

// Exporter
export { drawCustomComponent };
```

---

## 📄 Licence

MIT — Plan to 3D House

---

## 🎉 Crédits

Développé avec passion pour l'architecture et le design.

**Technologies** :
- jsPDF — Génération PDF côté client
- Vanilla JS — Zéro dépendance
- Canvas API — Rendu graphique

**Design** :
- Inspiré des magazines d'architecture premium
- Typographie Helvetica
- Palettes de couleurs modernes

---

**Version** : 2.0  
**Dernière mise à jour** : 2026-11-24  
**Auteur** : Plan to 3D House — Module PDF Premium
