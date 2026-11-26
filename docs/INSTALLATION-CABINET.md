# Guide d'installation et d'exploitation — ArchiCam Studio (mono-cabinet)

Ce guide décrit l'installation d'ArchiCam Studio pour **un seul cabinet d'architecture**, en fonctionnement autonome hors ligne (aucune dépendance CDN externe : Three.js, PDF.js et jsPDF sont fournis localement dans `assets/vendor/`).

---

## 1. Prérequis et installation de Node.js

- **Node.js 20 LTS ou supérieur** (aucun paquet `npm` externe à installer : le serveur `serve.js` utilise uniquement les modules natifs de Node.js).
- Vérifier l'installation :

```bash
node -v
```

- Installer l'application en copiant ou clonant le dossier du projet sur le poste de l'atelier ou sur un petit serveur dédié (Linux, macOS ou Windows).

---

## 2. Démarrage en local

Depuis le dossier d'installation :

```bash
node serve.js
```

Par défaut, le serveur écoute sur `http://127.0.0.1:8000` (ou le port défini par `PORT` et l'interface par `HOST`).

- `HOST=127.0.0.1 PORT=8000 node serve.js` : usage poste unique (recommandé par défaut).
- Pages principales :
  - **Atelier / Accueil** : `http://127.0.0.1:8000/` (`studio.html` / `accueil.html`)
  - **Éditeur 2D & import PDF** : `http://127.0.0.1:8000/editor.html`
  - **Visite 3D & exports PDF** : `http://127.0.0.1:8000/index.html?project=<slug>`
- **Profil Cabinet** : depuis l'éditeur (« Profil Cabinet »), renseignez le nom du cabinet, l'architecte par défaut et un logo PNG transparent. Le profil et le logo sont stockés localement dans `.cabinet/profile.json` et `.cabinet/logo.png` (jamais exposés en accès direct, servis via `/api/cabinet/profile` et `/api/cabinet/logo`).

---

## 3. Clé API OpenRouter (facultative)

Sans clé OpenRouter, toute l'application (éditeur, import PDF vectoriel/multi-pages, visite 3D, métré FCFA, exports PDF) fonctionne entièrement hors ligne.

Pour activer la lecture IA de plans et les rendus d'ambiance (toujours soumis à confirmation du coût et à la Porte E) :

- **Option 1 — Fichier local `openrouter.key`** (recommandé sur poste fixe) : placez la clé brute dans `openrouter.key` à la racine de l'installation et restreignez les droits :

```bash
chmod 600 openrouter.key
```

- **Option 2 — Variable d'environnement** : définissez `OPENROUTER_API_KEY` dans le service système (ne jamais commiter de clé dans Git).

---

## 4. Mise en ligne avec le Portail privé (HTTPS obligatoire)

Lorsque le serveur est exposé sur le réseau ou sur Internet pour partager des projets avec vos clients, activez impérativement le **Portail privé** derrière un reverse proxy HTTPS (Caddy ou Nginx).

Variables d'environnement requises :

| Variable | Rôle | Exigence |
| --- | --- | --- |
| `PRIVATE_PORTAL` | Active l'authentification mono-cabinet | `1` |
| `PORTAL_PASSWORD` | Mot de passe de l'architecte | **16 à 1024 caractères** |
| `PORTAL_ORIGIN` | Origine publique exacte | **HTTPS obligatoire** (ex. `https://studio.moncabinet.com`) |
| `HOST` | Interface d'écoute interne | `127.0.0.1` (derrière le reverse proxy) |
| `PORT` | Port interne | ex. `8000` |
| `PORTAL_DEFAULT_PROJECT` | Projet ouvert par défaut pour l'architecte (facultatif) | slug existant |

> Pour des tests locaux uniquement sur boucle locale (`127.0.0.1` / `localhost`), ajoutez `PORTAL_INSECURE_LOCAL=1` avec `PORTAL_ORIGIN=http://127.0.0.1:8000`.

### Exemple de reverse proxy (Caddy)

```caddyfile
studio.moncabinet.com {
    reverse_proxy 127.0.0.1:8000
}
```

### Exemple de reverse proxy (Nginx)

```nginx
server {
    listen 443 ssl http2;
    server_name studio.moncabinet.com;
    client_max_body_size 50m;

    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto https;
    }
}
```

---

## 5. Invitations clients et validations ciblées

Une fois connecté comme architecte sur `/portal.html` :

1. **Créer une invitation** : choisissez le projet, le rôle (`read` pour lecture seule ou `comment` pour annoter/décider) et une durée de validité.
2. **Partager le lien unique** : le secret n'est affiché qu'à la création (seul son hachage SHA-256 est enregistré dans `.private-portal/invitations.json`). Le client n'accède qu'à son projet, aux médias publiés et au logo du cabinet via `/api/cabinet/logo`.
3. **Validation ciblée** : vous pouvez créer un lien pointant directement vers une variante ou proposition précise afin de recueillir l'accord ou une demande de modification horodatée.
4. **Révocation** : une invitation peut être révoquée à tout moment depuis `/portal.html` ; les sessions associées expirent immédiatement.

---

## 6. Sauvegarde et restauration

### Dossiers critiques à sauvegarder régulièrement

| Chemin | Contenu |
| --- | --- |
| `projects/` | Projets du cabinet (`project.json`, plans sources, `planches/` PDF d'architecte, rendus et vidéos générés) |
| `.cabinet/` | Profil éditorial (`profile.json`) et logo transparent du cabinet (`logo.png`) |
| `.private-portal/` | Invitations clients actives et révoquées (`invitations.json`) |
| `.client-feedback/` | Remarques clients et décisions de validation enregistrées |

> Ne sauvegardez `openrouter.key` que dans un coffre sécurisé distinct.

### Procédure de sauvegarde (copie à froid recommandée)

```bash
# 1. Arrêter le service ArchiCam Studio pour garantir la cohérence des fichiers
# 2. Créer une archive horodatée des données du cabinet
tar -czf backup-archicam-$(date +%Y%m%d).tar.gz \
  projects/ .cabinet/ .private-portal/ .client-feedback/
# 3. Redémarrer le service
```

### Procédure de restauration

```bash
# 1. Installer le code d'ArchiCam Studio et vérifier `node -v`
# 2. Arrêter le serveur puis extraire l'archive à la racine du dossier
tar -xzf backup-archicam-AAAAMMJJ.tar.gz
# 3. Vérifier les permissions restrictives des dossiers privés
chmod 700 .cabinet .private-portal .client-feedback
# 4. Relancer le serveur avec les mêmes variables PRIVATE_PORTAL / PORTAL_PASSWORD / PORTAL_ORIGIN
# 5. Vérifier l'ouverture d'un projet, le logo cabinet (/api/cabinet/logo) et la liste des invitations
```
