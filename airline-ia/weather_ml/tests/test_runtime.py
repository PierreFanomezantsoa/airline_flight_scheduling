from datetime import datetime, timezone

from weather_ml.runtime import _risk_level, _utc


def test_utc_naive():
    dt = _utc(datetime(2026, 1, 1, 12, 0, 0))
    assert dt.tzinfo is not None


def test_risk_levels():
    assert _risk_level(0.10)[0] == "LOW"
    assert _risk_level(0.35)[0] == "MODERATE"
    assert _risk_level(0.55)[0] == "HIGH"
    assert _risk_level(0.75)[0] == "SEVERE"
    assert _risk_level(0.90)[0] == "EXTREME"
