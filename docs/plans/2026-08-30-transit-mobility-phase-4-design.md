# Transit & mobility — Phase 4 design

**Design and costed recommendation. Nothing here is built.** This document exists so the decision
to build or defer can be made on measured numbers rather than on the intuition that a travel
platform ought to know about trains.

Companion to `docs/architecture/open-data-integration.md` §5 Phase 4. Every external number below was
re-measured on **2026-08-30** against the live Mobility Database catalog and two real GTFS feeds;
every internal number is a file path or a query in that document's appendix. The commands are in the
appendix — re-run them rather than trusting the prose.

---

## §0 — Recommendation, up front

**Do not build Phase 4 as scoped. Build a bounded slice of it — "does the last train still run" as a
city fact — and only after Phases 1–3 land.**

Three findings drive that:

1. **The user need that survives scrutiny is one sentence, not a product.** "Can I still get home?"
   is a real and queer-specific safety question. "Plan my journey" is not ours to answer — Google,
   Apple and Citymapper already do it, and §4.3 of the architecture doc forbids us proxying a user's
   query to any of them, which is the platform's single strongest structural privacy guarantee. Once
   journey planning is off the table, what remains is a **fact about a city**, and a fact about a
   city costs a table with roughly 500 rows, not a GTFS stack.
2. **The full build's cost is dominated by data we would throw away.** One metro region's feed
   (Berlin VBB) is **619 MB uncompressed, 5,714,883 `stop_times` rows** — 120× the entire `events`
   table. The derived answer this product needs is **318 rows**. The compression ratio is
   **1 : 17,972**. Everything between those two numbers is cost with no reader.
3. **Phase 1 is worth more per day of work and is a safety surface.** `venues.accessibility_attributes`
   sits at **6 of 26,867 (0.02%)** with the UI already built against it, a consensus receiver already
   wired, and a latent auto-commit defect that publishes contradictory access claims the moment
   anything writes to it. Transit is a convenience feature competing against an accessibility gap
   that already misleads disabled users. That ordering is not close.

If transit is wanted sooner than that ordering allows, **Phase 4a below is the whole of it** — no
routing, no realtime, no per-venue query, ~8–12 working days, ~$1/month running cost.

---

## §1 — Name the need before the schema

The brief asks for the user need first, because "late-night transit near a venue" and "is this
station step-free" are different products. Four candidate needs, scored on whether _we_ are the right
place to answer them.

| #   | Need                                               | Who asks                                               | Can we answer it better than Google Maps?                                                                                                                        | Verdict          |
| --- | -------------------------------------------------- | ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| 1   | **"If I stay for one more drink, am I stranded?"** | Someone in a bar at 00:40 in a city they don't live in | **Yes** — not because our data is better, but because the answer belongs _next to the venue_, before they need it, and it is a **safety** fact for this audience | **BUILD**        |
| 2   | "How do I get from A to B right now?"              | Anyone                                                 | **No.** Journey planning is a solved commodity, and answering it means a per-request call to a third party — see below                                           | **NEVER**        |
| 3   | "Does this city have a metro at all?"              | Trip planning, before arrival                          | Partly — and **we already answer it**, with the network diagram on the city Travel tab                                                                           | Already shipped  |
| 4   | "Is this station step-free?"                       | Disabled travellers                                    | **No, not honestly** — see §8                                                                                                                                    | **OUT OF SCOPE** |

### Why need #1 is queer-specific and not generic travel content

Getting home late is where the risk on this platform concentrates. The last departure is the moment a
night out converts into either a train or a walk through an unfamiliar city — and for the audience
this platform serves, that walk carries harassment risk that a generic travel app has no reason to
frame as a safety decision. The platform already treats the night as a distinct surface: `/going-out`
exists, and its e2e contract requires it to **name the time window it fell back to** rather than
imply completeness (`e2e/intent-nav.spec.ts`, "names the event window it fell back to"). "The last
U-Bahn is at 01:04, and Fri/Sat it runs all night" is the same species of fact as that window — a
concrete boundary on the evening, stated before it matters.

Crucially it is a **fact, not a query**. It can be computed once per feed by a cron over the whole
corpus, which is exactly the property §4.3 demands: _"Never proxy a user query to an external API…
Preserve that property — it is the strongest privacy guarantee here, and it is structural rather
than promised."_

### Why need #2 is disqualified, permanently

A journey planner needs origin, destination and time-of-request. That triple _is_ the sensitive
query: it says where a user is, where they are going, and when. Sending it to any third party — even
a self-hosted OTP instance behind our own domain — converts a structural guarantee into a promise
about configuration. And it would be worse than the alternative it replaces: a user who opens Google
Maps has chosen to; a user whose location leaks through our page has not. **This is not a phasing
decision. Journey planning does not belong on this platform at all.**

---

## §2 — Current state, measured

**Genuinely absent, confirmed.** Zero hits for GTFS, GBFS, MobilityDatabase or Transitland anywhere
in `src/`, `supabase/`, `scripts/`, `workers/`. No table, no adapter, no cron.

**One transit artifact exists, and the brief undercounts it.**
`src/components/home/subway/cityNetworkGeometry.ts` — 6,407 committed lines — holds octilinear
network geometry for **307 cities**, not ~60 (`grep -c "    lines: \[" ` → 307; modes: 162 subway,
92 tram, 53 light_rail). It is generated by the hand-run
`scripts/generate-city-transit-lines.mjs` from OSM route relations, committed rather than fetched.

**And it is not only decoration.** It renders on `/city/:slug` → Travel tab via `CityNetworkPanel`,
where `CityTravelTab.tsx:24-28` states the placement rule explicitly: _"the one section where a
transit map is information rather than ornament."_ So the platform already publishes a transit
claim on 307 city pages — **it just publishes shape and says nothing about time.** Phase 4a adds the
time axis to a surface that already exists, which is why it is small.

### Mobility-adjacent columns — reuse, do not duplicate

| Column                                                    | Shape                                                                          | Live use                                                   | Phase 4a relationship                                                                              |
| --------------------------------------------------------- | ------------------------------------------------------------------------------ | ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `user_travel_preferences.preferred_transport`             | `text[]`, CHECK `<@ {flight,rail,bus,car}`                                     | `TravelPreferencesEditor`, `useTripReservationSuggestions` | **Do not extend.** This is inter-city mode preference (how you get to the city), not urban transit |
| `trip_places.arrive_mode`                                 | CHECK `{walk,transit,drive}`, user override                                    | `LegRow.tsx`, `tripLegs.ts`                                | **Read-only consumer.** See below                                                                  |
| `reservations.type` includes `'transit'`                  | —                                                                              | booking records                                            | Untouched                                                                                          |
| `cities.transportation_info` / `geo_city_profiles` mirror | free-form jsonb, rendered as raw key/value rows by `CityTravelTab.tsx:107-126` | currently holds **only airport lines**                     | **Do not add transit keys here.** See §5                                                           |

**`tripLegs.ts` is the strongest argument that the need is real and the second-strongest argument
that Phase 4 is not the way to meet it.** The trip planner already computes a `transit` leg mode —
from a hardcoded constant:

```ts
/** Effective door-to-door transit speed incl. waiting. */
const TRANSIT_KMH = 16;
```

It has meant "transit" for over a year with no transit data at all, and the UI is required to present
every number as an estimate (`"All numbers are estimates and the UI must present them as such ('~')"`).
That is honest and it works. **Replacing 16 km/h with a real routing engine is need #2 in disguise** —
it would require an origin, a destination and a departure time per leg. Leave `tripLegs.ts` alone.

### The precedent to copy: `airport_service`

`20260929100000_city_airport_service.sql` is the closest working analogue and Phase 4a should be its
sibling, not a novel design. Its shape:

- **A gate table** (`airport_service`, 4,009 rows) seeded from a bulk third-party CSV by an edge
  function (`airport-service-refresh`), holding _only_ rows that pass a quality predicate
  (`scheduled_service='yes'`, real airport types). The pre-existing 9,252-row `airports` table was
  deliberately **not** reused because "its `is_major` flag is false on every row… so it carries no
  quality signal at all."
- **A batched linker** deciding which gate row belongs to which city.
- **A ranking signal that must never become a gate:** `pax_per_year` "is historical, so closed SXF
  still reports 12.8M passengers." Phase 4a has the same shape of trap in `route_type` — see §3.
- **An honesty distinction carried in the data, not the copy:** `20260929100300` split
  `local_airport_codes` from `nearest_airport_codes` + `nearest_airport_km`, and
  `src/pages/city-detail/cityAirports.ts` marks a merely-nearby airport with `~`. Its header states
  the lesson verbatim: what was missing "is not data, it is the DISTINCTION."

**Phase 4a inherits that distinction wholesale.** A city served by a regional feed that happens to
reach it is not the same claim as a city with its own published network, and the schema must be able
to say which.

---

## §3 — What the data actually is (measured, not assumed)

### 3.1 The catalog

Mobility Database `sources.csv`, fetched 2026-08-30: **3,511 rows**, of which **2,476 GTFS static**
and 1,035 GTFS-Realtime. After dropping `deprecated` (643) and `inactive` (189):

| Metric                                               | Value         |
| ---------------------------------------------------- | ------------- |
| Usable GTFS static feeds                             | **1,744**     |
| …requiring no authentication                         | **1,559**     |
| …requiring an API key (`authentication_type` 1 or 2) | **185**       |
| …flagged `is_producer_url_unstable`                  | 65            |
| …marked `is_official`                                | 1,014         |
| Distinct countries                                   | **77**        |
| Feeds in the US                                      | **833 (48%)** |

**The catalog is North-America-weighted and this platform is not.** After the US, the tail is
ES 149 · CA 108 · FR 84 · SE 59 · DE 44 · IT 42 · GB 42 · PL 38 · AU 34. Brazil has 11, Mexico 7,
Japan 4.

GBFS (bike/scooter share), `MobilityData/gbfs/systems.csv`: **1,535 systems**. Noted and rejected in
§5.4.

### 3.2 Coverage against cities this platform actually cares about

Tested a hand-picked list of 72 queer-travel destinations for a country-matched feed whose bounding
box contains the city:

**57 / 72 = 79% covered.**

**No feed found:** Gran Canaria, Mykonos, Stockholm, Istanbul, Reykjavik, Kyiv, Cape Town,
Johannesburg, Nairobi, Tokyo, Osaka, Seoul, Taipei, Manila, Dubai.

**That 79% is not trustworthy in either direction, and establishing why is the single most useful
thing this document does.**

#### Trap A — a bounding box is not coverage (false positives)

The first run of this measurement returned **72 / 72 = 100%**, which should have been the tell. The
cause:

```
DE | Rursee-Schifffahrt KG   | bounding box 55,883 deg²
DE | bodo Verkehrsverbund    | bounding box 13,887 deg²
```

_Rursee-Schifffahrt_ is a **lake ferry operator on a German reservoir**. Its declared bounding box is
large enough to contain Nairobi, Bangkok, Cairo and Mykonos, so a containment test reported every one
of them as covered. 43 of the 1,744 feeds carry a bounding box over 400 deg².

This is the **exact same failure class as `overpass.osm.ch`**: a source that answers confidently,
answers wrongly, and whose wrong answer is indistinguishable from a right one unless you probe it.
The Overpass version cached "no network" for ~450 cities; this version would have published "Nairobi
has transit data" sourced from a German boat.

#### Trap B — absence from the catalog is not absence of transit (false negatives)

**451 of 1,744 GTFS feeds (26%) carry no bounding box at all.** Istanbul's IETT feed is one of them —
free, unauthenticated, active — and the bbox test therefore reported Istanbul as uncovered. It is
not.

**All 59 Swedish feeds require an API key** (`authentication_type = 1`, Trafiklab). Stockholm reads
as uncovered because its feed is behind a credential, not because Stockholm lacks a metro.

Japan has 4 feeds in this catalog; Japanese GTFS lives at `gtfs-data.jp`, outside it.

#### Trap C — a catalog entry is not a file

`tr-istanbul-gtfs-3128` is listed as active with no auth. Its `urls.latest` mirror returns **52
bytes**:

```
No such object: mdb-latest/tr-istanbul-gtfs-3128.zip
```

**The rule these three traps produce, and it governs the whole design:**

> **Coverage is established by parsing `stops.txt` and testing real stop coordinates against our own
> city coordinates. It is never inferred from catalog metadata.** Which means coverage cannot be
> known before ingestion — so the schema must be able to record "we tried and could not" as a
> first-class state, and the UI must render that state distinctly from "we have not tried."

### 3.3 Feed size — this is the storage decision

Two feeds downloaded and unpacked:

| Feed            | Zip   | Uncompressed | `stop_times.txt` | `shapes.txt` | `stops.txt` | `routes.txt` |
| --------------- | ----- | ------------ | ---------------- | ------------ | ----------- | ------------ |
| **Berlin VBB**  | 75 MB | **619 MB**   | **400 MB (65%)** | 179 MB (29%) | 7.4 MB      | **51 KB**    |
| **Chicago CTA** | 93 MB | **422 MB**   | **362 MB (86%)** | 53 MB        | 1.3 MB      | 11 KB        |

Berlin VBB row counts: **42,091 stops · 1,304 routes · 254,159 trips · 5,714,883 stop_times.**

For scale: the entire `events` table is 47,838 rows and `venues` is 26,867. **One European metro
region's timetable is 120× the platform's whole event corpus.** Two feeds are 1.04 GB. The DB is
disk-constrained (CLAUDE.md; it is why the amenity engine deliberately stores no recomputed score on
venues).

### 3.4 Three GTFS traps that bite specifically on the late-night query

Measured on Berlin VBB. Each of these produces a _confident wrong answer_, which is the only kind
worth documenting.

**(1) Extended `route_type` — the base spec values find no metro in Berlin.**

```
1047 × 700   bus (extended)          48 × 900   tram (extended)
  76 × 3     bus (base spec)         45 × 109   suburban rail / S-Bahn
  56 × 100   railway                  9 × 400   urban rail / U-Bahn
  15 × 106   regional rail            8 × 1000  water transport
```

A filter of `route_type IN (0,1,2,3)` — the four values in the GTFS base specification, and the
obvious thing to write — matches **76 of 1,304 Berlin routes (5.8%)** and **zero U-Bahn, zero
S-Bahn, zero tram**. It would report that Berlin has no metro, in exactly the tone of confidence
`overpass.osm.ch` used. The Google extended types (100–1799) are not optional in Europe.

**(2) The GTFS clock runs past 24:00, and 3.47% of Berlin departures are on the far side of it.**

**198,410 of 5,714,883 departures are stamped at hour ≥ 24** — `25:30:00` means 01:30 on the
following calendar day, still belonging to the previous _service_ day. Postgres will reject
`'27:57:00'::time`. A naive parse either throws or silently drops those rows — and the rows it drops
are **precisely the after-midnight service the entire feature exists to publish.** Store seconds
since service-day start (`integer`), never `time`.

**(3) Aggregating by calendar day-class understates the last departure — measured.**

Deriving first/last departure per (mode, calendar day-class) over the full feed produced:

```
mode  | dayclass | lines | first | last
metro | both     |   9   | 03:01 | 27:57      ← 03:57 next morning
metro | weekday  |   9   | 03:52 | 24:42
metro | weekend  |   9   | 03:01 | 24:42
rail  | both     |  71   | 00:00 | 28:25
tram  | both     |  36   | 03:01 | 27:53
```

and per-line weekday figures of `U1 04:05 → 20:21`, `U9 04:11 → 19:30`.

**Berlin's U1 does not stop at 20:21.** The late trips run under a different `service_id` whose
calendar covers both weekdays and weekends, so they land in the `both` bucket — which reaches 27:57
— and vanish from the per-line weekday answer. The error is not random: it is **systematically early,
and it removes the late trips first.** A reader who left a bar at 20:00 because we told them the last
U1 had gone would be acting on our data against their own interest.

The correct unit is a **service date**, not a day-class: expand `calendar` + `calendar_dates` into
real dates, pick representative dates (a Tuesday, a Friday, a Saturday) inside the feed's validity
window, and aggregate over those. This is a genuine design requirement, discovered by running the
naive version rather than by reasoning about it.

---

## §4 — Storage decision

**Static GTFS never enters Postgres. Raw snapshots live in R2; only derived summaries land in the
DB.**

| Option                                | What it means                                                                                | Verdict                                                                                                                                                                                                                                                                        |
| ------------------------------------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **A — GTFS in Postgres**              | `stop_times` as a table                                                                      | **Rejected.** 5.7M rows for one region; 300 regions is ~1.7B rows on a disk-constrained instance. `search_reindex_queue` and the batch-cap discipline exist because a **300-row** events UPDATE costs 14.6s. This is not a tuning problem, it is three orders of magnitude out |
| **B — R2 raw + Postgres derived**     | Snapshot zip in R2, keyed by feed + fetch date; derivation in CI; ~500 rows/region committed | **RECOMMENDED**                                                                                                                                                                                                                                                                |
| **C — link out to a journey planner** | No storage; deep-link to a third party                                                       | **Rejected** — need #2, §1. Also delivers nothing on the one need that qualifies                                                                                                                                                                                               |

**The ratio that settles it:** Berlin VBB is 619 MB and 5,714,883 `stop_times` rows; the derived
summary this product needs is **318 rows**. Everything in between is storage with no reader.

**Where the derivation runs — GitHub Actions, not a Worker, not an edge function.**

- Cloudflare Workers have a 128 MB memory ceiling. Streaming 5.7M CSV rows through one is possible
  but fragile, and the 546s edge wall (the same one `enrichment-driver` publishes a deadline against)
  is uncomfortably close to a large feed's parse time.
- GitHub Actions already runs this repo's heaviest recurring data work ("Scraper: GitHub Actions —
  daily full refresh"), has 7 GB of RAM and a 6-hour ceiling, and is the established home for
  "download something big, derive something small."
- Measured: a raw streaming scan of Berlin's `stop_times` is **39s wall / 14s CPU** on a laptop.
  With per-row CSV parsing and a trip→route lookup, budget **3–6 minutes per large feed.**

**R2 keeps the raw snapshot** so a derivation-logic fix can be re-run without re-fetching 300 feeds
from agency servers — the same reasoning that made `scripts/output/.overpass-cache` and
`--cached-only` load-bearing in the network-geometry script, and for the same reason: the upstream
throttles, so the cache is the input.

---

## §5 — Schema

### 5.1 Two tables. That is the whole schema.

Deliberately modelled on `airport_service` + its linker.

```sql
-- The gate table. One row per feed we have successfully parsed at least once.
-- Mirrors airport_service: a registry of what passed a quality predicate, not
-- a mirror of the upstream catalog.
CREATE TABLE public.transit_feeds (
  feed_key        text PRIMARY KEY,            -- mdb id, or our own slug for a non-MDB feed
  provider        text NOT NULL,
  country_code    text NOT NULL CHECK (country_code ~ '^[A-Z]{2}$'),
  source_url      text NOT NULL,
  licence         text,
  r2_object_key   text,                        -- latest snapshot; null until first success
  feed_start_date date,                        -- from feed_info/calendar, NOT from fetch time
  feed_end_date   date,
  -- Terminal states are first-class. "We tried and it 404'd" must be
  -- distinguishable from "we never looked" — the airport_service and
  -- city-fields-backfill lesson: a missing value should be a recorded decision.
  parse_status    text NOT NULL CHECK (parse_status IN
                    ('ok','fetch_failed','unparseable','auth_required','no_stops')),
  parse_note      text,
  stop_count      integer,
  fetched_at      timestamptz,
  parsed_at       timestamptz
);

-- The derived product. One row per (city, mode, service-date class, route).
CREATE TABLE public.city_transit_service (
  city_id           uuid NOT NULL REFERENCES public.cities(id) ON DELETE CASCADE,
  feed_key          text NOT NULL REFERENCES public.transit_feeds(feed_key) ON DELETE CASCADE,
  mode              text NOT NULL CHECK (mode IN ('metro','tram','rail','ferry','bus')),
  route_ref         text,                      -- "U1", "S7" — null for a mode-level roll-up
  day_class         text NOT NULL CHECK (day_class IN ('weekday','friday','saturday','sunday')),
  -- SECONDS since service-day start, never `time`: 3.47% of Berlin departures
  -- are at hour >= 24 and `'27:57:00'::time` throws.
  first_departure_s integer NOT NULL CHECK (first_departure_s >= 0),
  last_departure_s  integer NOT NULL CHECK (last_departure_s  >= 0),
  runs_all_night    boolean NOT NULL DEFAULT false,   -- span covers 24h, or a gap < 60 min
  trip_count        integer NOT NULL,
  -- The airport_service DISTINCTION, carried in the data rather than the copy.
  --   'local'    the feed's stops are inside this city
  --   'regional' a regional feed reaches it — must render as "~" / "serves"
  service_scope     text NOT NULL CHECK (service_scope IN ('local','regional')),
  derived_at        timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (city_id, feed_key, mode, coalesce(route_ref,''), day_class)
);
```

**Sizing:** Berlin rail-only at route level across four day-classes ≈ 700 rows. At 300 covered
cities that is **~200k rows, single-digit MB** — the same order as `airport_service`. Bus routes are
excluded from v1 (1,047 of Berlin's 1,304 routes; nobody asks "what time is the last bus" about a
city they are visiting, and including them multiplies the table by 6 for no reader).

### 5.2 What is deliberately NOT built

- **No `stops`/`stations` table in v1.** "Nearest station to this venue" needs ~3k rail stops × 300
  cities = ~900k rows plus a spatial index on a disk-constrained DB, and it only pays off once a
  venue page renders it. Defer to 4b, decide it on evidence that 4a is read.
- **No realtime (GTFS-RT).** It is a per-request external call by nature — need #2.
- **No writes to `cities.transportation_info`.** That column is free-form jsonb rendered as raw
  key/value rows by `CityTravelTab.tsx:107-126`, and `20260929100200` had to hand-repair six rows
  where the previous free-form writer left Berlin advertising three closed airports. A typed table
  cannot rot that way. Its header states the standing rule: nothing there "is hand-written prose…
  but a rule that overwrites unconditionally would also overwrite the first hand-edited line
  somebody adds."
- **No new `venues.category`, no new `place_type`.** A station is not a venue and not a landmark.

### 5.3 Reuse ledger

| Existing thing                                | Phase 4a does                                                                          |
| --------------------------------------------- | -------------------------------------------------------------------------------------- |
| `cityNetworkGeometry.ts` (307 cities)         | **Joins to it by `cities.slug`.** The diagram gets a time caption; nothing regenerates |
| `CityTravelTab` / `CityNetworkPanel`          | The only render site in v1                                                             |
| `trip_places.arrive_mode`                     | Untouched. `tripLegs.ts` keeps `TRANSIT_KMH = 16`                                      |
| `user_travel_preferences.preferred_transport` | Untouched — inter-city, wrong axis                                                     |
| `airport_service` pattern                     | Copied structurally                                                                    |

### 5.4 GBFS — assessed and rejected for now

1,535 systems, small JSON, no `stop_times` — an order of magnitude cheaper than GTFS. But
`station_status` (the only interesting part: are there bikes right now) is **realtime**, so it is
need #2; and the static half (`station_information`) answers "there is a docking station here",
which nobody plans an evening around. **Revisit only if 4a proves the surface is read.**

---

## §6 — Ingestion cadence, and how it avoids the batch-cap traps

**Nothing about this pipeline touches the hot path.** That is a design goal, not an outcome.

| Stage                 | Where                     | Cadence                                                   | Why                                                                                     |
| --------------------- | ------------------------- | --------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Catalog refresh       | GH Action                 | weekly                                                    | MDB moves slowly; 3,511 rows                                                            |
| Feed fetch → R2       | GH Action                 | monthly per feed, **conditional on ETag/`Last-Modified`** | Agency timetables change seasonally. Fetching 300 unchanged feeds monthly is pure waste |
| Derive → summary rows | Same GH Action job        | on change only                                            | 3–6 min per large feed                                                                  |
| Commit to Postgres    | One RPC per city, batched | on change only                                            | See below                                                                               |

### The batch-cap discipline

The measured constraint is unambiguous: **a 300-row `events` UPDATE costs 14.6s, 13.8s of it the
search trigger**, and the pipeline overhaul decoupled entity writes into `search_reindex_queue`
precisely so that cost stops blocking writers.

**Phase 4a sidesteps it entirely, by construction:**

- `city_transit_service` is **not a search-indexed entity**. It has no `search_documents` indexer, no
  sync trigger, and must never get one — a train timetable is not a search result. So a write here
  enqueues nothing and the whole `search_reindex_queue` question does not arise.
- **`cities` is never UPDATEd by this pipeline.** This is the load-bearing choice. A `cities` UPDATE
  fires `trg_sync_geo_spine` → `geo_places` → `trg_search_documents_city_ins` →
  `search_documents_sync('city')`, which is why `run_city_safety_backfill` is hard-capped at 300
  rows/batch. Writing a separate table keeps transit off that chain completely — the same reasoning
  that made `tag_medical_codes` a separate table rather than a jsonb column on `unified_tags`
  ("measured: queue 7→7, 0 new audit rows… precisely _because_ it writes a separate table").
- Commit is **per city, idempotent, delete-then-insert inside one transaction**, capped at 200
  cities per run. Not because of a trigger — because a runaway loop should be bounded by policy
  regardless.

### Registry contract

One migration, three parts, per `docs/architecture/open-data-integration.md` §3.3 (newest reference
`20261029094600_source_aids_ch_cron.sql`): the `admin_automations` row, a guarded
`cron.unschedule` + `cron.schedule` **derived from the registry row**, the `ingestion_sources` row,
then a `DO $$` block asserting the row exists, is enabled, and the schedule matches — _"because
`20260820191944` issued a `cron.schedule` that silently never took."_

Notes specific to this phase:

- The heavy work runs in **GitHub Actions**, so the pg_cron half is only the commit RPC and the
  staleness sentinel. Both are `action.type = 'rpc'` rows, which **carry no `action.command`** — so
  `sync_automations_to_cron()` structurally cannot reschedule them and the cron must come from this
  migration. Re-enabling such a row later leaves it on-but-unscheduled. Read the `recreated` list.
- The GH Action is **outside `admin_automations` entirely**, which is a gap: the auto-pause/run-
  tracking machinery cannot see it. The sentinel below is therefore mandatory, not optional.
- No credentials for v1 — restrict to the **1,559 unauthenticated feeds**. The 185 key-gated ones
  (all of Sweden) are a per-agency credential-management problem worth its own decision, later. If
  one is ever added, a missing key must return HTTP 200 via `MissingCredentialsError` →
  `skippedResponse`, never an error, or an unset key burns the auto-pause counter.

### Sentinel — shipped with the phase, not after it

§3.7 is explicit that three of four roadmap phases land in sentinel blind spots. Phase 4a's:

- `transit_service_stale` — count of `city_transit_service` rows whose `feed_end_date < now()`.
  **A GTFS feed expires.** A summary derived from a feed whose validity window has passed is not
  stale-ish, it is _wrong_, and it is wrong in the direction of publishing a timetable that no longer
  runs. **Hard fail, no baseline allowance**, in `check-pipeline-health.mjs`.
- `transit_feed_parse_failures` — feeds at `parse_status <> 'ok'` for 3+ consecutive attempts. Warn.
- **Freshness is judged on `city_transit_service.derived_at`, never on a circuit-breaker row.** The
  `ilga_graphql` lesson: `api_circuit_breakers.last_success_at` read 2026-04-21 while the source had
  run at 02:00 that morning, and this document's own predecessor misread it as a four-month outage.

---

## §7 — Coverage honesty

The platform has a working pattern and an e2e contract for this. `/rights` asserts `239 of 250`, and
the test carries its own history: it _"asserted /250 of 250/ until 2026-08-07, which the page
produced by rendering `{countries.length} of {countries.length}` — the same number twice. A tautology
cannot fail."_

### The rule

**Every city page states which of four states it is in. Absence is never rendered as a negative
claim.**

| `coverage_status`                        | Rendered as                                            | Never rendered as                 |
| ---------------------------------------- | ------------------------------------------------------ | --------------------------------- |
| `published` + `service_scope='local'`    | "Last U1: 01:04. Fri/Sat: all night."                  | —                                 |
| `published` + `service_scope='regional'` | "~ Regional rail serves Sitges — last departure 23:40" | a claim the city owns the service |
| `no_feed`                                | "No published timetable for this city."                | ~~"No night service"~~            |
| `feed_unusable` / `not_attempted`        | Nothing at all — the band does not render              | anything                          |

The `~` convention and the local/regional split are lifted directly from `cityAirports.ts`, which
exists because Brighton was publishing "AIRPORT LGW" for a Gatwick 36 km away and _"3,669 of the
4,669 cities carrying a code were naming an airport that is not theirs."_ Sitges and Provincetown
will produce the identical failure with transit if the distinction is not in the schema.

### Which cities would actually be covered

**Honestly: unknown until ingestion runs, and that is a finding, not an evasion** — §3.2 shows the
catalog's own metadata is wrong in both directions. What can be said:

- **Ceiling:** 1,559 unauthenticated GTFS feeds across ~77 countries.
- **Sample:** 57 of 72 hand-picked queer destinations (79%) have a country-matched feed, with the
  caveats above — Istanbul is a false negative, Stockholm is credential-gated, Rursee-Schifffahrt
  makes several of the 57 suspect until parsed.
- **Realistic v1 target:** the **307 cities that already have network geometry**. They are the
  cities with rapid transit worth naming, they already render a transit band, and the join key
  (`cities.slug`) exists. Anything beyond that is expansion, not launch.
- **Structural gaps that will not close:** Japan (4 feeds; national data is at `gtfs-data.jp`),
  Korea, Taiwan, most of Africa, most of the Gulf. Several are also criminalizing jurisdictions where
  §4.1's _"safe default is not to ingest"_ applies to the **venues**, though not to a city-level
  timetable, which names no queer space and adds no exposure.

### Assertions to ship with it

- Unit: seconds-based storage round-trips an after-midnight departure (`27:57` → 100,620 → renders
  `03:57 (+1)`).
- Unit: the extended-`route_type` mapper classifies 400/109/900 as metro/rail/tram. Pin the Berlin
  distribution — a regression here silently empties Europe.
- E2E, mirroring the `/rights` contract: a covered city states a time; **an uncovered city states
  that it is uncovered**, with a pinned count (`"Timetables for N of 307 cities"`) that moves when
  the data moves. Not `{n} of {n}`.

---

## §8 — Out of scope: step-free routing

**Explicitly excluded, permanently as scoped, and the exclusion is a safety decision.**

Per the brief and independently supported by what the feeds contain:

- Station-level accessibility in OSM is uneven, and GTFS's own accessibility fields are weaker than
  they look. Berlin VBB _does_ ship `wheelchair_accessible` on `trips.txt`, plus `pathways.txt`
  (9.7 MB) and `levels.txt` — but that is **vehicle** accessibility and an in-station graph, not an
  answer to "can I complete this journey." Most feeds ship neither. Chicago CTA ships no `pathways`
  at all.
- A routing promise is a **chain** claim: every hop must hold. Partial data does not degrade
  gracefully — one unmapped lift converts a correct-looking route into someone stranded underground.
- This is the same harm as Phase 1 at larger scale, and this repo has already written the rule down:
  _"a wrong access claim strands a disabled person at a door they cannot get through"_ — which is why
  `not-wheelchair-accessible` is first-class vocabulary, LLM-extracted accessibility is **always**
  review-gated, and absence renders as absence.

**What is not excluded, later:** publishing a per-station accessibility _attribute_ (a fact, review-
gated, absence honest) once Phase 1 has established the contract. A fact about one station is
falsifiable by one visit. A route is not.

---

## §9 — Cost

### Running cost — negligible

| Line            | Basis                                                      | Monthly    |
| --------------- | ---------------------------------------------------------- | ---------- |
| R2 storage      | 300 feeds × ~30 MB avg ≈ 9 GB @ $0.015/GB-mo               | **~$0.14** |
| R2 operations   | ~300 writes + reads/month                                  | **<$0.01** |
| Postgres        | ~200k rows, single-digit MB, no index churn                | **$0**     |
| GitHub Actions  | ~100 changed feeds × ~5 min = 500 min/mo (free tier 2,000) | **$0**     |
| Third-party API | 1,559 unauthenticated feeds; no keys                       | **$0**     |
| LLM             | none — this is deterministic parsing                       | **$0**     |

**Under $1/month.** Cost is not the reason to defer.

### Build cost — this is the real number

|                                                                                   | Days     | Notes                                                                       |
| --------------------------------------------------------------------------------- | -------- | --------------------------------------------------------------------------- |
| **Phase 4a** — catalog + fetch + derive + 2 tables + city band + sentinel + tests | **8–12** | Bounded. The derivation is written and measured (§3.4); the traps are known |
| **Phase 4b** — station table, venue-page "nearest station", spatial index         | +8–15    | ~900k rows; needs evidence 4a is read                                       |
| **Full Phase 4 as originally scoped** (routing, realtime, accessible routing)     | +40      | And two of its three components are disqualified on principle, not budget   |

**Compare:** Phase 1 (accessibility) is ~10–15 days for a 0.02% → meaningful move on a **safety**
column with the UI already built. Phase 3's TripSit refresh is ~3 days for safety-critical data that
has been frozen since 2026-08-15 with no cron.

### Risk of building it

- **The derivation is subtly wrong and ships anyway.** §3.4(3) is exactly this, caught only by
  running it. The output is plausible in every case — `U1 → 20:21` looks like a timetable.
- **Feeds expire silently.** Mitigated by `feed_end_date` + a zero-tolerance sentinel; unmitigated
  it publishes a dead timetable indefinitely, the same shape as the 86 safety notes that described
  the wrong country's laws because _"a derived field that is never revalidated against its input"_.
- **Scope creep toward routing.** Every stakeholder who sees a last-departure time asks for a
  journey planner within a week. §1 needs to be the answer, in writing, before the first line.

---

## §10 — Phased build order

**Phase 4a — "Can I still get home?" (the whole recommendation)**

1. Catalog sync → `transit_feeds` from MDB `sources.csv`. Unauthenticated GTFS only.
   `parse_status` starts `not_attempted`; **a bounding box is never used to decide coverage** (§3.2).
2. GH Action: conditional fetch → R2. Record `fetch_failed` on a 52-byte answer rather than
   retrying forever (Trap C).
3. Derivation, with all three §3.4 traps handled: extended `route_type` map, seconds-not-`time`,
   **service-date expansion, not day-class**. Golden-file test pinned to the Berlin feed.
4. Coverage resolution: parse `stops.txt`, match stops to `cities` coordinates. **Never resolve by
   name alone** — `cities` cannot represent same-name twins, and a null is recoverable where a wrong
   link is not. `local` vs `regional` decided here.
5. Commit RPC → `city_transit_service`, batched, idempotent, **no `cities` UPDATE**.
6. Render on `CityTravelTab` beside the existing diagram. Four coverage states, `~` for regional.
7. Sentinel + unit + e2e per §6/§7.

**Gate before 4b:** is the band read? If the city Travel tab's transit band gets no engagement,
**stop here** — the station table costs more than the whole of 4a and pays off only through a surface
nobody visited.

**Phase 4b — stations (conditional).** `transit_stations` (rail modes only), "nearest station" on
venue pages, per-station accessibility **as an attribute, never a route**, after Phase 1's contract
lands.

**Never:** journey planning, realtime arrivals, step-free routing.

---

## §11 — Recommendation against the other open phases

| Phase                          | Entry state                                                                                                                               | Stake                                                  | Days                                     | Recommended order                          |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ | ---------------------------------------- | ------------------------------------------ |
| **1 — Accessibility**          | 6/26,867 venues (0.02%); UI live against an empty column; array-union defect will publish contradictory claims the moment anything writes | **Safety.** A wrong access claim strands someone       | 10–15                                    | **1st**                                    |
| **3 — Harm reduction refresh** | 476 pairs, loaded once, `fetched_at` 2026-08-15, **no cron**                                                                              | **Safety.** Drug-interaction data going stale silently | ~3 for the refresh cron                  | **2nd** — cheapest safety win on the board |
| **2 — Legal corroboration**    | ILGA healthy but **single-sourced**; 11 countries stale since 2026-04-21; Equaldex arm dead and re-enabled by something unknown           | **Safety.** Highest-stakes data on the platform        | 5–20, mostly blocked on an external fork | **3rd**                                    |
| **4a — Transit**               | Genuinely absent; 307 cities already render a network diagram with no time axis                                                           | Convenience, with a real safety edge at 2am            | 8–12                                     | **4th**                                    |
| **4b / routing / realtime**    | —                                                                                                                                         | —                                                      | 40+                                      | **Not scheduled / never**                  |

**Phase 4 is correctly last, and the reason is sharper than "it is the largest build."** It is last
because the three phases above it are all _safety_ surfaces already publishing to users — an
accessibility badge matching against an empty column, an interaction table that stopped refreshing,
and a legal corpus with one source — while Phase 4 is a surface that does not exist yet and whose
absence misleads nobody.

The one thing worth doing early, if anything: **spend half a day writing §7's coverage contract into
`e2e/intent-nav.spec.ts` as a pending test.** It costs nothing and it means that whenever 4a is
built, it cannot ship the `{n} of {n}` tautology that `/rights` shipped for months.

---

## Appendix — re-runnable measurements

All external numbers below were produced on 2026-08-30. Scratch scripts are not committed; the
commands reproduce them.

```bash
# Catalog: 3,511 rows; 2,476 GTFS static; 1,744 usable; 1,559 no-auth; 77 countries; 833 US
curl -sL -o mdb.csv \
  "https://storage.googleapis.com/storage/v1/b/mdb-csv/o/sources.csv?alt=media"

# GBFS: 1,535 systems
curl -sL https://raw.githubusercontent.com/MobilityData/gbfs/master/systems.csv | wc -l

# Feed size — Berlin VBB: 619 MB unpacked, stop_times.txt 400 MB (65%)
curl -sL -o vbb.zip \
  "https://storage.googleapis.com/storage/v1/b/mdb-latest/o/de-berlin-verkehrsverbund-berlin-brandenburg-gtfs-782.zip?alt=media"
unzip -l vbb.zip | sort -k1 -rn | head
unzip -p vbb.zip stop_times.txt | wc -l          # 5,714,883
unzip -p vbb.zip stops.txt      | wc -l          #    42,092
unzip -p vbb.zip routes.txt     | wc -l          #     1,305

# Trap: extended route_type — base-spec values match 76 of 1,304 routes, zero U-Bahn
unzip -p vbb.zip routes.txt | awk -F',' 'NR>1{print $5}' | sort -n | uniq -c | sort -rn
# 1047×700  76×3  56×100  48×900  45×109  15×106  9×400  8×1000

# Trap: 3.47% of departures are at hour >= 24
unzip -p vbb.zip stop_times.txt \
  | awk -F',' 'NR>1{h=substr($8,1,2)+0; if(h>=24) n++; t++} END{print n, t, 100*n/t}'
# 198410 5714883 3.47

# Trap: bbox coverage — a German lake ferry (bbox 55,883 deg^2) "covers" Nairobi.
#   raw bbox containment  -> 72/72 (100%, false)
#   + country_code match  -> 57/72 (79%)
#   451 of 1,744 feeds carry no bbox at all (Istanbul among them -> false negative)
#   all 59 SE feeds are authentication_type=1 (Stockholm -> false negative)
```

```sql
-- Internal, from docs/architecture/open-data-integration.md
select count(*) filter (where cardinality(accessibility_attributes) > 0),
       count(*) from venues where duplicate_of_id is null;   -- 6 | 26867  (Phase 1)
select source, count(*), max(fetched_at) from substance_interactions group by 1;
                                                             -- tripsit 421 @ 2026-08-15 (Phase 3)
```

```bash
# Committed transit artifact: 307 cities, not ~60
grep -c "    lines: \[" src/components/home/subway/cityNetworkGeometry.ts        # 307
grep -o "mode: '[a-z_]*'" src/components/home/subway/cityNetworkGeometry.ts \
  | sort | uniq -c                                    # 162 subway, 92 tram, 53 light_rail
```

## Related

- `docs/architecture/open-data-integration.md` — §1 matrix, §3.2 Overpass traps, §3.3 registry
  contract, §5 roadmap
- `scripts/generate-city-transit-lines.mjs` — the Overpass lessons this design must not rediscover
- `supabase/migrations/20260929100000_city_airport_service.sql` — the gate-table + linker precedent
- `src/pages/city-detail/cityAirports.ts` — the local-vs-nearest honesty pattern, reused in §5.1
- `src/components/trips/tripLegs.ts` — why `TRANSIT_KMH = 16` stays
- `e2e/intent-nav.spec.ts` — the `/rights` coverage contract §7 mirrors
