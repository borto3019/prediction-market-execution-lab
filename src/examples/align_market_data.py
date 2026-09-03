"""Aligning two asynchronous market-data streams without leaking the future.

A prediction-market quote and a spot order-book snapshot are produced by
different venues on different clocks and arrive at unrelated times. To study the
relationship you have to pair them, and the pairing rule is where lookahead bias
usually enters a research pipeline — quietly, and in a way that flatters results.

The rule here is backward-only by default: an observation at time t may be
matched to reference data stamped at or before t, never after. `direction="nearest"`
is available because it is sometimes correct (a purely descriptive study of clock
offsets, say), but it is not the default and using it in a predictive setting is
lookahead.

Depends only on pandas.
"""

from __future__ import annotations

from dataclasses import dataclass

import pandas as pd


@dataclass(frozen=True)
class AlignmentReport:
    """What the alignment did, so the caller can judge whether to trust it."""
    rows_in: int
    rows_matched: int
    rows_dropped: int
    max_gap_seconds: float | None
    median_gap_seconds: float | None

    @property
    def match_rate(self) -> float:
        return 0.0 if self.rows_in == 0 else self.rows_matched / self.rows_in

    def __str__(self) -> str:
        return (f"matched {self.rows_matched}/{self.rows_in} "
                f"({self.match_rate:.1%}), dropped {self.rows_dropped}, "
                f"median gap {self.median_gap_seconds}s, "
                f"max gap {self.max_gap_seconds}s")


def align_asof(
    left: pd.DataFrame,
    right: pd.DataFrame,
    *,
    left_time: str = "timestamp",
    right_time: str = "timestamp",
    tolerance_seconds: float = 2.0,
    direction: str = "backward",
    drop_unmatched: bool = True,
    suffix: str = "_ref",
) -> tuple[pd.DataFrame, AlignmentReport]:
    """As-of join `right` onto `left` within a bounded time tolerance.

    Parameters
    ----------
    tolerance_seconds : maximum age of a reference observation. Beyond this the
        row is unmatched rather than matched to something stale — an old
        snapshot silently carried forward is worse than a gap, because a gap is
        visible in the report and staleness is not.
    direction : "backward" (default, no lookahead), "forward", or "nearest".
    drop_unmatched : drop rows with no reference inside tolerance. Keep them
        (False) only if downstream handles NaN explicitly.

    Returns
    -------
    (aligned frame, AlignmentReport)

    Examples
    --------
    >>> import pandas as pd
    >>> mk = pd.DataFrame({"timestamp": pd.to_datetime(
    ...     ["2026-01-01 00:00:01", "2026-01-01 00:00:05"], utc=True), "p": [0.5, 0.6]})
    >>> ref = pd.DataFrame({"timestamp": pd.to_datetime(
    ...     ["2026-01-01 00:00:00", "2026-01-01 00:00:04"], utc=True), "mid": [100.0, 101.0]})
    >>> out, rep = align_asof(mk, ref, tolerance_seconds=2)
    >>> list(out["mid"])
    [100.0, 101.0]
    """
    if direction not in ("backward", "forward", "nearest"):
        raise ValueError("direction must be 'backward', 'forward' or 'nearest'")

    lf = left.copy()
    rf = right.copy()
    lf[left_time] = pd.to_datetime(lf[left_time], utc=True, errors="coerce")
    rf[right_time] = pd.to_datetime(rf[right_time], utc=True, errors="coerce")

    n_in = len(lf)
    lf = lf.dropna(subset=[left_time]).sort_values(left_time).reset_index(drop=True)
    rf = rf.dropna(subset=[right_time]).sort_values(right_time).reset_index(drop=True)

    if rf.empty or lf.empty:
        return lf.iloc[0:0] if drop_unmatched else lf, AlignmentReport(n_in, 0, n_in, None, None)

    # Keep the reference timestamp so the realised gap is measurable afterwards.
    rf = rf.rename(columns={right_time: f"{right_time}{suffix}"})
    rf[f"_join_{suffix}"] = rf[f"{right_time}{suffix}"]

    overlap = (set(lf.columns) & set(rf.columns)) - {left_time}
    rf = rf.rename(columns={c: f"{c}{suffix}" for c in overlap})

    merged = pd.merge_asof(
        lf, rf,
        left_on=left_time, right_on=f"_join_{suffix}",
        tolerance=pd.Timedelta(seconds=tolerance_seconds),
        direction=direction,
    )

    gap = (merged[left_time] - merged[f"{right_time}{suffix}"]).dt.total_seconds().abs()
    matched = int(gap.notna().sum())
    merged = merged.drop(columns=[f"_join_{suffix}"])

    report = AlignmentReport(
        rows_in=n_in,
        rows_matched=matched,
        rows_dropped=n_in - matched if drop_unmatched else 0,
        max_gap_seconds=None if gap.dropna().empty else round(float(gap.max()), 6),
        median_gap_seconds=None if gap.dropna().empty else round(float(gap.median()), 6),
    )

    if drop_unmatched:
        merged = merged[gap.notna()].reset_index(drop=True)
    return merged, report


def detect_gaps(times: pd.Series, expected_interval_seconds: float,
                tolerance_factor: float = 2.0) -> pd.DataFrame:
    """Find interruptions in a supposedly regular series.

    Returns one row per gap with its start, end and duration. Used to
    distinguish "the venue was quiet" from "the collector stopped", which look
    identical in the data and are very different operationally.
    """
    t = pd.to_datetime(pd.Series(times), utc=True, errors="coerce").dropna().sort_values()
    if len(t) < 2:
        return pd.DataFrame(columns=["gap_start", "gap_end", "gap_seconds"])
    delta = t.diff().dt.total_seconds()
    threshold = expected_interval_seconds * tolerance_factor
    idx = delta[delta > threshold].index
    return pd.DataFrame({
        "gap_start": t.shift(1).loc[idx].values,
        "gap_end": t.loc[idx].values,
        "gap_seconds": delta.loc[idx].round(3).values,
    }).reset_index(drop=True)
