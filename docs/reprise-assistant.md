# Reprise du projet par un assistant IA

À lire avant toute modification. Ce fichier remplace les anciens `PROMPT_*.md` (archivés dans `docs/archive/`).

## Démarrer

```powershell
git checkout main
```

```powershell
git pull
```

```powershell
git switch -c <nom-de-la-tâche>
```

Travaillez toujours sur une branche partant de `main` à jour, puis proposez une pull request. Ne poussez jamais avec `--force`. Les anciennes branches `arena/1d9c67e2-plan-to-3d-house` et `arena/fcf9af25-plan-to-3d-house` sont fusionnées dans `main` : ne repartez pas d'elles.

Vérifiez l'état avant de commencer :

```powershell
node --test tests/*.test.cjs
```

```powershell
node verify_all.js
```

Notez les nombres exacts obtenus ; tout écart après vos changements doit être expliqué.

## Comprendre le projet

1. [README](../README.md) : présentation et lancement.
2. [architecture.md](architecture.md) : pages, données, modules, serveur.
3. Le guide du domaine concerné : [visite-3d.md](visite-3d.md), [editeur.md](editeur.md), [estimation.md](estimation.md), [portail-prive.md](portail-prive.md).

## Règles

1. **Vérifiez dans le navigateur** tout changement d'interface : lancez `node serve.js`, ouvrez l'éditeur ou la visite, cliquez. Des modules testés isolément ont déjà laissé des boutons cassés à chaque clic.
2. **Documents client** (APS, catalogue, cahier) : ils parlent du projet de maison, jamais du logiciel. Montants en FCFA via `CostEstimate`. Texte des PDF passé par `pdfSafe()` (les polices jsPDF ne gèrent ni emojis, ni `≈`, ni espaces fines).
3. **IA** : tout appel OpenRouter passe par `serve.js` et coûte de l'argent. Confirmation avec le coût estimé avant l'appel ; aucune simulation présentée comme un vrai résultat ; dans les tests, un faux `fetch`.
4. **Projet ouvert dans l'éditeur** : utilisez `EditorAPI.toProjectJson()` et `meta.slug`. `window.ACTIVE_PROJECT_SLUG` y vaut le projet par défaut chargé avec la page, pas le projet ouvert.
5. **Tests** : vérifiez des résultats réels ; ne figez pas les données de `projects/` qui évoluent.
6. **Documentation** : mettez à jour le guide concerné dans `docs/`, sans créer de nouveau fichier récapitulatif. N'écrivez pas de nombre de tests dans la documentation.
7. N'annoncez pas « 100 % » ou « prêt pour la production » sans avoir lancé les deux commandes ci-dessus et vérifié dans le navigateur.

## Reprise dans Google AI Studio

Le bloc ci-dessous est le prompt à coller dans Google AI Studio pour y poursuivre le travail. Il ne remplace pas les deux commandes de vérification : il dit seulement à l'assistant où il met les pieds. Joignez ensuite les fichiers demandés, dans l'ordre indiqué.

~~~text
Tu reprends le développement d'ArchiCam Studio, une application web d'architecture (plans cotés, maquette 3D, visite guidée, livrables d'agence) destinée à une agence camerounaise et à ses clients invités. Je te fournis le dépôt Git au fur et à mesure : demande-moi les fichiers dont tu as besoin et travaille uniquement sur ce que tu as réellement sous les yeux. Réponds toujours en français.

## Ce que fait le produit
- Pages : accueil du dossier (accueil.html), cockpit 3D (index.html), atelier (studio.html), éditeur de plan 2D (editor.html), portail privé client (portal.html), charte vivante (design.html), banc d'essai interne (qa.html).
- Deux publics : l'architecte (tout) et le client invité (lecture, décisions, retours — jamais la production de livrables).
- Livrables : APS automatique (PDF), Devis & Métré en FCFA (PDF cartouché + .xlsx), Cahier de plans A3 (PDF), Catalogue Premium (PDF), Dossier APD/Permis en option.

## Pile technique
- Aucun framework front : HTML, CSS et JavaScript natifs. `js/` contient un module par fichier, exposé en global. Pas de bundler, pas de build.
- Serveur : `serve.js` (Node, sans Express) sur le port 3000 ; il sert les pages statiques, les routes `api/*` et les appels IA.
- IA : `@google/genai` et OpenRouter, toujours appelés depuis le serveur, jamais depuis le navigateur. Un appel coûte de l'argent : confirmation et estimation du coût avant envoi, aucune simulation présentée comme un vrai résultat.
- Données : un dossier par projet dans `projects/<slug>/` (plan, meta, révisions, variantes). `meta.budgetShared` est un booléen strict, `false` par défaut, jamais déduit, que l'architecte active ou désactive.
- Tests : `node --test tests/*.test.cjs` (Node 22) et un script d'intégration `node verify_all.js` qui doit afficher « PROJET VALIDÉ ». Ne recopie pas de nombre de tests dans la documentation : les chiffres mentent vite.

## Design system (non négociable)
- Toutes les couleurs, tailles, rayons et ombres viennent de `css/tokens.css`. Aucune couleur en dur ailleurs, aucun gris pur, aucune palette Tailwind.
- Un seul accent : l'or (`--accent`, `--accent-ink`, `--accent-wash`). Titres en serif, texte en sans. Aucun emoji dans l'interface.
- Grille de 4 px, cibles tactiles de 44 px minimum, anneau de focus visible, contrastes vérifiés (AA : 4,5:1 pour le texte courant, 3:1 pour le grand texte), y compris en mode sombre (`data-scheme="auto"`).
- Aucune page ne défile horizontalement à 375 px. `prefers-reduced-motion` est respecté partout.
- `css/polish.css` porte les passes de finition : sections numérotées, ne jamais réutiliser un numéro de section.
- Outil de contrôle : `qa.html` charge une vraie page dans un cadre à 375, 430, 768, 834, 1024 ou 1280 px (`qa.html?view=cockpit&w=768`) et calcule les contrastes des jetons avec `js/contrast.js`. Il n'y a pas de navigateur automatique dans cet environnement : la mesure remplace la capture d'écran.

## Règles métier non négociables
- Portail client : toute action du pipeline renvoie 403 et ne s'exécute pas quand on est en mode client (`isClientPortalMode()`).
- Ne jamais inventer de mentions légales ni contourner la « Porte E » : si le cartouche est incomplet, un mini-formulaire est posé dans le chat.
- Aucun montant présenté comme contractuel : un devis estimatif est un ordre de grandeur en FCFA, jamais un engagement de prix.
- Aucun faux asset, aucune donnée figée pour faire passer un test. Les tests vérifient des calculs réels ; ne fige pas le contenu de `projects/`, il évolue.
- Le texte des PDF passe par `pdfSafe()` : les polices jsPDF ne gèrent ni emojis, ni « ≈ », ni espaces fines.
- Ne pas annoncer « 100 % » ou « prêt pour la production » sans avoir lancé les deux commandes de vérification.

## Où en est le projet
- Livré : chaîne complète brief → plan → livrables (APS, devis PDF + xlsx, cahier A3, catalogue, APD), devis estimatif dans le cockpit et dans le portail, partage explicite de l'enveloppe budgétaire.
- Livré côté design : barre d'outils groupée par tâches (quatre grappes `role="group"` nommées), HUD apaisé, densité mobile ≤ 430 px, portail en tableau, dock du cockpit sur deux lignes de 601 à 860 px, rangée unique élargie de 861 à 1080 px, banc d'essai et audit de contraste.
- Points ouverts, dans l'ordre où je veux les traiter :
  1. Le dock à 834 px est la seule largeur limite : la rangée unique y tient à une vingtaine de pixels près. Décider s'il faut remonter le seuil de 861 à 880 px, mesure à l'appui.
  2. Poursuivre l'audit de contraste : `qa.html` n'audite aujourd'hui que le schéma affiché, pas le mode sombre.
  3. Vérifier l'accueil du dossier (composition, indices romains, journal) aux largeurs intermédiaires 768 à 1024 px.
  4. Réduire les zones encore denses du cockpit sans rien retirer des fonctions.

## Comment je veux que tu travailles
- Commence par un diagnostic court : ce que tu as compris, ce que tu vas toucher, ce que tu refuses de toucher.
- Pour chaque changement, donne le fichier entier ou un patch exactement localisé, jamais un extrait « à placer vers la ligne 120 ».
- Justifie les décisions de mise en page par une mesure (largeur des blocs, métriques de texte), pas par une impression : on n'a pas d'œil sur le rendu.
- Après un changement : dis quelle vérification s'applique (`node --check`, `node --test`, `verify_all.js`, `curl`) et ce qu'elle doit afficher.
- Mets à jour le guide concerné dans `docs/` et `DESIGN.md` quand le comportement change ; n'invente pas de nouveau fichier récapitulatif.
- Si une information te manque, demande le fichier au lieu de deviner. Si tu estimes qu'une demande casserait une règle ci-dessus, dis-le au lieu de l'exécuter.
~~~

Fichiers à joindre d'abord, dans cet ordre : `docs/architecture.md`, `DESIGN.md`, `css/tokens.css`, puis le fichier concerné par la tâche (`css/polish.css` pour une question de mise en page, `js/app.js` pour le cockpit, `privatePortal.js` pour le portail). Pour une question de rendu, ajoutez une capture de `qa.html?view=<vue>&w=<largeur>`.

## Limites connues

- La sublimation IA part des vues enregistrées dans la visite 3D ; l'éditeur ne capture pas de vue 3D lui-même.
- `realtimeCollaboration.js` n'a pas de transport réseau.
- Pas de tests de bout en bout automatisés dans le navigateur.
