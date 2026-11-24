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

Travaillez toujours sur une branche partant de `main` à jour, puis proposez une pull request. Ne poussez jamais avec `--force`. L'ancienne branche `arena/1d9c67e2-plan-to-3d-house` est fusionnée : ne repartez pas d'elle.

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

## Limites connues

- La sublimation IA part des vues enregistrées dans la visite 3D ; l'éditeur ne capture pas de vue 3D lui-même.
- `realtimeCollaboration.js` n'a pas de transport réseau.
- Pas de tests de bout en bout automatisés dans le navigateur.
