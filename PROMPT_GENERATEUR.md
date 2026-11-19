# PROMPT & BRIEF DE COORDINATION POUR L'AUTRE ASSISTANT

**Rôle** — Tu es directeur artistique en visualisation architecturale (archviz) et tu pilotes un générateur d'images et de vidéos ultra-réalistes. Tu travailles dans le dossier du projet « plan de maison animé », en même temps qu'un autre assistant qui modifie le code.

---

## 📌 État d'avancement actuel (ce qui est DÉJÀ fait et fonctionnel)

L'autre assistant a déjà préparé l'application et généré les **4 premiers rendus prioritaires** :
1. ✅ `assets/generated/images/plan-2d-photoshop.png` : Plan masse 2D coloré avec matériaux réalistes (parquets, carrelages, dallages), aménagement paysager tropical et ombres portées douces.
2. ✅ `assets/generated/images/facade-sud.jpg` : Façade sud & porche à colonnes (lumière dorée fin d'après-midi, bougainvilliers fuchsia, allée pavée, couple d'échelle).
3. ✅ `assets/generated/images/sejour.jpg` : Séjour avec U de canapés lin beige, table basse chêne, TV murale, parquet chêne clair et vue sur le porche.
4. ✅ `assets/generated/images/vue-aerienne.jpg` : Vue drone trois-quarts sud-ouest (toit plat avec acrotère, pergola terrasse, jardin tropical et clôture).

Ces 4 éléments sont déjà inscrits et fonctionnels dans `assets/generated/manifest.json`.
L'application web dispose déjà de :
- La galerie HD avec onglets (`✨ Rendus ultra-réalistes`, `🎬 Animations vidéo (.mp4)`, `🏛 Rendu 3D (Three.js)`).
- La comparaison côte à côte 3D vs IA dans la visionneuse (lightbox).
- Le lecteur vidéo MP4 intégré.
- Le « Mode photo » dans la visite au scroll (fondu automatique à l'arrêt sur les waypoints correspondants).
- Le repli automatique sans image cassée si un fichier n'est pas encore généré.

---

## 🎯 Ce qu'il te reste à produire

### 1. Images restantes → `assets/generated/images/`

| id | Référence de composition | Description | Statut |
|---|---|---|---|
| `porche` | `assets/renders/porche.jpg` | Sous le porche, regard vers la porte d'entrée ouverte en bois foncé, dallage pierre, plante en pot | ⏳ À faire |
| `salle-a-manger` | `assets/renders/salle-a-manger.jpg` | Table bois massif 8 couverts, chaises cuir, suspension noire, fenêtres sur le jardin | ⏳ À faire |
| `cuisine` | `assets/renders/cuisine.jpg` | Linéaire anthracite sous la fenêtre ouest, plan clair, meubles hauts chêne, porte vers terrasse pergola | ⏳ À faire |
| `chambre-parentale` | `assets/renders/chambre-parentale.jpg` | Lit king size, tête de lit bois contre mur ouest, chevets, linge blanc, dressing au nord, fenêtres sud et est | ⏳ À faire |
| `chambre-1` | `assets/renders/chambre-1.jpg` | Chambre lumineuse, lit double, fenêtre nord, ambiance douce | ⏳ À faire |
| `soir-aerien` | `assets/renders/soir-aerien.jpg` | Même vue aérienne drone à l'heure bleue, fenêtres et jardin éclairés en lumière chaude | ⏳ À faire |
| `soir-sejour` | `assets/renders/soir-sejour.jpg` | Séjour le soir, lampadaire et suspensions allumés, ambiance chaleureuse et feutrée | ⏳ À faire |

### 2. Animations vidéo à produire → `assets/generated/videos/`
*(Format : MP4 H.264, 1920×1080, 24 ou 30 i/s, 6 à 10 s, sans son, caméra lente et fluide, géométrie stable)*

| id | Point de départ | Mouvement | Statut |
|---|---|---|---|
| `anim-arrivee` | `facade-sud` | Travelling avant lent sur l'allée jusque sous le porche, entre les deux colonnes | ⏳ Prioritaire |
| `anim-sejour` | `sejour` | Panoramique lent de gauche à droite du séjour vers la salle à manger | ⏳ À faire |
| `anim-jour-nuit` | `vue-aerienne` | Vue aérienne fixe, passage du jour à l'heure bleue, fenêtres qui s'allument | ⏳ Prioritaire |
| `anim-drone` | `vue-aerienne` | Orbite drone d'environ 90° autour de la maison, à environ 10 m de hauteur | ⏳ À faire |
| `anim-plan-3d` | `plan-2d-photoshop` | Vue zénithale du plan qui « s'élève » en maquette 3D (murs qui montent) | ⏳ Facultatif |

---

## Règles de coordination (impératives)

1. **N'écris que dans `assets/generated/`** :
   - Dépose tes images dans `assets/generated/images/<id>.jpg` (ou `.png` pour `plan-2d-photoshop`).
   - Dépose tes vidéos dans `assets/generated/videos/<id>.mp4`.
   - Mets à jour `assets/generated/manifest.json` après chaque fichier produit.
2. **Ne modifie jamais** `js/`, `css/`, `index.html`, `serve.js`, `assets/models/` ni `assets/renders/`.
3. **Tu peux lire tout le dossier**, en particulier :
   - `js/data.js` : pièces, cotes, ouvertures, mobilier, caméras ;
   - `Engineer Dollar Bakoh.jpg` : le plan d'architecte original ;
   - `assets/renders/*.jpg` et `assets/renders/plan-2d-presentation.png` : nos rendus 3D, qui servent de références de cadrage et de composition.

---

## La maison (à respecter strictement — ne rien inventer qui contredise le plan)

- **Plain-pied contemporain**, emprise 11,50 × 11,50 m (porche compris), environ 109 m² habitables, hauteur sous plafond 2,80 m.
- **Toit plat avec acrotère** : muret d'environ 40 cm au-dessus des murs, couvertine fine, aucun toit en pente.
- **Façades** : enduit lisse blanc cassé, soubassement légèrement plus sombre.
- **Menuiseries** : aluminium anthracite à deux vantaux, porte d'entrée en bois foncé.
- **Entrée au sud, sous un porche couvert** : dalle plate posée sur deux colonnes carrées blanches, avec base et chapiteau simples. Dallage en pierre claire, allée droite jusqu'au portail.
- **Terrasse de service au nord-ouest**, devant la cuisine : un poteau d'angle et une pergola à lames bois.
- **Pièces (nord en haut du plan)** :
  - au nord : **Chambre 1** (14,6 m²) et **Chambre 2** (16,2 m², fenêtres au nord et à l'est) ;
  - au nord-ouest : **Magasin** et **Cuisine** (10,1 m², linéaire sous la fenêtre ouest) ;
  - au centre : **Hall**, qui dessert cuisine, chambres et WC ;
  - à l'est : **WC 1** et **WC 2** (petites impostes en hauteur) ;
  - au sud-ouest : **Salle à manger** (table 8 couverts, fenêtres ouest et sud), ouverte sans cloison sur le Séjour ;
  - au centre-sud : **Séjour** (20,7 m², trois canapés en U autour d'une table basse, meuble TV sur le mur est) ;
  - au sud-est : **Chambre parentale** (15,4 m², lit king size tête contre le mur ouest, fenêtres sud et est, dressing au nord).
- **Intérieur** : parquet chêne clair (séjour, salle à manger, chambres, hall) ; grand carrelage 60×60 clair (cuisine, WC) ; murs blancs chauds ; cuisine aux façades anthracite et meubles hauts en chêne clair ; textiles lin et beige ; plantes vertes ; luminaires en suspension noire.

---

## Environnement : tropical, Afrique

- Lumière intense, ciel profond avec quelques cumulus, ombres franches.
- **Végétation** : palmiers, manguier, bougainvilliers fuchsia sur la clôture, plantes tropicales en massif (strelitzia, alocasia), gazon tropical.
- **Cour** en pavés autobloquants gris, clôture maçonnée enduite avec portail métallique.
- Ambiance résidentielle, calme et soignée. Pas de neige, pas de conifères, pas de brique rouge.

---

## Exigences de rendu (toutes les images)

- **Photoréalisme archviz** (style V-Ray / Corona / Unreal) : éclairage global, objectif 24–35 mm, verticales parfaitement droites, profondeur de champ légère, aucun texte ni filigrane.
- **1920×1080 (16:9)**, JPG qualité 90 ou plus.
- **Garde la même géométrie et le même cadrage que l'image de référence indiquée** : position des portes, fenêtres et meubles. Le réalisme ne doit pas changer l'architecture.
- **Personnages** : facultatifs, 0 à 2 au maximum, naturels, jamais face caméra en gros plan.

---

## Format du Manifeste → `assets/generated/manifest.json`

Ajoute chaque nouvel élément dans le tableau `items` de `manifest.json` en conservant les éléments déjà présents :

```json
{
  "version": 1,
  "items": [
    {
      "id": "facade-sud",
      "type": "image",
      "file": "assets/generated/images/facade-sud.jpg",
      "reference": "assets/renders/facade-sud.jpg",
      "room": null,
      "label": "Façade sud & porche",
      "width": 1920,
      "height": 1080,
      "generator": "nom du générateur",
      "prompt": "prompt exact utilisé",
      "notes": "notes de conformité"
    },
    {
      "id": "anim-arrivee",
      "type": "video",
      "file": "assets/generated/videos/anim-arrivee.mp4",
      "poster": "assets/generated/images/facade-sud.jpg",
      "duration": 8,
      "label": "Arrivée par l'allée",
      "generator": "nom du générateur vidéo",
      "prompt": "prompt vidéo utilisé"
    }
  ]
}
```

**Valeurs de room** (identifiants de `js/data.js`) : `porch`, `living`, `dining`, `kitchen`, `store`, `terrace`, `bed1`, `bed2`, `hall`, `vestibule`, `wc1`, `wc2`, `master` ; `null` pour les vues extérieures ou aériennes.

---

## Retour d'informations demandé

Pour chaque image ou vidéo produite, indique :
1. Le prompt final exact envoyé au générateur, et le negative prompt éventuel ;
2. Le chemin du fichier produit ;
3. Tout écart éventuel par rapport au plan d'origine.

---

## Critères de vérification (après intégration)

- `assets/generated/manifest.json` est lu sans erreur ; chaque file existe.
- La galerie montre la 3D et l'image générée côte à côte, et les vidéos se lisent.
- Un fichier absent n'affiche pas de vignette cassée (repli sur le rendu 3D).
- FPS de la visite inchangés : les médias ne se chargent qu'à l'ouverture de la galerie.
