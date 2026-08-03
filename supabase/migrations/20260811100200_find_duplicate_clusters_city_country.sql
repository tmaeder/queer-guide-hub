-- find_duplicate_clusters('city') must group by country.
--
-- The function clusters on normalized title + city. For a city row,
-- `search_documents.city` IS the city's own name, so the pair collapses to
-- title-only and the country is ignored entirely — San Jose CR clusters with
-- San Jose CA, Athens GR with Athens US, Berlin DE with Berlin US.
--
-- This is what /admin/duplicates merges off. On 2026-07-29 a batch approval
-- merged 29 pairs of genuinely different same-name cities from exactly this
-- list, and the damage was silent: merge_cities rewrites events.city and
-- venues.city to the surviving name and the geo-derive trigger then rewrites
-- country_id, so the wreckage looks self-consistent afterwards. It had to be
-- repaired by hand on 2026-08-02 from whatever evidence survived, because
-- unmerge_cities only flips duplicate_of_id and does NOT undo the reparenting.
--
-- 20260810110000 put a guard inside merge_cities. That stops the merge but
-- leaves the UI proposing pairs it will refuse — an admin clicking through a
-- list of rejections learns to ignore the rejections. Fix the proposal too.
--
-- Only the 'city' branch changes. Venues keep grouping by title + city, which
-- is what 20260531173909 established and what keeps Starbucks Berlin apart
-- from Starbucks Madrid.

CREATE OR REPLACE FUNCTION public.find_duplicate_clusters(
  p_content_type text,
  p_limit        int DEFAULT 100
) RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
  WITH norm AS (
    SELECT entity_id, title, city, country, slug,
           lower(unaccent(btrim(coalesce(title, '')))) AS nt,
           coalesce(lower(unaccent(btrim(city))), '')  AS nc,
           -- Cities only: same name in DIFFERENT countries is not a duplicate,
           -- it is two places. uk_cities_country_name_active already forbids
           -- the same name twice within one country, so a surviving
           -- same-name-same-country pair is a real duplicate (accents, casing,
           -- or a row that predates the index).
           CASE WHEN p_content_type = 'city'
                THEN coalesce(lower(unaccent(btrim(country))), '')
                ELSE '' END AS nco
    FROM public.search_documents
    WHERE entity_type = p_content_type
      AND title IS NOT NULL
      AND length(btrim(title)) >= 3
  ),
  groups AS (
    SELECT nt, nc, nco, count(*) AS c,
           jsonb_agg(jsonb_build_object('id', entity_id, 'title', title, 'city', city,
                                        'country', country, 'slug', slug)
                     ORDER BY slug NULLS LAST) AS members
    FROM norm
    GROUP BY nt, nc, nco
    HAVING count(*) > 1
  )
  SELECT coalesce((
    SELECT jsonb_agg(jsonb_build_object('normalized_title', nt, 'city', nullif(nc, ''),
                                        'count', c, 'members', members) ORDER BY c DESC)
    FROM (SELECT * FROM groups ORDER BY c DESC, nt LIMIT greatest(p_limit, 0)) x
  ), '[]'::jsonb);
$$;

COMMENT ON FUNCTION public.find_duplicate_clusters(text, int) IS
  'Duplicate candidate clusters for /admin/duplicates. Cities are grouped by '
  'country as well as name -- without it the list proposes same-name cities in '
  'different countries, which merge_cities now refuses anyway.';
