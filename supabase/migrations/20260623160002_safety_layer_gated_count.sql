-- Safety layer (3/3): anonymous-safe count of gated entities for a city/country.
--
-- Powers the "Sign in to view N places" prompt. SECURITY DEFINER so it can count
-- rows RLS hides from anon, but it returns ONLY aggregate counts — never any row
-- data — so it leaks nothing beyond "N gated items exist here".

create or replace function public.gated_count_for_location(p_country_id uuid default null, p_city_id uuid default null)
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $$
  select jsonb_build_object(
    'venues', (
      select count(*) from public.venues v
      where v.safety_gated
        and v.duplicate_of_id is null
        and v.closed_at is null
        and (p_country_id is null or v.country_id = p_country_id)
        and (p_city_id    is null or v.city_id    = p_city_id)
    ),
    'events', (
      select count(*) from public.events e
      where e.safety_gated
        and (p_country_id is null or e.country_id = p_country_id)
        and (p_city_id    is null or e.city_id    = p_city_id)
    ),
    'organizations', (
      select count(*) from public.organizations o
      where o.safety_gated
        and o.status = 'active'
        and (p_country_id is null or o.country_id = p_country_id)
        and (p_city_id    is null or o.city_id    = p_city_id)
    )
  );
$$;

comment on function public.gated_count_for_location(uuid, uuid) is
  'Aggregate-only count of safety-gated venues/events/organizations for a city or country. Safe for anon — returns no row data.';

grant execute on function public.gated_count_for_location(uuid, uuid) to anon, authenticated, service_role;

-- Anonymous-safe existence check for a single gated entity by slug. Lets a
-- detail page distinguish "members-only (gated)" from "genuinely missing" so a
-- logged-out visitor with a direct link sees a sign-in gate instead of a 404.
-- Returns only a boolean — no row data.
create or replace function public.gated_entity_exists(p_entity_type text, p_slug text)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select case p_entity_type
    when 'venue' then exists (
      select 1 from public.venues
      where slug = p_slug and safety_gated and duplicate_of_id is null and closed_at is null)
    when 'event' then exists (
      select 1 from public.events where slug = p_slug and safety_gated)
    when 'organization' then exists (
      select 1 from public.organizations where slug = p_slug and safety_gated and status = 'active')
    else false
  end;
$$;

comment on function public.gated_entity_exists(text, text) is
  'Boolean-only: does a safety-gated entity exist at this slug? Lets detail pages show a sign-in gate vs a 404 for anon. Returns no row data.';

grant execute on function public.gated_entity_exists(text, text) to anon, authenticated, service_role;
