# Corroborated internal city lifecycle recovery

The initial live worklist contained 2,113 city identity cases awaiting research,
719 venue cases awaiting research, and 651 RSS staging cases ready for review.
City placeholders were the largest actionable identity cohort. Research marked
some matching settlements ready, but never corrected their temporary lifecycle.

The owner authorized direct evidence-backed correction without routine input.
Resolve a placeholder into a real **internal** city only after current Wikidata
name, settlement classification, assigned country and coordinates agree, plus
the native country polygon matches. Use the existing source collector and native
slug allocator. Keep `seo_indexable=false`, all content and location fields,
and all relationships. This is identity verification, not publication approval.

Only no prior classification or the original machine-generated unresolved
classification qualifies. Positive prior classifications can represent deliberate
publication/lifecycle holds and are left for their owning workflow. Also refuse
human revisions, curated lifecycle/slug provenance, confirmation/force-review
flags, conflicting classifications, other canonical uses of the identity,
same-country namesakes, dissolved municipalities, changed records/fingerprints,
expired captures, hash mismatches and boundary conflicts.

The SQL operator defaults to dry run and takes at most 50 proofs; the runner
uses batches of 20. It honors the existing automatic-resolution pause state and
transaction lease. Every committed city has a full before/after repair journal
and ordinary native content revisions. Only the original lifecycle finding is
resolved; native geography evidence must independently become verified. Full-row
postconditions abort on unexpected changes. Rollback rehearsal exercises the
real production triggers without retaining mutations.

Source collection examined 540 placeholders with existing QIDs and produced
461 positive settlement proofs. These are candidate proofs, not resolved cases.
The first 209-proof dry run found 199 eligible records before an additional
refusal for previously deliberate positive classifications was added.

Validation: the actual SQL operator passes disposable PostgreSQL fixtures for
20 source/ownership cases, dry run, preserved fields, audit, source resolution
and idempotency. Four source-collector tests pass, including dissolved-place
refusal. A 20-record production rehearsal successfully applied the native
operations and rolled back all changes. Source collector Deno checking, runner
syntax checking and scoped ESLint pass.

Further findings: venue names often contain AgendaQ organizers rather than
physical locations. Existing physical-location-ID matching already handles its
safe cohort; broader name matching would mislink events. A fresh collector pass
over 132 real cities with unresolved classifications found just one positive
proof. Neither missing source evidence nor a research-to-blocked transition is
treated as a resolution.
