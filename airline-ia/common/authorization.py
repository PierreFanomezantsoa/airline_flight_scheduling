from __future__ import annotations

import base64
from functools import wraps
import hashlib
import hmac
import json
import os
import time
from typing import Callable

from flask import g, jsonify, request


def _read_session_payload() -> tuple[dict | None, tuple | None]:
    authorization = request.headers.get("Authorization", "")
    if not authorization.startswith("Bearer "):
        return None, (jsonify({"message": "Session requise."}), 401)

    token_parts = authorization[len("Bearer "):].strip().split(".")
    if len(token_parts) != 2:
        return None, (jsonify({"message": "Session invalide."}), 401)

    encoded, supplied_signature = token_parts
    secret = os.getenv("AUTH_SECRET")
    if not secret:
        return None, (jsonify({"message": "AUTH_SECRET doit être configuré."}), 500)

    try:
        encoded_bytes = encoded.encode("ascii")
        expected_signature = base64.urlsafe_b64encode(
            hmac.new(secret.encode("utf-8"), encoded_bytes, hashlib.sha256).digest()
        ).rstrip(b"=").decode("ascii")
        if not hmac.compare_digest(supplied_signature, expected_signature):
            return None, (jsonify({"message": "Session invalide."}), 401)

        padding = "=" * (-len(encoded) % 4)
        payload = json.loads(base64.urlsafe_b64decode(encoded + padding))
    except (ValueError, TypeError, UnicodeError, json.JSONDecodeError):
        return None, (jsonify({"message": "Session invalide."}), 401)

    if (
        not isinstance(payload, dict)
        or not isinstance(payload.get("sub"), str)
        or not isinstance(payload.get("exp"), (int, float))
        or time.time() * 1000 >= payload["exp"]
    ):
        return None, (jsonify({"message": "Session expirée ou invalide."}), 401)

    return payload, None


def require_session():
    """Valide la session Nest pour les routes Flask de consultation."""
    payload, error = _read_session_payload()
    if error:
        return error
    g.session_payload = payload
    return None


def require_roles(*allowed_roles: str) -> Callable:
    """Valide le jeton signé par Nest et autorise uniquement les rôles listés."""
    def decorator(view: Callable) -> Callable:
        @wraps(view)
        def wrapped(*args, **kwargs):
            error = require_session()
            if error:
                return error
            payload = g.session_payload

            if payload.get("role") not in allowed_roles:
                return jsonify({"message": "Rôle non autorisé pour cette opération."}), 403

            return view(*args, **kwargs)

        return wrapped

    return decorator