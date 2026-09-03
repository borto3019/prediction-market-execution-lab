# Execution model

## Why fills are modelled, not assumed

Kalshi's 15-minute crypto binaries are thin. Top-of-book depth is frequently
smaller than a size worth trading, and the edge per contract is measured in
cents. A backtest that assumes a fill at mid, or even at the touch, is not
making a small optimistic error — it is frequently reversing the sign of the
result.

So every simulated fill is produced by walking the recorded book.

## The walk

Given best-first levels and a requested quantity, consume depth level by level
until the quantity is filled or the book is exhausted:

    vwap = Σ(price_i × taken_i) / Σ(taken_i)

Reported alongside it:

- **fill fraction** — the book often cannot supply the full size. Partial fills
  are reported as partial. Returning an average price for an order that could
  not be filled, as though the missing size were free, is the single most
  flattering error available here.
- **slippage vs touch** — signed so that positive always means worse for the
  taker, on either side.
- **levels consumed** — how deep the order reached.

`src/execution/orderbook_vwap.py` is the reference implementation.

## Break-even

For a binary bought at probability `p` with payout `q` and fee `f`, the win rate
required to break even is:

    w* = p + f/q

This is the decisive diagnostic. A candidate is not evaluated on whether its
realised win rate is high, but on whether it clears `w*` *after* fills are
priced at book-walk VWAP rather than at mid. Several candidates that looked
profitable at mid sit below `w*` once executed realistically.

Kalshi's fee is a function of price, maximised at `p = 0.5`, so the break-even
requirement is worst exactly where the contracts are most liquid.

## Sizing

Impact is measured across a range of sizes rather than at one point, because the
shape matters: flat while the order rests inside the top level, then stepping as
it eats through depth. Where the curve turns is where size begins costing more
than the edge being harvested — that is the sizing answer, and it is specific to
each contract and moment.
