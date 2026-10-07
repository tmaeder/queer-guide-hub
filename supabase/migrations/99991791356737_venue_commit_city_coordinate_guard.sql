-- commit_venue_staging_item: never resolve a venue's city by name alone.
--
-- MEASURED 2026-10-07: 1,410 live venues sit more than 100 km from the city
-- they are linked to while another city lies within 25 km of their own
-- coordinates — 701 from the existing corpus and 709 from the gays-cruising
-- import of 2026-10-05, and 438 of those 709 are linked to a city in a
-- DIFFERENT COUNTRY: "Parc Jules Descampe, Waterloo" (Belgium) on Waterloo,
-- USA; "Jack and Jill Adult Superstore, Venice" (Florida) on Venice, Italy;
-- "Cleveland Point, Cleveland" (Queensland) on Cleveland, USA; "The Ship Inn,
-- Rochester ME1" (Kent) on Rochester, USA. A hand-read sample showed the
-- COORDINATES right and the CITY wrong in essentially every case.
--
-- THE PRODUCER is this function's cross-country fallback. When
-- city_pick_in_country() finds nothing in the resolved country it fell back to
--   lower(c.name) = lower(city)  ORDER BY c.population DESC  LIMIT 1
-- over the WHOLE table — i.e. the largest same-name city anywhere on earth,
-- ignoring both the country the source supplied and the coordinates it
-- supplied. The country the source sent is then discarded too, because
-- trg_venues_geo_derive re-derives country_id from the city.
--
-- THE FIX, two arms:
--   1. The fallback runs only when NO country resolved, only when the row has
--      coordinates, and only within 100 km of them — nearest first, never
--      largest first. A known country is never crossed.
--   2. A coordinate guard on whatever was picked: a city more than 100 km from
--      the venue's own coordinates is refused and city_id stays NULL. This
--      also catches a same-name namesake INSIDE one country that region
--      disambiguation missed.
-- A NULL city_id is recoverable; a wrong one is not, because the geo-derive
-- trigger turns it into a wrong country, state and timezone and the dedup
-- sweep (which blocks on city) can then no longer see real duplicates.
--
-- 100 km is a measured bound, not a round guess: across the 51,939 live
-- venue->city links carrying coordinates on both sides, p50 is 2.7 km and p95
-- 46.7 km; 695 sit in 25-50 km, 205 in 50-100 km, and 2,308 beyond 100 km,
-- where the defect lives.
--
-- KNOWN COST, stated rather than hidden: a city row whose own centroid is
-- wrong (Limoges was measured 342 km from an address inside it) will now
-- refuse correct links. Those land NULL, which is the honest state for a row
-- whose city cannot be corroborated.
--
-- The function is PATCHED via pg_get_functiondef() rather than restated, so
-- whatever later migrations changed elsewhere in its body survives. Every
-- replace() is asserted to have matched; a silent no-op raises.

do $patch$
declare
  v_def  text;
  v_new  text;
  c_old_fallback constant text :=
$old$    IF v_city_id IS NULL THEN
      SELECT c.id INTO v_city_id FROM public.cities c
      WHERE lower(c.name) = lower(btrim(v_loc->>'city'))
        AND c.duplicate_of_id IS NULL
        AND (c.slug IS NULL OR c.slug NOT LIKE 'tmp-%')
      ORDER BY c.population DESC NULLS LAST
      LIMIT 1;
    END IF;
  END IF;
$old$;
  c_new_fallback constant text :=
$new$    -- Name-only fallback: NEVER across a known country, and only where the
    -- row's own coordinates corroborate the candidate (99991791356737).
    IF v_city_id IS NULL AND v_country_id IS NULL AND v_lat IS NOT NULL AND v_lng IS NOT NULL THEN
      SELECT c.id INTO v_city_id FROM public.cities c
      WHERE lower(c.name) = lower(btrim(v_loc->>'city'))
        AND c.duplicate_of_id IS NULL
        AND (c.slug IS NULL OR c.slug NOT LIKE 'tmp-%')
        AND c.latitude IS NOT NULL AND c.longitude IS NOT NULL
        AND public.haversine_m(v_lat, v_lng, c.latitude, c.longitude) <= 100000
      ORDER BY public.haversine_m(v_lat, v_lng, c.latitude, c.longitude)
      LIMIT 1;
    END IF;
  END IF;

  -- Coordinate guard (99991791356737): a city more than 100 km from the
  -- venue's own coordinates is not this venue's city. Leave it NULL.
  IF v_city_id IS NOT NULL AND v_lat IS NOT NULL AND v_lng IS NOT NULL THEN
    PERFORM 1 FROM public.cities c
     WHERE c.id = v_city_id
       AND c.latitude IS NOT NULL AND c.longitude IS NOT NULL
       AND public.haversine_m(v_lat, v_lng, c.latitude, c.longitude) > 100000;
    IF FOUND THEN
      v_city_id := NULL;
    END IF;
  END IF;
$new$;
begin
  select pg_get_functiondef('public.commit_venue_staging_item(uuid,text)'::regprocedure) into v_def;

  if position('99991791356737' in v_def) > 0 then
    raise notice 'commit_venue_staging_item already carries the coordinate guard; nothing to do';
    return;
  end if;

  if position(c_old_fallback in v_def) = 0 then
    raise exception 'commit_venue_staging_item: the population-ordered cross-country fallback was not found verbatim; the live body has changed — re-read it before patching';
  end if;

  v_new := replace(v_def, c_old_fallback, c_new_fallback);
  execute v_new;
end
$patch$;

-- Sentinel: venues whose city is more than 100 km from their own coordinates.
-- The historical backlog (measured 2,308) is reported, not gated; what must
-- stay at zero is NEW rows created after this guard, which can only come from
-- a writer that bypasses it.
create or replace function public.venue_city_coord_signals()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with v as (
    select v.created_at,
           public.haversine_m(v.latitude, v.longitude, c.latitude, c.longitude) / 1000 as km
      from public.venues v
      join public.cities c on c.id = v.city_id
     where v.duplicate_of_id is null
       and v.closed_at is null
       and coalesce(v.review_status, '') <> 'archived'
       and v.latitude is not null and v.longitude is not null
       and c.latitude is not null and c.longitude is not null
  )
  select jsonb_build_object(
    'probe_ok', true,
    'links_checkable', count(*),
    'over_100km', count(*) filter (where km > 100),
    'over_100km_created_last_7d', count(*) filter (where km > 100 and created_at > now() - interval '7 days')
  )
  from v;
$$;

revoke all on function public.venue_city_coord_signals() from public, anon, authenticated;
grant execute on function public.venue_city_coord_signals() to service_role;

do $verify$
declare
  v_def text;
  v_sig jsonb;
begin
  select pg_get_functiondef('public.commit_venue_staging_item(uuid,text)'::regprocedure) into v_def;

  -- P1: the population-ordered fallback is gone.
  if position('ORDER BY c.population DESC NULLS LAST' in v_def) > 0 then
    raise exception 'P1 failed: commit_venue_staging_item still orders a city fallback by population';
  end if;

  -- P2: both arms are present.
  if position('v_city_id IS NULL AND v_country_id IS NULL AND v_lat IS NOT NULL' in v_def) = 0 then
    raise exception 'P2 failed: the fallback is not restricted to an unknown country with coordinates';
  end if;
  if position('haversine_m(v_lat, v_lng, c.latitude, c.longitude) > 100000' in v_def) = 0 then
    raise exception 'P2 failed: the coordinate guard is missing';
  end if;

  -- P3: the guard runs BEFORE the insert/update that writes city_id.
  if position('> 100000' in v_def) > position('INSERT INTO public.venues' in v_def) then
    raise exception 'P3 failed: the coordinate guard sits after the INSERT that uses v_city_id';
  end if;

  -- P4: the sentinel executes and sees a populated corpus.
  v_sig := public.venue_city_coord_signals();
  if coalesce((v_sig->>'links_checkable')::int, 0) < 1000 then
    raise exception 'P4 failed: venue_city_coord_signals sees % links; the probe is not measuring this corpus', v_sig->>'links_checkable';
  end if;
end
$verify$;
