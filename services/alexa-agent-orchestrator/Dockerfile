FROM node:20-slim

WORKDIR /app

COPY package.json package-lock.json ./
COPY tsconfig.json ./
COPY src/ ./src/
# Install from the lockfile (npm ci — reproducible; the old `npm install`
# without the lockfile copied in could drift between judge machines),
# compile, then drop dev deps.
RUN npm ci --no-audit --no-fund && npx tsc -p tsconfig.json && npm prune --omit=dev && npm cache clean --force

ENV PORT=4000
ENV MCP_SERVER_URL=http://intent-lock-mcp-server:8080/mcp

EXPOSE 4000

HEALTHCHECK --interval=5s --timeout=3s --retries=5 \
  CMD node -e "fetch('http://localhost:4000/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

CMD ["node", "dist/server.js"]
