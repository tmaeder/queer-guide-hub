-- Geo containment validation, phase 1.
--
-- 20270501174244 added public.geo_boundaries (Natural Earth 1:10m admin-0) plus
-- geo_country_at()/geo_countries_equivalent(), and its own commit message closed
-- with "The bulk load has NOT run yet." It has now run: 258 features, 245 with a
-- usable ISO-2 across 239 distinct codes (six codes carry two features each, so
-- 245 rows and 239 codes are the same coverage -- do not read that gap as loss),
-- and geo_country_parent resolved 9 territories by centroid containment
-- (RE/GP/MQ/GF/YT -> FR, BQ -> NL, BV -> NO, CC/CX -> AU).
--
-- WHY A SECOND, SUBDIVIDED TABLE.
-- geo_boundaries stores full-resolution multipolygons; Canada alone is 1.5 MB.
-- A GIST index over them is nearly useless for point-in-polygon because every
-- candidate bounding box pulls a huge geometry through ST_Contains. Measured on
-- prod: 2,000 venues took 11.4 s, i.e. ~125 s for venues alone and roughly seven
-- minutes for all four entity tables -- past the 2 min statement timeout, and far
-- past what a nightly sentinel can afford to re-run.
--
-- ST_Subdivide(geom, 128) cuts every polygon into <=128-vertex pieces. 258
-- features become 12,445 cells, each with a tight bounding box, so the GIST
-- index becomes selective and the same full-corpus sweep completes inside one
-- statement. The cells are a derived ACCELERATION STRUCTURE, never a source of
-- truth: geo_boundaries stays canonical and geo_boundary_cells is rebuilt from
-- it by refresh_geo_boundary_cells().
--
-- The coverage assertion below is the reason this is safe. Subdividing can drop
-- degenerate slivers, and a containment validator over an incomplete boundary
-- set does not find defects, it MANUFACTURES them -- every venue in a missing
-- country reads as a country mismatch. So the refresh fails rather than leaving
-- a partial set live, and it compares DISTINCT ISO codes on both sides because
-- the row counts legitimately differ.

create table if not exists public.geo_boundary_cells (
  id     bigserial primary key,
  iso_a2 text,
  geom   extensions.geometry(Geometry, 4326) not null
);

comment on table public.geo_boundary_cells is
  'Derived from geo_boundaries via ST_Subdivide. Acceleration structure for point-in-polygon; never edit directly, rebuild with refresh_geo_boundary_cells(). A NULL iso_a2 is a disputed feature the validator declines to adjudicate on.';

create index if not exists geo_boundary_cells_gix on public.geo_boundary_cells using gist (geom);

alter table public.geo_boundary_cells enable row level security;

create or replace function public.refresh_geo_boundary_cells()
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $$
declare
  v_src_codes  int;
  v_cell_codes int;
  v_cells      int;
begin
  select count(distinct iso_a2) into v_src_codes
    from public.geo_boundaries where boundary_kind = 'country' and iso_a2 is not null;

  if v_src_codes = 0 then
    raise exception 'geo_boundaries holds no country rows with an ISO-2 code; load it before refreshing cells (scripts/data-quality/load-geo-boundaries.mjs)';
  end if;

  delete from public.geo_boundary_cells;

  insert into public.geo_boundary_cells (iso_a2, geom)
  select b.iso_a2, ST_Subdivide(b.geom, 128)
    from public.geo_boundaries b
   where b.boundary_kind = 'country';

  select count(*), count(distinct iso_a2) into v_cells, v_cell_codes
    from public.geo_boundary_cells where iso_a2 is not null;

  -- Compare CODES, not rows: subdivision multiplies rows by design.
  if v_cell_codes <> v_src_codes then
    raise exception 'subdivision lost countries: geo_boundaries has % distinct ISO codes, cells have %', v_src_codes, v_cell_codes;
  end if;

  analyze public.geo_boundary_cells;

  return jsonb_build_object('cells', v_cells, 'iso_codes', v_cell_codes);
end;
$$;

revoke all on function public.refresh_geo_boundary_cells() from public, anon, authenticated;
grant execute on function public.refresh_geo_boundary_cells() to service_role;

-- ---------------------------------------------------------------------------
-- The validator.
--
-- Classifies every venue / event / organization / hotel that carries BOTH a
-- coordinate and a country_id:
--
--   country_mismatch -- the point is inside a different country's polygon
--   offshore         -- inside nothing, and >5 km from any land
--   undecidable      -- inside a disputed feature (iso_a2 IS NULL), so we
--                       decline to adjudicate rather than assign the row to
--                       whichever state happens to surround it
--
-- The 5 km tolerance is not a fudge factor, it is required by the source: a
-- 1:10m coastline generalises the shore, so a genuinely correct seafront venue
-- falls outside its own country. Measured: it takes venue "offshore" from 872
-- to 38. Applied to cities the same tolerance separates 125 coastline artefacts
-- from the one real defect (Key West, stored 151 km out in the Gulf of Mexico).
--
-- geo_countries_equivalent() (20270501174244) is the ONLY definition of "same
-- country" used here, so a Reunion venue filed RE whose point lands in FR is
-- equivalent, not a finding. Verified on prod: 0 findings across
-- RE/GP/MQ/GF/YT/BQ/GU/PR/MP/HK/MO.
create or replace function public.geo_containment_violations(p_limit int default null)
returns table (
  entity_type     text,
  entity_id       uuid,
  entity_name     text,
  claimed_iso     text,
  actual_iso      text,
  match_kind      text,
  violation_class text,
  latitude        numeric,
  longitude       numeric
)
language sql
stable
security definer
set search_path to 'public', 'extensions'
as $$
  with rows_ as (
    select 'venue'::text t, v.id, v.name::text nm,
           v.latitude::numeric lat, v.longitude::numeric lng, co.code claimed
      from venues v join countries co on co.id = v.country_id
     where v.duplicate_of_id is null and v.latitude is not null and v.longitude is not null
    union all
    select 'event', e.id, e.title::text, e.latitude::numeric, e.longitude::numeric, co.code
      from events e join countries co on co.id = e.country_id
     where e.duplicate_of_id is null and e.latitude is not null and e.longitude is not null
    union all
    select 'organization', o.id, o.name::text, o.latitude::numeric, o.longitude::numeric, co.code
      from organizations o join countries co on co.id = o.country_id
     where o.latitude is not null and o.longitude is not null
    union all
    select 'hotel', h.id, h.name::text, h.latitude::numeric, h.longitude::numeric, co.code
      from hotels h join countries co on co.id = h.country_id
     where h.latitude is not null and h.longitude is not null
  ), pt as (
    select r.*, ST_SetSRID(ST_MakePoint(r.lng::float8, r.lat::float8), 4326) g from rows_ r
  ), hit as (
    select p.*, c.iso_a2 as inside_iso, (c.cid is not null) as inside_any
      from pt p
      left join lateral (
        select c.id cid, c.iso_a2
          from geo_boundary_cells c
         where c.geom && p.g and ST_Contains(c.geom, p.g)
         -- a real country outranks a disputed feature when both contain the point
         order by (c.iso_a2 is null)
         limit 1
      ) c on true
  ), near as (
    -- Order by the GIST-backed geometry KNN operator, then measure only the ONE
    -- winner in metres. Putting ST_DWithin(geography) in the predicate instead
    -- scans all 12k cells per row and was measured to time out.
    select h.*, n.iso_a2 near_iso, n.d near_m
      from hit h
      left join lateral (
        select c.iso_a2, ST_Distance(c.geom::geography, h.g::geography) d
          from geo_boundary_cells c
         where not h.inside_any
         order by c.geom <-> h.g
         limit 1
      ) n on true
  ), resolved as (
    select near.*,
           case when inside_any then inside_iso
                when near_m is not null and near_m <= 5000 then near_iso
                else null end as actual,
           case when inside_any then 'contains'
                when near_m is not null and near_m <= 5000 then 'nearest'
                else 'none' end as kind
      from near
  ), flagged as (
    select * from resolved
     where kind = 'none'
        or actual is null
        or not public.geo_countries_equivalent(claimed, actual)
  ), bordered as (
    -- BORDER TOLERANCE. A 1:10m boundary generalises a land border exactly as it
    -- generalises a coastline, so a venue in a border town lands a few hundred
    -- metres inside the neighbour and reads as a country mismatch.
    --
    -- 2 km is CALIBRATED, not chosen. Nine of these rows were independently
    -- verified by Nominatim at km≈0 INSIDE their claimed country: Konstanz and
    -- Weil am Rhein on the Swiss border, Basel's Dreiländereck (literally
    -- "three-country corner"), Kerkrade, Mexicali, Podčetrtek, and Monaco, which
    -- is 2 km² surrounded by France. Their distance to the claimed border runs
    -- 0.118 – 1.203 km, so 2 km clears every measured true-negative with margin
    -- while leaving the 2–10 km band (24 rows) flagged.
    --
    -- Scoped to the ~400 already-flagged rows and bbox-limited, so this costs a
    -- KNN per FINDING rather than per venue.
    select f.*,
           (select min(ST_Distance(c.geom::geography, f.g::geography))
              from geo_boundary_cells c
             where c.iso_a2 = f.claimed
               and c.geom && ST_Expand(f.g, 0.5)) as m_to_claimed
      from flagged f
  )
  select t, id, nm, claimed, actual, kind,
         case when kind = 'none'   then 'offshore'
              when actual is null  then 'undecidable'
              else 'country_mismatch' end,
         lat, lng
    from bordered
   -- Only a country_mismatch can be excused by the border: an offshore point is
   -- already handled by its own 5 km tolerance, and an undecidable one sits in a
   -- disputed feature where proximity proves nothing.
   where not (
     kind <> 'none' and actual is not null
     and m_to_claimed is not null and m_to_claimed <= 2000
   )
   limit p_limit;
$$;

revoke all on function public.geo_containment_violations(int) from public, anon, authenticated;
grant execute on function public.geo_containment_violations(int) to service_role;

-- ---------------------------------------------------------------------------
-- Materialised findings. The sweep is ~30 s over the full corpus, which is fine
-- nightly and too slow for an admin page load, so the sentinel and the panel
-- both read these tables and a runner refreshes them.

create table if not exists public.geo_containment_findings (
  entity_type     text not null,
  entity_id       uuid not null,
  entity_name     text,
  claimed_iso     text,
  actual_iso      text,
  match_kind      text,
  violation_class text not null,
  latitude        numeric,
  longitude       numeric,
  detected_at     timestamptz not null default now(),
  primary key (entity_type, entity_id)
);
alter table public.geo_containment_findings enable row level security;

create table if not exists public.geo_city_coord_findings (
  city_id         uuid primary key,
  name            text,
  claimed_iso     text,
  actual_iso      text,
  violation_class text,
  latitude        numeric,
  longitude       numeric,
  venues          int,
  events          int,
  km_to_land      numeric,
  nearest_iso     text,
  detected_at     timestamptz not null default now()
);
alter table public.geo_city_coord_findings enable row level security;

comment on table public.geo_city_coord_findings is
  'Cities whose OWN centroid contradicts their country. Root-cause table: a bad city centroid propagates to every venue and event linked to it (run_event_geo_fill stamps it as derived:city_centroid), and centroid-based detectors cannot see it because they measure distance TO that same bad centroid. km_to_land separates coastline generalisation (<=5 km, 125 of 131 measured) from real defects.';

do $$
declare v jsonb;
begin
  if exists (select 1 from public.geo_boundaries where boundary_kind = 'country' limit 1) then
    v := public.refresh_geo_boundary_cells();
    raise notice 'geo_boundary_cells refreshed: %', v;
  else
    raise notice 'geo_boundaries is empty; run scripts/data-quality/load-geo-boundaries.mjs then select refresh_geo_boundary_cells()';
  end if;
end $$;
