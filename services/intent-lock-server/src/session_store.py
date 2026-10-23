"""Intent Lock session store — Mcp-Session-Id minting + Last-Event-ID ring buffer.

Spec: MCP 2025-11-25, Streamable HTTP (stateful sessions over stateless HTTP).
Every SSE event the server emits carries a monotonic event id of the form
    <session_id>_<seq>
so a client that drops mid-outage can reconnect with GET /mcp + Last-Event-ID
and replay exactly the events it missed. The buffer is a bounded ring —
memory cost is O(sessions × RING_CAP), never O(history).
"""
from __future__ import annotations

import secrets
import threading
import time
from collections import deque
from dataclasses import dataclass, field
from typing import Any, Deque, Dict, List, Optional, Tuple

# Bounded per-session event history. 256 events is generous for a demo
# (phonetic SSE stage streams are ~10-20 events) and keeps worst-case
# memory at 256 * ~1KB * sessions.
RING_CAP = 256


@dataclass
class Session:
    session_id: str
    created_ms: int
    seq: int = 0
    events: Deque[Dict[str, Any]] = field(default_factory=lambda: deque(maxlen=RING_CAP))
    pending: Dict[str, Any] = field(default_factory=dict)  # per-session scratch (e.g. disambiguation candidates)
    lock: threading.Lock = field(default_factory=threading.Lock)


class SessionStore:
    """Thread-safe registry of MCP sessions and their SSE event rings."""

    def __init__(self) -> None:
        self._sessions: Dict[str, Session] = {}
        self._lock = threading.Lock()

    # -- lifecycle -----------------------------------------------------
    def mint(self) -> str:
        """Mint a cryptographically random session id and register it."""
        session_id = secrets.token_hex(16)  # 128 bits, CSPRNG
        session = Session(session_id=session_id, created_ms=int(time.time() * 1000))
        with self._lock:
            self._sessions[session_id] = session
        return session_id

    def get(self, session_id: str) -> Optional[Session]:
        with self._lock:
            return self._sessions.get(session_id)

    def terminate(self, session_id: str) -> bool:
        with self._lock:
            return self._sessions.pop(session_id, None) is not None

    # -- event ring ----------------------------------------------------
    def append_event(self, session_id: str, event_type: str, data: Any) -> str:
        """Append an event to the session ring; return its monotonic event id."""
        session = self.get(session_id)
        if session is None:
            raise KeyError(f"unknown session: {session_id}")
        with session.lock:
            session.seq += 1
            event_id = f"{session_id}_{session.seq}"
            session.events.append({"id": event_id, "type": event_type, "data": data})
            return event_id

    @staticmethod
    def _seq_of(event_id: str) -> Optional[int]:
        try:
            return int(event_id.rsplit("_", 1)[1])
        except (ValueError, IndexError):
            return None

    def replay(self, session_id: str, last_event_id: Optional[str]) -> List[Dict[str, Any]]:
        """Return events strictly newer than last_event_id (or all, if None/unknown)."""
        session = self.get(session_id)
        if session is None:
            return []
        with session.lock:
            if not last_event_id:
                return list(session.events)
            last_seq = self._seq_of(last_event_id)
            if last_seq is None:
                return list(session.events)
            return [e for e in session.events if (self._seq_of(e["id"]) or 0) > last_seq]


# Module-level singleton — one store per server process (single-owner lane).
store = SessionStore()
