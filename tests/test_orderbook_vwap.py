"""Tests for order-book execution modelling."""
from __future__ import annotations

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from execution.orderbook_vwap import (  # noqa: E402
    Level, depth_available, impact_curve, walk_book,
)

ASKS = [(0.50, 100), (0.51, 100), (0.52, 100)]
BIDS = [(0.49, 100), (0.48, 100), (0.47, 100)]


def test_fill_inside_top_level_pays_the_touch():
    f = walk_book(ASKS, 50, side="buy")
    assert f.vwap == 0.50
    assert f.slippage == 0.0
    assert f.levels_consumed == 1
    assert f.is_complete


def test_walking_two_levels_blends_prices():
    f = walk_book(ASKS, 150, side="buy")
    assert f.vwap == pytest.approx((100 * 0.50 + 50 * 0.51) / 150)
    assert f.levels_consumed == 2
    assert f.slippage > 0


def test_partial_fill_is_reported_not_completed():
    """The failure this design exists to prevent."""
    f = walk_book(ASKS, 1000, side="buy")
    assert not f.is_complete
    assert f.filled == 300
    assert f.fill_fraction == pytest.approx(0.3)
    assert f.vwap == pytest.approx(0.51)     # average of what WAS obtainable


def test_empty_book_fills_nothing():
    f = walk_book([], 10, side="buy")
    assert f.filled == 0 and f.vwap is None and not f.is_complete


def test_slippage_is_positive_when_costly_on_both_sides():
    """Sign convention: positive always means worse for the taker."""
    assert walk_book(ASKS, 250, side="buy").slippage > 0
    assert walk_book(BIDS, 250, side="sell").slippage > 0


def test_mis_sorted_book_is_rejected():
    """A mis-sorted book yields a plausible but wrong VWAP, so refuse it."""
    with pytest.raises(ValueError, match="sorted"):
        walk_book([(0.52, 100), (0.50, 100)], 150, side="buy")


def test_zero_size_levels_are_skipped_not_fatal():
    """Real feeds carry emptied levels; they must not break the walk."""
    f = walk_book([(0.50, 0), (0.51, 100)], 50, side="buy")
    assert f.vwap == 0.51 and f.is_complete


def test_accepts_level_objects_and_tuples_alike():
    a = walk_book([Level(0.5, 100), Level(0.51, 100)], 150, side="buy")
    b = walk_book([(0.5, 100), (0.51, 100)], 150, side="buy")
    assert a.vwap == b.vwap


@pytest.mark.parametrize("q", [0, -5])
def test_non_positive_quantity_rejected(q):
    with pytest.raises(ValueError):
        walk_book(ASKS, q)


def test_impact_curve_is_monotonic_in_size():
    """Cost per unit cannot improve as you demand more from the same book."""
    fills = impact_curve(ASKS, [50, 100, 150, 250], side="buy")
    vwaps = [f.vwap for f in fills]
    assert all(b >= a for a, b in zip(vwaps, vwaps[1:]))


def test_notional_and_fill_fraction():
    f = walk_book(ASKS, 100, side="buy")
    assert f.notional == pytest.approx(50.0)
    assert f.fill_fraction == 1.0


def test_depth_available_respects_price_limit():
    assert depth_available(ASKS, side="buy") == 300
    assert depth_available(ASKS, max_price=0.51, side="buy") == 200
    assert depth_available(BIDS, max_price=0.48, side="sell") == 200


def test_negative_price_rejected():
    with pytest.raises(ValueError, match="negative price"):
        walk_book([(-0.1, 100)], 10)
