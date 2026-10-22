# REPO SETTINGS — exact values to apply (coordinator/founder applies; J-09 prepares only)

Verified current state (via `gh repo view`, 2026-10-20): **both repos have a description and an MIT license detected by GitHub; both have NO topics and NO homepage.** Topics/homepage are the only gaps — 3 minutes to fix both repos.

Where: repo page → ⚙️ gear icon next to **About** (top-right of the repo home) → edit **Description / Website / Topics** → Save. (Or `gh repo edit` with the flags noted.)

---

## Repo 1 — `AdityaPagare619/omnibeat-mcp` (PRIVATE — the submission)

**Description — REPLACE the current one (the live text still sells retired v1 features — yield, ledger, multiroom — all cut). Paste exactly:**
```
Intent Lock (OmniBeat-MCP) — a Universal Deterministic Action Firewall for Alexa+: an MCP server (2025-11-25, Streamable HTTP) with zero LLMs inside that verifies voice intent against real catalogs before anything plays or ships — operator grammar for code-switched speech, phonetic entity grounding, transparent elimination, Taste Lock voice rules. One schema, every catalog. Amazon Build/Ship/Shape hackathon, Alexa+ track.
```

**Website / homepage — set to the YouTube video URL** after upload (see `VIDEO_UPLOAD_CHECKLIST.md`):
```
https://www.youtube.com/watch?v=<VIDEO_ID>
```
If the Render live demo is approved and deployed before submission, use the Render URL here instead and keep the video link in the README — a running demo outranks a video as a homepage. Do not leave the homepage blank at submission time if either exists.

**Topics — paste exactly (GitHub topics are lowercase, hyphenated):**
```
mcp, model-context-protocol, alexa-plus, alexa, voice-assistant, streamable-http, fastapi, nextjs, typescript, python, phonetics, music, hackathon
```
CLI equivalent:
```bash
gh repo edit AdityaPagare619/omnibeat-mcp --add-topic mcp,model-context-protocol,alexa-plus,alexa,voice-assistant,streamable-http,fastapi,nextjs,typescript,python,phonetics,music,hackathon
```

**License:** MIT — file present in repo and detected by GitHub ✅ (rules: a private repo needs the license-or-sharing condition met; we meet both — MIT file *and* judge sharing).

**Do NOT change:** visibility (must stay private with judge collaborators, or the invite work in `JUDGE_INVITES.md` is moot), repo name, or default branch between submission and the end of judging (Nov 20).

## Repo 2 — `AdityaPagare619/polyglot-phonetic-judo` (PUBLIC — the Open Source entry)

**Description — already set, keep as-is (verified):**
```
Polyglot phonetic judo: vowel-preserving phonetic skeletons + ASR homophone clusters + articulatory edit distance. Rescues mangled Indic-language voice queries (lolly pop la gelu -> Lollipop Lagelu). Zero-dependency, MIT.
```

**Website / homepage — leave blank.** The natural link (the parent OmniBeat repo) is private and would 403/404 for public visitors; a dead homepage is worse than none. Revisit only if the package is published to npm (then use the npm page).

**Topics — paste exactly:**
```
phonetics, nlp, speech-recognition, asr, transliteration, typescript, zero-dependency, voice-ai, indic-languages, metaphone
```
CLI equivalent:
```bash
gh repo edit AdityaPagare619/polyglot-phonetic-judo --add-topic phonetics,nlp,speech-recognition,asr,transliteration,typescript,zero-dependency,voice-ai,indic-languages,metaphone
```

**License:** MIT, detected by GitHub and visible in the About section ✅ — the official rules require exactly this for public repos: *"this license should be detectable and visible at the top of the repository page (in the About section)."*

## Verification after applying (coordinator)

```bash
gh repo view AdityaPagare619/omnibeat-mcp --json description,homepageUrl,repositoryTopics,licenseInfo
gh repo view AdityaPagare619/polyglot-phonetic-judo --json description,homepageUrl,repositoryTopics,licenseInfo
```
Both should show non-null `repositoryTopics`; repo 1 should show the video (or demo) URL in `homepageUrl`.

---
*Prepared by Judge J-09, 2026-10-20. Current-state values read live from GitHub the same date; only topics + homepage are missing.*
