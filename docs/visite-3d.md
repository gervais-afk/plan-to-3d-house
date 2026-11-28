# Visite 3D

Ce que voit et fait le visiteur dans `index.html?project=<dossier>` : élévation du plan, parcours, visite libre, outils client, vidéo, accueil du dossier.

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

## Expérience client : finitions, lumière et brochure

Ouvrez **🎨 Finitions & outils** dans la visite. Les choix restent locaux à la visite et ne modifient pas `project.json`.

- **Finitions PBR** : testez le chêne clair, le carrelage anthracite ou le béton ciré au sol, puis le crépi blanc, le bardage bois ou la pierre sur la façade. Les faces intérieures des murs restent inchangées. **Du projet** rétablit le matériau initial.
- **Ensoleillement** : glissez de **07h00 à 20h00** par quarts d’heure, ou utilisez **N** pour basculer entre 13h et 20h. Le soleil et les ombres suivent une trajectoire indicative ; les lampes s’allument progressivement le soir. `config.northDegrees` peut orienter le nord dans le plan (0 = −Z, 90 = +X). Dans ce mode par défaut, latitude, date et relief ne sont pas simulés. Pour une étude par lieu et date, activez l’option décrite plus bas.
- **Mesures** : après l’élévation, appuyez sur **M** ou **📐 Mesurer**, puis sélectionnez deux points visibles sur des murs ou des sols. La cote est la distance directe en 3D dans la maquette. Répétez pour ajouter des cotes, utilisez **M** ou **Échap** pour quitter, et **Effacer les cotes** pour supprimer les mesures. Le mode mesure libère la souris en visite libre. La vue éclatée suspend la mesure.
- **Pièces** : survolez une pastille, cliquez dessus ou focalisez-la au clavier pour afficher le niveau, la surface calculée en m² et la hauteur sous plafond lorsqu’elle est modélisée. La case **Pièces** masque les pastilles. Ouvrir les outils affiche la maquette 3D à la place d’une éventuelle photo IA.
- **Brochure PDF** : téléchargez deux pages générées dans le navigateur. La première présente la façade avec les finitions choisies et le tableau des surfaces ; la seconde contient le plan de masse du RDC coté et deux cadrages intérieurs de la maquette. Aucun appel OpenRouter ni média préexistant n’est requis. Seul le chargement initial de jsPDF nécessite l’accès au CDN.

Validation rapide : `node --test tests/client-tools.test.cjs`. Dans le navigateur, essayez les cotes et le PDF sur `?project=test-l` (pièce en L), puis les ombres jusqu’à 20h sur `?project=maison-croquis`. Relancez l’export avec une coupe active : les images doivent présenter la maquette complète, sans modifier la coupe dans la visite.

## Variantes, retours et étude solaire

- **Variantes & partage** : nommez et enregistrez jusqu’à 24 variantes locales par projet (réenregistrer un nom remplace sa variante). Un lien fige la caméra, l’élévation, les finitions et l’heure ; le destinataire peut reprendre le scroll à tout moment. Le lien intègre l’instantané, pas les médias de la maquette : il faut que le projet soit disponible sur le serveur d’origine. Le même cadrage conserve la même direction et le même champ vertical ; les bords visibles dépendent du format de l’écran. Après élévation complète, **Comparer A/B** bascule uniquement les finitions au cadrage et à l’heure en cours. **Exporter la variante** applique ces choix aux vues de la brochure, avec le nom et le détail en couverture.
- **Retours client** : créez un dossier, partagez son lien, puis placez un repère sur un sol ou un mur. Les notes sont enregistrées sur le serveur Node, classées par pièce et accessibles depuis le panneau ou la maquette. Le bouton **Actualiser** récupère les nouveaux retours. En mode démo, le lien donne un accès de lecture et d’ajout à ses détenteurs. En mode privé, il faut aussi une invitation active pour ce projet : le rôle **Lecture seule** ne peut pas publier. Le lien de dossier et l’invitation sont distincts. Le stockage, limité à 100 notes par dossier et 100 dossiers par projet, se trouve dans `projects/<projet>/.client-feedback/` (non servi comme fichier statique, ignoré par Git). Sauvegardez ce dossier si vous changez de serveur.
- **Étude par lieu et date** : dans les finitions, activez ce mode et saisissez latitude, longitude, date, décalage UTC à cette date (heure d’été comprise) et nord du plan. Le curseur affiche l’heure civile locale, l’azimut et la hauteur du soleil. Vous pouvez définir des paramètres initiaux avec `config.solarStudy = { date, lat, lon, utc, north }`. Le calcul est une approximation de la position du soleil ; ni météo, ni relief, ni masques voisins non modélisés ne sont simulés.

Tests automatisés : `node --test tests/*.cjs`.

## Projets à étage (R+1)

Les projets peuvent déclarer `level: 0` (RDC) ou `level: 1` (étage) sur les murs, ouvertures, pièces et meubles. `config.floorHeight` définit la hauteur entre niveaux ; `stairwells` décrit les trémies. Une dalle intermédiaire est produite sous les pièces de l'étage. L'éditeur propose les onglets **RDC / Étage 1** et l'outil **Trémie**. La coupe C tient compte de la hauteur totale, et X sépare la dalle et les éléments de toiture compatibles.

## Exporter une visite en vidéo (local et sans IA)

Dans la visite, cliquez sur **🎥 Exporter l’animation vidéo**. Le navigateur enregistre le canvas Three.js pendant le parcours automatique complet (élévation du plan puis visite des pièces, environ 24 secondes) avec `MediaRecorder`, sans appel à un modèle IA. L'export privilégie MP4/H.264 lorsque le navigateur le permet et utilise WebM en repli. La vidéo est envoyée au serveur local, enregistrée dans `assets/generated/videos/` et ajoutée au manifeste : sa carte et son bouton **Visionner** apparaissent dans la galerie. Pendant la capture, les commandes de caméra et de qualité sont verrouillées ; cliquez sur le bouton d'arrêt ou appuyez sur Échap pour terminer plus tôt.

Les clips Image-to-Video sont générés depuis **📷 Rendus HD → 🎞 Générer les clips IA**. La galerie affiche l’estimation et demande une confirmation distincte avant chacun des deux appels payants. Le serveur soumet les tâches asynchrones à OpenRouter, suit leur état, télécharge les MP4 dans `assets/generated/videos/anim-arrivee.mp4` et `assets/generated/videos/anim-sejour.mp4`, puis renseigne le coût réel et les métadonnées dans le manifeste. La génération cible 5 s, 16:9, 720p, sans audio ; Seedance 2.5 Flash ne propose actuellement pas le 1080p pour ce modèle. Une estimation initiale de 0,06726 $/s donne environ 0,3363 $ par clip (0,6726 $ les deux), mais le tarif réel peut varier.

La source locale est transmise comme image intégrée. La documentation OpenRouter recommande une image d’entrée en HTTPS publiquement accessible ; si votre compte/fournisseur refuse les données intégrées, définissez `OPENROUTER_PUBLIC_BASE_URL` dans l’environnement du serveur sur l’URL HTTPS publique de cette application (racine contenant `assets/`) puis redémarrez-le. Ne rendez pas public un hébergement local sans en comprendre les implications de sécurité.

Dans la galerie, la capture MediaRecorder est identifiée par **🎥 Capture 3D locale**, les clips photoréalistes par **✨ Rendu IA**. Pour les images, Gemini est estimé à environ 0,068 $ par rendu. MAI-Image 2.7 Flash est facturé au jeton (tarifs affichés avant confirmation) ; son total dépend du volume d’entrée et de sortie. La lecture IA du plan affiche également son estimation et demande confirmation avant l’appel.

## Ergonomie et accessibilité

- **Visite guidée** : avancez ou revenez par étapes, utilisez la liste **Options → Aller à une étape**, ou continuez à défiler librement. Les étapes sont tirées de la maquette, sans parcours codé pour une maison particulière. Les réglages secondaires sont regroupés dans **Options** ; les raccourcis à une touche peuvent y être désactivés.
- **Clavier et mobile** : toutes les commandes de parcours et d’ouverture des médias sont des boutons natifs. Dans la galerie, Échap ferme d’abord la visionneuse, puis la galerie, et restitue le focus. Activez « Réduire les animations » dans le système pour supprimer les transitions d’interface et les sauts de caméra lissés déclenchés par les commandes.
- **Éditeur** : **Enregistrer** confirme ou explique le résultat côté serveur sans remplacer la sauvegarde par un téléchargement. **Exporter le JSON** permet de récupérer volontairement une copie (sans intégrer l’image du plan). L’API valide la structure principale et remplace le fichier du projet de façon atomique.

La visite guidée et les médias sont navigables sans souris ; la manipulation graphique du plan dans l’éditeur reste pour l’instant un outil de dessin principalement prévu pour souris ou pavé tactile.

## Accueil du dossier

Avec `node serve.js`, `/?project=<dossier>` ouvre la couverture du projet. **Découvrir en 3D** ou le défilement sous la couverture initialise la maquette sans recharger la page. Dans le cockpit, **Outils → Estimation & devis** propose le BQE en CSV, en Excel (`.xlsx`) et en **devis estimatif PDF** cartouché (même estimation `CostEstimate`, montants indicatifs). La navigation **Visite 3D · Dossier & Plans · Estimation · Galerie** ne change pas l’URL du projet. Le dock regroupe les étapes et les commandes de coupe (**C**) et de vue éclatée (**X**). Le bouton **Plan** déplie le radar et **Outils** ouvre les commandes secondaires. Dans *Outils*, les commandes sont groupées par intention — **mode de visite**, **explorer** (galerie, comparaison plan/3D, gabarits), **produire** (Studio IA, livrables), **présenter et partager** — chaque grappe étant un `role="group"` nommé pour les lecteurs d’écran. Le dock bas reste un instrument : filet discret, raccourcis au second plan (`Coupe C`, `Éclaté X`), radar accessible d’un geste. Sur tablette (601–860 px), il passe sur **deux lignes** — lecture de la pièce en haut, transport en bas — et les touches clavier s’effacent puisque l’écran se touche ; le radar et une éventuelle demande de validation sont bornés en hauteur pour ne jamais glisser sous le dock. De 861 à 1080 px, il tient sur une ligne, touches retirées. La variante *dock libre* de la visite libre garde, elle, sa disposition à deux zones.

Les liens directs `index.html?project=<dossier>` et les liens d’étape, de variante ou de validation existants ouvrent toujours la visite. En mode privé, le projet et les médias restent limités au périmètre de la session.

La couverture lit le nom, la description et la géométrie de `project.json`. Elle utilise les premières images publiées dans le manifeste de la galerie, ou les captures de maquette disponibles. Sans rendu, elle dessine un aperçu du plan en SVG sans lancer Three.js. Pour optimiser un rendu de couverture, placez un WebP facultatif à côté du fichier publié : `facade.jpg` → `facade-apercu.webp` dans `generated/images/`. Les polices locales Manrope et Source Serif 4 sont fournies sous leurs licences OFL respectives dans `assets/fonts/`.
