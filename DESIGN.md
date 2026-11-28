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
- **États** : `--success`, `--warning`, `--danger`. Jamais de texte gris sur fond coloré. Chaque état tient **4,5:1 sur le papier clair** (`--warning` a été assombri à `#9c5a15` pour cela) et les trois sont **éclaircis en mode sombre** (`#7fc096`, `#e0a45e`, `#ef9a8e`) : sans cette surcharge, un verdict d'alerte devenait illisible sur le papier sombre.
- **Mode sombre** : les pages publiques (accueil, portail) déclarent `<html data-scheme="auto">` et suivent le système. La visite et l'éditeur restent clairs, la 3D fournissant déjà la profondeur. Corollaire : aucune feuille de l'éditeur (`editor.css`, `editorAdvanced.css`, `editorPremium.css`) ne contient de bloc `prefers-color-scheme: dark` isolé, qui rendrait le texte clair sur le papier clair.

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

## Finitions : [`css/polish.css`](css/polish.css)
Dernière feuille chargée sur **toutes** les vues (accueil, cockpit 3D, atelier, éditeur, portail).
Elle ne touche ni la direction ni la structure : elle règle l'exécution pour que chaque écran se comporte pareil.

- **Aucune couleur en dur** : uniquement `var(--…)` et `color-mix()` depuis `tokens.css`.
- **Focus** : anneau double (filet `--focus` + halo `--ring`), variante `--focus-on-night` sur les fonds sombres.
- **Boutons** : enfoncement de 120 ms, ombre de contact au survol, `:disabled` neutralisé ; variantes `.btn`, `.btn--primary`, `.btn--quiet`, `.btn--danger`, `.btn--sm`, `.btn--block` pour les pages de contenu.
- **Champs** : filet `--rule`, fond `--surface`, survol sable, cases et curseurs à `accent-color: var(--accent)`.
- **Surfaces** : le verre (flou) reste réservé à ce qui flotte au-dessus de la 3D ; les cartes claires prennent `--shadow-1`, le survol `--shadow-lift`.
- **Fiche projet** : dans `.sheet-subnav`, la navigation reste éditoriale (filet sous le libellé) mais les **actions** deviennent des puces à filet, poussées à droite.
- **Cockpit 3D** : les commandes de *Outils* sont groupées en quatre grappes (`.tool-cluster`, `role="group"` nommé) séparées par un filet — état, explorer, produire, présenter/partager — dans un panneau unique (sans carte imbriquée), les quatre onglets (`Finitions`, `Variantes`, `Retours`, `Options`) alignés en dessous derrière un seul filet `--hairline`. Sur écran ≥ 721 px, le volet ouvert s'ancre directement sous les onglets et range ses groupes d'actions en grille régulière à deux colonnes sans retirer aucune commande. Le dock bas s'allège : filet au lieu d'ombre, raccourcis en style discret révélés au survol. Le badge `.mode-badge.is-fps` utilise `--night` sur `--accent` (5,37:1 AA en clair comme en sombre).
- **Densité tablette (601–879 px)** : le dock du cockpit passe sur deux lignes (`'reading reading reading' / 'arrows action keys'`), les `<kbd>` disparaissent au profit du tactile, le radar et la carte de validation sont bornés en hauteur, et le dock libre (`dock-free`) n'est pas écrasé. Le seuil est chiffré, pas esthétique : flèches + « Cinéma » (182 px) + action (150 px) + raccourcis (132 px plain-pied, 274 px R+1 avec sélecteur de niveau) + gouttières (39 px) = 503 px en plain-pied et 645 px en R+1, pour 788 px utiles à 834 px et 814 px à 860 px — en R+1 il ne restait que 143 px à 834 px et 170 px à 861 px (sous le plancher de 180 px).
- **Petits portables (880–1080 px)** : dès 880 px (834 px utiles), la rangée unique revient explicitement (189 px minimum pour la lecture en R+1, 331 px en plain-pied), touches retirées, et le dock s'élargit à 900 px (`calmCockpit.css` bascule également à 879 px pour éviter tout conflit entre 880 et 920 px).
- **Accueil intermédiaire (741–1024 px)** : sur la couverture, `.welcome-stats` (682 px sur 4 colonnes nowrap) passe en grille 2×2 (max 407 px) entre 721 et 1024 px et `--workspace-bar` reste à 68 px entre 601 et 850 px. Sur la fiche, `.welcome-presentation` passe sur une colonne jusqu'à 920 px (au-dessous, les repères ne disposaient que de 270–301 px pour des lignes de 335–345 px), `.sheet-subnav` regroupe ses boutons sous 960 px, `.welcome-gallery-heading` retrouve sa pile et son filet de conduite sous 920 px, et `.sheet-rev-note` reste bornée à `--measure`.
- **Densité ≤ 430 px** : sous 430 px, le sous-menu du dossier défile horizontalement (puces comprises), les repères se resserrent, le livret de réunion réduit ses marges, empile ses actions en pleine largeur et laisse les tableaux défiler. On retire de la marge, jamais du contenu.
- **Portail** : la connexion est une carte dédiée (accès réservé, aide en pied) et les invitations s'affichent en **tableau à quatre colonnes** (invité/dossier, accès, validité, état) au-dessus de 760 px, en cartes empilées en dessous.
- **Composition du dossier** : chaque section de la fiche porte un **indice romain** (I à IV) et un filet de conduite jusqu'au titre ; les repères se lisent en deux familles — *Le dossier* (identité) puis *Les chiffres* (mesures) ; dans le journal des révisions, l'indice (V1, V2…) devient une figure serif et la note passe en serif. Ces règles valent aussi pour la charte, qui en montre les composants.
- **Données** : en-têtes de tableaux en capitales espacées, chiffres tabulaires, survol de ligne tiède.
- **Chargement** : `.skeleton` anime une bande claire (1,4 s) plutôt qu'une case grise figée.
- **États vides** : `.empty-state` / `[data-empty]` disent ce qui manque et proposent l'action suivante.
- **Mouvement réduit** : la couche se coupe entièrement sous `prefers-reduced-motion`.

## Jetons étendus
| Jeton | Usage |
|---|---|
| `--surface-2`, `--surface-3` | papier étagé (champs au repos, cartes secondaires, panneaux) |
| `--glass`, `--overlay`, `--ring` | chrome translucide, fond de boîte de dialogue, halo de focus |
| `--shadow-3` | superposition pleine page (échelle `--shadow-1` → `-3`) |
| `--radius-xs`, `--radius-xl` | puces internes et grands panneaux |
| `--text-3xl`, `--leading-*` | titre d'ouverture et interlignes éditoriaux |
| `--space-7/12/14`, `--header-h`, `--measure` | rythme large, hauteur de barre, longueur de lecture |
| `--border`, `--text-primary`, `--text-secondary`, `--accent-hover`, `--surface-*-dark` | **pont** : noms historiques encore lus par `editorAdvanced.css` et `editorPremium.css`. Ils pointent vers la palette, ce qui supprime les replis gris. |

## Banc d'essai : [`qa.html`](qa.html)
Outil interne (jamais servi à un invité) pour juger une vue à la largeur voulue, faute de captures d'écran :
- la vraie page est chargée dans un **cadre à 375, 430, 768, 834, 1024 ou 1280 px**, hauteur réglable et zoom 100/75/50 % ;
- le réglage vit dans l'URL (`qa.html?view=cockpit&project=villa-serena&w=768&scheme=dark`) : il se partage tel quel ;
- un **audit de contraste** calcule en direct les ratios des couples texte/fond depuis `tokens.css` en **clair et en sombre** (bascule Clair / Sombre et bilan permanent des deux schémas), avec verdict AA/AAA.

Le calcul vit dans [`js/contrast.js`](js/contrast.js) (parse couleur, luminance relative, ratio, verdict, `extractSchemes`), ce qui permet aux tests de vérifier la palette réelle dans les deux schémas :
`ink/paper` 15,87:1 (clair) / 15,36:1 (sombre), `muted/paper` 5,17:1 / 7,60:1, `accent-ink/paper` 5,82:1 / 10,21:1, `warning/paper` 4,96:1 / 8,11:1, `night/accent` 5,37:1, `on-night/night` 15,36:1.
Une couleur de la palette qui passerait sous le seuil fait échouer la suite : la charte ne peut pas dériver en silence.

## Charte vivante
[`design.html`](design.html) affiche le système en une page (couleur, typographie, espace, élévation, composants, états), avec la vraie feuille de styles et le vrai thème système. Son style vit dans [`css/designSystem.css`](css/designSystem.css), lui aussi sans couleur en dur. Elle est accessible depuis l'atelier (*Système visuel*) et volontairement absente du portail client.

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
