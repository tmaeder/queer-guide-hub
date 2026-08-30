# Open Data Integration

**What each external feed is for, whether it is on, and where the real holes are.**

Measured against prod (`xqeacpakadqfxjxjcewc`) on **2026-08-30**. Every number below is a re-runnable
query; every behavioural claim is a file path. Where a number drifts, re-run the SQL rather than
trusting the prose — a stale figure here is worse than no figure.

> **Read this first.** The ingest machine is **not** greenfield. **281 automations are registered in
> `admin_automations`, 258 of them enabled**, on pg_cron. Wikidata, Wikipedia, OSM/Overpass, Nominatim/Photon,
> Ticketmaster, ILGA, TGEU, Refuge Restrooms, RSS, World Bank and OurAirports are all already
> wired. Before proposing a new source, check §1 for the row — most "missing" feeds are running
> under a slug you did not guess.

## Status vocabulary

| Status | Means |
|---|---|
| `built` | A live automation writes this. The slug is named and is `enabled`. |
| `partial` | Something writes it, but coverage is measured and low. The number is stated. |
| `missing` | Nothing writes it. No table, no adapter, or no scheduler. |

---

## §1 — Content type × source matrix

### 1.1 Venues & Nightlife — `public.venues` (26,867 live)

| Target field | Primary source | Corroborating | Status | Validation | Enrichment |
|---|---|---|---|---|---|
| `name`, `category` | Spartacus (15,729 `venue_sources`), patroc, gaypinkspots | OSM, TomTom, Google | `built` — `pipeline_venue_ingestion` (`0 3 * * *`, 7 sources) | `E_MISSING_NAME`; category coerced through the 17-value CHECK | `run_venue_category_reclassify` — **source beats name** |
| `latitude`/`longitude` | Source payload | Photon forward-geocode fallback | `built` — `venue_geocode_forward` (`*/15`) | `E_GEO_OUT_OF_RANGE`; `geoGuard(250 m)` in dedup | `venue_coord_snap`, `venue_centroid_repair` |
| `website`, `phone`, `email` | Source payload | Consensus vote across sources | `partial` — website on **10,001 / 26,867 (37%)** | `E_INVALID_URL_SCHEME` | `venue_url_checker` (`*/20`) → `url_status` |
| `amenities[]` | TripAdvisor/Yelp scrape text | LLM extract (≥0.8 auto) | `partial` — **2,128 / 26,867 (7.9%)** | `amenity-normalize.ts` default-reject against `public.amenities` | `amenity_truth_backfill` (`0 */3 * * *`) |
| **`accessibility_attributes[]`** | — | — | **`partial` — 6 / 26,867 (0.02%)** | vocabulary exists incl. negatives | **See §1.7. This is the headline gap.** |
| `closed_at` | Google `business_status`, `url_status` 404/410 | ≥2 distinct sources → auto-close | `built` — `venue_closure_decision`, `existence_decision_venue` | 1 signal → `needs_attention` only | `pipeline-consensus-merge` closure voter |
| `safety_gated` | Derived from `countries.lgbti_criminalization` | — | `built` — BEFORE trigger + `recompute_safety_gated_for_country()` | — | see §4 |
| `platform_ids.google` | patroc map buttons | — | `partial` — **740 venues** | ChIJ-format | unlocks Places Details cheaply |
| Queer ownership | — | — | `missing` | no column | `ownership_tags` exists for brands only |

**OSM is saturated as a discovery source.** The last five nightly `vn_fill_osm` runs each fetched
`items_total: 120` and skipped **all 120** as already-known (`items_succeeded: 0`). Only 200
`venue_sources` rows are OSM. Widening the `lgbtq=*` query is the wrong move — see §3.2.

### 1.2 Events & Festivals — `public.events` (47,838 live)

| Target field | Primary source | Corroborating | Status | Validation | Enrichment |
|---|---|---|---|---|---|
| `title`, `start_date` | gaycities (36,828 — Wayback import), gay-ch (3,855), siegessäule (2,317) | Ticketmaster (347), outsavvy (345) | `built` — `pipeline_event_ingestion` (`0 */6 * * *`) | `E_TITLE_PLACEHOLDER`, `W_EVENT_TOO_FAR_FUTURE` | `expand_event_recurrences` |
| `city_id` → `country_id`/`state`/`timezone` | `run_event_city_link` | metro slug + `state` guards | `built` — `event_city_link` (`5 3 * * *`) | **blocks rather than guesses** on same-name collision | `event_geo_fill`, `event_timezone_fill` |
| `liveness_status` | HEAD/GET `ticket_url`, JSON-LD `eventStatus` | — | `built` — `event_liveness_checker` (`10 2 * * *`) | certain → auto-apply; ambiguous → `needs_attention` | — |
| `trust_score` | `event_quality_signals` ledger | 6 weighted components | `built` — `event_trust_recompute` (`10 * * * *`) | hard-cap 10 on dead/cancelled | — |
| `accessibility_attributes[]` | LLM moat extract | — | `partial` — **277 / 47,838 (0.58%)** | `normalize_event_accessibility`, negatives first-class | `event_agentic_enrich` (hourly, capped 60/day) |
| `target_groups[]`, `age_restriction` | Source text | closed vocabularies | `built` — `event_tags_backfill` | exact-match filters + live facet | `normalize_event_target_groups` (table-driven) |
| **Lineup / performers / artists** | — | — | **`missing` — no column, no junction table** | — | **See §1.8** |
| Ticketing feeds | Ticketmaster | — | `built` — `ev_fill_ticketmaster` (`35 */6`), LGBTQ+ keyword prefilter default-ON | breaker `ticketmaster` closed | — |
| Eventbrite | Eventbrite | — | **`retired` 2026-08-30** (`20261107100000`) — `/v3/events/search/` 404s with *and without* credentials; no successor endpoint. Cron unscheduled, registry row disabled, DAG node neutered at the function level | breaker `eventbrite` never once succeeded (`success_count = 0`) | Was enabled at **500** breaker failures while every run logged `success` — see §3.6 |

### 1.3 Healthcare & Clinics — `public.organizations` `roles=['support']` (2,987)

> **A clinic is an `organization`, never a `venue`.** `venues.category` has 17 values and none is
> health. Migration `20260916160000` states the decision: *"minting 534 `venues` rows to hold the
> coordinates would put clinics into venue browse and onto the map beside bars and saunas."* Before
> adding a health value to `venues.category`, read that migration header.

| Target field | Primary source | Corroborating | Status | Validation | Enrichment |
|---|---|---|---|---|---|
| Clinic identity + geo | European Test Finder (530), Swiss AIDS Federation (`source_aids_ch`, weekly) | — | `built` — `commit_health_service_org(p jsonb)` | rows land `status='draft'`; promote via verify driver | `organizations.latitude/longitude` (paired CHECK) |
| Service tags | Source payload → `amenities` `category_scope=['health']` | — | `built` — **48-term vocabulary**: `prep`, `pep`, `doxy-pep`, `hiv-testing`, `sti-testing`, `drug-checking`, `needle-exchange`, `gender-affirming-care`, `abortion-care`, `anonymous-testing`, `free-testing`, `walk-in`… | `kind='amenity'` deliberately, so they can never leak into `venues.tags` | — |
| Geo coverage | — | — | `partial` — **719 / 2,987 (24%)** have coordinates | `organizations_coords_paired` | — |
| Public rendering | `list_testing_sites()` | — | `built` — selects on **roles + service tags, never provenance**, so any new directory appears automatically | — | `TestingSitesBand` on `/tags/sti-guide` |
| HRT / PrEP clinical protocols | PubMed Central, Europe PMC | — | `missing` | — | — |
| Medication facts | openFDA, DailyMed, DrugCentral | — | `partial` — FDA labels contribute 7 `substance_interactions` rows only | — | — |
| Public health indices | WHO GHO, CDC WONDER, IHME | — | `missing` | — | World Bank covers country economics only |

### 1.4 Harm Reduction — `public.substance_interactions` (476) + tag surfaces

| Target field | Primary source | Corroborating | Status | Validation | Enrichment |
|---|---|---|---|---|---|
| Pairwise interactions | TripSit (421) | eve&rave Substanzhandbuch (48), FDA labels (7) | **`built` but never refreshes** — loaded once, `fetched_at` 2026-08-15, **no cron** | `status` CHECK 7 values; canonical order `tag_a_id < tag_b_id` | `substance_interaction_matrix()` RPC |
| Myth / fact rows | Editorial | — | `built` — `tag_myth_facts`, `get_tag_myth_facts()` | `kind IN ('myth','fact')` | — |
| STI transmission + testing windows | Editorial / clinical | — | `built` — `sti_profiles`, `sti_transmission_risks`, `sti_testing_windows`, `sti_protection_methods` | `pathogen IN ('virus','bacteria')` | — |
| Clinical codes | Wikidata registered properties | — | `built` — `tag_medical_codes_sync` (`30 5 * * 1`), 11 systems | `code_pattern` rejects malformed | — |
| **Dosage, onset/duration, half-life, redose** | — | — | **`missing` — no table anywhere** | — | prose only on `/tags/:slug` |
| **Adulteration / drug-checking results** | DrugsData, EUDA, UNODC EWA | — | **`missing`** | — | `drug-checking` exists as a *service* amenity, not as data |
| Regional purity / market trends | EUDA, RADARS | — | `missing` | — | — |

### 1.5 Legal & Travel Advisory — `public.countries` (250)

| Target field | Primary source | Corroborating | Status | Validation | Enrichment |
|---|---|---|---|---|---|
| All 18 `RIGHT_TOPICS` columns | **ILGA live GraphQL** `database.ilga.org/graphql`, 17 parallel queries | — | `built` — `wf_import_ilga_data` (`0 2 * * *`), **239/250 updated nightly** | national-level only (`!subjurisdiction`), matched on `a2_code` | `equality_score` recomputed each run |
| The other 11 | inherited from parent state (5) / recorded decision (6) | — | `built` (2026-08-30) — **not a join failure.** ILGA returns 239 national jurisdictions, **239 distinct `a2_code`s, zero nulls** — a 100% hit rate. The 11 are outside ILGA's corpus because they have **no distinct legal system**; ILGA *does* carry dependent territories that have one (Cook Islands, Niue, Tokelau, Jersey, Anguilla all update nightly), so "dependent territory" is not the discriminator | `enrichment_status.lgbti_rights.state` on every one of the 11 | `import-ilga-data` re-derives the 5 inherited each run |
| Second legal opinion | ~~Equaldex~~ → **decided: US State Dept, gate fields only** | — | `missing` — **Equaldex is closed on licence, not on HTTP.** `/api` returns **200** and the region endpoint **401** (key required); `20260330600000`'s stated reason *"no public API exists (returns 403/404)"* is measured false. The blocker is the terms: non-commercial only, *"may not… display it in a paid app or website"*, and **no storage beyond 30 days** — structurally incompatible with `countries` backing `location_is_high_risk()`. Row retired `licence_incompatible` in `20260830132743` | — | — |
| **Single-source risk** | — | — | **`missing` — this is the honest state.** All 18 topics still rest on ILGA alone. The corroborator is *decided* (US State Dept Country Reports: public domain, independent embassy reporting, scoped to `lgbti_criminalization.legal` + `death_penalty`, ~66 jurisdictions) but **deliberately not built** — an empty registered table is the `equaldex-api` anti-pattern it exists to avoid | on landing: writes its own table, flags to `entity_review_queue`, **never** writes `countries` | — |
| Equaldex timeline | `equaldex-timeline` → **`news_articles`** | — | `built` — ran today 03:45, 0 failures | — | Different arm, different purpose: this is a news feed, **not** a rights corroborator. Do not mistake its green status for legal corroboration |
| `rights_verdicts` | Derived from the 18 | — | `built` — `_shared/rights/verdict.ts`, 4 lenses | CHECK 6 verdict values | — |
| Trans-specific | TGEU TMM | Williams Institute | `partial` — `tgeu_tmm_import` (`20 3 * * 1`) fills `trans_violence_documented`; `trans_rights_index` has no live feed | `MonitorState` distinguishes `none_recorded` from `unmatched` | — |
| `safety_notes` | `compose_safety_note()` — deterministic SQL, **not** LLM | country law + city density | `built` — `city_safety_backfill` (`30 4 * * *`) | **outing-safety invariant**, see §4 | — |
| Case law (HUDOC), UNTC, OHCHR | — | — | `missing` | — | `tag_sources` holds 18 hand-researched instruments for the glossary only |
| Passport / visa mobility | Passport Index, IATA Timatic | — | `missing` — `visa_requirements` is permanently `data_unavailable` by decision | — | no free reliable per-nationality source; **inventing one is travel-safety-adjacent** |

### 1.6 Asylum & Support Networks

| Target field | Primary source | Status | Notes |
|---|---|---|---|
| Support organisations | Directory imports | `built` — 2,987 `roles=['support']` orgs across 175 countries | Same commit path as healthcare |
| UNHCR Refugee Data Finder / Refworld | — | `missing` | — |
| EUAA case law, AIDA country reports | — | `missing` | — |
| IOM DTM | — | `missing` | — |

### 1.7 The accessibility gap — a contract gap, not a data gap

`venues.accessibility_attributes` is populated on **6 of 26,867 venues (0.02%)** while **20,600
non-toilet venues carry coordinates**. The cause is structural and fully traced:

| Layer | File | State |
|---|---|---|
| Adapter contract | `_shared/source-adapter.ts:56` | `NormalizedItem` has `tags`/`urls`/`contacts`/`metadata` — **no accessibility field**. A source *cannot express* "wheelchair accessible". |
| OSM adapter | `source-osm-venue/index.ts:106` | Reads `tags.wheelchair === 'yes'` → pushes into `osmTags` → `venues.tags`. Only `'yes'`; `limited`/`no` dropped. `toilets:unisex` never read. |
| Normalize | `pipeline-normalize/` | Never emits `accessibility_attributes`. |
| Consensus | `_shared/venue-consensus.ts:57` | **Expects** it at path `accessibility_attributes`, `kind:'array'`. Reads a path nothing populates. |
| Only real writer | `amenity-truth-backfill/index.ts:37` | Maps Google Places `accessibilityOptions.*` correctly, but that mode is deferred. Its LLM mode is **always review-gated by design** — correct, keep it. |

Net: **0 venues carry even the `wheelchair-accessible` tag.** The consensus receiving end is built
and idle. `AmenityDisplay`'s "✓ matches your needs" badge — matching
`travel_preferences.accessibility_needs` against venue attributes — runs against an empty column for
effectively every venue on the site.

```sql
-- re-run me
select count(*) filter (where cardinality(accessibility_attributes) > 0) as with_a11y,
       count(*) filter (where latitude is not null and category <> 'toilet') as geocoded,
       count(*) as total
from venues where duplicate_of_id is null;
-- 2026-08-30: 6 | 20600 | 26867
```

### 1.8 There is no performer entity

No `lineup`/`performers`/`artists` column on `events`; no `event_artists` junction. The only
person table is `personalities`, an encyclopedia — "performer" appears there as a *profession*
value. `personalities.next_concerts jsonb` hangs off the **person**, not the event.

**MusicBrainz and Setlist.fm therefore have nothing to attach to.** Wiring them is a schema
decision first and an ingestion task second; do not scope it as a source integration.

---

## §2 — Taxonomy alignment

### 2.1 Spatial & venue

OSM `amenity=*` → `venues.category`, a **17-value** closed vocabulary
(`src/lib/venueCategories.ts`, drift-tested against the DB CHECK):

`bar` · `club` · `cafe` · `restaurant` · `hotel` · `sauna` · `cruising` · `outdoor` · `shop` ·
`community_center` · `event-venue` · `theater` · `gallery` · `salon` · `gym` · `toilet` · `other`

Live distribution (2026-08-30): `bar` 8,539 · `other` 6,929 · `club` 1,982 · `outdoor` 1,966 ·
`toilet` 1,469 · `sauna` 1,447 · `restaurant` 1,275.

Two standing rules:

- **Source beats name.** A sole-source `refuge-restrooms` row resolves to `toilet` at confidence 1.0
  *before* any name inference. Name inference on those rows produced 167 cafés and bars out of
  public toilets — including a hair salon labelled `sauna`, which on this platform asserts a sexual
  venue type. Only `bar`/`sauna`/`community_center` auto-apply from names (≥85% measured agreement);
  everything else becomes a review suggestion.
- **`organization` was removed** from the vocabulary. "Is this a venue at all" is answered by the
  `nonvenue_candidate` flow and the `organizations` table, never by a category value.

`geo_places.place_type` is a separate six-value spine vocabulary (`continent`, `region`, `country`,
`city`, `village`, `landmark`) with `landmark_kind` in eight values. Only **6 landmark rows exist** —
the type is live but essentially unpopulated, which is what makes the Wikidata landmark query in
§3.1 worth running.

### 2.2 Safety & legal

ILGA/Equaldex categories collapse into the consumer tier already used by `useTripSafety.ts` and
`compose_safety_note()`:

| Tier | Condition | UI |
|---|---|---|
| `critical` | `death_penalty = yes` | red, sign-in gated content |
| `high` | `lgbti_criminalization.legal = false` | red |
| `moderate` | `equality_score < 40` | amber |
| `low` | otherwise | green |

Value normalisation is a closed `VOCAB` map in `src/lib/rights/rightsValue.ts` (~26 strings →
`{kind, key}`), with `EMPTY = ['', 'no data', 'unknown', 'null', 'undefined']` and a
`KNOWN_RIGHT_VALUES` drift test. **Do not add a raw ILGA string to the UI without adding it there.**

**Outing-safety invariant — load-bearing, enforced in two places.** A criminalizing or
death-penalty destination can **never** auto-publish a safety note: the composer forces
`auto_publishable = false`, and `approve_city_review()` additionally requires `p_confirm = true`.
Consumer-friendly tag names (*Safe for Trans Travelers*, *PrEP Available OTC*) must be derived from
these columns at render time — **never stored as a denormalized boolean**, because a derived field
that is never revalidated against its input is exactly how 86 published notes came to describe a
different country's laws.

### 2.3 Substance & harm reduction

TripSit/PubChem → `unified_tags` + `substance_interactions.status`, ranked by
`substance_interaction_rank()`:

`dangerous` › `unsafe` › `caution` › `low_risk_decrease` › `low_risk_no_synergy` ›
`low_risk_synergy` › `unknown`

**Name the representation, not "the" category.** A tag's category exists in three places and each
reader surface reads a different one:

| Representation | Value here | Who reads it |
|---|---|---|
| `tag_categories` junction | `Substances & Harm Reduction` (level-1 under `Health & Wellness`) | `/tags/:slug` renders the **junction** |
| `unified_tags.category` TEXT mirror | `Substances & Recovery` (272 rows) | the **search facet** |
| `unified_tags.category_id` | the single lever — moves both via BEFORE + AFTER triggers | — |

Both values are real; they are different columns. This document does **not** assert a rename — that
is not established. Writing the text alone, or inserting a junction row alone, fires no trigger and
propagates nothing.

**Health-tag membership is self-selecting and the category cannot express it.** Of the 147 active
tags in the substances category, only 12 carry a diagnostic code. A tag is clinical iff its Wikidata
item carries a registered code property — never because of where it is filed.

### 2.4 Two rules that govern every mapping in this file

- **Never resolve an entity by name alone when the reference table cannot represent the ambiguity.**
  `cities` holds at most one row per (name, country), so "exactly one match" proves nothing — an
  unrepresentable twin looks identical to an unambiguous name. Require a second independent signal
  and **block rather than guess**: a null FK is recoverable, a wrong one is not.
- **An LLM's self-reported confidence cannot gate a write.** Measured twice: the tag-prose judge
  retracted 16 definitions in its first batch and **13 were correct**, answering `wrong_subject` at
  high confidence for prose that was merely short; the relations verifier was ~29% correct at
  confidence **1.000**. Both engines are disabled. Re-enabling either needs a fresh precision
  measurement, never a tuned threshold.

---

## §3 — Pipeline, queries, cadence, conflict resolution

### 3.1 SPARQL — Wikidata Query Service

Both queries ride the existing `wikidata.sparql` breaker (threshold 5, reset 900s). Keep them lean;
WDQS 502s on broad queries and transitive `P131*`/`P279*` returns HTTP 500 at 60s.

**Two SPARQL source functions already exist — copy them rather than starting fresh.**
`source-queer-villages/index.ts:24` queries WDQS through the adapter contract, and
`airport-service-refresh/index.ts:23,132` combines WDQS with the OurAirports CSV.

**A — recurring Pride events with coordinates.**

```sparql
# Pride events (Q56521729 pride parade / Q1656682 event subclasses) with a place + coords.
SELECT ?event ?eventLabel ?placeLabel ?coord ?countryLabel ?inception WHERE {
  ?event wdt:P31/wdt:P279* wd:Q56521729 .
  OPTIONAL { ?event wdt:P276 ?place . ?place wdt:P625 ?coord . }
  OPTIONAL { ?event wdt:P17 ?country . }
  OPTIONAL { ?event wdt:P571 ?inception . }
  # A cancelled or dissolved recurring event must not publish as upcoming.
  FILTER NOT EXISTS { ?event wdt:P576 ?dissolved . }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en,de,fr,es". }
}
LIMIT 500
```

**B — queer cultural landmarks, for the `geo_places` landmark spine (currently 6 rows).**

```sparql
# Monuments/memorials/buildings with an LGBTQ+ subject, inside a city we can resolve.
SELECT ?item ?itemLabel ?kindLabel ?coord ?cityLabel ?countryLabel ?image WHERE {
  VALUES ?kind { wd:Q4989906 wd:Q5003624 wd:Q41176 wd:Q22698 }   # monument, memorial, building, park
  ?item wdt:P31/wdt:P279* ?kind ;
        wdt:P625 ?coord .
  { ?item wdt:P921 ?topic . } UNION { ?item wdt:P547 ?topic . }  # main subject / commemorates
  ?topic wdt:P31/wdt:P279* wd:Q17884 .                            # LGBT-related concept
  OPTIONAL { ?item wdt:P131 ?city . }
  OPTIONAL { ?item wdt:P17 ?country . }
  OPTIONAL { ?item wdt:P18 ?image . }
  FILTER NOT EXISTS { ?item wdt:P576 ?dissolved . }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en,de,fr,es". }
}
LIMIT 500
```

**`FILTER NOT EXISTS { ?x wdt:P576 ?dissolved }` is load-bearing in both.** Statement-level guards
(`pq:P582` end-date, deprecated rank) do **not** catch an entity that simply stopped existing — the
capital-scope backfill published Cologne as a Landeshauptstadt because its `P1376` target, the
*Electorate of Cologne*, carries neither qualifier and dissolved in 1803.

Landmark rows land `needs_review = true`; `search_documents_index_landmarks` excludes those, so a
seed is invisible to search and public pages until an admin approves it.

### 3.2 Overpass QL — written for enrichment, not discovery

Discovery is saturated (§1.1). These query **by coordinate for venues we already hold**.

**A — accessibility + unisex toilets around a known venue.**

```overpassql
[out:json][timeout:60];
// 60 m around a venue we already have. Radius is tight on purpose: a wrong
// accessibility claim is worse than none, so we do not want a neighbouring building.
(
  nwr(around:60, {{lat}}, {{lon}})["amenity"];
  nwr(around:60, {{lat}}, {{lon}})["tourism"];
  nwr(around:60, {{lat}}, {{lon}})["leisure"];
);
out tags center;
```

Harvest `wheelchair` (**all four values** — `yes`/`limited`/`no`/`designated`),
`wheelchair:description`, `toilets:wheelchair`, `toilets:unisex`, `unisex`, `entrance`,
`step_count`, `kerb`, `tactile_paving`, `opening_hours`.

**B — LGBTQ+ venues with attributes in a bbox (discovery, widened past the current node-only query).**

```overpassql
[out:json][timeout:90];
// The live source-osm-venue query is node-only and requires amenity|tourism,
// which is why it re-finds the same ~120 rows nightly. nwr covers ways and relations.
(
  nwr["lgbtq"~"^(yes|primary|only)$"]({{bbox}});
  nwr["lgbtq:primary"="yes"]({{bbox}});
  nwr["community"="lgbtq"]({{bbox}});
  nwr["community_centre:for"~"lgbtq"]({{bbox}});
  nwr["gay"="yes"]({{bbox}});
);
out tags center;
```

**Two Overpass traps, both measured, both cost a full run when ignored:**

1. **An empty 200 is not an answer.** Overpass returns HTTP 200 with an empty element list and a
   `remark` when a query times out. A bare `res.ok` check cached "Madrid has no metro". Always
   inspect `remark` and treat an empty result as *unknown*, never as *absent*.
2. **`overpass.osm.ch` is a Switzerland-only extract** that returns a clean `200 {"elements":[]}`
   for the rest of the world with **no `remark` at all**. Pinned to a third of a 487-city run it
   cached "no network" for ~450 cities. Probe every endpoint at startup with a control query the
   whole planet agrees on (Berlin's U-Bahn, ≥5 relations) and drop any that fails. Distinguish
   **busy** (504 — retry with backoff) from **regional** (empty 200 — condemn immediately).

### 3.3 Cadence and the registry contract

Two layers, and confusing them is how the ingest engine went down for 40 hours:

- **`admin_automations` is the registry of record.** `pg_cron` is the **only** scheduler.
- **Retiring a cron means disabling the registry row first.** `sync_automations_to_cron()` recreates
  any enabled row with a command and no matching job, so a bare `cron.unschedule` is undone by the
  next reconciler pass. A `DELETE` is worse — it makes the live job "unregistered", which the
  sentinel reports and deliberately never auto-kills.
- **`sync_automations_to_cron(false)` reporting zero drift is not evidence a retirement took** — it
  compares registry against pg_cron, and both can agree on a stale intent.
- **Auto-pause erases its own evidence.** The success branch resets `consecutive_failures = 0` and
  `last_run_status = 'success'` but never re-enables, so a falsely-paused row reads exactly like a
  deliberate retirement. `check-pipeline-health.mjs` distinguishes *paused and still failing*
  (legitimate, warn) from *paused then recovered* (**hard fail**).
- **An `action.type = 'rpc'` row carries no `action.command`,** so the sync structurally cannot
  reschedule it. Re-enabling leaves it on-but-unscheduled; the cron must be recreated from its
  original migration. **Read the `recreated` list the sync returns** rather than assuming.

**Adding a source — the contract.** Implement `SourceAdapter`: `{ name, entityType, fetch(config),
normalize(raw), getSourceId(raw) }`. `name` becomes **both** `source_name` and `source_type`.
`writeToStaging()` is the only sanctioned write path; `config.refresh` switches it from
INSERT-skip to upsert-on-change, re-opening `committed` rows to `pending` while preserving
`ai_validation_status` — that is what recurring marketplace sources use.

**A missing credential must return HTTP 200, not an error.** Throw `MissingCredentialsError` and map
it to `skippedResponse(reason, missing)`, so `pipeline-executor` marks the node *skipped* rather
than *failed* — otherwise an unset key looks like an outage and burns the auto-pause counter.
`source-ticketmaster:21` and `source-eventbrite:22` are the reference implementations.

**Registration is one migration in three parts** (newest reference:
`20261029094600_source_aids_ch_cron.sql`):

1. `INSERT INTO admin_automations … ON CONFLICT (slug) DO UPDATE` — the registry row.
2. Guarded `cron.unschedule`, then `cron.schedule` **derived from the registry row**.
3. `INSERT INTO ingestion_sources …` — the admin-facing source list.

Then a `DO $$` block asserting the row exists, is enabled, and the cron schedule matches. That
assertion exists because `20260820191944` issued a `cron.schedule` that **silently never took**.

**Put the plain readable command in `action.command`.** `sync_automations_to_cron()` derives the
run-tracking wrapper itself; a pre-wrapped command in a migration is re-wrapped and breaks.

New `source-*` functions need `verify_jwt = false` in `config.toml` or the cron gets a 401.

> **Drift, resolved 2026-08-30 (`20261107100200`).** `commit_hotel_staging_batch` existed in the
> live database with no `CREATE FUNCTION` anywhere in `supabase/migrations/` or the baseline. It was
> created by raw Management-API SQL, which records no history: searching
> `schema_migrations.statements` for the name returns **only the two revoke migrations**, so the
> documented "recover the bytes from `statements`" route did not exist for it. Recovered from the
> live `pg_get_functiondef` instead and **proven byte-exact** by declaring it into a scratch schema
> on prod and comparing md5 (`2cbfe3e2…` both sides) — a scratch schema rather than BEGIN/ROLLBACK
> so a rollback that silently failed could not overwrite a live function with an unverified
> transcription. `git log -S` dates its creation to the 71 hours between two `types.ts`
> regenerations, 2026-06-07 15:33 → 2026-06-10 14:07 UTC, straddling the 34-duplicate-version
> history repair of PR #1553.
>
> **It has never committed a row and cannot.** Its loop selects
> `ingestion_staging WHERE target_table = 'hotels'`; hotels have no `target_table` of their own —
> they stage as `target_table='venues'` discriminated by entity type, and the live distinct values
> are news_articles / marketplace_listings / venues / events / personalities / cities / countries.
> Nothing calls it either: `_shared/content-registry.ts:96` files hotels as
> `commit: { kind: 'via', type: 'venue' }`. The migration is record-keeping only. **Do not wire it
> up on the strength of its name** — adopting it would be a design decision, not a bug fix.

### 3.4 Rate limiting and caching — know what does *not* exist

**There is no HTTP response cache for third-party APIs.** No Redis, no cache table. What exists:

| Mechanism | Where | Scope |
|---|---|---|
| Cloudflare Cache API | `workers/search-proxy`, `workers/submit` | our own Supabase reads, not third-party |
| Cloudflare KV | `workers/ingest` `EMBED_CACHE`, `workers/search-proxy` | embeddings + sessions |
| In-memory LRU | `pipeline-geocode/index.ts:27` (`makeLru`, sized 500 at `:94`) | **per-invocation, cold on every cold start** |
| DB-as-cache | `cities.wikidata_qid` + `wikipedia_title` | the pattern to copy |

`city-factual-backfill` is the model: caching the QID collapses a repeat visit from 3–5 requests to
one `wbgetentities`. `?relink=1` bypasses it — needed because **a wrong QID is otherwise permanent**.

Politeness for Nominatim is a hardcoded sleep (`SLEEP_MS = NOMINATIM_URL ? 50 : 1100`), not a
limiter. OSM's usage policy requires this; do not parallelise around it.

### 3.5 Conflict resolution — the shipped mechanism

`_shared/venue-consensus.ts`. **Venues are the only entity with a real truth engine**; every other
type uses a `field_provenance` jsonb decided by a precedence string, with no voting, no confidence
and no audit table.

```
admin 1.0 │ google 0.85 │ foursquare 0.8 │ tripadvisor 0.8 │ tomtom 0.75
wikidata 0.75 │ osm 0.7 │ existing 0.6 │ website 0.6 │ llm 0.5   (unknown → 0.5)
```

- Confidence = noisy-OR `1 − Π(1−w)`, **conflict penalty ×0.7**.
- `auto_commit` iff `confidence ≥ 0.85` **and** zero conflicting sources; else `triage`.
- **`HIGH_RISK_FIELDS = {name, latitude, longitude, category}`** — only a conflict on these gates to
  review. Everything else auto-flows, by policy.
- Comparators: coordinates round to **~110 m** (`Math.round(v*1000)/1000`); URLs compare on domain;
  phone/email normalised; numbers cluster within `tolerance`.
- Closure needs **≥2 distinct sources** to set `closed_at`; one signal sets `needs_attention` only.

**Coverage signal:** `venue_field_provenance` spans **1,885 distinct venues (7%)**;
`venue_consensus_audit` holds **6 rows**. That is expected, not broken — the audit table only logs
conflict, triage and closure, so a unanimous field never produces a row. **Use the provenance
distinct-venue count as the coverage metric; the audit row count is not one.**

> **Array fields can never conflict, and for accessibility that is a defect.** `kind:'array'` fields
> **union** their contributors and every source counts as agreeing. So OSM `wheelchair=no` and
> Google `wheelchairAccessibleEntrance=true` would **both survive on the same venue**, and because
> arrays never conflict it would auto-commit at high confidence rather than gate to review. This is
> latent only because the column is empty. **Anything that starts writing accessibility makes it
> reachable** — model the negatives as contradicting pairs first. See §5 phase 1.

### 3.6 Circuit breakers — two places, and one alone is silent

`checkCircuit` returns `{allowed: true}` when the row is **absent**. An unseeded breaker can never
trip; `wikipedia.api`, `wikidata.api` and `osm.nominatim` were unprotected for their whole lives for
exactly this reason. A new API needs **both**:

```ts
await withCircuitBreaker(supabase, 'my.api', () => fetch(url))
```
```sql
SELECT public.register_circuit_breaker('my.api', 5, 300);  -- idempotent
```

**`api_circuit_breakers.last_success_at` is not a freshness signal.** A source whose success path
never calls `recordSuccess` leaves it frozen forever. `ilga_graphql` reads **2026-04-21** while ILGA
actually ran at **02:00 today** and updated 239/250 countries — this document's own author misread
it as a four-month outage during planning. **Judge freshness on the entity column the source
writes** (`countries.lgbti_data_last_updated`), never on the breaker row.

**A swallowed per-item error makes auto-pause structurally unreachable** (triaged 2026-08-30).
`source-eventbrite:54` and `source-foursquare:80` wrapped each breaker call in a `try/catch` that
only `console.error`s, then returned `{success:true, items:0}` at HTTP 200. `recordFailure` has
already run inside the breaker by then, so the two layers disagree by construction — measured on
prod from one 12:30 cron firing:

| layer | reading |
|---|---|
| `api_circuit_breakers.eventbrite` | 500 failures, `state=open`, `last_failure_at` 12:30:04 |
| `admin_automation_runs` | `status='success'`, `consecutive_failures=0`, 12:32:00 |

The run row even stores the response verbatim. A 200 **resets** `consecutive_failures`, so
`auto_pause_threshold=3` could never fire and `ev_fill_eventbrite` stayed enabled through 500
consecutive failures. **`source-awin` is the control that proves the mechanism:** identical adapter
shape, but its breaker call is *not* inside a per-item catch (`source-awin:57`), the throw reaches
the handler, it returns 500 — and it auto-paused at 33. Same difference, opposite outcome.

Corollary: **`items_failed: 0` in a `source-*` response is a hardcoded literal, not a measurement.**

Dispositions:

- **`eventbrite` — RETIRED** (`20261107100000`). `eventbriteapi.com/v3/events/search/` returns
  `404 NOT_FOUND` with *and without* credentials — the 404 precedes auth, so no key can fix it;
  Eventbrite removed public event search from v3 and there is no successor. `success_count` was 0
  from the day the breaker row was created. The cron is unscheduled and the registry row disabled;
  the `events-ingestion-bulletproof` DAG node is left in place and neutered at the function level
  (`RETIRED` flag → `skippedResponse`), because editing `nodes`/`edges` to excise one source risks a
  live pipeline's topology for nothing.
- **`foursquare` — NOT dead, and it was never a code fault or a missing key.** The legacy host
  answers `401 {"message":"Invalid request token."}` identically with a key and without one, so the
  350 failures are indistinguishable from a rejected credential; `places-api.foursquare.com` is
  alive and needs a new service key plus an `X-Places-Api-Version` header. It has **no cron** — the
  callers are the `venue-ingestion-unified` (03:00) and `hotel-ingestion-pipeline` (04:00) DAG
  nodes. The breaker burn is fixed (a 401/403 is now `InvalidCredentialsError`, raised *outside* the
  breaker → skipped 200, the same contract a missing key already had). Reviving the source itself is
  a scoped port plus a paid key, and remains a product decision.
- **`awin` — behaving correctly.** Its cron auto-paused; the `marketplace-ingestion` DAG (04:00)
  still calls it, which is why the breaker kept ticking after the pause. Pausing a fill cron does
  not stop a DAG node.

### 3.7 Sentinel blind spots

`check-pipeline-health.mjs` and `pipeline_hygiene_stats()` do **not** watch:

- `venue_field_provenance` / `venue_consensus_audit` — a consensus triage backlog is invisible
- `geo_places` / `geo_landmark_profiles`
- `api_circuit_breakers` state in general — only the single `llm.nvidia` row, warn-only. **A breaker
  stuck open on `wikipedia.api` would go unnoticed.**
- `llm_budget` exhaustion

Three of the four roadmap phases land inside these blind spots. Each phase must ship its sentinel.

---

## §4 — Safety, privacy, ethics

### 4.1 Hostile jurisdictions — what is enforced

One predicate, `location_is_high_risk(country_id, city_id)`, resolving country via city when needed:
`lgbti_criminalization->>'legal' = 'false' OR lower(->>'death_penalty') = 'yes'`. Each entity carries
a denormalized `safety_gated` boolean maintained by a BEFORE trigger, plus
`recompute_safety_gated_for_country()` fired from a trigger on `countries.lgbti_criminalization` —
so a law change re-gates the whole corpus without a backfill.

Two enforcement surfaces, because one is not enough:

1. **RLS** on venues/events/organizations/hotels — `NOT safety_gated OR auth.uid() IS NOT NULL`.
   Covers direct PostgREST reads and the SECURITY-INVOKER `search_events`.
2. **The search proxy** runs with a service key and would bypass RLS, and its body `user_id` is
   spoofable — so `search_documents` carries its own mirrored `safety_gated`, the discovery RPCs
   exclude gated rows by default, and the worker **verifies the caller's JWT fail-closed** before
   passing `include_gated`.

Gated entities become non-indexable to anonymous crawlers. That is intended.

**The ingestion-side decision this does not make for you.** Gating protects a venue *already in the
corpus*. Adding a **new source** that names underground spaces in a criminalizing jurisdiction
widens real-world exposure regardless of gating — the data now exists, is backed up, and is one
misconfiguration from being public. A new source covering such jurisdictions requires an explicit
decision recorded in its migration, not a default. **The safe default is not to ingest.**

Corollary from the same family: **archiving a parent entity un-gates its children**, and 246 of 250
countries have dependents. Never soft-delete a country without checking what it gates.

### 4.2 PII — community submissions vs. open-database ingestion

These are different trust domains and must not share a path:

- **Open-database ingestion** (`ingestion_staging`, `source_type` per feed) carries no personal
  data by construction. Business contact details are public-record.
- **Community submissions** arrive via `workers/submit` with a verified Supabase JWT, land in the
  same staging table with `source_type='user_submission'` **plus submitter columns under RLS**, and
  pass the same normalize → dedupe → review-gate → commit path. The submitter identity never
  travels into the entity row.
- **Auto-approval of a submission is bounded by `isMinorEdit()`** — no `name`/`title`/`latitude`/
  `longitude`/`city_id`/`country_id`/`address` key, ≤3 keys total — even for trusted users. A trusted
  contributor cannot silently relocate a venue.
- **Profile anonymisation is a KEEP-list, deny-by-default.** Adding a column to `profiles` does not
  opt it into scrubbing; it must be named.

### 4.3 Decoupling sensitive queries

A user's search for PrEP access, an asylum route, or a venue in a criminalizing country must not
become a third-party log entry:

- **Never proxy a user query to an external API.** Every external call in this document runs from a
  **cron-driven batch job over the whole corpus**, never per-request. Preserve that property — it is
  the strongest privacy guarantee here, and it is structural rather than promised.
- Geocoding of user-entered addresses uses our own instances where configured
  (`NOMINATIM_URL`/Photon) rather than a public endpoint.
- Embeddings for search run through our Cloudflare account; the query text is not sent to a
  third-party analytics surface.
- **Residency exception, documented not hidden:** the NVIDIA NIM free tier is US-based and receives
  trip prompts and `intimate-moderation` text. Recorded in
  `docs/dependency-audit/data-flow-map.md`. `NVIDIA_DISABLED=1` is the instant off switch.

### 4.4 Accessibility claims are a safety surface

The migration that introduced the negative vocabulary states the stake: *"a wrong access claim
strands a disabled person at a door they cannot get through."* Hence:

- `not-wheelchair-accessible`, `not-step-free`, `no-accessible-restroom` are **first-class values**,
  never collapsed into absence.
- LLM-extracted accessibility is **always** review-gated, never auto-published — unlike amenities,
  which auto-apply at ≥0.8. Keep this asymmetry.
- Absence of data renders as honest absence, never as "not accessible".

---

## §5 — Roadmap

Ordered by measured impact, not by catalog order. Each phase states entry measurement, exit
measurement, and the sentinel — because §3.7 shows three of them land in blind spots.

### Phase 1 — Accessibility contract (highest measured impact)

**Entry:** 6 / 26,867 venues (0.02%); 277 / 47,838 events (0.58%); 20,600 geocoded venues addressable.

1. Extend `NormalizedItem` with an accessibility channel — the shared contract for every `source-*`
   function, so this is the change that needs the most care.
2. Teach `source-osm-venue` the **full** `wheelchair` vocabulary (`yes`/`limited`/`no`/`designated`)
   and `toilets:unisex`/`unisex` → `gender-neutral-restroom`.
3. Invert OSM from discovery to **coordinate-keyed enrichment** over the 20,600 geocoded venues
   (§3.2 query A). Discovery is saturated; this is where the value is.
4. Second ready path: **740 venues already carry a real Google `platform_ids.google`**, so
   `amenity-truth-backfill`'s `places` mode costs only the Details fetch, not place-id resolution.

> **Blocking design constraint.** Resolve the array-union defect in §3.5 **before** any accessibility
> write lands. Today a venue could publish `wheelchair-accessible` and `not-wheelchair-accessible`
> simultaneously, at high confidence, without ever gating to review. Model negatives as
> contradicting pairs in the comparator. This is not a follow-up; it is a precondition.

**Exit:** accessibility coverage on geocoded venues, plus zero venues holding a contradicting pair.
**Sentinel:** a contradicting-pair count in `pipeline_hygiene_stats()`, **zero-tolerance, no
baseline** — the `stranded_human_approved` pattern, where 14 rows hid under a 3,500-row floor for 40
days.

### Phase 2 — Legal corroboration — **DONE 2026-08-30**, and three of its premises were wrong

Shipped: `20260830131211` (disposition + sentinel), `20260830132243` / `20260830132442` /
`20261103100000` (fact drift), `20260830132743` (Equaldex retirement), plus territory
inheritance in `import-ilga-data`. Design: `docs/superpowers/specs/2026-08-30-legal-corroboration-phase-2-design.md`.

**What the measurement changed — keep these, they are the reusable part:**

1. **Not an `a2_code` join failure.** ILGA returns 239 national jurisdictions, 239 distinct
   codes, zero nulls — 100% hit rate. The 11 are simply outside its corpus. The
   discriminator is **having a distinct legal system**, not being a dependent territory.
2. **Not stale — empty, and always were.** `lgbti_criminalization = '{}'`, `equality_score`
   NULL on all 11. The `2026-04-21` stamp was seed data, never a successful run.
3. **The live defect was a fail-open**, not the empty columns. `(…->>'legal') = 'false'`
   against `'{}'` is `NULL` → not high risk, so Western Sahara would have published venues
   **ungated**. Now `legal:false, disputed:true` — gate verified firing on prod.
4. **Equaldex is closed on LICENCE, not HTTP** — see §1.5. The old migration's reason was
   measured false, which is what kept inviting a re-enable.
5. **`is_enabled=false` is not a kill switch.** `scrape-web-sources` drops the
   `.eq('is_enabled', true)` filter when invoked with an explicit `sourceSlug`/`sourceId`.

**Exit, as met:** **250/250 accounted for, 0 silent skips** — deliberately *not* "250/250
fresh". Six countries keep their old timestamp because nothing checked them and there is
nothing to check; stamping them fresh would record an observation that never happened.
244 are stamped nightly (239 ILGA + 5 inherited), 6 carry a recorded decision.

**Sentinel:** `country_rights_unaccounted` in `trust_safety_gate_status()` — critical,
zero-tolerance, no baseline. Keys on *a recorded disposition*, with a 30-day threshold so a
one-night ILGA outage cannot trip it while a permanently skipped country must.

**Still open, deliberately:** the corroborator is decided but unbuilt (§1.5); the
`rights_verdict_general` engine is incoherent (10 countries at `equality_score = 100` split
across four verdicts — Norway, Sweden, France, Germany, UK and Canada all publish as
`hostile`), tracked separately; and `anon` holds `TRUNCATE` on 464 tables, which RLS does
not gate, also tracked separately.

**Also still open — a UI bulk toggle can silently revert a migration's decision.**
`20260330600000` disabled six `scrape_sources` rows; all six read `true` afterwards. The
mechanism is `SourcesTab.tsx:103` and its **bulk** sibling at `:114`
(`update({ is_enabled }).in('id', ids)`) — `scrape-web-sources` never writes `is_enabled`, and
no applied migration mentions `equaldex-api` besides the seed and `20260330600000`, so the admin
UI is the only candidate and six rows flipping together is the shape of one multi-select.
**`scrape_sources` has no history table**, so nothing records who or when; the only reason this
was reconstructable is that the migration touched six rows at once and its `scrape_config` half
survived as a control (see the archived Phase 2 notes below for that reasoning). Two traps worth
carrying: an **empty `statements` array is not evidence a migration never ran** (115 of 1424
applied migrations are empty), and **`is_enabled = false` is not a kill switch** —
`scrape-web-sources` drops the `.eq('is_enabled', true)` filter entirely for an explicit
`sourceSlug`/`sourceId`, so a disabled source still runs on demand.

<details>
<summary>Original Phase 2 plan, for the record</summary>

**Entry:** ILGA healthy (239/250 nightly); **11 countries** persistently skipped, stamped
`2026-04-21`; the Equaldex rights arm registered, enabled, and **dead since 2026-04-16**.

1. Diagnose the 11. They are almost certainly dependent territories that fail the `a2_code` join —
   the same class that hid 36 missing capitals.
2. **Do not scope this as "wire Equaldex." The blocker is the licence, and it cannot be engineered
   around** (`20260830132743`, 2026-08-30). `20260330600000`'s stated reason — "no public API
   exists (returns 403/404)" — is **false and was actively harmful**: `/api/region?regionid=us`
   returns **401**, i.e. the API exists and wants a key, so anyone re-reading that reason would
   reasonably go looking for the moved endpoint. The real blocker is that Equaldex's terms are
   non-commercial-only and forbid storing the data beyond **30 days**, which is structurally
   incompatible with `countries` being the durable store behind `location_is_high_risk()`,
   `safety_gated` and RLS. Scraping the region pages breaks the same terms plus an
   anti-replication clause, so option (b) is **closed**, not merely fragile. Resolve the fork
   explicitly:
   (a) licence a real Equaldex feed, (b) scrape region pages — fragile, and the dead row is evidence
   of how that goes, or (c) pick a different corroborator. Until one is chosen, **the honest state
   is that the platform's highest-stakes data has a single source**, and the document should keep
   saying so rather than implying a fix is queued.
3. Whichever source lands: where it disagrees with ILGA on a criminalisation field, **flag, never
   overwrite**.
4. Extend the `safety_notes` country-key check to detect fact drift, not just relink staleness. The
   current key catches a city moving country; it cannot catch a country changing its law.
5. ~~Reconcile the `scrape_sources` drift~~ — **done 2026-08-30** (`20260830132743`). Two
   corrections to the mechanism, because the retirement migration records the opposite of both and
   its version will be the first thing a future reader finds:

   **(a) `20260330600000` DID take effect. Its own contents are the control group.** The migration
   is in `schema_migrations` with an **empty `statements` array**, which looks like proof it never
   ran and is not — 115 of 1424 applied migrations are empty, a bookkeeping artefact of the older
   push/repair paths. Split its effects and they diverge cleanly: its `scrape_config` UPDATEs **are**
   live (`equaldex-timeline` carries `.timeline_item` with the underscore where the seed had a
   hyphen; `wnbr-events` `wiki_list`; `wikipedia-gay-villages` `wiki_country_tables`, last stamped
   2026-03-30 16:32) while **all six of its `is_enabled = false` UPDATEs are not**. It ran, and the
   disables were reverted afterwards — between 2026-03-30 16:32 and 2026-04-16 05:02.

   **(b) A code path in this repo DOES write `scrape_sources.is_enabled`** — the admin toggle at
   `SourcesTab.tsx:103`, and its **bulk** sibling at `:114`
   (`update({ is_enabled }).in('id', ids)`). `scrape-web-sources` genuinely does not (its three
   write-backs set only `last_run_at`/`last_error`/`consecutive_failures`/totals), which is what
   makes the admin UI the only candidate: no applied migration contains the string `equaldex-api`
   besides the seed and `20260330600000`, and six rows flipping together is the shape of one
   multi-select.

   **This is the durable gap, and it is not closed:** a UI bulk toggle can silently revert a
   migration's deliberate decision, and `scrape_sources` has **no history table**, so nothing
   records who did it or when. The only reason this was reconstructable at all is that the
   migration disabled six rows at once and its config half survived as a control.

   **The other five stay as they are, deliberately.** Re-applying a five-month-old decision
   wholesale would destroy working ingest: `eventfrog-lgbtiq` (72 runs, 72 items, last success
   2026-08-29 — repointed at a real JSON feed by `20260822101923`, so its "JS-rendered SPA" reason
   is obsolete) and `gaycities-events` (13 runs, 8 items, last success 2026-08-23) are alive.
   `gaycities-places`, `travelgay-pride` and `mister-bnb` are inert. **A stale disable is as wrong
   as a stale enable.**

   Also recorded there and worth repeating: **`is_enabled = false` is not a kill switch.**
   `scrape-web-sources` drops the `.eq('is_enabled', true)` filter entirely when invoked with an
   explicit `sourceSlug`/`sourceId`, so a disabled source can still be run on demand.

**Exit:** 250/250 fresh; a named decision on the corroborator; ~~the drift reconciled~~ **done**.
**Sentinel:** stale-country count in `check-trust-safety-gates.mjs`.

</details>

### Phase 3 — Harm reduction depth

**Entry:** 476 interaction pairs, loaded once, `fetched_at` 2026-08-15, **no cron**. No dosage,
onset/duration or adulteration table anywhere.

1. Recurring TripSit sync with a breaker, preserving the multi-source `source` column — do not let a
   refresh clobber the eve&rave and FDA rows.
2. Decide whether dosage/adulteration are **structured** (new tables, new ingestion, new
   correctness burden on safety-critical data) or stay prose. This is a product decision with real
   liability, not a schema chore. Recommend structuring **interactions and adulteration only**;
   dosage guidance is where a wrong number does the most harm.

**Exit:** interactions refresh on a schedule and a dated provenance stamp per row.
**Sentinel:** staleness check on `max(fetched_at)`.

### Phase 4 — Transit & mobility

**Entry:** genuinely absent. No GTFS/GBFS table. Transit exists only as
`cityNetworkGeometry.ts` — 6,407 committed lines of homepage decoration, no runtime fetch, no cron.

Largest new build and correctly last: schema, ingestion, late-night-transit and accessible-routing
surfaces. Note the existing mobility-adjacent columns to reuse rather than duplicate:
`user_travel_preferences.preferred_transport`, `trip_places.arrive_mode`,
`geo_city_profiles.transportation_info`.

**Do not scope step-free routing as part of this.** It needs station-level accessibility that OSM
covers unevenly, and shipping a routing promise on partial data recreates the phase-1 harm at
larger scale.

---

## Appendix — measurements, 2026-08-30

```sql
-- Registry
select count(*), count(*) filter (where enabled) from admin_automations;     -- 281 | 258

-- Accessibility (§1.7)
select count(*) filter (where cardinality(accessibility_attributes) > 0),
       count(*) filter (where latitude is not null and category <> 'toilet'),
       count(*) from venues where duplicate_of_id is null;                   -- 6 | 20600 | 26867

-- OSM saturation (§1.1)
select summary from admin_automation_runs
where automation_id = (select id from admin_automations where slug = 'vn_fill_osm')
order by started_at desc limit 5;          -- items_total 120, items_succeeded 0, five nights running

-- Legal freshness (§1.5) — the entity column, NOT the breaker row
select count(*) filter (where lgbti_data_last_updated > now() - interval '2 days'),
       count(*) from countries;                                              -- 239 | 250

-- Harm reduction (§1.4)
select source, count(*), max(fetched_at) from substance_interactions group by 1;
                                            -- tripsit 421 (2026-08-15) | eve&rave 48 | FDA 7

-- Consensus coverage (§3.5)
select (select count(distinct venue_id) from venue_field_provenance),
       (select count(*) from venue_consensus_audit);                         -- 1885 | 6

-- Health directory (§1.3)
select count(*), count(*) filter (where latitude is not null)
from organizations where roles @> array['support'];                          -- 2987 | 719
```

## Related

- `docs/plans/2026-07-25-geo-hierarchy-unification.md` — the `geo_places` spine
- `docs/audits/2026-08-pipeline-overhaul-baseline.md` — pipeline overhaul baseline numbers
- `docs/dependency-audit/data-flow-map.md` — third-party data residency
- `CLAUDE.md` — the pipeline overhaul, truth engines, and the incident history behind §3.3
