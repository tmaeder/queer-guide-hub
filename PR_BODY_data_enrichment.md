## Context

Analysis of [awesome-public-datasets](https://github.com/awesomedata/awesome-public-datasets) for enriching, validating and correcting Queer Guide data — now and continuously. The catalog turned out to be the wrong lens (~600 entries, ~8 relevant, and it has decayed into SEO bait), so this is grounded in measurements against prod instead.

Design doc: `~/.claude/plans/swift-finding-cupcake.md`.

**Nothing here writes to prod on merge except the three migrations.** The backfill scripts are dry-run by default and their `--apply` path is blocked until `external_correction_audit` exists.

## P0 — three broken OSM paths, all found by reading prod

1. **`source-osm-venue` recorded UNKNOWN as ABSENT.** It did `if (res.ok) return json.elements ?? []`, so Overpass's own timeout signal — HTTP 200 with a `remark` — staged as *"this city has no queer venues."* Whole-metro bboxes against a 20s query timeout make that the expected failure for London and New York. It was the only one of four OSM integrations not importing `_shared/overpass.ts`, which exists precisely to classify this.

   The fetch half now lives in `_shared/overpass-fetch.ts`, where `null` means "we learned nothing" and `[]` means "Overpass answered and nothing is mapped". **Its own test caught a second instance of the same bug in the new code**: an unparseable 200 body reached `classifyOverpassResponse(200, null)`, which reads a missing element list as zero elements and answers `regional`. Fixed before it shipped.

2. **`venue-osm-enrich` deleted.** No cron, no registry row, no DAG node, no caller, and absent from `config.toml` so `verify_jwt` defaulted true. Verified on prod: **0 `enrichment_log` rows in its lifetime** — it never ran.

3. **`venue_accessibility_osm` cron retired.** Measured over the 916 venues it ever probed: 741 no-match (81%), 137 upstream-busy, **25 found (2.7%)**, 7 correctly-blocked ambiguous. It contributed 25 of the 31 venues carrying any accessibility value, against 26,876 with none, while spending 72 fires/day on a free public API — and eight straight hours of HTTP 504 on the day it was measured.

   The 2.7% is not evidence OSM lacks the data. It is evidence that asking Overpass one venue at a time on exact-name-within-60 m is the wrong shape — especially since the function **resolves an OSM element id and never persists it**, so every pass re-derives identity by name.

`check-pipeline-health.mjs` had no way to express a deliberate retirement: a retired row keeps the false-disable shape (recovered + still off) and would hard-fail CI for 14 days. A `[RETIRED` marker now moves such rows to the **warn** path — warn, not silent drop, and the claim has to be made in a reviewed migration.

## P1 — before-image audit + batch rollback

`unified_tags` was the **only** table with a generic revertible field-level audit. `venue_consensus_audit.winning_value` records what was written, never what it replaced. So a bad automated batch on venues/cities/events/countries was **unrevertible** — while the agreed posture is auto-correct-by-default.

`external_correction_audit` + `rollback_external_correction_batch()`. New vs `tag_change_log`: **`batch_id`**. Every existing audit is per-row, but a dataset refresh fails uniformly, so the unit of regret is the run.

Load-bearing, each guarded by a test:
- `before_value NOT NULL` — SQL NULL is stored as jsonb `'null'`, so "empty" stays distinct from "we failed to capture it".
- Resolution reuses `review_field_registry`, but **`apply_mode` is deliberately ignored**: one of its modes is `text_array_union`, and a rollback that merged would union the bad value back in.
- Rows whose live value moved on are **skipped and stamped** — `ORDER BY id LIMIT n` over a predicate a row can never satisfy otherwise wedges the drain.
- An unmapped `(entity_type, field)` refuses the **whole** batch and names it. Not theoretical: `venue.geo` already has a null `target_column`.

## P2 — deterministic coordinate joins

**Timezone.** The existing (disabled) RPC inherits the country zone and covers only 395 of 2,284 (17%); the other 1,889 are multi-zone, US alone 1,197.

Validation reported 98.13%, below the 99% bar the script refuses to write under. **The bar was not lowered.** 29 of the 41 disagreements were IANA aliases denoting the identical clock (`Europe/Kyiv`↔`Europe/Kiev`, `America/Nuuk`↔`America/Godthab`) — and in those cases *our stored value is the modern canonical name*. Comparing UTC offsets at four instants gives **99.45%**.

Of the 11 surviving disagreements, ~9 are ones where the **stored value is right and the lookup is wrong** (Kinshasa, the Chittagong Hill Tracts, Ciudad Juárez — own zone since 2022). Hence: same-region disagreements are reported and never auto-corrected. Only cross-continent ones are acted on; exactly one exists (Novosibirsk stored as `Europe/Berlin`).

**Ready: 1,336 fills + 1 correction.**

**Climate.** Empty on 4,985 of 5,489. Beck et al. (2023) 1 km Köppen, CC BY 4.0, present-day period pinned (the archive ships SSP projections in identically-named files). Exact-label comparison said 57.1%; family-level comparison says **80.2%** — most "disagreements" were the stored label being a correct-but-coarser parent.

The 18 real conflicts are **mostly same-name city collisions in our own data**: `San Luis` resolving to Argentina, `Pittsburg` carrying Pittsburgh PA's climate, `Frisco` carrying San Francisco's. Published as a namesake signal; **nothing auto-corrected**.

**Ready: 3,373 fills.**

**HDI: already complete** — all 57 nulls are correctly `data_unavailable` (North Korea, Somalia, Kosovo, French DOMs, Crown dependencies). Dropped from scope.

## Scheduled jobs — two paths that had shipped and never run

**Postal.** `geo_address_drain` runs every five minutes with zero failures and its queue was **empty**, while 2,872 venues with coordinates had no postal_code and no attempt marker. The queue is fed "by triggers and by backfill scripts" — triggers cover only new rows, scripts are one-shot. `run_geo_address_enqueue_backlog` is the missing third writer: a self-limiting hourly top-up.

- Depth counts only `attempts < 4`, or stuck rows pin the queue at "full" forever.
- Each arm excludes queued rows in its `WHERE`, not via `ON CONFLICT` — otherwise failed rows consume `LIMIT` slots every hour.
- **Events cut at one year**: 37,485 of 39,727 are older, and this corpus deliberately holds ~36.5k past Wayback events. Takes the job from 43,176 rows (~6 days of drain capacity) to **5,691 (~20 hours)**.

**Region.** Cities can't use that queue (`entity_type` CHECK excludes them), so this is a weekly workflow running the script that already existed. Scope is **724**, not the 2,097 it looks like — 1,373 are `tmp-` placeholder stubs the script excludes by design. Now audits under a `batch_id` and can read with the service key (CI has no anon secret).

Dispatch inputs go through `env:` and are expanded quoted, never interpolated into `run:`.

## Verification

- Edge suite **1078 passed / 0 failed**; 51 new guard assertions across 4 files.
- Every backfill validated against rows that already have a value, before proposing any write.
- Nothing applied to prod. `--apply` fails closed until the audit table exists.

## Notes for the reviewer

- Migrations were renumbered **twice** for ordering against concurrently-applied migrations. Re-read remote `max(version)` before merging.
- The venue corpus contains rows that aren't venues (tours, neighbourhoods, landforms) and at least one chimera (`Florence`: Colorado coordinates, Florence Italy's population). Logged, not patched.
- The recurring theme across all three phases was **shipped capability with an empty work list**, not missing capability.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
