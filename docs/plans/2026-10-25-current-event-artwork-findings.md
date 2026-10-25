# Bind artwork findings to the current primary image

Image auditor findings can remain open after the offending primary URL has been removed or replaced. The normal event quality scanner now resolves only unreviewed machine media findings with a matching retained observation for an obsolete primary URL. It retains original observations, evidence, hashes and human decisions. Current-image defects and missing-artwork findings remain actionable.

The helper runs within the existing scanner lease, scope and batch limits. Row locks prevent a concurrent image change from invalidating the comparison, and skip locked rows avoid blocking other writers. Dry runs and null dry-run arguments do not write. The migration refuses scanner source drift atomically and adds no schedule or public write endpoint.

Validation: isolated PostgreSQL cases cover current/historical scope, batching, dry/null execution, permissions, review protections, exact evidence preservation, replay, concurrent event locks and atomic drift refusal. The existing production event scanner owns reconciliation after normal deployment.
