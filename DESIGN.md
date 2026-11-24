# Plan / 3D — système de design

Référence pour toute nouvelle page, tout composant et tout document généré (PDF compris).
Les valeurs vivent dans [`css/tokens.css`](css/tokens.css) : on y renvoie, on ne recopie jamais une couleur en dur.

## Direction
**Agence d'architecture contemporaine, tropicale, éditoriale.**
- **Éditorial** : de grands titres en serif, de l'air, des légendes du type « Fig. 01 », comme une revue ou une planche de concours.
- **Matière** : papier chaud, encre verte très sombre, un seul accent sable/or.
- **Retenue** : un seul effet marquant par écran, au service du projet, jamais décoratif.

Réglages, sur l'échelle 1 à 10 du skill Taste :

| Réglage | Accueil | Visite / portail | Éditeur |
|---|---|---|---|
| Variance du design | 6 | 6 | 3 |
| Intensité du mouvement | 5 | 5 | 2 |
| Densité | 4 | 4 | 7 |

## Couleur
- **Neutres** : toujours teintés de vert (`--paper`, `--ink`, `--muted`…). Jamais de noir pur, de gris pur, ni de gris de type Tailwind (`#111827`, `#9ca3af`…).
- **Accent unique** : `--accent` (or `#b78a3c`) pour les filets, les repères et les états actifs.
  - `--accent-soft` (sable) pour un bouton plein sur fond sombre.
  - `--accent-ink` pour un texte d'accent sur fond clair (contraste AA).
- **Fonds sombres** (galerie, visionneuse, couverture) : `--night`, `--night-2`, `--night-3`. Le texte posé dessus utilise `--on-night*`.
- **États** : `--success`, `--warning`, `--danger`. Jamais de texte gris sur fond coloré.
- **Mode sombre** : les pages publiques (accueil, portail) déclarent `<html data-scheme="auto">` et suivent le système. La visite et l'éditeur restent clairs, la 3D fournissant déjà la profondeur.

## Typographie
- **Titres** : `--serif` (Source Serif 4). Texte et interface : `--sans` (Manrope). Les deux sont servis en local (`assets/fonts`), sans Google Fonts : l'app fonctionne hors ligne.
- **Chiffres** : surfaces, prix et cotes en `font-variant-numeric: tabular-nums` (classe `.tabular`). Plus de police à chasse fixe.
- **Étiquettes en capitales espacées** (`--tracking-label`) : une au plus pour trois blocs.

## Espace, formes, profondeur
- **Grille de 4 px** : `--space-1` à `--space-10`.
- **Rayons** : `--radius-sm` pour les commandes, `--radius-md` pour les cartes, `--radius-lg` pour les panneaux.
- **Ombres** : `--shadow-1` au repos, `--shadow-2` pour les fenêtres.
- **Pas de carte dans une carte.** Le flou de fond (verre) seulement au-dessus de la 3D, jamais sur un fond uni.

## Icônes
- Le sprite au trait vit dans [`js/icons.js`](js/icons.js), sur une grille 24 × 24 avec un trait de 1,6 ; l'icône prend la couleur du texte.
- **En HTML** : `<svg class="i" aria-hidden="true"><use href="#i-plan"></use></svg>`.
- **En JavaScript** : `Icons.label(bouton, 'plan', 'Libellé')`.
- **Aucun emoji dans l'interface.** L'icône accompagne un libellé et ne le remplace pas, sauf si le bouton porte un `aria-label`.

## Mouvement
- **Durées** : `--dur-1` (120 ms, survol) à `--dur-4` (560 ms, entrée de page).
- **Courbes** : `--ease-out` (entrée) et `--ease-in-out` (déplacement). **Jamais de rebond ni d'élastique.**
- **On anime** :
  - l'ouverture et la fermeture des fenêtres et des panneaux ;
  - l'apparition des chiffres ;
  - le retour d'une action (succès, erreur) ;
  - le passage de l'accueil à la maquette.
- **On n'anime pas** la lecture : les textes longs et les tableaux restent immobiles.
- **`prefers-reduced-motion`** coupe animations et transitions partout ; c'est géré dans `tokens.css`.

## Accessibilité et interface
- **Focus** visible partout : contour `--focus`, ou `--focus-on-night` sur fond sombre.
- **Cibles** d'au moins 44 px sur écran tactile (`--target`).
- **Messages d'état** dans des zones `role="status"`. Les erreurs de formulaire sont rattachées au champ concerné et la saisie n'est jamais perdue.
- **Mise en page** : aucune page ne défile horizontalement à 375 px. Les vignettes affichent un squelette pendant le chargement, jamais une case grise figée.
- **Performance de l'accueil** : LCP sous 2,5 s, CLS sous 0,1.

## Documents PDF
Les PDF (cahier A3, catalogue, brochure) reprennent cette identité :
- fond papier, encre, sable et or ;
- titres en serif ;
- cartouche sur chaque planche.

Leurs couleurs sont centralisées dans l'objet `C` de [`js/planBook.js`](js/planBook.js).
