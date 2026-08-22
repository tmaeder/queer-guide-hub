# Venue forward geocode — bare-street queries wrote wrong coordinates

**Date:** 2026-08-22
**Function:** `supabase/functions/backfill-venue-cities/`
**Status:** cause fixed and deployed; the historical population is measured but **NOT repaired**

## The defect

Both forward-geocode call sites sent the street address and nothing else:

```ts
const q = encodeURIComponent(venue.address!)
const url = `${NOMINATIM_BASE}/search?format=json&q=${q}&limit=1&addressdetails=1`
```

Nominatim answers a bare street name with whatever street of that name it ranks
highest **anywhere on Earth**. The first hit was written without validation, even
though the venue row already carried `city`, `postal_code`, `country` and
`country_id` — none of which reached the query or gated the answer.

Reproduced live:

```
"Möhnestraße 59"                          -> 51.4584822, 6.8222474 | Oberhausen 46049 DE
"Möhnestraße 59, 59755 Arnsberg, Germany" -> 51.4555545, 7.9688323 | Neheim     59755 DE
```

`KUNST-WERK am Kaiserhaus - Lehrwerkstatt e.V.` was committed from the eventfrog
source with the correct `city='Arnsberg'` and `postal_code='59755'`.
`trg_venue_geocode` fired AFTER INSERT (`city_id` was NULL because the only
`cities` row named Arnsberg is a `tmp-` placeholder that
`commit_venue_staging_item` deliberately skips), this function geocoded the bare
street, and 1.1 s later the row held Oberhausen's coordinates, Oberhausen's
`city_id` and Oberhausen's city text — 85 km away. **The row's own postal code
contradicted the answer and nothing looked.**

This is not only a map-pin problem. `city_id` feeds `safety_gated` through
`location_is_high_risk`, so a wrong country here is a safety-layer fault.

## The fix (deployed, `backfill-venue-cities` v71)

1. **Query composed from the row** — street + `postal_code` + `city`, skipping any
   component the address already spells out.
2. **Country is a `countrycodes=` filter, never a free-text term.** Resolved from
   `country_id` (a real FK), or from `country` text via
   `resolve_country_from_text` — never `upper(country)`, because that column
   mixes ISO-2 with US state codes.
3. **`limit=1` → `limit=5`.** The top hit is a candidate, not a verdict.
4. **Four refusals**, each leaving `latitude`/`longitude`/`city_id` NULL and
   recording the reason in `enrichment_status.geocode`:
   - `postal_mismatch` — leading-4 compare, so NL `1011AB`/`1011AC` and UK
     `SW1A1AA`/`SW1A2BB` pass as one block while `59755`/`46049` does not
   - `country_mismatch` — against the row's resolved ISO-2
   - `locality_fallback` — a settlement-level hit passes both guards above (a
     city centroid **is** in the right city and country) and would re-create the
     pollution `20260827100000_venue_centroid_repair.sql` exists to remove
   - `insufficient_context` — no city, no postcode, no comma in the address
5. **`nominatim_error_*` no longer sets `geocode_attempted`** — a transport
   failure is not an answer and must not burn a venue on a 503.

Same position as the same-name city collision work (`20260802090844`): a null
coordinate is recoverable, a wrong one is not.

## Blast radius

| population | rows |
|---|---|
| `geocode_attempted`, address with neither a postcode nor a comma | **3,588** |
| …of those, carrying coordinates (auditable) | **2,606** |
| …of those, carrying `country_id` / `postal_code` / `city` | 2,606 / 2,398 / 2,569 |
| …carrying no coordinates (the unresolvable residue) | 982 |

## Audit result — DO NOT auto-apply

`mode: 'forward_audit'` re-asks the corrected question and haversines against the
stored coordinate. It is **read-only by design**.

**13 probes at offsets spread across the 10,490-row base set, 197 rows checked:**

| | rows |
|---|---|
| agrees (< 1 km) | 93 |
| `disagrees_far` (≥ 25 km) — unambiguously wrong | **13** |
| `disagrees_near` (1–25 km) — see caveat below | 5 |
| unverifiable | 86 |
| **wrong, of the 111 verifiable** | **18 (16.2 %)** |

Every one of the 18 resolves to a street inside the row's **own** city while the
stored coordinate sits elsewhere. A selection:

| venue | row says | off by |
|---|---|---|
| 30th Street & Lincoln Avenue | San Diego 92101 | **3,806 km** |
| Sexy Shop C'est La Vie | Desenzano del Garda 25015 | 701 km |
| 12 Historic Rte 66 #104 | Flagstaff 86001 | 635 km |
| Treppenhaus | Rorschach 9400 | 618 km |
| Macy's/JCPenny Holyoke Mall | Holyoke 01040 | 425 km |
| Engelsburg | Erfurt 99084 | 285 km |
| Cafe Davids | Vordingborg 4780 | 211 km |
| Dunkin'/Haffner's | Westford 01866 | 4.9 km (a *different* 179 Littleton Rd, in Chelmsford 01824) |

**Do not quote a rate from one probe.** The first probe (offset 0) alone read
4 wrong of 13 verifiable — 31 % — and the next three probes returned **zero**
disagreements in 44 rows. Only the pooled 13-probe sample supports a number, and
it is 16.2 %, not 31 %.

Caveat on `disagrees_near`: several of those five resolve to `addresstype=road`,
i.e. a street midpoint, 1–1.4 km from a stored coordinate that may well be the
precise venue on that same street (Massamara/Barcelona, Parranderías/Acapulco).
Treat **13 of 111 (11.7 %)** as the confident wrong-rate and the near band as
unresolved. Extrapolated over the 2,606 auditable rows that is roughly 150–240
wrong coordinates.

**A rate this high is a finding, not a batch to auto-apply** — a repair rewrites
`city_id`, which feeds `safety_gated`.

### Why the audit reports what it reports

`unverifiable` is not a failure, and it is the largest bucket (86 of 197) by
design. It grew from 2/8 to 7/20 the moment the `locality_fallback` guard landed:
those are rows where the corrected query can only reach the enclosing settlement.
Counting a centroid as agreement or disagreement would have been meaningless
either way. The rest are addresses Nominatim cannot parse at all (see *Known
limits*).

Each audit row carries `row_city`, `row_postal`, the resolved `display_name` and
its `addresstype`, because **a distance alone is unjudgeable**: the question is
never "did the number move" but "which of the two is the venue's town". The first
three disagreements could only be settled by re-querying by hand; that is what
these fields remove.

## Repair procedure (deliberately not run)

There is no batch repair mode and that is intentional. To repair a row, null its
coordinates and re-arm it:

```sql
update venues set latitude = null, longitude = null, geocode_attempted = false
 where id = '<uuid>';
```

then invoke `{"mode":"forward","batch_size":25}`. **Check `city_id` first**:
`trg_venue_geocode` is `AFTER INSERT OR UPDATE OF latitude, longitude, address
WHEN city_id IS NULL`, so on a row whose `city_id` is NULL this statement
re-enters the function immediately. The forward pass only ever *fills* a missing
`city_id`, never re-links an existing one, so a repaired row keeps its city.

Verified this way on `Cafe Davids` as the write-path end-to-end test: query
`Storegade 11, 4780, Vordingborg Kommune`, `state: accepted`, returned postcode
`4780` (exact match), coordinates moved 211 km to Storegade 11C in Stege,
`city_id` untouched.

## Known limits

- **Recall is bounded by the address strings, not by the guards.** Nominatim
  free-text is conjunctive, so any unparseable token zeroes the result:
  `2496 Riva Road, Annapolis` → 1 hit, `2496 Riva Rd, Annapolis` → 0 (`Rd` is
  never expanded), `Kammistrasse 11, Interlaken` → 3 hits,
  `Kammistrasse 11 Interlake, Interlaken` → 0. US-style abbreviations and
  trailing `Unit/Suite/Building` fragments are the main losses. Street-suffix
  expansion was **not** attempted here.
- **The 982 no-coordinate rows are unresolvable residue, not a queue.** Exactly
  one of them has a clean `Streetname 12` address, and that row's city is wrong
  (`Chem. de la Venoge 31` is in Vaud, not Geneva). They have been failing for
  years for good reason.
- `isUsableAddress` (pre-existing) drops any address with no comma, no digit and
  fewer than three words *before* the geocoder sees it, and also drops any
  address equal to the venue name. `Am Kulturgleis 9, 44787, Bochum` resolves to
  a building but never gets asked, because the venue is *named* `Am Kulturgleis
  9`. Now that the query is composed from the row, this heuristic is stricter
  than it needs to be — left alone as out of scope.
