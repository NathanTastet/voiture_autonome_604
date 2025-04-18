# ================================== BUILDER ===================================
ARG INSTALL_PYTHON_VERSION=${INSTALL_PYTHON_VERSION:-PYTHON_VERSION_NOT_SET}
ARG INSTALL_NODE_VERSION=${INSTALL_NODE_VERSION:-NODE_VERSION_NOT_SET}

FROM node:${INSTALL_NODE_VERSION}-bullseye-slim AS node
FROM python:${INSTALL_PYTHON_VERSION}-slim-bullseye AS builder

WORKDIR /app

# Copier les outils Node dans l'image Python
COPY --from=node /usr/local/bin/ /usr/local/bin/
COPY --from=node /usr/lib/ /usr/lib/
# Voir https://github.com/moby/moby/issues/37965
RUN true
COPY --from=node /usr/local/lib/node_modules /usr/local/lib/node_modules

# Installer les dépendances Python
COPY requirements requirements
RUN pip install --no-cache -r requirements/prod.txt

# Copier package.json + lockfile (lockfile restera à jour après un npm install local)
COPY package.json package-lock.json ./

# Installer TOUTES les dépendances JS
RUN npm ci

# Copier le reste et builder les assets
COPY webpack.config.js autoapp.py ./
COPY app app
COPY assets assets

# Debug rapide : vérifier que les .woff2 sont bien présents
RUN echo "=== assets/fonts ===" && find assets/fonts -type f

COPY .env.example .env
ENV FLASK_SKIP_SEED=1

# Compiler les bundles Webpack
RUN npm run-script build


# ================================= PRODUCTION =================================
FROM python:${INSTALL_PYTHON_VERSION}-slim-bullseye AS production

WORKDIR /app

RUN useradd -m sid
RUN chown -R sid:sid /app
USER sid
ENV PATH="/home/sid/.local/bin:${PATH}"

# Copier uniquement les assets statiques buildés
COPY --from=builder --chown=sid:sid /app/app/static /app/app/static

# Installer les dépendances Python en production
COPY requirements requirements
RUN pip install --no-cache --user -r requirements/prod.txt

COPY supervisord.conf /etc/supervisor/supervisord.conf
COPY supervisord_programs /etc/supervisor/conf.d

COPY . .
ENV FLASK_SKIP_SEED=""

EXPOSE 5000
ENTRYPOINT ["/bin/bash", "shell_scripts/supervisord_entrypoint.sh"]
CMD ["-c", "/etc/supervisor/supervisord.conf"]


# ================================= DEVELOPMENT ================================
FROM builder AS development
ENV FLASK_SKIP_SEED=""

# Installer les dépendances dev Python
RUN pip install --no-cache -r requirements/dev.txt

EXPOSE 2992
EXPOSE 5000
CMD [ "npm", "start" ]
