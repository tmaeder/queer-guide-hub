-- ============================================================================
-- Placeholder ("tmp-") city remediation — 2026-06-06
-- ============================================================================
-- Trigger: a user reported "Lucerne shows next to Berlin" on the map
-- (/city/tmp-2d2d8059-9a4e-4dcf-97bc-d2ce33ce5e63). Root cause: auto-created
-- placeholder cities (slug 'tmp-<uuid>', all seo_indexable=true) acted as
-- mislabelled / wrong-coordinate buckets and leaked into the explore map,
-- /cities directory, and search. The "Lucerne" record was linked to Germany
-- with Berlin's coordinates and held ~30 Berlin venues plus Potsdam/Brandenburg.
--
-- Pairs with migration 20260606000000_find_nearest_city.sql and the prevention
-- changes in geo-link-content / resolve-or-create-city / backfill-venue-cities /
-- match_personality_city() / commit_venue_staging_item().
--
-- Executed against prod (xqeacpakadqfxjxjcewc) via MCP in ≤500-row batches
-- (search_documents re-index cascade on venue UPDATE hits statement timeouts on
-- bulk writes — see memory queerguide_mgmt_api_timeout_rollback). This file is
-- the documented, reproducible record of what was run.
-- ============================================================================

-- Audit table (reversible): every venue/event city_id change is recorded.
CREATE TABLE IF NOT EXISTS public.geo_relink_audit (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  old_city_id uuid,
  new_city_id uuid,
  method text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ── Phase 1 — relink mis-bucketed venues/events ─────────────────────────────
-- Move content OUT of a tmp city only when there is a confidently better home:
--   1. country-scoped exact name match to a real (non-tmp) city, OR
--   2. nearest real city within 20 km (find_nearest_city) — but only when the
--      content's own city text does NOT equal the tmp city's name (so legit-home
--      content stays for promotion).
-- Run repeatedly until 0 rows; swap `venues`→`events` for the events pass.
WITH cand AS (
  SELECT v.id AS venue_id, v.city_id AS old_city_id,
    CASE WHEN nm.cid IS NOT NULL THEN nm.cid ELSE nn.cid END AS new_city_id,
    CASE WHEN nm.cid IS NOT NULL THEN 'name' ELSE 'coord' END AS method
  FROM venues v
  JOIN cities tc ON tc.id = v.city_id AND tc.slug LIKE 'tmp-%'
  LEFT JOIN LATERAL (
    SELECT c.id AS cid FROM cities c
    WHERE c.slug NOT LIKE 'tmp-%' AND c.duplicate_of_id IS NULL
      AND c.country_id = v.country_id AND lower(c.name)=lower(btrim(v.city))
    ORDER BY c.population DESC NULLS LAST LIMIT 1
  ) nm ON true
  LEFT JOIN LATERAL (
    SELECT fc.city_id AS cid FROM find_nearest_city(v.latitude::float8, v.longitude::float8, v.country_id, 20) fc
    WHERE lower(btrim(v.city)) IS DISTINCT FROM lower(tc.name)
  ) nn ON true
  WHERE nm.cid IS NOT NULL OR nn.cid IS NOT NULL
  LIMIT 200
),
ins AS (
  INSERT INTO geo_relink_audit (entity_type, entity_id, old_city_id, new_city_id, method)
  SELECT 'venue', venue_id, old_city_id, new_city_id, method
  FROM cand WHERE new_city_id IS NOT NULL AND new_city_id <> old_city_id RETURNING 1
)
UPDATE venues SET city_id = cand.new_city_id, updated_at = now()
FROM cand WHERE venues.id = cand.venue_id AND cand.new_city_id IS NOT NULL AND cand.new_city_id <> cand.old_city_id;
-- Result: 175 venues relinked (incl. the ~30 Berlin venues out of "Lucerne"). Events: 0 (all legit homes).

-- ── Phase 2 — promote / fix / hide placeholder cities ───────────────────────
-- 2A+2B Promote clusterable POI tmp cities: coords = venue median, dominant
-- country, clean slug. (215 cities promoted, e.g. Wuppertal, Cardiff, Nagoya;
-- Sendai's coords corrected to Japan.)
WITH stats AS (
  SELECT t.id AS city_id,
    percentile_cont(0.5) WITHIN GROUP (ORDER BY v.latitude) AS med_lat,
    percentile_cont(0.5) WITHIN GROUP (ORDER BY v.longitude) AS med_lng,
    coalesce(max(v.latitude)-min(v.latitude),0) AS lat_spread,
    coalesce(max(v.longitude)-min(v.longitude),0) AS lng_spread,
    mode() WITHIN GROUP (ORDER BY v.country_id) AS dom_country
  FROM cities t JOIN venues v ON v.city_id=t.id AND v.latitude IS NOT NULL
  WHERE t.slug LIKE 'tmp-%'
  GROUP BY t.id
)
UPDATE cities c
SET latitude=s.med_lat, longitude=s.med_lng, country_id=COALESCE(s.dom_country,c.country_id),
    slug=generate_unique_slug('cities', generate_slug(c.name), c.id),
    data_source=COALESCE(c.data_source,'')||'|promoted-2026-06-06', updated_at=now()
FROM stats s WHERE c.id=s.city_id AND s.lat_spread < 0.6 AND s.lng_spread < 0.9;

-- 2C Hide every remaining placeholder city (noindex; excluded from sitemap +
-- middleware emits noindex robots — seo_indexable is the canonical SEO gate).
UPDATE cities SET seo_indexable=false, updated_at=now()
WHERE slug LIKE 'tmp-%' AND seo_indexable=true;

-- 2D Null the coords of garbage-bucket tmp cities (stored coords >100 km from
-- their venue median) so even their hidden detail page never shows a wrong pin.
WITH stats AS (
  SELECT t.id,
    percentile_cont(0.5) WITHIN GROUP (ORDER BY v.latitude) AS med_lat,
    percentile_cont(0.5) WITHIN GROUP (ORDER BY v.longitude) AS med_lng
  FROM cities t JOIN venues v ON v.city_id=t.id AND v.latitude IS NOT NULL
  WHERE t.slug LIKE 'tmp-%' AND t.latitude IS NOT NULL GROUP BY t.id
)
UPDATE cities c SET latitude=NULL, longitude=NULL, updated_at=now()
FROM stats s WHERE c.id=s.id
  AND ST_DistanceSphere(ST_MakePoint(c.longitude::float8,c.latitude::float8),
                        ST_MakePoint(s.med_lng::float8,s.med_lat::float8))/1000 > 100;

-- NOTE — empty tmp cities are NOT hard-deleted (26 FK columns reference cities);
-- they are hidden (seo_indexable=false + tmp- slug filter) which is equivalent
-- for users and far safer.

-- ── Reported case: clean the "Lucerne" bucket's 7 residual venues ───────────
-- 2 "Lucerne" venues → canonical Luzern/CH (garbage coords reset to city centre).
-- 4 "Potsdam" venues → new canonical Potsdam/DE (no German Potsdam existed;
--   the only "Potsdam" was Potsdam, New York/US).
-- 1 "Brandenburg an der Havel" venue → promote the existing tmp Brandenburg/DE.
-- Then null the now-empty "Lucerne" tmp city's coords. (See conversation for the
-- exact ids; recorded in geo_relink_audit with method = 'manual-*'.)

-- ── Similar-bug sweep on canonical cities ───────────────────────────────────
-- Same coord-corruption class found on real cities — most clearly a zeroed
-- coordinate axis (single-axis zero slips past the existing (0,0) coerce
-- trigger). Fixed the unambiguous ones from clustered venue medians, e.g.
-- Shinjuku (lng was 0.00 with 24 Tokyo venues → 35.69, 139.70).
WITH stats AS (
  SELECT c.id, percentile_cont(0.5) WITHIN GROUP (ORDER BY v.latitude) AS med_lat,
    percentile_cont(0.5) WITHIN GROUP (ORDER BY v.longitude) AS med_lng,
    coalesce(max(v.latitude)-min(v.latitude),0) AS ls, coalesce(max(v.longitude)-min(v.longitude),0) AS gs
  FROM cities c JOIN venues v ON v.city_id=c.id AND v.latitude IS NOT NULL AND v.longitude IS NOT NULL
  WHERE c.slug NOT LIKE 'tmp-%' AND c.duplicate_of_id IS NULL
    AND (round(c.latitude,4)=0 OR round(c.longitude,4)=0)
  GROUP BY c.id HAVING count(v.id) >= 3
)
UPDATE cities c SET latitude=s.med_lat, longitude=s.med_lng, updated_at=now()
FROM stats s WHERE c.id=s.id AND s.ls < 0.6 AND s.gs < 0.9;
-- DEFERRED: ambiguous-name canonical cities whose coords disagree with their
-- venues (e.g. Santa Rosa AR vs CA venues, Fire Island Pines wide spread) —
-- need per-case judgement; not auto-touched.
