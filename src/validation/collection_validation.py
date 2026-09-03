"""Fail-closed validation for a market-data collection run.

Written after an incident worth describing, because it shaped the design.

A collector fetched trade data every run and reported success every run. The
data was being written to a directory that was never persisted, so it was
destroyed when the job ended. This continued for weeks. Nothing was broken in a
way anything checked: the fetch genuinely succeeded, and the step genuinely
exited zero.

The lesson is that "the job ran" and "the data arrived" are different claims, and
only the second one matters. A pipeline that asserts the first is not monitored.
So this validates the artifact on disk, and exits non-zero when what should be
there is not.

The checks are structural, never volumetric. There is deliberately no minimum row
count: traded volume varies with market activity, so a hard floor is either set
so low it catches nothing, or it fires on genuinely quiet days until somebody
switches it off. What cannot legitimately vary is that the file exists, parses,
carries a unique identifier on every record, and covers the window requested.

Depends only on pandas.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pandas as pd


@dataclass
class ValidationResult:
    source: str
    checks: dict[str, bool] = field(default_factory=dict)
    stats: dict[str, object] = field(default_factory=dict)
    errors: list[str] = field(default_factory=list)

    @property
    def passed(self) -> bool:
        return bool(self.checks) and all(self.checks.values())

    def __str__(self) -> str:
        head = f"[{'PASS' if self.passed else 'FAIL'}] {self.source}"
        if self.passed:
            return f"{head}  {self.stats}"
        return f"{head}\n  failed: {[k for k, v in self.checks.items() if not v]}\n" \
               f"  errors: {self.errors}"


def validate_trade_file(
    path: str | Path,
    *,
    expected_prefix: str | None = None,
    id_column: str = "trade_id",
    time_column: str = "timestamp",
    required_columns: tuple[str, ...] = ("price", "size", "side"),
    max_age_hours: float = 48.0,
    now: datetime | None = None,
) -> ValidationResult:
    """Validate one collected trade file.

    Parameters
    ----------
    expected_prefix : if given, every instrument identifier must start with it.
        This is what stops one instrument's file being accepted in place of
        another's when a path or flag is crossed — a silent, plausible failure
        that no schema check catches.
    id_column : column carrying a venue-assigned unique fill id. Uniqueness here
        is the only sound basis for deduplication; see the note below.
    max_age_hours : how stale the newest record may be. Guards against a stale
        file being re-validated forever after collection has actually stopped.

    Note on identity
    ----------------
    It is tempting to deduplicate on (instrument, timestamp, price, size, side).
    That tuple is not unique. Distinct trades legitimately share all five, and
    deduplicating on it deletes real fills — measured at ~7-9% of rows on real
    venue data. Only a venue-assigned id is safe.
    """
    p = Path(path)
    now = now or datetime.now(timezone.utc)
    r = ValidationResult(source=p.name)

    if not p.is_file():
        r.checks["exists"] = False
        r.errors.append(f"file not found: {p}")
        return r
    r.checks["exists"] = True

    try:
        df = pd.read_parquet(p) if p.suffix == ".parquet" else pd.read_csv(p)
    except Exception as exc:
        r.checks["readable"] = False
        r.errors.append(f"unreadable: {exc}")
        return r
    r.checks["readable"] = True

    r.stats["rows"] = len(df)
    r.checks["has_rows"] = len(df) > 0
    if df.empty:
        r.errors.append("file contains zero rows")
        return r

    missing = [c for c in (id_column, time_column, *required_columns) if c not in df.columns]
    r.checks["required_columns"] = not missing
    if missing:
        r.errors.append(f"missing columns: {missing}")
        return r

    ids = df[id_column]
    n_null = int(ids.isna().sum())
    n_uniq = int(ids.nunique())
    r.stats["null_ids"] = n_null
    r.stats["unique_ids"] = n_uniq
    r.checks["ids_complete"] = n_null == 0
    r.checks["ids_unique"] = n_uniq == len(df)
    if n_null:
        r.errors.append(f"{n_null} rows have no {id_column}")
    if n_uniq != len(df):
        r.errors.append(f"{len(df) - n_uniq} duplicate {id_column} values")

    if expected_prefix is not None:
        inst = next((c for c in ("market_id", "market_ticker", "instrument", "symbol")
                     if c in df.columns), None)
        if inst is None:
            r.checks["instrument_matches"] = False
            r.errors.append("no instrument column to check prefix against")
        else:
            bad = int((~df[inst].astype(str).str.startswith(expected_prefix)).sum())
            r.stats["mismatched_instrument"] = bad
            r.checks["instrument_matches"] = bad == 0
            if bad:
                r.errors.append(f"{bad} rows are not {expected_prefix}*")

    ts = pd.to_datetime(df[time_column], utc=True, errors="coerce")
    n_bad = int(ts.isna().sum())
    r.checks["timestamps_parse"] = n_bad == 0
    if n_bad:
        r.errors.append(f"{n_bad} unparseable timestamps")

    if ts.notna().any():
        tmin, tmax = ts.min(), ts.max()
        r.stats["min_ts"] = tmin.isoformat()
        r.stats["max_ts"] = tmax.isoformat()
        r.stats["span_hours"] = round((tmax - tmin).total_seconds() / 3600, 2)

        age_h = (now - tmax).total_seconds() / 3600
        r.stats["age_hours"] = round(age_h, 2)
        r.checks["not_stale"] = age_h <= max_age_hours
        if age_h > max_age_hours:
            r.errors.append(f"newest record is {age_h:.1f}h old (limit {max_age_hours})")

        future_min = (tmax - now).total_seconds() / 60
        r.checks["not_future"] = future_min <= 10
        if future_min > 10:
            r.errors.append(f"newest record is {future_min:.1f} min in the future")
    else:
        r.checks["not_stale"] = False
        r.checks["not_future"] = False

    return r


def detect_truncation(
    row_counts: dict[str, int],
    span_hours: dict[str, float] | None = None,
    *,
    count_threshold: float = 0.6,
    min_span_hours: float = 18.0,
) -> list[tuple[str, str]]:
    """Find days that are present but incomplete.

    Truncation is the failure mode that looks like success: a collector whose
    connection drops mid-pagination exits cleanly and writes a *valid* file
    containing only what it managed to fetch. Right name, right schema, readable.

    Two independent signals, because each misses cases the other catches:

      count  -- a day far below its neighbours' median. Catches gross loss, but
                daily volume genuinely varies by ±25%, so the threshold has to
                be loose enough to miss partial truncation.
      span   -- elapsed time between first and last record. Far more stable than
                volume, because a mid-day venue outage removes records without
                moving either end. Catches a day that lost 30% of its records —
                which passes the count test — because the coverage is visibly short.

    Returns (key, reason) for each suspect day.
    """
    suspects: list[tuple[str, str]] = []
    counts = [c for c in row_counts.values() if c > 0]
    if len(counts) >= 3:
        median = sorted(counts)[len(counts) // 2]
        for k, c in row_counts.items():
            if c == 0:
                suspects.append((k, "missing"))
            elif c < median * count_threshold:
                suspects.append((k, f"low volume ({c:,} vs median {median:,})"))
    else:
        suspects.extend((k, "missing") for k, c in row_counts.items() if c == 0)

    if span_hours:
        flagged = {k for k, _ in suspects}
        for k, span in span_hours.items():
            if k not in flagged and span < min_span_hours:
                suspects.append((k, f"short span ({span:.1f}h)"))
    return suspects
