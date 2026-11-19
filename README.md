# Plan de Maison Animé — Du Dessin 2D à la Visite 3D Immersion

Projet inspiré des expériences virales d'architecture web (*Samnang Aing / Claude 3D Walkable Apartments*).

Ce projet transforme un **plan d'architecte 2D en noir et blanc** (fond papier crème, traits d'encre fine, cotes de dimensions) en une **maison 3D entièrement explorable** au défilement (*scroll*) ou au clavier/souris (*Mode Visite Libre FPS*).

---

## 🌟 Fonctionnalités Implémentées

1. **L'Illusion du Plan 2D d'Origine** :
   - Au chargement, la scène s'ouvre sur une vue zénithale orthogonale (caméra en surplomb à 24 m).
   - Fond papier d'architecte chaud (`#F5F2EB`), grille millimétrée subtile et cotes de dimensions réelles.
   - Tracé des cloisons à l'encre fine noire (`#111827`).

2. **Élévation 3D au Défilement (*Scrollytelling*)** :
   - En scrollant de 0 % à 20 %, les murs s'élèvent progressivement du plan jusqu'à $2{,}80\text{ m}$ de hauteur.
   - Les ombres douces et l'éclairage zénithal s'activent.
   - Les cotes 2D s'estompent pour laisser place aux volumes 3D.

3. **Visite Cinématique Pièce par Pièce** :
   - La caméra plonge et descend à hauteur d'yeux ($1{,}65\text{ m}$) devant le porche d'entrée.
   - Elle suit une courbe spline (`CatmullRomCurve3`) traversant :
     * Le Porche d'accueil
     * Le Hall d'entrée
     * Le Grand Séjour cathédrale ($38\text{ m²}$)
     * La Cuisine ouverte et son coin repas ($22\text{ m²}$)
     * La Suite Parentale ($16{,}5\text{ m²}$)
     * La Terrasse extérieure en lattes de bois ($26\text{ m²}$)
   - Au passage de la caméra, les matériaux PBR réalistes se dévoilent (parquet chêne, béton ciré, céramique, vitrage avec reflets).

4. **Mode Visite Libre (*Walkable 3D FPS*)** :
   - Cliquez sur **"Explorer en Visite Libre"** ou appuyez sur **Espace**.
   - Déplacement à la première personne avec les touches **Z, Q, S, D** ou les **flèches directionnelles**.
   - Regard libre à 360° à la souris (verrouillage *Pointer Lock*).
   - Gestion des collisions contre les murs et léger balancement de marche (*head bobbing*).

5. **Radar / Minimap 2D Interactive** :
   - Carte d'architecte temps réel en bas à droite montrant la position exacte du visiteur et son cône de vision.
   - **Téléportation au clic** : cliquez sur n'importe quelle pièce de la minimap pour y déplacer instantanément la caméra.

6. **Coupe, vue éclatée et phasage** :
   - **C** active/désactive une coupe horizontale à mi-hauteur du bâtiment (avec ou sans étage).
   - **X** active/désactive la vue éclatée des dalles intermédiaires et des toitures déclarées en dalle ; la commande reste indisponible si le projet ne contient aucune de ces pièces.
   - Le scroll déroule le phasage de construction : fondation, murs, menuiseries, dalle/sols, mobilier puis auvent ou toiture.
   - **B** bascule le plan de présentation et le plan en encre ; **P** affiche/masque l'image source calée sur le plan.

### Expérience client : finitions, lumière et brochure

Ouvrez **🎨 Finitions & outils** dans la visite. Les choix restent locaux à la visite et ne modifient pas `project.json`.

- **Finitions PBR** : testez le chêne clair, le carrelage anthracite ou le béton ciré au sol, puis le crépi blanc, le bardage bois ou la pierre sur la façade. Les faces intérieures des murs restent inchangées. **Du projet** rétablit le matériau initial.
- **Ensoleillement** : glissez de **07h00 à 20h00** par quarts d’heure, ou utilisez **N** pour basculer entre 13h et 20h. Le soleil et les ombres suivent une trajectoire indicative ; les lampes s’allument progressivement le soir. `config.northDegrees` peut orienter le nord dans le plan (0 = −Z, 90 = +X). Dans ce mode par défaut, latitude, date et relief ne sont pas simulés. Pour une étude par lieu et date, activez l’option décrite plus bas.
- **Mesures** : après l’élévation, appuyez sur **M** ou **📐 Mesurer**, puis sélectionnez deux points visibles sur des murs ou des sols. La cote est la distance directe en 3D dans la maquette. Répétez pour ajouter des cotes, utilisez **M** ou **Échap** pour quitter, et **Effacer les cotes** pour supprimer les mesures. Le mode mesure libère la souris en visite libre. La vue éclatée suspend la mesure.
- **Pièces** : survolez une pastille, cliquez dessus ou focalisez-la au clavier pour afficher le niveau, la surface calculée en m² et la hauteur sous plafond lorsqu’elle est modélisée. La case **Pièces** masque les pastilles. Ouvrir les outils affiche la maquette 3D à la place d’une éventuelle photo IA.
- **Brochure PDF** : téléchargez deux pages générées dans le navigateur. La première présente la façade avec les finitions choisies et le tableau des surfaces ; la seconde contient le plan de masse du RDC coté et deux cadrages intérieurs de la maquette. Aucun appel OpenRouter ni média préexistant n’est requis. Seul le chargement initial de jsPDF nécessite l’accès au CDN.

Validation rapide : `node --test tests/client-tools.test.cjs`. Dans le navigateur, essayez les cotes et le PDF sur `?project=test-l` (pièce en L), puis les ombres jusqu’à 20h sur `?project=maison-croquis`. Relancez l’export avec une coupe active : les images doivent présenter la maquette complète, sans modifier la coupe dans la visite.

### Variantes, retours et étude solaire

- **Variantes & partage** : nommez et enregistrez jusqu’à 24 variantes locales par projet (réenregistrer un nom remplace sa variante). Un lien fige la caméra, l’élévation, les finitions et l’heure ; le destinataire peut reprendre le scroll à tout moment. Le lien intègre l’instantané, pas les médias de la maquette : il faut que le projet soit disponible sur le serveur d’origine. Le même cadrage conserve la même direction et le même champ vertical ; les bords visibles dépendent du format de l’écran. Après élévation complète, **Comparer A/B** bascule uniquement les finitions au cadrage et à l’heure en cours. **Exporter la variante** applique ces choix aux vues de la brochure, avec le nom et le détail en couverture.
- **Retours client** : créez un dossier, partagez son lien, puis placez un repère sur un sol ou un mur. Les notes sont enregistrées sur le serveur Node, classées par pièce et accessibles depuis le panneau ou la maquette. Le bouton **Actualiser** récupère les nouveaux retours. En mode démo, le lien donne un accès de lecture et d’ajout à ses détenteurs. En mode privé, il faut aussi une invitation active pour ce projet : le rôle **Lecture seule** ne peut pas publier. Le lien de dossier et l’invitation sont distincts. Le stockage, limité à 100 notes par dossier et 100 dossiers par projet, se trouve dans `projects/<projet>/.client-feedback/` (non servi comme fichier statique, ignoré par Git). Sauvegardez ce dossier si vous changez de serveur.
- **Étude par lieu et date** : dans les finitions, activez ce mode et saisissez latitude, longitude, date, décalage UTC à cette date (heure d’été comprise) et nord du plan. Le curseur affiche l’heure civile locale, l’azimut et la hauteur du soleil. Vous pouvez définir des paramètres initiaux avec `config.solarStudy = { date, lat, lon, utc, north }`. Le calcul est une approximation de la position du soleil ; ni météo, ni relief, ni masques voisins non modélisés ne sont simulés.

Tests automatisés : `node --test tests/*.cjs`.

### Projets à étage (R+1)

Les projets peuvent déclarer `level: 0` (RDC) ou `level: 1` (étage) sur les murs, ouvertures, pièces et meubles. `config.floorHeight` définit la hauteur entre niveaux ; `stairwells` décrit les trémies. Une dalle intermédiaire est produite sous les pièces de l'étage. L'éditeur propose les onglets **RDC / Étage 1** et l'outil **Trémie**. La coupe C tient compte de la hauteur totale, et X sépare la dalle et les éléments de toiture compatibles.

---

## 🚀 Comment Lancer le Projet

### Méthode recommandée : `start.bat`
Installez **Node.js LTS**, puis double-cliquez sur `start.bat`. Le script démarre `serve.js`, qui fournit les API nécessaires à l'éditeur (enregistrement des projets et appels IA), puis ouvre la visite dans le navigateur.

Accès direct : **http://localhost:8000/index.html** · Éditeur : **http://localhost:8000/editor.html**.

Par défaut, le serveur Node écoute uniquement sur la machine locale (`127.0.0.1`). Pour une prévisualisation derrière un proxy de développement : `HOST=0.0.0.0 node serve.js`. L'ouverture directe de `index.html` ou le serveur Python historique ne donnent pas accès à toutes les fonctions (enregistrement et IA) ; ils ne sont pas pris en charge pour l'usage normal.

---

## Portail privé : partager de vrais projets clients

Le **mode démo ne protège pas les projets**. Pour héberger des maquettes confidentielles, activez le portail Node.js et ne servez **jamais** `projects/`, ni cette racine, via un serveur statique en parallèle.

1. Fournissez `PORTAL_PASSWORD` (mot de passe architecte d’au moins 16 caractères) via les secrets de votre hébergeur ou votre environnement local, jamais dans Git. Définissez `PRIVATE_PORTAL=1` et `PORTAL_ORIGIN` sur l’origine HTTPS exacte du site (par exemple `https://visite.example.com`). Lancez `node serve.js` derrière un proxy TLS qui transmet toutes les routes vers Node sans en mettre les réponses en cache. Utilisez une origine dédiée au portail.
2. Connectez-vous sur `/portal.html`. Choisissez le projet, le rôle **Lecture seule** ou **Lecture et commentaires**, puis la validité (1 à 720 heures). Copiez le lien et envoyez-le au client ; le jeton est affiché une seule fois lors de la création.
3. Le client ouvre le lien et clique sur **Ouvrir la visite invitée**. Pour transmettre une variante ou un dossier de retours, envoyez aussi son lien après activation de l’invitation. La visite et la galerie existante sont consultables ; l’éditeur, les écritures de rendus et les appels IA sont réservés à l’architecte.
4. **Révoquer** invalide le lien et les sessions associées, y compris pour les URL directes des médias. Un onglet ouvert vérifie son accès périodiquement. La révocation ne récupère pas les contenus déjà affichés, enregistrés ou exportés.

Test local : `PRIVATE_PORTAL=1 PORTAL_INSECURE_LOCAL=1 PORTAL_ORIGIN=http://127.0.0.1:8000 node serve.js` (avec `PORTAL_PASSWORD` déjà fourni et le serveur lié à la boucle locale). Ouvrez `http://127.0.0.1:8000/portal.html`, pas `localhost` pour cette configuration. Pour tester un lien sans fermer votre session architecte, ouvrez-le en navigation privée.

Les invitations sont stockées hachées dans `.private-portal/` (ignoré par Git), à conserver sur un volume persistant. Les sessions durent au plus 12 h et sont fermées au redémarrage ; une invitation encore valide peut rouvrir une session. Une installation qui contient ce dossier ne démarre pas sans configuration privée, pour éviter le retour accidentel en mode démo. Hébergement mono-instance ; pas de gestion multi-architectes. Placez les nouveaux plans, médias et modèles privés dans `projects/<slug>/` ; `assets/models/` est réservé à la bibliothèque publique partagée. Ne rendez pas publics les médias protégés pour alimenter un fournisseur IA.

---

## 🛠️ Structure du Projet

```text
plan de maison animé/
│
├── index.html              # Structure HTML5, canvas Three.js et HUD d'architecte
├── css/
│   └── style.css           # Esthétique studio d'architecture, typographie et HUD
├── js/
│   ├── data.js             # Données architecturales (murs, cotes, pièces, mobilier)
│   ├── scene.js            # Moteur Three.js (extrusion procédurale des murs, ombres, lumières)
│   ├── scrollTour.js       # Interpolation cinématique de la caméra au scroll
│   ├── walkController.js   # Contrôleur de marche FPS (ZQSD + Souris + Collisions)
│   ├── minimap.js          # Radar 2D temps réel avec cône de vision
│   └── app.js              # Orchestrateur central
├── serve.py                # Serveur local automatique
├── start.bat               # Script de lancement en 1 clic
└── README.md               # Documentation
```

---

## 📐 Comment Personnaliser Vos Plans

Toutes les dimensions sont centralisées dans `js/data.js` :
- Pour ajouter une pièce : ajoutez une entrée dans `HOUSE_DATA.rooms` avec ses coordonnées `xMin`, `xMax`, `zMin`, `zMax`.
- Pour tracer de nouveaux murs ou changer l'emplacement d'une porte ou d'une fenêtre : modifiez le tableau `HOUSE_DATA.walls`.
- Pour modifier le parcours de la visite automatique : ajustez les points de passage dans `HOUSE_DATA.tourWaypoints`.

## Nouveau projet avec l'éditeur de plan (sans toucher au code)

1. Lancez `start.bat`, puis ouvrez `http://localhost:8000/editor.html`.
2. **Plan PDF / image…** : importez un PDF, JPG ou PNG, ou déposez le fichier sur la zone de dessin. Pour un PDF, seule la première page est utilisée ; PDF.js la rasterise en PNG haute résolution (jusqu'à 3600 px sur le grand côté). Le rendu devient le calque de référence et sert aussi à la calibration et à la lecture automatique du plan par IA.
3. **Échelle (K)** : cliquez les deux extrémités d'une cote connue, puis saisissez sa longueur en mètres. Les mêmes pixels rasterisés sont conservés pour éviter tout décalage de calibration.
4. **Mur ext. (M)** puis **Cloison (C)** : tracez point après point (aimantation et murs droits automatiques ; Échap pour finir, Alt pour un mur en biais).
5. **Porte (D)**, **Fenêtre (F)**, **Passage (B)** : cliquez sur un mur. La première porte extérieure devient l'entrée de la visite. Pour une porte sélectionnée, H inverse les gonds et J le sens d'ouverture.
6. **Pièce (A)** : glissez un rectangle, puis renseignez son nom et son sol dans le panneau de droite (« Ajuster aux murs » recale les bords).
7. Facultatif : **Colonne (O)**, **Auvent (U)**, **Pergola (G)**, **Mobilier (E)** (R pour pivoter un meuble). Les onglets **RDC / Étage 1** séparent les éléments par niveau ; l'outil **Trémie** dessine l'ouverture d'escalier dans la dalle.
8. **Enregistrer** écrit `projects/<dossier>/project.json` et l'image du plan.
9. **Visite 3D ↗** ouvre `index.html?project=<dossier>`. Les projets à étage utilisent `level` et `config.floorHeight` pour placer les pièces et murs du R+1 au-dessus du RDC.

Tout ce que vous ne dessinez pas est généré automatiquement : parcours caméra, vues de rendu HD, lampes, allée et jardin, cotes générales, départ de la visite libre.

Sans paramètre, `index.html` affiche toujours la Villa Serena définie dans `js/data.js`.

### Projet de démonstration `maison-croquis`

Ouvrez `http://127.0.0.1:8000/index.html?project=maison-croquis` pour voir le relevé indicatif du croquis coté. Les deux références papier sont conservées dans `assets/plans/` (`croquis-cote.jpg` et `croquis-technique.jpg`). Le calque de fond utilise la copie du dessin coté dans le dossier du projet, calibré à environ **35,2 px/m** sur la cote manuscrite **15,50 m**, avec l'origine au centre de l'emprise. Les murs, pièces, ouvertures et surfaces sont une interprétation de démonstration à confirmer sur site ; le dessin ne spécifiant aucun étage, le projet reste un RDC. Une toiture plate de démonstration est présente uniquement pour tester la vue éclatée X, pas comme relevé d'une toiture existante.

Au chargement, l'image du plan est posée à plat sous la maison ; elle s'estompe à mesure que les murs se dressent. Le raccourci P permet de la réafficher/masquer.

## Exporter une visite en vidéo (local et sans IA)

Dans la visite, cliquez sur **🎥 Exporter l’animation vidéo**. Le navigateur enregistre le canvas Three.js pendant le parcours automatique complet (élévation du plan puis visite des pièces, environ 24 secondes) avec `MediaRecorder`, sans appel à un modèle IA. L'export privilégie MP4/H.264 lorsque le navigateur le permet et utilise WebM en repli. La vidéo est envoyée au serveur local, enregistrée dans `assets/generated/videos/` et ajoutée au manifeste : sa carte et son bouton **Visionner** apparaissent dans la galerie. Pendant la capture, les commandes de caméra et de qualité sont verrouillées ; cliquez sur le bouton d'arrêt ou appuyez sur Échap pour terminer plus tôt.

Les clips Image-to-Video sont générés depuis **📷 Rendus HD → 🎞 Générer les clips IA**. La galerie affiche l’estimation et demande une confirmation distincte avant chacun des deux appels payants. Le serveur soumet les tâches asynchrones à OpenRouter, suit leur état, télécharge les MP4 dans `assets/generated/videos/anim-arrivee.mp4` et `assets/generated/videos/anim-sejour.mp4`, puis renseigne le coût réel et les métadonnées dans le manifeste. La génération cible 5 s, 16:9, 720p, sans audio ; Seedance 2.5 Flash ne propose actuellement pas le 1080p pour ce modèle. Une estimation initiale de 0,06726 $/s donne environ 0,3363 $ par clip (0,6726 $ les deux), mais le tarif réel peut varier.

La source locale est transmise comme image intégrée. La documentation OpenRouter recommande une image d’entrée en HTTPS publiquement accessible ; si votre compte/fournisseur refuse les données intégrées, définissez `OPENROUTER_PUBLIC_BASE_URL` dans l’environnement du serveur sur l’URL HTTPS publique de cette application (racine contenant `assets/`) puis redémarrez-le. Ne rendez pas public un hébergement local sans en comprendre les implications de sécurité.

Dans la galerie, la capture MediaRecorder est identifiée par **🎥 Capture 3D locale**, les clips photoréalistes par **✨ Rendu IA**. Pour les images, Gemini est estimé à environ 0,068 $ par rendu. MAI-Image 2.7 Flash est facturé au jeton (tarifs affichés avant confirmation) ; son total dépend du volume d’entrée et de sortie. La lecture IA du plan affiche également son estimation et demande confirmation avant l’appel.

### Préproduction HTTPS, avec deux maquettes fictives

Sur un hôte Docker distinct de la démo, faites pointer un **nom DNS dédié** vers l’hôte et ouvrez les ports 80 et 443. Caddy redirige HTTP vers HTTPS, obtient le certificat et relaie toutes les routes vers Node. Le port Node n’est pas publié. N’ajoutez ni CDN avec mise en cache, ni volume de production, ni clé IA à cette installation.

```bash
export STAGING_HOST=visite-recette.example.com  # Remplacer par le DNS réel
read -rs -p 'Mot de passe de recette (16 caractères minimum) : ' PORTAL_PASSWORD; echo
export PORTAL_PASSWORD
docker compose -f deploy/staging/compose.yaml up -d --build
unset PORTAL_PASSWORD
```

Ouvrez `https://<domaine>/portal.html`. L’image ne copie ni le dossier `projects/` habituel ni les rendus historiques : elle embarque uniquement **Atelier Témoin** et **Atelier Contrôle**, plus le code de visite. Les invitations et les données de recette persistent dans les volumes locaux. Utilisez une seule instance Node. Ne réutilisez pas ces volumes pour la production ; `docker compose … down -v` les efface définitivement.

**Recette avant d’y mettre des maquettes réelles :**

1. Sur le domaine final, vérifier la redirection HTTP, le certificat accepté **sans exception** par un téléphone et le cookie `Secure`, `HttpOnly`, `SameSite=Lax`. `PORTAL_ORIGIN` doit être exactement l’origine publique HTTPS (port compris s’il n’est pas standard). Si un autre proxy est ajouté, il doit conserver l’hôte, l’en-tête `Origin`, les cookies et les requêtes `Range` sans mise en cache ; ne pas exposer l’amont HTTP.
2. Créer deux invitations d’Atelier Témoin : lecture seule et lecture + commentaires. Depuis des sessions séparées sur téléphone, ouvrir les liens reçus, puis le lien du dossier de retours. Vérifier que la lecture seule voit les remarques et propositions sans pouvoir écrire, et que l’autre peut publier une remarque et valider une version. Le rendu d’Atelier Contrôle doit rester inaccessible par URL directe.
3. Dans la session « commentaires », ouvrir `projects/atelier-temoin/generated/renders/facade.jpg`, puis révoquer son invitation côté architecte. Recharger cette même URL et vérifier le refus (`401`), y compris avec `Range`, tandis que l’invitation en lecture seule reste valable. Vérifier `Cache-Control: private, no-store` sur le média et le refus depuis le domaine public, sans réponse de cache. Un fichier déjà téléchargé ne peut pas être repris.

La recette de régression locale (`node --test tests/staging-https.test.cjs`, OpenSSL requis) utilise les mêmes maquettes derrière un reverse proxy TLS Node avec certificat de test. Elle ne remplace pas la vérification de Docker/Caddy, du certificat public, des éventuels proxys intermédiaires ni du parcours sur téléphone réel.

### Suivi des décisions (portail privé)

- **Architecte** : dans **Retours & remarques**, ouvrez ou créez un dossier. Pour une remarque, dépliez **Répondre ou modifier le statut** et choisissez **À traiter**, **Répondu** (réponse requise) ou **Clos**. Les clients voient la réponse et le statut dans ce même dossier.
- Pour soumettre une variante, affichez-la dans la visite après l’élévation, donnez un nom à cette version et choisissez **Proposer la vue actuelle**. Envoyez au client l’invitation au projet, puis le lien du dossier. Le lien du dossier seul ne donne pas accès au projet privé.
- **Client** : dans le dossier, **Voir cette version** applique l’instantané publié. Seul le rôle **Lecture et commentaires** peut ensuite choisir **Valider cette version**. L’heure serveur et l’instantané validé sont conservés ; publier une autre version ou modifier la variante locale ne change pas la décision précédente. Le dossier n’identifie pas nominativement le signataire : il ne s’agit pas d’une signature électronique.
- L’instantané v1 contient la vue, les finitions et le soleil, pas une copie des fichiers 3D ou des rendus. L’empreinte SHA-256 de `project.json` rattache la proposition à la maquette au moment de la publication ; une visite restée ouverte sur une ancienne maquette doit être rechargée. Si ce fichier change, la proposition reste consultable dans le dossier mais ne peut plus être affichée sur la nouvelle maquette ni recevoir une nouvelle approbation. Publiez une nouvelle version pour reprendre le processus. Sauvegardez le répertoire `.client-feedback/` de chaque projet avec les données privées du portail.

### Ergonomie et accessibilité

- **Visite guidée** : avancez ou revenez par étapes, utilisez la liste **Options → Aller à une étape**, ou continuez à défiler librement. Les étapes sont tirées de la maquette, sans parcours codé pour une maison particulière. Les réglages secondaires sont regroupés dans **Options** ; les raccourcis à une touche peuvent y être désactivés.
- **Clavier et mobile** : toutes les commandes de parcours et d’ouverture des médias sont des boutons natifs. Dans la galerie, Échap ferme d’abord la visionneuse, puis la galerie, et restitue le focus. Activez « Réduire les animations » dans le système pour supprimer les transitions d’interface et les sauts de caméra lissés déclenchés par les commandes.
- **Éditeur** : **Enregistrer** confirme ou explique le résultat côté serveur sans remplacer la sauvegarde par un téléchargement. **Exporter le JSON** permet de récupérer volontairement une copie (sans intégrer l’image du plan). L’API valide la structure principale et remplace le fichier du projet de façon atomique.

La visite guidée et les médias sont navigables sans souris ; la manipulation graphique du plan dans l’éditeur reste pour l’instant un outil de dessin principalement prévu pour souris ou pavé tactile.

### Accueil du dossier

Avec `node serve.js`, `/` ouvre la présentation du projet en mode démo. La maquette elle-même reste sur `index.html` ; les anciens liens de visite et les fragments partagés restent valides. En mode privé, la présentation du projet est accessible depuis **Options → Présentation du projet**, sous les mêmes droits que sa maquette.

La couverture lit le nom, la description et la géométrie de `project.json`. Elle utilise les premières images publiées dans le manifeste de la galerie, ou les captures de maquette disponibles. Sans rendu, elle dessine un aperçu du plan en SVG sans lancer Three.js. Pour optimiser un rendu de couverture, placez un WebP facultatif à côté du fichier publié : `facade.jpg` → `facade-apercu.webp` dans `generated/images/`. Les polices locales Manrope et Source Serif 4 sont fournies sous leurs licences OFL respectives dans `assets/fonts/`.
