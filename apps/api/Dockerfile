# Build the API using the full monorepo, then prune to production-only output.
# Run from the repo root: docker build -f apps/api/Dockerfile .

# ---- Build ----
FROM node:22-alpine AS build

RUN corepack enable

WORKDIR /app

# Copy dependency manifests first for layer caching
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json ./apps/api/
COPY libs/api/data-access/package.json ./libs/api/data-access/
COPY libs/shared/domain/package.json ./libs/shared/domain/

RUN pnpm install --frozen-lockfile

# Copy source and build config
COPY nx.json tsconfig.base.json tsconfig.json ./
COPY apps/api/ ./apps/api/
COPY libs/ ./libs/

# Sync TS project references (the Docker context lacks web-only projects, so
# the root tsconfig references are stale until nx sync fixes them).
RUN npx nx sync

# Build + prune: produces apps/api/dist/ with bundled JS, pruned lockfile,
# and compiled workspace modules (no source tree, no dev toolchain).
RUN npx nx run @rv-checklist/api:prune

# ---- Production ----
FROM node:22-alpine

RUN corepack enable && corepack prepare pnpm@11.14.0 --activate

WORKDIR /app

# Copy the pruned build output
COPY --from=build /app/apps/api/dist ./

# Install production dependencies from the pruned lockfile.
# --ignore-scripts: the pruned lockfile carries build-tool transitive deps
# (e.g. @swc/core) whose postinstall scripts aren't needed at runtime.
RUN pnpm install --frozen-lockfile --prod --ignore-scripts

USER node
EXPOSE 3000
CMD ["node", "main.js"]
