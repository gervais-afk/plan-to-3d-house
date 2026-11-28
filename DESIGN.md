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
- **Cockpit 3D** : les commandes de *Outils* sont groupées en quatre grappes (`.tool-cluster`, `role="group"` nommé) séparées par un filet — état, explorer, produire, présenter/partager. Le dock bas s'allège : filet au lieu d'ombre, raccourcis en style discret révélés au survol.
- **Densité tablette (601–860 px)** : le dock du cockpit passe sur deux lignes (`'reading reading reading' / 'arrows action keys'`), les `<kbd>` disparaissent au profit du tactile, le radar et la carte de validation sont bornés en hauteur, et le dock libre (`dock-free`) n'est pas écrasé. Le choix est chiffré, pas esthétique : transport ≈ 490 px + raccourcis ≈ 185 px + lecture ≈ 215 px ≈ 795 px de dock, pour ≈ 724 px utiles dans un cadre de 768 px — une seule rangée couperait le nom de la pièce.
- **Petits portables (861–1080 px)** : la rangée unique revient, touches retirées (≈ 755 px), et le dock s'élargit à 900 px. L'ancien plafond de 720 px était plus étroit que le dock de bureau (770 px) et rognait le nom de la pièce à 1024 px.
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
- le réglage vit dans l'URL (`qa.html?view=cockpit&project=villa-serena&w=768`) : il se partage tel quel ;
- un **audit de contraste** calcule en direct les ratios des couples texte/fond depuis `tokens.css`, avec verdict AA/AAA.

Le calcul vit dans [`js/contrast.js`](js/contrast.js) (parse couleur, luminance relative, ratio, verdict), ce qui permet aux tests de vérifier la palette réelle :
`ink/paper` 15,87:1, `muted/paper` 5,17:1, `accent-ink/paper` 5,82:1, `warning/paper` 4,96:1, `on-night/night` 15,36:1.
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
