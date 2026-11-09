# syntax=docker/dockerfile:1

FROM --platform=$BUILDPLATFORM node:24-bookworm-slim AS build

WORKDIR /app
ENV CYPRESS_INSTALL_BINARY=0 \
    NG_CLI_ANALYTICS=false

COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --no-audit --no-fund

COPY . .
RUN npm run test:team && npm run build

FROM node:24-bookworm-slim AS runtime

WORKDIR /app
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000

COPY --from=build --chown=node:node /app/dist/browser ./dist/browser
COPY --chown=node:node scripts/usage-server.mjs scripts/serve.mjs scripts/healthcheck.mjs ./scripts/
COPY --chown=node:node LICENSE ./LICENSE
COPY --chown=node:node LICENSES ./LICENSES

LABEL org.opencontainers.image.title="Pokesmith" \
      org.opencontainers.image.description="Pokemon VGC team analyzer and usage API" \
      org.opencontainers.image.source="https://github.com/kermitine/pokesmith" \
      org.opencontainers.image.licenses="AGPL-3.0-only"

USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
    CMD ["node", "scripts/healthcheck.mjs"]
CMD ["node", "scripts/serve.mjs"]
