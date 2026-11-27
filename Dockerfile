# One image, three commands (ADR 0005): the app (default CMD), the migration
# (`node scripts/migrate.mjs`) and the scraper (`node node_modules/tsx/dist/cli.mjs
# scrapers/cli.ts`). The runtime is the production dependencies plus the built
# `.next` and the sources the scripts read; not Next's standalone output, which
# would leave out the migrator and the scraper.
#
# WORKDIR /app is load-bearing: lib/curated-load.ts reads data/curated from the
# working directory and scripts/migrate.mjs finds ../drizzle beside itself.
#
# The base is pinned by digest (multi-arch index); Dependabot's docker
# ecosystem bumps it. Build with --build-arg REVISION=<git sha>.
FROM node:24-bookworm-slim@sha256:873f586f3794f52281bd039bf02c048a0be08fde619338f9941bad1eb6b34530 AS base
ENV CI=true
RUN corepack enable
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile

FROM deps AS build
ENV NEXT_TELEMETRY_DISABLED=1
COPY . .
RUN mkdir -p public && pnpm build && rm -rf .next/cache

FROM base AS prod-deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm install --prod --frozen-lockfile

FROM base AS runtime
ARG REVISION=unknown
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    APP_REVISION=$REVISION
LABEL org.opencontainers.image.source="https://github.com/dividedby/leonida-log" \
      org.opencontainers.image.revision=$REVISION

COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public
COPY package.json next.config.ts tsconfig.json ./
COPY lib ./lib
COPY scrapers ./scrapers
COPY scripts/migrate.mjs ./scripts/migrate.mjs
COPY drizzle ./drizzle
COPY data/curated ./data/curated
# Compose mounts a tmpfs here (the root filesystem is read-only at runtime).
RUN mkdir -p .next/cache && chown node:node .next/cache

USER node
EXPOSE 3000
CMD ["node", "node_modules/next/dist/bin/next", "start"]
