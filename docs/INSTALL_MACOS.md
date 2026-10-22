# Installing OmniBeat-MCP on macOS

**The good news first:** the shell scripts were audited line-by-line against
macOS's stock shell (bash 3.2 — Apple hasn't shipped a newer bash since
2007). They use **no bash-4+ syntax** (no associative arrays, no `mapfile`,
no `${var,,}`), no GNU-only tool flags (no `sed -i`, no `grep -P`, no
`readlink -f`), and every service path is built with `pathlib`/`os.path.join`
— so once the right runtimes are present, the Linux quickstart runs as-is.

**The one trap:** the `python3` already on your Mac is very likely the
Xcode Command Line Tools one — **Python 3.9** — and this project requires
**Python 3.10+**. Bootstrap will (correctly) refuse with `NOT READY` rather
than half-install. Install a current Python *first* and the rest is the
promised two commands.

---

## Step by step

### 1. Python 3.11+ (do this before anything else)

Pick **one**:

- **python.org (simplest):** download the macOS universal installer for
  Python 3.11 or newer from https://www.python.org/downloads/macos/ and run
  it. It puts a proper `python3` ahead of the system one.
- **Homebrew:** `brew install python@3.11`

Check yourself before proceeding:

```bash
python3 --version   # must say 3.10 or higher — if it says 3.9.x, see above
```

### 2. Node 20 LTS

- **nodejs.org:** download the macOS installer for **20 LTS** from
  https://nodejs.org and run it, or
- **Homebrew:** `brew install node@20`

```bash
node --version   # expect v20.x
```

### 3. `make` (Xcode Command Line Tools)

If you've never used developer tools on this Mac, the first `make` triggers
a system dialog offering the Command Line Tools — accept it (it's a large
download and needs a GUI session, so don't start it over SSH). To do it
deliberately instead:

```bash
xcode-select --install
```

### 4. `jq` (only needed for `make verify`)

```bash
brew install jq
```

(No Homebrew? Download the single `jq` binary from
https://jqlang.github.io/jq/download/ and put it on your `PATH`.)

### 5. Clone and run

```bash
git clone <this-repo-url>
cd omnibeat-mcp
./scripts/bootstrap.sh && make demo
# open http://localhost:3000
```

### 6. Prove the wire (optional, recommended)

```bash
make verify        # 4-act MCP 2025-11-25 wire proof — needs jq (step 4)
```

---

## Notes for Mac judges

- **Apple Silicon vs Intel:** both fine. The Python dependencies are
  pure-Python or ship universal/arm64 wheels, and Node/Next.js publish
  native builds for each. Nothing in the install compiles C extensions
  except optional `uvicorn[standard]` wheels, which are prebuilt for both
  architectures.
- **Gatekeeper never gets involved** — the install downloads no unsigned
  executables; everything arrives via npm/PyPI package managers.
- **Case sensitivity:** this repo has no filenames that differ only by
  case, so the default case-insensitive APFS volume is safe.
- **No Homebrew required.** Every step above has an official-installer
  route; Homebrew is offered only as a shortcut.

## Troubleshooting (macOS)

| Symptom | Cause | Fix |
|---|---|---|
| Bootstrap ends `NOT READY`, line says `venv python < 3.10` | Your `python3` is the Xcode CLT 3.9 | Install Python 3.11+ (step 1), delete nothing — just rerun `./scripts/bootstrap.sh` in a fresh terminal so the new `python3` wins |
| A dialog pops up the first time you run `make` | macOS offering Command Line Tools | Accept and let it finish, then rerun `make demo` — or pre-empt it with step 3 |
| `FATAL: 'jq' is required on PATH` (during `make verify`) | `jq` not installed | Step 4 |
| Simulator loads and health checks pass, but the wire inspector can't reach the MCP server | `localhost` resolved to IPv6 `::1` first, while the MCP server listens on IPv4 (`127.0.0.1`) only | Start the orchestrator with `MCP_SERVER_URL=http://127.0.0.1:8080/mcp` and the simulator with `MCP_UPSTREAM=http://127.0.0.1:4000/mcp` — both env overrides are honoured by the code |
| `node: command not found` after installing Node | Terminal predates the install | Open a new terminal window — PATH is set at shell start |

---

## Exact paste block (after steps 1–2 installers have run)

```bash
python3 --version && node --version        # 3.10+ and v20.x — stop here if not
xcode-select --install 2>/dev/null; true   # only if `make` has never run on this Mac
git clone <this-repo-url>
cd omnibeat-mcp
./scripts/bootstrap.sh && make demo
# open http://localhost:3000 in your browser
make verify                                # optional; needs jq (brew install jq)
```
