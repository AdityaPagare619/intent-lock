# Installing Intent Lock (OmniBeat-MCP) on Windows

Native Windows is supported: this repo ships PowerShell launchers
(`scripts\bootstrap.ps1`, `scripts\demo-up.ps1`, `scripts\demo-down.ps1`)
that mirror the bash quickstart step for step. No `make`, no bash, and no
WSL are needed for the path below. Everything runs in the PowerShell that
Windows ships by default (Windows PowerShell 5.1 works; PowerShell 7 also
works).

**The Gemini key step is OPTIONAL.** With no key at all the demo still
boots and locks — on a labeled deterministic local extraction floor plus
the audited catalog snapshot — and the on-screen BrainStatus says honestly
which brain answered. Set the key only if you want the live Gemini brain
instead of the local floor. The MCP server itself needs no key and calls
no model, ever.

---

## Prerequisites (install these yourself, once)

1. **Git for Windows** — https://git-scm.com/download/win
2. **Node.js 20 or newer** (includes npm) — https://nodejs.org
3. **Python 3.10 or newer** — https://www.python.org/downloads/
   - In the installer, tick **"Add python.exe to PATH"** and leave the
     **py launcher** option ticked (the bootstrap prefers the launcher).
   - If `python` opens the Microsoft Store instead of running, you hit the
     Store stub: open **Settings → Apps → Advanced app settings → App
     execution aliases** and turn **OFF** the `python.exe` / `python3.exe`
     aliases, then open a new terminal.

Then open **either** shell below and paste its block. The two blocks do
exactly the same thing; pick the shell you already have open.

> **Execution policy, once, so scripts are not blocked.** Windows may refuse
> a first `.ps1` run with "…cannot be loaded because running scripts is
> disabled on this system." Either allow local scripts for your user
> (one-time, in PowerShell):
>
> ```powershell
> Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
> ```
>
> (`RemoteSigned` runs scripts created on this machine unsigned, and still
> requires a signature for scripts downloaded from the internet.) Or skip
> changing any setting and use the `-ExecutionPolicy Bypass` form shown in
> the cmd.exe block — it applies to that one invocation only. The
> PowerShell block below assumes `RemoteSigned` (or that scripts are
> already allowed); the cmd.exe block works either way.

---

## PowerShell — exact paste block

```powershell
git clone https://github.com/AdityaPagare619/omnibeat-mcp.git
cd intent-lock

# OPTIONAL — live Gemini brain. Skip this line for the keyless local floor.
$env:GEMINI_API_KEY = "paste-your-key-here"

.\scripts\bootstrap.ps1
.\scripts\demo-up.ps1
```

Then open **http://localhost:3000** in your browser.

```powershell
# Prove it (seconds-fast smoke test: initialize -> tools/list -> one lock)
Invoke-RestMethod http://127.0.0.1:8080/health

# Stop the demo when you are done
.\scripts\demo-down.ps1
```

Notes:

- `bootstrap.ps1` is idempotent — safe to rerun. It creates the Python venv
  at `%LOCALAPPDATA%\omnibeat-mcp\venv` (the Windows equivalent of the bash
  path `~/.cache/omnibeat-mcp/venv`; the interpreter inside is
  `Scripts\python.exe`), installs both Python services' requirements,
  builds the phonetic package and the orchestrator, and installs the
  simulator's dependencies. It ends with a readiness summary; fix any
  `[!!]` lines it prints and rerun.
- `demo-up.ps1` works from any directory and only starts services whose
  ports (3000 / 4000 / 8080 / 9000) are down. It waits until all four
  respond, then prints the URLs. Service logs land in `logs\` as
  `demo-<port>.log` (output) and `demo-<port>.err.log` (errors).
- The `$env:GEMINI_API_KEY` line sets the key for **this terminal session
  only** — `demo-up.ps1` must run in the same window for the services to
  inherit it. Nothing is written to disk or into the repo.

---

## cmd.exe — exact paste block

cmd.exe cannot run `.ps1` files directly, so each script is invoked through
`powershell -File`. Use exactly this form:

```bat
git clone https://github.com/AdityaPagare619/omnibeat-mcp.git
cd intent-lock

REM OPTIONAL — live Gemini brain. Skip this line for the keyless local floor.
set GEMINI_API_KEY=paste-your-key-here

powershell -ExecutionPolicy Bypass -File scripts\bootstrap.ps1
powershell -ExecutionPolicy Bypass -File scripts\demo-up.ps1
```

Then open **http://localhost:3000** in your browser.

```bat
REM Prove it (seconds-fast smoke test: initialize -> tools/list -> one lock)
powershell -Command "Invoke-RestMethod http://127.0.0.1:8080/health"

REM Stop the demo when you are done
powershell -ExecutionPolicy Bypass -File scripts\demo-down.ps1
```

Notes:

- `-ExecutionPolicy Bypass` here is **per-invocation only** — it lets that
  one command run the repo's script without changing your machine-wide or
  user policy. If you prefer not to use it, set `RemoteSigned` once (see
  the note above) and drop `-ExecutionPolicy Bypass` from these lines.
- `set GEMINI_API_KEY=…` sets the key for **this cmd window only** — run
  `demo-up` in the same window. Do not put spaces around the `=`.

---

## Troubleshooting (native Windows)

| Symptom | Cause | Fix |
|---|---|---|
| "…cannot be loaded because running scripts is disabled on this system" | Default execution policy blocks local `.ps1` files | Run `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` once in PowerShell, or use the `-ExecutionPolicy Bypass -File …` form from the cmd.exe block |
| Bootstrap says "python not found (or only the Microsoft Store stub)" | Python is not installed, not on PATH, or the Store alias is shadowing it | Install Python 3.10+ from python.org (tick "Add python.exe to PATH" + py launcher); turn OFF the python Store aliases (Prerequisites, step 3); open a new terminal and rerun |
| Bootstrap says "node not found" or "node … < 20" | Node missing or too old | Install Node 20+ from https://nodejs.org , open a new terminal, rerun `.\scripts\bootstrap.ps1` |
| A service starts but `demo-up` ends with "DEMO FAILED: only N/4 services responding" | That service crashed on startup or is still compiling | Read its log: `logs\demo-<port>.log` and `logs\demo-<port>.err.log`. Rerunning `.\scripts\demo-up.ps1` is safe — it only starts what is down |
| A port (3000 / 4000 / 8080 / 9000) is held by another program | Something else is listening there | Stop it, or run `.\scripts\demo-down.ps1` if it is a leftover demo service, then rerun `demo-up` |
| Everything works but locks say `extraction_source` is the local floor | No `GEMINI_API_KEY` reached the orchestrator (or the key was set in a different window) | Expected with no key — the demo is fully functional this way. For the live brain, set the key in the **same** terminal window, run `.\scripts\demo-down.ps1`, then `.\scripts\demo-up.ps1` again |

---

## Alternatives (one line each)

- **WSL2:** in an Ubuntu (WSL) terminal inside the Linux filesystem, the
  original bash path works unchanged: `./scripts/bootstrap.sh && make demo`.
- **Docker Desktop:** with Docker running, from the repo folder:
  `docker compose up --build`, then open http://localhost:3000 (wired but
  untested by this team — no Docker host was available).
- **GitHub Codespaces:** this repo ships a `.devcontainer` (Python 3.11 +
  Node 20); "Open in Codespace" builds and starts the whole rig for you.
