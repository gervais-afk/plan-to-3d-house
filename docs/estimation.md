# Estimation et avant-métré

Estimation indicative en FCFA (`js/costEstimate.js`) et lot béton armé / HA. Le panneau **Estimation FCFA** de l'éditeur et l'APS automatique utilisent ce même module.

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
