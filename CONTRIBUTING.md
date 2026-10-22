# Contributing to Intent Lock

Intent Lock is a deterministic MCP server with a four-service demo
around it. Please keep changes small, contract-led, and evidenced.

## Setup in five steps

1. Install Git, Python 3.10 or newer, and Node.js 20 or newer. POSIX
   users also need `make`; platform notes are in
   [docs/INSTALL_MACOS.md](docs/INSTALL_MACOS.md) and
   [docs/INSTALL_WINDOWS.md](docs/INSTALL_WINDOWS.md).
2. Clone the repository and enter it:

   ```bash
   git clone https://github.com/AdityaPagare619/intent-lock.git
   cd intent-lock
   ```

3. Run the platform bootstrap:

   ```bash
   ./scripts/bootstrap.sh
   ```

   On Windows:

   ```powershell
   .\scripts\bootstrap.ps1
   ```

4. Start the stack:

   ```bash
   make demo
   ```

   On Windows, run `.\scripts\demo-up.ps1` after bootstrap.
5. Open http://localhost:3000 and run a demo beat.

No API key is required for setup. The optional Gemini environment
variables are documented in [.env.example](.env.example) and
[docs/OPERATIONS.md](docs/OPERATIONS.md).

## Before opening a pull request

Read [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) for the repository
map and the owning layer for the change. For a contract or behavior
change, update [docs/12_INTENT_LOCK_SPEC.md](docs/12_INTENT_LOCK_SPEC.md)
first—or include the spec change in the same pull request—before
settling the implementation.

Run the checks for every component touched:

```bash
make config

(cd packages/polyglot-phonetic-judo && npm test && npm run build)
(cd services/alexa-agent-orchestrator && npm run build)
(cd apps/alexa-plus-simulator && npm run typecheck && npm run build)
```

Then start the integrated stack and work through the affected
acceptance areas in [docs/TESTING.md](docs/TESTING.md): kernel cases,
replay, saboteur behavior, demo beats, and a pristine rig where those
areas apply.

## Pull-request expectations

- **Small:** one purpose per pull request; separate unrelated cleanup.
- **Spec-first:** behavior and wire changes name the contract they
  implement and update the spec or decision record when they change it.
- **Evidence in the body:** list the commands run, the relevant
  `TESTING.md` areas exercised, and their actual results. Include
  health output or logs when startup or service wiring changed.
- **Documentation stays true:** update the affected service README,
  [docs/OPERATIONS.md](docs/OPERATIONS.md), or
  [docs/INDEX.md](docs/INDEX.md) when commands, endpoints, files, or
  operator behavior move.
- **No local state:** do not commit dependencies, build output, logs,
  databases, environment files, or API keys.
