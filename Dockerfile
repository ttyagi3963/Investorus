# syntax=docker/dockerfile:1
#
# One Dockerfile, one image per app (T232; T100 extends it). The dependency install and the
# build run once in shared stages, and each app gets a small runtime image built from them. This
# keeps the build inside the assignment's limits: under 20 minutes on a 2 GB x86_64 machine.
#
#   deps        pnpm fetch: download every package in the lockfile into a cache mount
#   build       offline install, prisma generate (once the schema exists), turbo build
#   deploy      one folder per Node service with only its production dependencies
#   api, worker, sandbox, migrate    small Node images, non-root
#   web         the Next.js standalone server, non-root
#
# node:24-bookworm-slim is an official multi-architecture image (linux/amd64 included).

ARG NODE_IMAGE=node:24-bookworm-slim

# ---------------------------------------------------------------------------------------------
FROM ${NODE_IMAGE} AS base
# pnpm starts one worker thread per CPU it can see, and each holds its own memory. On a machine
# with many cores but only 2 GB, that alone can exhaust memory, so cap it.
ENV CI=true \
    PNPM_MAX_WORKERS=2 \
    TURBO_TELEMETRY_DISABLED=1 \
    NEXT_TELEMETRY_DISABLED=1
# OpenSSL lets Prisma detect the right engine build when it installs (openssl-3.0.x on bookworm).
RUN apt-get update && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/* \
    && npm install --global pnpm@10.34.9 && pnpm --version
WORKDIR /app

# ---------------------------------------------------------------------------------------------
FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm fetch --store-dir /pnpm/store

# ---------------------------------------------------------------------------------------------
FROM deps AS build
COPY . .
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --offline --frozen-lockfile --store-dir /pnpm/store
RUN if [ -f packages/core/prisma/schema.prisma ]; then pnpm --filter @clever/core exec prisma generate; fi
# One package at a time with a capped heap, so the build fits in 2 GB of memory.
RUN NODE_OPTIONS=--max-old-space-size=1280 pnpm turbo run build --concurrency=1
# Folders the later COPY steps expect, even before the code that fills them exists.
RUN mkdir -p apps/web/public

# ---------------------------------------------------------------------------------------------
# Each Node service gets its own folder holding only its production dependencies, at the exact
# versions in pnpm-lock.yaml, with the workspace packages it uses copied in (their "files": dist,
# plus prisma and scripts for core). inject-workspace-packages is set for this step only, so
# local development keeps its symlinked workspace packages.
FROM build AS deploy
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    set -e; \
    for app in api worker sandbox; do \
      pnpm --filter "@clever/$app" deploy --prod --offline --store-dir /pnpm/store \
        --config.inject-workspace-packages=true "/out/$app"; \
    done; \
    pnpm --filter @clever/core deploy --prod --offline --store-dir /pnpm/store \
      --config.inject-workspace-packages=true /out/migrate

# ---------------------------------------------------------------------------------------------
FROM ${NODE_IMAGE} AS runtime
ENV NODE_ENV=production
WORKDIR /app

FROM runtime AS api
COPY --from=deploy /out/api ./
USER node
EXPOSE 4000
CMD ["node", "dist/server.js"]

FROM runtime AS worker
COPY --from=deploy /out/worker ./
USER node
CMD ["node", "dist/main.js"]

FROM runtime AS sandbox
COPY --from=deploy /out/sandbox ./
RUN mkdir -p /data/sandbox-objects && chown node:node /data/sandbox-objects
USER node
EXPOSE 4100
CMD ["node", "dist/server.js"]

# One-shot: database migrations, then the seed. Exits when done; the app services wait for it.
FROM runtime AS migrate
# Prisma's schema engine (migrations) needs OpenSSL; the other images don't run an engine.
RUN apt-get update && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*
COPY --from=deploy /out/migrate ./
# The brands the seed loads into the Brand table (T347): data, not code, so they are copied as files.
COPY --from=build /app/seed/brands ./seed/brands
ENV PATH=/app/node_modules/.bin:$PATH SEED_BRANDS_DIR=/app/seed/brands
USER node
CMD ["node", "scripts/migrate-and-seed.mjs"]

# ---------------------------------------------------------------------------------------------
FROM ${NODE_IMAGE} AS web
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000
WORKDIR /app
COPY --from=build --chown=node:node /app/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /app/apps/web/.next/static apps/web/.next/static
COPY --from=build --chown=node:node /app/apps/web/public apps/web/public
USER node
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
