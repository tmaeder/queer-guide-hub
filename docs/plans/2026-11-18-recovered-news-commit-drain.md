# Commit recovered news after the quality worker approves it

Five source-recovered rows received fresh publish verdicts. The quality worker can approve a row before the reconciler sees pending_review, so collecting jobs only while clearing that status strands those rows in pending disposition.

Collect a bounded additional cohort of untouched machine approvals with the exact successful source-recovery contract and current publish policy. Preserve user notes, human revision/reviewer gates, quality settings, pauses and native committer publication gates. Report the additional ready count in dry runs. Do not rejudge or widen quality thresholds.

The native committer takes job IDs rather than staging IDs. Add an optional transaction-local ID filter that can only narrow its existing selection; default behavior remains unchanged. Reconciler calls scope all commits to rows it actually selected, intersect any inherited scope and restore it afterward. This prevents an older, unrelated eligible row in the same job from consuming a recovered row's slot. Preserve declared row-error isolation and unexpected exception behavior.

Extend the real PostgreSQL reconciler/committer fixture to reproduce approved-row stranding, prove exact ID scope, combined batch bounds, dry/pause/repeat behavior and unchanged manual, quality, source-contract and privilege gates. Include a same-job otherwise committable held row and scope restoration. Deploy only after the fixture passes and read back security settings and scheduled progress.
