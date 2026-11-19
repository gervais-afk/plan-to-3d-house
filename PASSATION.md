# PASSATION — Plan de maison animé (état au 19/11/2026)

Ce fichier résume ce qui est fait, ce qui est en cours et ce qui reste à faire, pour continuer avec un autre éditeur ou assistant.

---

## 1. Le projet en bref

Application web (Three.js r128 chargé par CDN, sans bundler) qui transforme un plan d'architecte 2D en maison 3D visitable :
- **scroll cinématique** : le plan 2D se transforme en maquette, puis la caméra visite la maison ;
- **visite libre** au clavier (ZQSD) ;
- **minimap**, mode **Jour / Soir**, **rendus HD** ;
- **éditeur de plan** (`editor.html`) pour créer une nouvelle maison sans toucher au code.

**Lancer** : `start.bat`, qui démarre Node `serve.js` sur http://localhost:8000 (Node.js LTS requis).
- `serve.js` fournit les API d'enregistrement et le relais OpenRouter, et écoute uniquement sur `127.0.0.1`.
- `serve.py` est un ancien serveur statique, désormais limité à `127.0.0.1` et sans API ; ne pas l'utiliser pour le parcours normal.
- **Visite** : `index.html` affiche la Villa Serena, définie dans `js/data.js`.
- **Visite d'un projet** : `index.html?project=<dossier>` (ajouter `#wp=3` pour ouvrir le parcours à l'étape 3).
- **Éditeur** : `editor.html`.

---

## 2. Carte des fichiers

| Fichier | Rôle |
|---|---|
| `index.html`, `css/style.css` | Application de visite et HUD |
| `js/data.js` | Projet par défaut (Villa Serena) + `normalizeHouseData()` + géométrie des pièces : `roomContains`, `pointInPolygon`, `polygonArea`, `polygonLabelPoint` |
| `js/projectLoader.js` | Charge `projects/<nom>/project.json` (requête XHR synchrone) + `HouseAuto.complete()`, qui génère tout ce qui manque : caméras, vues de rendu, lampes, jardin, cotes, départ de la visite. Contient le **graphe portes ↔ pièces** (`doorGraph`, `doorPath`) |
| `js/scene.js` | Scène 3D : sols (rectangles **et polygones**), murs avec ouvertures, colonnes, auvents, portes, plafonds, calque du plan (touche P) |
| `js/realism.js` | Mobilier composé, plinthes et chambranles, jardin, lampes, silhouettes, environnement, Jour/Soir, **fusion de la géométrie** (performances), ombres de contact |
| `js/assets.js` | Remplace les meubles par des modèles glTF CC0 (`assets/models/`, Poly Haven) |
| `js/presentationPlan.js` | Plan 2D « style Photoshop » dessiné au canvas (touche B : rendu ou encre) |
| `js/renderStudio.js` | Rendus HD 1920×1080 → `assets/renders/` (touche R) |
| `js/scrollTour.js`, `js/walkController.js`, `js/minimap.js`, `js/app.js` | Parcours, visite libre, minimap, orchestration |
| `editor.html`, `css/editor.css`, `js/editor.js` | **Éditeur de plan** : import JPG/PNG/PDF (PDF.js → raster haute résolution), calibration et glisser-déposer |
| `js/editorAI.js` | **Lecture automatique du plan par IA** (OpenRouter), entrée depuis l’image raster du plan |
| `serve.js` | Serveur local : fichiers statiques + enregistrement/gallerie, `/api/ai/chat`, `/api/ai/images`, devis vidéo `/api/ai/video-quote`, jobs vidéo `/api/ai/videos` et `/api/ai/videos/status`, ainsi que les routes de projets et médias |
| `projects/<nom>/project.json` | Un fichier par maison, créé par l'éditeur |
| `assets/generated/` | Images IA, vidéos locales MediaRecorder et manifeste consommés par la galerie |
| `README.md` | Mode d'emploi utilisateur (section « Nouveau projet avec l'éditeur de plan ») |

---

## 3. Ce qui est TERMINÉ et testé

1. Villa Serena fidèle au plan `Engineer Dollar Bakoh.jpg` (calque P), à 60 FPS ou plus : la géométrie est fusionnée, environ 2 à 4 ms par image.
2. Réalisme : lampes, Jour/Soir, jardin, silhouettes, modèles glTF CC0, ombres de contact. La SSAO a été abandonnée à cause d'artefacts en r128.
3. Plan 2D de présentation et studio de rendus HD.
4. **Éditeur de plan** :
   - calibrage (K), murs aimantés (M/C), portes, fenêtres et passages (D/F/B) ;
   - pièces (A), colonnes, auvent, pergola, mobilier ;
   - annuler / rétablir, enregistrement dans `projects/`, aperçu 3D.
5. **Format projet + chargeur `?project=`** avec génération automatique du reste.
6. **Lecture IA du plan** (`js/editorAI.js`, bouton « ✨ Lecture IA ») :
   - conversion pixels → mètres avec nettoyage (murs d'équerre, coordonnées regroupées, ouvertures replacées sur le mur le plus proche) ;
   - l'éditeur a bien détecté la clé via le serveur local ; essai réel avec `openai/gpt-6-luna` : 32 murs, 17 ouvertures, 11 pièces, 14 meubles en 51 s, coût 0,003 $ ;
   - résultat sensiblement différent de la référence Villa Serena (22 murs, 21 ouvertures, 13 pièces) : la lecture IA reste une ébauche à corriger, pas un relevé exact.
7. **Pièces polygonales (en L)** :
   - outils **Pièce auto (W)**, qui détecte un espace fermé en un clic, et **Polygone (P)** ;
   - affichage dans l'éditeur, en 3D (sols et plafonds en forme exacte), sur le plan de présentation et la minimap, et pour la détection de pièce ;
   - testé sur une pièce en L : 6 sommets exacts, 62 m².
8. **Caméras** :
   - parcours automatique **par les portes et les passages ouverts** (graphe + parcours en profondeur) : plus de traversée de mur sur la Villa Serena ;
   - **outil Caméras (T)** dans l'éditeur : déplacer, orienter (losange), ajouter, supprimer, réordonner (▲▼), régénérer, aperçu 3D.

### Jalon R+1, PBR, coupe et vue éclatée
- Les objets architecturaux portent `level` (RDC `0`, étage `1`) ; `config.floorHeight` espace les niveaux, les ouvertures suivent leur mur, et `stairwells` réserve les trémies dans les dalles intermédiaires. L'éditeur sépare les niveaux par **RDC / Étage 1** et ne dessine une trémie que sur l'étage.
- Le PBR et les gardes de géométrie non finie restent actifs. **C** crée/supprime le plan de coupe à mi-hauteur ; **X** écarte les dalles intermédiaires et les objets de toiture configurés en `canopies` de type `slab` (y compris une dalle polygonale).
- Le phasage piloté par le scroll fait apparaître successivement la fondation, les murs, les menuiseries, les dalles et finitions, le mobilier, puis les auvents/toitures. Le calque source `config.planImage` est chargé dès la création de la scène et s'estompe pendant le début de l'élévation ; P permet de le forcer/masquer.

### Test du plan dessiné à la main — `maison-croquis`
- Sources conservées sous `assets/plans/croquis-cote.jpg` et `assets/plans/croquis-technique.jpg`. Le projet `projects/maison-croquis/project.json` contient 25 murs, 12 pièces et 22 ouvertures ; il est étalonné à **35,2 px/m** depuis la cote de 15,50 m, origine `[368.5, 495]` pixels, avec le dessin coté comme `planImage`.
- Les dimensions et la distribution sont une **interprétation indicative**, à confirmer avec un relevé ; le dessin ne spécifiant pas d'étage, la maquette reste au RDC. Une toiture plate polygonale est ajoutée explicitement comme élément de démonstration pour tester X, elle n'est pas attribuée au dessin.
- **Vérifié le 19/11/2026** : `serve.js` répond HTTP 200 sur `127.0.0.1:8000`; le JSON et l'image du plan répondent 200. Dans le navigateur, le projet charge l'image (texture prête, visible à l'état initial avec opacité 0,94), puis le scroll à mi-élévation la fait disparaître (opacité 0). Les gestionnaires C et X activent coupe et éclatement de la toiture ; le bouton X est disponible et le toit polygonal se soulève. Aucun message d'erreur console sur la visite ou l'éditeur.
- Éditeur vérifié : onglets RDC / Étage 1 présents et commutables, outil **Trémie** activable. Les états et handlers ont été testés dans le navigateur. Une capture est disponible, mais le relais n'a pas fourni de rendu assez net pour certifier visuellement les détails de la maquette ; faire une dernière vérification manuelle du cadrage sur l'écran cible.

---

## 4. Rotation libre du mobilier — implémentée, validation visuelle restante

**Principe** : les meubles portent `dims: 'local'`. `w` et `d` sont leurs dimensions dans leur propre repère (largeur le long de la face avant, profondeur), et `rotY` accepte un angle quelconque en radians (0 = face vers +Z, soit le sud / bas du plan).

**Implémenté** :
- Migration des anciens meubles à quarts de tour vers les dimensions locales au chargement.
- Rotation R = +15°, Maj+R = −15°, sans permutation des dimensions ; champ « Angle (°) » dans le panneau.
- Dessin et sélection du mobilier dans le repère tourné ; nouveaux meubles et résultats de lecture IA utilisent `dims: 'local'`.
- Moteur 3D, modèles, ombres de contact et plan de présentation prenaient déjà en charge cette convention.

**Validé dans l’éditeur navigateur** : canapé migré depuis le projet Villa Serena ; angle 120° (rotation de 30° depuis 90°) affiché dans le panneau, `w=1,8 m` et `d=0,9 m` inchangés. R et Maj+R font +15°/−15° ; aucune erreur console.

**À valider encore** : enregistrer puis recharger le projet, et inspecter le même meuble dans la visite 3D (modèle et ombre) et le plan de présentation. Les formules suivent Three.js : à π/2, la face avant locale (0,1) pointe vers l’est (1,0) dans le plan.

---

## 5. Photoréalisation via OpenRouter — intégrée et validée de bout en bout

**Implémenté et validé dans la galerie** :
- Une seule carte par angle Three.js, avec statut « Vue 3D de base » ou « Rendu IA disponible » ; fini les cartes « Repli 3D » en doublon.
- Les captures 3D sont générées localement et gratuitement dès la première ouverture de galerie. Le bouton global « 📷 Actualiser toutes les vues 3D » les recapture à la demande.
- `/api/gallery/media` ne renvoie que les images listées au manifeste et présentes sur disque ; les vidéos ne sont listées qu’en présence d’un vrai fichier `.mp4` ou `.webm`. La galerie ne crée plus de cartes vidéo fantômes.
- Les rendus IA sont associés aux vues via `reference` et/ou l’identifiant `photor-<id>`. Chaque génération demande confirmation ; Gemini 3.1 Flash Image affiche une estimation indicative d’environ **0,068 $**, MAI-Image 2.7 Flash expose son tarif variable au jeton. Le coût réel OpenRouter est affiché quand disponible.
- Le comparateur avant (Three.js) / après (IA) s’ouvre uniquement si le fichier IA réel existe.
- Pendant la visite au scroll, une image IA correspondante apparaît au repos ; le contrôle discret « Voir en 3D / Mode réaliste » bascule sans changer le scroll ni la caméra.

**Validation navigateur après refonte** : 11 vues capturées au premier accès en 7,7 s ; 5 associations IA disponibles ; 0 carte vidéo en l’absence de MP4 ; toutes les vignettes Three.js chargées ; comparaison du séjour chargée à 1920 px pour la référence ; bascule IA ↔ scène 3D vérifiée sur le waypoint séjour ; aucune erreur console, aucun échec réseau et aucune requête `.mp4`.

**Test IA antérieur toujours valide** sur « Séjour » : OpenRouter et `/api/save-generated` ont répondu HTTP 200 ; `photor-sejour.png` a été ajouté sans supprimer les 4 entrées déjà au manifeste. Fichier PNG d’environ 1,34 Mo ; l’image générée mesurait 1365 × 768 et le coût affiché était **0,068 $**. Vérifier visuellement la fidélité avant usage : le modèle peut modifier subtilement des détails malgré le prompt.

### Import PDF et export vidéo local
- `editor.html` charge PDF.js 3.11.174 depuis cdnjs. La sélection ou le dépôt d’un PDF rend sa première page en PNG jusqu’à 3600 px de grand côté, puis passe par le même état `S.planImg` que JPG/PNG : calque, calibration `K` et entrée de `EditorAI` partagent donc les mêmes pixels.
- Le bouton « 🎥 Exporter l’animation vidéo » enregistre le canvas Three.js avec `MediaRecorder`, anime le scroll de 0 à 100 % (élévation puis pièces) en 24 s et restaure ensuite la position/le mode de visite. Les contrôles caméra/qualité sont verrouillés pendant la capture ; le même bouton ou Échap termine une capture anticipée.
- Chromium privilégie MP4/H.264 s’il le propose, sinon WebM ; `POST /api/save-video` écrit le flux (limite 250 Mo) sous `assets/generated/videos/` et ajoute le média au manifeste sans appel IA.
- **Validation navigateur** : PDF synthétique sélectionné et déposé, raster 2448 × 3168 px, outil d’échelle activé, aucune erreur console. Capture complète de 24 s, MP4 de 5,5 Mo, lisible en galerie (792 × 522, durée 23,28 s) ; entrée API et manifeste présentes, scroll restauré à sa valeur initiale. La capture d’essai conservée est `assets/generated/videos/visite-cinematique-20261119T082440577Z.mp4`.

### Image-to-Video OpenRouter — implémenté, appels payants en attente de confirmation UI
- `bytedance/seedance-2.5-flash`, premières images façade/séjour, 5 s, 16:9, audio désactivé, résolution honnête **720p** (le modèle ne propose pas le 1080p).
- `/api/ai/video-quote` estime 0,3363 $/clip et 0,6726 $/2 clips au tarif Seed annoncé ; l’interface de galerie demande une confirmation séparée par clip, puis suit le job, télécharge le MP4 et persiste son coût réel/statut dans `manifest.json`.
- La tâche et son ID sont sauvegardés dans le manifeste pour éviter les doublons payants en cas de rechargement/redémarrage ; fichiers attendus `anim-arrivee.mp4` et `anim-sejour.mp4` dans `assets/generated/videos/`.
- L’API a été testée sans lancer de génération facturable : clé détectée via le chemin `.env` externe, quote cohérent, requêtes invalides rejetées, API galerie fonctionne. Les deux clips n’ont pas encore été soumis : utiliser le bouton « 🎞 Générer les clips IA » et approuver chaque confirmation de coût.
- Les frames sont transmises en data URL ; la doc OpenRouter recommande HTTPS public. En cas de refus du fournisseur, configurer `OPENROUTER_PUBLIC_BASE_URL` sur un hébergement HTTPS public des assets avant le lancement.

### Étape 6 — Banc d'essai des modèles de lecture IA
La clé est maintenant détectée par le serveur local. Essai réel de `openai/gpt-6-luna` effectué ; résultats et écart à la référence en section 3. Le banc comparatif des modèles, avec répétitions et mesures de précision, reste à construire.

**Objectif** : choisir le modèle sur des chiffres mesurés, pas sur une supposition. On utilise la **Villa Serena** comme référence exacte :
- image : `Engineer Dollar Bakoh.jpg` ;
- vérité terrain : `HOUSE_DATA` dans `js/data.js` (22 murs, 21 ouvertures, 13 pièces) ;
- échelle : 48 px/m, origine `[298.5, 300]`.

**À construire** : une petite page `bench.html`, ou un bouton caché dans l'éditeur, qui :
1. charge `js/data.js` et l'image du plan ;
2. pour chaque modèle candidat, envoie la même requête que `js/editorAI.js` (réutiliser `EditorAI.INSTRUCTIONS`, `EditorAI.prepareImage`, `EditorAI.convert`) via `/api/ai/chat`, avec `temperature: 0` et `response_format: json_object` ;
3. compare le résultat converti à `HOUSE_DATA` :
   - **murs** : nombre trouvé / 22 ; appariement de chaque mur de référence au mur détecté le plus proche ; **erreur moyenne et maximale en cm** sur les extrémités ;
   - **ouvertures** : nombre et type corrects (porte / fenêtre / passage) / 21 ; erreur de position le long du mur et erreur de largeur ;
   - **pièces** : nombre / 13 ; noms reconnus ; écart de surface en % ;
   - **échelle** : `px_per_meter` détecté face aux 48 px/m réels ;
   - **coût réel** (`usage.cost` renvoyé par OpenRouter) et **durée** ;
   - JSON valide du premier coup : oui / non ;
4. affiche un tableau comparatif et l'enregistre (par exemple `assets/bench/resultats-AAAA-MM-JJ.json`, plus un résumé à l'écran) ;
5. lance chaque modèle **2 fois**, pour mesurer la stabilité (une IA peut varier d'un essai à l'autre).

**Modèles à comparer** (prix du 18/11/2026, entrée / sortie par million de tokens) :
- `anthropic/claude-sonnet-5.5` (2 $ / 10 $) ;
- `openai/gpt-6.2-sol` (2 $ / 10 $) ;
- `google/gemini-3.5-flash` (1,50 $ / 9 $) ;
- `openai/gpt-6-luna` (0,10 $ / 0,50 $) ;
- facultatif : `anthropic/claude-opus-5.5` (4 $ / 20 $), pour savoir si le modèle haut de gamme vaut l'écart.

**Coût total estimé** : quelques centimes (environ 5 modèles × 2 essais × 0,01 à 0,10 $).

**Décision ensuite** : mettre le gagnant (meilleur compromis précision / coût) en tête de la liste `MODELS` dans `js/editorAI.js`. Ajouter éventuellement une **relance automatique** avec un modèle plus puissant si les contrôles échouent : murs non refermés, pièce non close, ouverture hors mur, surfaces incohérentes avec les cotes.

### Étape 7 — Tests d'ensemble
- **Lecture IA avec une vraie clé** sur 2 ou 3 plans réels ; comparer Claude Sonnet 5.5, Gemini 3.5 Flash et GPT-6.2 Sol.
- **Parcours complet** d'un nouveau projet : image → lecture IA → corrections → pièces auto → caméras → enregistrement → visite 3D → rendus HD → photoréalisation.
- **Vérification des FPS** sur l'écran de l'utilisateur.
- **Ménage** : supprimer le projet de test `projects/test-l/`.
- **Villa Serena** : `projects/villa-serena/project.json` contient l'ancien parcours caméra réglé à la main, ce qui est volontaire. Pour tester le nouveau parcours automatique : outil Caméras → « Régénérer automatiquement ».

### Idées notées pour plus tard
- Étendre la galerie vidéo IA à des variantes additionnelles (jour/nuit, drone) après validation des deux premiers clips Seedance.
- Textes commerciaux (description du bien, devis) avec un modèle peu cher (Claude Haiku 5.5, GPT-6 Luna).
- Page vitrine avec démos, grille de devis, export d'un dossier prêt à héberger.

---

## 6. Clé OpenRouter — configuration locale

Le projet lit la clé depuis le fichier `.env` externe que l’utilisateur a désigné ; `start.bat` transmet uniquement son chemin dans `OPENROUTER_ENV_FILE`. Le secret n’est pas copié dans le dossier du projet ni dans cette passation.

**Vérification effectuée** : l’API locale indique `configured: true`, l’éditeur affiche « Clé OpenRouter détectée », et les requêtes HTTP vers `/.env` et `/openrouter.key` sont refusées (403). Ne jamais afficher ni copier le secret.

**Modèles vision proposés** (prix OpenRouter relevés le 18/11/2026, entrée / sortie par million de tokens) :
- `anthropic/claude-sonnet-5.5` 2 $ / 10 $ (par défaut, environ 0,05 $ par plan) ;
- `google/gemini-3.5-flash` 1,50 $ / 9 $ ;
- `openai/gpt-6.2-sol` 2 $ / 10 $ ;
- `openai/gpt-6-luna` 0,10 $ / 0,50 $ (très économique) ;
- `anthropic/claude-opus-5.5` 4 $ / 20 $ (plans difficiles).

---

## 7. Points d'attention

- `js/app.js`, `index.html` et `serve.js` contiennent plusieurs fonctions liées (galerie, mode photo, export MediaRecorder et API médias). **Relire un fichier juste avant de l'éditer**, faire des modifications courtes et ciblées, ne jamais réécrire un fichier partagé en entier.
- `start.bat` lance maintenant uniquement le serveur Node ; `serve.py` est un aperçu statique historique, limité à localhost et sans API.
- La clé OpenRouter reste hors du dossier du projet : utiliser une variable d'environnement ou un fichier local `openrouter.key` non partagé ; ne jamais afficher ni copier le secret dans la passation.
- **Format du projet** :
  - pièces = `bounds` (rectangle), plus `poly` facultatif (liste de `[x,z]`) ; `bounds` est toujours recalculé depuis `poly` ;
  - ouvertures = `{ type: door|window|bay|open, at (m depuis from), w, h, sill, hinge: start|end, side: 1|-1, entry? }`.
- **Coordonnées** : mètres, X = est, Z = sud (vers le bas de l'écran). L'éditeur **recentre automatiquement** la maison sur (0,0) à l'enregistrement : le moteur 3D l'attend (ombres, plan de présentation, caméras).
- **Elévation** : les murs et le mobilier sont **fusionnés** après construction (`mergeStatic`, `mergeFurniture` dans `js/realism.js`). Pour ajouter un objet qui doit monter avec les murs, l'ajouter **avant** la fusion (dans `initRealism`) ou directement au groupe fusionné.
- **Pas de `git`** dans ce dossier : penser à faire une copie de sauvegarde avant les gros changements.
