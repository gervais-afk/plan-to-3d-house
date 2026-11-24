# 🎨 Guide de Design PDF Premium — Effets "Waouh"

## Introduction

Ce guide présente les techniques avancées pour créer des brochures PDF architecturales avec des effets visuels premium, en utilisant jsPDF dans le navigateur.

---

## 📐 Principes de Design Magazine

### 1. **Hiérarchie Typographique**

```javascript
const TYPO = {
  hero: 42,    // Titre principal page 1 — impact maximal
  h1: 28,      // Titres de section — ancre visuelle
  h2: 18,      // Sous-titres — structure
  h3: 14,      // Titres de bloc — organisation
  body: 10,    // Corps de texte — lisibilité
  caption: 8,  // Légendes — contexte
  small: 7     // Notes — détails
};
```

**Règle d'or** : Le ratio entre les tailles doit être d'au moins 1.5x pour créer une hiérarchie claire.

### 2. **Espacement et Respiration**

```javascript
// Espacement vertical
const SPACING = {
  tight: 4,    // Entre éléments liés
  normal: 8,   // Entre sections
  loose: 16,   // Entre blocs majeurs
  xl: 32       // Entre pages/chapitres
};
```

**Principe** : Plus l'espacement est grand, plus l'élément paraît important.

### 3. **Grille Asymétrique**

```
┌─────────────────────────────┐
│  ██████████                 │  ← Titre aligné à gauche
│                             │
│  ┌─────────┐  ┌─────────┐  │
│  │  Image  │  │  Stats  │  │  ← Grille 2/3 - 1/3
│  │  66%    │  │  33%    │  │
│  └─────────┘  └─────────┘  │
│                             │
│  ┌──────────────────────┐   │
│  │      Texte full      │   │  ← Bloc pleine largeur
│  └──────────────────────┘   │
└─────────────────────────────┘
```

---

## 🎨 Effets Visuels Avancés

### 1. **Dégradés (Simulés par Bandes)**

jsPDF ne supporte pas nativement les dégradés, mais on peut les simuler :

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

**Utilisation** :
```javascript
// Fond de couverture avec dégradé bleu nuit
drawGradient(doc, 0, 0, 210, 297, '#1a1a2e', '#16213e', 20);
```

### 2. **Ombres Portées**

```javascript
function drawShadow(doc, x, y, w, h, blur = 3) {
  // Simuler le flou par couches successives
  for (let i = 0; i < blur; i++) {
    const offset = i * 0.5;
    const opacity = 0.15 * (1 - i / blur);
    
    doc.setGState(new doc.GState({ opacity }));
    doc.setFillColor('#000000');
    doc.roundedRect(x + offset, y + offset, w, h, 1, 1, 'F');
  }
  
  doc.setGState(new doc.GState({ opacity: 1 }));
}
```

**Astuce** : Dessiner l'ombre AVANT l'élément principal.

### 3. **Cartes avec Profondeur**

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

**Résultat** : Éléments qui semblent "flotter" au-dessus de la page.

---

## 📊 Visualisation de Données

### 1. **Stat Cards**

```javascript
function drawStatCard(doc, x, y, w, h, icon, label, value, unit = '') {
  drawCard(doc, x, y, w, h);
  
  // Icône en haut
  drawIcon(doc, icon, x + w / 2 - 5, y + 8, 10, '#e94560');
  
  // Grande valeur
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(24);
  doc.setTextColor('#1a1a2e');
  doc.text(value, x + w / 2, y + h * 0.55, { align: 'center' });
  
  // Unité
  if (unit) {
    doc.setFontSize(12);
    doc.setTextColor('#4a4a5e');
    doc.text(unit, x + w / 2, y + h * 0.65, { align: 'center' });
  }
  
  // Label en bas
  doc.setFontSize(8);
  doc.text(label.toUpperCase(), x + w / 2, y + h - 8, { align: 'center' });
}
```

**Exemple d'utilisation** :
```javascript
drawStatCard(doc, 20, 50, 40, 50, 'area', 'Surface', '150', 'm²');
drawStatCard(doc, 65, 50, 40, 50, 'rooms', 'Pièces', '8', '');
```

### 2. **Graphiques en Barres**

```javascript
function drawBarChart(doc, x, y, w, h, data) {
  const max = Math.max(...data.map(d => d.value));
  const barH = Math.min(8, (h - 10) / data.length - 2);
  
  data.forEach((item, i) => {
    const barY = y + i * (barH + 3);
    const barW = (item.value / max) * (w - 60);
    
    // Label
    doc.setFontSize(8);
    doc.text(item.label, x, barY + barH * 0.7);
    
    // Barre avec dégradé
    drawGradient(doc, x + 50, barY, barW, barH, '#667eea', '#764ba2');
    
    // Valeur
    doc.setFont('helvetica', 'bold');
    doc.text(item.value.toString(), x + 55 + barW, barY + barH * 0.7);
  });
}
```

### 3. **Timeline Verticale**

```javascript
function drawTimeline(doc, x, y, w, h, steps) {
  const stepH = (h - 20) / steps.length;
  
  // Ligne verticale
  doc.setDrawColor('#a8a8c0');
  doc.setLineWidth(1);
  doc.line(x + 5, y + 10, x + 5, y + h - 10);
  
  steps.forEach((step, i) => {
    const stepY = y + 10 + i * stepH;
    
    // Cercle avec numéro
    doc.setFillColor('#e94560');
    doc.circle(x + 5, stepY, 3, 'F');
    
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor('#e94560');
    doc.text((i + 1).toString(), x + 5, stepY + 1, { align: 'center' });
    
    // Titre
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor('#1a1a2e');
    doc.text(step.title, x + 15, stepY + 1);
    
    // Description
    if (step.description) {
      doc.setFontSize(8);
      doc.setTextColor('#4a4a5e');
      doc.text(step.description, x + 15, stepY + 5);
    }
  });
}
```

---

## 🖼️ Mise en Page Magazine

### Page de Couverture Impactante

```javascript
function drawCoverPage(doc, data) {
  // 1. Fond avec dégradé sombre
  drawGradient(doc, 0, 0, 210, 297, '#1a1a2e', '#16213e', 20);
  
  // 2. Titre principal en blanc
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(42);
  doc.setTextColor('#ffffff');
  doc.text(data.meta.name, 20, 80, { maxWidth: 170 });
  
  // 3. Sous-titre en gris clair
  doc.setFontSize(18);
  doc.setTextColor('#a8a8c0');
  doc.text(data.meta.subtitle, 20, 95, { maxWidth: 170 });
  
  // 4. Ligne d'accent rouge
  doc.setDrawColor('#e94560');
  doc.setLineWidth(3);
  doc.line(20, 105, 80, 105);
  
  // 5. Stats en bas de page
  const stats = [
    { label: 'SURFACE', value: '150', unit: 'm²' },
    { label: 'PIÈCES', value: '8', unit: '' },
    { label: 'NIVEAUX', value: '2', unit: '' }
  ];
  
  stats.forEach((stat, i) => {
    const x = 20 + i * 60;
    
    // Valeur grande
    doc.setFontSize(32);
    doc.setTextColor('#ffffff');
    doc.text(stat.value, x, 230);
    
    // Unité
    if (stat.unit) {
      doc.setFontSize(16);
      doc.text(stat.unit, x + doc.getTextWidth(stat.value) + 2, 230);
    }
    
    // Label
    doc.setFontSize(8);
    doc.setTextColor('#a8a8c0');
    doc.text(stat.label, x, 240);
  });
}
```

### Page de Statistiques

```javascript
function drawStatsPage(doc, data) {
  // Fond blanc
  doc.setFillColor('#f8f9fa');
  doc.rect(0, 0, 210, 297, 'F');
  
  // Titre de section
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(28);
  doc.setTextColor('#1a1a2e');
  doc.text('ANALYSE DU PROJET', 20, 25);
  
  // Séparateur avec accent
  doc.setDrawColor('#e94560');
  doc.setLineWidth(2);
  doc.line(20, 30, 50, 30);
  doc.setDrawColor('#a8a8c0');
  doc.setLineWidth(0.5);
  doc.line(55, 30, 190, 30);
  
  // Grille de 4 stat cards
  const stats = [
    { icon: 'area', label: 'Surface totale', value: '180', unit: 'm²' },
    { icon: 'home', label: 'Habitable', value: '150', unit: 'm²' },
    { icon: 'rooms', label: 'Pièces', value: '8', unit: '' },
    { icon: 'chart', label: 'Ratio', value: '83', unit: '%' }
  ];
  
  stats.forEach((stat, i) => {
    const x = 20 + (i % 4) * 44;
    const y = 45;
    drawStatCard(doc, x, y, 38, 50, stat.icon, stat.label, stat.value, stat.unit);
  });
  
  // Graphique en barres
  doc.setFontSize(18);
  doc.text('RÉPARTITION PAR TYPE', 20, 120);
  
  const roomData = [
    { label: 'SÉJOUR', value: 35 },
    { label: 'CHAMBRES', value: 48 },
    { label: 'CUISINE', value: 12 },
    { label: 'SDB', value: 8 }
  ];
  
  drawBarChart(doc, 20, 130, 170, 80, roomData);
}
```

---

## 🎯 Palette de Couleurs Premium

### Palette 1 : Bleu Nuit & Corail (Moderne)

```javascript
const COLORS_MODERN = {
  primary: '#1a1a2e',      // Bleu nuit profond
  secondary: '#16213e',    // Bleu sombre
  accent: '#e94560',       // Rouge corail vif
  accentLight: '#ff6b9d',  // Rose clair
  
  dark: '#0f0f1e',
  medium: '#4a4a5e',
  light: '#a8a8c0',
  paper: '#f8f9fa'
};
```

### Palette 2 : Émeraude & Or (Luxe)

```javascript
const COLORS_LUXURY = {
  primary: '#064e3b',      // Vert émeraude profond
  secondary: '#065f46',    // Vert forêt
  accent: '#d4af37',       // Or métallique
  accentLight: '#f4d03f',  // Or clair
  
  dark: '#022c22',
  medium: '#3d5c4f',
  light: '#a7c4b5',
  paper: '#fefdf8'
};
```

### Palette 3 : Ardoise & Cuivre (Industriel)

```javascript
const COLORS_INDUSTRIAL = {
  primary: '#1e293b',      // Ardoise sombre
  secondary: '#334155',    // Ardoise moyen
  accent: '#b87333',       // Cuivre
  accentLight: '#da8a4a',  // Cuivre clair
  
  dark: '#0f172a',
  medium: '#64748b',
  light: '#cbd5e1',
  paper: '#f8fafc'
};
```

---

## ✨ Techniques Avancées

### 1. **Masquage d'Image (Clipping)**

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

### 2. **Effet de Profondeur sur Images**

```javascript
function drawImageWithDepth(doc, imgData, x, y, w, h, depth = 5) {
  // Couche de fond (ombre)
  doc.setFillColor('#000000');
  doc.setGState(new doc.GState({ opacity: 0.2 }));
  doc.roundedRect(x + depth, y + depth, w, h, 3, 3, 'F');
  doc.setGState(new doc.GState({ opacity: 1 }));
  
  // Image principale
  doc.addImage(imgData, 'JPEG', x, y, w, h);
  
  // Bordure subtile
  doc.setDrawColor('#ffffff');
  doc.setLineWidth(2);
  doc.roundedRect(x, y, w, h, 3, 3, 'S');
}
```

### 3. **Texte sur Gradient**

```javascript
function drawTextOnGradient(doc, text, x, y, fontSize, gradientColors) {
  // Dessiner le gradient en arrière-plan
  drawGradient(doc, x, y - fontSize, doc.getTextWidth(text), fontSize * 1.5, 
               gradientColors[0], gradientColors[1], 10);
  
  // Texte blanc par-dessus
  doc.setFontSize(fontSize);
  doc.setTextColor('#ffffff');
  doc.text(text, x, y);
}
```

---

## 📱 Responsive Design PDF

### Grille Flexible

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

// Utilisation
const grid = createGrid(doc, 3, 5, 20);

// Colonne 1, pleine largeur
drawCard(doc, grid.getX(0), 50, grid.getWidth(1), 30, {});

// Colonnes 2-3, demi-largeur
drawCard(doc, grid.getX(1), 85, grid.getWidth(0.5), 30, {});
drawCard(doc, grid.getX(1.5), 85, grid.getWidth(0.5), 30, {});
```

---

## 🎨 Éléments Décoratifs

### 1. **Motifs Géométriques**

```javascript
function drawGeometricPattern(doc, x, y, w, h, color = '#e94560') {
  doc.setDrawColor(color);
  doc.setLineWidth(0.3);
  
  // Lignes diagonales
  const spacing = 10;
  for (let i = 0; i < w + h; i += spacing) {
    doc.line(x + i, y, x, y + i);
  }
}
```

### 2. **Points de Séparation**

```javascript
function drawDottedSeparator(doc, x, y, width) {
  doc.setFillColor('#a8a8c0');
  
  const dotSpacing = 8;
  const numDots = Math.floor(width / dotSpacing);
  
  for (let i = 0; i < numDots; i++) {
    doc.circle(x + i * dotSpacing, y, 1, 'F');
  }
}
```

### 3. **Cadres Ornementaux**

```javascript
function drawOrnamentalFrame(doc, x, y, w, h, color = '#d4af37') {
  doc.setDrawColor(color);
  doc.setLineWidth(2);
  
  // Cadre principal
  doc.rect(x, y, w, h, 'S');
  
  // Coins décoratifs
  const cornerSize = 10;
  doc.setLineWidth(3);
  
  // Coin haut-gauche
  doc.line(x, y, x + cornerSize, y);
  doc.line(x, y, x, y + cornerSize);
  
  // Coin haut-droit
  doc.line(x + w, y, x + w - cornerSize, y);
  doc.line(x + w, y, x + w, y + cornerSize);
  
  // Coin bas-gauche
  doc.line(x, y + h, x + cornerSize, y + h);
  doc.line(x, y + h, x, y + h - cornerSize);
  
  // Coin bas-droit
  doc.line(x + w, y + h, x + w - cornerSize, y + h);
  doc.line(x + w, y + h, x + w, y + h - cornerSize);
}
```

---

## 🚀 Optimisations Performance

### 1. **Compression d'Images**

```javascript
function compressImage(canvas, quality = 0.8) {
  return canvas.toDataURL('image/jpeg', quality);
}

// Utilisation avec capture 3D
const imgData = studio.capture(shot, 1000, 659);
const compressed = compressImage(imgData, 0.85);
doc.addImage(compressed, 'JPEG', x, y, w, h);
```

### 2. **Mise en Cache des Éléments**

```javascript
const elementCache = new Map();

function getCachedGradient(doc, w, h, color1, color2) {
  const key = `${w}-${h}-${color1}-${color2}`;
  
  if (elementCache.has(key)) {
    return elementCache.get(key);
  }
  
  // Créer l'élément
  const gradient = drawGradient(doc, 0, 0, w, h, color1, color2);
  elementCache.set(key, gradient);
  
  return gradient;
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
- [ ] Espacement régulier et呼吸 (respiration)
- [ ] Alignements précis (grille respectée)
- [ ] Éléments décoratifs subtils (pas surchargés)

### Technique
- [ ] Images compressées (qualité 0.8-0.9)
- [ ] Taille de fichier < 5 Mo
- [ ] Métadonnées PDF renseignées
- [ ] Test d'impression (CMJN si besoin)
- [ ] Test sur mobile (lisibilité)

---

## 🎓 Ressources

### Typographie
- **Helvetica** : Polyvalente, moderne, lisible
- **Georgia** : Élégante, sérif, pour titres
- **Courier** : Monospace, pour données techniques

### Couleurs
- **Coolors.co** : Générateur de palettes
- **Adobe Color** : Palettes professionnelles
- **Material Design** : Système de couleurs Google

### Inspiration
- **Behance** : Portfolios de designers
- **Dribbble** : UI/UX design
- **Pinterest** : Moodboards architecturaux

---

## 💡 Conseils Finaux

1. **Less is More** : Mieux vaut moins d'éléments bien placés que trop d'effets
2. **Cohérence** : Garder la même palette et typographie sur toutes les pages
3. **Hiérarchie** : Guider l'œil du lecteur avec les tailles et couleurs
4. **Espace blanc** : Laisser respirer le contenu
5. **Test utilisateur** : Faire relire par quelqu'un d'autre avant publication

---

**Version** : 1.0  
**Dernière mise à jour** : 2026-11-24  
**Auteur** : Plan to 3D House — Module Premium PDF
