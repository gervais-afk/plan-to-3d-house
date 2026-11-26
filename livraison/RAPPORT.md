# Rapport de livraison — ArchiCam Studio

Base Git confirmée : `97f9ca7` (`gervais-afk/plan-to-3d-house`, branche `main`).

## Lot 1 — Fiche « Informations du projet » + perte de meta.description

- **Commit** : `d7295d0` (`livraison/lot-1.patch`)
- **Résumé** :
  - Ajout du bouton « Informations du projet » (`#btn-project-info`) dans la barre d'outils de `editor.html` et du dialogue `#dlg-project-info` réutilisant directement `projectPanel()` quelle que soit la sélection courante (mur, ouverture, pièce, caméra…).
  - Ajout du champ multiligne « Description » (`meta.description`, `<textarea>`) dans `projectPanel()` et inclusion de `description` dans `toProjectJson()` afin que le réenregistrement de `residence-verandas` (et de tout autre projet) ne l'efface plus.
  - Conservation complète en aller-retour de tous les champs `meta` (`name`, `subtitle`, `client`, `clientVisible`, `reference`, `architect`, `location`, `phase`, `revision`, `issueDate`, `status`, `concept`, `contact`, `description`) sans perte ni valeur inventée.
  - Ajout du repère visuel « utilisé dans les PDF » sur les champs repris dans le cartouche PDF (`name`, `subtitle`, `client`, `architect`, `location`, `phase`, `revision`, `issueDate`) et d'un bandeau d'état alimenté par `PdfIdentity.missingFields()` mis à jour à la saisie.
- **Fichiers modifiés / ajoutés** :
  - `editor.html`
  - `css/editor.css`
  - `js/editor.js`
  - `tests/project-info.test.cjs`
- **Tests (`node --test tests/*.test.cjs`)** : 551 exécutés · 547 réussis · 0 échec · 4 ignorés (dont 5 nouveaux tests dans `tests/project-info.test.cjs`).
- **Écarts avec la demande** : Aucun. (`meta.concept` passe également en `<textarea rows="2">` pour plus de confort sur les textes longs, sans impact sur la sérialisation.)
- **Points à vérifier dans le navigateur** :
  - Ouvrir `editor.html`, charger `residence-verandas`, sélectionner un mur, cliquer sur « Informations du projet » : le dialogue s'ouvre sans perdre la sélection du mur et affiche la description complète.
  - Vérifier le repère « utilisé dans les PDF » sur les champs du cartouche et la disparition immédiate de « Maître d'ouvrage » dans la liste des champs vides lors de la saisie du client.
  - Enregistrer puis rouvrir le projet : `meta.description` est conservée.

## Lot 2 — Fin des cas particuliers residence-verandas

- **Commit** : `a027e93` (`livraison/lot-2.patch`)
- **Résumé** :
  - `js/home.js` : la galerie accepte désormais `config.planImage.url` dans le sous-dossier `planches/` ; la liseuse d'édition fonctionne pour tout projet déclarant `edition` (plus réservée à `residence-verandas`) ; lien de téléchargement direct uniquement si `edition.bookFile` existe (nommé `<slug>-cahier-de-plans.pdf`), sinon bouton déclenchant `PlanBook.exportBook()` qui nomme le PDF `<slug>-cahier-de-plans.pdf`.
  - `js/app.js` : bannière FCFA dans la galerie ouverte à tout projet ; lien PDF du mode présentation piloté par `edition.bookFile` ou repli vers `PlanBook.exportBook` ; export CSV nommé `${PROJECT_SLUG}-bqe.csv`.
  - `js/clientTools.js` : repères de perspectives activés dès que `HOUSE_DATA.edition?.photos?.length` existe, sans filtrer sur `residence-verandas`.
  - `js/projectLoader.js` et `serve.js` : suppression des replis codés en dur vers `residence-verandas` / `villa-serena` ; repli automatique sur le premier projet disponible, erreur explicite si le dossier `projects/` est vide ; `projectCover()` gère aussi `plan.png` et `config.planImage.url`.
  - `privatePortal.js` et `projects/residence-verandas/project.json` : déclaration explicite de `edition.bookFile` dans `residence-verandas` et règle portail généralisée à `projects/<slug>/planches/*.pdf`.
- **Fichiers modifiés / ajoutés** :
  - `js/home.js`
  - `js/app.js`
  - `js/clientTools.js`
  - `js/projectLoader.js`
  - `js/planBook.js`
  - `serve.js`
  - `privatePortal.js`
  - `projects/residence-verandas/project.json`
  - `tests/generic-project.test.cjs`
- **Tests (`node --test tests/*.test.cjs`)** : 556 exécutés · 552 réussis · 0 échec · 4 ignorés (dont 5 nouveaux tests dans `tests/generic-project.test.cjs` couvrant un projet tiers générique et `residence-verandas`).
- **Écarts avec la demande** : Aucun.
- **Points à vérifier dans le navigateur** :
  - Ouvrir `accueil.html` sur `residence-verandas` : le plan source `planches/063306.webp` apparaît en galerie et la liseuse propose `residence-verandas-cahier-de-plans.pdf`.
  - Ouvrir `index.html?project=<autre-projet>` : la galerie affiche la bannière FCFA et l'export CSV télécharge `<slug>-bqe.csv`.

---

## Lot 3 — PDF de l'architecte conservés (`bc34892`)

### Résumé
- Création du magasin sécurisé `planchesStore.js` conservant le PDF d'origine (`doc-<uuid>.pdf`), les images rendues par page (`page-<uuid>.<ext>`) et le manifeste (`manifest.json`) dans `projects/<slug>/planches/`, avec classement automatique `SheetClassifier` (type, niveau, échelle, `include`, `replaceGenerated`).
- Ajout des routes architecte uniquement `GET/POST/PATCH/DELETE /api/projects/:slug/planches` (et `/:id`) dans `serve.js` : validation de la signature `%PDF-`, vérification des signatures image PNG/JPEG/WEBP, tailles bornées, noms générés par le serveur, confinement des chemins (`safePath` + `path.resolve` + `realpathSync`), refus complet hors rôle `architect` en mode portail privé.
- Mise à jour de `js/app.js` (« Composer le cahier ») et `js/planBook.js` : rechargement automatique des planches enregistrées à l'ouverture, persistance des nouveaux téléversements, sauvegarde en direct des modifications (type, niveau, inclusion, remplacement) et bouton de suppression ; conversion transparente des URL d'images lors de l'export PDF.

### Fichiers exacts
- `planchesStore.js` (nouveau)
- `serve.js`
- `js/app.js`
- `js/planBook.js`
- `tests/planches-store.test.cjs` (nouveau)

### Tests (`node --test tests/*.test.cjs`)
- Total : 560 · Réussis : 556 · Échecs : 0 · Ignorés : 4
- Couverture ajoutée : téléversement, liste, modification, suppression (y compris nettoyage du PDF partagé quand la dernière page est retirée), refus des fichiers non-PDF / images falsifiées / traversées de chemin / liens symboliques, refus des rôles non-architecte (`read`, `comment`, non authentifié) sur les routes HTTP.

### Écarts avec la demande
- Aucun écart. `planchesStore` est chargé défensivement dans `serve.js` pour préserver la compatibilité avec les fixtures isolées de tests existants qui ne copient pas `planchesStore.js`.

### Points à vérifier dans le navigateur
- Ouvrir « Composer le cahier » dans `index.html`, déposer un PDF d'architecte, fermer puis rouvrir la fenêtre : vérifier que les planches réapparaissent automatiquement avec leur classement.
- Modifier le type, le niveau ou la case « Inclure », recharger la page et vérifier la persistance, puis tester la suppression et l'export du cahier PDF.

---

## Lot 4 — Import PDF multi-pages + PDF.js local (`54acf82`)

### Résumé
- Copie locale de PDF.js 3.11.174 (`assets/vendor/pdf.min.js` et `assets/vendor/pdf.worker.min.js`) et suppression de toutes les dépendances `cdnjs` dans `editor.html`, `js/editor.js` et `js/planBook.js` (et autorisation dans `privatePortal.js`).
- Ajout de la galerie de sélection multi-pages `#dlg-pdf-import` dans `editor.html` / `js/editor.js`, réutilisant `PlanBook.readSheets` et `SheetClassifier` : lecture de toutes les pages du PDF, affectation de chaque plan de distribution à son niveau dans `config.planImages` (basculé automatiquement via `switchLevel`), et archivage des autres pages (masse, façade, coupe, etc.) en planches de référence via l'API Lot 3 (`POST /api/projects/:slug/planches`).
- Toute page de distribution sans niveau identifié ou en doublon est signalée « À vérifier » sans affectation silencieuse.

### Fichiers exacts
- `assets/vendor/pdf.min.js` (nouveau)
- `assets/vendor/pdf.worker.min.js` (nouveau)
- `editor.html`
- `css/editor.css`
- `js/editor.js`
- `js/planBook.js`
- `privatePortal.js`
- `tests/pdf-multipage-import.test.cjs` (nouveau)

### Tests (`node --test tests/*.test.cjs`)
- Total : 563 · Réussis : 559 · Échecs : 0 · Ignorés : 4
- Couverture ajoutée : présence locale de PDF.js 3.11.174 et absence de toute référence `cdnjs` ; dossier synthétique de 5 pages (masse, RDC, R+1, façade, coupe) → RDC affecté au niveau 0, R+1 au niveau 1, bascule d'étage vérifiée, masse/façade/coupe enregistrées en référence sur disque (Lot 3) ; page sans niveau signalée « À vérifier ».

### Écarts avec la demande
- Aucun écart. `privatePortal.js` a également été complété afin de servir `assets/vendor/pdf.min.js` et `pdf.worker.min.js` en mode portail privé.

### Points à vérifier dans le navigateur
- Dans `editor.html`, importer un PDF multi-pages (ex. `projects/residence-verandas/planches/cahier.pdf`) : vérifier que la galerie liste toutes les pages sans aucun appel réseau vers `cdnjs`, affecte les plans de distribution aux niveaux, et archive les façades/coupes en référence.
- Basculer entre les onglets Rez-de-chaussée et Étage 1 pour vérifier que chaque niveau affiche son propre fond de plan.

---

## Lot 5 — Lecture vectorielle des PDF d'architecte (`95b9918`)

### Résumé
- Création du module pur UMD `js/pdfVectorExtract.js` exploitant directement les flux PDF.js (`getOperatorList()` + `getTextContent()`, sans appel réseau) :
  - Interprétation complète des opérateurs PDF (`save`, `restore`, `transform`, `moveTo`, `lineTo`, `curveTo`, `rectangle`, `constructPath`, `stroke`, `fill`, etc.) avec pile de matrices CTM.
  - Détection déterministe des murs (paires de traits parallèles distants de `0,08` à `0,40 m`), des portes (arcs de quart de cercle en Bézier cubique), des fenêtres (faisceaux de traits de menuiserie parallèles serrés) et des textes de pièces (noms, surfaces, emprises déduites).
  - L'échelle lue dans le cartouche (`1/100`, `1:50`…) est retournée uniquement comme proposition (`scaleProposal`, `confirmed: false`) et exige une confirmation explicite contre une cote témoin (`confirmScale()`).
  - Tout segment orphelin, courbe ambiguë ou texte non rattaché est conservé dans `toVerify` (« À vérifier ») avec ses coordonnées, jamais supprimé silencieusement.
  - `mergeAiAnnotations()` garantit que l'IA peut uniquement nommer/compléter les pièces et jamais déplacer un mur vectoriel.
- Chargement du module dans `editor.html`.

### Fichiers exacts
- `js/pdfVectorExtract.js` (nouveau)
- `editor.html`
- `tests/pdf-vector-extract.test.cjs` (nouveau)

### Tests (`node --test tests/*.test.cjs`)
- Total : 565 · Réussis : 561 · Échecs : 0 · Ignorés : 4
- Couverture ajoutée : extraction vectorielle hors-ligne d'une maison synthétique 3 pièces (6 murs ext./int., 2 portes, 2 fenêtres, 3 pièces nommées) vérifiée à ±2 cm ; confirmation d'échelle obligatoire (refus d'inventer une échelle absente) ; conservation d'un segment orphelin dans `toVerify` ; immutabilité stricte des murs vectoriels dans `mergeAiAnnotations()`.

### Écarts avec la demande
- Aucun écart.

### Points à vérifier dans le navigateur
- Vérifier dans la console de `editor.html` que `window.PdfVectorExtract` est chargé et prêt à analyser un `PDFPageProxy` via `PdfVectorExtract.extractFromPdfPage(page, { confirmedScale })`.

---

## Lot 6 — Croquis et calibration assistée (`45f2da5`)

### Résumé
- Création du module pur UMD `js/planHomography.js` :
  - Calcul de l'homographie 3×3 par résolution DLT 8×8 (`solveHomography`, `applyHomography`, `invert3x3`) pour redresser une photo prise en biais à partir de 4 coins.
  - Redressement bilinéaire non destructif (`warpRGBA`, `rectifyCanvas`) qui produit toujours un nouveau tampon RGBA sans jamais altérer l'image source d'origine.
  - Contrôle de seconde cote (`evaluateControlDimension`) calculant la distance mesurée avec l'échelle courante, l'écart en mètres et en pourcentage, et déclenchant une alerte explicite dès que l'écart dépasse strictement 1 %.
- Enrichissement de `js/editor.js` et `editor.html` :
  - Mode `rectify` (4 points) dans le panneau Projet avec bouton « Redresser la photo (4 coins) » et bouton « Restaurer l'image d'origine » (conservation de `originalUrl`).
  - Mode `verify-scale` (2ᵉ cote de contrôle) avec stockage du résultat dans `config.planImage.controlCheck` et alerte visible si l'écart dépasse 1 %.
  - Loupe de pointage en direct (`drawCalibrationLoupe`, agrandissement ×4 avec réticule) active pendant la calibration, la 2ᵉ cote de contrôle et le redressement 4 points.
- Enrichissement de `js/editorAI.js` et `js/planProposalReview.js` :
  - Prise en charge des éléments marqués `uncertain: true` (murs, ouvertures, pièces) et `uncertainZones` dans la lecture IA, consignés dans `toVerify` (« À vérifier ») et comptabilisés dans `assessment.uncertainCount`.

### Fichiers exacts
- `js/planHomography.js` (nouveau)
- `editor.html`
- `js/editor.js`
- `js/editorAI.js`
- `js/planProposalReview.js`
- `tests/sketch-calibration.test.cjs` (nouveau)

### Tests (`node --test tests/*.test.cjs`)
- Total : 568 · Réussis : 564 · Échecs : 0 · Ignorés : 4
- Couverture ajoutée : redressement d'un trapèze connu (`< 1 px` sur les 4 coins, ratio L/H `< 0,5 %`, tampon source intact) ; 2ᵉ cote de contrôle (alerte si écart `> 1 %`, validation si `≤ 1 %`) ; consignation des murs et zones flous/non cotés dans `toVerify` et avertissement dédié dans `PlanProposalReview`.

### Écarts avec la demande
- Aucun écart.

### Points à vérifier dans le navigateur
- Dans `editor.html`, importer une photo de croquis prise de biais, cliquer sur « Redresser la photo (4 coins) », poser les 4 coins avec la loupe de pointage, puis tester « Restaurer l'image d'origine ».
- Calibrer une première cote (touche `K`), puis lancer « 2ᵉ cote de contrôle » : vérifier que la loupe s'affiche et qu'un écart supérieur à 1 % déclenche une alerte visible.

---

## Lot 7 — Revue visuelle et garde-fou expliqué (`d77f705`)

### Résumé
- **Revue visuelle des propositions IA (`js/planProposalReview.js`, `js/editor.js`, `js/editorAI.js`, `css/editor.css`)** :
  - Ajout de la machine à états pure `PlanProposalReview.createReviewSession(assessment, proposal)` qui classe les éléments en vert (fiables / validés), orange (à vérifier / incertains) et rouge (anomalies bloquantes), expose `resolveItem` (`accepted` / `corrected` / `ignored`), `getFocusTarget`, `getOverlayItems`, `applyDecisions` et bloque `canApply()` tant qu'une anomalie bloquante reste en attente.
  - Superposition directe sur le canevas de l'éditeur (`drawReviewOverlay`, `setReviewOverlay`, `focusWorldPoint`) : le dialogue de revue IA se docke sur le côté pour laisser voir le plan source et cliquer sur un élément de « À vérifier » zoome et centre la vue dessus.
  - « Valider et appliquer » reste désactivé tant que toutes les anomalies bloquantes (en rouge) n'ont pas été traitées.
- **Inspecteur de fidélité 3×3 et remplacement complet de `window.prompt` pour la Porte E (`js/gateReviewUI.js`, `js/app.js`, `index.html`, `js/workspace.js`, `privatePortal.js`, `css/style.css`)** :
  - Création du module pur `js/gateReviewUI.js` : comparateur Avant/Après à rideau glissant avec bascule côte-à-côte et grille 3×3 surlignant `worstTile` (rouge) et `addedTile` (ambre) avec légende explicite.
  - Remplacement des 3 appels `window.prompt` de la Porte E dans `js/app.js` par le dialogue dédié `#gate-override-dialog` : affiche la raison Porte E et les zones en écart, impose un motif obligatoire non vide et journalise chaque forçage dans l'historique de session (`createOverrideHistory`).

### Fichiers exacts
- `js/planProposalReview.js`
- `js/gateReviewUI.js` (nouveau)
- `js/editor.js`
- `js/editorAI.js`
- `css/editor.css`
- `index.html`
- `js/workspace.js`
- `privatePortal.js`
- `js/app.js`
- `css/style.css`
- `tests/visual-review-gate.test.cjs` (nouveau)

### Tests (`node --test tests/*.test.cjs`)
- Total : 571 · Réussis : 567 · Échecs : 0 · Ignorés : 4
- Couverture ajoutée : machine à états de revue visuelle (vert/orange/rouge, focus exact, Accepter/Corriger/Ignorer, blocage de `canApply()` tant qu'une anomalie bloquante persiste) ; grille 3×3 `worstTile`/`addedTile` ; dialogue Porte E (rejet d'un motif vide, acceptation et journalisation d'un motif valide, vérification statique qu'aucun `window.prompt` ne subsiste pour la Porte E dans `js/app.js`).

### Écarts avec la demande
- Aucun écart.

### Points à vérifier dans le navigateur
- Dans `editor.html`, lancer une lecture IA : vérifier la superposition vert/orange/rouge sur le plan, le zoom au clic sur « Voir sur le plan », et le déblocage de « Valider et appliquer » après résolution des anomalies bloquantes.
- Dans `index.html` (Galerie), cliquer sur « Comparer Avant (3D) / Après (IA) » pour tester le curseur rideau et la grille 3×3 `worstTile`/`addedTile`, puis tenter d'affecter au catalogue un rendu IA non fidèle : vérifier que le dialogue `#gate-override-dialog` s'ouvre (sans `window.prompt`), refuse un motif vide et trace l'historique.

---

## Lot 8 — Tableau de bord « Livrables » (`397d6c7`)

### Résumé
- Création du module pur UMD `js/deliverableChecklist.js` :
  - `evaluate({ project, cabinet, media, planches })` évalue le pipeline complet en 5 étapes (1. Plan importé et calibré, 2. Maquette vérifiée, 3. Vues capturées, 4. Rendus IA validés Porte E, 5. Documents & cartouche via `PdfIdentity.missingFields` + planches PDF enregistrées) avec statuts `done` / `partial` / `todo` et liste explicite des manques, sans rien inventer.
  - Recense les 5 livrables (`aps`, `brochure`, `catalog`, `book`, `synthesis`) avec leur état de disponibilité et leurs prérequis manquants.
  - `render()` et `openDashboard()` offrent un rendu DOM sûr (`createElement`/`textContent`, zéro `innerHTML`) partagé par les 3 entrées.
- Intégration du bouton « Livrables » et du dialogue dédié sur les 3 entrées de l'application :
  - Visite 3D (`index.html`, `js/app.js`, masqué en mode client invité).
  - Éditeur (`editor.html`, `js/editor.js`).
  - Accueil (`accueil.html`, `js/home.js`, masqué pour un rôle client en portail privé).
- Chargement dans `js/workspace.js` (`common`) et autorisation dans `privatePortal.js` (`viewerFiles`).

### Fichiers exacts
- `js/deliverableChecklist.js` (nouveau)
- `editor.html`
- `js/editor.js`
- `css/editor.css`
- `index.html`
- `js/app.js`
- `css/style.css`
- `accueil.html`
- `js/home.js`
- `js/workspace.js`
- `privatePortal.js`
- `tests/deliverable-checklist.test.cjs` (nouveau)

### Tests (`node --test tests/*.test.cjs`)
- Total : 575 · Réussis : 571 · Échecs : 0 · Ignorés : 4
- Couverture ajoutée : évaluation d'un projet vide (5 étapes `todo`, 5 documents non prêts), d'un projet partiel (plan non calibré, rendu IA bloqué Porte E, cartouche incomplet), d'un projet complet (5/5 étapes `done` et 5 livrables prêts), et vérification de la présence du bouton/dialogue « Livrables » sur les 3 pages.

### Écarts avec la demande
- Aucun écart.

### Points à vérifier dans le navigateur
- Ouvrir « Livrables » successivement depuis `accueil.html`, `editor.html` et `index.html` : vérifier les 5 étapes, les manques signalés, et le déclenchement des 5 exports (APS, Brochure, Catalogue, Cahier de plans, Planche de synthèse).

---

## Lot 9 — Installation pour un cabinet (`224274e`)

### Résumé
- **Autonomie hors ligne totale (Three.js local, zéro CDN)** :
  - Copie locale de Three.js r128 et de ses modules (`assets/vendor/three/three.min.js`, `GLTFLoader.js`, `RGBELoader.js`, `RoomEnvironment.js`).
  - Remplacement des deux dernières URL CDN dans `js/workspace.js` par des chargements locaux `assets/vendor/three/...` et autorisation des 4 fichiers dans `privatePortal.js` (`viewerFiles`). Plus aucune référence `cdnjs`, `jsdelivr` ou `unpkg` dans l'ensemble des fichiers HTML et JS servis.
- **Déplacement du logo cabinet vers `.cabinet/logo.png` + route `/api/cabinet/logo`** :
  - `cabinetStore.js` stocke désormais le logo dans `.cabinet/logo.png` (`0600`), migre automatiquement tout ancien `assets/cabinet/logo.png` vers `.cabinet/logo.png` dès la première lecture (`migrateLegacyLogo`), et retourne `logoUrl: '/api/cabinet/logo'`.
  - `serve.js` expose `GET/HEAD /api/cabinet/logo` (`Content-Type: image/png`, `X-Content-Type-Options: nosniff`, `Cache-Control: private, no-store`, `404` si absent).
  - `privatePortal.js` autorise `GET/HEAD /api/cabinet/logo` pour les clients authentifiés du portail privé tout en conservant le blocage strict de tout accès direct à `/.cabinet/`.
- **`.gitignore` mono-cabinet** :
  - Exclusion des projets de travail locaux (`projects/*`) avec exceptions explicitement documentées uniquement pour les 4 projets de démonstration exigés par la suite de tests (`residence-verandas`, `villa-serena`, `maison-croquis`, `test-l`), en complément de `.cabinet/`, `.private-portal/`, `.client-feedback/`, `openrouter.key` et `.env`.
- **Documentation d'exploitation** :
  - Création de `docs/INSTALLATION-CABINET.md` (prérequis Node.js, démarrage local, `openrouter.key`, portail privé HTTPS + reverse proxy Caddy/Nginx, invitations clients et liens de validation, sauvegarde et restauration).

### Fichiers exacts
- `assets/vendor/three/three.min.js` (nouveau)
- `assets/vendor/three/GLTFLoader.js` (nouveau)
- `assets/vendor/three/RGBELoader.js` (nouveau)
- `assets/vendor/three/RoomEnvironment.js` (nouveau)
- `js/workspace.js`
- `cabinetStore.js`
- `serve.js`
- `privatePortal.js`
- `.gitignore`
- `docs/INSTALLATION-CABINET.md` (nouveau)
- `tests/cabinet-cover.test.cjs`
- `tests/offline-cabinet-install.test.cjs` (nouveau)

### Tests (`node --test tests/*.test.cjs`)
- Total : 578 · Réussis : 574 · Échecs : 0 · Ignorés : 4
- Couverture ajoutée : audit automatique zéro CDN (`cdnjs`, `jsdelivr`, `unpkg`) sur tous les fichiers HTML et JS servis + présence locale de Three.js, PDF.js et jsPDF ; migration automatique `assets/cabinet/logo.png` → `.cabinet/logo.png` ; test HTTP complet en mode portail privé (`401` anonyme, `404` accès direct `/.cabinet/logo.png`, `200` architecte et client invité sur `/api/cabinet/logo`) ; vérification `.gitignore` et `docs/INSTALLATION-CABINET.md`.

### Écarts avec la demande
- Aucun écart. `tests/cabinet-cover.test.cjs` a été mis à jour pour vérifier le nouvel emplacement `.cabinet/logo.png` et la nouvelle URL `/api/cabinet/logo`.

### Points à vérifier dans le navigateur
- Couper l'accès réseau (mode hors ligne dans les outils développeur) puis ouvrir `accueil.html`, `editor.html` et `index.html?project=residence-verandas` : vérifier que la maquette 3D, PDF.js et jsPDF se chargent sans aucun appel CDN externe.
- Enregistrer un logo PNG transparent dans « Profil Cabinet », vérifier qu'il est servi depuis `/api/cabinet/logo` sur la couverture, dans le cartouche PDF et depuis une session client du portail privé.
