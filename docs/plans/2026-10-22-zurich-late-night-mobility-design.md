# Zürich late-night mobility — OpenTrafficMap + Swiss open data

## Status (2026-10-23)

| Step | State | Where |
|---|---|---|
| 0 — OTM site survey + opentransportdata API key | **Blocked on hardware / registration.** No receiver in Zürich; no API key in repo or CI secrets. | — |
| 1 — Timetable fact + VBZ punctuality | **Live in 9 Swiss cities** (Zürich, Geneva, Bern, Basel, Lausanne, Winterthur, Luzern, St. Gallen, Lugano; 2,358 rows). Zürich: 577 rows (weekly GH Action), 163 rows with 2023 punctuality (42 lines). `/city/zuerich` Late night block, `/going-out?city=zuerich` Getting home. | #4559, migration `99991792699660` |
| 1b — German cities | **Shipping.** Same weekly Action reads gtfs.de (DELFI, CC BY 4.0) for Berlin, Cologne, Munich, Hamburg, Frankfurt, Stuttgart, Nürnberg, Hannover, Düsseldorf, Dresden (stops within 5 km of the centre). Night lines by name (`N12`, `NE1`); long-distance trains (ICE/IC/EC/NJ/FLX, Swiss route_type 101/102) and rail-replacement buses (`S8` bus) never count as a city's last departure; trips past 30:00 ignored (multi-day coaches). | `feat/late-night-germany` |
| 2a — Shared bikes & e-scooters | **Live, all of Switzerland.** ~22k vehicles, ~7.9k cells, `*/5`. Map overlay (Filters → Getting around) + venue fact. | #4568, migration `99991792696992` |
| 2b — Disruptions (SIRI-SX / GTFS-SA) | **Not built** — needs the opentransportdata.swiss API key (Step 0). | — |
| 3 / 4 — OTM receiver, live trams, community node | **Not built** — gated on the Step 0 survey. | — |

Verified on prod by `e2e/zurich-late-night-mobility.spec.ts`. Measured traps worth keeping:
- A fixed 05:00 night cutoff read every Zürich tram's last departure as 04:59 (Saturday's first tram) → gap-based service end.
- `/car|moped/` matched "CargoBike" and dropped all 7,967 Velospot bikes → whole-name match.
- GBFS `free_bike_status` already includes docked bikes; adding `station_status` would double count.
- VBZ SOLL/IST contains no night lines; the punctuality figure covers regular service only and says so.

## Context
Goal: deeply integrate OpenTrafficMap (OTM) into Queer.Guide, combined with other open data, starting in
Zürich. The user need it serves (from `docs/plans/2026-08-30-transit-mobility-phase-4-design.md` §1):
**"If I stay for one more drink, am I stranded — and if so, how do I get home?"** — a safety fact for this
audience, stated next to the venue before it matters.

Decisions taken:
- OTM data has no licence/public API → we use only what **our own receiver** hears (Zürich site).
- No public source shows C-ITS broadcasts in Zürich → OTM is **gated on a site survey**; if silent, its role
  goes to Swiss open data.
- Sources combined (all open): **GTFS timetable**, **disruptions (SIRI-SX / GTFS-RT Service Alerts)**,
  **shared bikes/scooters (sharedmobility.ch GBFS)**, **VBZ scheduled-vs-actual (Stadt Zürich, CC0)**, **OTM receiver**.

Hard constraints:
- `docs/architecture/open-data-integration.md` §4.3: never proxy a user query to an external API. Every
  external call is a server-side batch; the browser only ever reads **our** shared data.
- No journey planning, no step-free routing (phase-4 design §1, §8).
- Privacy: from OTM keep only ETSI stationType 6 bus / 11 tram / 15 RSU (+ SPaT/MAP); drop everything else
  **at the bridge, before storage**. From GBFS drop vehicle IDs.
- Workers quota: no per-page-view Worker hits → live data is served from Postgres via PostgREST, not a Worker.
- Licence duties: credit opentransportdata.swiss, sharedmobility.ch (SFOE), Stadt Zürich, OpenTrafficMap;
  derived data refreshed at source frequency (timetable weekly, alerts ~1 min).

## Architecture — two stores, one reader path

| Store | Contents | Writer | Refresh |
|---|---|---|---|
| `city_transit_service` (phase-4 §5.1 schema) + `transit_feeds` | last departure per (city, mode, route, day_class), `runs_all_night`; **+ `on_time_share`, `reliability_period`** (VBZ); **+ `observed_last_seen_s`, `observed_nights`** (OTM, Branch A) | GitHub Action (GTFS too big for an edge fn); one-shot script (VBZ); nightly rollup (OTM) | weekly / once / nightly |
| `transit_live_snapshot` (1 row per city: `payload jsonb`, `generated_at`, `source_ages jsonb`) | `alerts[]` (SIRI-SX, filtered to Zürich lines), `bikes[]` (GBFS, Zürich bbox, `[lat,lng,kind]`, no ids), `vehicles[]` (OTM Branch A only) | edge fn `transit-live-refresh` via pg_cron `* * * * *` (pattern: `supabase/functions/airport-service-refresh`, registration `20260926171619_...`) | 1 min |

Reader: anon RPC `get_city_transit(city_id)` returns both (fact rows + snapshot) in one call.
OTM push: edge fn `otm-ingest` (token-gated) receives filtered batches from our receiver bridge and merges
`vehicles` into the snapshot row.

## Steps

**0 — Survey + access (gate, ~1–2 weeks)**
- Receiver at the Zürich site; `scripts/data-quality/otm-survey.mjs` subscribes our node's own MQTT creds,
  counts (msgType, stationType, hour) for 7 days — counts only, no payloads. Result →
  `docs/audits/2026-11-otm-zurich-survey.md` → **Branch A** (trams/buses heard) or **B** (silent).
- Register opentransportdata.swiss API key (SIRI-SX/GTFS-SA); check whether a GTFS-RT VehiclePositions
  endpoint exists (Branch B's only route to a live vehicle layer).

**1 — Timetable fact + reliability (~8–12 days)**
- Migration (version via `node scripts/next-migration-version.mjs --create transit_city_service`):
  `transit_feeds`, `city_transit_service` (+ the 4 extra columns above), anon read RPC, `admin_automations` row.
- GitHub Action `.github/workflows/transit-gtfs-weekly.yml` + `scripts/transit/build-city-service.mjs`:
  download CH GTFS, derive Zürich rows only, upsert.
- `scripts/transit/backfill-vbz-reliability.mjs` (one-shot): VBZ SOLL/IST 2023 weekly CSVs → per night-line
  on-time share; `reliability_period='2023'` shown in UI so its age is never hidden.
- UI: `useCityTransitService(cityId)` (copy `useCityNearestAirports`) → "Late night" `FactGrid` in
  `src/pages/city-detail/CityTravelTab.tsx` after `CityNetworkPanel`; compact version in
  `src/pages/intent/GoingOut.tsx` safety section. Credits line under both.

**2 — Live snapshot: disruptions + shared bikes (~5–7 days)**
- Migration: `transit_live_snapshot` + extend RPC + cron registration.
- `supabase/functions/transit-live-refresh/index.ts`: SIRI-SX (or GTFS-SA) + GBFS `free_bike_status` /
  `station_status`, filter to Zürich bbox, strip ids, write row; per-source age so one dead source does not
  blank the others.
- UI: "Disruptions tonight" lines in the Late-night block; `/map` layer **Shared bikes** (`LayerType` +
  `LAYER_DEFS` in `src/config/mapLayers.ts` + `MAP_LINES` in `src/components/map/mapDomain.ts`,
  `defaultOn:false`); venue page (`VenueFacts` in `src/pages/VenueDetail.parts.tsx`) "Bikes/scooters within
  300 m now: N" computed **client-side** from the snapshot (no stops table, no external call).
- Every live element shows its age ("updated 40 s ago"); stale >5 min → "No live data now", never blank.

**3 — OTM (Branch A) / positions (Branch B)**
- A: receiver bridge (Pi firmware) → `otm-ingest` (filter enforced again server-side); `/map` layer
  **Trams live**; nightly rollup fills `observed_last_seen_s` shown beside the timetable value
  ("timetable 00:58 · seen until 01:12 on 5 of 7 nights").
- B: only if Step 0 found a VehiclePositions endpoint → same layer fed by `transit-live-refresh`; else skip.

**4 — Community**
- Partner venue hosts the receiver; credit "Live data received at <venue>" with venue link. Short how-to doc
  (OTM wiki + order link + privacy filter rule). No schema.

## Not built
Journey planning, nearest-stop per venue, step-free routing, any car data, multi-city registry tables
(the RPC is keyed by `city_id`, so a 2nd city needs data, not schema).

## Verification
- Migrations dry-run in a rolled-back txn; postconditions assert Zürich rows exist (positive control).
- Unit tests: GTFS derivation (after-midnight `last_departure_s` > 86400), GBFS id-stripping, OTM stationType
  filter (car message dropped), stale-snapshot UI state.
- `check-pipeline-health.mjs` section: snapshot age < 5 min, `transit_feeds.fetched_at` < 14 days.
- e2e on prod: `/city/zuerich` Travel tab shows a real last-departure time + credits; `/map` bikes layer
  toggles; browser network log shows **no third-party request**.
- `npm test`, `npm run typecheck`, `npm run lint`, `graphify update .`.
