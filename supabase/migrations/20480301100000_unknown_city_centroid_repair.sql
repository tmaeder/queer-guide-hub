-- A reverse-geocode that could not name a place wrote a city called "Unknown",
-- and 52 events worldwide were then pinned to it.
--
-- `cities` row 54da9cfe-1642-44fd-8478-f6e1d01ec12f: name "Unknown", slug
-- "unknown", data_source 'nominatim-geocode', coordinates 39.543762/2.7237202
-- (Mallorca, Spain), created 2026-05-10. It was `shell_status='real'` and
-- **`seo_indexable=true`**, i.e. a live, crawlable city page named "Unknown".
--
-- WHAT IT DID TO CONTENT. `run_event_geo_fill` stamps a city centroid onto
-- events that lack coordinates, marking them
-- `field_provenance.latitude.source='derived:city_centroid'`. Because this
-- "city" had coordinates, all 52 of its events were stamped with the SAME
-- point in Mallorca. Measured: 52 of 52 on that exact point, `distinct_points
-- = 1`. So "Lazy Bear Week" (Guerneville, California), "Xlsior Festival
-- Mykonos" (Greece), "Lausanne Pride 2026" (Switzerland) and "POSH PVR
-- Escape" (Puerto Vallarta, Mexico) all rendered at one spot in Spain.
--
-- Only 4 of the 52 were visible to `geo_integrity_violations`
-- (`event_city_country_mismatch`) — the four that also carry a contradicting
-- `country_id`. The other 48 are wrong in exactly the same way but contradict
-- nothing, so no detector named them. The visible 4 were the tip.
--
-- WHY COORDINATES ARE CLEARED, NOT RECOMPUTED. There is no correct value to
-- write: the city was never a place, so nothing here knows where these events
-- are. A null coordinate is recoverable — `run_event_geo_fill` will re-derive
-- one once a real `city_id` is linked — while a wrong one renders a pin in
-- the sea. Same rule as `20260802090844`, which blocks rather than guesses a
-- `city_id`.
--
-- Cohorted before clearing, because clearing a bad value can destroy the only
-- good copy: all 52 are `derived:city_centroid` and NOT ONE carries an
-- original coordinate, so this destroys no measurement. The 7 venues are
-- deliberately different — 0 sit on the centroid (5 have no coordinates, 2
-- have their own real ones), so venues lose only the bad `city_id` and keep
-- their geometry.
--
-- The prior city_id and coordinates are stamped onto
-- `enrichment_status.unknown_city_repair` so the repair is reversible; the
-- city row itself is archived with the reversible
-- `archive_city_as_nonplace` (never a hard DELETE — `unarchive_city` undoes
-- it), which also sets `seo_indexable=false` and takes the page out of search
-- via `20261016110000`'s status filter.
--
-- NOT claimed by this migration: `geo_hygiene_stats().containment_total` (83,
-- over its 82 baseline). That is a SEPARATE, cached sweep
-- (`findings_age_hours` ~15) keyed on coordinate-vs-boundary containment, not
-- on `geo_integrity_violations`. Clearing these coordinates should remove the
-- `country_mismatch:event` members once the sweep re-runs, but the count is
-- not asserted here because this transaction cannot recompute it — measuring
-- it inside the txn returns the stale 83 and would make a false assertion.
--
-- Dry-run on prod in a rolled-back transaction: events_left 0, venues_left 0,
-- stamped 52, coords_refilled_by_trigger 0, country_wiped 0,
-- event_city_country_mismatch 4 -> 0, venue coordinates kept.

do $$
declare
  v_city uuid := '54da9cfe-1642-44fd-8478-f6e1d01ec12f';
  v_events int;
  v_venues int;
  v_left   int;
begin
  -- Soft on preconditions: a concurrent session may already have repaired
  -- this, and an exact-match premise would abort and block every migration
  -- queued behind it. No-op what is already done.
  if not exists (select 1 from cities where id = v_city) then
    raise notice 'unknown-city row absent - nothing to repair';
    return;
  end if;

  update events e
  set enrichment_status = coalesce(e.enrichment_status, '{}'::jsonb) || jsonb_build_object(
        'unknown_city_repair', jsonb_build_object(
          'at', now(),
          'prior_city_id', e.city_id,
          'prior_latitude', e.latitude,
          'prior_longitude', e.longitude,
          'reason', 'city was a nominatim-geocode artifact named "Unknown"')),
      latitude  = null,
      longitude = null,
      field_provenance = coalesce(e.field_provenance, '{}'::jsonb) - 'latitude' - 'longitude',
      city_id = null
  where e.city_id = v_city
    -- Only the derived stamp. A real coordinate, if one ever lands here, is
    -- left alone.
    and e.field_provenance->'latitude'->>'source' = 'derived:city_centroid';
  get diagnostics v_events = row_count;

  -- Venues keep their geometry; only the bad link goes.
  update venues set city_id = null where city_id = v_city;
  get diagnostics v_venues = row_count;

  -- Any event on this city that was NOT centroid-stamped still must not point
  -- at a non-place.
  update events set city_id = null where city_id = v_city;

  perform archive_city_as_nonplace(
    v_city,
    'nominatim-geocode artifact named "Unknown" (Mallorca centroid); its coordinates were stamped onto 52 events worldwide',
    jsonb_build_object('events_cleared', v_events, 'venues_cleared', v_venues));

  -- Hard on postconditions: assert the state this file exists to reach.
  select count(*) into v_left from events where city_id = v_city;
  if v_left <> 0 then
    raise exception 'unknown-city repair left % event(s) still linked', v_left;
  end if;

  select count(*) into v_left from venues where city_id = v_city;
  if v_left <> 0 then
    raise exception 'unknown-city repair left % venue(s) still linked', v_left;
  end if;

  select count(*) into v_left from geo_integrity_violations
   where violation = 'event_city_country_mismatch';
  if v_left <> 0 then
    raise exception 'event_city_country_mismatch still at % after repair', v_left;
  end if;

  if exists (select 1 from cities
              where id = v_city and coalesce(seo_indexable, true) is true) then
    raise exception 'unknown-city row is still seo_indexable';
  end if;

  raise notice 'unknown-city repair: % events, % venues, city archived', v_events, v_venues;
end $$;
