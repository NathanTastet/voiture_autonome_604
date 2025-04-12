# Plateforme robot – IUT Lyon 1

> 🇬🇧 *This README is also available in English [here](README.md).*

Ce projet propose une **interface web de supervision et de contrôle** pour un robot autonome, développée dans le cadre du **Concours National de Robotique inter-IUT de Cachan**.

Il offre les fonctionnalités suivantes :

- **Flux vidéo en temps réel** depuis une caméra embarquée  
- **Pilotage manuel à distance** pour les phases de test et d’ajustement  
- **Analyse historique** des courses (chronos, trajectoires, statistiques)  
- **Gestion des utilisateurs et des permissions** via une console d’administration

Le projet repose sur une stack **Flask + Webpack + Bootstrap** et prend en charge les configurations **développement et production** via **Docker**.

## Lancement rapide avec Docker

Cette application peut être exécutée entièrement avec `Docker` et `docker compose`. **L'utilisation de Docker est recommandée, car elle garantit que l’application s’exécute avec des versions compatibles de Python et Node.**

Trois services principaux sont disponibles :

Pour lancer la version de développement :

```bash
docker compose up flask-dev
```

Pour lancer la version de production :

```bash
docker compose up flask-prod
```

Les variables définies dans `environment:` du fichier `docker compose.yml` prennent le pas sur celles spécifiées dans `.env`.

Pour exécuter une commande via le `Flask CLI` :

```bash
docker compose run --rm manage <<COMMANDE>>
```

Par exemple, pour initialiser la base de données :

```bash
docker compose run --rm manage db init
docker compose run --rm manage db migrate
docker compose run --rm manage db upgrade
```

Un volume Docker `node-modules` est utilisé pour stocker les packages NPM. Pour les tests en local avec `sqlite`, le fichier `dev.db` est monté dans tous les conteneurs. Ce montage peut être retiré du `docker compose.yml` si vous utilisez une base de données en production.

Accédez ensuite à `http://localhost:8080` pour voir l'écran d'accueil.

### Lancement en local (hors Docker)

Si vous ne pouvez pas utiliser Docker, vous pouvez démarrer l'application comme suit :

```bash
cd app
pip install -r requirements/dev.txt
npm install
npm run-script build
npm start  # lance le serveur webpack + serveur flask
```

Accédez à `http://localhost:5000` pour afficher l'interface.

#### Initialisation de la base de données

Une fois votre système de base de données installé, exécutez :

```bash
flask db init
flask db migrate
flask db upgrade
```

## Déploiement

Des paramètres raisonnables pour la production sont définis dans `docker compose.yml` :

```text
FLASK_ENV=production
FLASK_DEBUG=0
```

Ainsi, lancer l’application en mode production revient à exécuter :

```bash
docker compose up flask-prod
```

Sans Docker :

```bash
export FLASK_ENV=production
export FLASK_DEBUG=0
export DATABASE_URL="<VOTRE URL DE BASE DE DONNÉES>"
npm run build   # compilation des assets avec webpack
flask run       # lancement du serveur flask
```

## Shell

Pour ouvrir le shell interactif :

```bash
docker compose run --rm manage shell
flask shell # si utilisé sans Docker
```

Par défaut, l’objet `app` de flask sera disponible.

## Tests et Linter

Pour lancer tous les tests :

```bash
docker compose run --rm manage test
flask test # si utilisé sans Docker
```

Pour exécuter le linter :

```bash
docker compose run --rm manage lint
flask lint # si utilisé sans Docker
```

Le linter tente de corriger automatiquement les erreurs de style. Pour vérifier uniquement sans modifier le code, ajoutez l’argument `--check`.

## Migrations

Quand une migration de la base est nécessaire :

```bash
docker compose run --rm manage db migrate
flask db migrate # si utilisé sans Docker
```

Puis appliquez-la :

```bash
docker compose run --rm manage db upgrade
flask db upgrade # si utilisé sans Docker
```

Pour consulter toutes les options disponibles :

```bash
docker compose run --rm manage db --help
```

Si vous déployez votre application à distance (ex. Heroku), pensez à versionner le dossier `migrations` :

```bash
git add migrations/*
git commit -m "Ajout des migrations"
```

Vérifiez que le dossier `migrations/versions` contient bien des fichiers.

## Gestion des assets

Les fichiers placés dans le dossier `assets` (sauf `js` et `css`) seront copiés dans `static/build` via `file-loader` de Webpack. En production, le plugin `Flask-Static-Digest` compresse ces fichiers et y ajoute un hash MD5.

Il faut donc utiliser `static_url_for` pour les inclure, par exemple :

```html
<link rel="shortcut icon" href="{{static_url_for('static', filename='build/favicon.ico') }}">
```

Les fichiers ainsi nommés changent à chaque mise à jour, ce qui permet une mise en cache longue durée. Pour cela, ajoutez dans `.env` :

```text
SEND_FILE_MAX_AGE_DEFAULT=31556926  # un an
```

## Licence

Ce projet est sous licence [MIT License](LICENSE).

Des portions de ce code sont dérivées du projet [cookiecutter-flask](https://github.com/cookiecutter-flask/cookiecutter-flask) de **Steven Loria et contributeurs**, également sous licence MIT.

© 2025 Nathan Tastet & Anis Zouiter
