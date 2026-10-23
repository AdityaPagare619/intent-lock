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
git clone https://huggingface.co/spaces/<YOUR_USER>/intent-lock-demo
cp -r /path/to/intent-lock/* intent-lock-demo/
cp /path/to/intent-lock/deploy/hf-spaces/Dockerfile intent-lock-demo/Dockerfile
cp /path/to/intent-lock/deploy/hf-spaces/.dockerignore intent-lock-demo/.dockerignore
mkdir -p intent-lock-demo/deploy && cp /path/to/intent-lock/deploy/hf-spaces/supervisord.conf intent-lock-demo/deploy/
cd intent-lock-demo && git add -A && git commit -m "Intent Lock demo" && git push
```

The Space then serves the simulator at
`https://<YOUR_USER>-intent-lock-demo.hf.space`, with the same chain as
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
