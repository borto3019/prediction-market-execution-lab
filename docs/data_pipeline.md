# Data pipeline

## Collection

Two venues, two assets, continuously:

- **Kalshi** — full-depth L2 snapshots at 5-second resolution for the active
  15-minute BTC and ETH contracts, plus individual fills carrying the venue's
  `trade_id`, size, side and microsecond timestamp.
- **Kraken** — spot BTC and ETH order books at matching resolution.

Collectors run unattended under process supervision, with each asset isolated so
that one failing cannot take down the other.

## Identity and deduplication

Fills are deduplicated on the venue-assigned `trade_id` and nothing else.

The tempting alternative — `(instrument, timestamp, price, size, side)` — looks
like a natural key and is not one. Distinct trades legitimately share all five
fields. Measured on real venue data, deduplicating on that tuple removed **~7–9%
of genuine fills**: 1,230 of 17,654 rows in a single contract, and 265,855 of
2,958,307 across one day. Any pipeline that "dedupes" without a venue id is
quietly deleting data.

## Validation — fail closed

A collection run is validated on what reached disk, not on whether the fetch
returned 200. Structural checks only:

- the file exists and parses
- it has rows, and they are real fills rather than a synthesised fallback
- every fill carries a non-null, unique identifier
- instrument identifiers match the series that was requested, so one asset's
  file cannot be accepted in place of another's
- timestamps are neither stale nor in the future

There is deliberately **no minimum row count**. Traded volume varies with market
activity; a hard floor is either too low to catch anything or fires on quiet days
until somebody disables it. Integrity is asserted; volume is not.

## Gap and truncation recovery

Two distinct failures:

- **Missing** — no file for a day. Obvious.
- **Truncated** — a file exists and looks entirely valid, but covers only part of
  the day. This is the dangerous one: a collector whose connection drops
  mid-pagination exits cleanly and writes a well-formed file. Right name, right
  schema, readable.

Truncation is caught with two independent signals, because each misses what the
other finds. **Volume** against a trailing median catches gross loss but tolerates
±25% of legitimate daily variation. **Timestamp span** is far more stable —
mid-session venue maintenance removes records without moving either end of the
day — so it catches a day that lost 30% of its records and would pass the volume
test.

Anything flagged is refetched automatically inside the venue's retention window.
An infrastructure outage therefore costs nothing as long as it is repaired before
that window closes.

## Cross-venue alignment

The two venues run on unrelated clocks. Observations are paired with a
backward-only as-of join and an explicit staleness tolerance: an observation may
match reference data recorded at or before it, never after, and never older than
the tolerance.

Both halves matter. Backward-only prevents lookahead. The tolerance prevents a
stale snapshot being silently carried forward across a collection gap, which is
worse than a missing row because a gap is visible in the match report and
staleness is not.
