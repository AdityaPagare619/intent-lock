# VIDEO UPLOAD CHECKLIST — founder's job (after the re-shoot)

**Status: ⏳ RE-SHOOT PENDING the founder's decision.** The Intent Lock demo is being re-shot on the new stage. The earlier cut (`omnibeat-submission-video-257.mp4`, 2:57) shows the **retired pre-Intent-Lock UI** — it must **not** be uploaded or submitted. Devpost requires a video URL on the submission form — once the re-shoot exists, this checklist is the single hard blocker for submitting.

## The new cut — 2:00, three movements

The re-shot video follows the locked Intent Lock structure (spec: `docs/12_INTENT_LOCK_SPEC.md`):

- **Beat 1 — The Lock (0:00–~1:00).** One recorded Hinglish utterance into both systems: *"Alexa, play that 'Sayaraa' waala slow film song — woh original movie version, not the remix."* Without a guarantee layer, the catalog's top answer is the remix. Intent Lock compiles the veto from the raw words, grounds "Sayaraa" ➔ "Saiyaara" (PanPhon 66 · skeleton 100 · lock 76 vs floor 60), eliminates four real traps (remix · karaoke · compilation swap · the 2025 wrong-film title track), locks the **2012 Film Original** and plays it from its hook. The Trust Card and the live wire are on screen.
- **Beat 2 — The Rule (∼1:00–1:35).** Voice only: *"Give me the lofi version instead… after 10 PM, Saiyaara means this lofi version."* The Taste Lock is written. The stage clock is then **scrubbed past 22:00**; the same words fire again; the official **LoFi Mix** locks with "Rule applied."
- **Coda — One Schema, Three Locks (1:35–2:00).** Three real `tools/call` locks through the same pipeline: the song, a 2 m Thunderbolt cable (the 40 Gbps-title / 480 Mbps-spec listing dies as `spec_contradiction`), and the unsweetened oat-milk reorder (the sponsored almond swap dies). Closing line: **"One schema. Every catalog. Borrow the Brain, Own the Guarantee."**

## ⚠️ Step 0 — Duration check FIRST (compliance, do not skip)

The official rules say the video *"should be less than three (3) minutes"* and the overview requires *"a demo video under 3 minutes."* The new cut targets **2:00**. Verify the exported file before uploading: `ffprobe -v error -show_entries format=duration` → must read **< 180 s**. If an export ever lands at exactly 3:00, trim the tail fade — exactly 3:00 is **not** under 3 minutes, and YouTube will display "3:00".

## Step 1 — Upload to YouTube

1. Go to **youtube.com/upload** (signed in as Aditya) → select the re-shot export file.
2. **Title** (paste exactly):
   ```
   Intent Lock — Borrow the Brain, Own the Guarantee. | Amazon Build, Ship, Shape Hackathon (Alexa+ Track)
   ```
3. **Description** (paste; replace the repo line only if the URL ever changes):
   ```
   Alexa+ understands your accent and your sentence brilliantly. The risk is what happens next: at the catalog boundary, the answer can be the remix you banned, the karaoke cut, or a same-titled song from the wrong film — because nothing deterministic checks the action before it fires. That gap, between what the assistant understood and what it does, is the Unverified Action Boundary.

   Intent Lock closes that gap. It is a self-hosted MCP server (spec 2025-11-25, Streamable HTTP) with one tool and zero LLMs inside: a deterministic kernel that compiles your raw words into symbolic operators (a veto is a veto in Hinglish, Spanglish, Tanglish or English), grounds the request in real catalog rows with articulatory phonetics, eliminates every trap in the open on a proof card — the Trust Card — and only then locks. Or ties, and asks. Or honestly refuses.

   In this video: one Hinglish request locks the 2012 film original of Saiyaara instead of the remix; a rule spoken once ("after 10 PM, Saiyaara means the lofi version") fires when the clock passes 22:00; and the same engine locks a Thunderbolt cable and an oat-milk reorder — one schema, every catalog.

   Everything on screen is real MCP wire traffic from the code in the repo.

   0:00 Beat 1 — the Lock: "Sayaraa" ➔ Saiyaara, 2012 Film Original
   1:00 Beat 2 — the Taste Lock rule, the clock scrub, the LoFi Mix
   1:35 Coda — one schema, three locks

   Code (private during judging; judges are collaborators): https://github.com/AdityaPagare619/omnibeat-mcp
   Open-source phonetic core: https://github.com/AdityaPagare619/polyglot-phonetic-judo

   Built by THE YAP PATROL for the Amazon "Build, Ship, Shape" Developer Hackathon — Alexa+ Track + Open Source Mini Challenge.

   #Alexa #MCP #ModelContextProtocol #AmazonHackathon #VoiceAI #Devpost
   ```
4. **Audience:** select **"No, it's not made for kids."**
5. **Visibility: PUBLIC.** ⚠️ This is a rules requirement, not a preference — the overview says the video must be *"YouTube or Vimeo, public and in English"* and the rules say it *"must be uploaded to and made publicly visible on YouTube or Vimeo."* **Unlisted does not satisfy the letter of the rule.** Do not choose Unlisted or Private.
6. Language: the narration is English ✅ (rules: all submission materials in English).
7. Music/rights: the soundtrack is an originally synthesized ambient bed and original TTS narration — no third-party or copyrighted music/footage is used as soundtrack (rules prohibit it without permission). Song previews heard in the demo are the catalogs' own 30-second preview streams, played by the product itself as its function; song titles/artist names appear as factual metadata in live API responses shown on screen.
8. Thumbnail: YouTube auto-frames are acceptable; if picking a custom frame, use the Beat 1 Trust Card lock moment or the coda three-locks frame.

## Step 2 — Verify (1 minute, do not skip)

- [ ] Open the video in a **private/incognito window** (signed out) — it must play. This proves "publicly visible."
- [ ] Duration badge reads **2:00** (and in any case under 3:00).
- [ ] Playback is not blocked/age-gated/region-locked.
- [ ] Copy the canonical URL (`https://www.youtube.com/watch?v=…`).

## Step 3 — Paste the URL into all three places

1. Devpost submission form → video field (required).
2. `docs/submission/PACKET.md` §5 (packet of record).
3. GitHub repo homepage field (see `REPO_SETTINGS.md`) — if the Render live-demo option is later approved, the homepage switches to the demo URL and the video stays in the README.

**Deadline discipline:** upload and paste **before Oct 23, 12:00 pm PT**. After the submission period ends, the form cannot be edited — a missing or wrong video URL cannot be fixed later.

---
*Prepared by Judge J-09, 2026-10-20; beat structure and metadata rewritten to Intent Lock by Lane G, 2026-10-21. Requirements quoted from the live Devpost overview and official rules, re-verified 2026-10-20.*
