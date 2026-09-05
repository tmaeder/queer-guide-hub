-- geo_country_at: make it index-usable, and remove an orphan helper.
--
-- TWO UNRELATED THINGS, both about keeping prod and the repo in step.
--
-- 1. PERFORMANCE. geo_country_at casts geom to geography inside ST_DWithin and
--    orders by the geography KNN operator. Both ignore the GIST index on
--    `geom`, so every call scanned all 258 country polygons. Measured: a
--    3,000-row replay exceeded the statement timeout inside this function
--    alone, and ran in seconds once a `&&` bbox prefilter let the index do the
--    first cut. Semantics are unchanged — exact containment first, bounded
--    nearest fallback for coastal points, never across a land border — only
--    the access path moves.
--
--    (geo_containment_violations, added later on main, avoids this a different
--    way: it pre-decomposes boundaries into ~12k geo_boundary_cells and orders
--    by the geometry KNN operator before measuring the single winner in metres.
--    Same insight, applied at load time rather than query time.)
--
-- 2. ORPHAN REMOVAL. `geo_point_near_country` was created directly on prod
--    while measuring a border-town false-positive class, and never shipped in
--    any migration. Untracked schema is worse than no schema: it cannot be
--    reviewed, cannot be rebuilt from the repo, and reads as intentional to the
--    next person. Nothing references it — main's containment path is
--    geo_containment_violations / run_geo_containment_sweep — so it is dropped
--    rather than adopted.
--
--    What it measured is worth keeping even though the function is not. A
--    1:10m boundary generalises borders by up to a kilometre, so asking "which
--    polygon contains this point" flags every border town: over 3,000
--    known-good venues it produced 9 flags of which SEVEN were borders (a Basel
--    venue named Dreiländereck — "three-country corner" — resolving to Germany,
--    Konstanz to Switzerland, Kerkrade to Germany, Podčetrtek to Croatia), plus
--    Key West, where the Florida Keys are thin enough that a real US venue sits
--    12 km off the US polygon. Border artifacts spanned 255 m .. 12,369 m while
--    genuine defects start at 7,584 km — a 600x gap, which is what makes a
--    tolerance defensible at all. Any future containment work should ask "is
--    the point in OR NEAR the country it claims" rather than "which polygon
--    wins".

create or replace function public.geo_country_at(
  p_lat numeric,
  p_lng numeric,
  p_tolerance_m integer default 5000
) returns table (iso_a2 text, match_kind text)
language sql
stable
set search_path = public, extensions
as $$
  with pt as (
    select ST_SetSRID(ST_MakePoint(p_lng::float8, p_lat::float8), 4326) as g
  ),
  hit as (
    select b.iso_a2, 'contains'::text as match_kind
    from public.geo_boundaries b, pt
    where b.boundary_kind = 'country'
      and b.iso_a2 is not null
      and b.geom && pt.g
      and ST_Intersects(b.geom, pt.g)
    limit 1
  ),
  near as (
    select b.iso_a2, 'nearest'::text as match_kind
    from public.geo_boundaries b, pt
    where b.boundary_kind = 'country'
      and b.iso_a2 is not null
      and not exists (select 1 from hit)
      and b.geom && ST_Expand(pt.g, 0.5)
      and ST_DWithin(b.geom::geography, pt.g::geography, p_tolerance_m)
    order by b.geom <-> pt.g
    limit 1
  )
  select * from hit
  union all
  select * from near;
$$;

drop function if exists public.geo_point_near_country(numeric, numeric, text, integer);

do $verify$
begin
  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'geo_point_near_country'
  ) then
    raise exception 'geo_point_near_country still exists — prod would keep untracked schema';
  end if;
  -- Behaviour unchanged: Honolulu is US, and a Johannesburg coordinate is not.
  if (select iso_a2 from public.geo_country_at(21.304547, -157.855676) limit 1) <> 'US' then
    raise exception 'geo_country_at regressed: Honolulu no longer resolves to US';
  end if;
  if (select iso_a2 from public.geo_country_at(-26.0161287, 28.1829882) limit 1) <> 'ZA' then
    raise exception 'geo_country_at regressed: a Johannesburg coordinate no longer resolves to ZA';
  end if;
end
$verify$;
