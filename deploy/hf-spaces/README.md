# Host the interactive demo on Hugging Face Spaces — OPTIONAL, UNVERIFIED

> **Honest label:** this is an optional deployment path. It has **not**
> been run end-to-end on a real Space by this team — there is no
> recorded Space run, and no build/wake timings are claimed. The proven
> path is the local quickstart in the [root README](../../README.md)
> (`make demo`). This folder is kept so a judge with a Hugging Face
> account can try the container route: one Docker image, supervisord
> runs all 4 services, the Space exposes port 7860.

## Setup (needs a Hugging Face account)

1. Create a free account at https://huggingface.co/join
2. Create a **write** token: https://huggingface.co/settings/tokens
3. Create a new Space: https://huggingface.co/new-space
   - SDK: **Docker** · Hardware: **CPU basic** (free) · Visibility: Public
4. Push this repo to the Space's git repo, with this folder's
   `Dockerfile` and `.dockerignore` at the Space root and
   `supervisord.conf` under `deploy/`:

```bash
git clone https://huggingface.co/spaces/<YOUR_USER>/omnibeat-demo
cp -r /path/to/omnibeat-mcp/* omnibeat-demo/
cp /path/to/omnibeat-mcp/deploy/hf-spaces/Dockerfile omnibeat-demo/Dockerfile
cp /path/to/omnibeat-mcp/deploy/hf-spaces/.dockerignore omnibeat-demo/.dockerignore
mkdir -p omnibeat-demo/deploy && cp /path/to/omnibeat-mcp/deploy/hf-spaces/supervisord.conf omnibeat-demo/deploy/
cd omnibeat-demo && git add -A && git commit -m "OmniBeat-MCP demo" && git push
```

The Space then serves the simulator at
`https://<YOUR_USER>-omnibeat-demo.hf.space`, with the same chain as
locally: browser → :7860/api/mcp → :4000 → :8080, all inside the
container.

## Notes

- The MCP wire, catalog hydration, and ledger are the same code as the
  local demo. SIM labels still mark Echo-hardware stand-ins
  (ASR/mic/TTS).
- First builds install three Node dependency trees plus a Next.js
  build; expect the first build to take a while. Spaces sleep when
  idle, so a cold Space also needs a wake-up wait — neither duration
  has been measured on a real Space, so neither is stated here.
- If anything in this path disagrees with what you observe, the local
  quickstart is the supported route — please treat this folder as a
  starting point, not a promise.
