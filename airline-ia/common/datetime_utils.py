"""Utilitaires de date/heure partagés par les modules métier."""
from __future__ import annotations

from datetime import datetime, timezone
from functools import lru_cache
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from data.airports import get_airport_timezone


def ensure_utc(dt: datetime | None) -> datetime | None:
    """Normalise une date en UTC sans dupliquer cette logique dans les routes."""
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


@lru_cache(maxsize=256)
def get_cached_timezone(airport_code: str):
    if not airport_code:
        return timezone.utc
    tz_str = get_airport_timezone(airport_code.strip().upper())
    try:
        return ZoneInfo(tz_str) if tz_str else timezone.utc
    except ZoneInfoNotFoundError:
        return timezone.utc


def format_to_local_time(dt: datetime | None, airport_code: str | None) -> str | None:
    if not dt or not airport_code:
        return None
    dt_utc = ensure_utc(dt)
    return dt_utc.astimezone(get_cached_timezone(airport_code)).isoformat()
