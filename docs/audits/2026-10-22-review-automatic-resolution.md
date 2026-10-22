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
