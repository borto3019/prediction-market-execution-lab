# Methodology

## What is being claimed

Nothing about demonstrated alpha. Read the labels precisely:

| category | meaning |
|---|---|
| **Live-collected** | Order books and fills recorded continuously from public venue APIs. Real observations. |
| **Simulated execution** | Every fill price shown anywhere in this project. Orders are walked against the book standing at decision time. No real orders have ever been placed. |
| **Paper-forward** | Candidates evaluated prospectively against a specification frozen before the window opened. Still simulation. |
| **Historical / in-sample** | The specification search. This is the *input* to a multiple-testing correction, not evidence of edge. |

## Pre-registration

Before a forward window opens, the hypothesis catalogue is serialised and hashed
(SHA-256), and the hash is committed. Evaluation happens afterwards.

The point is to make one specific cheat impossible: adjusting the hypothesis set
after seeing which candidates performed well. If the catalogue hash does not
match at evaluation time, the cycle is invalid. The hash is verified with
line-ending normalisation, because a checkout artefact must not be mistakable for
tampering — nor tampering for a checkout artefact.

## Multiple testing

Searching thousands of specifications guarantees some will look excellent by
chance. The relevant question is never "is this specification profitable in
sample" but "does anything survive correction across everything that was tried".

A global search-adjusted p-value is computed across the full catalogue for the
cycle. Candidates are promoted only if they clear a threshold fixed in advance.

**Result to date on BTC: nothing has cleared it.** Across 2,410 attempted
specifications (2,236 evaluating cleanly), no candidate has met the promotion
threshold in any cycle. Individually attractive results have not survived the
correction. That null is reported because it is the honest output of the
procedure, and because a search of this size that produced no null would be more
suspicious than one that did.

## Interim cycles

A cycle whose clean-data window is shorter than the required minimum is marked
INTERIM and cannot promote, regardless of what it found. Promotion requires both
statistical clearance and sufficient fresh data.

## Forward governance

Candidates in paper-forward evaluation are governed by a suspension policy fixed
in advance. Conditions cover cumulative loss, sample size relative to the
approving holdout, drawdown against the replay baseline, break-even shortfall and
a bootstrap on mean profitability.

Suspension is mechanical. When the conditions fire, the candidate is suspended
and its public page is withdrawn — no discretionary override, and the decision
record is sealed with the policy version that was in force at the time.

One candidate has been suspended under this policy after forward failure. Its
record is retained rather than deleted, because a governance system that keeps
only its successes is not a governance system.

## Break-even as the primary diagnostic

For a binary at probability `p`, payout `q`, fee `f`:

    w* = p + f/q

Candidates are assessed on realised win rate against `w*` with fills priced at
book-walk VWAP. This is more informative than PnL alone: it separates "this was
unlucky" from "this could never have worked at these prices".
