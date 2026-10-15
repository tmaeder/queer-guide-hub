# Automated source combination and merge gap filling

## Operational behavior

The existing `pipeline-commit` entry point automatically combines already-matched
sources before dispatching to the per-type commit RPCs. Existing pipeline
schedules drive it (the read-only production check found 12 enabled commit pipelines, 11 scheduled); no separate polling process, external AI call, or per-record
network request is added. Ordinary high-confidence fills need no manual action.

One batched RPC loads pending sources, canonical descriptive fields, and up to
50 approved observations per entity from the last 90 days. A pure local planner
then produces field decisions. One batched write applies independent groups,
retaining source rows and evidence IDs. The database skips stale groups using a
snapshot comparison; unrelated groups continue. Records with no remaining gaps
generate no writes. SQL limits every pass to 500 pending rows and every write
batch to 500 groups. Two partial indexes support pending and historical reads.

The combiner uses existing dedup matches as identity evidence. It never guesses
identity from a name. Unmatched records continue through normal ingestion.
Historical observations must have the same committed target ID, approved AI
validation, and an automatic or approved review status.

## Decisions and safeguards

- Missing means absent, null, blank text, or an empty collection. Zero and false
  remain populated. Object fields fill per key; nonempty arrays remain atomic.
- Provider names are normalized before voting. Repeated scrapes and provider
  aliases get one vote per field, using the latest available observation.
- Trust uses the existing venue source weights, including Google 0.85, Wikidata
  0.75, OSM 0.70, website 0.60, unknown/LLM 0.50, and admin 1.0. LLM model/provider
  aliases share one identity. Unknown provider names cannot be assumed independent
  if their registry names are aliases; extend `source-identity.ts` when adding one.
- Agreeing independent sources combine using `1 - product(1 - weight)`. The
  automatic threshold is 0.85. This score is a heuristic, not a calibrated
  probability. OSM plus Wikidata gives 0.925; repeated OSM remains 0.70.
- Disagreement or insufficient confidence gates every contributing pending row
  as `pending_review`. The database enforces review decisions even if a caller
  omits the flag. No review gate is cleared by this system.
- Existing populated canonical values win. Corrections to populated values still
  use editorial review or existing specialized consensus workflows. This feature
  addresses gaps, not unrestricted source-driven replacement.
- Identity, ownership, publication, moderation, rights and safety fields are not
  automatically combined. Coordinates must be a complete, in-range pair from
  one observation. Partial existing pairs are left intact. Web links and image
  arrays are checked before automatic transfer.

The source combiner covers the registered content commit targets. The venue
truth engine retains its specialized accessibility and closure rules, and now
also normalizes provider identities and removes repeated-provider votes.

## Duplicate merges and undo

The three existing merge audit tables run a transactional field-transfer trigger.
This covers manual and automatic merge cores without replacing their relationship
moves, identity guards, redirects, or existing undo logic. Allowed gaps fill from
the merged donor; rejected/pending-review/safety-gated donors are excluded.
Cross-country location data, invalid coordinate pairs and rejected image data do
not transfer. Existing child rows and redirects follow the established cores.

`details.field_transfer` records policy version, donor ID/source/provenance, and
before/after values. Undo restores only contributions still equal to the recorded
values, preserving subsequent editor changes, including edits to sibling JSON
keys. Coordinate undo is atomic. Existing historical undo restrictions remain.

Import Hub's four-argument `merge_entities` RPC now delegates to reversible cores
and retains donors. Explicit permitted field selections are typed, validated,
and included in the same undo audit; field-update errors are surfaced.

The legacy fallback now fills a dedup-matched canonical organization, hotel, milestone or other supported entity through one atomic RPC instead of inserting another duplicate.

Incoming item commits use the same SQL gap semantics and attach field changes to
existing ingestion events. News records include their transfer in the existing
commit detail result; village commits now also write an ingestion event. Full
source observations remain in staging/source tables. Extraction merges retain
donor envelopes, including confidence; nested extraction fills retain both
source envelopes and use the lower confidence.

## Historical recovery preview

`preview_merge_gap_fill(type, keep_id, donor_id)` is an admin-only, read-only RPC.
It supports both proposed merges and historical donors already merged into the
selected survivor. It returns the validated patch and donor source, with
`requires_review: true`. It never invents missing historical relationship audits
or changes records. Historical recovery must use reviewed donor evidence; old
incorrect merges are not automatically trusted merely because they exist.

The initial read-only production audit on 2026-10-15 found potential recoveries:

| Field | Canonical records with a nonempty historical donor |
| --- | ---: |
| Venue address | 406 |
| Venue email | 314 |
| Venue description | 205 |
| Venue images | 208 |
| Venue coordinates | 165 |
| Marketplace website | 373 |
| City image | 59 |
| Event description | 13 |

These are unvalidated candidate counts, not promises of safe fills or counts of
changes made. Different fields can refer to the same canonical record.

## Verification and release

Run `npm run test:merge-policy` with PostgreSQL 17 binaries on PATH or `PG_BIN`.
The runner creates an isolated local cluster, exercises real venue merge/undo,
compiles all eight actual commit definitions from repository migrations, tests
source gates/snapshot checks, and benchmarks 100 groups against 30,000 historical
observations. It removes its temporary cluster afterward and never uses a remote
connection string. It also verifies that accepted combinations reach canonical
records and that already-filled records produce no new plans.

Run the focused Vitest and Deno tests for gap filling, source combination,
extraction, venue consensus, social links, and Import Hub. Deploy the database
migration before the updated `pipeline-commit` and `pipeline-consensus-merge`
functions. No new runtime dependency is introduced.

Inspect `ingestion_staging.enriched_data.source_combination` for decisions,
provider confidence, evidence staging IDs and review gates. Inspect merge audit
`details.field_transfer` and ingestion event `payload.field_transfer` for actual
field changes. Existing pipeline error reporting covers failed combination RPCs.
Local benchmarks are indicative; measure production load after release.
