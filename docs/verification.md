# Tests et vérification

## Tests unitaires

```powershell
node --test tests/*.test.cjs
```

Framework : le testeur intégré de Node (18 ou plus récent). Environ 15 secondes. Les 4 tests ignorés concernent `requestAnimationFrame`, absent de Node.

Règles :

- Un test vérifie un **résultat réel** (texte écrit dans le PDF, quantités calculées, requêtes envoyées), pas seulement l'existence d'un fichier ou d'une fonction.
- Les tests sur un projet réel (`projects/villa-serena`) dérivent leurs attentes du projet : il évolue dans l'éditeur, les tests ne doivent pas figer ses surfaces.
- Aucun test n'appelle OpenRouter : `tests/aiEnhance.test.cjs` utilise un faux serveur et vérifie qu'un refus de confirmation n'envoie aucun appel facturé.

## Script de vérification

```powershell
node verify_all.js
```

Contrôles, dans l'ordre :

1. **Structure** : fichiers principaux présents (modules, pages, documentation).
2. **Modules** : chaque fonction annoncée existe réellement.
3. **Tests** : la suite complète passe (lue au format TAP, indépendant de la version de Node).
4. **Intégration de l'éditeur** : boutons, scripts et dialogues présents.
5. **Documentation** : les liens du README et de `docs/` pointent vers des fichiers existants.
6. **Styles PDF** : `setStyle()` applique réellement les 3 styles, avec des couleurs distinctes.
7. **Modèle APS** : champs et sections de `aps-template.html`.
8. **Génération réelle** : l'APS et le catalogue (3 styles) de Villa Serena sont produits, sans texte sur le logiciel.

Le rapport est écrit dans `verification_report.json` ; le code de sortie vaut 0 si tout passe.

## Ce que ces contrôles ne couvrent pas

- L'affichage et les clics dans le navigateur : à vérifier dans l'éditeur et la visite 3D (aucun test de bout en bout automatisé pour l'instant).
- Un appel OpenRouter réel (facturé).
