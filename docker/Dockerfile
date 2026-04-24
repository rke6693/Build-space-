# syntax=docker/dockerfile:1.7

# ---- deps ----
FROM node:20.18-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci --include=dev

# ---- build ----
FROM node:20.18-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json tsconfig.json tsconfig.build.json ./
COPY src ./src
COPY web ./web
COPY brand ./brand
RUN npm run build && npm prune --omit=dev

# ---- runtime ----
FROM node:20.18-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup -g 10001 -S keel && adduser -u 10001 -S keel -G keel
COPY --from=build --chown=keel:keel /app/node_modules ./node_modules
COPY --from=build --chown=keel:keel /app/dist ./dist
COPY --from=build --chown=keel:keel /app/web ./web
COPY --from=build --chown=keel:keel /app/brand ./brand
COPY --from=build --chown=keel:keel /app/package.json ./package.json
USER keel
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8787/health || exit 1
CMD ["node", "dist/server/index.js"]
