# Éditeur de plan

Dessiner ou importer un plan dans `editor.html`, puis produire les documents client.

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

Sans paramètre, `index.html` ouvre le projet par défaut `residence-verandas` (repli sur `villa-serena` s'il est absent).

## Projet de démonstration `maison-croquis`

Ouvrez `http://127.0.0.1:8000/index.html?project=maison-croquis` pour voir le relevé indicatif du croquis coté. Les deux références papier sont conservées dans `assets/plans/` (`croquis-cote.jpg` et `croquis-technique.jpg`). Le calque de fond utilise la copie du dessin coté dans le dossier du projet, calibré à environ **35,2 px/m** sur la cote manuscrite **15,50 m**, avec l'origine au centre de l'emprise. Les murs, pièces, ouvertures et surfaces sont une interprétation de démonstration à confirmer sur site ; le dessin ne spécifiant aucun étage, le projet reste un RDC. Une toiture plate de démonstration est présente uniquement pour tester la vue éclatée X, pas comme relevé d'une toiture existante.

Au chargement, l'image du plan est posée à plat sous la maison ; elle s'estompe à mesure que les murs se dressent. Le raccourci P permet de la réafficher/masquer.

## 🤖 Chaîne complète — du brief au dossier livré

Le copilote (`js/aiAssistant.js`, carte *Chaîne complète*, raccourci ⌘J / Ctrl+J) enchaîne six étapes, directement dans l'onglet **Conception** :

1. **Conception 2D/3D** : un brief court (« Villa plain-pied 140 m² à Douala, 3 chambres, véranda ») est converti en plan par `/api/ai/generate-plan`, injecté sur le canevas avec conservation de la pile **Ctrl+Z**, puis affiché en vue partagée **2D + 3D**. Brief vide = plan actif conservé.
2. **Meublage automatique** : `EditorAPI.autoFurnishRooms()` aménage séjour, cuisine, chambres et salle d'eau.
3. **Conformité & notice** : `/compliance-autofix` (portes ≥ 0,90 m, HSP, vitrage 1/6) et `/editorial-brief` (sous-titre, parti architectural, description).
4. **Enregistrement** : `/api/save-project` puis création d'une **révision datée** (`/revisions`).
5. **Jalon cartouche** : `/document-safety` vérifie le profil cabinet et le verrou **Porte E**. Si le cartouche est incomplet (maître d'ouvrage, localisation, agence, phase, indice, date), un mini-formulaire s'ouvre dans le chat : l'architecte confirme, rien n'est inventé.
6. **Livrables** : chaque case cochée est produite et son statut réel est reporté dans la carte — **APS Auto PDF**, **Devis & Métré FCFA** (devis estimatif PDF cartouché **et** classeur `.xlsx`), **Cahier de plans A3 PDF** (page estimation incluse), **Catalogue Premium PDF** et **Dossier APD / Permis PDF** (décoché par défaut : il suppose les pièces PC-01 → PC-08 réunies).

À tout moment : **■ Stopper** interrompt la chaîne, **↩ Annuler (Ctrl+Z)** restaure le plan tel qu'il était avant le lancement. L'ensemble est réservé à l'architecte : un invité du portail reçoit un **403** sur les routes de conception, de sécurisation et d'export.

Depuis l'accueil, le studio ou la visite 3D, le bouton *Chaîne complète* bascule vers `editor.html` avec reprise automatique (`autoAction=run_studio_pipeline` + brouillon conservé en `sessionStorage`).

## Documents pour le client

Ces boutons de la barre d'outils travaillent sur le projet **ouvert dans l'éditeur** (tous niveaux). Pour utiliser les images d'un projet, enregistrez-le d'abord : elles sont lues dans `projects/<dossier>/generated/`.

### 📋 APS Auto — avant-projet sommaire

Produit un PDF de 6 pages à partir des données réelles du projet (`js/apsGenerator.js`) :

1. **Couverture** : nom, sous-titre, maître d'ouvrage, ville, programme, date. Si le projet a une façade photoréaliste validée « Catalogue » dans la galerie, elle illustre la couverture avec la mention « générée par IA, à titre d'illustration ».
2. **Présentation** : nature (plain-pied ou R+n), surfaces habitables brute et nette, annexes, surface de référence, hauteur sous plafond, menuiseries.
3. **Programme** : chaque pièce, son usage et sa surface, par niveau (pagination automatique).
4. **Estimation** : lots et total en FCFA calculés par `CostEstimate`, comme le panneau **Estimation FCFA** (voir [estimation.md](estimation.md)).
5. **Calendrier** : phases ESQ, APS, APD, permis, PRO/DCE, consultation ; durée des travaux selon la surface et le nombre de niveaux.
6. **Vigilance** : remarques de `Habitability` (passages, éclairement…), suites à donner, encadré « Bon pour accord ».

Pour un APS personnalisable à la main, ouvrez `aps-template.html` (montants en FCFA, export par l'impression du navigateur).

### 🎨 Catalogue Premium

Brochure client de 2 pages (`js/clientBrochurePremium.js`), en 3 styles : **Moderne**, **Luxe**, **Industriel** (`setStyle()`).

- **Couverture** : façade photoréaliste **validée « Catalogue »** si elle existe ; sinon vue 3D (dans la visite) ; sinon plan du rez-de-chaussée avec le nom des pièces. Statistiques : surface habitable, surface totale, nombre de pièces.
- **Page 2** : plan de masse, puis deux vues intérieures photoréalistes validées si elles existent, sinon le programme des espaces.
- Les cases du dialogue (statistiques, plan, vues intérieures) sont prises en compte.

### ✨ Sublimer avec l'IA

Photoréalise les **vues enregistrées dans la visite 3D** (`projects/<dossier>/generated/renders/`) avec OpenRouter, via le serveur local (`js/aiEnhance.js`) :

1. Le projet doit être enregistré et avoir au moins une vue enregistrée dans la visite 3D (l'éditeur ne calcule pas de vue 3D lui-même).
2. Seules les vues **manquantes** pour les documents sont traitées : au total une vue extérieure et deux vues intérieures.
3. Une confirmation affiche les vues et le **coût estimé** (Gemini 3.1 Flash Image : environ 0,068 $ par image) avant tout appel facturé.
4. Le serveur relaie l'appel (`POST api/ai/images`) avec le prompt piloté par le projet (`js/aiPrompt.js`, comme la visite 3D) : prompt extérieur qui conserve arbres, ombres, ouvertures et couleur de façade, prompt intérieur selon l'usage de la pièce. L'image est enregistrée dans la galerie du projet (`api/save-generated`) avec son contrôle de fidélité.
5. **Validation obligatoire** : un rendu IA peut inventer ou retirer des éléments (essais réels : lit posé sur la pelouse, arbres supprimés avec leur ombre restée, façade recolorée). Comparez-le à la vue 3D dans la galerie de la visite, puis cochez **Catalogue**. Le catalogue et l'APS n'utilisent **que** les images cochées ; sans image validée, ils gardent le plan.

Le contrôle de fidélité (`js/fidelityCheck.js`) compare les lignes de l'architecture : il repère une caméra déplacée ou une baie inventée, mais **pas** un objet ajouté ou retiré. Le contrôle visuel de l'architecte reste indispensable.

La clé OpenRouter est lue par `serve.js` dans `openrouter.key` (ignoré par Git) ou `OPENROUTER_API_KEY`.

### Outils avancés

Le bouton **Outils avancés** regroupe les modules d'analyse et d'export : vectorisation et export DXF/SVG, analyse structurelle, analyse bioclimatique, export BIM (IFC, gbXML), vérification réglementaire, générateur de variantes, copilote. Leur API est décrite dans [api-modules.md](api-modules.md).
