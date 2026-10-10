-- The chip count and the grid it produces read the same corpus through
-- different gates, so a facet chip advertised more listings than clicking it
-- returned. Measured on prod 2026-10-10 for `color-black` on apparel:
--
--   facet says              1,156
--   out_of_stock              -37
--   grid says               1,119   -- exactly the difference, nothing else
--
-- `marketplace_browse_page` carries `in_stock` (default TRUE), excluding
-- `availability = 'out_of_stock'`; `get_marketplace_tag_facets` carried no
-- such predicate. Every other gate already agreed — status, overview_eligible,
-- content_rating, department, subcategory_group — which is why the gap is
-- exactly the out-of-stock rows and nothing else. Verified there is no
-- double-counting underneath it: count(*) equals count(distinct id) on the
-- same join, so the join fans out nowhere.
--
-- This is the SECOND half of the same defect class as #4257. There the count
-- came from the tag junction while the filter read the empty generated
-- `sizes`/`colors` columns, so every size and colour chip returned zero. The
-- producer is the same shape both times: a number and the thing it predicts
-- computed by two queries that are free to disagree.
--
-- WHY A PARAMETER AND NOT A HARDCODED PREDICATE. `in_stock` is user-toggleable
-- — `MarketplaceFilterSheet` writes `availability: 'in_stock' | 'any'` and the
-- browse RPC honours it. Hardcoding the in-stock predicate here would make the
-- counts correct on /marketplace/category/* (which has no toggle) and newly
-- WRONG in the opposite direction the moment a reader turns the toggle off,
-- which is this same bug with the sign flipped. The default matches the browse
-- RPC's own default (TRUE) so an un-updated caller gets the grid's behaviour
-- rather than the old mismatch.
--
-- Signature change is a REPLACE, not an overload: PostgREST resolves by
-- ARGUMENT NAME, and a surviving 3-arg twin makes a named 4-arg call ambiguous
-- (42725). Dropping first is what keeps that unspellable.

drop function if exists public.get_marketplace_tag_facets(text, text, boolean);

create or replace function public.get_marketplace_tag_facets(
  p_department text default null::text,
  p_subcategory_group text default null::text,
  p_include_adult boolean default false,
  p_in_stock boolean default true
)
returns table(slug text, name text, kind text, count bigint)
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
  SELECT ut.slug, ut.name,
         CASE split_part(ut.slug, '-', 1)
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
  JOIN public.unified_tags ut ON ut.id = uta.tag_id
  JOIN public.marketplace_listings ml ON ml.id = uta.entity_id
  WHERE uta.entity_type = 'marketplace_listing'
    AND ut.slug ~ '^(mat|occ|vibe|color|size|genre|fit)-'
    AND ut.status = 'active'
    AND ml.status = 'active' AND ml.overview_eligible
    AND (p_include_adult OR ml.content_rating IN ('sfw','suggestive'))
    -- Mirrors marketplace_browse_page's in_stock arm EXACTLY, including the
    -- NULL arm: `availability IS NULL` is unknown stock, not out of stock, and
    -- treating it as out would under-count the chip against its own grid.
    AND (coalesce(p_in_stock, true) IS NOT TRUE
         OR ml.availability IS NULL OR ml.availability <> 'out_of_stock')
    AND (p_department IS NULL OR ml.department = p_department)
    AND (p_subcategory_group IS NULL OR ml.subcategory_group = p_subcategory_group)
  GROUP BY ut.slug, ut.name
  ORDER BY count(*) DESC
  LIMIT 80;
$function$;

grant execute on function public.get_marketplace_tag_facets(text, text, boolean, boolean)
  to anon, authenticated, service_role;

do $verify$
declare
  v_facet bigint;
  v_grid bigint;
  v_facet_any bigint;
begin
  -- P1: the chip now agrees with the grid it produces. Asserted as EQUALITY
  -- against the browse RPC rather than against a frozen number — the corpus
  -- moves, and a literal here fails on correct code the next time ingest adds
  -- a black apparel listing.
  select count into v_facet
  from public.get_marketplace_tag_facets('apparel', null, false, true)
  where slug = 'color-black';

  select coalesce((array_agg(total_count))[1], 0) into v_grid
  from public.marketplace_browse_page(
    '[["color-black"]]'::jsonb,
    '{"department":"apparel","in_stock":true}'::jsonb, 'boutique', 0, 24);

  if v_facet is distinct from v_grid then
    raise exception 'P1 failed: facet % <> grid % for color-black/apparel', v_facet, v_grid;
  end if;

  -- P2: the parameter is live, not decorative. With the gate off the count
  -- must RISE — out-of-stock rows come back. Without this, P1 also passes on a
  -- function that hardcoded the predicate and ignores the argument entirely.
  select count into v_facet_any
  from public.get_marketplace_tag_facets('apparel', null, false, false)
  where slug = 'color-black';

  if v_facet_any <= v_facet then
    raise exception 'P2 failed: p_in_stock=false (%) did not exceed p_in_stock=true (%)',
      v_facet_any, v_facet;
  end if;

  -- P3: exactly one overload survives. Two would make a named PostgREST call
  -- ambiguous (42725) and the frontend would 404 with PGRST202.
  if (select count(*) from pg_proc where proname = 'get_marketplace_tag_facets') <> 1 then
    raise exception 'P3 failed: expected exactly 1 get_marketplace_tag_facets overload, found %',
      (select count(*) from pg_proc where proname = 'get_marketplace_tag_facets');
  end if;

  raise notice 'facet/grid agree at % (ungated %)', v_facet, v_facet_any;
end
$verify$;
