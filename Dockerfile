# ============================================================
#  Luuma API — image Docker
# ============================================================
# Debian slim plutôt qu'Alpine : les moteurs Prisma attendent OpenSSL et la
# glibc ; sur Alpine (musl) ils échouent au démarrage, sans message clair.

# ── Étape 1 : dépendances + compilation ─────────────────────
FROM node:22-bookworm-slim AS build
RUN apt-get update && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app

# Les dépendances d'abord : tant que package-lock.json ne change pas, Docker
# réutilise cette couche et un rebuild ne retélécharge rien.
COPY package.json package-lock.json .npmrc ./
RUN npm ci

COPY . .
# `prisma generate` directement, et non `npm run db:generate` : son post-script
# écrit des types dans le dossier du frontend, absent de cette image.
RUN npx prisma generate && npx nest build

# ── Étape 2 : exécution ─────────────────────────────────────
FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app

# node_modules garde le CLI Prisma et ts-node : les migrations au démarrage et
# les scripts (seed, promote-admin…) doivent pouvoir tourner dans le conteneur.
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/scripts ./scripts
COPY --from=build /app/package.json /app/tsconfig.json ./

EXPOSE 3001

# Migrations, puis la recherche plein texte (SQL idempotent que Prisma ne sait
# pas modéliser), puis l'API. Une migration en échec empêche le démarrage :
# mieux vaut un conteneur arrêté qu'une API sur un schéma incomplet.
CMD ["sh", "-c", "npx prisma migrate deploy && npx prisma db execute --file prisma/sql/001_search.sql --schema prisma/schema.prisma && node dist/main"]
