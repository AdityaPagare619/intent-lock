# docs/ — index

Every file in this folder, one line each: what it is, who should read
it, and its status. If you read only five things, read the CANONICAL
row set in the order the root README's **"Judges — start here"** block
gives.

**Status key:** **CANONICAL** — current and authoritative; read this
one. **GUIDE** — instructions or a companion; current, but supporting.
**BACKGROUND** — research and context; true when written, not product
documentation. **HISTORY** — a dated record of how we got here; kept
for honesty, superseded where it conflicts with a CANONICAL file.

| File | What it is | Who should read it | Status |
| --- | --- | --- | --- |
| `DEVPOST_STORY.md` | The project story: what Intent Lock is, why it exists, known limitations | Judges first; anyone who wants the plain-words version | CANONICAL |
| `index.html` | The guided Story walkthrough (seven beats, the wire at the center) — static, runs offline | Judges; anyone who wants the demo without booting the stack | CANONICAL |
| `fixtures/session.json` | The recorded session the walkthrough replays (data file, not a document) | Nobody needs to read it; `index.html` loads it | GUIDE |
| `assets/css/story.css` | The walkthrough's stylesheet (support file for `index.html`) | Nobody needs to read it; the browser loads it | GUIDE |
| `assets/js/story.js` | The walkthrough's script — beat navigation and the replay driver (support file for `index.html`) | Nobody needs to read it; the browser loads it | GUIDE |
| `architecture-main.png` | The whole system on one plate: brain, kernel, catalogs, verdicts | Everyone — this is the one architecture picture | CANONICAL |
| `architecture-main.svg` | The same plate as `architecture-main.png`, in vector form | Anyone embedding the picture at print size | CANONICAL |
| `architecture-pipeline.png` | Inside the kernel: stages A–E, the kill channels, the tie-to-pin loop | Judges and engineers who want the second level down | CANONICAL |
| `architecture-pipeline.svg` | The same plate as `architecture-pipeline.png`, in vector form | Anyone embedding the picture at print size | CANONICAL |
| `12_INTENT_LOCK_SPEC.md` | The locked spec — the document of record for the tool, the kernel stages, and the verdicts | Engineers and judges checking claims against the design | CANONICAL |
| `TESTING.md` | How the kernel was attacked (host personas, replay, saboteur battery) and the final acceptance-gate table | Judges verifying the survival numbers | CANONICAL |
| `MCP_PROTOCOL_PROOF.md` | Wire-level evidence that the server speaks MCP 2025-11-25 (handshake, session, tool calls, a third-party client) | Judges and engineers verifying the protocol claim | CANONICAL |
| `FRICTION_LOG_FINAL.md` | The complete Developer Friction Log, FL-01…FL-24, in the rules' field order | Judges (it is the bonus document); platform teams | CANONICAL |
| `PLAIN_WORDS.md` | The project explained with no jargon at all | Non-programmers | GUIDE |
| `OPERATIONS.md` | Service map, startup and shutdown, Docker and Render paths, health checks, configuration, and troubleshooting | Operators running the four-service stack | GUIDE |
| `DEVELOPMENT.md` | Contributor map, change flow, verification paths, and conventions present in the tree | Contributors and maintainers | GUIDE |
| `INSTALL_MACOS.md` | Install and run instructions for macOS | Anyone booting the demo on a Mac | GUIDE |
| `INSTALL_WINDOWS.md` | Install and run instructions for Windows (native PowerShell launchers) | Anyone booting the demo on Windows | GUIDE |
| `shots/README.md` | What each screenshot in `shots/` shows and how it was captured | Anyone checking a screenshot's provenance | GUIDE |
| `shots/main-interface.png` | Capture: the Alexa+ simulator stage with the live wire and Trust Card (the README hero shot) | Presentation asset | GUIDE |
| `shots/trust-card.png` | Capture: a `locked` Trust Card with its elimination list | Presentation asset | GUIDE |
| `shots/tie-card.png` | Capture: a `tie_choice` Trust Card awaiting a pin | Presentation asset | GUIDE |
| `shots/devpost-thumbnail.png` | The Devpost project thumbnail (3:2) | Presentation asset | GUIDE |
| `shots/video-poster.jpg` | Poster frame from the demo video (16:9) | Presentation asset | GUIDE |
| `10_ALEXA_PLUS_2026_DEEP_RESEARCH.md` | Research notes on the Alexa+ 2026 platform landscape, gathered before the build | Readers who want the market/platform context | BACKGROUND |
| `FRICTION_LOG.md` | The dated build-time friction log (FL-01…FL-16) as written when each wall was hit; the final log grew from it — read `FRICTION_LOG_FINAL.md` instead | Readers tracing how an entry evolved | HISTORY |
| `DECISION_LOG.md` | The dated decision record (D-01 onward): what was decided, why, and what it cost | Readers auditing how the design was chosen | HISTORY |
| `ARCHITECTURE_V2.md` | The retired v2 blueprint (four-tool OmniBeat design, Graceful Yield, ledger) — superseded by the spec above; banner on the file says so | Readers tracing the design's evolution | HISTORY |
| `.nojekyll` | GitHub Pages marker file (serves `index.html` raw); not a document | Nobody | GUIDE |
| `INDEX.md` | This index | Anyone lost in this folder | GUIDE |
