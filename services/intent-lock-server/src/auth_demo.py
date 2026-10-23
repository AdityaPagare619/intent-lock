"""Layer D (doc 11): Two-Tier OAuth 2.1 — DEMONSTRATION grade.

Implements the exact wire shape Amazon's MCP Toolkit Authentication doc
specifies (read firsthand 2026-10-21), against a built-in demo identity
provider, so the protocol conformance is provable on this box:

  Tier 1  client_credentials, scope mcp:service  → initialize, tools/list,
          resources, health-class calls. No user. <=3600s, no refresh.
  Tier 2  authorization_code + PKCE (S256), scopes mcp:tools /
          mcp:resources → tools/call on behalf of a user.

Unauthenticated/invalid requests are answered with a BARE 401 — Amazon
explicitly does not support WWW-Authenticate headers — and there is no
DCR, no OIDC, no step-up, matching their support matrix.

This is NOT production auth: the client registry is one demo client, the
consent page is a labeled demo page, tokens are in-memory. The real
Alexa+ host brings Amazon's own authorization server; what is proven
here is that our endpoints speak the documented protocol. Demo mode is
OFF unless AUTH_MODE=demo (the shipped demo stack is unaffected).
"""

from __future__ import annotations

import base64
import hashlib
import os
import secrets
import time
from typing import Dict, Optional, Set

CLIENT_ID = os.environ.get("AUTH_DEMO_CLIENT_ID", "intent-lock-demo-client")
CLIENT_SECRET = os.environ.get("AUTH_DEMO_CLIENT_SECRET", "intent-lock-demo-secret")
SCOPES = ["mcp:service", "mcp:tools", "mcp:resources"]
TOKEN_TTL_S = 3600


def _b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


class DemoAuth:
    def __init__(self) -> None:
        self.tokens: Dict[str, Dict] = {}   # token -> {scopes, exp}
        self.codes: Dict[str, Dict] = {}    # code -> {challenge, scopes, exp, client_id}

    # -- Tier 1 -------------------------------------------------------------
    def client_token(self, client_id: str, client_secret: str,
                     scope: str, resource: str) -> Optional[Dict]:
        if client_id != CLIENT_ID or not secrets.compare_digest(
                client_secret or "", CLIENT_SECRET):
            return None
        wanted = set((scope or "mcp:service").split())
        if not wanted <= {"mcp:service"}:
            return None  # tier 1 is service-scope only, per the doc
        if not resource:
            return None  # the `resource` parameter is required
        return self._mint(wanted)

    # -- Tier 2 -------------------------------------------------------------
    def make_code(self, client_id: str, challenge: str, scope: str) -> str:
        code = secrets.token_urlsafe(24)
        wanted = set((scope or "mcp:tools").split()) & {"mcp:tools", "mcp:resources"}
        self.codes[code] = {
            "challenge": challenge, "scopes": wanted or {"mcp:tools"},
            "exp": time.time() + 600, "client_id": client_id,
        }
        return code

    def exchange_code(self, code: str, verifier: str) -> Optional[Dict]:
        entry = self.codes.pop(code, None)
        if not entry or entry["exp"] < time.time():
            return None
        digest = _b64url(hashlib.sha256((verifier or "").encode()).digest())
        if not secrets.compare_digest(digest, entry["challenge"] or ""):
            return None
        return self._mint(entry["scopes"])

    # -- shared ---------------------------------------------------------------
    def _mint(self, scopes: Set[str]) -> Dict:
        token = secrets.token_urlsafe(32)
        self.tokens[token] = {"scopes": set(scopes),
                              "exp": time.time() + TOKEN_TTL_S}
        return {"access_token": token, "token_type": "Bearer",
                "expires_in": TOKEN_TTL_S, "scope": " ".join(sorted(scopes))}

    def validate(self, authorization: Optional[str]) -> Optional[Set[str]]:
        if not authorization or not authorization.startswith("Bearer "):
            return None
        entry = self.tokens.get(authorization[7:].strip())
        if not entry or entry["exp"] < time.time():
            return None
        return entry["scopes"]


AUTH = DemoAuth()


def prm_document(base: str) -> Dict:
    """Protected Resource Metadata (RFC 9728)."""
    return {
        "resource": f"{base}/mcp",
        "authorization_servers": [base],
        "scopes_supported": SCOPES,
        "bearer_methods_supported": ["header"],
    }


def as_metadata(base: str) -> Dict:
    """Authorization-server metadata at /.well-known/oauth-authorization-server."""
    return {
        "issuer": base,
        "authorization_endpoint": f"{base}/oauth/authorize",
        "token_endpoint": f"{base}/oauth/token",
        "grant_types_supported": ["client_credentials", "authorization_code"],
        "code_challenge_methods_supported": ["S256"],
        "scopes_supported": SCOPES,
        "token_endpoint_auth_methods_supported": ["client_secret_basic"],
        "response_types_supported": ["code"],
    }
