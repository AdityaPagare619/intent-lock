# chaos-and-provider-mock — the demo-guarantee harness (:9000)

A standalone FastAPI service that stands in for third-party music
providers so the demo is deterministic: real providers rate-limit,
blackout, and inject upsells at the worst possible moment; this harness
reproduces those failures on demand, labeled as simulation. It is also
the other end of the fault-injection contract — the ISP-blackout act
that proves Intent Lock's offline snapshot runs against it.
Product story: [root README](../../README.md).

- **Simulated:** the upstream providers (YouTube/Deezer/iTunes/Spotify
  stand-ins), the 30-track collision catalog (every entry `mock: true`),
  the fault scenarios, the audio-hook tones.
- **Real:** the HTTP service, the fault mechanics (real 401s, a real
  2000 ms blackout delay, the real `PAYWALL_UPSELL` payload shape), the
  dual-mode arming logic.

## Modes (`CHAOS_MODE` env)

| Mode | Behavior |
|---|---|
| `live_hybrid` (default) | Normal provider: catalog search + hook URLs. `X-Chaos-Fault` headers are **ignored** (logged). |
| `chaos_injection` | Armed. `X-Chaos-Fault` selects one deterministic fault per request. |

## Endpoints

| Method | Path | Notes |
|---|---|---|
| GET | `/health` | `{status: ok, mode, catalog_tracks: 30}` |
| GET | `/mode` | Mode, armed flag, valid faults |
| GET | `/catalog` | All 30 tracks (every entry `mock: true`) |
| GET | `/catalog/search?q=&locale=&limit=` | Provider-shaped response; honors `X-Chaos-Fault` when armed |
| GET | `/audio_hooks/{id}.wav` | Short synthetic hook tones (see `audio_hooks/README.md`) |

## Faults (`X-Chaos-Fault` header, honored only when armed)

- `upsell_trap` → injects `provider_notice: {type: PAYWALL_UPSELL, …}` when a result carries `upsellRisk`; otherwise a `chaos_note` explaining why nothing fired.
- `ghost_action` → an unprompted-action event the truth ledger must roll back.
- `token_expired` → HTTP 401, provider-shaped, with a `-32042` re-link hint.
- `isp_blackout` → exactly 2000 ms delay, then HTTP 503 `ISP_BLACKOUT`.
- Unknown value → HTTP 400 listing the valid faults.

## Run

Normal path is the repo front door (`make demo` from the repo root).
Standalone (Python 3.10+):

```bash
pip install -r requirements.txt
python src/app.py --port 9000                  # live_hybrid
CHAOS_MODE=chaos_injection python src/app.py   # armed
```
