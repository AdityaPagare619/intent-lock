# Changelog

## v1.0.0 — 2026-10-22

- Shipped Intent Lock as one deterministic MCP tool, `intent_lock`,
  over MCP 2025-11-25 with Streamable HTTP.
- Added the five-stage verification kernel and its three outcomes:
  `locked`, `tie_choice`, and `no_lock`. A tie is settled by a host
  pin that the server re-verifies.
- Included music verification plus the commerce and grocery catalog
  packs behind the same pipeline.
- Shipped the four-service demo: simulator, orchestrator, MCP server,
  and chaos/provider mock.
- Included the locked spec, protocol proof, offline guided
  walkthrough, and testing record.
- Final acceptance gate passed on the shipped tree: kernel suite
  10/10, replay 36 fixed with none still wrong or changed, saboteur
  battery 10/10, demo beats 5/5, and the rig left pristine.
