# 10 — Alexa+ 2026 Deep Research Dossier

*Compiled 2026-10-21 by Petu (Principal, Intent Lock). Method: Amazon's official
developer documentation read firsthand in a live browser (all seven MCP Toolkit
pages), plus a sourced deep-research pass over the 2025–2026 literature and
Amazon's public record. Every claim below carries its source or is marked as a
gap. Where the brief that commissioned this dossier asserted facts, those
assertions were treated as hypotheses and verified — §6 lists what failed
verification.*

---

## 1. What is inside Alexa+ (the ingredients)

- **Models.** Alexa+ runs on Amazon Bedrock with a *model-agnostic routing
  system* drawing on Amazon Nova models and Anthropic Claude; Amazon selects
  per task, balancing accuracy and conversational fluidity (About Amazon,
  26 Feb 2025; TechCrunch, 26 Feb 2025; Vogels, *All Things Distributed*,
  9 Apr 2025). **Amazon has never published which model serves a given
  request** — Rausch to VentureBeat (Feb 2025): "I cannot say for any given
  response what model it's using." Any document naming specific Claude/Nova
  versions as "the Alexa+ models" is speculating.
- **Speech.** Nova Sonic (Apr 2025), a unified speech-to-speech model;
  Amazon states components of it power Alexa+. Nova 2 Sonic followed at
  re:Invent Dec 2025; Amazon has not confirmed Alexa+ runs wholly on v2.
- **Architecture.** "Experts" — groups of systems, capabilities, APIs and
  instructions, each orchestrating multiple services; agent interop in three
  modes: APIs, browser/computer-use where no API exists, and agent-to-agent.
  Orchestration uses Bedrock tooling (VentureBeat, Feb 2025).
- **On-device vs cloud.** Reasoning is cloud. New silicon (AZ3 / AZ3 Pro +
  Omnisense sensor fusion, Sep 30 2025 devices) handles presence and
  conversation detection at the edge.
- **Memory.** Preferences, purchase history, forwarded documents/emails/
  photos, conversation context spanning devices and days (Rausch, Feb 2026).
  Category add-ons explicitly inherit this memory (see §3).

## 2. What Alexa+ does natively vs what an MCP server must provide

Source: Alexa+ MCP Toolkit docs, read firsthand 2026-10-21 at
`developer.amazon.com/docs/alexaplus/add-ons/` (overview last modified
3 Aug 2026; lifecycle & authentication & quickstart 10 Jul 2026; schema-data
design & layout-rendering 21 Jul 2026).

**Alexa+ (the host) provides:**
- Natural language understanding, response generation, and UI rendering:
  *"You return standard MCP responses, and Alexa+ handles natural language
  understanding, response generation, and user interface (UI) rendering."*
  (MCP Toolkit Overview)
- AI Reasoning that "determines when and how to invoke your tools based on
  customer intent", over an **Add-on Registry** that "detects and indexes
  your registered tools" — discovery is implicit (no invocation name needed)
  or explicit.
- The full multi-turn dialogue: clarifying, adding context, refining —
  *before* calling your APIs/tools (Category SDK flow). Session context is
  the customer's conversation history, not an explicit session identifier:
  *"the session is based on the customer's previous conversations with
  Alexa+ rather than an explicit identifier for a session with your MCP App."*
- Rendering: data-only flow (Alexa+ renders native visuals from your
  `structuredContent`) or your custom MCP Apps UI when a `resourceUri` is
  present.
- Native services the add-on inherits: payments (Amazon Wallet), calendar,
  long-term memory.

**The MCP server (us) must provide:**
- Tools/resources/prompts over **Streamable HTTP**, MCP spec **2025-11-25**.
- Tool results in the documented shape (§3).
- A remote reachable URL, the OAuth endpoints of §4, and **round-trip query
  latency under 500 ms** (QuickStart performance requirement).
- An **Alexa+ MCP Add-on** bridge package (`addon.json`, deployed with the
  `alexa-ai` CLI) that registers the server's capabilities; tool/resource
  changes take effect only on redeploy.

**The governing design rule** (Tools/Schema/Data Design guide, verbatim):
*"Alexa builds spoken and visual responses from the data your MCP returns.
You can't "script" what Alexa says, but the quality and completeness of what
you send back determines whether customers get a useful response or hit a
dead end."* Corollaries from the same page: one tool = one meaningful
customer intent; *"Declare only what you honor… Treat your schema as a
promise the model will hold you to"*; always return something, including
errors; ship only your own content in payloads (no third-party tracking
parameters or upstream deep links).

## 3. The wire contract (exact, from the Client Lifecycle doc)

Tool-call result example as documented:

```json
{
  "structuredContent": {"success": true, "count": 0, "hotels": []},
  "content": [{"type": "text", "text": "{\"success\": true, \"count\": 0, \"hotels\": []}"}],
  "_meta": {"ui": {"resourceUri": "ui://hotel-search",
                   "invoking": "Searching hotels...",
                   "invoked": "Found hotels"}}
}
```

- **MCP Apps rendering** (Layout & Rendering guide): the UI runs in a
  *sandboxed iframe* (opaque origin); at render time the host delivers a
  **hostContext** object over the MCP Apps postMessage channel containing
  `deviceClass, maxWidth, maxHeight, isMobile, platform, displayMode,
  safeAreaInsets, deviceCapabilities, theme`. `deviceClass` is authoritative.
  The bridge (`ui/notifications/*`) is the *only* channel to the host; a
  `host-context-changed` event re-adapts without reload. CSP is declared in
  `_meta.ui.csp` (`connectDomains`, `resourceDomains`); undeclared domains
  are blocked. Ship **one self-contained HTML bundle**, gzipped, and
  **version the resource URI with a content hash** (e.g.
  `ui://…/widget-a3f9c12b.html`) so hosts bust cache on change.
- **Viewports**: *Block* (wider than tall, scales + scrolls horizontally —
  recommended for native Alexa+ designs) vs *Card* (taller than wide,
  vertical scroll). Alexa+ applies CSS scaling itself; do not design for
  specific device dimensions.
- **Elicitation**: Alexa+ first tries to gather missing context itself,
  then uses the MCP elicitation framework.

## 4. Authentication — Two-Tier OAuth 2.1 (exact, from the Authentication doc)

| Tier | Grant | Scope | Used for |
|---|---|---|---|
| 1 — service (M2M), no user | `client_credentials` (HTTP Basic at token endpoint) | `mcp:service` | `initialize`, `tools/list`, catalog browsing, health checks |
| 2 — user consent | `authorization_code` + **PKCE (S256)** | `mcp:tools`, `mcp:resources` | executing tools for a user, user resources |

Rules: tokens ≤ 3600 s; **no refresh token for client_credentials** (request
a new one); token requests must include the `resource` parameter (canonical
MCP server URI); server hosts a Protected Resource Metadata document
(RFC 9728) and auth-server metadata at `/.well-known/oauth-authorization-server`;
unauthenticated requests return **401 without a WWW-Authenticate header**
(not supported). **Not supported: DCR, OIDC, step-up authorization.**
Tier 2 begins only when a user-specific tool is invoked; Tier 1 must be
established before account linking.

## 5. Zero-cost state of the art for the intelligence layers

### 5.1 Generative ASR Error Correction (GER) — powerful, dangerous unconstrained
- HyPoradise (Chen et al., arXiv:2309.15701): H2T-LoRA GER cut WER
  77.1%/55.1% relative on ATIS/WSJ, beating the N-best oracle. Fine-tuned T5
  on Whisper 10-best: 3.52 → 2.90 WER.
- **But**: zero-shot GPT-3.5/4 correction frequently *degrades* Whisper
  output (arXiv:2409.09554). The named failure mode is **over-correction /
  hallucinated entities**; the published mitigations are exactly
  neuro-symbolic: N-best + phonetic context raised rare-word recall
  27.6% → 85.0% (Yamashita et al., arXiv:2505.17410); confidence-guided GER
  beat naive correction by 10–47% relative (arXiv:2509.25048); production
  RevComm (2025) found full-sentence correction degraded CER and shipped
  **span-only two-step correction** instead.
- **Catalog constraint is the precedent**: contextual biasing for music
  titles/artists (arXiv:2401.08835); Retrieve-and-Copy pre-retrieval with
  FAISS to a 20K catalog (arXiv:2311.08402).
- **Gap (honest)**: no published benchmark exists for Hindi/Bhojpuri/Tamil/
  Spanish/Korean/Arabic titles spoken into an English ASR. Adjacent data:
  code-switched speech runs +30–50% WER. The signal that survives
  transliteration is the phonetic one — which is why our pipeline leads
  with phonetics and uses the LLM only inside a retrieved candidate set.

### 5.2 Dictionary-free phonetics — all local, all $0
- **phonemizer + espeak-ng**: G2P for 100+ languages incl. Hindi/Tamil/
  Spanish; fast, local.
- **Epitran**: native-script pairs (hin-Deva, tam-Taml, kor-Hang, urd-Arab).
- **PanPhon** (Mortensen et al., COLING 2016): 5,000+ IPA segments →
  21 articulatory feature vectors → principled weighted phonetic distance.
  This is the grown-up, published version of our hand-rolled articulatory
  groups in E1.
- **CharsiuG2P** (ByT5, ~100 languages) as an offline second pass.
- Recipe: precompute catalog IPA (native + romanised + English-mode),
  retrieve top-20–50 by PanPhon distance / ANN, re-rank.
- **Gap**: no Bhojpuri G2P exists — Hindi is the proxy.

### 5.3 Routing & free tiers (October 2026, with conflicts flagged)
- Patterns: FrugalGPT cascades; RouteLLM (arXiv:2406.18665, ICLR 2025) —
  >2× cost saving by routing; repo dormant since Aug 2024. Voice budget:
  ~800 ms turn gap; the LLM's TTFT slot inside it is ~200 ms.
- **Groq**: measured ~780 tok/s (8B, TTFT ~45 ms) and ~297–330 tok/s (70B,
  TTFT ~120 ms) (KickLLM, Apr 2026). ⚠ **Conflict, verified live
  2026-10-21**: Groq's own rate-limits page did **not** list Llama models
  on the free tier at research time — it listed **gpt-oss-20b/120b**
  (30 RPM / 1K RPD / 8K TPM / 200K TPD) and Whisper. Secondary guides still
  list Llama free tiers (8B: 14,400 RPD; 70B: 1,000 RPD). **Design must not
  hard-depend on a specific free model existing.**
- **Groq structured outputs**: strict schema-constrained decoding only on
  gpt-oss-20b/120b (+ qwen3.8-27b class); Llama models get JSON mode only
  and may emit schema-invalid JSON. **Gemini**: `responseSchema` supported,
  unsupported keywords silently ignored — validate anyway. Google no longer
  publishes a per-model free table; secondary Oct 2026 figures: Flash
  5 RPM/20 RPD, Flash-Lite 10 RPM/500 RPD (treat as indicative, not fact).
- **OpenRouter** `:free`: 20 RPM / 50 RPD (1,000 RPD after a one-time $10).
  **Cloudflare Workers AI**: 10,000 Neurons/day free.
- **Local**: Ollama 27–32B Q4 ≈ 30–50 tok/s on 24 GB (70B doesn't fit);
  Transformers.js ≈ 63 tok/s WebGPU vs 1.6 tok/s WASM (measured Oct 2026).
- **Conclusion**: free tiers are demo-viable *only* behind a local-first
  cascade that calls the LLM on the ambiguous tail. An LLM-per-turn design
  dies on rate limits (Gemini Flash at 20 RPD is the extreme case).

### 5.4 MCP sampling — do not build on it
`sampling/createMessage` is fully specified in MCP 2025-11-25 (incl.
SEP-1577 tool use), **but deprecated in the 2026-07-28 spec (SEP-2577)** in
favour of direct LLM APIs. Host support is sparse (Claude Desktop/Code: no,
per CatieMCP's Apr 2025 matrix; VS Code/Copilot added it later), and
**Amazon's Alexa+ docs never mention sampling at all** — the Alexa+ "Supported
Capabilities" tree contains only Authentication and Account Linking. Any
design that needs host sampling to function is dead on the real Alexa+ host.

### 5.5 MCP Apps — a real standard, and our deck's native form
MCP Apps is the first official MCP extension, **GA 26 Jan 2026**
(SEP-1865): tool `_meta.ui.resourceUri` → `ui://` resource with MIME
`text/html;profile=mcp-app`, sandboxed iframe, `ui/initialize` returns
hostContext (theme/locale/**displayMode**/dimensions/platform) over
JSON-RPC/postMessage; `ui/notifications/tool-input|tool-result` carry
content (for the model) + structuredContent (for the UI). Display modes:
**inline / fullscreen / pip** — the spec's own pip example is a music
player. Launch hosts: Claude web+desktop, ChatGPT, Goose, VS Code.
ChatGPT's Apps SDK is the predecessor (proprietary `window.openai`);
portable MCP Apps is the standard to build to. Alexa+'s MCP adoption
(Jul 2026) is multi-source confirmed (Skift, iClarified); MCP Apps
*rendering on Echo Show* is single-source (a GitHub project) — uncorroborated,
treated here as plausible, not fact.

### 5.6 The structured-output reliability contract (synthesis of §5.1–5.3)
The literature converges on one safe shape for letting an LLM touch actions:
1. LLM output space = **enum of retrieved candidate IDs** (never free text
   that gets executed).
2. Zod/Pydantic schema validation + at most one repair attempt.
3. **Deterministic post-verification** (catalog-ID existence + phonetic
   distance threshold) before anything acts.
4. Refusal/abstention as a first-class output.
This is, not coincidentally, the shape Intent Lock's guard already enforces —
the redesign keeps the contract and upgrades the proposer.

## 6. Claims in the commissioning brief that failed verification

| Brief's claim | Finding |
|---|---|
| Docs index at `developer.amazon.com/docs/llms.txt` | **404.** Root `/llms.txt` exists but lists zero Alexa+/MCP content — despite Alexa+ pages pointing readers to it. |
| Doc URLs under `/en-US/docs/alexa/alexaplus/…` | **404.** Real base: `developer.amazon.com/docs/alexaplus/add-ons/<slug>` (no `.html`). |
| Alexa+ models: "Claude Sonnet 4.6/5, Haiku 5.5, Opus 5/Fable 5, Nova Premier/Sonic" | **Unsupported.** Amazon names no per-request models (§1). |
| Display modes "Inline / Fullscreen Echo Show Far-Field 1.6x / Voice-Only" | **Not in the Toolkit docs.** Docs specify Block vs Card viewports + host CSS scaling; MCP Apps spec modes are inline/fullscreen/pip. No 1.6× figure found. |
| MCP Toolkit overview "updated August 2026" | True for the overview (3 Aug 2026); other pages are Jul 2026. Harmless. |
| Sampling as an Alexa+ reasoning channel | **Undocumented for Alexa+** and deprecated upstream (§5.4). |
| The "can't script what Alexa says" quote | **Verified verbatim** (§2). |
| Two-Tier OAuth 2.1 (client_credentials + PKCE, scopes) | **Verified exactly** (§4). |
| `structuredContent` + `resourceUri` + hostContext over postMessage | **Verified** (§3), with the exact `_meta.ui` shape. |

Also noted: Amazon's own lifecycle example shows `protocolVersion:
"2025-03-26"` in the sample initialize payload while the overview states
2025-11-25 support — an internal inconsistency in Amazon's docs. Our server
currently *requires* 2025-11-25; the spec (doc 11) adds version negotiation
awareness without weakening the gate.

## 7. Competitive gap analysis — where the moat actually is

- **Alexa+ owns**: NLU, dialogue, memory, rendering, payments, discovery.
  Competing with any of these is dead on arrival.
- **Alexa+ lacks** (sourced, from the 21 Oct product dossier): any public
  error-handling spec; observed behaviour on failure is apology + a new,
  sometimes hallucinated plan (Verge year-long test, Oct 2026; WIRED,
  Mar 2026 — wrong musician for specific songs; Pogue, Aug 2026 — playlist
  hallucinated on Spotify, a feature that is Amazon-Music-only in
  practice). Latency measured up to ~15 s on some requests.
- **The add-on shape Amazon productized is literally an MCP server** on
  spec 2025-11-25 returning `structuredContent` (+ optional MCP Apps UI).
  Intent Lock already *is* that shape; its differentiator inside that shape is
  the **guarantee layer**: never-guess resolution (confidence floor),
  purity/anti-upsell verification, verified-effect playback, and a
  hash-chained receipt for every action — the trust layer between an
  improvising host and irreversible actions.
- **The redesign thesis** (doc 11): let AI propose (phonetic reconstruction,
  constraint extraction, conversation), let deterministic systems dispose
  (schema validation, phonetic post-verification, purity math, ledger).
  That is both the published SOTA (§5.6) and our existing architecture's
  skeleton — the upgrade replaces the *proposers*, which are currently
  2015-era regex tables, and keeps the *disposers*, which are the product.

---

*Primary sources: developer.amazon.com/docs/alexaplus/add-ons/ (7 pages, read
2026-10-21); modelcontextprotocol.io specification 2025-11-25; MCP Apps
launch post & SEP-1865 (Jan 2026); arXiv:2309.15701, 2409.09554, 2505.17410,
2509.25048, 2401.08835, 2311.08402, 2406.18665; PanPhon (COLING 2016);
Groq/Gemini/OpenRouter official limit pages (Oct 2026, conflicts flagged in
§5.3); About Amazon / TechCrunch / VentureBeat / Vogels (2025); The Verge /
WIRED / Pogue (2026). Full SOTA notes: research dossier
`neuro-symbolic-voice-sota-20261021-0551`.*
