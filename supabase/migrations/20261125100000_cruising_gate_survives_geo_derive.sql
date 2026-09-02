-- Cruising gate: survive `derive_entity_geo_address()`.
--
-- THE HOLE -------------------------------------------------------------------
-- 20261110100000 gated `category='cruising'` via set_venue_safety_gated() on
-- `before insert or update of country_id, city_id, category`. Measured on prod
-- in a rolled-back probe:
--
--   new cruising row      -> gated      t   OK
--   re-categorise to bar  -> ungated    f   OK
--   re-categorise back    -> gated      t   OK  (the column-scope fix works)
--   UPDATE ... SET country='DE'  -> UNGATED  f   *** WRONG ***
--
-- `derive_entity_geo_address()` is a THIRD writer of safety_gated. It exists
-- precisely because the safety trigger is column-scoped and a BEFORE trigger's
-- writes do not re-fire it, so it recomputes the flag itself — but only
-- geographically: `new.safety_gated := location_is_high_risk(country_id, city_id)`.
-- Any UPDATE naming country / city / state therefore CLEARS the category gate.
-- The venue stays public until something happens to touch its category again.
--
-- This is the same class as the recompute_safety_gated_for_country hole that
-- 20261110100000 fixed; there were two of them and only one was found by reading.
-- The probe found this one. Full writer census (pg_proc scan) is:
--   recompute_safety_gated_for_country  fixed in 20261110100000
--   derive_entity_geo_address           this migration
--   set_venue_safety_gated              correct
--   set_entity_safety_gated             shared; venues no longer uses it
--   geo_places_derive / set_guide_safety_gated        other entities
--   set_search_document_safety_gated    mirrors the entity, does not recompute
--
-- THE FIX --------------------------------------------------------------------
-- NOT a restatement of derive_entity_geo_address(). That function is ~200 lines,
-- is shared by venues/events/hotels/organizations, and is actively edited by
-- other work — restating it to change one line is a merge-collision surface, and
-- it is exactly how the hotels/queer_villages branches nearly got dropped from
-- recompute_safety_gated_for_country.
--
-- Instead, widen the venues safety trigger to the SAME column set derive is
-- scoped on. PostgreSQL fires BEFORE ROW triggers in trigger-NAME order, and
-- `trg_venues_geo_derive` < `trg_venues_safety_gated` ('g' < 's'), so derive runs
-- first and set_venue_safety_gated() then overwrites its geographic-only answer
-- with the category-aware one. That ordering is already load-bearing elsewhere in
-- this schema (see 20260807100000, which relies on it in the other direction).
--
-- derive's scope, read from pg_trigger on prod:
--   trg_venues_geo_derive BEFORE INSERT OR UPDATE OF city_id, country_id, country, city, state

drop trigger if exists trg_venues_safety_gated on public.venues;
create trigger trg_venues_safety_gated
  before insert or update of country_id, city_id, category, country, city, state
  on public.venues
  for each row execute function public.set_venue_safety_gated();

-- ---------------------------------------------------------------------------
-- Corrective pass: anything derive un-gated between 20261110100000 and now.
-- Batched at 300 — trg_search_documents_venue is UNSCOPED and fires per row.
-- ---------------------------------------------------------------------------
do $$
declare v_batch int; v_total int := 0;
begin
  loop
    with pick as (
      select id from public.venues
       where safety_gated is distinct from
             public.venue_is_safety_gated(country_id, city_id, category)
       limit 300
    )
    update public.venues v
       set safety_gated = public.venue_is_safety_gated(v.country_id, v.city_id, v.category)
      from pick
     where v.id = pick.id;
    get diagnostics v_batch = row_count;
    exit when v_batch = 0;
    v_total := v_total + v_batch;
  end loop;
  raise notice 'safety_gated corrective pass: % venues re-synced', v_total;
end;
$$;

-- ---------------------------------------------------------------------------
-- Post-conditions
-- ---------------------------------------------------------------------------
do $$
declare v_wrong int; v_missing text[];
begin
  select count(*) into v_wrong from public.venues
   where safety_gated is distinct from
         public.venue_is_safety_gated(country_id, city_id, category);
  if v_wrong > 0 then
    raise exception 'safety_gated disagrees with the predicate on % venues', v_wrong;
  end if;

  -- The trigger must cover every column derive is scoped on, or the gate is
  -- clearable again by whichever column was missed.
  select array_agg(c) into v_missing
    from unnest(array['country_id','city_id','category','country','city','state']) c
   where not exists (
     select 1 from pg_trigger t
       join unnest(t.tgattr) a(attnum) on true
       join pg_attribute att on att.attrelid = t.tgrelid and att.attnum = a.attnum
      where t.tgrelid = 'public.venues'::regclass
        and t.tgname  = 'trg_venues_safety_gated'
        and att.attname = c);
  if v_missing is not null then
    raise exception 'trg_venues_safety_gated is not scoped to: %', array_to_string(v_missing, ', ');
  end if;
end;
$$;
