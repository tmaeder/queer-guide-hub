# Kink & feature filters for parties, events and venues — design

Date: 2026-11-22. Status: approved in brainstorming, not yet planned.

## Goal

Let people find parties, events and venues by **venue features** (darkroom, sling,
gloryhole, sauna, steam room, …) and by **kinks** (fisting, piss, bondage, …), and
browse a page per term. Order of work: **fill the data → filters → pages**.
Filters on empty data would look broken, so filling comes first.

## Measured starting point (prod, 2026-11-22)

- Features exist in **two unlinked systems**. On venues, `darkroom` is an
  *amenity* on 181 live venues and a *tag* on 0; `steam-room` is an amenity on
  218. `sauna` is the reverse case: a tag on 1,054 venues.
- On events, `events.tags` and `unified_tag_assignments` agree (darkroom: 171 = 171).
- Kink tags mostly sit on marketplace products, not events or venues:
  `fisting` 190 products / 28 events, `bondage` 808 / 6, `piss-play` 12 / 0.
- 135 upcoming events mention these terms in title or description without the tag.
- Missing tags: `sling`, `sneakers`, `dress-code`, `naked-party`, `underwear-party`.
- Duplicates: `glory-hole` (active, 1 use) vs `gloryhole` (deprecated);
  `cruising` (1,888) vs `cruising-area` (27). `watersports` is already merged into `piss-play`.
- Most kink tags are `is_sensitive`, so `tag_is_anon_gated()` hides them from anon.
- An 18+ confirmation already exists: `useAgeAffirmation` (wrapped by
  `useAdultAcknowledgement`, UI in `AdultContentGate`). It is account-synced when
  signed in and local-only when anonymous.
- `/events` and `/venues` already filter on `?tags=` with **any-of** semantics
  (`overlaps` in `useEvents` / `useVenues`, `&&` in `rpc_venues_ranked`).

## Decisions

1. **Tag-first.** Every filter term is a `unified_tags` row. No second taxonomy.
2. **Visibility:** anyone who has confirmed 18+ (signed in or not) sees kink
   filters and pages. Pages are not indexed. Features already public today
   (sauna, steam room, darkroom) stay public.
3. **Vocabulary:** a short curated list (~20 terms), extendable by admin by
   adding a registry row. No code change per term.
4. **Matching:** any-of across selected chips (existing behaviour). No all-of mode.
5. **Dedicated page = `/tags/:slug`**, plus one hub at `/kink`. No `/kink/:slug` routes.

## 1. Data and filling

### Registry

New table `public.kink_filter_terms`:

| column | type | notes |
|---|---|---|
| `tag_id` | uuid PK, FK `unified_tags.id` | |
| `term_group` | text CHECK in (`feature`,`kink`) | |
| `sort` | int | display order inside the group |
| `amenity_slug` | text null, FK `amenities.slug` | e.g. `darkroom` → amenity `darkroom` |
| `applies_to` | text[] CHECK ⊆ {`events`,`venues`} | |
| `public_without_18` | boolean default false | true only for sauna, steam room, darkroom |
| `enabled` | boolean default true | |

Seed (final list confirmed in the plan, adjustable by row):

- **Features:** darkroom, sling, glory-hole, sauna, steam-room, cruising,
  private-cabins, hot-tub, dress-code, naked-party, underwear-party.
- **Kinks:** fisting, piss-play, bondage, bdsm, leather, rubber, puppy-play,
  spanking, cock-and-ball-torture, sneakers, socks.
- `chemsex` is **not** a filter. Its tag page keeps its harm-reduction content.

Before seeding: create the missing tags (unpublished, all three category
representations set by hand, since category triggers do not fire on INSERT),
and merge `gloryhole` → `glory-hole`, `cruising-area` → `cruising` with
`merge_tag_concept`.

RLS: anon/authenticated may SELECT; writes are admin-only.

### One writer

`public.apply_kink_tag(p_entity_type text, p_entity_id uuid, p_tag_id uuid, p_source text)`
(SECURITY DEFINER, service_role + admin only):

- appends the tag slug to `events.tags` / `venues.tags` if absent;
- inserts the `unified_tag_assignments` row if absent;
- stamps `enrichment_status.kink_tags.<slug> = {source, at}`.

Nothing else writes these tags for registry terms. Batches stay ≤300 rows per
statement (the search triggers make larger batches time out).

### Fill

1. **Amenity mirror (deterministic, auto):** every venue whose `amenities`
   contains a registry `amenity_slug` gets the tag. About 400 venues. A BEFORE
   trigger on `venues` keeps it mirrored for future writes.
2. **Text match (measured before auto-apply):** word-boundary regex per term
   over `title`/`name` + `description`. For each term, hand-read a sample
   (n ≥ 20 or all rows if fewer). Terms at **≥95%** precision auto-apply via
   `apply_kink_tag`. The rest open rows in the review inbox (registered field
   in `review_field_registry`, `batchable = false`). Expected review-only:
   `leather`, `rubber`, `naked-party`, `socks`, `sneakers`. The sample results
   (term, n, correct) are recorded in the migration header.
3. **Nightly cron** `kink_tag_fill` running step 2 on rows created or updated
   since its cursor. Registered in `admin_automations` in the same migration.

Safety gating is unchanged: `safety_gated` venues and events stay hidden from anon.

## 2. Filters

- `/events` and `/venues` get a **"Kink & features"** filter group with two chip
  rows (Features, Kinks), read from `kink_filter_terms` filtered by `applies_to`.
- Chips write into the existing `?tags=` parameter. Shareable:
  `/events?tags=fisting,sling`.
- Each chip shows a count. A 0-count chip renders muted, not hidden.
- **18+ gate:** without confirmation, kink chips and non-public feature chips are
  replaced by one button, "Show kink & fetish filters (18+)", which opens the
  existing confirmation dialog. `public_without_18` chips stay visible. A URL
  containing gated tags opens the confirmation first, then applies them.
- Event and venue cards show up to 2 matching registry chips via
  `TagChipRow linkless`, only after 18+ is confirmed.

## 3. Pages

- **`/tags/:slug`** for registry terms gains two sections under the definition:
  - **Upcoming parties:** next 12 events with the tag, soonest first; "See all"
    → `/events?tags=<slug>`.
  - **Venues:** up to 12, ordered by the `/venues` ranking; "See all" →
    `/venues?tags=<slug>`.
  - Uses existing `EventCard` / `VenueCard`.
- **`/kink`** hub: registry terms in two groups with live counts of upcoming
  events and venues, each linking to its tag page. Linked from the filter group
  and from the glossary index footer.
- **Read path for anon:** new `public.kink_filter_term(p_slug text)` returns
  `slug, name, short_description, term_group, event_count, venue_count` for
  **registry terms only**, granted to anon. The client shows it only after 18+
  confirmation. It never returns a non-registry sensitive tag, so the glossary
  gate is not widened. Full glossary prose stays signed-in only.
- Without 18+: the existing confirmation dialog; "Take me back" → `/events`.
- Crawlers: sensitive terms stay `noindex`; `/kink` is `noindex`; public
  feature terms keep their current indexing.

Not built: per-kink editorial content, `/kink/:slug` routes, maps on these pages.

## 4. Checks and tests

**Sentinels** (standalone, service_role only, wired into `check-pipeline-health.mjs`,
reporting the registry row count first so an empty registry never reads as clean):

- registry rows pointing at a missing, merged or deprecated tag → hard fail;
- registry tags where the `tags` array and `unified_tag_assignments` disagree → must be 0;
- venues with a registry `amenity_slug` amenity but without the tag → must be 0.

**Safety tests**

- `kink_filter_term()` returns nothing for a sensitive tag that is not in the registry.
- Safety-gated venues/events never appear for anon on `/tags/:slug` or `/kink`.
  Checked through the anon role with a positive control (a non-gated row that
  must appear).

**Tests**

- Unit: chip group rendering, 18+ locked/unlocked states, URL ↔ chip state.
- Migration guard tests over comment-stripped SQL, mutation-tested with a
  comment-only control.
- E2E on prod: anon without 18+ sees the lock button; anon with 18+ sees chips
  and filtered results; `/tags/fisting` lists upcoming parties; `/kink` loads with counts.

## Rollout (one PR each)

1. Registry, missing tags, duplicate merges, `apply_kink_tag`, amenity mirror.
2. Text-match backfill (with measured precision), nightly cron, sentinels.
3. Filters on `/events` and `/venues`.
4. Tag-page sections and `/kink` hub.

Migration versions come from `scripts/next-migration-version.mjs`, never by hand.
