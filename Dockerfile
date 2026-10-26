# Tofu (2026-10-25): Tofu's container hosting builds the root Dockerfile. This is upstream's Dockerfile.kaneo with the
# changes marked "Tofu" below; Dockerfile.kaneo itself is unchanged. See TOFU.md.

# Tofu (2026-10-25): the three build stages drop upstream's `--platform=$BUILDPLATFORM`, which only matters when
# cross-building for another architecture; Tofu builds for the platform it runs on.
FROM node:24.22.1-alpine AS api-builder

RUN apk add --no-cache python3 make g++ && \
  corepack enable && \
  corepack prepare pnpm@10.32.1 --activate

WORKDIR /app

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml vite.config.ts ./
COPY patches ./patches
COPY packages/typescript-config/package.json ./packages/typescript-config/
COPY packages/email/package.json ./packages/email/
COPY packages/libs/package.json ./packages/libs/
COPY packages/permissions/package.json ./packages/permissions/
COPY packages/importers/package.json ./packages/importers/
COPY packages/mcp/package.json ./packages/mcp/
COPY apps/api/package.json ./apps/api/

RUN pnpm install --frozen-lockfile

COPY packages/typescript-config ./packages/typescript-config
COPY packages/email ./packages/email
COPY packages/libs ./packages/libs
COPY packages/permissions ./packages/permissions
COPY packages/importers ./packages/importers
COPY packages/mcp ./packages/mcp
COPY i18n ./i18n
COPY apps/api ./apps/api

WORKDIR /app/packages/email
RUN pnpm run build

WORKDIR /app/packages/permissions
RUN pnpm run build

WORKDIR /app/packages/importers
RUN pnpm run build

WORKDIR /app/apps/api
RUN pnpm run build

# Assembles the production node_modules. All API runtime deps are pure JavaScript (bcrypt was replaced with bcryptjs),
# so this node_modules is architecture-independent and is copied into the runtime stage below.
FROM node:24.22.1-alpine AS api-runtime

WORKDIR /app

COPY --from=api-builder /app/package.json /app/pnpm-lock.yaml /app/pnpm-workspace.yaml ./
COPY --from=api-builder /app/patches ./patches
COPY --from=api-builder /app/apps/api/package.json ./apps/api/
COPY --from=api-builder /app/packages/typescript-config/package.json ./packages/typescript-config/
COPY --from=api-builder /app/packages/libs/package.json ./packages/libs/
COPY --from=api-builder /app/packages/email/package.json ./packages/email/
COPY --from=api-builder /app/packages/permissions/package.json ./packages/permissions/
COPY --from=api-builder /app/packages/importers/package.json ./packages/importers/
COPY --from=api-builder /app/packages/mcp/package.json ./packages/mcp/

RUN sed -i 's/"prepare": "husky"/"prepare": ""/g' package.json && \
  corepack enable && \
  corepack prepare pnpm@10.32.1 --activate && \
  HUSKY=0 NODE_ENV=production pnpm install --prod --frozen-lockfile --no-optional

COPY --from=api-builder /app/apps/api/dist ./apps/api/dist
COPY --from=api-builder /app/apps/api/drizzle ./apps/api/drizzle
COPY --from=api-builder /app/packages/email ./packages/email
COPY --from=api-builder /app/packages/permissions ./packages/permissions
COPY --from=api-builder /app/packages/importers/dist ./packages/importers/dist
COPY --from=api-builder /app/packages/mcp/dist ./packages/mcp/dist

FROM node:24.22.1-alpine AS web-builder

RUN apk add --no-cache python3 make g++ && \
  corepack enable && \
  corepack prepare pnpm@10.32.1 --activate

WORKDIR /app

COPY pnpm-workspace.yaml pnpm-lock.yaml package.json vite.config.ts ./
COPY patches ./patches
COPY apps/web/package.json ./apps/web/
COPY packages/typescript-config/package.json ./packages/typescript-config/
COPY packages/libs/package.json ./packages/libs/
COPY packages/typescript-config ./packages/typescript-config
COPY packages/libs ./packages/libs
COPY packages/permissions ./packages/permissions
COPY i18n ./i18n
COPY apps/web ./apps/web

RUN pnpm install --frozen-lockfile

WORKDIR /app/packages/permissions
RUN pnpm run build

# Tofu (2026-10-25): the placeholders upstream's apps/web/.env.production gave the build. env.sh replaces all but
# KANEO_SENTRY_DSN with the copy's own values when the container starts. Without them the build would fall back to
# http://localhost:1337 for the API, which for a visitor is their own computer rather than the copy.
# Tofu (2026-10-26): apps/web/.env.production is now removed (Tofu's folder upload leaves out, and its ZIP upload
# refuses, a private .env file), so these four lines are where the web build gets the placeholders.
ENV VITE_API_URL=KANEO_API_URL \
  VITE_CLIENT_URL=KANEO_CLIENT_URL \
  VITE_TURNSTILE_SITE_KEY=KANEO_TURNSTILE_SITE_KEY \
  VITE_SENTRY_DSN=KANEO_SENTRY_DSN

WORKDIR /app/apps/web
RUN pnpm run build && find dist -type f -name '*.map' -delete

FROM node:24.22.1-alpine AS runtime

# Alpine replaces older package patches, so accept later security fixes too.
RUN apk add --no-cache 'nginx>=1.30.6' && \
  addgroup -g 1001 appuser && \
  adduser -u 1001 -G appuser -D appuser && \
  mkdir -p /app /app/apps/api/data /var/lib/kaneo /docker-entrypoint.d && \
  chown -R appuser:appuser /app && \
  chown appuser:root /var/lib/kaneo && \
  chmod 2775 /var/lib/kaneo

WORKDIR /app

COPY --from=api-runtime --chown=appuser:appuser /app /app

# Fail the build early if the runtime dependency layout is broken on the target architecture
RUN cd /app/apps/api && node -e "const fs=require('fs');for(const m of ['bcryptjs','hono','pg','drizzle-orm','better-auth','ioredis','valibot','octokit','@modelcontextprotocol/sdk']){fs.accessSync('node_modules/'+m+'/package.json')}for(const m of ['email','permissions','importers']){fs.accessSync('node_modules/@kaneo/'+m+'/dist/index.js')}" && \
  node --input-type=module -e "import { registerTools } from '@kaneo/mcp/tools'; if (typeof registerTools !== 'function') process.exit(1)"

COPY --from=web-builder --chown=appuser:appuser /app/apps/web/dist /usr/share/nginx/html
COPY apps/web/nginx.main.conf /etc/nginx/nginx.conf
COPY --chown=appuser:appuser apps/web/nginx.kaneo.conf /etc/nginx/conf.d/default.conf
COPY --chown=appuser:appuser apps/web/runtime-storage.sh /docker-entrypoint.d/05-kaneo-runtime-storage.sh
COPY --chown=appuser:appuser apps/web/env.sh /docker-entrypoint.d/env.sh
COPY --chown=appuser:appuser apps/web/env.awk /docker-entrypoint.d/env.awk
COPY --chown=appuser:appuser deploy/kaneo-entrypoint.sh /usr/local/bin/kaneo-entrypoint.sh
# Tofu (2026-10-25): maps Tofu's PORT onto nginx and derives the secrets a copy needs, then runs kaneo-entrypoint.sh.
COPY tofu-entrypoint.sh /usr/local/bin/tofu-entrypoint.sh

RUN chmod +x /docker-entrypoint.d/05-kaneo-runtime-storage.sh /docker-entrypoint.d/env.sh /usr/local/bin/kaneo-entrypoint.sh

ENV NODE_ENV=production
ENV TMPDIR=/var/lib/kaneo/tmp

# Tofu (2026-10-25): no `USER 1001:0`. Tofu sends visitors to PORT, which is 80 unless the app sets another, and only
# root may listen on a port below 1024; nginx's worker processes still drop to an unprivileged user.
EXPOSE 5173

# Tofu (2026-10-25): checks the port nginx listens on (PORT, else upstream's 5173).
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD wget -Y off --no-verbose --tries=1 --spider "http://127.0.0.1:${PORT:-5173}/api/health" || exit 1

# Tofu (2026-10-25): starts through tofu-entrypoint.sh, run by sh so it needs no executable bit.
CMD ["/bin/sh", "/usr/local/bin/tofu-entrypoint.sh"]
