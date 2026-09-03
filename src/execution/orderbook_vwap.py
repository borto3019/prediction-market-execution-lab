"""Execution cost from walking a limit order book.

Marketable orders do not fill at the touch. They consume depth level by level,
and the realised average price is worse than the best quote by an amount that
depends on size. Backtests that assume a fill at mid, or at the touch, silently
overstate edge — and on a venue where the edge per trade is a few cents, that
error alone can invert a strategy's sign.

This module computes what an order would actually have paid, given the book that
was standing at the time.

Conventions
-----------
Levels are ordered best-first: descending price for bids, ascending for asks.
Prices may be in any unit (dollars, probability, ticks) provided one unit is used
consistently; the caller owns that choice.

Partial fills are reported, never silently completed. If the book cannot support
the requested quantity, `filled` is less than `requested` and `is_complete` is
False. Returning an average price for an order that could not be filled — as if
the missing size were free — is the specific failure this design refuses.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable, Sequence


@dataclass(frozen=True)
class Level:
    """One price level. `size` is quantity available at `price`."""
    price: float
    size: float


@dataclass(frozen=True)
class Fill:
    """The outcome of walking a book for a requested quantity.

    Attributes
    ----------
    requested, filled : float
        Quantity asked for and actually obtainable.
    vwap : float | None
        Quantity-weighted average execution price, or None if nothing filled.
    touch : float | None
        Best available price before the walk — the naive assumption.
    slippage : float | None
        vwap - touch, signed in the direction that costs the taker: positive
        means "paid more than the touch" for a buy, and "received less" for a
        sell. Positive is always bad for the taker regardless of side.
    levels_consumed : int
        How deep the order had to reach.
    is_complete : bool
        Whether the book supported the full requested quantity.
    """
    requested: float
    filled: float
    vwap: float | None
    touch: float | None
    slippage: float | None
    levels_consumed: int
    is_complete: bool

    @property
    def fill_fraction(self) -> float:
        return 0.0 if self.requested <= 0 else self.filled / self.requested

    @property
    def notional(self) -> float:
        return 0.0 if self.vwap is None else self.vwap * self.filled


def _normalise(levels: Iterable[Level | tuple[float, float]]) -> list[Level]:
    out: list[Level] = []
    for lv in levels:
        price, size = (lv.price, lv.size) if isinstance(lv, Level) else (lv[0], lv[1])
        if size is None or price is None:
            continue
        # Zero and negative sizes are dropped rather than rejected: real feeds
        # carry emptied levels that have not yet been culled, and treating that
        # as a fatal error would make the function unusable on live data.
        if size <= 0:
            continue
        if price < 0:
            raise ValueError(f"negative price in book: {price}")
        out.append(Level(float(price), float(size)))
    return out


def walk_book(
    levels: Sequence[Level | tuple[float, float]],
    quantity: float,
    *,
    side: str = "buy",
    validate_order: bool = True,
) -> Fill:
    """Walk `levels` to fill `quantity`, returning the realised execution.

    Parameters
    ----------
    levels : best-first sequence of (price, size).
    quantity : requested quantity, must be > 0.
    side : "buy" consumes asks, "sell" consumes bids. Affects only the sign
        convention of `slippage`; the walk itself is identical.
    validate_order : if True, assert the levels are monotonic in the direction
        implied by `side`. A mis-sorted book produces a plausible-looking VWAP
        that is quietly wrong, so this defaults on.

    Examples
    --------
    >>> book = [(0.50, 100), (0.51, 100), (0.52, 100)]
    >>> f = walk_book(book, 150, side="buy")
    >>> round(f.vwap, 6), f.is_complete
    (0.503333, True)

    >>> walk_book(book, 1000, side="buy").is_complete
    False
    """
    if quantity <= 0:
        raise ValueError("quantity must be positive")
    if side not in ("buy", "sell"):
        raise ValueError("side must be 'buy' or 'sell'")

    book = _normalise(levels)
    if not book:
        return Fill(quantity, 0.0, None, None, None, 0, False)

    if validate_order:
        prices = [lv.price for lv in book]
        ascending = all(b >= a for a, b in zip(prices, prices[1:]))
        descending = all(b <= a for a, b in zip(prices, prices[1:]))
        expected = ascending if side == "buy" else descending
        if not expected:
            raise ValueError(
                f"{side} book is not sorted best-first "
                f"({'ascending' if side == 'buy' else 'descending'} expected)")

    touch = book[0].price
    remaining = quantity
    cost = 0.0
    consumed = 0

    for lv in book:
        if remaining <= 0:
            break
        take = min(remaining, lv.size)
        cost += take * lv.price
        remaining -= take
        consumed += 1

    filled = quantity - remaining
    if filled <= 0:
        return Fill(quantity, 0.0, None, touch, None, 0, False)

    vwap = cost / filled
    # Sign so that positive always means "worse for the taker".
    slippage = (vwap - touch) if side == "buy" else (touch - vwap)

    return Fill(
        requested=quantity,
        filled=filled,
        vwap=vwap,
        touch=touch,
        slippage=slippage,
        levels_consumed=consumed,
        is_complete=remaining <= 1e-12,
    )


def impact_curve(
    levels: Sequence[Level | tuple[float, float]],
    quantities: Sequence[float],
    *,
    side: str = "buy",
) -> list[Fill]:
    """Execution outcome across a range of sizes — the market-impact curve.

    The shape is the interesting part: flat while an order rests inside the top
    level, then stepping upward as it eats through depth. Where the curve turns
    is where size starts costing more than the edge being harvested.
    """
    return [walk_book(levels, q, side=side) for q in quantities]


def depth_available(levels: Sequence[Level | tuple[float, float]],
                    max_price: float | None = None,
                    *, side: str = "buy") -> float:
    """Total quantity obtainable, optionally within a price limit.

    With `max_price`, answers "how much can I get without paying worse than X" —
    the sizing question, rather than the cost question.
    """
    book = _normalise(levels)
    total = 0.0
    for lv in book:
        if max_price is not None:
            if side == "buy" and lv.price > max_price:
                break
            if side == "sell" and lv.price < max_price:
                break
        total += lv.size
    return total
