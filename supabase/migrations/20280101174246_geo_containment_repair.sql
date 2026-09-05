-- run_geo_containment_repair — act on the containment verdicts, per row.
--
-- The whole point of three signals is that the repair differs by WHICH signal
-- is the outlier. A single rule cannot do this: `venue_coord_guard` assumes the
-- city link is right and nulls the coordinate past 25 km, which is correct for
-- the Chicago->Johannesburg shape and DESTROYS THE ONLY CORRECT FIELD in the
-- Georgetown shape, where the coordinate is right and the link is wrong.
--
--   coord_wrong   -> NULL the coordinate, needs_attention, and clear
--                    geocode_attempted so the forward geocoder re-picks it up.
--                    A null is honest; a centroid is a plausible-looking lie
--                    that renders as a precise pin and is indistinguishable
--                    from a real coordinate downstream.
--   link_wrong    -> KEEP the coordinate. Re-resolve the city WITHIN the
--                    country the coordinate is actually in. Exactly one
--                    candidate -> relink. Zero or several -> NULL city_id and
--                    queue. Never "nearest city": a null city_id is
--                    recoverable, a wrong one is not.
--   admin1_wrong  -> NULL city_id and queue. Deliberately does NOT pick the
--                    twin: `cities` holds at most one row per (name, country)
--                    -- measured, zero within-country duplicates -- so the
--                    correct Portland usually does not exist to link to, and
--                    inventing one here would be a second defect.
--   offshore,
--   unresolved    -> quarantine only. Write nothing to the entity.
--
-- DRY RUN BY DEFAULT. p_apply defaults false, matching processForwardRepair's
-- convention: a function that rewrites coordinates must not do so because a
-- caller forgot a flag.
--
-- SAFETY INTERLOCK. country_id feeds location_is_high_risk() and therefore
-- whether a venue is publicly visible in a criminalising country. Every write
-- below goes through the entity table so trg_*_geo_derive fires and recomputes
-- safety_gated in the same statement -- the column is never written directly.
-- The run counts how many rows changed gating and returns it, because a venue
-- silently un-gated by a geo repair is an outing risk, not a data-quality nit.
--
-- Batch-capped at 300: entity UPDATEs enqueue into search_reindex_queue.

create or replace function public.run_geo_containment_repair(
  p_entity_type text default 'venue',   -- venues only; see the guard below
  p_batch int default 100,
  p_apply boolean default false
) returns jsonb
language plpgsql
volatile
set search_path = public, extensions
as $$
declare
  v_batch int := least(greatest(coalesce(p_batch, 100), 1), 300);
  v_gated_before bigint;
  v_gated_after  bigint;
  v_counts jsonb;
  v_boundary_rows bigint;
begin
  -- VENUES ONLY, and the signature says so rather than pretending otherwise.
  -- The repair paths are not portable across entity types: the coord_wrong arm
  -- audits into venue_coord_fixes (a venues-specific table) and clears
  -- venues.geocode_attempted so the forward geocoder re-picks the row up.
  -- Neither exists for events, hotels or organizations.
  --
  -- Scope is also proportionate to the measured defect: 1,104 venues sit >100km
  -- from their linked city against 26 events, and events already have their own
  -- guarded linker (run_event_city_link with the same-name and region
  -- contradiction guards). geo_containment_check REPORTS all four types; only
  -- venues are auto-repaired here.
  if p_entity_type <> 'venue' then
    raise exception 'run_geo_containment_repair handles venues only (got %). Events, hotels and organizations are reported by geo_containment_check but have no auto-repair path — their coord_wrong arm would need a per-type audit table.', p_entity_type;
  end if;

  -- Same positive control as the checker: with no polygons every verdict is
  -- offshore, and a repair pass over that would look like a quiet no-op.
  select count(*) into v_boundary_rows
  from public.geo_boundaries where boundary_kind='country' and iso_a2 is not null;
  if v_boundary_rows = 0 then
    raise exception 'geo_boundaries is empty — refusing to repair against a boundary set that classifies everything offshore';
  end if;

  select count(*) into v_gated_before from public.venues where safety_gated;

  create temp table _repair_batch on commit drop as
  select gv.content_id as id,
         split_part(gv.mismatch_details, ':', 1) as verdict,
         gv.country as coord_iso,
         v.latitude, v.longitude, v.city_id
  from public.geo_validations gv
  join public.venues v on v.id = gv.content_id
  where gv.content_type = p_entity_type
    and gv.source = 'geo_containment'
    and gv.has_mismatch
    and p_entity_type = 'venue'
    and split_part(gv.mismatch_details, ':', 1) in ('coord_wrong','link_wrong','admin1_wrong')
  order by gv.content_id
  limit v_batch;

  if p_apply then
    -- coord_wrong: the coordinate is the outlier. Null it, audit it, and make
    -- the row eligible for the forward geocoder again.
    insert into public.venue_coord_fixes
      (venue_id, mode, old_lat, old_lng, new_lat, new_lng, city_id, km_before, source)
    select b.id, 'null_unknown', b.latitude, b.longitude, null, null, b.city_id, 0, 'containment'
    from _repair_batch b where b.verdict = 'coord_wrong';

    update public.venues v
       set latitude = null,
           longitude = null,
           needs_attention = true,
           geocode_attempted = false,
           enrichment_status = coalesce(v.enrichment_status,'{}'::jsonb)
             || jsonb_build_object('geo_containment', jsonb_build_object(
                  'verdict','coord_wrong','acted_at', now()))
      from _repair_batch b
     where v.id = b.id and b.verdict = 'coord_wrong';

    -- link_wrong: the COORDINATE is corroborated; the link is wrong. Re-resolve
    -- inside the country the point is actually in, and only when the answer is
    -- unambiguous.
    update public.venues v
       set city_id = cand.city_id,
           enrichment_status = coalesce(v.enrichment_status,'{}'::jsonb)
             || jsonb_build_object('geo_containment', jsonb_build_object(
                  'verdict','link_wrong','relinked_to', cand.city_id, 'acted_at', now()))
      from _repair_batch b
      join lateral (
        select c.id as city_id
        from public.cities c
        join public.countries co on co.id = c.country_id
        where c.duplicate_of_id is null
          and public.geo_countries_equivalent(co.code, b.coord_iso)
          and lower(btrim(c.name)) = lower(btrim((select v2.city from public.venues v2 where v2.id = b.id)))
        limit 2
      ) cand on true
     where v.id = b.id
       and b.verdict = 'link_wrong'
       -- exactly one candidate, or we do not guess
       and 1 = (select count(*) from public.cities c2
                join public.countries co2 on co2.id = c2.country_id
                where c2.duplicate_of_id is null
                  and public.geo_countries_equivalent(co2.code, b.coord_iso)
                  and lower(btrim(c2.name)) = lower(btrim(v.city)));

    -- Ambiguous link_wrong, and every admin1_wrong: unlink and queue. A null
    -- city_id is recoverable; a wrong one is not.
    update public.venues v
       set city_id = null,
           needs_attention = true,
           enrichment_status = coalesce(v.enrichment_status,'{}'::jsonb)
             || jsonb_build_object('geo_containment', jsonb_build_object(
                  'verdict', b.verdict, 'unlinked', true, 'acted_at', now()))
      from _repair_batch b
     where v.id = b.id
       and (b.verdict = 'admin1_wrong'
            or (b.verdict = 'link_wrong'
                and 1 <> (select count(*) from public.cities c2
                          join public.countries co2 on co2.id = c2.country_id
                          where c2.duplicate_of_id is null
                            and public.geo_countries_equivalent(co2.code, b.coord_iso)
                            and lower(btrim(c2.name)) = lower(btrim(v.city)))));

    insert into public.entity_review_queue (entity_type, entity_id, field, proposed_value, confidence, model, status)
    select 'venue', b.id, 'geo_containment',
           jsonb_build_object('verdict', b.verdict, 'coordinate_country', b.coord_iso),
           0.4, 'geo_containment', 'open'
    from _repair_batch b
    where b.verdict in ('admin1_wrong','link_wrong')
    on conflict do nothing;
  end if;

  select count(*) into v_gated_after from public.venues where safety_gated;

  select jsonb_object_agg(verdict, n) into v_counts
  from (select verdict, count(*) as n from _repair_batch group by 1) t;

  return jsonb_build_object(
    'applied', p_apply,
    'entity_type', p_entity_type,
    'examined', (select count(*) from _repair_batch),
    'by_verdict', coalesce(v_counts, '{}'::jsonb),
    -- Reported on every run, dry or not. safety_gated is recomputed by
    -- trg_venues_geo_derive rather than written here, so this is the only way
    -- to see whether a geo repair changed who can see a venue.
    'safety_gated_before', v_gated_before,
    'safety_gated_after', v_gated_after,
    'safety_gated_delta', v_gated_after - v_gated_before
  );
end $$;

comment on function public.run_geo_containment_repair(text, int, boolean) is
  'Acts on geo_containment verdicts per row: coord_wrong nulls the coordinate and requeues it, link_wrong KEEPS the coordinate and re-resolves the city inside the country the point is actually in (only when unambiguous), admin1_wrong unlinks and queues. Dry run unless p_apply. Reports safety_gated delta because country_id drives who can see a venue in a criminalising country.';

revoke all on function public.run_geo_containment_repair(text, int, boolean) from public;
grant execute on function public.run_geo_containment_repair(text, int, boolean) to service_role;
