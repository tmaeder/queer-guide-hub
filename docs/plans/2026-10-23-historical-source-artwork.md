# Archived importer artwork outcomes

Gaycities Wayback imports sometimes supply numeric Facebook Graph picture API references. Native probes have recorded JSON errors instead of artwork. The importer now excludes these references and records an explicit source limitation.

The bounded internal repair checks source identities, URLs, titles, occurrence dates and all supplied artwork. It removes only the matching API pointer and records source_unavailable with original hashes, observations and prior provenance. Human media edits, reviewer decisions, critical findings, alternative artwork and mismatched records are protected. Missing artwork remains a physical quality gap; scores, publication and safety fields are unchanged.

The repair job and scanner share this contract. Source, artwork, ownership or occurrence changes invalidate automatic outcomes. Repeated unchanged scans retain the outcome. Protected low-ID records cannot starve later repairs.

Validation: 51 parser tests and 30 disposable PostgreSQL source/ownership paths, plus dry run, real native scanner/decision functions, full-row preservation, idempotency and source-change invalidation. Production results will be recorded after native verification.

Production: the normal deployment pipeline applied the source contract and bounded iteration. A rolled-back native rehearsal passed whole-row protections. Cleanup corrected 4,379 invalid pointers, recording 4,378 original issue outcomes (one reference had no matching open issue). Native rescanning retained physical media_score=0 for all 4,379 and introduced no human reviewers. A concurrent scan exposed one deferred source outcome; the follow-up migration defers assessment while the repair lease/row is busy, verified using two real PostgreSQL sessions.

The normalizer also preserves blank/null coordinates instead of coercing them to zero; 22 shared pipeline tests cover missing values, explicit zero axes and numeric bounds. Full production E2E verification is running. Full suites now have a separate workflow concurrency group from focused retests.
