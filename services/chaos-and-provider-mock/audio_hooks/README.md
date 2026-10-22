# audio_hooks/ — 3-second chorus stems: the contract

## Tonight (Phase 1): synthetic placeholders
`GET /audio_hooks/{track_id}.wav` returns a **synthesized 3.0s tone** (22050 Hz,
mono, 16-bit WAV), deterministic per track id, with 50ms fades and a slight
vibrato. It is royalty-free *by construction* — no human performance, no
recording, no sample. The response carries `X-Hook-Placeholder:
synthetic-tone-phase4-replaces` so nothing downstream can mistake it for real
audio.

Why synthesize instead of silence: the disambiguation UI (3 vinyl cards fanning
out, "the second one!") needs *playable, distinguishable* audio to rehearse
against tonight. A tone per track is honest scaffolding; silence would be a lie
about the pipeline working.

## Phase 4: curated royalty-safe stems
Replace the synth with real 3-second stems:
- Original or royalty-free Bhojpuri / Hinglish / studio synth-vocal recordings
- **Metadata must carry the exact track titles** so the phonetic pipeline and
  the vinyl disambiguator work authentically on camera
- Keep filenames `{track_id}.wav` (or `.mp3`); the route serves whatever bytes
  are placed here — drop a real file in and the synth is bypassed
- Copyright rule (compliance checklist): no third-party trademarks or
  copyrighted music in the demo video without permission — the YouTube video
  must never be muted or the entry disqualified

## For the MCP server (Arjun)
Hook URL shape is stable across phases: `/audio_hooks/{track_id}.wav` on :9000.
E2's 3-second chorus stitcher consumes these URLs in `InputRequiredResult`
elicitation payloads. The placeholder header lets you assert in tests that
Phase-4 curation actually happened (`X-Hook-Placeholder` must be ABSENT in the
final demo).
