# Overture Places → venue category match (operator one-shot)

Matches `venues.category='other'` rows against the open **Overture Maps Places**
theme (which has absorbed the Foursquare OS Places POIs since 09/2025) and derives
category decisions. First run 2026-08-24 against release `2026-08-19.0`:
4,924 candidates with coordinates → 2,027 matched (41%) → 929 categorized
(618 auto + 311 band-accepted reviews), `other` 12,714 → 6,886 over the whole
2026-08 category program. Cost: $0, ~20 min. Re-run against each new Overture
release (roughly monthly) to pick up newly added POIs.

## Prerequisites

- `duckdb` (`brew install duckdb`) with `httpfs` + `spatial` extensions (auto-installed below)
- Supabase access for the candidate export and the apply step (MCP `execute_sql` or psql)
- Latest release name: `curl -s "https://overturemaps-us-west-2.s3.amazonaws.com/?list-type=2&delimiter=/&prefix=release/" | grep -o "<Prefix>release/[^<]*"`

## Traps (measured, do not rediscover)

1. **FSQ OS Places itself is gated on Hugging Face and its S3 bucket is emptied** —
   Overture is the ungated route to the same POIs.
2. **Do NOT chunk the remote scan by bbox.** With candidate cells scattered globally,
   row-group pruning buys nothing: 78 chunked queries ≈ 8 h. One full-pass scan with
   projected columns + a local cell-key hash join: **15 min**.
3. **Empty-normalization JW trap:** `regexp_replace(name,'[^a-zA-Z0-9]+',' ')`
   collapses Cyrillic/CJK names to empty and `jaro_winkler('','') = 1.0` — a
   translation bureau matched a deli. Require `length(norm) >= 3` on both sides.
4. **Auto-apply needs the archived-nonvenue guard** (`nonvenue_candidate.status='confirmed'`
   OR `review_status='archived'`): such rows still carry `category='other'` and show up
   in the candidate set.
5. jw ≥ 0.92 lets "Rosapark" ≈ "Rosa Parks Bakery" through — auto tier is **jw ≥ 0.95
   AND dist ≤ 100 m**; 0.80–0.95 goes to review.
6. Map Overture slugs → the 17-value vocabulary against the slugs that ACTUALLY occur
   (measure first): `salad_bar`/`sandwich_shop` are restaurants; churches, landmarks,
   government, orgs, `party_and_event_planning` stay unmapped; **sauna/bathhouse never
   auto-applies** (asserts a sexual venue type).

## Pipeline

1. Export candidates (id, name, lat, lng) for `category='other'`, `duplicate_of_id IS NULL`,
   coordinates present → `candidates.csv`.
2. Load into a DuckDB file, derive 0.05° cells + 3×3 neighborhood (`cells9`).
3. Single pass (adjust the release path):

```sql
INSTALL httpfs; LOAD httpfs; INSTALL spatial; LOAD spatial;
SET s3_region='us-west-2'; SET preserve_insertion_order=false;

CREATE TABLE candidates AS SELECT * FROM read_csv('candidates.csv', header=true);
CREATE TABLE cells9 AS
  SELECT DISTINCT floor(lat/0.05)::int + dy AS clat, floor(lng/0.05)::int + dx AS clng
  FROM candidates, (VALUES (-1),(0),(1)) d1(dy), (VALUES (-1),(0),(1)) d2(dx);

CREATE TABLE matches AS
SELECT ca.id AS venue_id, ca.name AS vname,
       p.name AS oname, p.cat AS ocat, p.conf AS oconf,
       111320.0 * sqrt( (p.lat-ca.lat)^2 + ((p.lng-ca.lng)*cos(radians(ca.lat)))^2 ) AS dist_m,
       jaro_winkler_similarity(
         lower(regexp_replace(ca.name, '[^a-zA-Z0-9]+', ' ', 'g')),
         lower(regexp_replace(p.name,  '[^a-zA-Z0-9]+', ' ', 'g'))) AS jw
FROM (
  SELECT pp.name, pp.cat, pp.lat, pp.lng, pp.conf
  FROM (
    SELECT names.primary AS name, categories.primary AS cat,
           ST_Y(geometry) AS lat, ST_X(geometry) AS lng, confidence AS conf
    FROM read_parquet('s3://overturemaps-us-west-2/release/2026-08-19.0/theme=places/type=place/*.parquet')
    WHERE categories.primary IS NOT NULL AND names.primary IS NOT NULL
  ) pp
  JOIN cells9 c ON floor(pp.lat/0.05)::int = c.clat AND floor(pp.lng/0.05)::int = c.clng
) p
JOIN candidates ca
  ON abs(p.lat - ca.lat) < 0.002 AND abs(p.lng - ca.lng) < 0.003
WHERE dist_m <= 200 AND jw >= 0.80;
```

4. Best match per venue (`row_number() OVER (PARTITION BY venue_id ORDER BY jw DESC, dist_m ASC)`),
   map `ocat` → the 17 values (hand CASE over the occurring slugs; see the 2026-08-24 run
   in the session memory `overture_places_matching`), tier:
   - length(norm) < 3 either side → drop
   - mapped NULL or sauna → drop / review
   - jw ≥ 0.95 AND dist ≤ 100 → **auto**
   - else → **review**
5. Apply on Supabase, batched ≤330 rows/statement, guards on every UPDATE:
   `category='other'`, no `category_backfill.decided_by`, NOT nonvenue-confirmed,
   NOT archived. Auto tier writes `category` + provenance
   (`category_backfill: {to, source:'overture-places', confidence, overture_category, dist_m}`);
   review tier writes the suggestion shape (`suggested`, `status:'review'`) + `needs_attention`.
6. Review-band triage (optional second pass): accept jw≥0.90 & ≤50 m (except `outdoor`
   mapping — ferries/lakes mis-hit), identical-name & 100–200 m, queer ocats ≥0.85,
   jw≥0.93, name-prefix containment ≤50 m — via `decide_venue_category(id, true, NULL, note)`.
   Leave the ambiguous residue for the human panel (measured ~65% precision — too low).

Attribution: Overture Maps data is CDLA-Permissive 2.0 / Apache 2.0 (FSQ-sourced rows);
category values derived from it carry provenance in `enrichment_status.category_backfill`.
