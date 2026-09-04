# POI match rate — measured on Germany, 2026-09-04

**Question this answers.** P3 of the public-dataset plan assumes bulk map extracts can fill
`hours` / `accessibility_attributes` / `phone` / `website` for ~22,050 venues. The deployed
per-venue Overpass matcher resolves **2.7%**. Is that the ceiling, or an artefact? Nothing
in P3 should be built until this number exists.

**Answer.** 2.7% is an artefact. Replaying the *identical* production rule against a bulk
extract yields **20.6% (OSM) / 26.0% (Overture) / 36.0% union** on Germany, at **100%
precision on 22 hand-read matches**. Loosening the rule to de-spaced and core-token name
equality reaches **48.0% union at ~96–98% precision**. Beyond that, precision falls fast
and the increments are systematically wrong in one identifiable way.

**Recommendation: build P3 at reduced scope.** Two sources, exact + de-spaced + core-token
name equality inside 250 m. Do not ship the token-subset tier and do not ship a
wide-radius fallback. Expect **~7,300 of the top-10 countries' 14,858 coordinate-bearing
venues** to resolve, not 22,050.

---

## 1. What was measured

| | |
|---|---|
| Population | German venues with coordinates and `duplicate_of_id IS NULL`: **1,648** (2,687 German venues total; 2,090 with coordinates). The plan's "1,664 with coordinates" is the same cohort ±16. |
| Gaps in that population | `hours` present on 34 (97.9% missing) · `accessibility_attributes` on 13 (99.2% missing) · `phone` on 907 · `website` on 1,121 |
| Source 1 | **OSM** — Geofabrik `germany-latest.osm.pbf`, 4.83 GB, md5-verified. 1,462,428 named POIs, of which 1,462,070 are nodes — the way layer is missing, see §4. 727,309 fall under the production `amenity\|tourism\|leisure` filter. |
| Source 2 | **Overture Places** 2026-08-19.0 — 2,974,889 POIs inside Germany. |
| Source 3 | **Foursquare OS Places — could not be obtained.** See §6. |
| Hand-read sample | **116 matches** (72 OSM, 44 Overture), stratified by which rule tier first produced them. |

Name keys are faithful ports of the production code: `normalizeName`
(`_shared/venue-pipeline-utils.ts`), `dedup_despace` and `dedup_core_tokens`
(`20260623150504_unified_dedup_name_keys.sql`). Distances use `haversine_m`.

---

## 2. Per-strategy yield and precision

Strategy **A0 replays production verbatim**: candidates within 60 m carrying
`amenity|tourism|leisure`, name test `normalizeName(tags.name) === normalizeName(venue.name)`,
exactly one hit accepts, more than one **blocks**. Each later row adds one change.

### OpenStreetMap (nodes only — see §4)

| # | strategy | matched | recall | blocked | precision (weighted) | hand-read correct/total |
|---|---|---|---|---|---|---|
| a0 | production rule, verbatim | 339 | **20.6%** | 3 | **100%** | 14/14 |
| a2 | + wide tag filter at 60 m | 408 | 24.8% | 1 | 100% | 24/24 |
| b | + distance-ranked to 250 m | 430 | 26.1% | 1 | 99.0% | 32/34 |
| c1 | + de-spaced / core-token equality | 530 | 32.2% | 4 | 97.8% | 45/48 |
| c2 | + token-subset | 687 | 41.7% | 18 | 95.1% | 57/62 |
| e | + exact name anywhere within 25 km | 709 | 43.0% | 42 | 94.0% | 63/72 |

### Overture Places

| # | strategy | matched | recall | blocked | precision (weighted) | hand-read correct/total |
|---|---|---|---|---|---|---|
| a0 | production rule, verbatim | 429 | **26.0%** | 2 | **100%** | 8/8 |
| a2 | + wide tag filter | 433 | 26.3% | 0 | 100% | 12/12 |
| b | + distance-ranked to 250 m | 467 | 28.3% | 1 | 100% | 20/20 |
| c1 | + de-spaced / core-token equality | 594 | 36.0% | 1 | 94.7% | 26/28 |
| c2 | + token-subset | 854 | 51.8% | 25 | 96.3% | 34/36 |
| e | + exact name within 25 km | 896 | 54.4% | 47 | 93.5% | 37/44 |

### Union of the two sources

| strategy | both | OSM only | Overture only | **either** | **union recall** |
|---|---|---|---|---|---|
| a0 | 174 | 165 | 255 | 594 | **36.0%** |
| b | 219 | 211 | 248 | 678 | 41.1% |
| c1 | 333 | 197 | 261 | 791 | **48.0%** |
| c2 | 546 | 141 | 308 | 995 | 60.4% |

Precision is *weighted*: each tier's hand-read rate applied to that tier's real population.
Per-tier samples are 8–14, so individual tier rates carry wide intervals; the cumulative
figures are the ones to quote.

**Every row above is CUMULATIVE** — each is "matched by this rule *or any stricter one*",
which is what the leading `+` in the labels means. Read standalone instead, the per-tier
numbers are lower (OSM a2 is 407 alone against 408 cumulative), because a venue the strict
rule matched can be *blocked* by a looser one that surfaces a second candidate. The
cumulative reading is the right one for costing — a production run applies the tiers in
order and keeps the first hit — but the two must not be mixed in one table.

All three tables were re-derived from the saved databases after the report was written.
The per-source columns and every **union recall** figure reproduce exactly. The
both / OSM-only / Overture-only decomposition moves by ≤2 rows (≤0.12 pp) depending on
whether the intermediate 150 m tier is folded into `b`, so **quote the `either` column,
not the split** — the split is indicative, the union is the measurement.

---

## 3. Where the loose tiers break — and it is not random

The precision loss above 250 m and below exact-name equality has **three named shapes**,
each found by reading the matches:

1. **Objects named after the venue.** At 250 m OSM offered `tourism=information` for
   *Waldbühne* (a signpost about the amphitheatre) and `amenity=parking_entrance` for
   *Kulturbrauerei* (the car park). Both were the only same-named candidate, so the
   ambiguity guard could not fire. Overture got *Waldbühne* right at the same distance —
   the two sources fail differently, which is exactly why consensus is worth having.
2. **An organisation matched to its host venue.** `Queergestreift Film Festival / co Zebra
   Kino` → `Zebra-Kino`; `XPOSED Film Festival c/o Moviemento` → `Moviemento`. The token
   subset is real and the coordinates are 0–2 m apart. It is still wrong: writing the
   cinema's opening hours onto a festival record is a category error, and these rows are
   the `nonvenue_candidate` question, not an enrichment one. This shape is **detectable**
   from the venue name alone (`c/o`, ` co `, `Festival`, `e.V.`).
3. **A shared generic token.** `Allee Bar` ↔ `Café Allee` (both reduce to `{allee}`,
   150 m); Overture's `Best Of` ↔ `BEST` at 207 m, confidence 0.33.

**A second, independent metric says the same thing without any hand-reading.** For venues
matched by *both* sources, how often do the two matched POI names agree?

| strategy | matched by both | same de-spaced name | agreement |
|---|---|---|---|
| a0 | 174 | 174 | **100.0%** |
| b | 218 | 213 | 97.7% |
| c1 | 331 | 264 | **79.8%** |
| c2 | 544 | 302 | **55.5%** |

At the token-subset tier the two sources disagree about *what was matched* on nearly half
of the venues they both claim to have matched. That is a measurement, not a threshold, and
it is available in CI on every future run.

**The 25 km tier is the worst of the lot and it was the one built specifically for the
centroid-geocoded cohort.** Its increment scored 60% (OSM) and 37.5% (Overture): it
returned an artwork 22 km away for *Sechserbrücke*, `pinocchio-potsdam.de` for a Berlin
`Pinocchio`, and a takeaway for the *Metropol*. It also produced the two most useful
findings in the whole sample — `BAR SAINT JEAN` and `Cosmic Ware` matched a POI 8.6 km and
6.3 km away **with an identical website**, which means our stored coordinate is wrong. That
is a data-repair signal, not an enrichment path, and it should be routed to review, never
auto-applied.

---

## 4. The OSM figure is a floor: the way layer is missing

DuckDB's bundled GDAL reads OSM polygons only for files it can cache whole. Bremen (21 MB)
returns 224,154 ways; **Berlin (99 MB), Hamburg (53 MB), Saarland (54 MB) and
Schleswig-Holstein (157 MB) all return zero ways with no error**, and no combination of
`OSM_MAX_TMPFILE_SIZE`, `OSM_COMPRESS_NODES`, `OSM_USE_CUSTOM_INDEXING` or `CPL_TMPDIR`
changes it. This is the same class as the Overpass empty-200: a silent partial result that
reads as data. **A production implementation must use `osmium tags-filter` / `osmium
export`, not GDAL via DuckDB.**

The gap was measured rather than assumed, by fetching Berlin's way and relation POIs from
Overpass (16 tiles, 17,116 elements) and re-running both variants on the 667 Berlin venues:

| strategy | nodes only | nodes + ways | OSM uplift | union uplift |
|---|---|---|---|---|
| a0 | 156 | 174 | +11.5% | +3.4% |
| b | 200 | 228 | +14.0% | +2.9% |
| c1 | 238 | 268 | +12.6% | +2.2% |
| c2 | 304 | 338 | +11.2% | +0.7% |

So the single-source OSM column understates by ~12%, but the **union understates by only
1–3%** — Overture already carries most of what OSM's polygons add. Corrected union recall:
**a0 ≈ 37%, c1 ≈ 49%, c2 ≈ 61%.**

---

## 5. What a match is actually worth

Fields the matched POI carries that the venue does not (union of both sources):

| strategy | venues matched | + hours | + accessibility | + phone | + website |
|---|---|---|---|---|---|
| a0 | 594 | 218 | 234 | 143 | 110 |
| b | 677 | 275 | 286 | 169 | 126 |
| **c1** | **791** | **348** | **359** | **202** | **149** |
| c2 | 995 | 444 | 465 | 296 | 219 |

**`hours` and `accessibility_attributes` come from OSM alone.** Overture Places has no
`opening_hours` field and no wheelchair attribute at all — its schema is
`names / categories / confidence / websites / emails / socials / phones / brand / addresses /
operating_status / taxonomy`. This settles open question 1 in the plan: **there is no
ODbL-free path for the two largest gaps.** Overture and Foursquare can carry phone,
website, category and a closure signal (`operating_status`); they cannot carry hours or
accessibility. Attribution must be arranged, or those two fields do not get filled.

Consensus is nonetheless real: **Overture's German rows contain zero OpenStreetMap-sourced
records** (`meta` 1,674,608 · `Foursquare` 650,218 · `Microsoft` 587,259 · `AllThePlaces`
38,105 · `Krick` · `PinMeTo` · `DAC`). The two sources are genuinely independent, so
`_shared/venue-consensus.ts` voting between them is defensible rather than double-counting.
At c1, **331 of 791 matches (42%) are corroborated by both sources**.

---

## 6. Foursquare OS Places is no longer freely downloadable

The plan lists it as "106M POIs, monthly Parquet on S3, Apache 2.0". Measured today:

- `s3://fsq-os-places-us-east-1/` contains **exactly two objects** — `LICENSE.txt` and
  `NOTICE.txt`. Every documented `release/dt=…/places/parquet/…` key returns 404, including
  the `vector-tiles` path named in Foursquare's own docs.
- The data now lives at HuggingFace `foursquare/fsq-os-places` (100 files, 11.5 GB,
  `dt=2026-08-11`). The API reports `"gated": "auto"` and an anonymous fetch returns
  **HTTP 401 — "Access to dataset foursquare/fsq-os-places is restricted."**

The licence is still Apache-2.0, so it remains the most permissive option *if* an account
and token are provisioned. But it is no longer a keyless bulk download, which is what the
plan assumed, and a GitHub Actions job would need an HF token as a secret. In the meantime
650k of the German Overture rows are Foursquare-sourced, so its content is reachable under
CDLA-Permissive without the token.

---

## 7. Why the deployed matcher gets 2.7% and this gets 20.6%

Same rule, same country's data, 7.6× apart — and the bulk figure is a *floor* because it
excludes OSM ways. The rule is therefore not the binding constraint. The plan's own P0
already documents what is: `venue_accessibility_osm` was firing every 20 minutes with
`items_examined: 0`, 13 consecutive failures, HTTP 504 after ~152 s, one 200 in eight
hours, and 137 of the 916 lifetime probes classified upstream-busy. **A bulk extract has no
transport to fail.**

Two caveats stated rather than buried: the 916 production probes were **global**, this
measurement is **German**, and I could not verify which venues the production selector
chose (it may be biased toward low-quality rows). Germany is mid-pack on every structural
risk factor that can be measured across the corpus, so it is not a flattering choice:

| | US | DE | ES | GB | FR | CH | BR | IT | MX | CA |
|---|---|---|---|---|---|---|---|---|---|---|
| venues with coords, non-dup | 6,107 | 1,648 | 1,315 | 1,285 | 1,255 | 901 | 761 | 555 | 542 | 489 |
| share on a shared coordinate | 8.0% | **8.0%** | 11.0% | 9.0% | 11.6% | 23.3% | 14.6% | 5.6% | 20.1% | 8.2% |
| `category = 'other'` | 15.5% | **18.2%** | 11.3% | 16.9% | 9.2% | 50.2% | 16.2% | 10.6% | 13.1% | 14.9% |
| name carries cruft (`\|`, `e.V.`, `@`, `c/o`, GmbH) | 1.6% | **12.4%** | 0.7% | 1.6% | 1.3% | 2.3% | 0.4% | 1.8% | 0.6% | 2.0% |

Germany has the **worst** name hygiene of the ten and average centroid-clustering.
Switzerland (23.3% shared coordinates, 50.2% `other`) and Mexico (20.1%) are the two that
should be expected to underperform.

**Transferability was checked, not assumed.** The same code, Overture only, against Great
Britain's 1,285 coordinate-bearing venues:

| | a0 | c1 | c2 |
|---|---|---|---|
| Germany (Overture only) | 26.0% | 36.0% | 51.8% |
| **Great Britain (Overture only)** | **25.1%** | **39.7%** | **51.4%** |

Two structurally different corpora, within 1–4 points at every tier.

---

## 8. The ceiling is set by the corpus, not by the sources

653 venues remain unmatched after the union at c2. Reading them is the most useful part of
this exercise:

- **41** have no POI of any kind within 250 m — the coordinate is wrong or the place is rural.
- **543** sit among more than five OSM POIs and still match nothing. Something is there; our
  row does not describe it.
- **146** are named like organisations or events, not places: `CSD Jena e.V.`,
  `Christopher Street Day Freiburg e.V.`, `Verein Arosa Gay Ski Week`, `King Ludwig Cup 2026`,
  `PiepShow Party`, `Organisation Winter Pride`. In a 28-row read, **13 (46%)** were of this
  kind. Two of them are not even in Germany (Arosa is Swiss, Oetz is Austrian).
- **210** are legacy `spartacus` rows, most plausibly closed or renamed.

Match rate by provenance makes the point sharply:

| data_source | unmatched | share of that source |
|---|---|---|
| `unknown` | 268 | **70.3%** |
| `spartacus` | 210 | 33.4% |
| `tripadvisor` | 24 | 51.1% |
| `google` | 32 | 38.1% |
| `patroc` | 31 | 28.7% |
| **`siegessaeule`** | 19 | **13.9%** |

A curated city-guide source matches at 86%. The `unknown`-provenance cohort — which is
where the organisations and event series live — matches at 30%. **The single biggest lever
on the achievable rate is not the matcher; it is splitting non-venues out of `venues`.**
The plan already flags this as "a `nonvenue_candidate` question, not an enrichment one".
It should be sequenced *before* P3, not after.

---

## 9. Recommendation

**Build P3, at reduced scope.**

**Ship:**
- Two sources: OSM via Geofabrik + **osmium** (not GDAL/DuckDB — see §4), and Overture
  Places, taking only the 2 of 16 partition files that intersect the target country
  (Germany needed 1.3 GB of 10.5 GB; the release is spatially partitioned and the covering
  files are found by reading `bbox` statistics).
- Match tiers **exact name → de-spaced → core-token equality, inside 250 m**, nearest wins,
  two distinct same-named candidates block and write nothing. Expected **~48–49% of
  coordinate-bearing venues at ~96–98% precision**.
- **Persist the external id into `venue_sources` (`source_slug`, `source_entity_id`) on
  every match, including the ones that fill nothing.** The current
  `venue-accessibility-osm` resolves an OSM element id on every run and discards it. The
  identity is the expensive part; the fields are cheap. This is what makes P4 an id lookup
  rather than a permanent re-guess, and it is what stops the namesake-chimera class.
- Auto-apply only where a field is **empty**; require cross-source agreement to *override*
  an existing value, per the plan's own posture. 42% of c1 matches have both sources.
- Publish the **cross-source name-agreement rate** as a sentinel (§3). It caught the
  quality cliff without any hand-reading and will keep doing so.

**Do not ship:**
- **Token-subset matching.** It nearly doubles the increment (791 → 995) but its errors are
  the organisation-matched-to-its-host-venue shape, and cross-source agreement collapses to
  55.5%. If it is wanted later, gate it on the venue name *not* containing `c/o`, ` co `,
  `Festival`, `e.V.`, and route it to review rather than auto-apply.
- **The 25 km / city-wide fallback.** 60% and 37.5% precision on its increment. Its real
  value is the opposite of what it was built for: an exact name plus an identical website
  8 km away is evidence **our coordinate is wrong**. Route those to `entity_review_queue`
  as a geo-repair signal.

**Sequence before P3:** the non-venue split. 146 of the 653 unmatched rows are named like
organisations or events, and the `unknown`-provenance cohort is 70% unmatched. Every point
of ceiling bought there is bought once and helps every later phase.

**Expected outcome, stated as a forecast and not as a candidate count.**

| | venues with coords, non-dup | matched at c1 (~49%) |
|---|---|---|
| Germany (measured) | 1,648 | 791 → ~808 with ways |
| Top-10 countries | 14,858 | **~7,300** |
| Whole corpus (~22,050) | 22,050 | **~9,000–10,000** |

The whole-corpus row is the least certain: only DE (both sources) and GB (Overture only)
were measured, and the non-top-10 tail has thinner Overture coverage. Field-level yield,
scaling Germany's per-match gain across the top ten: roughly **3,200 hours · 3,300
accessibility · 1,900 phone · 1,400 website**.

**This is worth building.** It is a third of the plan's headline candidate counts, not the
whole of it — but 3,200 opening-hours and 3,300 accessibility values against a corpus that
has 34 and 13 of them in Germany today is a step change, it arrives at measured 96–98%
precision, and once `venue_sources` carries the ids every subsequent refresh is free.
What is *not* worth building is anything that depends on reaching 22,050.

**Where this sits relative to work already in flight.** P0–P2 of the same plan are open as
**#3370** — it retires the `venue_accessibility_osm` cron, points `source-osm-venue` at the
hardened Overpass helper, adds `external_correction_audit` (the batch-revertible before-image
the plan calls the must-build item), and lands the P2 deterministic city joins. Its own
migration comment already describes the successor as a join "which matches once and PERSISTS
the OSM element id into `venue_sources`" — that persistence is stated as intent there and is
**not yet implemented anywhere**. It is the first thing P3 should carry, and it is worth doing
even for the matches that fill no field, because identity is the expensive half.

---

## 10. Verified against production, 2026-09-04

Every live-state claim above was re-derived from production after the report was
written — 17 checks, all passing, read-only throughout. The counts in §1 and the
top-10 base in §9 came back **identical, drift 0**, so nothing here is a stale snapshot.

| check | result |
|---|---|
| matchable German venues | 1,648 ✓ |
| …with `hours` / `accessibility_attributes` / `phone` / `website` | 34 / 13 / 907 / 1,121 ✓ |
| top-10 coordinate-bearing, dedup-free | 14,858 ✓ (US 6,107 · DE 1,648 · ES 1,315 · GB 1,285 · FR 1,255 · CH 901 · BR 761 · IT 555 · MX 542 · CA 489) |
| Foursquare S3 keys under `release/` | 0 ✓ |
| Overture 2026-08-19.0 `theme=places` partition files | 16 ✓ |
| HuggingFace `foursquare/fsq-os-places` gating | `auto`, anonymous fetch 401 ✓ |
| `queer.guide` `/`, `/venues`, `/cities`, `/tags/interactions`, `/sitemap.xml` | 200 ✓ |
| `/venue/<slug>` for a real German row | 200 ✓ |

**Two positive controls earned their place, and one of them failed first.** The
Foursquare "bucket is empty" claim is an absence, so the check also asserts the bucket
still answers with its two remaining keys — and that control **failed on the first run**,
which exposed that `grep -c` counts *lines* while S3 returns its whole XML on one line.
The same bug was silently reporting Overture's 16 partition files as "1". The absence
assertion had been passing for the wrong reason. Likewise the venue counts assert that
the coordinate filter is live (300 German rows have no coordinates and are excluded);
without it, a filter typo that matched nothing would have read as perfect agreement.

**One trap for whoever writes the fill query:** `venues.accessibility_attributes` is
**never NULL** — it is an empty array. `not.is.null` returns all 1,648 rows; `not.eq.{}`
returns the 13 that actually carry a value. A gap query written with `IS NULL` finds
nothing and fills nothing, and reads as "no work to do".

---

## 11. Reproduction

Measurement code (DuckDB SQL + shell) is in the session scratchpad, not committed: name-key
macros (`lib.sql`), PBF extraction (`extract_osm.sql`, `osmconf.ini`), source shaping
(`mkpoi_osm.sql`, `mkpoi_ov.sql`), the matcher (`match.sql`, `match_a0.sql`, `match_e.sql`)
the two hand-read verdict files (`verdicts_osm.csv`, `verdicts_ov.csv` — 116 rows with a
one-line reason each) and the production verifier from §10 (`verify_prod.sh`, 17 checks,
read-only). Nothing was written to the database.

Two environment notes for whoever rebuilds this in CI: `getaddrinfo` was blocked in this
sandbox, so every fetch resolved via `dig` and `curl --resolve`; and Geofabrik 302-redirects
to a mirror on a different host, which `curl -L` cannot follow under that workaround.
