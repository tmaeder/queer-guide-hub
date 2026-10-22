# Automatic resolution of review dead ends

The user authorized direct, evidence-backed correction and resolution without
routine approval. This phase targets actual source findings, rather than changing
the displayed case count through classification or grouping.

Three approaches were considered: loosen quality thresholds, dismiss old cases
by age, or apply the existing machine verdict and applicability contracts. The
third approach preserves data quality and is the implemented design.

* RSS staging: apply only completed, confident machine gates with no requested
  manual review. Passing items must carry auto_publish=true and no blocked
  reasons; the existing batch committer retains duplicate and merge guards.
  Reject only explicit confident negative verdicts. Never attribute human review.
* Empty AI extraction: preserve the old decision in the repair journal and retry
  at most twice, six hours apart, only if source text exists. Queued retries are
  not counted as resolutions and cannot publish before a fresh quality verdict.
* City image search: discard candidates which failed the identity/asset gates.
  Keep the existing image or absence unchanged. Future failures have deterministic
  audit IDs, rather than creating pending human choices without valid candidates.
* Legacy homepage date proposals: discard suggestions extracted from bare
  publisher homepages, consistent with the current eventPageUrl source gate.
  Existing dates remain untouched and unverified. Event-specific evidence stays.
* Geography: an explicitly ghost, non-indexable city with no canonical or user
  relationships has a not_applicable verification, not a verified identity. Keep
  its original check in the repair journal. Reactivation or newly linked content
  reopens geography review; linked ghosts and all active places remain unchanged.

The sweep is service-only, independently pausable, bounded and serialized. The
existing five-minute worklist refresh invokes it. Every source disposition has a
before/after journal; originals remain recoverable. Dry runs perform no writes.
New private definer functions are inaccessible to browser roles. Regression
checks cover gate refusal, dry-run behavior, pause behavior, inactive applicability
and reopening when an archived place becomes active or acquires a venue.

Source recovery additionally reuses existing approved article text only when the
publisher, URL and title agree and there is exactly one canonical source record.
It never overwrites supplied content or treats recovered text as publication
approval. Legacy incomplete gates are retried under the same two-attempt bound.
Commit work is bounded across all source jobs, rather than multiplying the batch
limit by the number of jobs. Relationship inserts lock the verification row before
testing applicability, so a concurrent sweep cannot miss a newly linked record.
