# Intent Lock MCP server (:8080) — THE deliverable. MCP 2025-11-25 wire.
#
# BUILD CONTEXT IS THE REPO ROOT (see docker-compose.yml): this image needs
# more than the Python service. E1 (src/engines/phonetic_judo.py, D-07) spawns
# a long-lived Node sidecar — packages/polyglot-phonetic-judo/sidecar.js —
# resolved relative to the source file:
#     SERVICE_ROOT.parent.parent / "packages" / "polyglot-phonetic-judo"
# The previous Dockerfile copied only src/ from a service-local context and
# installed no Node at all, so in the container E1 degraded to its embedded
# stub scorer — loudly logged and labeled ("degraded": true), but the
# container demo still lost the real TS phonetic pipeline, the
# 25-unit-test contract, entirely. Verified by layout simulation (J-04):
# old layout → "E1 sidecar degraded=True"; this layout → degraded=False.
#
# This image therefore:
#   1. builds the sidecar package's dist/ with the official TypeScript
#      compiler in a node:20 stage (dist/ is gitignored, never committed);
#   2. installs Node 20 into the Python image via Nodesource — the same
#      pattern deploy/hf-spaces/Dockerfile already uses — so the sidecar
#      has a runtime with all shared libraries apt-resolved;
#   3. preserves the repo layout (/repo/services/…, /repo/packages/…) so
#      DEFAULT_SIDECAR in phonetic_judo.py resolves with zero env hacks.

FROM node:20-slim AS sidecar-build
WORKDIR /pkg
COPY packages/polyglot-phonetic-judo/package.json packages/polyglot-phonetic-judo/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY packages/polyglot-phonetic-judo/ ./
RUN npm run build

FROM python:3.12-slim

ENV DEBIAN_FRONTEND=noninteractive
# Node 20 for the D-07 sidecar (python:3.12-slim ships no node).
RUN apt-get update && apt-get install -y --no-install-recommends \
      curl ca-certificates gnupg \
 && mkdir -p /etc/apt/keyrings \
 && curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key \
      | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg \
 && echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_20.x nodistro main" \
      > /etc/apt/sources.list.d/nodesource.list \
 && apt-get update && apt-get install -y --no-install-recommends nodejs \
 && rm -rf /var/lib/apt/lists/* \
 && node --version

WORKDIR /repo/services/intent-lock-server

COPY services/intent-lock-server/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY services/intent-lock-server/src/ ./src/
# The built sidecar package (sidecar.js + dist/ + data/), at the exact
# repo-relative location phonetic_judo.py looks for it.
COPY --from=sidecar-build /pkg /repo/packages/polyglot-phonetic-judo

ENV MCP_PROTOCOL_VERSION=2025-11-25
ENV CHAOS_MODE=0

EXPOSE 8080

# python:3.12-slim has no curl — urllib only (curl above is a build-time
# Nodesource fetch tool; do not rely on it for health).
HEALTHCHECK --interval=5s --timeout=3s --retries=3 \
  CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://localhost:8080/health', timeout=2).status==200 else 1)"

CMD ["python", "src/server.py", "--host", "0.0.0.0", "--port", "8080"]
