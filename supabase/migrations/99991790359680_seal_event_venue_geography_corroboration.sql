-- A venue is a strong signal for an event's city. It is not an unconditional one,
-- and `tg_event_venue_geography` treated it as unconditional.
--
-- 99991789886174 (#3870) cleared every event sitting over 250 km from the city it was
-- presented on, and asserted zero as a postcondition. Four days later the count was 1
-- again. `content_revisions` names the writer exactly: a `system` UPDATE on
-- 2026-09-24 17:37 touching `city_id`, `geo_linked_at` and `field_provenance` -- the
-- signature of `tg_event_venue_geography`, added that same day by 20260924043359.
--
-- IT WAS NOT THE NAME-COLLISION PRODUCER, AND THE FIRST GUESS WAS WRONG. The obvious
-- suspect was `geo-link-content`, which CLAUDE.md records as resolving by name and
-- preferring the more populous twin. Reading it settles that it could not have done
-- this: `resolveCity` returns a row only when the name is globally unambiguous, and
-- "Fort Lauderdale" resolves to exactly one row. The trigger is the writer.
--
-- THE CHAIN, AND WHY THE TRIGGER IS ONLY THE SECOND LINK:
--   "Harte Arbeit Fort Lauderdale" sits at 26.1224 / -80.1373, which is Fort
--   Lauderdale, and its coordinates are byte-identical to the Fort Lauderdale city
--   centroid, so it was linked correctly once. It carries `venue_id` for **"The
--   Eagle" at 40.7517 / -74.0043 -- New York City**. "The Eagle" is a bar name that
--   exists in a dozen cities, so the event↔venue link is itself a name collision, the
--   defect class 20260802100455 documents for `link_event_venues`. The trigger then
--   did its job faithfully and propagated that venue's city onto the event, 1,718 km
--   from the event's own coordinates.
--
-- So the trigger is not wrong to trust a venue. It is wrong to trust one 1,718 km away
-- without asking whether the event's own coordinates agree -- which is this repo's
-- standing rule, stated in CLAUDE.md for `run_event_city_link`, the news linker and
-- `venue-accessibility-osm`: never resolve by one signal when a second, independent
-- one is available, and refuse when it disagrees.
--
-- THE BOUND IS MEASURED, NOT REUSED. Across all 1,670 venue-derived event links live
-- today: p50 = 0.0 km, p95 = 3.4 km, p99 = 6.1 km, and the SECOND-largest value is
-- 23.1 km against a largest of 1,718.1 km. The corpus is bimodal with nothing at all
-- between 23 and 1,718, so 250 km sits inside that gap with 10.9x headroom over the
-- largest legitimate value and 6.9x margin under the defect. It refuses exactly 1 of
-- 1,670 today and must keep allowing the other 1,669; both directions are asserted.
--
-- IT FAILS OPEN when either side has no coordinates -- 1 event corpus-wide -- because
-- absence of evidence is not evidence of disagreement. That is the same call
-- `_shared/city-class-guard.ts` makes for a coordinate-less city row, and the cost
-- here is one row.
--
-- ON A REFUSAL THE WHOLE VENUE-DERIVED BLOCK IS SKIPPED, not just the city. A venue
-- 1,718 km from the event is not this event's venue at all, so its country and its
-- country code are equally suspect, and `geo_linked_at` is deliberately left unset so
-- the row does not read as successfully linked. The refusal is recorded on
-- `enrichment_status.geography` with the distance, reusing the `state:'review'` shape
-- the existing `venue_country_contradicted_previous_city` branch already writes.
--
-- Soft on preconditions, hard on postconditions: the repair is guarded on the defect,
-- so a concurrent fix is skipped rather than aborting `db push` repo-wide.

begin;

-- ---------------------------------------------------------------------------
-- 1. The guard. Everything else in this function is byte-for-byte the behaviour
--    20260924043359 shipped; the only change is the corroboration test and the
--    early return it protects.
-- ---------------------------------------------------------------------------
create or replace function public.tg_event_venue_geography()
returns trigger language plpgsql set search_path = public, pg_temp as $function$
declare
  v record;
  v_city_country_id uuid;
  v_city_lat numeric;
  v_city_lon numeric;
  v_km numeric;
begin
  if new.venue_id is null then return new; end if;
  select venue.city_id,venue.country_id,country.code country_code into v
  from public.venues venue left join public.countries country on country.id=venue.country_id
  where venue.id = new.venue_id;
  if found then
    -- Corroboration. Only ever REFUSES; it never invents a link. Fails open when
    -- either side lacks coordinates, because then there is nothing to disagree with.
    if v.city_id is not null and new.latitude is not null and new.longitude is not null then
      select latitude, longitude into v_city_lat, v_city_lon
      from public.cities where id = v.city_id;
      if v_city_lat is not null and v_city_lon is not null then
        v_km := public.haversine_m(new.latitude::numeric, new.longitude::numeric,
                                   v_city_lat::numeric, v_city_lon::numeric) / 1000;
        if v_km > 250 then
          -- The venue cannot be this event's venue. Propagate none of its geography,
          -- leave geo_linked_at unset so the row does not read as linked, and queue it.
          new.enrichment_status := jsonb_set(coalesce(new.enrichment_status,'{}'::jsonb),'{geography}',
            jsonb_build_object('state','review','reason','venue_too_far_from_event_coordinates',
              'venue_id',new.venue_id,'venue_city_id',v.city_id,
              'distance_km',round(v_km),'at',now()),true);
          new.needs_attention := true;
          return new;
        end if;
      end if;
    end if;

    if v.city_id is not null then
      new.city_id := v.city_id;
    elsif new.city_id is not null and v.country_id is not null then
      select country_id into v_city_country_id from public.cities where id=new.city_id;
      if v_city_country_id is distinct from v.country_id then
        new.city_id := null;
        new.enrichment_status := jsonb_set(coalesce(new.enrichment_status,'{}'::jsonb),'{geography}',
          jsonb_build_object('state','review','reason','venue_country_contradicted_previous_city','at',now()),true);
      end if;
    end if;
    new.country_id := coalesce(v.country_id, new.country_id);
    new.country := coalesce(v.country_code,new.country);
    new.geo_linked_at := now();
    new.field_provenance := coalesce(new.field_provenance, '{}'::jsonb) || jsonb_build_object(
      'country_id', jsonb_build_object('source', 'venue', 'source_ref', new.venue_id,
        'imported_at', now(), 'method', 'foreign_key_derivation'));
  end if;
  return new;
end
$function$;

-- ---------------------------------------------------------------------------
-- 2. Snapshot the legitimate venue-derived links BEFORE the repair, so the
--    postconditions can assert this migration moved one row and not 1,670.
-- ---------------------------------------------------------------------------
create temporary table _vg_before on commit drop as
select e.id, e.city_id, e.venue_id
  from public.events e
 where e.duplicate_of_id is null;

-- ---------------------------------------------------------------------------
-- 3. Repair the one row. The WRONG VENUE is detached -- that is the root defect and
--    it is provable (a New York bar on a Florida event, 1,718 km) -- and the city is
--    restored to the row the event's OWN coordinates corroborate at 0.0 km, which is
--    the strongest signal available and needs no name matching at all.
--
--    `venue_name` text is deliberately KEPT: "The Eagle" is what the source said, and
--    it is the only human-readable record of which venue to re-attach.
--
--    "Eagle Wilton Manors" (26.1565 / -80.1385, 4 km away, the Fort Lauderdale-area
--    Eagle) is NAMED in the stamp and deliberately NOT linked. Attaching it would be
--    an identity claim resting on a shared word and proximity, which is exactly what
--    produced this row; under-reaching is the correct error here, so a human decides.
--
--    Nulling venue_id also makes the trigger above return at its first line, so the
--    city written here cannot be overwritten within this statement.
-- ---------------------------------------------------------------------------
update public.events e
   set venue_id = null,
       city_id = ftl.id,
       needs_attention = true,
       enrichment_status = coalesce(e.enrichment_status,'{}'::jsonb)
         || jsonb_build_object('event_venue_link', jsonb_build_object(
              'by', 'migration:99991790359680',
              'detached', true,
              'reason', 'venue_name_collision_across_cities',
              'detail', 'was linked to "The Eagle" in New York City (40.7517/-74.0043), 1718 km from this Fort Lauderdale event; tg_event_venue_geography then propagated that venue''s city onto the event. City restored from the event''s own coordinates (0.0 km). Likely correct venue is "Eagle Wilton Manors" (26.1565/-80.1385, 4 km) -- NOT linked here, because a shared word plus proximity is what produced the defect.',
              'candidate_venue_id', '26277d0a-2573-4366-a33c-7ce35fcd8ac6'))
  from public.cities ftl
 where e.id = 'e277dc22-1de3-4d55-9842-f2d49d53d459'
   and ftl.slug = 'fort-lauderdale'
   and ftl.duplicate_of_id is null
   and e.duplicate_of_id is null
   -- soft precondition: only act on the defect
   and e.venue_id = '02eab47f-c039-4e3c-baaa-86dd70527ad0'
   and e.latitude is not null
   -- and only when the event's own coordinates really do corroborate Fort Lauderdale
   and haversine_m(e.latitude::numeric, e.longitude::numeric,
                   ftl.latitude::numeric, ftl.longitude::numeric) < 25000;

do $verify$
declare
  v_bad int;
  v_moved int;
  v_src text := (select pg_get_functiondef(oid) from pg_proc where proname='tg_event_venue_geography');
begin
  -- P1: the guard is in the deployed function body, and the trigger is still attached
  --     to the columns it was. A guard in a function nothing fires is not a guard.
  if position('venue_too_far_from_event_coordinates' in v_src) = 0
     or position('> 250' in v_src) = 0 then
    raise exception 'P1 failed: the corroboration guard is not in the deployed function body';
  end if;
  select count(*) into v_bad from pg_trigger
   where tgrelid='public.events'::regclass and tgname='zzz_event_venue_geography';
  if v_bad <> 1 then
    raise exception 'P1 failed: zzz_event_venue_geography is not attached (found %)', v_bad;
  end if;

  -- P2: the guard FAILS OPEN rather than refusing whenever coordinates are absent.
  --     Written as a source check because the branch is unreachable from SQL here.
  if position('new.latitude is not null and new.longitude is not null' in v_src) = 0
     or position('v_city_lat is not null and v_city_lon is not null' in v_src) = 0 then
    raise exception 'P2 failed: the guard does not fail open on missing coordinates';
  end if;

  -- P3: the repaired row is on Fort Lauderdale, detached from the New York venue,
  --     flagged, and its own coordinates agree with its city.
  select count(*) into v_bad
    from public.events e join public.cities c on c.id = e.city_id
   where e.id = 'e277dc22-1de3-4d55-9842-f2d49d53d459'
     and (c.slug <> 'fort-lauderdale' or e.venue_id is not null or not e.needs_attention
          or haversine_m(e.latitude::numeric, e.longitude::numeric,
                         c.latitude::numeric, c.longitude::numeric) > 25000);
  if v_bad <> 0 then
    raise exception 'P3 failed: the Fort Lauderdale event is not repaired';
  end if;

  -- P3b: the source's own venue text survived, so the re-attach is still actionable.
  select count(*) into v_bad from public.events
   where id = 'e277dc22-1de3-4d55-9842-f2d49d53d459'
     and (nullif(btrim(coalesce(venue_name,'')),'') is null
          or enrichment_status->'event_venue_link'->>'candidate_venue_id' is null);
  if v_bad <> 0 then
    raise exception 'P3b failed: venue_name or the candidate venue was not preserved';
  end if;

  -- P4: THE INVARIANT 99991789886174 established. Corpus-wide, not scoped to this row,
  --     because scoping it is how a thirteenth row stays invisible.
  select count(*) into v_bad
    from public.events e join public.cities c on c.id = e.city_id
   where e.duplicate_of_id is null
     and e.latitude is not null and c.latitude is not null
     and haversine_m(e.latitude::numeric, e.longitude::numeric,
                     c.latitude::numeric, c.longitude::numeric) > 250000;
  if v_bad <> 0 then
    raise exception 'P4 failed: % event(s) still hosted by a city over 250 km away', v_bad;
  end if;

  -- P5 MIRROR: exactly ONE row moved. "The invariant is zero" is equally satisfied by
  --     a pass that detached every venue in the corpus.
  select count(*) into v_moved
    from _vg_before b join public.events e on e.id = b.id
   where e.city_id is distinct from b.city_id or e.venue_id is distinct from b.venue_id;
  if v_moved <> 1 then
    raise exception 'P5 failed: expected exactly 1 event to change, % changed', v_moved;
  end if;

  -- P6 MIRROR: the 1,669 legitimate venue-derived links must keep working. The guard
  --     REFUSES; it must not have become a blanket ban on venue-derived geography.
  select count(*) into v_bad
    from public.events e join public.venues v on v.id = e.venue_id
    join public.cities c on c.id = v.city_id
   where e.duplicate_of_id is null and e.latitude is not null and c.latitude is not null
     and haversine_m(e.latitude::numeric, e.longitude::numeric,
                     c.latitude::numeric, c.longitude::numeric) <= 250000
     and e.city_id is distinct from v.city_id;
  if v_bad <> 0 then
    raise exception 'P6 failed: % venue-backed event(s) within 250 km are no longer on their venue''s city', v_bad;
  end if;

  -- P7 MIRROR: 99991789886174's twelve are still repaired. This migration rewrites a
  --     trigger that fires on UPDATE OF city_id, so a regression here is the exact
  --     shape that would silently undo the previous pass.
  select count(*) into v_bad from public.events e
   where e.enrichment_status->'event_city_link'->>'by' = 'migration:99991789886174'
     and e.enrichment_status->'event_city_link'->>'blocked' = 'true'
     and e.city_id is not null;
  if v_bad <> 0 then
    raise exception 'P7 failed: % previously-blocked event(s) have been re-linked', v_bad;
  end if;

  raise notice 'event venue geography sealed: guard live, 1 row repaired, invariant 0, 1669 legitimate links intact';
end
$verify$;

commit;
