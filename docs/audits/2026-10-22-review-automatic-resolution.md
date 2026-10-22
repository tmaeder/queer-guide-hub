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
