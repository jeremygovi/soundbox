# Soundbox

Une soundboard web partagée, auto-hébergée et sans compte utilisateur. Chaque profil dispose de son onglet et de ses boutons arcade. Les sons peuvent être envoyés depuis un appareil ou copiés depuis une URL HTTPS directe.

## Démarrage rapide

Prérequis : Docker, Docker Compose et Make.

```bash
make up
```

Ouvrez ensuite <http://localhost:3000>. La base SQLite et les fichiers audio sont conservés dans `./data`, y compris après un remplacement du conteneur.

```bash
make up         # lancer au premier plan et suivre les logs
make down       # arrêter l'application
make deploy     # reconstruire puis relancer
make backup     # créer backups/soundbox-<date>.tar.gz
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

| Variable | Défaut | Description |
|---|---:|---|
| `PORT` | `3000` | Port HTTP |
| `HOST` | `0.0.0.0` | Adresse d'écoute |
| `DATA_DIR` | `./data` (`/data` dans Docker) | Base SQLite et fichiers audio |
| `MAX_SOUND_SIZE_MB` | `10` | Taille maximale d'un son |
| `IMPORT_TIMEOUT_MS` | `10000` | Timeout d'un téléchargement distant |

Formats pris en charge : MP3, WAV et OGG.

## API

```text
GET    /health
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

L'import distant accepte uniquement HTTPS. Chaque destination et chaque redirection sont résolues avant connexion ; les IP privées, locales et réservées sont refusées. La taille, le type MIME déclaré et la signature du fichier sont contrôlés.

## Sauvegarde et restauration

`make backup` utilise l'API de sauvegarde de SQLite, puis archive cette copie cohérente avec le répertoire `sounds/`. Pour restaurer, arrêtez l'application, extrayez l'archive dans un répertoire temporaire, remplacez `data/soundbox.db` par `soundbox.backup.db`, recopiez `sounds/`, puis relancez `make up`.

Le MVP n'intègre aucune authentification. Il est adapté à un LAN privé. Avant une exposition Internet, placez-le derrière HTTPS et un contrôle d'accès (reverse proxy ou tunnel).
