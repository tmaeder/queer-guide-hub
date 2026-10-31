-- api_private.get_marketplace_tag_facets(): filter the eligible listings once,
-- then hash-join them to the tag assignments.
--
-- The old body joined unified_tag_assignments -> unified_tags ->
-- marketplace_listings in one statement. The planner estimated ~360 matching
-- rows (actual 114k) and so chose a nested loop that probed
-- marketplace_listings by primary key once per assignment: 170,950 probes and
-- ~683k buffer reads, 6,542 ms for the default call on 2026-10-31, against the
-- anon role's 3s statement_timeout. 1,857 calls averaged 1,071 ms and timed
-- out in bursts of 20-28 an hour.
--
-- Both inputs are now MATERIALIZED CTEs: the ~87 attribute tags, and the
-- listings that pass every listing-side filter (~22k for the default call).
-- The join then hashes the listing set instead of probing it row by row:
-- 429 ms for the default call. The predicates are the old ones verbatim, only
-- moved into the CTE they belong to, so the counts cannot change; checked on
-- prod against the old function for every department / subcategory_group
-- combination with adult on and off and in-stock on and off.
--
-- Signature, return shape, SECURITY DEFINER, search_path and the public
-- wrapper are unchanged, so grants carry over.

create or replace function api_private.get_marketplace_tag_facets(
  p_department text default null,
  p_subcategory_group text default null,
  p_include_adult boolean default false,
  p_in_stock boolean default true
)
returns table(slug text, name text, kind text, count bigint)
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
  WITH tags AS MATERIALIZED (
    SELECT ut.id, ut.slug, ut.name
    FROM public.unified_tags ut
    WHERE ut.slug ~ '^(mat|occ|vibe|color|size|genre|fit)-'
      AND ut.status = 'active'
  ),
  listings AS MATERIALIZED (
    SELECT ml.id
    FROM public.marketplace_listings ml
    WHERE ml.status = 'active' AND ml.overview_eligible
      AND (p_include_adult OR ml.content_rating IN ('sfw','suggestive'))
      AND (coalesce(p_in_stock, true) IS NOT TRUE
           OR ml.availability IS NULL OR ml.availability <> 'out_of_stock')
      AND (p_department IS NULL OR ml.department = p_department)
      AND (p_subcategory_group IS NULL OR ml.subcategory_group = p_subcategory_group)
  )
  SELECT t.slug, t.name,
         CASE split_part(t.slug, '-', 1)
           WHEN 'mat'   THEN 'material'
           WHEN 'occ'   THEN 'occasion'
           WHEN 'vibe'  THEN 'vibe'
           WHEN 'color' THEN 'color'
           WHEN 'size'  THEN 'size'
           WHEN 'genre' THEN 'genre'
           WHEN 'fit'   THEN 'fit'
         END AS kind,
         count(*)::bigint AS count
  FROM public.unified_tag_assignments uta
  JOIN tags t ON t.id = uta.tag_id
  JOIN listings l ON l.id = uta.entity_id
  WHERE uta.entity_type = 'marketplace_listing'
  GROUP BY t.slug, t.name
  ORDER BY count(*) DESC
  LIMIT 80;
$function$;
