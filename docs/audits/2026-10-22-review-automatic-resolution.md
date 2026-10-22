# Review automatic resolution verification

The first live sweep recorded 344 archived unused geography checks as
not_applicable, rejected 135 unsupported homepage date proposals and 126 failed
city-image proposals, and queued 70 empty extraction retries. These are source
dispositions, not a claim that 605 independent ready cases disappeared.

A second pass recovered missing source text in 54 RSS staging rows from existing
approved canonical articles, with matching publisher, URL and title. No recovered
row had an ambiguous canonical URL. Another 43 incomplete legacy quality gates
were queued for a fresh verdict. Further ticks can find additional eligible rows.
Retries and source recovery are not counted as resolved decisions.

A native quality-enhance request with batch 60 encountered an HTTP 504 idle
timeout. Partial writes and background processing continued. Early counts mixed
legacy verdict values with fresh ones; final dispositions were therefore checked
instead. At verification time the touched set included 54 machine rejections and
four automatic committed updates. An additional approved update is excluded from
the automation count. The native quality pipeline remains responsible for fresh
publication verdicts; no thresholds, approval flags or budget gates were relaxed.

The production database regression transaction passed and rolled back all its
fixtures. It exercises manual/low-confidence/malformed/missing gate refusal,
blocked-image refusal, browser-role restrictions, dry-run and pause behavior,
inactive-city applicability, reactivation and insertion of a linked venue. The
last two checks assert that geography reopens and identity is not falsely verified.

Local validation: nine geography UI tests, 92 review contract tests, PostgreSQL
grammar/body checks, endpoint Deno typecheck, ESLint, the TypeScript ratchet
(698 existing errors, none new), and a production build. Security advisors show
no new findings relative to the pre-change baseline.

The city-image producer is deployed directly and keeps deterministic, rejected
machine attempt records instead of manufacturing pending choices. The missing
image itself is not claimed to be repaired. Event dates and city identities stay
unchanged by proposal rejection. Archived geography retains original evidence in
the repair journal and reopens on lifecycle or relationship changes.

Applied migration files are recovered at the exact versions recorded by Supabase:
20261022180826, 20261022181726, 20261022182128, 20261022182611 and 20261022182915.
No applied history is replayed or renumbered. The final source and UI changes must
still pass the ordinary PR and deployment gates.

The first CI run found that the schema drift scanner only recognizes literal
trigger declarations. A final pending migration explicitly recreates the same
23 loop-generated attachments, preserving the guard and making rebuilds easy to
audit. The already-applied matching-stream migration 20261022181530 was recovered
verbatim so its staging outcome trigger is also represented. No baseline was
expanded and no schema drift check was weakened.

A live worklist union rebuild later exceeded its 90-second budget. The source
recovery helper measured 1.15 seconds independently. An independent five-minute
sweep schedule was activated so repairs commit even when a worklist rebuild
fails. The final pending migration removes the old nested sweep call, updates
its schedule metadata, and recreates the same trigger attachments explicitly.


Follow-up: preserve exact applied migration 20261022190025. Its change-only
upsert retains all grouped case IDs, including unchanged cases, so a skipped
UPDATE cannot retire an active case. A live probe retained 6,052 active cases
and completed in 87.2 seconds. A later scheduled run exceeded even 180 seconds
under concurrent database load; this is not evidence of a fast rebuild. The
independent source sweep remains separate and has completed successfully.
The operational 180-second worklist budget is codified below its five-minute
cadence while the slow union is investigated. PR #4565 merged with all required
checks passing; frontend deployment succeeded. Backend migrations succeeded,
but the function deployment encountered a container registry rate limit and
is being retried.


The larger live dry-run exposed why the archived-city sweep could still be
slow: its planner ran the volatile relationship helper before joining the
verification status, probing 1,026 ghost cities rather than 26 candidates.
A scan-once relationship set completed in 2.57 seconds and produced zero
eligibility differences against the original helper for all 26 candidates.
Migration 99991792698026 changes only candidate selection. It preserves every
historical relationship type and the existing post-lock helper check, which
remains authoritative before disposition. A temporary compiled copy of the
entire updated worker completed a live dry-run successfully; no permanent
production function was changed during the coordinated schema pause.


A further detector check found 81 open LIVENESS_STALE issues that the current
native event detector no longer emitted. All 81 were resolved with complete
before/after journals and zero changes to the original issue evidence. The
unapplied worker patch now repeats this reconciliation for untouched native
findings only, locking both event and issue and checking the detector again
after the lock. It does not verify event liveness or alter dates. Rolled-back
regressions verify dry-run, successful resolution, retained current findings,
human-touched and external-detector refusal, evidence preservation and audit
provenance. Fixtures include explicit evidence hashes and serialize with the
worker lease to avoid conflicting with a scheduled sweep.


Catch-up window from 19:18 UTC: 21 existing native quality API batches processed
503 rows with zero processing failures (53 passed verdicts, 239 rejected verdicts,
211 review verdicts). Final dispositions were checked separately: 44 automatic
inserts, 11 automatic updates and 35 terminal rejections were observed in this
window; a further human-approved update is excluded. Verdict totals are not
claimed as terminal resolutions. Continued ingestion left two newly eligible
unjudged rows after the bounded catch-up completed. At 19:58 UTC the actual UI
worklist reported 1,797 ready, 3,250 research and 805 blocked; the 81 cleared liveness
findings were no longer active cached cases. The source corrections are real;
blocked/research outcomes are not counted as resolved decisions.


The final locked-row relationship probe also lacked an index for
news_articles.city_ids containment. A production read-only EXPLAIN confirmed a
sequential scan taking 102.36 ms for an absent city. On the same temporary copy,
the identical lookup took 9.863 ms without an index and 0.060 ms with GIN, using
Bitmap Index Scan. The pending optimization adds that index for the remaining
per-record rechecks and relationship triggers. These temporary-copy timings
are not claimed as production post-deployment measurements.

GIN array containment support was checked against the [PostgreSQL 17 manual](https://www.postgresql.org/docs/17/gin.html#GIN-BUILTIN-OPCLASSES). The index build uses a five-second lock budget.
