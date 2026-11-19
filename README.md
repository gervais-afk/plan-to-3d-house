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

### Projets à étage (R+1)

Les projets peuvent déclarer `level: 0` (RDC) ou `level: 1` (étage) sur les murs, ouvertures, pièces et meubles. `config.floorHeight` définit la hauteur entre niveaux ; `stairwells` décrit les trémies. Une dalle intermédiaire est produite sous les pièces de l'étage. L'éditeur propose les onglets **RDC / Étage 1** et l'outil **Trémie**. La coupe C tient compte de la hauteur totale, et X sépare la dalle et les éléments de toiture compatibles.

---

## 🚀 Comment Lancer le Projet

### Méthode recommandée : `start.bat`
Installez **Node.js LTS**, puis double-cliquez sur `start.bat`. Le script démarre `serve.js`, qui fournit les API nécessaires à l'éditeur (enregistrement des projets et appels IA), puis ouvre la visite dans le navigateur.

Accès direct : **http://localhost:8000/index.html** · Éditeur : **http://localhost:8000/editor.html**.

Le serveur Node écoute uniquement sur la machine locale. L'ouverture directe de `index.html` ou le serveur Python historique ne donnent pas accès à toutes les fonctions (enregistrement et IA) ; ils ne sont pas pris en charge pour l'usage normal.

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

Ouvrez `http://127.0.0.1:8000/index.html?project=maison-croquis` pour voir le relevé indicatif du croquis coté. Les deux références papier sont conservées dans `assets/plans/` (`croquis-cote.jpg` et `croquis-technique.jpg`). Le calque de fond utilise le dessin coté, calibré à environ **35,2 px/m** sur la cote manuscrite **15,50 m**, avec l'origine au centre de l'emprise. Les murs, pièces, ouvertures et surfaces sont une interprétation de démonstration à confirmer sur site ; le dessin ne spécifiant aucun étage, le projet reste un RDC. Une toiture plate de démonstration est présente uniquement pour tester la vue éclatée X, pas comme relevé d'une toiture existante.

Au chargement, l'image du plan est posée à plat sous la maison ; elle s'estompe à mesure que les murs se dressent. Le raccourci P permet de la réafficher/masquer.

## Exporter une visite en vidéo (local et sans IA)

Dans la visite, cliquez sur **🎥 Exporter l’animation vidéo**. Le navigateur enregistre le canvas Three.js pendant le parcours automatique complet (élévation du plan puis visite des pièces, environ 24 secondes) avec `MediaRecorder`, sans appel à un modèle IA. L'export privilégie MP4/H.264 lorsque le navigateur le permet et utilise WebM en repli. La vidéo est envoyée au serveur local, enregistrée dans `assets/generated/videos/` et ajoutée au manifeste : sa carte et son bouton **Visionner** apparaissent dans la galerie. Pendant la capture, les commandes de caméra et de qualité sont verrouillées ; cliquez sur le bouton d'arrêt ou appuyez sur Échap pour terminer plus tôt.

Les clips Image-to-Video sont générés depuis **📷 Rendus HD → 🎞 Générer les clips IA**. La galerie affiche l’estimation et demande une confirmation distincte avant chacun des deux appels payants. Le serveur soumet les tâches asynchrones à OpenRouter, suit leur état, télécharge les MP4 dans `assets/generated/videos/anim-arrivee.mp4` et `assets/generated/videos/anim-sejour.mp4`, puis renseigne le coût réel et les métadonnées dans le manifeste. La génération cible 5 s, 16:9, 720p, sans audio ; Seedance 2.5 Flash ne propose actuellement pas le 1080p pour ce modèle. Une estimation initiale de 0,06726 $/s donne environ 0,3363 $ par clip (0,6726 $ les deux), mais le tarif réel peut varier.

La source locale est transmise comme image intégrée. La documentation OpenRouter recommande une image d’entrée en HTTPS publiquement accessible ; si votre compte/fournisseur refuse les données intégrées, définissez `OPENROUTER_PUBLIC_BASE_URL` dans l’environnement du serveur sur l’URL HTTPS publique de cette application (racine contenant `assets/`) puis redémarrez-le. Ne rendez pas public un hébergement local sans en comprendre les implications de sécurité.

Dans la galerie, la capture MediaRecorder est identifiée par **🎥 Capture 3D locale**, les clips photoréalistes par **✨ Rendu IA**. Pour les images, Gemini est estimé à environ 0,068 $ par rendu. MAI-Image 2.7 Flash est facturé au jeton (tarifs affichés avant confirmation) ; son total dépend du volume d’entrée et de sortie. La lecture IA du plan affiche également son estimation et demande confirmation avant l’appel.
