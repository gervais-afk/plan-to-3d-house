# 🤖 ARCHITECT COPILOT — Documentation complète

## Assistant IA intelligent pour architectes

---

## 📋 VUE D'ENSEMBLE

**Architect Copilot** est un assistant IA flottant qui guide l'architecte dans toutes ses missions :
- 💬 **Conversation intelligente** en langage naturel
- 💡 **Suggestions contextuelles** basées sur l'action en cours
- 🔍 **Vérification conformité** automatique (PLU, RE2020, PMR)
- ✨ **Génération de variantes** optimisées
- 📐 **Calculs instantanés** (métrés, surfaces, longueurs)
- 🎤 **Commandes vocales** mains libres
- ⌨️ **Raccourcis clavier** pour productivité maximale

---

## 🎯 FONCTIONNALITÉS PRINCIPALES

### 1. Conversation intelligente

**Description** : Dialogue naturel avec l'IA pour obtenir des réponses précises sur l'architecture.

**Exemples de questions** :
- "Quelle est la surface habitable totale ?"
- "Vérifie la conformité PMR de ce plan"
- "Comment améliorer l'éclairage naturel ?"
- "Propose 3 variantes pour optimiser le séjour"

**Implémentation** :
```javascript
const response = await ArchitectCopilot.sendMessage(
  "Vérifie la conformité RE2020",
  { project: currentProject }
);
```

**Modèles IA supportés** :
- Claude Sonnet 5.5 (conversation principale)
- Claude Haiku (réponses rapides)
- GPT-6.2 Sol (alternative)

---

### 2. Suggestions contextuelles

**Description** : Suggestions automatiques basées sur le contexte actuel (outil actif, élément sélectionné, etc.).

**Types de suggestions** :
- 💡 **Tips** : Astuces pour l'outil en cours
- ⚠️ **Warnings** : Alertes de non-conformité
- ✨ **Actions** : Actions rapides disponibles
- ℹ️ **Info** : Informations contextuelles

**Exemple** :
```javascript
// Quand l'outil "mur extérieur" est actif
suggestions = [
  {
    type: 'tip',
    icon: '💡',
    title: 'Astuce de dessin',
    content: 'Cliquez point par point pour tracer vos murs',
    action: null
  },
  {
    type: 'check',
    icon: '✓',
    title: 'Vérification automatique',
    content: 'Vérifier la fermeture du contour ?',
    action: 'check-closure'
  }
];
```

**Contextes supportés** :
- Outil mur (ext/int)
- Pièce sélectionnée
- Calibration
- Projet complet
- Métrés

---

### 3. Vérification conformité

**Description** : Analyse automatique du projet selon les normes françaises.

**Normes vérifiées** :
- ✅ **PLU** : CES, COS, hauteur, recul, espaces verts
- ✅ **RE2020** : Bbio, baies vitrées, protection solaire
- ✅ **PMR** : Largeurs, circulations, pentes, espaces rotation
- ✅ **Habitation** : Surfaces minimales, éclairage, hauteur

**Utilisation** :
```javascript
const report = await ArchitectCopilot.checkCompliance(project);
// Retourne : conformités ✓, non-conformités ✗, corrections proposées
```

---

### 4. Génération de variantes

**Description** : Génération de plusieurs propositions d'agencement optimisées.

**Utilisation** :
```javascript
const variants = await ArchitectCopilot.generateRoomVariants({
  type: 'sejour',
  area: 30,
  width: 6,
  depth: 5
});
// Retourne : 3 variantes avec scores et justifications
```

**Critères d'optimisation** :
- Surface utile maximisée
- Circulations minimisées
- Éclairage naturel optimisé
- Adjacences logiques
- Conformité normes

---

### 5. Calculs instantanés

**Description** : Calculs automatiques de métriques en temps réel.

**Métriques calculées** :
```javascript
const metrics = ArchitectCopilot.calculateMetrics(project);
// {
//   totalArea: 80,           // Surface totale (m²)
//   habitableArea: 75,       // Surface habitable (m²)
//   wallLength: 45,          // Longueur totale murs (m)
//   openings: 12,            // Nombre d'ouvertures
//   rooms: 6                 // Nombre de pièces
// }
```

---

### 6. Commandes vocales

**Description** : Interaction mains libres via reconnaissance vocale.

**Activation** :
```javascript
ArchitectCopilot.toggleVoiceInput();
// Active/désactive le micro
```

**Support** :
- Navigateurs : Chrome, Edge (Web Speech API)
- Langue : Français (fr-FR)
- Reconnaissance en temps réel

---

### 7. Raccourcis clavier

**Raccourcis disponibles** :
- `Ctrl+K` : Ouvrir/fermer le copilot
- `Ctrl+M` : Activer/désactiver le micro
- `Ctrl+L` : Effacer la conversation
- `Entrée` : Envoyer le message
- `Shift+Entrée` : Nouvelle ligne

**Implémentation** :
```javascript
document.addEventListener('keydown', (e) => {
  ArchitectCopilot.handleKeyboard(e);
});
```

---

## 🎨 INTERFACE UTILISATEUR

### Composants

1. **Bouton flottant (FAB)**
   - Position : bas droite
   - Taille : 60×60px
   - Animation : scale au hover
   - Badge : nombre de suggestions

2. **Panneau principal**
   - Taille : 380×600px
   - Position : bas droite (au-dessus du FAB)
   - Animation : fade + slide
   - Responsive : plein écran sur mobile

3. **En-tête**
   - Titre : "Architect Copilot"
   - Actions : thème, effacer, fermer
   - Icône : 🤖

4. **Zone de messages**
   - Scroll automatique
   - Bulles utilisateur (bleu)
   - Bulles assistant (gris)
   - Timestamps
   - Formatage markdown basique

5. **Suggestions contextuelles**
   - Cards cliquables
   - Icônes + titre + description
   - Actions rapides

6. **Zone de saisie**
   - Textarea auto-resize
   - Bouton micro 🎤
   - Bouton envoyer ➤
   - Raccourcis affichés

### Thèmes

**Thème clair** (par défaut) :
- Fond : `#ffffff`
- Texte : `#1a1a1a`
- Accent : `#b78a3c` (or)
- Bordures : `#e5e7eb`

**Thème sombre** :
- Fond : `#1a1a1a`
- Texte : `#f5f5f5`
- Accent : `#d4a574` (or clair)
- Bordures : `#333333`

**Détection automatique** :
```css
@media (prefers-color-scheme: dark) {
  /* Thème sombre activé automatiquement */
}
```

**Forçage manuel** :
```javascript
ArchitectCopilot.setTheme('dark'); // ou 'light'
```

---

## 🔧 CONFIGURATION

### Fichier de configuration

```javascript
const CONFIG = {
  models: {
    conversation: 'anthropic/claude-sonnet-5.5',
    quick: 'anthropic/claude-haiku',
    vision: 'anthropic/claude-sonnet-5.5'
  },
  
  behavior: {
    proactiveSuggestions: true,    // Suggestions automatiques
    voiceInput: true,              // Reconnaissance vocale
    contextualAwareness: true,     // Conscience du contexte
    maxSuggestions: 3,             // Max suggestions affichées
    suggestionDelay: 1500,         // Délai avant suggestion (ms)
    cacheHistory: true             // Historique des conversations
  },
  
  themes: {
    light: { /* ... */ },
    dark: { /* ... */ }
  }
};
```

### Personnalisation

**Modifier les modèles IA** :
```javascript
ArchitectCopilot.CONFIG.models.conversation = 'openai/gpt-6.2-sol';
```

**Désactiver les suggestions automatiques** :
```javascript
ArchitectCopilot.CONFIG.behavior.proactiveSuggestions = false;
```

**Changer le nombre max de suggestions** :
```javascript
ArchitectCopilot.CONFIG.behavior.maxSuggestions = 5;
```

---

## 📦 INTÉGRATION

### Installation

1. **Copier les fichiers** :
   ```
   js/architectCopilot.js
   css/copilot.css
   ```

2. **Inclure dans HTML** :
   ```html
   <link rel="stylesheet" href="css/copilot.css">
   <script src="js/architectCopilot.js"></script>
   ```

3. **Ajouter le composant HTML** :
   ```html
   <!-- Bouton flottant -->
   <button class="copilot-fab" id="copilot-fab">🤖</button>
   
   <!-- Panneau -->
   <div class="copilot-panel" id="copilot-panel">
     <!-- Voir copilot-demo.html pour le HTML complet -->
   </div>
   ```

4. **Initialiser** :
   ```javascript
   // Écouter les événements
   document.getElementById('copilot-fab').addEventListener('click', () => {
     ArchitectCopilot.toggle();
     updateUI();
   });
   
   // Mettre à jour le contexte
   ArchitectCopilot.updateSuggestions(currentContext);
   ```

### Exemple d'intégration complète

Voir **`copilot-demo.html`** pour un exemple complet et fonctionnel.

---

## 🧪 TESTS

### Exécuter les tests

```bash
node --test tests/architect-copilot.test.cjs
```

### Couverture des tests

**30 tests unitaires** couvrant :
- ✅ Gestion de conversation (5 tests)
- ✅ Suggestions contextuelles (5 tests)
- ✅ Calculs de métriques (4 tests)
- ✅ Actions rapides (3 tests)
- ✅ Historique et favoris (3 tests)
- ✅ Interface (6 tests)
- ✅ Configuration (3 tests)
- ✅ Intégration (3 tests)

**Résultat** : 30/30 tests passent ✅

---

## 📊 PERFORMANCE

### Coûts IA

| Action | Modèle | Coût | Temps |
|---|---|---|---|
| Question simple | Haiku | ~0,001 € | <1s |
| Analyse conformité | Sonnet | ~0,01 € | 2-3s |
| Génération variantes | Sonnet | ~0,02 € | 3-5s |
| Commande vocale | Local | Gratuit | Instantané |

### Optimisations

- **Cache des conversations** : évite les appels redondants
- **Suggestions locales** : pas d'appel IA pour les suggestions simples
- **Lazy loading** : panneau chargé à la demande
- **Compression** : messages minimisés en production

---

## 🔐 SÉCURITÉ ET CONFIDENTIALITÉ

### Données locales

- **Historique** : stocké en localStorage (peut être désactivé)
- **Messages** : envoyés à l'IA uniquement si utilisateur le demande
- **Contexte** : jamais envoyé sans consentement

### Bonnes pratiques

1. **Désactiver localStorage** si confidentialité requise :
   ```javascript
   ArchitectCopilot.CONFIG.behavior.cacheHistory = false;
   ```

2. **Utiliser un proxy** pour les appels IA :
   ```javascript
   // Dans votre serveur
   app.post('/api/copilot/chat', async (req, res) => {
     // Filtrer les données sensibles avant envoi à l'IA
     const sanitized = sanitizeData(req.body);
     const response = await callAI(sanitized);
     res.json(response);
   });
   ```

3. **Audit régulier** des conversations sauvegardées

---

## 🌍 COMPATIBILITÉ

### Navigateurs

| Navigateur | Support | Notes |
|---|---|---|
| Chrome 90+ | ✅ Complet | Support vocal inclus |
| Firefox 88+ | ✅ Complet | Pas de vocal (API non supportée) |
| Safari 14+ | ✅ Complet | Support vocal inclus |
| Edge 90+ | ✅ Complet | Support vocal inclus |

### Node.js

| Version | Support | Notes |
|---|---|---|
| 18+ | ✅ Complet | Pour tests et SSR |
| 16 | ⚠️ Partiel | Some features may not work |
| <16 | ❌ Non supporté | |

### Mobile

| Plateforme | Support | Notes |
|---|---|---|
| iOS Safari | ✅ Responsive | Interface adaptée |
| Android Chrome | ✅ Responsive | Interface adaptée |
| Tablettes | ✅ Responsive | Plein écran automatique |

---

## 🚀 ROADMAP

### Version 1.1 (Q1 2027)
- [ ] Intégration avec sketchRecognition.js
- [ ] Suggestions basées sur croquis
- [ ] Export conversation en PDF

### Version 1.2 (Q2 2027)
- [ ] Mode hors ligne (modèles locaux)
- [ ] Personnalisation avatar IA
- [ ] Thèmes personnalisés

### Version 2.0 (Q3 2027)
- [ ] Collaboration multi-utilisateurs
- [ ] Partage de conversations
- [ ] Marketplace de prompts

---

## 📚 RESSOURCES

### Fichiers créés

1. **`js/architectCopilot.js`** (700 lignes)
   - Module principal
   - API complète
   - Compatible Node.js et navigateur

2. **`css/copilot.css`** (500 lignes)
   - Styles UI complets
   - Thèmes clair/sombre
   - Animations fluides
   - Responsive design

3. **`copilot-demo.html`** (600 lignes)
   - Démonstration interactive
   - Exemple d'intégration
   - Simulateur de contexte

4. **`tests/architect-copilot.test.cjs`** (350 lignes)
   - 30 tests unitaires
   - Couverture complète
   - Documentation inline

5. **`ARCHITECT_COPILOT_DOCUMENTATION.md`** (ce fichier)
   - Documentation complète
   - Guide d'utilisation
   - Référence API

### Liens utiles

- **Démo** : Ouvrir `copilot-demo.html` dans un navigateur
- **Tests** : `node --test tests/architect-copilot.test.cjs`
- **API** : Voir section "Référence API" ci-dessous

---

## 🔍 RÉFÉRENCE API

### Méthodes publiques

#### Conversation
```javascript
// Envoyer un message
await ArchitectCopilot.sendMessage(message, context);

// Ajouter un message sans réponse IA
ArchitectCopilot.addMessage(role, content, metadata);

// Effacer la conversation
ArchitectCopilot.clearConversation();
```

#### Suggestions
```javascript
// Mettre à jour les suggestions
ArchitectCopilot.updateSuggestions(context);

// Générer des suggestions
const suggestions = ArchitectCopilot.generateSuggestions(context);
```

#### Actions rapides
```javascript
// Vérifier conformité
await ArchitectCopilot.checkCompliance(project);

// Générer variantes
await ArchitectCopilot.generateRoomVariants(room);

// Calculer métriques
const metrics = ArchitectCopilot.calculateMetrics(project);

// Suggérer améliorations
await ArchitectCopilot.suggestImprovements(project);
```

#### Voix
```javascript
// Activer/désactiver micro
ArchitectCopilot.toggleVoiceInput();
```

#### Historique
```javascript
// Sauvegarder conversation
ArchitectCopilot.saveConversation(name);

// Charger conversation
ArchitectCopilot.loadConversation(id);

// Effacer historique
ArchitectCopilot.clearHistory();
```

#### Interface
```javascript
// Ouvrir/fermer
ArchitectCopilot.toggle();

// Obtenir état
const state = ArchitectCopilot.getState();

// Changer thème
ArchitectCopilot.setTheme('dark');

// Gérer clavier
ArchitectCopilot.handleKeyboard(event);
```

### Événements

```javascript
// Suggestions mises à jour
window.addEventListener('copilot-suggestions-updated', (e) => {
  console.log(e.detail.suggestions);
});

// Panneau ouvert/fermé
window.addEventListener('copilot-toggled', (e) => {
  console.log(e.detail.isOpen);
});

// Résultat vocal
window.addEventListener('copilot-voice-result', (e) => {
  console.log(e.detail.transcript);
});

// Conversation effacée
window.addEventListener('copilot-conversation-cleared');

// Thème changé
window.addEventListener('copilot-theme-changed', (e) => {
  console.log(e.detail.theme);
});
```

---

## 💡 EXEMPLES D'UTILISATION

### Exemple 1 : Intégration basique

```html
<!DOCTYPE html>
<html>
<head>
  <link rel="stylesheet" href="css/copilot.css">
</head>
<body>
  <button class="copilot-fab" id="fab">🤖</button>
  <div class="copilot-panel" id="panel">
    <!-- ... -->
  </div>
  
  <script src="js/architectCopilot.js"></script>
  <script>
    document.getElementById('fab').addEventListener('click', () => {
      ArchitectCopilot.toggle();
    });
  </script>
</body>
</html>
```

### Exemple 2 : Suggestions contextuelles

```javascript
// Quand l'utilisateur dessine un mur
editor.on('wall-drawn', (wall) => {
  ArchitectCopilot.updateSuggestions({
    currentTool: 'wall-ext',
    wallCount: editor.walls.length
  });
});
```

### Exemple 3 : Vérification conformité

```javascript
// Bouton "Vérifier conformité"
document.getElementById('check-btn').addEventListener('click', async () => {
  const report = await ArchitectCopilot.checkCompliance(project);
  console.log('Rapport de conformité :', report);
});
```

### Exemple 4 : Commande vocale

```javascript
// Activer le micro
document.getElementById('mic-btn').addEventListener('click', () => {
  ArchitectCopilot.toggleVoiceInput();
});

// Écouter les résultats
window.addEventListener('copilot-voice-result', async (e) => {
  const transcript = e.detail.transcript;
  const response = await ArchitectCopilot.sendMessage(transcript);
  console.log('Réponse IA :', response);
});
```

---

## 🤝 CONTRIBUTION

### Structure du code

```
js/architectCopilot.js
├── CONFIG                    # Configuration
├── state                     # État global
├── addMessage()              # Gestion messages
├── sendMessage()             # Envoi à l'IA
├── buildPrompt()             # Construction prompt
├── callAI()                  # Appel API
├── generateSuggestions()     # Suggestions
├── updateSuggestions()       # Mise à jour
├── checkCompliance()         # Actions rapides
├── generateRoomVariants()
├── calculateMetrics()
├── suggestImprovements()
├── toggleVoiceInput()        # Voix
├── saveConversation()        # Historique
├── loadConversation()
├── clearHistory()
├── handleKeyboard()          # Raccourcis
├── toggle()                  # Interface
├── getState()
└── setTheme()
```

### Ajouter une fonctionnalité

1. **Créer la fonction** dans le module
2. **Exporter** dans le return final
3. **Ajouter des tests** dans `tests/architect-copilot.test.cjs`
4. **Documenter** dans ce fichier

### Style de code

- **Indentation** : 2 espaces
- **Guillemets** : simples (')
- **Semi-colons** : oui
- **Commentaires** : JSDoc pour fonctions publiques
- **Nommage** : camelCase pour variables/fonctions

---

## 📄 LICENCE

Ce module fait partie du projet **Plan to 3D House** et suit la même licence.

---

## 🙏 REMERCIEMENTS

Développé dans le cadre de l'amélioration continue du système **Plan to 3D House**.

Inspiré par les meilleurs copilots du marché :
- GitHub Copilot
- Microsoft Copilot
- Cursor AI
- Arkio AI Agent

---

**Dernière mise à jour** : 24 novembre 2026
**Version** : 1.0.0
**Statut** : ✅ Production ready
