# Architecture

Application web sans framework : des pages HTML, des modules JavaScript (un fichier, un module, compatible navigateur et Node pour les tests) et un serveur Node local (`serve.js`) qui enregistre les projets et relaie les appels IA.

## Pages

| Page | Rôle |
|---|---|
| `index.html?project=<dossier>` | Accueil du dossier et visite 3D (Three.js) — voir [visite-3d.md](visite-3d.md) |
| `editor.html` | Éditeur de plan 2D, estimation, documents client — voir [editeur.md](editeur.md) |
| `portal.html` | Portail privé de l'architecte (invitations) — voir [portail-prive.md](portail-prive.md) |
| `accueil.html`, `studio.html` | Entrée de l'atelier, studio de rendu |
| `aps-template.html` | APS personnalisable à la main |
| `demo.html`, `pdf-demo.html`, `copilot-demo.html` | Démonstrations des modules |

## Données d'un projet

```text
projects/<dossier>/
├── project.json        # meta, config, walls, rooms, columns, stairwells, furniture, estimate…
├── plan.jpg|png        # plan d'origine calé (config.planImage)
└── generated/
    ├── renders/        # vues enregistrées depuis la visite 3D (références des rendus IA)
    ├── images/         # rendus IA photoréalistes publiés
    ├── videos/         # vidéos (capture locale ou clips IA)
    └── manifest.json   # galerie : images, vidéos, référence, générateur, prompt
```

Les murs, pièces et meubles portent `level` (0 = RDC, 1 = étage). `projectLoader.js` (`HouseAuto.complete`) génère ce qui n'est pas dessiné : parcours caméra, vues de rendu, lampes, abords, escaliers, toiture.

## Modules JavaScript (`js/`)

| Domaine | Modules |
|---|---|
| **Visite 3D** | `scene.js`, `realism.js`, `scrollTour.js`, `walkController.js`, `stairTransition.js`, `minimap.js`, `renderStudio.js`, `assets.js`, `app.js` (orchestrateur), `home.js`, `workspace.js`, `presentMode.js` |
| **Chargement et génération** | `projectLoader.js` (HouseAuto), `houseDataCore.js`, `data.js` (Villa Serena par défaut), `autoFurnish.js`, `multiLevelAlign.js` |
| **Éditeur** | `editor.js` (expose `window.EditorAPI`), `editorAI.js` (lecture du plan par IA), `editorEstimate.js`, `editorAdvanced.js`, `editorPremium.js`, `planCleanup.js` |
| **Contrôles** | `habitability.js`, `rplus1Checker.js`, `codeCompliance.js`, `aiTopology.js`, `fidelityCheck.js` |
| **Estimation** | `costEstimate.js` (FCFA, lots, bordereau, béton armé et HA) |
| **Documents client** | `apsGenerator.js`, `clientBrochurePremium.js`, `clientBrochure.js`, `planBook.js` (cahier de plans A3), `presentationPlan.js`, `sheetClassifier.js` |
| **IA** | `aiEnhance.js` (sublimation), `aiPrompt.js`, `aiSequence.js` |
| **Analyse et export** | `vectorization.js`, `structuralAnalysis.js`, `bimExport.js`, `bioclimaticAnalysis.js`, `smartAnnotations.js`, `variantGenerator.js`, `versionComparison.js`, `realtimeCollaboration.js`, `architectCopilot.js`, `sketchRecognition.js` — API dans [api-modules.md](api-modules.md) |
| **Client** | `clientTools.js`, `clientFinishes.js`, `clientVariants.js`, `clientFeedback.js`, `clientDecisions.js`, `solarStudy.js`, `solarOptions.js` |

Limite connue : `realtimeCollaboration.js` gère les sessions en mémoire, sans transport réseau ; ce n'est pas encore une collaboration multi-postes.

## Serveur local (`serve.js`)

| Route | Rôle |
|---|---|
| `GET /api/projects` · `POST /api/save-project` | Lister et enregistrer les projets |
| `GET /api/gallery/media` · `POST /api/gallery/flags` | Galerie d'un projet (images, vidéos, vues) |
| `POST /api/save-render` · `POST /api/save-generated` · `POST /api/save-video` | Enregistrer vues 3D, rendus IA, vidéos |
| `POST /api/save-sequence-frame` · `POST /api/save-sequence-manifest` | Séquence image par image du parcours |
| `GET /api/ai/status` | Clé OpenRouter configurée ou non |
| `POST /api/ai/chat` | Relais OpenRouter (texte et vision : lecture du plan) |
| `POST /api/ai/images` | Relais OpenRouter image vers image (modèles autorisés : `IMAGE_MODELS`) |
| `GET /api/ai/video-quote` · `POST /api/ai/videos` · `GET /api/ai/videos/status` | Clips vidéo IA |
| `/api/presentation/*` · `/api/cabinet/profile` | Présentation et profil du cabinet |
| `/api/client-feedback` · `/api/client-decisions` | Retours et décisions des clients (portail) |

La clé OpenRouter n'est jamais envoyée au navigateur : `serve.js` la lit dans `openrouter.key` (ignoré par Git), `OPENROUTER_API_KEY` ou `OPENROUTER_ENV_FILE`. Chaque appel facturé est précédé d'une confirmation avec le coût estimé.

## Charte

La charte graphique (couleurs, typographie, composants) est décrite dans [`DESIGN.md`](../DESIGN.md).
