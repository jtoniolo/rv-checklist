# Build the web app as a Next.js standalone server, then ship it on distroless.
# Follows the official Next.js Docker example (output: 'standalone').
# Run from the repo root: docker build -f apps/web/Dockerfile .

# ---- Build ----
FROM node:24-alpine AS build

RUN corepack enable

WORKDIR /app

# The standalone build traces dependencies across the whole workspace and the
# PowerSync `postinstall` copy needs the web package, so copy the monorepo in.
# The root .dockerignore keeps node_modules, .next, and .env out of the context.
COPY . .

# Install with scripts enabled (no --ignore-scripts): the web `postinstall`
# copies the PowerSync SDK worker and wasm into apps/web/public/@powersync
# (ADR-0029), which the build precaches and the browser loads at runtime.
RUN pnpm install --frozen-lockfile

# Build the app and compile the service worker. `build-sw` depends on `build`,
# which sets `output: 'standalone'`, so `.next/standalone` carries the server
# and its traced node_modules, and public/ carries the compiled sw.js.
RUN npx nx run @rv-checklist/web:build-sw

# ---- Production ----
# Distroless carries only Node and its libraries: no shell, no package manager.
# The image entrypoint is Node, so the command is the server file only. The
# :nonroot tag runs as a non-root user, so this stage has no RUN instruction.
FROM gcr.io/distroless/nodejs24-debian13:nonroot

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# The standalone server with its traced node_modules. The trace root is the
# workspace root, so the tree keeps the apps/web prefix.
COPY --from=build /app/apps/web/.next/standalone ./
# Static assets and public/ are not traced into standalone; copy them beside
# the server. public/ carries the compiled sw.js and the PowerSync assets.
COPY --from=build /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=build /app/apps/web/public ./apps/web/public

EXPOSE 3000
CMD ["apps/web/server.js"]
