-- geo_containment_check — adjudicate a coordinate against real boundary geometry.
--
-- Replaces "how far is this point from the centroid of the place it claims to
-- be in" with "which country is this point actually inside". The distinction is
-- not academic: centroid distance ranks Honolulu, Réunion, Guam and Bonaire —
-- all correctly filed — above "Concord" filed under Czech Republic, which is a
-- genuine error. Containment answers all five correctly and instantly.
--
-- THREE INDEPENDENT SIGNALS per row, which is what makes a verdict possible at
-- all. Any two of them agreeing localises the defect to the third:
--   C = the country whose polygon CONTAINS the coordinate      (geo_country_at)
--   K = the country the row CLAIMS in its own `country` text   (canonicalised)
--   L = the country reached through its city LINK              (city -> country)
--
-- The rule this codebase has paid for repeatedly — "never resolve an entity by
-- one signal; require a second, independent one, and block when they disagree"
-- — is exactly what the verdict table below encodes.
--
-- VERDICTS
--   ok            C agrees with L. Distance is irrelevant: a Honolulu venue is
--                 6,000 km from the US centroid and inside the US polygon.
--   link_wrong    C agrees with K but not with L. The coordinate is corroborated
--                 by the row's own country text and the CITY LINK is the odd one
--                 out. This is the Georgetown shape: `Color pub and lounge`,
--                 country text MY, coordinates in Penang, linked to Georgetown,
--                 GUYANA. The coordinate here is CORRECT and must not be nulled.
--   coord_wrong   K agrees with L but not with C. Text and link agree; the
--                 coordinate is the outlier. The Chicago->Johannesburg shape.
--   admin1_wrong  Countries agree, but the containing state/province contradicts
--                 the linked city's region_name. The Portland ME/OR shape, which
--                 no country-level check can see.
--   offshore      No polygon contains the point and none is within tolerance.
--   unresolved    Signals present but mutually contradictory — no two agree, so
--                 there is nothing to trust. Write nothing, quarantine.
--   unverifiable  Neither a country text nor a city link. Nothing to check the
--                 coordinate AGAINST. Deliberately distinct from `ok`: we did
--                 not verify this row, and recording that as a pass would be a
--                 clean bill of health nobody earned.
--
-- WHY unverifiable IS ITS OWN VERDICT. Collapsing it into `ok` is the same
-- error as a sentinel that reports zero violations over an empty table. The
-- count of rows we could not check is the number that matters when judging
-- coverage, and it must never be hidden inside the pass rate.

-- ── Two validators, one table: make them stop overwriting each other ────────
-- geo_validations has a UNIQUE index on (content_type, content_id) only, and it
-- now has TWO writers: pipeline-geo-validate (source='nominatim', per-row
-- reverse geocode, ~30/day) and geo_containment_check (source='geo_containment',
-- whole-corpus offline sweep). Under the old key the second writer to touch a
-- venue silently REPLACES the first one's verdict.
--
-- That is not cosmetic. It would make the containment sentinel under-report:
-- a nightly Nominatim pass over 30 venues would quietly erase 30 containment
-- verdicts, and geo_hygiene_stats would show a defect count lower than reality
-- with nothing to indicate rows had been overwritten rather than fixed.
--
-- Adding `source` to the key lets both coexist. It cannot create duplicates
-- from existing data — every current row is (venue, <id>, 'nominatim') and was
-- already unique on the narrower key.
--
-- The matching change in pipeline-geo-validate's onConflict ships in the same
-- PR: ON CONFLICT requires an index matching its column list exactly, so
-- leaving that at 'content_type,content_id' would make every write from that
-- function fail with "no unique or exclusion constraint matching" — the same
-- shape as the city_review_queue view incident.
drop index if exists public.idx_geo_validations_unique;
create unique index if not exists idx_geo_validations_unique
  on public.geo_validations (content_type, content_id, source);

-- ── geo_country_at: same function, index-usable ─────────────────────────────
-- Replaced rather than edited in place: 20270501174244 is already APPLIED, and
-- an applied migration is never modified. Only the access path changes; the
-- semantics (exact containment first, bounded nearest fallback for coastal
-- points, never across a land border) are identical.
--
-- Casting to geography ignores the GIST index on geom, so every call scanned
-- all 258 country polygons. A 3,000-row replay hit the statement timeout in
-- geo_country_at alone. The && prefilter makes the index usable and the same
-- replay runs in seconds.
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

-- ── Is this point in, or acceptably near, the country it CLAIMS? ────────────
-- This is the question the validator actually needs, and asking the other one
-- ("which polygon wins") produced a false-positive class the replay gate
-- caught before any of this shipped.
--
-- Measured over 3,000 venues already known good (within 25 km of their linked
-- city): 2,991 ok, 9 flagged, and SEVEN of the nine were border towns — a Basel
-- venue literally called Dreiländereck ("three-country corner") resolving to
-- Germany, Konstanz resolving to Switzerland, Kerkrade to Germany, Weil am
-- Rhein to Switzerland, Podčetrtek to Croatia. A 1:10m boundary generalises the
-- border by up to a kilometre, so a venue near an international line lands on
-- the wrong side of it. Key West was an eighth: the Florida Keys are thin
-- enough at this resolution that a real US venue is 12 km off the US polygon.
--
-- The tolerance is set from that measurement, not from taste:
--     border / island artifacts   255 m .. 12,369 m
--     genuine defects          7,584 km .. 12,388 km   (Chicago->Johannesburg)
-- a 600x gap. 25 km sits with 2x headroom over the worst artifact and remains
-- 300x below the smallest real defect, so widening or halving it changes
-- nothing. A tolerance is only safe when the two populations are separated by
-- orders of magnitude — which is why it is quoted here.
create or replace function public.geo_point_near_country(
  p_lat numeric,
  p_lng numeric,
  p_iso text,
  p_tolerance_m integer default 25000
) returns boolean
language sql
stable
set search_path = public, extensions
as $$
  with pt as (
    select ST_SetSRID(ST_MakePoint(p_lng::float8, p_lat::float8), 4326) as g
  )
  select exists (
    select 1
    from public.geo_boundaries b, pt
    where b.boundary_kind = 'country'
      and b.iso_a2 is not null
      -- The claimed code itself, or the sovereign it belongs to, or a territory
      -- that belongs to it. Réunion has no polygon of its own and its points
      -- fall inside France; Guam has one and its venues are filed US. Both
      -- directions have to resolve or the territory false positives come back.
      and public.geo_countries_equivalent(b.iso_a2, p_iso)
      -- BBOX PREFILTER FIRST, and it is not optional. Casting straight to
      -- geography ignores the GIST index on geom and scans every polygon: a
      -- 3,000-row replay exceeded the statement timeout without this line and
      -- ran in 36 s with it. 0.5 degrees comfortably envelopes a 25 km
      -- tolerance at any latitude; the precise geography test below decides.
      and b.geom && ST_Expand(pt.g, 0.5)
      and ST_DWithin(b.geom::geography, pt.g::geography, greatest(p_tolerance_m, 0))
  );
$$;

comment on function public.geo_point_near_country(numeric, numeric, text, integer) is
  'True when a coordinate lies inside, or within p_tolerance_m of, the polygon of the given country OR an equivalent (its sovereign, or a territory of it). Default 25 km, set from measurement: border-town and thin-island artifacts reach 12.4 km while genuine defects start at 7,584 km. Ask this rather than "which polygon contains the point" — the latter flags every border town.';

-- ── Which admin-1 polygon contains this point? ───────────────────────────────
-- Returns the polygon's ID, not its name, and that is the whole point.
--
-- The first version compared the admin-1 NAME against `cities.region_name` via
-- regions_contradict(). Measured over 2,000 known-good venues it produced 736
-- false positives — a 37% rate — and every one was a vocabulary mismatch rather
-- than a geographic disagreement:
--     language     North Holland / Noord-Holland, Bavaria / Bayern,
--                  Zurich / Zürich, Osaka Prefecture / Ōsaka
--     granularity  Paris / Île-de-France, Barcelona / Catalonia,
--                  Milano / Lombardy, Westminster / England
-- regions_contradict() compares two values drawn from OUR vocabulary; Natural
-- Earth's admin-1 names are a different vocabulary, in different languages, at
-- a different level of the hierarchy. Comparing them and calling the difference
-- a finding is exactly the ISO-2-vs-English-name defect this project started by
-- fixing — reproduced one layer along, and caught only because the replay gate
-- was run before shipping.
--
-- Comparing polygon IDs removes the vocabulary from the question entirely: is
-- the venue in the same admin-1 as its own linked city, yes or no. Same
-- measurement, 1,500 known-good rows: 37% false positives fell to 3.8%.
create or replace function public.geo_admin1_id_at(p_lat numeric, p_lng numeric)
returns bigint
language sql
stable
set search_path = public, extensions
as $$
  select b.id
  from public.geo_boundaries b
  where b.boundary_kind = 'admin1'
    -- bbox prefilter so the GIST index is usable; without it a few thousand
    -- rows is a full scan of 4,596 polygons each and the sweep times out.
    and b.geom && ST_SetSRID(ST_MakePoint(p_lng::float8, p_lat::float8), 4326)
    and ST_Intersects(b.geom, ST_SetSRID(ST_MakePoint(p_lng::float8, p_lat::float8), 4326))
  limit 1;
$$;

comment on function public.geo_admin1_id_at(numeric, numeric) is
  'ID of the admin-1 polygon containing a coordinate, for comparing a venue against its own linked city WITHOUT comparing names. Name comparison against cities.region_name was measured at 37% false positives (Bavaria vs Bayern, Paris vs Île-de-France); polygon identity is 3.8%. Deliberately NO nearest-neighbour fallback: an admin-1 miss must read as unknown and leave the country verdict alone.';

-- ── Entity coordinate + its two claimed locations, one shape for all types ───
create or replace view public.geo_checkable_entities
with (security_invoker = true) as
  select 'venue'::text as entity_type, v.id, v.latitude, v.longitude,
         v.country as country_text, v.city_id, v.updated_at
    from public.venues v where v.duplicate_of_id is null
  union all
  select 'event', e.id, e.latitude, e.longitude, e.country, e.city_id, e.updated_at
    from public.events e where e.duplicate_of_id is null
  union all
  select 'hotel', h.id, h.latitude::numeric, h.longitude::numeric, h.country, h.city_id, h.updated_at
    from public.hotels h
  union all
  select 'organization', o.id, o.latitude::numeric, o.longitude::numeric, null::text, o.city_id, o.updated_at
    from public.organizations o;

comment on view public.geo_checkable_entities is
  'Every entity carrying a coordinate plus the two independent claims about where it is (own country text, city link). One shape so the containment validator cannot drift into four slightly different rules — the mistake that put one city-collision rule in a SQL runner and a subtly different one in an edge function.';

-- ── The adjudicator ─────────────────────────────────────────────────────────
create or replace function public.geo_containment_check(
  p_entity_type text default null,
  p_batch int default 500,
  p_write boolean default true
) returns jsonb
language plpgsql
volatile
set search_path = public, extensions
as $$
declare
  v_result jsonb;
  v_boundary_rows bigint;
begin
  -- POSITIVE CONTROL, and it is the whole reason this function can be trusted.
  -- Over an empty geo_boundaries every point resolves to "no containing
  -- country", so every row would be classified `offshore` and a caller reading
  -- only the ok-count would see a corpus with zero country mismatches. An
  -- absent boundary set and a clean corpus are indistinguishable from the
  -- verdict distribution alone, so refuse rather than report.
  select count(*) into v_boundary_rows
  from public.geo_boundaries where boundary_kind = 'country' and iso_a2 is not null;

  if v_boundary_rows = 0 then
    raise exception 'geo_boundaries holds no country polygons — refusing to run: every row would read as offshore and that is indistinguishable from a clean corpus';
  end if;

  with canon as (
    -- Canonicalise to the ISO-2 CODE, not the display name, because that is
    -- what geo_boundaries.iso_a2 carries. Same discipline as
    -- _shared/geo-normalize.ts: comparing two representations of one fact and
    -- calling the difference a finding is what produced 692 false alerts.
    select lower(btrim(c.name)) as k, c.code from public.countries c where c.name is not null
    union all
    select lower(btrim(c.code)), c.code from public.countries c where c.code is not null
  ),
  batch as (
    select e.*
    from public.geo_checkable_entities e
    where e.latitude is not null and e.longitude is not null
      and (p_entity_type is null or e.entity_type = p_entity_type)
    order by e.entity_type, e.id
    limit greatest(p_batch, 1)
  ),
  claims as (
    select b.entity_type, b.id, b.latitude, b.longitude,
           ck.code        as claimed_iso,
           lco.code       as linked_iso,
           lc.latitude    as city_lat,
           lc.longitude   as city_lng
    from batch b
    left join canon ck on ck.k = lower(btrim(b.country_text))
    left join public.cities lc on lc.id = b.city_id
    left join public.countries lco on lco.id = lc.country_id
  ),
  -- PASS 1: is the point in or near the country it claims? This settles the
  -- overwhelming majority (3,000/3,000 of a known-good sample) and is cheap.
  -- geo_country_at is only called in pass 2, for the residue — calling it for
  -- every row made a 3,000-row replay exceed the statement timeout.
  near as (
    select c.*,
      case
        when c.linked_iso is not null
             then public.geo_point_near_country(c.latitude, c.longitude, c.linked_iso)
        when c.claimed_iso is not null
             then public.geo_point_near_country(c.latitude, c.longitude, c.claimed_iso)
        else false
      end as near_claim,
      case when c.city_lat is null then null else
        2*6371*asin(sqrt(power(sin(radians(c.latitude - c.city_lat)/2),2)
          + cos(radians(c.city_lat))*cos(radians(c.latitude))
            *power(sin(radians(c.longitude - c.city_lng)/2),2)))
      end as km_to_city
    from claims c
  ),
  resolved as (
    select n.*,
           g.iso_a2     as coord_iso,
           g.match_kind as coord_match,
           -- admin-1 ids only where they can matter: the row already agrees at
           -- country level and is far enough from its city for a disagreement
           -- to mean something.
           case when n.near_claim and n.km_to_city > 100
                then public.geo_admin1_id_at(n.latitude, n.longitude) end as venue_admin1,
           case when n.near_claim and n.km_to_city > 100
                then public.geo_admin1_id_at(n.city_lat, n.city_lng) end as city_admin1
    from near n
    left join lateral public.geo_country_at(n.latitude, n.longitude) g
      on not n.near_claim
  ),
  judged as (
    select r.*,
      case
        -- NEAR-THE-CLAIM FIRST. Everything below only runs once we know the
        -- point is NOT within 25 km of the country it claims, which is what
        -- keeps border towns and thin islands out of the queue. Ordering this
        -- ahead of the coord_iso arms is load-bearing: a Basel venue resolves
        -- to the German polygon and is still 255 m from the Swiss one.
        when r.near_claim then 'ok'
        -- No containing polygon AND not near the claim: genuinely nowhere.
        when r.coord_iso is null then 'offshore'
        when r.linked_iso is null and r.claimed_iso is null then 'unverifiable'
        -- Coordinate corroborated by the row's OWN country text while the city
        -- link disagrees. The link is the defect; the coordinate is evidence.
        when r.claimed_iso is not null and r.linked_iso is not null
             and public.geo_countries_equivalent(r.coord_iso, r.claimed_iso) then 'link_wrong'
        -- Text and link agree with each other and not with the point.
        when r.claimed_iso is not null and r.linked_iso is not null
             and public.geo_countries_equivalent(r.claimed_iso, r.linked_iso) then 'coord_wrong'
        else 'unresolved'
      end as verdict
    from resolved r
  ),
  -- admin-1 refinement runs ONLY on rows already agreeing at country level.
  -- Applying it to a row whose country is wrong would report the province of a
  -- country the row is not in.
  --
  -- TWO gates, both measured. The polygon comparison replaces name matching
  -- (see geo_admin1_id_at), and the 100 km distance gate removes what remains.
  -- Admin-1 disagreement by distance from the linked city, over 2,500 venues:
  --      <=25 km   3.5%   metro areas legitimately spanning a regional border
  --     25-100 km   27%
  --    100-500 km   84%
  --      >500 km    90%
  -- Metro spillover is real but always NEAR. A same-name twin (Portland ME vs
  -- OR) is a different state away by construction, so >100 km keeps 84-90% of
  -- the signal and drops the false-positive class entirely rather than
  -- tolerating it.
  refined as (
    select j.*,
      case
        when j.verdict = 'ok'
             and j.km_to_city > 100
             and j.venue_admin1 is not null
             and j.city_admin1 is not null
             and j.venue_admin1 <> j.city_admin1
        then 'admin1_wrong' else j.verdict
      end as final_verdict
    from judged j
  ),
  written as (
    insert into public.geo_validations (
      content_type, content_id, original_lat, original_lng,
      validated_lat, validated_lng, country, region,
      confidence, has_mismatch, mismatch_details, source, last_validated_at
    )
    select f.entity_type, f.id, f.latitude, f.longitude,
           f.latitude, f.longitude,
           f.coord_iso, null::text,
           case f.final_verdict when 'ok' then 0.95 when 'unverifiable' then 0.5 else 0.4 end,
           f.final_verdict not in ('ok', 'unverifiable'),
           case when f.final_verdict in ('ok','unverifiable') then null else
             format('%s: coordinate in %s, text says %s, city link says %s%s',
                    f.final_verdict, coalesce(f.coord_iso,'(nowhere)'),
                    coalesce(f.claimed_iso,'(none)'), coalesce(f.linked_iso,'(none)'),
                    case when f.final_verdict = 'admin1_wrong'
                         then format(', %s km from its city in a different admin-1',
                                     round(f.km_to_city)) else '' end)
           end,
           'geo_containment', now()
    from refined f
    where p_write
    -- Must name the index's columns EXACTLY, `source` included. This clause
    -- was left at (content_type, content_id) after the index gained `source`
    -- a few lines above, and the function then failed at runtime with
    -- "no unique or exclusion constraint matching the ON CONFLICT
    -- specification" — the very trap this file's header warns about, walked
    -- into inside the same file.
    on conflict (content_type, content_id, source) do update
      set original_lat = excluded.original_lat,
          original_lng = excluded.original_lng,
          country = excluded.country,
          region = excluded.region,
          confidence = excluded.confidence,
          has_mismatch = excluded.has_mismatch,
          mismatch_details = excluded.mismatch_details,
          source = excluded.source,
          last_validated_at = excluded.last_validated_at
    returning 1
  )
  select jsonb_build_object(
    'examined', (select count(*) from refined),
    'written', (select count(*) from written),
    'boundary_rows', v_boundary_rows,
    'by_verdict', (select coalesce(jsonb_object_agg(final_verdict, n), '{}'::jsonb)
                     from (select final_verdict, count(*) as n from refined group by 1) t),
    'by_match_kind', (select coalesce(jsonb_object_agg(coalesce(coord_match,'none'), n), '{}'::jsonb)
                     from (select coord_match, count(*) as n from refined group by 1) t)
  ) into v_result;

  return v_result;
end $$;

comment on function public.geo_containment_check(text, int, boolean) is
  'Adjudicates entity coordinates against Natural Earth polygons using three independent signals (containing polygon, own country text, city link) so a disagreement can be localised to the coordinate, the link, or neither. Refuses to run when geo_boundaries is empty, because an empty boundary set classifies everything offshore and reads exactly like a clean corpus. p_write=false makes it a pure reporter.';

revoke all on function public.geo_containment_check(text, int, boolean) from public;
grant execute on function public.geo_containment_check(text, int, boolean) to service_role;
grant execute on function public.geo_admin1_id_at(numeric, numeric) to authenticated, service_role;
grant execute on function public.geo_point_near_country(numeric, numeric, text, integer) to authenticated, service_role;
grant select on public.geo_checkable_entities to authenticated, service_role;
