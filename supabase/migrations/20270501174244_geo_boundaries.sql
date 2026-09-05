-- geo_boundaries — the first authoritative geographic reference in this schema.
--
-- WHY THIS EXISTS. Every geo consistency test in the corpus compares a
-- coordinate to the CENTROID of the place it claims to be in, because there has
-- never been a polygon to compare it to. PostGIS 3.3.7 has been installed the
-- whole time and all three existing geometry columns (regions.geometry,
-- queer_villages.geometry, geo_village_profiles.geometry) are 100% NULL, so the
-- one ST_Contains in the repo operates on empty tables.
--
-- Centroid distance provably cannot do this job. city_geo_conflicts() ranks
-- Honolulu, Réunion, Guam and Bonaire — all correctly filed — above "Concord"
-- filed under Czech Republic, which is a genuine error at 35.41/-80.59
-- (Concord, North Carolina). A detector whose top hits are all false positives
-- does not get read, and this one wasn't.
--
-- SOURCE. Natural Earth 1:10m admin-0, pinned to nvkelso/natural-earth-vector
-- v5.1.2 and digest-verified by the loader. Public domain, no attribution
-- requirement, no API, no rate limit.
--
-- NOT SIMPLIFIED, deliberately — this reverses the original plan. The reasoning
-- was that ST_SimplifyPreserveTopology would be needed to control size, with a
-- positive control asserting no small state vanished. Measured instead: the
-- whole 258-feature admin-0 set is 11.8 MB of geometry against a 14 GB
-- database, i.e. 0.08%. Simplification would buy nothing and would put Monaco
-- (0.3 KB), Vatican City (0.2 KB), Nauru (0.2 KB), San Marino (0.4 KB) and
-- Tuvalu (1.6 KB) at risk of being erased outright — after which every venue in
-- them reads as "offshore" and the validator invents a defect class. Storing the
-- full geometry removes that risk rather than mitigating it.
--
-- THREE THINGS MEASURED AGAINST REAL CORPUS COORDINATES BEFORE WRITING THIS:
--
-- 1. Natural Earth codes Taiwan `CN-TW`, not `TW`. Our corpus has 121 venues
--    and 30 events under TW. The loader normalises it; without that mapping
--    every one of those 151 rows would read as a country mismatch.
--
-- 2. Réunion, Martinique, Guadeloupe, French Guiana, Mayotte and Caribbean
--    Netherlands have NO admin-0 feature of their own — Natural Earth folds
--    them into France and the Netherlands. Verified by point-in-polygon on the
--    actual venue coordinates: all of them land inside FR or NL. They are
--    resolved through geo_country_parent rather than reading as errors.
--    (A first probe put Guadeloupe outside every polygon; the probe point was
--    in the sea channel between Basse-Terre and Grande-Terre. The real venues
--    are inside FR. Probe with corpus coordinates, not guessed centroids.)
--
-- 3. A coastal venue can fall marginally OUTSIDE its country. `Le Loft` on
--    Réunion's west coast (-21.0659, 55.2220) is contained by nothing at all,
--    because a 1:10m coastline generalises the shore by up to a kilometre or
--    so. That is a precision artifact, never a finding, which is why
--    geo_country_at() falls back to a bounded nearest-boundary search instead
--    of reporting "no country".

create table if not exists public.geo_boundaries (
  id               bigserial primary key,
  boundary_kind    text not null check (boundary_kind in ('country','admin1')),
  -- Normalised ISO-2 (CN-TW -> TW). NULL for the 13 admin-0 features that carry
  -- no usable code at all: Somaliland, Northern Cyprus, the Cyprus buffer zone,
  -- Guantanamo, Bir Tawil, Siachen, and the disputed reefs. They are LOADED —
  -- the land is really there — but a null code means the validator declines to
  -- adjudicate a venue standing on it rather than accusing it of being in the
  -- surrounding state. Refusing is correct for disputed territory.
  iso_a2           text,
  iso_3166_2       text,
  sovereign_iso_a2 text,
  name             text not null,
  ne_type          text,
  geom             extensions.geometry(MultiPolygon, 4326) not null,
  source           text not null,
  source_version   text not null,
  source_sha256    text not null,
  loaded_at        timestamptz not null default now()
);

create index if not exists geo_boundaries_geom_gix
  on public.geo_boundaries using gist (geom);
create index if not exists geo_boundaries_kind_iso_idx
  on public.geo_boundaries (boundary_kind, iso_a2);

comment on table public.geo_boundaries is
  'Natural Earth 1:10m boundary polygons, digest-verified and stored unsimplified (11.8 MB for admin-0). The authoritative answer to "is this coordinate actually in this country/region". iso_a2 is NULL for disputed features by design, so the validator declines rather than guesses.';

-- ── Territory ↔ sovereign equivalence ────────────────────────────────────────
-- A coordinate inside FRANCE legitimately belongs to a venue filed under
-- Réunion, and a coordinate inside GUAM legitimately belongs to one filed under
-- the United States. Both directions are real and neither is an error, but
-- `countries` has no sovereign or parent column — checked, it has only
-- enrichment_status and shell_status — so this relationship is not currently
-- representable anywhere in the schema. That absence is exactly why six Hong
-- Kong venues and one Puerto Rico venue sit in the geo_validations queue as
-- mismatches today.
--
-- Populated by the loader from two DERIVED signals, never a hand-written list:
--   'sovereign'            — the territory has its own polygon; parent comes
--                            from Natural Earth's SOV_A3 (GU->US, HK->CN, PR->US)
--   'centroid_containment' — the territory has no polygon; parent is whichever
--                            polygon contains its stored centroid (RE->FR, BQ->NL)
create table if not exists public.geo_country_parent (
  child_code   text primary key,
  parent_code  text not null,
  derivation   text not null check (derivation in ('sovereign','centroid_containment')),
  loaded_at    timestamptz not null default now(),
  check (child_code <> parent_code)
);

comment on table public.geo_country_parent is
  'Territory -> sovereign equivalence derived from Natural Earth at load time. Consumed by geo_countries_equivalent() so a Guam venue filed US, or a Réunion venue whose coordinate lands in France, is not reported as a country mismatch.';

-- ── Lookup: which country is this coordinate actually in? ────────────────────
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
  -- Exact containment first. At a land border this is unambiguous and the
  -- tolerance branch below never runs, so widening the tolerance can never
  -- pull a point across a border it is genuinely inside.
  hit as (
    select b.iso_a2, 'contains'::text as match_kind
    from public.geo_boundaries b, pt
    where b.boundary_kind = 'country'
      and b.iso_a2 is not null
      and ST_Intersects(b.geom, pt.g)
    limit 1
  ),
  -- Only when nothing contains the point: a 1:10m coastline generalises the
  -- shore, so a real seafront venue is often a few hundred metres "at sea".
  -- Bounded nearest is the honest reading of that, and it is reported with a
  -- different match_kind so a caller can treat it as weaker evidence.
  near as (
    select b.iso_a2, 'nearest'::text as match_kind
    from public.geo_boundaries b, pt
    where b.boundary_kind = 'country'
      and b.iso_a2 is not null
      and not exists (select 1 from hit)
      and ST_DWithin(b.geom::geography, pt.g::geography, p_tolerance_m)
    order by b.geom::geography <-> pt.g::geography
    limit 1
  )
  select * from hit
  union all
  select * from near;
$$;

comment on function public.geo_country_at(numeric, numeric, integer) is
  'Country containing a coordinate. Returns match_kind=contains, or nearest within p_tolerance_m (default 5km) for coastal points a 1:10m coastline puts just offshore, or no row at all when the point is genuinely nowhere. Never guesses across a land border: the tolerance branch only runs when containment found nothing.';

-- ── Are these two country codes the same place for validation purposes? ──────
create or replace function public.geo_countries_equivalent(a text, b text)
returns boolean
language sql
immutable
set search_path = public
as $$
  select case
    when a is null or b is null then false
    when upper(a) = upper(b) then true
    else exists (
      select 1 from public.geo_country_parent p
      where (p.child_code = upper(a) and p.parent_code = upper(b))
         or (p.child_code = upper(b) and p.parent_code = upper(a))
    )
  end;
$$;

comment on function public.geo_countries_equivalent(text, text) is
  'True when two ISO-2 codes refer to the same place for validation: identical, or one is a territory of the other. Symmetric on purpose — a Guam venue filed US and a Réunion venue whose coordinate resolves to FR are the same situation seen from opposite ends.';

-- Read-only reference data. Anon needs it because the containment verdicts
-- surface on admin pages served under the caller's own role.
revoke all on table public.geo_boundaries from public;
revoke all on table public.geo_country_parent from public;
grant select on table public.geo_boundaries to anon, authenticated, service_role;
grant select on table public.geo_country_parent to anon, authenticated, service_role;
grant execute on function public.geo_country_at(numeric, numeric, integer) to authenticated, service_role;
grant execute on function public.geo_countries_equivalent(text, text) to anon, authenticated, service_role;

alter table public.geo_boundaries enable row level security;
alter table public.geo_country_parent enable row level security;

drop policy if exists geo_boundaries_read on public.geo_boundaries;
create policy geo_boundaries_read on public.geo_boundaries for select using (true);
drop policy if exists geo_country_parent_read on public.geo_country_parent;
create policy geo_country_parent_read on public.geo_country_parent for select using (true);
