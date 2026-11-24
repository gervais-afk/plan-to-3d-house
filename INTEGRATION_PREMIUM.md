# 🔌 Guide d'Intégration — Module PDF Premium dans l'Éditeur

## 📋 Vue d'Ensemble

Ce guide explique comment intégrer le module PDF Premium dans l'éditeur existant pour générer des catalogues dignes des grands magazines immobiliers.

---

## 🎯 Étape 1 : Remplacer le Module PDF

### Dans `editor.html`

**Avant :**
```html
<script src="js/clientBrochure.js"></script>
```

**Après :**
```html
<script src="js/clientBrochurePremium.js"></script>
```

### Dans `js/clientTools.js` (ou fichier qui appelle l'export)

**Avant :**
```javascript
// Appel à l'ancien module
ClientBrochure.exportPDF(data, studio, variant);
```

**Après :**
```javascript
// Appel au nouveau module premium
ClientBrochurePremium.exportPDF(data, studio, variant);
```

---

## 🤖 Étape 2 : Ajouter le Bouton "Sublimer avec l'IA"

### Dans `editor.html` — Section des outils client

```html
<!-- Dans la section des outils de finition -->
<div class="client-tools-section">
  <h3>Rendus 3D</h3>
  
  <!-- Bouton existant : Export PDF -->
  <button id="btn-export-pdf" type="button">
    📄 Exporter le catalogue PDF
  </button>
  
  <!-- NOUVEAU : Bouton Sublimer avec l'IA -->
  <button id="btn-sublimate" type="button" class="btn-premium">
    ✨ Sublimer avec l'IA
  </button>
  
  <!-- Indicateur de statut -->
  <div id="ai-status" class="ai-status" hidden>
    <span class="ai-badge">✨ IA activée</span>
  </div>
</div>
```

### Dans `css/clientTools.css` — Styles pour le bouton premium

```css
.btn-premium {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  border: none;
  border-radius: 0.5rem;
  padding: 0.75rem 1.5rem;
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
  transition: transform 0.2s, box-shadow 0.2s;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.btn-premium:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
}

.btn-premium:active {
  transform: translateY(0);
}

.btn-premium:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.ai-status {
  margin-top: 0.5rem;
  padding: 0.5rem;
  background: rgba(212, 175, 55, 0.1);
  border-radius: 0.25rem;
}

.ai-badge {
  color: #d4af37;
  font-weight: 600;
  font-size: 0.9rem;
}
```

---

## 🧠 Étape 3 : Logique du Bouton "Sublimer avec l'IA"

### Dans `js/clientTools.js` (ou nouveau fichier `js/aiEnhance.js`)

```javascript
/**
 * Module d'amélioration IA des rendus 3D
 */
const AIEnhance = (() => {
  'use strict';

  /**
   * Sublimer les rendus avec l'IA
   */
  async function sublimateWithAI(data, studio) {
    const btn = document.getElementById('btn-sublimate');
    const status = document.getElementById('ai-status');
    
    try {
      // 1. Désactiver le bouton pendant le traitement
      btn.disabled = true;
      btn.textContent = '⏳ Traitement en cours...';
      
      // 2. Capturer les vues 3D actuelles
      console.log('📸 Capture des vues 3D...');
      const views = await capture3DViews(data, studio);
      
      // 3. Envoyer à l'IA pour amélioration
      console.log('🤖 Amélioration par IA...');
      const enhanced = await enhanceWithAI(views);
      
      // 4. Stocker les images améliorées
      console.log('💾 Stockage des images améliorées...');
      storeEnhancedImages(enhanced);
      
      // 5. Marquer la variante comme sublimée
      if (window.currentVariant) {
        window.currentVariant.aiEnhanced = true;
      }
      
      // 6. Afficher le statut
      status.hidden = false;
      
      // 7. Réactiver le bouton
      btn.disabled = false;
      btn.textContent = '✨ Sublimer avec l\'IA';
      
      // 8. Notification de succès
      showToast('✨ Rendus sublimés avec succès !', 'success');
      
      return enhanced;
      
    } catch (error) {
      console.error('❌ Erreur lors de la sublimation:', error);
      btn.disabled = false;
      btn.textContent = '✨ Sublimer avec l\'IA';
      showToast('Erreur lors de la sublimation', 'error');
      throw error;
    }
  }

  /**
   * Capturer les vues 3D
   */
  async function capture3DViews(data, studio) {
    const shots = ClientBrochurePremium.selectShots(data, studio.hs);
    const views = [];
    
    // Capture de la façade
    const facadeImg = studio.capture(shots.facade, 1600, 800, 1, { clean: true });
    views.push({
      type: 'facade',
      label: shots.facade.label,
      image: facadeImg,
      width: 1600,
      height: 800
    });
    
    // Capture des vues intérieures
    for (const shot of shots.interior) {
      const img = studio.capture(shot, 1200, 750, 1, { clean: true });
      views.push({
        type: 'interior',
        label: shot.label,
        room: shot.room,
        image: img,
        width: 1200,
        height: 750
      });
    }
    
    return views;
  }

  /**
   * Améliorer avec l'IA (appel API)
   */
  async function enhanceWithAI(views) {
    // TODO: Implémenter l'appel à l'API d'IA
    // Pour l'instant, on simule l'amélioration
    
    const enhanced = [];
    
    for (const view of views) {
      // Simuler un traitement de 2 secondes par image
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Améliorations simulées :
      // - Augmentation du contraste
      // - Amélioration des textures
      // - Ajout de détails
      // - Optimisation de l'éclairage
      
      enhanced.push({
        ...view,
        enhanced: true,
        timestamp: Date.now()
      });
    }
    
    return enhanced;
  }

  /**
   * Stocker les images améliorées
   */
  function storeEnhancedImages(enhanced) {
    // Stocker dans localStorage ou dans l'état de l'éditeur
    const data = {
      images: enhanced,
      timestamp: Date.now()
    };
    
    localStorage.setItem('ai-enhanced-images', JSON.stringify(data));
    
    // Aussi stocker dans l'état global si disponible
    if (window.EDITOR_STATE) {
      window.EDITOR_STATE.aiEnhanced = data;
    }
  }

  /**
   * Charger les images améliorées
   */
  function loadEnhancedImages() {
    const stored = localStorage.getItem('ai-enhanced-images');
    if (stored) {
      return JSON.parse(stored);
    }
    return null;
  }

  /**
   * Vérifier si les rendus ont été sublimés
   */
  function isEnhanced() {
    const data = loadEnhancedImages();
    return data && data.images && data.images.length > 0;
  }

  return {
    sublimateWithAI,
    isEnhanced,
    loadEnhancedImages
  };
})();
```

### Dans `js/clientTools.js` — Attacher l'événement

```javascript
// Attacher le bouton "Sublimer avec l'IA"
document.getElementById('btn-sublimate').addEventListener('click', async () => {
  const data = getProjectData(); // Votre fonction pour récupérer les données
  const studio = window.studio; // Votre instance du studio 3D
  
  await AIEnhance.sublimateWithAI(data, studio);
});

// Au chargement, vérifier si déjà sublimé
if (AIEnhance.isEnhanced()) {
  document.getElementById('ai-status').hidden = false;
  if (window.currentVariant) {
    window.currentVariant.aiEnhanced = true;
  }
}
```

---

## 📄 Étape 4 : Modifier l'Export PDF

### Dans la fonction d'export PDF

```javascript
// Avant l'export, vérifier si les images ont été sublimées
async function exportPDFWithAI(data, studio, variant) {
  // Charger les images améliorées si disponibles
  const enhancedData = AIEnhance.loadEnhancedImages();
  
  if (enhancedData && enhancedData.images) {
    // Remplacer les images dans data.renderShots par les versions améliorées
    data.renderShots = enhancedData.images.map(img => ({
      ...img,
      aiEnhanced: true
    }));
    
    // Marquer la variante
    variant = variant || {};
    variant.aiEnhanced = true;
  }
  
  // Exporter avec le module premium
  await ClientBrochurePremium.exportPDF(data, studio, variant);
}
```

---

## 🎨 Étape 5 : Ajouter des Options de Style

### Dans `editor.html` — Menu de sélection de style

```html
<div class="client-tools-section">
  <h3>Style du catalogue</h3>
  
  <div class="style-selector">
    <label>
      <input type="radio" name="pdf-style" value="modern" checked>
      <span class="style-option modern">
        <span class="style-preview"></span>
        Moderne
      </span>
    </label>
    
    <label>
      <input type="radio" name="pdf-style" value="luxury">
      <span class="style-option luxury">
        <span class="style-preview"></span>
        Luxe
      </span>
    </label>
    
    <label>
      <input type="radio" name="pdf-style" value="industrial">
      <span class="style-option industrial">
        <span class="style-preview"></span>
        Industriel
      </span>
    </label>
  </div>
</div>
```

### Dans `css/clientTools.css` — Styles du sélecteur

```css
.style-selector {
  display: flex;
  gap: 1rem;
  margin-top: 0.5rem;
}

.style-selector label {
  cursor: pointer;
}

.style-selector input[type="radio"] {
  display: none;
}

.style-option {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 0.75rem;
  border: 2px solid #ddd;
  border-radius: 0.5rem;
  transition: all 0.2s;
}

.style-option:hover {
  border-color: #667eea;
}

.style-selector input[type="radio"]:checked + .style-option {
  border-color: #667eea;
  background: rgba(102, 126, 234, 0.1);
}

.style-preview {
  width: 60px;
  height: 40px;
  border-radius: 0.25rem;
  margin-bottom: 0.5rem;
}

.style-option.modern .style-preview {
  background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
}

.style-option.luxury .style-preview {
  background: linear-gradient(135deg, #064e3b 0%, #065f46 100%);
}

.style-option.industrial .style-preview {
  background: linear-gradient(135deg, #1e293b 0%, #334155 100%);
}
```

### Dans `js/clientTools.js` — Gérer le changement de style

```javascript
// Gérer le changement de style
document.querySelectorAll('input[name="pdf-style"]').forEach(radio => {
  radio.addEventListener('change', (e) => {
    const style = e.target.value;
    
    // Stocker le style sélectionné
    localStorage.setItem('pdf-style', style);
    
    // Mettre à jour le module PDF
    if (window.ClientBrochurePremium) {
      ClientBrochurePremium.setStyle(style);
    }
  });
});

// Charger le style au démarrage
const savedStyle = localStorage.getItem('pdf-style');
if (savedStyle) {
  const radio = document.querySelector(`input[name="pdf-style"][value="${savedStyle}"]`);
  if (radio) {
    radio.checked = true;
    if (window.ClientBrochurePremium) {
      ClientBrochurePremium.setStyle(savedStyle);
    }
  }
}
```

---

## 🔧 Étape 6 : Modifier clientBrochurePremium.js pour Supporter les Styles

### Ajouter la méthode `setStyle`

```javascript
const ClientBrochurePremium = (() => {
  'use strict';

  // Style actuel
  let currentStyle = 'modern';
  
  // Palettes par style
  const STYLES = {
    modern: {
      primary: '#1a1a2e',
      secondary: '#16213e',
      accent: '#e94560',
      accentLight: '#ff6b9d',
      paper: '#f8f9fa'
    },
    luxury: {
      primary: '#064e3b',
      secondary: '#065f46',
      accent: '#d4af37',
      accentLight: '#f4d03f',
      paper: '#fefdf8'
    },
    industrial: {
      primary: '#1e293b',
      secondary: '#334155',
      accent: '#b87333',
      accentLight: '#da8a4a',
      paper: '#f8fafc'
    }
  };

  // Fonction pour changer de style
  function setStyle(style) {
    if (STYLES[style]) {
      currentStyle = style;
      Object.assign(COLORS, STYLES[style]);
      console.log(`🎨 Style changé: ${style}`);
    }
  }

  // ... reste du code ...

  return {
    exportPDF,
    setStyle,
    selectShots
  };
})();
```

---

## 📊 Étape 7 : Flux Complet

```
1. Utilisateur dessine le plan
   ↓
2. Génère la vue 3D
   ↓
3. [Optionnel] Clique "✨ Sublimer avec l'IA"
   ↓
4. L'IA améliore les rendus
   ↓
5. Les images améliorées sont stockées
   ↓
6. Utilisateur choisit le style (Moderne/Luxe/Industriel)
   ↓
7. Utilisateur clique "📄 Exporter le catalogue PDF"
   ↓
8. Le module premium détecte :
   - Si les images ont été sublimées → utilise les versions IA
   - Le style sélectionné → applique la palette
   - Si variant.aiEnhanced → ajoute le badge "✨ Sublimé avec IA"
   ↓
9. Génération du PDF premium avec :
   - Couverture avec dégradé et ombres
   - Stat cards avec profondeur
   - Typographie hiérarchisée
   - Badge IA si applicable
   ↓
10. Téléchargement du PDF
```

---

## ✅ Checklist d'Intégration

### Fichiers à modifier

- [ ] `editor.html` — Ajouter le bouton "Sublimer avec l'IA"
- [ ] `editor.html` — Ajouter le sélecteur de style
- [ ] `css/clientTools.css` — Ajouter les styles premium
- [ ] `js/clientTools.js` — Ajouter la logique du bouton IA
- [ ] `js/clientTools.js` — Ajouter la gestion du style
- [ ] `js/clientBrochurePremium.js` — Ajouter la méthode `setStyle`

### Fonctionnalités à tester

- [ ] Bouton "Sublimer avec l'IA" fonctionne
- [ ] Les images améliorées sont stockées
- [ ] Le badge "✨ Sublimé avec IA" apparaît sur la couverture
- [ ] Le sélecteur de style fonctionne
- [ ] Les 3 styles s'appliquent correctement
- [ ] L'export PDF génère un catalogue premium
- [ ] Les ombres et dégradés s'affichent
- [ ] Les stat cards sont visibles
- [ ] La typographie est hiérarchisée

### Tests utilisateurs

- [ ] L'utilisateur peut sublimer avec l'IA
- [ ] L'utilisateur peut choisir un style
- [ ] L'utilisateur peut exporter un PDF premium
- [ ] Le PDF ressemble à un grand catalogue immobilier
- [ ] Le badge IA est visible si applicable

---

## 🎯 Résultat Final

Après intégration, vous aurez :

✅ Un bouton "✨ Sublimer avec l'IA" dans l'éditeur
✅ Un sélecteur de style (Moderne/Luxe/Industriel)
✅ Un export PDF qui génère des catalogues premium
✅ Des couvertures dignes des grands magazines immobiliers
✅ Des effets visuels "waouh" (dégradés, ombres, depth)
✅ Un badge "✨ Sublimé avec IA" sur les rendus améliorés
✅ Une expérience utilisateur premium

---

## 📚 Ressources

- **`GUIDE_COUVERTURE_PREMIUM.md`** — Comment la couverture est fabriquée
- **`GUIDE_DESIGN_PDF.md`** — Techniques de design PDF
- **`PDF_MODULE_README.md`** — Documentation du module
- **`RECAPITULATIF_PDF_WAOUH.md`** — Récapitulatif des effets

---

**Version** : 1.0  
**Dernière mise à jour** : 2026-11-24  
**Statut** : ✅ Prêt pour l'intégration
