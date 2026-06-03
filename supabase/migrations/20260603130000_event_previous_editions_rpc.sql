-- event_previous_editions — powers "Eventreihen" carry-over on /submit. Given a typed
-- event title (and optional city), returns the most recent PAST editions of the same
-- series so a contributor can clone the details into a new edition instead of retyping.
--
-- Matching: seed on existing events whose title is trigram-similar to the input; pull
-- their festival siblings (events.festival_id) AND any title+city matches (covers series
-- that were never linked to a festival). Returns only past events (start_date < now()),
-- most recent first, with the cloneable fields.

create or replace function public.event_previous_editions(
  p_title text,
  p_city  text default null,
  p_limit int  default 3
) returns jsonb
language sql stable security definer set search_path = public, extensions, pg_temp as $$
  with norm as (
    select lower(regexp_replace(trim(coalesce(p_title, '')), '\s+', ' ', 'g')) as t,
           lower(trim(coalesce(p_city, ''))) as c
  ),
  seed_fests as (
    select distinct e.festival_id
    from public.events e, norm n
    where n.t <> '' and e.festival_id is not null
      and similarity(lower(e.title), n.t) > 0.45
  ),
  cand_ids as (
    select e.id from public.events e join seed_fests f on e.festival_id = f.festival_id
    union
    select e.id from public.events e, norm n
    where n.t <> '' and similarity(lower(e.title), n.t) > 0.45
      and (n.c = '' or lower(coalesce(e.city, '')) = n.c)
  ),
  picked as (
    select e.id, e.title, e.edition, e.start_date, e.festival_id, e.description,
           e.event_type, e.venue_id, e.venue_name, e.address, e.city, e.city_id,
           e.country, e.country_id, e.latitude, e.longitude, e.website, e.ticket_url,
           e.is_free, e.price_min, e.price_max
    from public.events e
    where e.id in (select id from cand_ids)
      and e.start_date < now()
      and coalesce(e.status, 'active') <> 'rejected'
      and e.duplicate_of_id is null
    order by e.start_date desc
    limit greatest(p_limit, 0)
  )
  select coalesce(jsonb_agg(to_jsonb(picked) order by picked.start_date desc), '[]'::jsonb)
  from picked;
$$;

revoke all on function public.event_previous_editions(text, text, int) from public, anon;
grant execute on function public.event_previous_editions(text, text, int) to authenticated, service_role;
