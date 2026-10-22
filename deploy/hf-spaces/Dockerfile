# OmniBeat-MCP on Hugging Face Spaces (Docker) — ₹0 public demo URL
# Single container, supervisord runs all 4 services. Space must expose 7860.

FROM python:3.11-slim

ENV DEBIAN_FRONTEND=noninteractive \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    OMNIBEAT_FORCE_OFFLINE=0

# Node 20 (orchestrator + simulator + phonetic sidecar) + supervisor + curl
RUN apt-get update && apt-get install -y --no-install-recommends \
      curl ca-certificates gnupg supervisor \
 && mkdir -p /etc/apt/keyrings \
 && curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key \
      | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg \
 && echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_20.x nodistro main" \
      > /etc/apt/sources.list.d/nodesource.list \
 && apt-get update && apt-get install -y --no-install-recommends nodejs \
 && rm -rf /var/lib/apt/lists/* \
 && node --version && python3 --version

WORKDIR /app
COPY . /app

# Python deps (stdlib-only server; uvicorn/fastapi/httpx needed)
RUN pip install --no-cache-dir -r services/omnibeat-mcp-server/requirements.txt 2>/dev/null \
 || pip install --no-cache-dir fastapi "uvicorn[standard]" httpx

# Node deps: simulator + orchestrator + phonetic package
# (J-04 fix: the orchestrator lives in services/, not apps/ — the old
# `cd ../alexa-agent-orchestrator` targeted a nonexistent directory and
# broke this build, and with it the render.yaml door that reuses this
# Dockerfile. Absolute paths from WORKDIR /app, no fragile relative hops.)
RUN cd /app/apps/alexa-plus-simulator && npm ci --no-audit --no-fund \
 && cd /app/services/alexa-agent-orchestrator && npm ci --no-audit --no-fund && npm run build \
 && cd /app/packages/polyglot-phonetic-judo && npm ci --no-audit --no-fund && npm run build

# Next.js production build (standalone)
RUN cd apps/alexa-plus-simulator && npm run build

COPY deploy/hf-spaces/supervisord.conf /etc/supervisor/conf.d/omnibeat.conf

EXPOSE 7860
CMD ["/usr/bin/supervisord", "-c", "/etc/supervisor/conf.d/omnibeat.conf"]
