-- api_private.gated_count_for_location(): give the city and country cases
-- their own queries, so each can use its index.
--
-- This backs the anon "Sign in to view N places" notice (GatedContentNotice)
-- on city, country, trip-discover, going-out and people pages. It counted four
-- tables with `(p_country_id IS NULL OR country_id = p_country_id) AND
-- (p_city_id IS NULL OR city_id = p_city_id)`. In a SECURITY DEFINER SQL
-- function that is planned once for any argument, so no city or country index
-- applied and every call walked the gated rows of all four tables: 258 ms warm
-- and 47,720 buffers for Berlin on 2026-10-31. Under load it hit the anon
-- role's 3s statement_timeout 182 times in 24h, and a failed call hides the
-- notice entirely.
--
-- The gated sets are large on purpose: ~57k cruising venues (the 2026-10-05
-- gays-cruising import) are gated everywhere, plus the organizations that
-- represent them. So the fix is to reach a location's rows through
-- city_id / country_id first, not to make the gated scan cheaper.
--
-- PL/pgSQL with one static branch per argument shape: each branch is planned
-- with its own indexes. Results are identical to the old body by construction
-- (same predicates, only split by which arguments are null), and checked on
-- prod against it for every city and country that has a gated row.
-- Signature, SECURITY DEFINER, search_path and the public wrapper are
-- unchanged, so existing grants carry over.

create or replace function api_private.gated_count_for_location(
  p_country_id uuid default null,
  p_city_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_venues bigint;
  v_events bigint;
  v_orgs bigint;
  v_villages bigint;
begin
  if p_city_id is not null then
    select count(*) into v_venues from public.venues v
     where v.city_id = p_city_id and v.safety_gated and v.duplicate_of_id is null and v.closed_at is null
       and (p_country_id is null or v.country_id = p_country_id);
    select count(*) into v_events from public.events e
     where e.city_id = p_city_id and e.safety_gated
       and (p_country_id is null or e.country_id = p_country_id);
    select count(*) into v_orgs from public.organizations o
     where o.city_id = p_city_id and o.safety_gated and o.status = 'active'
       and (p_country_id is null or o.country_id = p_country_id);
    select count(*) into v_villages from public.queer_villages qv
     where qv.city_id = p_city_id and qv.safety_gated and qv.duplicate_of_id is null
       and (p_country_id is null or qv.country_id = p_country_id);
  elsif p_country_id is not null then
    select count(*) into v_venues from public.venues v
     where v.country_id = p_country_id and v.safety_gated and v.duplicate_of_id is null and v.closed_at is null;
    select count(*) into v_events from public.events e
     where e.country_id = p_country_id and e.safety_gated;
    select count(*) into v_orgs from public.organizations o
     where o.country_id = p_country_id and o.safety_gated and o.status = 'active';
    select count(*) into v_villages from public.queer_villages qv
     where qv.country_id = p_country_id and qv.safety_gated and qv.duplicate_of_id is null;
  else
    select count(*) into v_venues from public.venues v
     where v.safety_gated and v.duplicate_of_id is null and v.closed_at is null;
    select count(*) into v_events from public.events e where e.safety_gated;
    select count(*) into v_orgs from public.organizations o where o.safety_gated and o.status = 'active';
    select count(*) into v_villages from public.queer_villages qv
     where qv.safety_gated and qv.duplicate_of_id is null;
  end if;

  return jsonb_build_object(
    'venues', v_venues,
    'events', v_events,
    'organizations', v_orgs,
    'queer_villages', v_villages,
    -- Whether the LOCATION is criminalising / death-penalty, which is a
    -- different question from whether anything here is gated. The notice needs
    -- both: the counts say how much is hidden, this says why.
    'high_risk', public.location_is_high_risk(p_country_id, p_city_id)
  );
end;
$function$;
