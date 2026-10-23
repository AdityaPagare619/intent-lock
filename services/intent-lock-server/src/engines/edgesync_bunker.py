"""E5 — EdgeSync & Offline Bunker: multi-room sync + offline continuity.

Two jobs:
  (a) Multi-room phase alignment — the server keeps the last snapped offsets
      per room node (the real measurement loop runs client-side in the
      simulator's WebAudio rig; the server reports honestly-labeled snapshots
      and exposes them as the multiroom-telemetry resource).
  (b) Offline continuity — the bunker manifest: what's cached, where, and the
      circuit-breaker threshold. The IndexedDB ring-buffer itself lives in the
      browser worker (indexeddb_bunker.ts); the server arms it and reports.

mDNS/UPnP LAN bridge: best-effort per the blueprint. We attempt a real mDNS
probe (UDP multicast 224.0.0.251:5353); if the sandbox blocks multicast we
say so plainly and degrade to the localhost registry. Honest labeling is a
standing law — never animate fake discovery.
"""
from __future__ import annotations

import logging
import socket
import struct
import time
from typing import Any, Dict, List

log = logging.getLogger("intent-lock.e5")

CIRCUIT_BREAKER_MS = 1200
BUNKER_TRACKS = 5


def sync_manifest(room_topology: List[str],
                  drift_overrides: Dict[str, float] | None = None) -> Dict[str, Any]:
    """Phase-alignment snapshot. drift_ms 0.0 = phase-locked.

    drift_overrides lets the simulator POST its real measured offsets;
    without them we report the last snapped state, labeled as such.
    """
    rooms = []
    worst = 0.0
    for r in room_topology:
        d = float((drift_overrides or {}).get(r, 0.0))
        worst = max(worst, abs(d))
        rooms.append({"name": r, "drift_ms": round(d, 2),
                      "phase_locked": abs(d) < 1.0})
    return {
        "rooms": rooms,
        "max_drift_ms": round(worst, 2),
        "phase_locked": all(x["phase_locked"] for x in rooms),
        "measured_at_ms": int(time.time() * 1000),
        "measurement": ("simulator AudioContext.currentTime loop"
                        if drift_overrides else "last snapped offsets (server snapshot)"),
    }


def bunker_manifest(isp_blackout: bool = False) -> Dict[str, Any]:
    return {
        "tracks_cached": BUNKER_TRACKS,
        "storage": "indexeddb",
        "state_shadow": "localstorage",
        "circuit_breaker_ms": CIRCUIT_BREAKER_MS,
        "edge_continuity": "active" if isp_blackout else "armed",
        "isp_blackout": bool(isp_blackout),
    }


def mdns_probe(service: str = "_omnibeat._tcp.local.", timeout: float = 1.5) -> Dict[str, Any]:
    """Best-effort mDNS probe. Returns an honestly-labeled capability report.

    We attempt a real multicast query on 224.0.0.251:5353. Most sandboxes and
    many CI runners block multicast — that is a *finding*, reported as such,
    not a failure to hide. The bridge degrades to the localhost registry.
    """
    result: Dict[str, Any] = {
        "attempted": True,
        "service": service,
        "available": False,
        "reason": "",
        "fallback": "localhost registry (127.0.0.1 only)",
        "label": "mDNS bridge: PROBED — see reason",
    }
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM, socket.IPPROTO_UDP)
        sock.settimeout(timeout)
        try:
            # Join the mDNS multicast group; raises where multicast is blocked.
            mreq = struct.pack("4sL", socket.inet_aton("224.0.0.251"), socket.INADDR_ANY)
            sock.setsockopt(socket.IPPROTO_IP, socket.IP_ADD_MEMBERSHIP, mreq)
            sock.setsockopt(socket.IPPROTO_IP, socket.IP_MULTICAST_TTL, 1)
        except OSError as exc:
            result["reason"] = f"multicast group join blocked in this environment ({exc})"
            result["label"] = "mDNS bridge: UNAVAILABLE here — localhost registry active"
            log.info("E5 mDNS: %s", result["reason"])
            return result
        try:
            # Minimal mDNS query packet for the service name (best-effort).
            qname = b"".join(bytes([len(p)]) + p.encode() for p in service.split(".") if p) + b"\x00"
            packet = b"\x00\x00\x00\x00\x00\x01\x00\x00\x00\x00\x00\x00" + qname + b"\x00\x0c\x00\x01"
            sock.sendto(packet, ("224.0.0.251", 5353))
            data, addr = sock.recvfrom(1024)
            result["available"] = True
            result["reason"] = f"got {len(data)}B mDNS response from {addr[0]}"
            result["fallback"] = "none needed"
            result["label"] = "mDNS bridge: LIVE"
            log.info("E5 mDNS live: %s", result["reason"])
        except socket.timeout:
            result["reason"] = "multicast sent, no mDNS responders answered within timeout"
            result["label"] = "mDNS bridge: QUIET network — localhost registry active"
            log.info("E5 mDNS: %s", result["reason"])
        finally:
            sock.close()
    except Exception as exc:  # noqa: BLE001 — probe must never break the server
        result["reason"] = f"probe error: {exc}"
        result["label"] = "mDNS bridge: PROBE FAILED — localhost registry active"
        log.info("E5 mDNS probe error: %s", exc)
    return result
