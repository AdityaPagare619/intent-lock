# alexa-plus-simulator (:3000) — Next.js 15 / React 19.
#
# PRODUCTION build (`next build` + `next start`), NOT `next dev`:
#   * dev mode compiles routes on first hit — a judge's first click would eat
#     a multi-second compile and dev-only overlay/warning noise;
#   * the production build is verified green on the host (see next.config.ts,
#     D-23) and serves the demo deterministically;
#   * runtime wiring (MCP_UPSTREAM / MCP_FALLBACK in app/api/mcp/route.ts) is
#     read from process.env at request time, so compose-supplied env still
#     applies even though the bundle is built ahead of time.
# Multi-stage: deps → build → slim runtime (no devDependencies, no sources
# beyond what `next start` needs: package.json, node_modules, .next, public).

FROM node:20-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

FROM node:20-slim AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:20-slim AS run
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public

EXPOSE 3000

# node:20-slim ships no curl/wget — probe with node itself (same pattern as
# the orchestrator's healthcheck). `/` is the demo page; there is no
# /api/health route in this app.
HEALTHCHECK --interval=10s --timeout=3s --retries=6 --start-period=15s \
  CMD node -e "fetch('http://localhost:3000/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# Bind explicitly: published ports land on the container's eth0, and a
# loopback-only listener would refuse them.
CMD ["npx", "next", "start", "-p", "3000", "-H", "0.0.0.0"]
