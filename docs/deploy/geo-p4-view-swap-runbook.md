# Geo P4 — table→view swap runbook

**Status: REHEARSED, not executed. Needs a freeze window.**

P0–P3 are live (see `docs/plans/2026-07-25-geo-hierarchy-unification.md`). P4 replaces
`cities` / `countries` / `queer_villages` with views over the spine, making
`geo_places` + the satellites the single physical source of truth and retiring the
dual-write.

## Rehearsal — 2026-08-01

The villages swap was run end-to-end in an isolated `geo_p4_rehearsal` schema
(copies of `geo_places` + `geo_village_profiles`, all 190 villages), verified, and
torn down. Production was not modified. The proven statements are in
**[`geo-p4-villages-swap.sql`](./geo-p4-villages-swap.sql)** — execute that rather
than composing SQL live in the window.

Verified there: column-shape parity 36/36 (exact type *and* ordinal match),
INSERT/UPDATE/DELETE through the view, ancestor derivation, ON DELETE CASCADE to
the profile.

Three things the rehearsal caught that would each have cost real time at 8am:

1. **`latitude`/`longitude` need an explicit `::double precision` cast.** The spine
   stores `numeric`; the old table exposed `double precision`. Without the cast the
   view's types drift silently under ~137 client call sites.
2. **The `INSTEAD OF` INSERT depends on `trg_geo_places_derive` surviving.** It fills
   `parent_type` — which a CHECK requires to travel with `parent_id` — plus the
   derived ancestors. Absent it, every insert fails `geo_places_parent_pair_chk`.
3. **The DELETE cascade depends on the composite FK** `(place_id, place_type) →
   geo_places(id, place_type) ON DELETE CASCADE`. It exists in production; the
   rehearsal surfaced it because `CREATE TABLE ... LIKE INCLUDING ALL` does not copy
   foreign keys, so the profile row outlived its spine row until the FK was added.

Scope note: villages has only **2** dependent views (`geo_integrity_violations`,
`triage_src_quality_village`) of the 8 across all three types — which is why it goes
first.

## Why this one needs a human-scheduled window

Every earlier phase was incremental and reversible — each step shipped behind a
verification and could be rolled back in minutes (and once, was). P4 is not:

1. **It is a `DROP TABLE`.** Recovery from a bad swap means restoring from backup,
   not reverting a migration.
2. **Eight views depend on these tables**, so the drop needs `CASCADE` and all
   eight must be recreated inside the same transaction. Miss one and an admin or
   discovery surface breaks silently.
3. **Other agent sessions write to this database concurrently.** During the P0–P3
   work alone, unrelated sessions landed guides, affiliate, DAM and rebrand
   migrations. A migration landing mid-swap, or an INSTEAD OF trigger meeting a
   write pattern it did not anticipate, is the realistic failure mode — and it is
   not one that care on my side prevents.

So: pick a window, confirm no other session is mid-migration, then execute.

## Gates — all must read 0 immediately before starting

```sql
select jsonb_pretty(public.geo_p4_preflight());
```

| Gate | Meaning |
|---|---|
| `safety_parity_mismatches` | Spine vs typed `location_is_high_risk` over every pair in use. **Non-zero = stop.** LGBTQ+ users in criminalizing countries depend on this. |
| `spine_drift` | Mirror fidelity. Non-zero = the swap would freeze wrong data in place. |
| `external_fks_on_typed` | Must stay 0 — P2 moved all 62 to the satellite PKs. |

Re-run the pre-flight **at window time**, not from this document: the schema changes
under concurrent sessions, and `swap_workload` below is a snapshot.

## Swap workload (snapshot 2026-07-27 — re-verify)

> Snapshot drift is real and expected: by 2026-08-01 a `trg_erq_cascade` trigger had
> appeared on both `cities` and `queer_villages` (8 triggers → 10) from unrelated
> entity-review-queue work. That is exactly why the pre-flight is a function you
> re-run, not a number you read here.

**Triggers still on the typed tables (8).** The three `trg_sync_geo_spine` are
dropped (the mirror becomes the source). The five BEFORE triggers must be
re-created on the spine — they were deliberately left in place because they
mutate `NEW` before the typed row is written, so moving them earlier would have
broken `NOT NULL` on `slug`:
`trg_cities_slug`, `trg_cities_normalized`, `trg_countries_slug`,
`trg_countries_normalized`, `sanitize_website_before_upsert`.

**Dependent views (8)** — drop + recreate in-transaction:
`cities_admin`, `coverage_gaps`, `geo_integrity_violations`, `geo_merge_candidates`,
`triage_src_quality_city`, `triage_src_quality_village`, `trip_visited_countries`,
`v_popular_entities`.

**RLS policies (9)** — re-author on `geo_places` + satellites. Note the spine already
carries the safety gate (`not safety_gated or auth.uid() is not null`); the typed
policies are simpler (public read + admin write) and must not weaken it.

**Generated column (1):** `cities.canonical_key`. Views cannot carry generated
columns — move to the spine as a real generated column.

**Indexes (38)** — recreate the ones that still earn their keep on the spine/satellites.
`CONCURRENTLY` is unavailable (migrations run in transactions), so favour the hot ones.

## Deferred here on purpose — do them *inside* the swap

The truth engines and the merge cores read *and write* the typed tables. Rewriting
their reads before P4 would be cosmetic; rewriting their writes before P4 would be
actively wrong, because dual-write only flows typed → spine, so spine writes would
never reach the columns the frontend still reads. Their write target flips exactly
when the tables become views:

- `run_city_completeness_recompute`, `run_city_trust_recompute`, `run_city_coverage_radar`
- `compose_safety_note` / `run_city_safety_backfill`
- the village and country engines
- the per-type merge cores → collapse into one geo merge core (keep `/admin/duplicates` working)

## Execution shape

1. Freeze: confirm no concurrent session is mid-migration.
2. Re-run `geo_p4_preflight()`; all gates 0.
3. Per type, **villages first, cities next, countries last** (ascending blast radius),
   one transaction each: drop dependent views → drop dual-write trigger → `DROP TABLE … CASCADE`
   → `CREATE VIEW … WITH (security_invoker = true)` → `INSTEAD OF` INSERT/UPDATE/DELETE triggers
   → re-create BEFORE triggers on the spine → recreate views, RLS, indexes.
4. After each type: `geo_p4_preflight()` gates still 0, plus the P2/P3 e2e set
   (venue/event/hotel/city/village embeds, anon sees no gated venues, search, breadcrumbs).
5. `security_invoker = true` is **mandatory** on every view — without it the views run
   with owner rights and silently bypass RLS, including the safety gate.
6. Type-gen marks all view columns nullable; hand-maintain overrides until P5 migrates
   the ~137 client call sites off the views.

## Rollback

Per type, inside the same transaction: if any verification fails, `ROLLBACK`. Once
committed, rollback means restoring the typed table from backup and re-running the
P0 backfill — which is why each type gets its own transaction and its own verification.
