-- guide.queer.* records (Phase 6a of the AT Protocol plan).
--
-- A user who connected Bluesky AND turned on publish_activity gets their
-- check-ins, ratings, RSVPs and saves written as guide.queer.* records into
-- their OWN Bluesky repo (from the browser, with their OAuth session). This
-- file holds the opt-in flag and the one gate that decides what may be written.
--
-- bluesky_activity_subject(type, id) returns the public URL + title of an
-- entity, or NULL when writing it would expose something it should not:
--   - safety-gated, deindexed or merged entities
--   - venues of a sexual type (cruising, sauna): a public check-in there outs
--   - cities and countries where being LGBTQ+ is criminalised
-- A record in an atproto repo is public and cannot be recalled from relays, so
-- the gate errs on refusing.

alter table public.bluesky_identities
  add column if not exists publish_activity boolean not null default false;

create or replace function public.bluesky_activity_subject(p_entity_type text, p_entity_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case p_entity_type
    when 'venue' then (
      select jsonb_build_object('uri', 'https://queer.guide/venues/' || v.slug, 'title', v.name)
      from public.venues v
      where v.id = p_entity_id and v.slug is not null
        and not v.safety_gated and v.seo_indexable and v.duplicate_of_id is null
        and coalesce(v.category, '') not in ('cruising', 'sauna'))
    when 'event' then (
      select jsonb_build_object('uri', 'https://queer.guide/events/' || e.slug, 'title', e.title)
      from public.events e
      where e.id = p_entity_id and e.slug is not null
        and not e.safety_gated and e.seo_indexable and e.duplicate_of_id is null)
    when 'city' then (
      select jsonb_build_object('uri', 'https://queer.guide/city/' || c.slug, 'title', c.name)
      from public.cities c
      where c.id = p_entity_id and c.slug is not null
        and c.seo_indexable and c.duplicate_of_id is null
        and not public.location_is_high_risk(c.country_id, c.id))
    when 'country' then (
      select jsonb_build_object('uri', 'https://queer.guide/country/' || co.slug, 'title', co.name)
      from public.countries co
      where co.id = p_entity_id and co.slug is not null
        and co.seo_indexable and co.duplicate_of_id is null
        and not public.location_is_high_risk(co.id, null))
    else null
  end;
$$;

revoke all on function public.bluesky_activity_subject(text, uuid) from public, anon;
grant execute on function public.bluesky_activity_subject(text, uuid) to authenticated, service_role;

do $verify$
declare
  v_gated uuid;
  v_cruising uuid;
  v_ok uuid;
begin
  if has_function_privilege('anon', 'public.bluesky_activity_subject(text,uuid)', 'EXECUTE') then
    raise exception 'bluesky activity: subject gate exposed to anon';
  end if;
  select id into v_gated from public.venues where safety_gated limit 1;
  select id into v_cruising from public.venues where category = 'cruising' and not safety_gated limit 1;
  select id into v_ok from public.venues
   where not safety_gated and seo_indexable and duplicate_of_id is null and slug is not null
     and coalesce(category, '') not in ('cruising', 'sauna') limit 1;
  if v_gated is not null and public.bluesky_activity_subject('venue', v_gated) is not null then
    raise exception 'bluesky activity: a safety-gated venue was publishable';
  end if;
  if v_cruising is not null and public.bluesky_activity_subject('venue', v_cruising) is not null then
    raise exception 'bluesky activity: a cruising venue was publishable';
  end if;
  -- Positive control: the gate is not simply refusing everything.
  if v_ok is null or public.bluesky_activity_subject('venue', v_ok) is null then
    raise exception 'bluesky activity: an ordinary public venue was refused';
  end if;
end
$verify$;
