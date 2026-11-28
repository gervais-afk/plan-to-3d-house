# Estimation et avant-métré

Estimation indicative en FCFA (`js/costEstimate.js`) et lot béton armé / HA. Le panneau **Estimation FCFA** de l'éditeur, l'APS automatique et le devis PDF utilisent ce même module.

## Devis estimatif PDF (`js/devisPdf.js`)

Complément « papier » du panneau Estimation et du classeur Excel :

- **bouton** `Devis estimatif PDF` dans la fenêtre *Estimation FCFA* de l'éditeur ;
- **cockpit 3D** (`index.html`) : *Outils → Estimation & devis → Télécharger le devis estimatif · PDF*, à côté du BQE Excel ;
- **livret de réunion** (`js/meetingMode.js`) : chapitre *Estimation* et chapitre *Validation* ;
- **fiche projet / portail client** (`accueil.html`) : bouton `Devis estimatif (PDF)`, module autorisé aux invités ;
- **chaîne complète** du copilote (livrable *Devis & Métré*, produit en PDF cartouché **et** en `.xlsx`).

Document A4 relié, produit localement (jsPDF local, aucun envoi du projet) :

1. **Page de garde** — cartouche du dossier (maître d'ouvrage, localisation, agence, phase, indice, date), synthèse des surfaces, standing retenu, enveloppe travaux en fourchette (bas – haut, mi-point, ordre de grandeur au m²), total par lot ;
2. **Bordereau quantitatif estimatif** — un poste par ligne (désignation, quantité, unité, prix unitaire, montant), prix non sourcés signalés par un astérisque, total des postes ;
3. **Annexes et enveloppe globale**, puis **conditions et réserves** (TTC/HT, fourchette indicative, hors foncier et honoraires, quantités géométriques, caractère non contractuel) et bloc **Bon pour accord** (maître d'ouvrage / architecte).

Règles identiques à l'APS et au catalogue : **aucune mention légale n'est inventée**. Un champ non renseigné est masqué du cartouche et signalé en bas de page. Les montants restent une **fourchette d'avant-projet**, jamais un engagement de prix.

```js
// Navigateur (jsPDF chargé à la demande) ou tests Node (JsPDF injecté)
await DevisPdf.exportPDF(project, estimate, { cabinet, save: false });
DevisPdf.buildModel(project, estimate, { cabinet }); // modèle testable sans PDF
```

## Avant-métré Béton armé & HA

`CostEstimate.estimate(project, { structure: { … } })` ajoute les postes BA/HA
au bordereau et à `bordereauCSV()`, sans modifier le budget global au m².
Les anciens postes, identifiants et champs restent disponibles.
Exemple de paramètres :

```js
const result = CostEstimate.estimate(project, {
  structure: {
    enabled: true,
    foundationLevel: 0,
    concretePrice: 75000,
    ha12Price: 7800,
    ha10Price: 5400,
    stirrupDiameter: 6, // 6 ou 8
    stirrupPrice: 3500
  }
});
console.log(result.structure.volumes, result.structure.steel);
console.log(result.structure.warnings);
```

- Semelles : 0,60 × 0,25 m sous les murs extérieurs au niveau de fondation
  uniquement (`type: 'ext'`, ou épaisseur ≥ 20 cm en l'absence de type).
- Poteaux : 20 × 20 cm, hauteur `config.wallHeight` (2,8 m par défaut), aux
  jonctions non colinéaires de chaque niveau, T/X compris. Pas de poteau ajouté
  sur une simple subdivision droite ni de raidisseur intermédiaire automatique.
- Chaînages : deux lignes de 20 × 20 cm sur tous les murs, à chaque niveau.
  Volumes bruts sur axes, sans déduction des jonctions béton ; perte de 5 %.
- Longitudinaux : 4 HA12/poteau, 4 HA10/chaînage. Provision de 40 cm par fil
  et raccords supplémentaires au-delà de 12 m ; ce n'est pas un calcul d'ancrage.
- Cadres : HA6 (ou HA8), tous les 20 cm, enrobage 2,5 cm, périmètre à l'axe
  de l'acier et deux crochets provisionnels de 6 cm. Quantités par ligne
  continue ; intersections de cadres non déduites.
- Acier théorique : longueur × diamètre²/162 kg/m. Achats :
  `ceil(longueur × 1,10 / 12)` par diamètre. Il s'agit d'une provision mutualisée,
  pas d'un plan de coupe optimisé. `massKg` exclut les chutes ; `bars` les inclut.

Les prix sont des repères utilisateur, non des tarifs fournisseurs vérifiés.
Le dosage de 350 kg/m³ ne garantit pas une classe de résistance. Les sections,
recouvrements, crochets et enrobages doivent être validés par un ingénieur avec
l'étude de sol et les charges du bâtiment. **Armatures des semelles, dalles et
linteaux, coffrage et main-d'œuvre non compris** : ce lot est partiel. La dalle
de couverture reste dans son poste existant. Ne pas additionner le bordereau
au budget au m². Les avertissements sont disponibles dans `result.structure`
et exportés dans le CSV lorsque le lot est activé.

Fonctions pures exposées en navigateur et Node : `structureSettings()`,
`structuralGeometry()`, `reinforcedConcrete()`, `steelKgPerMeter()`.
