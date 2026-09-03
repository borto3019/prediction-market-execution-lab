"""Tests for cross-venue timestamp alignment."""
from __future__ import annotations

import sys
from pathlib import Path

import pandas as pd
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from examples.align_market_data import align_asof, detect_gaps  # noqa: E402


def ts(*s):
    return pd.to_datetime(list(s), utc=True)


def test_backward_join_never_uses_future_data():
    """The property that matters: no lookahead."""
    left = pd.DataFrame({"timestamp": ts("2026-01-01 00:00:03"), "p": [0.5]})
    right = pd.DataFrame({"timestamp": ts("2026-01-01 00:00:01",
                                          "2026-01-01 00:00:05"),
                          "mid": [100.0, 999.0]})
    out, _ = align_asof(left, right, tolerance_seconds=10)
    assert list(out["mid"]) == [100.0], "matched a future observation"


def test_tolerance_excludes_stale_reference():
    """A stale snapshot carried forward is worse than a visible gap."""
    left = pd.DataFrame({"timestamp": ts("2026-01-01 00:01:00"), "p": [0.5]})
    right = pd.DataFrame({"timestamp": ts("2026-01-01 00:00:00"), "mid": [100.0]})
    out, rep = align_asof(left, right, tolerance_seconds=2)
    assert out.empty and rep.rows_matched == 0 and rep.match_rate == 0.0


def test_report_measures_realised_gaps():
    left = pd.DataFrame({"timestamp": ts("2026-01-01 00:00:02",
                                         "2026-01-01 00:00:04"), "p": [1, 2]})
    right = pd.DataFrame({"timestamp": ts("2026-01-01 00:00:01",
                                          "2026-01-01 00:00:03"), "mid": [10.0, 11.0]})
    out, rep = align_asof(left, right, tolerance_seconds=5)
    assert rep.rows_matched == 2
    assert rep.max_gap_seconds == 1.0
    assert "matched 2/2" in str(rep)


def test_unmatched_rows_kept_when_requested():
    left = pd.DataFrame({"timestamp": ts("2026-01-01 00:00:00",
                                         "2026-01-01 01:00:00"), "p": [1, 2]})
    right = pd.DataFrame({"timestamp": ts("2026-01-01 00:00:00"), "mid": [10.0]})
    out, _ = align_asof(left, right, tolerance_seconds=2, drop_unmatched=False)
    assert len(out) == 2 and out["mid"].isna().sum() == 1


def test_empty_reference_yields_no_matches():
    left = pd.DataFrame({"timestamp": ts("2026-01-01 00:00:00"), "p": [1]})
    out, rep = align_asof(left, pd.DataFrame({"timestamp": [], "mid": []}))
    assert rep.rows_matched == 0 and out.empty


def test_unsorted_input_is_handled():
    left = pd.DataFrame({"timestamp": ts("2026-01-01 00:00:05",
                                         "2026-01-01 00:00:01"), "p": [2, 1]})
    right = pd.DataFrame({"timestamp": ts("2026-01-01 00:00:00",
                                          "2026-01-01 00:00:04"), "mid": [10.0, 11.0]})
    out, rep = align_asof(left, right, tolerance_seconds=5)
    assert rep.rows_matched == 2


def test_bad_direction_rejected():
    with pytest.raises(ValueError):
        align_asof(pd.DataFrame({"timestamp": ts("2026-01-01")}),
                   pd.DataFrame({"timestamp": ts("2026-01-01")}), direction="sideways")


def test_detect_gaps_finds_collection_outage():
    t = pd.Series(ts("2026-01-01 00:00:00", "2026-01-01 00:00:05",
                     "2026-01-01 00:10:00", "2026-01-01 00:10:05"))
    gaps = detect_gaps(t, expected_interval_seconds=5)
    assert len(gaps) == 1
    assert gaps.loc[0, "gap_seconds"] == pytest.approx(595.0)


def test_detect_gaps_quiet_when_regular():
    t = pd.Series(ts("2026-01-01 00:00:00", "2026-01-01 00:00:05",
                     "2026-01-01 00:00:10"))
    assert detect_gaps(t, expected_interval_seconds=5).empty
