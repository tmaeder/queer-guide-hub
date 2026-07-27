-- Geo Hierarchy Unification — P3: move the safety-gating chain onto the spine.
--
-- Gated by geo_safety_parity_check(): 7,698 pairs (exhaustive — the predicate is
-- pure over (country_id, city_id)), 0 mismatches, 575 high-risk both ways.
--
-- ORDERING HAZARD FIXED HERE: AFTER triggers fire in alphabetical order, so
-- `trg_countries_recompute_safety_gated` fired BEFORE `trg_sync_geo_spine` —
-- i.e. while geo_country_profiles still held the OLD criminalization. That was
-- harmless while the predicate read `countries`, but would have silently
-- computed stale gating the moment it reads the spine. Relocating the trigger
-- onto geo_country_profiles makes it correct by construction: the profile write
-- is what fires it. It also removes a trigger from a table that becomes a VIEW
-- in P4 (views cannot carry row triggers).
--
-- Verified live (rolled back): flipping Réunion to criminalizing gated its 3
-- venues 0 -> 3, with the spine profile already showing legal=false at fan-out
-- time, proving the new firing order.

create or replace function public.location_is_high_risk(p_country_id uuid, p_city_id uuid)
returns boolean
language sql
stable
set search_path to 'public'
as $$
  with resolved as (
    select coalesce(
      p_country_id,
      (select gp.country_id from public.geo_places gp
        where gp.id = p_city_id and gp.place_type = 'city')
    ) as country_id
  )
  select exists (
    select 1
    from public.geo_country_profiles cp, resolved r
    where cp.place_id = r.country_id
      and (
        (cp.lgbti_criminalization->>'legal') = 'false'
        or lower(coalesce(cp.lgbti_criminalization->>'death_penalty','')) = 'yes'
      )
  );
$$;

comment on function public.location_is_high_risk(uuid, uuid) is
  'True when the resolved country (own country_id, else the city''s country) is criminalizing or death-penalty. Single source of truth for the safety-layer gate. Reads the geo spine (P3); parity with the pre-P3 typed-table implementation proven exhaustively by geo_safety_parity_check().';

create or replace function public.recompute_safety_gated_for_country(p_country_id uuid)
returns void
language plpgsql
set search_path to 'public'
as $$
begin
  update public.venues v
     set safety_gated = public.location_is_high_risk(v.country_id, v.city_id)
   where (v.country_id = p_country_id
          or v.city_id in (select id from public.geo_places
                            where place_type = 'city' and country_id = p_country_id))
     and v.safety_gated is distinct from public.location_is_high_risk(v.country_id, v.city_id);

  update public.events e
     set safety_gated = public.location_is_high_risk(e.country_id, e.city_id)
   where (e.country_id = p_country_id
          or e.city_id in (select id from public.geo_places
                            where place_type = 'city' and country_id = p_country_id))
     and e.safety_gated is distinct from public.location_is_high_risk(e.country_id, e.city_id);

  update public.organizations o
     set safety_gated = public.location_is_high_risk(o.country_id, o.city_id)
   where (o.country_id = p_country_id
          or o.city_id in (select id from public.geo_places
                            where place_type = 'city' and country_id = p_country_id))
     and o.safety_gated is distinct from public.location_is_high_risk(o.country_id, o.city_id);

  update public.hotels h
     set safety_gated = public.location_is_high_risk(h.country_id, h.city_id)
   where (h.country_id = p_country_id
          or h.city_id in (select id from public.geo_places
                            where place_type = 'city' and country_id = p_country_id))
     and h.safety_gated is distinct from public.location_is_high_risk(h.country_id, h.city_id);
end;
$$;

create or replace function public.trg_geo_country_risk_changed()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  perform public.recompute_safety_gated_for_country(new.place_id);
  return null;
end;
$$;

drop trigger if exists trg_geo_country_recompute_safety_gated on public.geo_country_profiles;
create trigger trg_geo_country_recompute_safety_gated
  after update on public.geo_country_profiles
  for each row
  when (old.lgbti_criminalization is distinct from new.lgbti_criminalization)
  execute function public.trg_geo_country_risk_changed();

drop trigger if exists trg_countries_recompute_safety_gated on public.countries;
