# Portail privé et préproduction

Partager de vrais projets clients en toute confidentialité, préparer un hébergement HTTPS et suivre les décisions des clients.

## Portail privé : partager de vrais projets clients

Le **mode démo ne protège pas les projets**. Pour héberger des maquettes confidentielles, activez le portail Node.js et ne servez **jamais** `projects/`, ni cette racine, via un serveur statique en parallèle.

1. Fournissez `PORTAL_PASSWORD` (mot de passe architecte d’au moins 16 caractères) via les secrets de votre hébergeur ou votre environnement local, jamais dans Git. Définissez `PRIVATE_PORTAL=1` et `PORTAL_ORIGIN` sur l’origine HTTPS exacte du site (par exemple `https://visite.example.com`). Lancez `node serve.js` derrière un proxy TLS qui transmet toutes les routes vers Node sans en mettre les réponses en cache. Utilisez une origine dédiée au portail.
2. Connectez-vous sur `/portal.html`. Choisissez le projet, le rôle **Lecture seule** ou **Lecture et commentaires**, puis la validité (1 à 720 heures). Copiez le lien et envoyez-le au client ; le jeton est affiché une seule fois lors de la création.
3. Le client ouvre le lien et clique sur **Ouvrir la visite invitée**. Pour transmettre une variante ou un dossier de retours, envoyez aussi son lien après activation de l’invitation. La visite et la galerie existante sont consultables ; l’éditeur, les écritures de rendus et les appels IA sont réservés à l’architecte.
    - **Documents partagés** : le client peut composer le cahier de plans, ouvrir le **livret de réunion** et télécharger le **devis estimatif PDF** (`js/devisPdf.js`, autorisé dans `viewerFiles`) depuis la fiche projet ou le cockpit 3D. Ces documents sont produits localement dans le navigateur, avec une fourchette indicative et la mention « non contractuel » ; aucune donnée n’est renvoyée au serveur.
    - **Budget partagé ou non** : le devis n’est proposé à l’invité que si l’architecte a coché **Partager l’enveloppe budgétaire avec le client invité** (`meta.budgetShared`, `false` par défaut). Sans ce partage, le serveur retire `estimate` du `project.json` servi à l’invité et les surfaces de chiffrage (panneau Estimation du cockpit 3D, export de la fiche projet, CTA du livret de réunion) affichent « L’enveloppe budgétaire n’est pas partagée sur ce dossier. » Le réglage reste modifiable à tout moment depuis l’éditeur ou le jalon cartouche du copilote.
4. **Révoquer** invalide le lien et les sessions associées, y compris pour les URL directes des médias. Un onglet ouvert vérifie son accès périodiquement. La révocation ne récupère pas les contenus déjà affichés, enregistrés ou exportés.

Test local : `PRIVATE_PORTAL=1 PORTAL_INSECURE_LOCAL=1 PORTAL_ORIGIN=http://127.0.0.1:8000 node serve.js` (avec `PORTAL_PASSWORD` déjà fourni et le serveur lié à la boucle locale). Ouvrez `http://127.0.0.1:8000/portal.html`, pas `localhost` pour cette configuration. Pour tester un lien sans fermer votre session architecte, ouvrez-le en navigation privée.

Les invitations sont stockées hachées dans `.private-portal/` (ignoré par Git), à conserver sur un volume persistant. Les sessions durent au plus 12 h et sont fermées au redémarrage ; une invitation encore valide peut rouvrir une session. Une installation qui contient ce dossier ne démarre pas sans configuration privée, pour éviter le retour accidentel en mode démo. Hébergement mono-instance ; pas de gestion multi-architectes. Placez les nouveaux plans, médias et modèles privés dans `projects/<slug>/` ; `assets/models/` est réservé à la bibliothèque publique partagée. Ne rendez pas publics les médias protégés pour alimenter un fournisseur IA.

## Préproduction HTTPS, avec deux maquettes fictives

Sur un hôte Docker distinct de la démo, faites pointer un **nom DNS dédié** vers l’hôte et ouvrez les ports 80 et 443. Caddy redirige HTTP vers HTTPS, obtient le certificat et relaie toutes les routes vers Node. Le port Node n’est pas publié. N’ajoutez ni CDN avec mise en cache, ni volume de production, ni clé IA à cette installation.

```bash
export STAGING_HOST=visite-recette.example.com  # Remplacer par le DNS réel
read -rs -p 'Mot de passe de recette (16 caractères minimum) : ' PORTAL_PASSWORD; echo
export PORTAL_PASSWORD
docker compose -f deploy/staging/compose.yaml up -d --build
unset PORTAL_PASSWORD
```

Ouvrez `https://<domaine>/portal.html`. L’image ne copie ni le dossier `projects/` habituel ni les rendus historiques : elle embarque uniquement **Atelier Témoin** et **Atelier Contrôle**, plus le code de visite. Les invitations et les données de recette persistent dans les volumes locaux. Utilisez une seule instance Node. Ne réutilisez pas ces volumes pour la production ; `docker compose … down -v` les efface définitivement.

**Recette avant d’y mettre des maquettes réelles :**

1. Sur le domaine final, vérifier la redirection HTTP, le certificat accepté **sans exception** par un téléphone et le cookie `Secure`, `HttpOnly`, `SameSite=Lax`. `PORTAL_ORIGIN` doit être exactement l’origine publique HTTPS (port compris s’il n’est pas standard). Si un autre proxy est ajouté, il doit conserver l’hôte, l’en-tête `Origin`, les cookies et les requêtes `Range` sans mise en cache ; ne pas exposer l’amont HTTP.
2. Créer deux invitations d’Atelier Témoin : lecture seule et lecture + commentaires. Depuis des sessions séparées sur téléphone, ouvrir les liens reçus, puis le lien du dossier de retours. Vérifier que la lecture seule voit les remarques et propositions sans pouvoir écrire, et que l’autre peut publier une remarque et valider une version. Le rendu d’Atelier Contrôle doit rester inaccessible par URL directe.
3. Dans la session « commentaires », ouvrir `projects/atelier-temoin/generated/renders/facade.jpg`, puis révoquer son invitation côté architecte. Recharger cette même URL et vérifier le refus (`401`), y compris avec `Range`, tandis que l’invitation en lecture seule reste valable. Vérifier `Cache-Control: private, no-store` sur le média et le refus depuis le domaine public, sans réponse de cache. Un fichier déjà téléchargé ne peut pas être repris.

La recette de régression locale (`node --test tests/staging-https.test.cjs`, OpenSSL requis) utilise les mêmes maquettes derrière un reverse proxy TLS Node avec certificat de test. Elle ne remplace pas la vérification de Docker/Caddy, du certificat public, des éventuels proxys intermédiaires ni du parcours sur téléphone réel.

## Suivi des décisions (portail privé)

- **Architecte** : dans **Retours & remarques**, ouvrez ou créez un dossier. Pour une remarque, dépliez **Répondre ou modifier le statut** et choisissez **À traiter**, **Répondu** (réponse requise) ou **Clos**. Les clients voient la réponse et le statut dans ce même dossier.
- Pour soumettre une variante, affichez-la dans la visite après l’élévation, donnez un nom à cette version et choisissez **Proposer la vue actuelle**. Sur la proposition publiée, choisissez **Créer un lien de validation**, réglez son expiration (24 h, 7 ou 30 jours), puis copiez-le. Envoyez vous-même ce lien par e-mail ou WhatsApp. Chaque lien est lié côté serveur au projet, au dossier et à l’identifiant d’une seule proposition. Le portail liste ces liens avec leur expiration et permet de les révoquer, y compris après acceptation lorsque la session est déjà ouverte.
- **Client** : après avoir accepté le lien, la visite ouvre directement l’instantané exact. Sur téléphone, le cartouche affiche le projet, le nom et la référence de version, **Valider cette version** et **Demander une modification**. La validation demande confirmation ; une demande de modification requiert un commentaire. **Revenir à la vue proposée** restaure le cadrage si le client a exploré la maquette. Les deux décisions affichent un accusé de réception.
- **Suivi architecte** : le dossier indique **En attente**, **Validée le…** ou **Modification demandée le…**, avec le commentaire du client. Une décision est datée côté serveur et immuable ; les répétitions de la même action sont idempotentes et une action contradictoire est refusée. Publier V3 crée une décision et un lien propres sans altérer V2. Le dossier n’identifie pas nominativement le client ; il ne s’agit pas d’une signature électronique.
- L’instantané v1 contient la vue, les finitions et le soleil, pas une copie des fichiers 3D ou des rendus. L’empreinte SHA-256 de `project.json` rattache la proposition à la maquette au moment de la publication ; une visite restée ouverte sur une ancienne maquette doit être rechargée. Si ce fichier change, la proposition reste conservée au dossier mais ne peut plus être affichée sur la nouvelle maquette ni recevoir une nouvelle décision. Publiez une nouvelle version pour reprendre le processus. Sauvegardez le répertoire `.client-feedback/` de chaque projet avec les données privées du portail.
