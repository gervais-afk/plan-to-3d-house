# Plan de Maison Animé — du plan 2D à la visite 3D

Transforme un **plan d'architecte 2D** en **maquette 3D explorable** (élévation au défilement, visite guidée, visite libre), puis produit les **documents pour le client** : estimation en FCFA, avant-projet sommaire (APS), catalogue premium, cahier de plans, rendus photoréalistes par IA.

Projet inspiré des expériences d'architecture web en 3D (*Samnang Aing / Claude 3D Walkable Apartments*). Identité : **ArchiCam Studio**.

## Lancer le projet

### Méthode recommandée : `start.bat`
Installez **Node.js LTS**, puis double-cliquez sur `start.bat`. Le script démarre `serve.js`, qui fournit les API nécessaires à l'éditeur (enregistrement des projets et appels IA), puis ouvre la visite dans le navigateur.

Entrée projet : **http://localhost:8000/?project=villa-serena** · Éditeur : **http://localhost:8000/editor.html**.

Par défaut, le serveur Node écoute uniquement sur la machine locale (`127.0.0.1`). Pour une prévisualisation derrière un proxy de développement : `HOST=0.0.0.0 node serve.js`. L'ouverture directe de `index.html` ou le serveur Python historique ne donnent pas accès à toutes les fonctions (enregistrement et IA) ; ils ne sont pas pris en charge pour l'usage normal.

## Parcours type

1. **Éditeur** (`editor.html`) : importer le plan, calibrer l'échelle, tracer murs, ouvertures et pièces (RDC et étage), enregistrer. Le copilote ⌘J/Ctrl+J propose une **chaîne complète** : brief → plan 2D/3D → meublage → conformité PMR/RE2020 → enregistrement + révision → jalon cartouche → **APS Auto PDF + Devis FCFA (.xlsx) + Cahier de plans A3 + Catalogue Premium** (voir [docs/editeur.md](docs/editeur.md#-chaîne-complète--du-brief-au-dossier-livré)).
2. **Visite 3D** (`index.html?project=<dossier>`) : vérifier la maquette, enregistrer des vues, tester finitions et ensoleillement.
3. **Documents** : **Estimation FCFA**, **📋 APS Auto**, **🎨 Catalogue Premium** (3 styles), **✨ Sublimer avec l'IA** (photoréalisation des vues via OpenRouter, avec confirmation du coût), cahier de plans.
4. **Partage** : portail privé avec invitations, retours et validation des versions par le client.

Projets d'exemple : `villa-serena` (plain-pied, plan de l'ingénieur Dollar), `residence-verandas` (R+1), `maison-croquis`, `test-l`, et les essais d'escaliers `essai-escalier-*`.

## Documentation

| Guide | Contenu |
|---|---|
| [docs/visite-3d.md](docs/visite-3d.md) | Visite, outils client, variantes, étages, vidéo, accueil du dossier, accessibilité |
| [docs/editeur.md](docs/editeur.md) | Dessin du plan, APS, catalogue premium, sublimation IA, outils avancés |
| [docs/estimation.md](docs/estimation.md) | Estimation FCFA et avant-métré béton armé / HA |
| [docs/portail-prive.md](docs/portail-prive.md) | Portail privé, préproduction HTTPS, suivi des décisions |
| [docs/architecture.md](docs/architecture.md) | Pages, données d'un projet, modules, routes du serveur |
| [docs/api-modules.md](docs/api-modules.md) | API des modules d'analyse et d'export |
| [docs/verification.md](docs/verification.md) | Tests et script de vérification |
| [docs/reprise-assistant.md](docs/reprise-assistant.md) | Règles pour un assistant IA qui reprend le projet |
| [DESIGN.md](DESIGN.md) | Charte graphique |

Les anciens prompts, récapitulatifs et audits sont dans [docs/archive/](docs/archive/) (non tenus à jour).

## Vérifier

```powershell
node --test tests/*.test.cjs
```

```powershell
node verify_all.js
```

## Structure

```text
├── index.html, editor.html, portal.html, accueil.html, studio.html
├── js/            # un module par fichier (voir docs/architecture.md)
├── css/, assets/  # styles, polices, modèles 3D, jsPDF
├── projects/      # un dossier par maison : project.json, plan, generated/
├── tests/         # tests Node (node --test)
├── serve.js       # serveur local : projets, galerie, relais OpenRouter, portail
├── verify_all.js  # vérification complète
└── start.bat      # lancement en un clic
```
