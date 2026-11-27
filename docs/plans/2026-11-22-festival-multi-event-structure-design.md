# Festivals & multi-part events — design

## Context

Large events (Prides, Folsom Europe/SF, Darklands, Easter Berlin, BeefDip, film festivals) consist of many smaller events: parties, workshops, screenings, a parade, a street fair. Today they show up as a pile of unrelated cards, duplicated umbrellas, and a festival page that rarely has a programme. Goal: one coherent structure **brand → yearly edition → programme**, shown well, and fed automatically.

User decisions (2026-11-22): all three layers, phased **data → display → brand**; feed shows **one umbrella card, sub-events grouped under it**; brand = **revive the `festivals` table**.

## Current state (measured on prod 2026-11-22)

| Mechanism | Where | State |
|---|---|---|
| Umbrella + children | `events.parent_event_id`, one level (`20260826135943_event_programme.sql`) | **149 umbrellas / 214 children** of 81,866 live events |
| Auto-linker | `run_event_programme_link()` (`99991791804114…sql:48`), nightly 03:45 | needs same city_id, ≥20h span, ≥2 shared title tokens. **No upper span bound** |
| Fake umbrellas | — | **69 of 149 umbrellas span >30 days** (recurring venue nights, e.g. "After work" 2022→2026) holding **88 children**. No provenance on any link |
| Duplicated umbrellas | — | Darklands ×4, IML ×3, Folsom Street Fair ×3, BeefDip ×2 — all separate top-level rows |
| Child role | `events.pride_subtypes` (pride-only vocab) | not editable in admin; UI lanes parade/festival/week only |
| Brand across years | `festivals` table + `events.festival_id` | **0 rows**; detail page "More from {festival}" links to `/events?festival=` which nothing parses |
| Repeats | `series_key/series_size/series_next` | works ("+N more dates", not clickable) |
| Ingestion | `NormalizedItem` (`_shared/source-adapter.ts:82`) | no parent field; JSON-LD `superEvent`/`subEvent` dropped by eventfrog, gayout, ticketcorner (`EventSeries.subEvent` flattened), extension, `client-sdk/jsonld-core.ts:113` |
| Display | `EventProgramme.tsx`, `EventDetail.tsx` programme section, `/pride` | programme timetable by day exists; feed hides children; umbrella card shows no count; `/festivals` redirects to `/events` |
| Organizer | `organizer_name` text only | no `organization_id` on events |

**Phase 1.1 findings (measured while building `99991795346462`):**
- The fake umbrellas are structurally identifiable: 87 of 88 children sit under a row with `schedule.kind='recurrence'` (a venue's standing night stored as one multi-year row). The 88th is "Whole Festival" (2025→2027), a brand row holding its own 2027 edition.
- Without a guard the old linker would re-attach **203** children right after a repair (176 to standing-schedule rows).
- **Duplicate umbrellas are pervasive, not a Darklands edge case.** ~50 of the 126 surviving links are an umbrella's duplicate filed as its own child ("Atlanta Pride 2027" ← "Atlanta Pride 2027", "Folsom Street Fair" ← "Folsom Street Fair", "Denver Pride 2027" ← "Denver Pride Weekend 2027"). And 14 of 17 new linker candidates are blocked as ambiguous *because the umbrella exists twice* (Pig Week, Manchester Pride ×3, Sydney Mardi Gras ×3, Capital Pride). Umbrella dedup (item 5) is therefore the bottleneck for the whole programme layer. Note `_event_merge_core` refuses to merge an umbrella with its own child, so the dedup path must unlink first.

Upcoming rows by type: festival 115, pride 607, fetish 151, other 5,307 (much of the festival mass is mis-typed `other`).

## Design

### Model (unchanged shape, cleaned up)

```
festivals            Folsom Europe            brand: about, organizer, logo, typical month, type
 └ events (umbrella) Folsom Europe 2027       festival_id, programme_size
    ├ events (child) PiG Official Party       parent_event_id, programme_role=main_party, programme_official=true
    ├ events (child) Street Fair              programme_role=street_fair
    └ events (child) Bear Dance Folsom Ed.    programme_official=false (satellite)
```

Deliberately NOT built (YAGNI): multiple parents per child, deeper nesting (days/tracks are display groupings, not rows), lineup/performer entity, stages table.

### Phase 1 — Data (≈3–4 days)

1. **Stop fake umbrellas.** Linker: umbrella span ≤ 31 days and `series_size` ≤ 1 (not a recurring night). One-shot repair unlinks the 88 children under >30-day umbrellas, stamped `enrichment_status.event_programme_link.unlinked` (reversible). Provenance stamp `field_provenance.parent_event_id.source` (`linker` / `admin` / `ingest`) on every future link.
2. **Role vocabulary.** New `events.programme_role text` (closed: parade, street_fair, main_party, party, workshop, screening, talk, award, rally, social, sports, market, other) + `programme_official boolean default true`. Backfill from `pride_subtypes`. Admin: role + official toggle on each row in `EventProgrammePanel.tsx`.
3. **`programme_size int`** on umbrellas, maintained by the linker (same pattern as `series_size`), so the feed card can say "14 events" without a join.
4. **Ingestion keeps the parent.** JSON-LD parsers write `metadata.parent_ref {name,url}` from `superEvent` / enclosing `EventSeries` / `subEvent` parent (eventfrog `parse.ts`, gayout, ticketcorner `berlin-events-parse.ts`, `client-sdk/jsonld-core.ts` flatten, extension `jsonld.ts`). Linker resolves `parent_ref` first (url match, then exact despaced name within the date window) before the title-token heuristic; also relax same-`city_id` to ≤ 25 km when `parent_ref` is present.
5. **Umbrella dedup.** New dedup arm: two multi-day rows, same city, overlapping span, title containment after stripping year → **review queue** (never auto: Darklands vs "Darklands After Parties" is an umbrella vs child, not a duplicate). Reviewer choice: merge, or make one the child of the other.
6. **Re-type.** Multi-day umbrella with ≥2 children and `event_type='other'` → suggestion `festival` (review, not auto).

### Phase 2 — Display (≈3–4 days)

1. **Feed umbrella card** (`EventCard.tsx`): "Festival · 9–12 Sep · 14 events" + `ProgrammeSummary` line; expand button lazy-loads children via existing `event_programme()` RPC. `search_events` / `useEvents` return `programme_size`. "+N more dates" becomes a link.
2. **Festival (umbrella) page** (`EventDetail.tsx` programme section): programme moves high (directly after fact strip) for umbrellas; `EventProgramme.tsx` gains filter chips by `programme_role`, Official / Satellite split, "Now / Next" during the festival, add-whole-programme-to-trip and `.ics` (reuse `utils/prideIcs.ts`). Map tab of all child venues (reuse `EventsMapView`).
3. **Child page**: context strip "Part of Folsom Europe 2027 · 9–12 Sep · day 3 of 4" with prev/next sibling, replacing the bare "Part of" line.
4. **Fix broken links**: `/events?festival=` and `/events?organizer=` parsed in `src/utils/eventsQueryString.ts` (or removed).
5. Generalise `groupProgramme` lanes (`src/utils/prideProgramme.ts`) from parade/festival/week to `programme_role`.

### Phase 3 — Brand (≈4–5 days)

1. **Revive `festivals`**: add unique slug, `organization_id` (Business Spine, optional), `typical_month`, `safety_gated` mirrored from city/country (same trigger pattern as events), RLS. Stop the submit form writing it until review exists.
2. **Seed**: matcher proposes brands by grouping umbrella editions on (despaced title minus year/ordinal, city) across years → review; hand-seed top ~30 (gayout's flagship list is the source). `events.festival_id` set on editions.
3. **`/festivals`** hub (replaces redirect): next edition per brand, filters by type (pride / leather & fetish / bear / circuit / film / trans / other), month strip. `/pride` stays as is.
4. **`/festivals/:slug`** brand page: about, next edition with its programme, past editions list, organizer link.
5. Search index (`search_documents_index_*` for festivals), sitemap, crawler detail in `functions/_lib/detail.ts` (`Festival` JSON-LD with `subEvent` editions).

## Reuse (do not rebuild)

`event_programme()` / `event_programme_candidates()` RPCs, `EventProgrammePanel.tsx`, `EventProgramme.tsx` + `byDay`, `ProgrammeSummary.tsx`, `usePrideProgrammeIndex.ts` (batch child fetch), `eventProgrammeLd.ts` + `detail.ts` JSON-LD (drift-tested), `_event_merge_core` umbrella guard + reparenting, `dedup_review_queue` + inbox, series-recompute pattern for `programme_size`, `scripts/next-migration-version.mjs` for every migration.

## Verification

- Phase 1: dry-run each migration on prod in a rolled-back txn; postconditions: 0 umbrellas >31 days with children, `programme_size` = live child count for all umbrellas, Folsom Europe 2027 / BeefDip 2027 keep their children (positive control). Linker dry run reports linked/ambiguous counts before vs after. Unit tests for `parent_ref` extraction on real JSON-LD fixtures.
- Phase 2: vitest for `EventCard` umbrella variant + `eventsQueryString` festival param; `npm run typecheck`; browser check on `/events`, `/events/folsom-europe-2027`, a child page, 390px + desktop.
- Phase 3: e2e for `/festivals` and `/festivals/folsom-europe` (crawler HTML has `Festival` JSON-LD, anon cannot see a gated brand), `check-pipeline-health` sentinel: umbrellas >31 days with children = 0.

## Status (2026-11-22, all three phases shipped)

| Phase | Shipped in | Notes |
|---|---|---|
| 1.1 + 1.3 fake umbrellas, `programme_size`, link provenance | #5539 | 89 children unlinked from standing schedules; duplicate-as-child links refused for new links |
| 1.2 roles + official/satellite | #5540, #5544, #5548 | 0 rows had a Pride subtype to backfill from; roles fill as admins set them |
| 1.4 ingestion keeps `parent_ref`, linker reads it | #5541, #5543, #5557 | only ref in the data today is one `EventSeries` (refused); ref arm links 0 until a source publishes a Festival `superEvent` |
| 1.5 umbrella dedup (review only) + "make A part of B" | #5545, #5560 | |
| 1.6 re-type | #5557 | 7 umbrellas: 4 pride, 3 festival |
| 2 display | #5551, #5558, #5559 | feed card "N events" popover, programme leads, roles, satellite, today, child "day N of M", whole-programme .ics |
| 3 brands | #5562 | 457 brands, `/festivals`, `/festivals/:slug`, crawler `EventSeries` head, `sitemap-festivals.xml`, gated read + `festivals_crawlable` |

Deferred by measurement: programme map tab (3 of 81 umbrellas have children at ≥2 distinct coordinates); bulk add-programme-to-trip (needs a per-day mapping dialog); search indexing of brands (editions are already indexed as events). Known residue: duplicate editions yield duplicate brands until the dedup review merges them (the directory hides a brand with no live edition).

Prod e2e: `e2e/festival-display.spec.ts`, `e2e/event-programme-role.spec.ts`, `e2e/festival-brands.spec.ts`.
