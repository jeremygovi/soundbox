# Soundbox

Une soundboard web partagée et auto-hébergée. Chaque profil dispose de son onglet et de ses boutons arcade. Les sons peuvent être envoyés depuis un appareil ou copiés depuis une URL HTTPS directe.

## Démarrage rapide

Prérequis : Docker, Docker Compose et Make.

```bash
cp .env.sample .env
# Modifiez ensuite les deux mots de passe dans .env
make up
```

Ouvrez ensuite <http://localhost:3000>. La base SQLite et les fichiers audio sont conservés dans `./data`, y compris après un remplacement du conteneur.

```bash
make up         # lancer au premier plan et suivre les logs
make down       # arrêter l'application
make prod       # Build de l'application et lancement en mode daemon
```

`make up` reste attaché au terminal pour faciliter le debug ; `Ctrl+C` arrête les conteneurs. `make help` affiche toutes les commandes.

## Développement

Node.js 22 ou plus récent est recommandé.

```bash
make install
make dev
make lint
make test
npm run build
```

Par défaut, le développement utilise aussi `./data`. Pour isoler les données :

```bash
DATA_DIR=/tmp/soundbox-dev npm run dev
```

## Configuration

Soundbox demande un mot de passe dès l’ouverture de l’interface. Deux rôles sont disponibles :

- `ADMIN_PASSWORD` ouvre le mode admin, signalé par une pastille dans l’en-tête. Il permet de créer, renommer et supprimer des profils, ainsi que d’effectuer toutes les actions utilisateur.
- `USER_PASSWORD` permet de consulter les profils, lire, ajouter, modifier et supprimer des sons.

Les deux valeurs sont obligatoires et doivent être différentes. Utilisez idéalement des mots de passe aléatoires d’au moins 16 caractères. Le fichier `.env` est chargé automatiquement en développement et par Docker Compose. Il est ignoré par Git ; seul `.env.sample`, sans secret réel, est versionné. Une session reste valide 7 jours au maximum et est perdue au redémarrage du serveur.

| Variable | Défaut | Description |
|---|---:|---|
| `ADMIN_PASSWORD` | obligatoire | Mot de passe donnant accès au mode administrateur |
| `USER_PASSWORD` | obligatoire | Mot de passe donnant accès au mode utilisateur |
| `PORT` | `3000` | Port HTTP |
| `HOST` | `0.0.0.0` | Adresse d'écoute |
| `DATA_DIR` | `./data` (`/data` dans Docker) | Base SQLite et fichiers audio |
| `MAX_SOUND_SIZE_MB` | `10` | Taille maximale d'un son |
| `IMPORT_TIMEOUT_MS` | `10000` | Timeout d'un téléchargement distant |

Formats pris en charge : MP3, WAV et OGG.

## API

```text
GET    /health
POST   /api/auth/login
GET    /api/auth/session
POST   /api/auth/logout
GET    /api/profiles
POST   /api/profiles
PATCH  /api/profiles/:id
DELETE /api/profiles/:id
GET    /api/profiles/:id/sounds
POST   /api/profiles/:id/sounds/upload
POST   /api/profiles/:id/sounds/import
PATCH  /api/sounds/:id
DELETE /api/sounds/:id
GET    /api/sounds/:id/audio
```

Toutes les routes `/api`, à l’exception de la connexion, nécessitent le cookie de session. Les mutations de profils nécessitent en plus le rôle admin. L’import distant accepte uniquement HTTPS. Chaque destination et chaque redirection sont résolues avant connexion ; les IP privées, locales et réservées sont refusées. La taille, le type MIME déclaré et la signature du fichier sont contrôlés.

## Sauvegarde et restauration

`make backup` utilise l'API de sauvegarde de SQLite, puis archive cette copie cohérente avec le répertoire `sounds/`. Pour restaurer, arrêtez l'application, extrayez l'archive dans un répertoire temporaire, remplacez `data/soundbox.db` par `soundbox.backup.db`, recopiez `sounds/`, puis relancez `make up`.

Pour une exposition Internet, placez toujours Soundbox derrière HTTPS : le cookie de session prend automatiquement l’attribut `Secure` lorsque la requête arrive en HTTPS. Cette authentification volontairement simple ne remplace pas un fournisseur d’identité, un reverse proxy durci ou un tunnel avec contrôle d’accès pour un usage sensible.
