"""Normalisation centralisée des statuts opérationnels."""
from __future__ import annotations
from typing import Any


def normalize_status(value: Any) -> str:
    return (
        str(value or "")
        .strip()
        .upper()
        .replace("-", "_")
        .replace(" ", "_")
    )
