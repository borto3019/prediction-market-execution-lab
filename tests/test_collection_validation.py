"""Tests for fail-closed collection validation."""
from __future__ import annotations

import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pandas as pd
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from validation.collection_validation import (  # noqa: E402
    detect_truncation, validate_trade_file,
)

NOW = datetime(2026, 9, 2, 12, 0, tzinfo=timezone.utc)


def make(tmp, n=50, *, ids=True, unique=True, nulls=0, prefix="BTC", hours_ago=1.0):
    base = NOW - timedelta(hours=hours_ago)
    df = pd.DataFrame({
        "market_id": [f"{prefix}-{i % 5}" for i in range(n)],
        "timestamp": [base - timedelta(seconds=i) for i in range(n)],
        "price": [0.5] * n, "size": [1.0] * n,
        "side": ["yes" if i % 2 else "no" for i in range(n)],
    })
    if ids:
        vals = [f"id-{i}" for i in range(n)] if unique else ["same"] * n
        for i in range(nulls):
            vals[i] = None
        df["trade_id"] = vals
    p = tmp / "trades.csv"
    df.to_csv(p, index=False)
    return p


def test_healthy_file_passes(tmp_path):
    r = validate_trade_file(make(tmp_path), expected_prefix="BTC", now=NOW)
    assert r.passed, r.errors
    assert r.stats["unique_ids"] == 50


def test_missing_file_fails(tmp_path):
    r = validate_trade_file(tmp_path / "nope.csv", now=NOW)
    assert not r.passed and r.checks["exists"] is False


def test_empty_file_fails(tmp_path):
    r = validate_trade_file(make(tmp_path, n=0), now=NOW)
    assert not r.passed


def test_missing_id_column_fails(tmp_path):
    r = validate_trade_file(make(tmp_path, ids=False), now=NOW)
    assert not r.passed and r.checks["required_columns"] is False


def test_duplicate_ids_fail(tmp_path):
    r = validate_trade_file(make(tmp_path, unique=False), now=NOW)
    assert not r.passed and r.checks["ids_unique"] is False


def test_null_ids_fail(tmp_path):
    r = validate_trade_file(make(tmp_path, nulls=3), now=NOW)
    assert not r.passed and r.checks["ids_complete"] is False


def test_wrong_instrument_fails(tmp_path):
    """An ETH file must not satisfy a BTC validation."""
    r = validate_trade_file(make(tmp_path, prefix="ETH"), expected_prefix="BTC", now=NOW)
    assert not r.passed and r.checks["instrument_matches"] is False


def test_stale_file_fails(tmp_path):
    r = validate_trade_file(make(tmp_path, hours_ago=200), now=NOW)
    assert not r.passed and r.checks["not_stale"] is False


def test_future_timestamps_fail(tmp_path):
    r = validate_trade_file(make(tmp_path, hours_ago=-5), now=NOW)
    assert not r.passed and r.checks["not_future"] is False


def test_quiet_day_still_passes(tmp_path):
    """No volumetric floor: a thin but complete day is valid."""
    r = validate_trade_file(make(tmp_path, n=3), expected_prefix="BTC", now=NOW)
    assert r.passed, r.errors


def test_truncation_detected_by_low_volume():
    counts = {"d1": 1000, "d2": 1000, "d3": 1000, "d4": 200}
    assert ("d4", "low volume (200 vs median 1,000)") in detect_truncation(counts)


def test_truncation_detected_by_short_span_when_volume_passes():
    """The case the volume test misses."""
    counts = {"d1": 1000, "d2": 1000, "d3": 1000, "d4": 700}
    spans = {"d1": 24.0, "d2": 24.0, "d3": 24.0, "d4": 12.0}
    reasons = dict(detect_truncation(counts, spans))
    assert "short span" in reasons["d4"]


def test_full_span_quiet_day_not_flagged():
    counts = {"d1": 1000, "d2": 1000, "d3": 1000, "d4": 700}
    spans = {"d1": 24.0, "d2": 24.0, "d3": 24.0, "d4": 24.0}
    assert detect_truncation(counts, spans) == []


def test_missing_day_flagged():
    assert ("d3", "missing") in detect_truncation({"d1": 100, "d2": 100, "d3": 0, "d4": 100})
