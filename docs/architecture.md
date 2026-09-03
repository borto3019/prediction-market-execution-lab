# Architecture

## Shape

    Live venues  ->  Collection  ->  Data quality  ->  Research  ->  Paper forward  ->  Public
    (Kalshi,         (L2 + fills,    (identity,       (execution    (simulated       (sanitized
     Kraken)          continuous)     alignment,       cost,         execution,       dashboard)
                                      gap recovery)    features,     frozen rules)
                                                       search)

Every stage is separated from the next by an explicit contract, and the last
boundary — private to public — is enforced mechanically rather than by care.

## Collection tier

Long-running collectors on always-on hosts, under process supervision with
automatic restart. Each asset and venue runs as an isolated unit: a failure in
one cannot stop another. Scheduled jobs handle post-settlement fill sweeps, which
are batch-shaped rather than continuous.

Design constraint worth stating: the collection hosts are small. Anything
memory-hungry — dataframe work, figure rendering — is kept off them deliberately,
because a research job that exhausts memory on a collection host takes down data
capture that cannot be recovered afterwards.

## Data quality tier

Validation is fail-closed and runs on the artifact, not the exit code. Gap and
truncation detection compares each day against its neighbours on two independent
signals. Repairs are automatic within the venue's retention window.

The distinction the pipeline is built around: **"the job ran" and "the data
arrived" are different claims.** Only the second is asserted, because a pipeline
that asserts only the first can fail silently for weeks — which is exactly what
happened once, and is why the validation exists in this form.

## Research tier

Execution cost is modelled first, because on these instruments it determines the
sign of most results. Microstructure features are engineered on the aligned
cross-venue panel. Specification search runs over a pre-registered catalogue with
a global multiple-testing correction.

## Forward tier

Surviving candidates run in paper simulation against live data, evaluated
prospectively. Promotion and suspension follow rules fixed before the window
opened. `paper_only` and `real_orders=false` are invariants, asserted in
configuration and in tests.

## Public tier

The public surface is a static bundle. It is produced by an exporter that applies
an explicit allowlist, structural rules (extension, size, symlink rejection, path
containment), the sanitizer, a credential-shape scan, and then emits a manifest
of every file with its SHA-256.

The trust direction is one-way. The private system pushes; the public repository
holds no credential capable of reading anything private. If the public side were
fully compromised, the attacker would obtain a static site they could already
read.
