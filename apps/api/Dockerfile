# Build the API using the full monorepo, then prune to production-only output.
# Run from the repo root: docker build -f apps/api/Dockerfile .

# ---- Build ----
FROM node:24-alpine AS build

RUN corepack enable

# The Docker build has no TTY. Without CI, pnpm stops and asks before it
# removes a node_modules directory (ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY).
ENV CI=true

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

# Install the production dependencies from the pruned lockfile into the pruned
# output. The runtime stage only copies this tree, so the install must finish
# here.
# --ignore-scripts: the pruned lockfile carries build-tool transitive deps
# (e.g. @swc/core) whose postinstall scripts aren't needed at runtime.
# --ignore-workspace: apps/api/dist holds no pnpm-workspace.yaml, so pnpm walks
# up to /app and installs the whole workspace instead of the pruned lockfile.
RUN cd apps/api/dist && pnpm install --frozen-lockfile --prod --ignore-scripts --ignore-workspace

# ---- Production ----
# Distroless carries only Node and its libraries: no shell, no package manager,
# and no corepack. The image entrypoint is Node, so the command is the server
# file only. The :nonroot tag runs as a non-root user.
FROM gcr.io/distroless/nodejs24-debian13:nonroot

WORKDIR /app

# Copy the pruned build output with its production dependencies.
COPY --from=build /app/apps/api/dist ./

EXPOSE 3000
CMD ["main.js"]
