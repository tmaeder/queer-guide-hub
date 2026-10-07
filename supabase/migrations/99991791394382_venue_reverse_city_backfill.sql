-- Fill venues.city_id from the venue's own coordinates (reverse geocode).
--
-- MEASURED 2026-10-07: 42,446 live venues carry coordinates and no city_id —
-- 1,343 detached by 99991791358024 because their city was a far namesake,
-- 34,921 cruising spots from the 2026-10-05 import, the rest older rows. A
-- venue without a city is invisible to the dedup sweep (which blocks on city),
-- to city pages and to the state/postal derivation.
--
-- backfill-venue-cities has had a `reverse` mode all along, and nothing ever
-- scheduled it. It was also unfit to run unattended:
--   1. Its work list was `city_id is null order by id limit N` with no record
--      of a visit, so a venue Nominatim could not place was re-asked on every
--      run, at the head of the list, forever — the visit-once/never-done
--      treadmill this repo has fixed twice already (event_geo_fill, venue
--      category reclassify).
--   2. Nothing checked the resolved city against the coordinates that asked
--      for it — the exact defect 99991791356737 sealed in the commit path.
--
-- This file adds the two halves that live in SQL; the edge function calls them.
--
--   venues_due_for_reverse_city(limit)  — the work list. A venue is offered
--     until it carries enrichment_status.reverse_city, which is written ONLY on
--     a definitive outcome (a link, or a geocoder answer that names no
--     linkable city). A transport error writes nothing, so absence of evidence
--     is never recorded as evidence of absence. Order: the rows step 2
--     detached first, then everything except cruising, then cruising.
--
--   venue_apply_reverse_city(...)  — the single write. Links the city only if
--     it is live, within 100 km of the venue, and in the venue's own country
--     when the venue has one; otherwise it records why it refused. One UPDATE,
--     so the stamp and the link land together and the search trigger fires once.
--
-- Cron `venue_geocode_reverse` every 5 minutes at minute 4 (clear of the
-- forward cron at 12/27/42/57, which shares public Nominatim's 1 req/s), batch
-- 40 inside a 45 s budget: ~480 venues/hour, the backlog in ~4 days.
--
-- The cron posts mode 'reverse_city', a name the PREVIOUS function build does
-- not know: if the first tick fires between `db push` and the function deploy,
-- the old build answers 400 instead of running its unguarded reverse loop.

create or replace function public.venues_due_for_reverse_city(p_limit int default 40)
returns table (id uuid, latitude numeric, longitude numeric, city text, country text, country_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select v.id, v.latitude, v.longitude, v.city, v.country, v.country_id
    from public.venues v
   where v.city_id is null
     and v.duplicate_of_id is null
     and v.closed_at is null
     and coalesce(v.review_status, '') <> 'archived'
     and v.latitude is not null and v.longitude is not null
     and not (coalesce(v.enrichment_status, '{}'::jsonb) ? 'reverse_city')
   order by (coalesce(v.enrichment_status, '{}'::jsonb) ? 'city_namesake_repair') desc,
            (v.category = 'cruising') asc nulls first,
            v.id
   limit least(greatest(coalesce(p_limit, 40), 1), 200);
$$;

revoke all on function public.venues_due_for_reverse_city(int) from public, anon, authenticated;
grant execute on function public.venues_due_for_reverse_city(int) to service_role;

create or replace function public.venue_apply_reverse_city(
  p_venue_id     uuid,
  p_city_name    text,
  p_city_id      uuid,
  p_country_code text
) returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v        public.venues%rowtype;
  c        public.cities%rowtype;
  v_ccode  uuid;
  v_city   uuid;
  v_status text;
begin
  select * into v from public.venues where id = p_venue_id;
  if v.id is null then return 'missing'; end if;
  if v.city_id is not null then return 'already_linked'; end if;

  if p_country_code is not null then
    select co.id into v_ccode from public.countries co
     where co.code = upper(p_country_code) and co.duplicate_of_id is null
     limit 1;
  end if;

  if p_city_id is null then
    v_status := case when nullif(btrim(p_city_name), '') is null then 'no_city_in_response' else 'no_city_match' end;
  else
    select * into c from public.cities where id = p_city_id;
    if c.id is null or c.duplicate_of_id is not null then
      v_status := 'rejected_city_not_live';
    elsif c.latitude is not null and c.longitude is not null
          and public.haversine_m(v.latitude, v.longitude, c.latitude, c.longitude) > 100000 then
      v_status := 'rejected_too_far';
    elsif v.country_id is not null and c.country_id is not null and c.country_id <> v.country_id then
      v_status := 'rejected_country_conflict';
    else
      v_status := 'matched';
      v_city := c.id;
    end if;
  end if;

  update public.venues u
     set city_id    = coalesce(v_city, u.city_id),
         city       = coalesce(nullif(btrim(u.city), ''), nullif(btrim(p_city_name), '')),
         country_id = coalesce(u.country_id, case when v_city is not null then c.country_id end, v_ccode),
         country    = coalesce(nullif(btrim(u.country), ''), upper(p_country_code)),
         enrichment_status = coalesce(u.enrichment_status, '{}'::jsonb)
           || jsonb_build_object('reverse_city', jsonb_build_object(
                'status', v_status, 'city', p_city_name, 'city_id', v_city,
                'proposed_city_id', p_city_id, 'country_code', upper(p_country_code),
                'by', 'backfill-venue-cities:reverse', 'at', now())),
         updated_at = now()
   where u.id = p_venue_id
     and u.city_id is null;

  return v_status;
end;
$$;

revoke all on function public.venue_apply_reverse_city(uuid, text, uuid, text) from public, anon, authenticated;
grant execute on function public.venue_apply_reverse_city(uuid, text, uuid, text) to service_role;

insert into public.admin_automations (slug, name, description, managed_by, enabled, "trigger", schedule, action)
values (
  'venue_geocode_reverse',
  'venue_geocode_reverse',
  'Reverse-geocodes venues that have coordinates but no city (lat/lng → city via Nominatim), linking only a live city within 100 km in the venue''s own country. Visit-once: each venue is stamped enrichment_status.reverse_city on a definitive outcome.',
  'system',
  true,
  jsonb_build_object('type', 'schedule'),
  '4-59/5 * * * *',
  jsonb_build_object(
    'type', 'cron',
    'jobname', 'venue_geocode_reverse',
    'command', $cmd$
  select net.http_post(
    url := 'https://xqeacpakadqfxjxjcewc.supabase.co/functions/v1/backfill-venue-cities',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-webhook-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'WEBHOOK_SECRET')
    ),
    body := jsonb_build_object('mode', 'reverse_city', 'batch_size', 40),
    timeout_milliseconds := 55000
  );
  $cmd$
  )
)
on conflict (slug) do update
  set schedule = excluded.schedule,
      action   = excluded.action,
      enabled  = true;

-- Schedule the tracked (wrapped) form the reconciler would derive, so the
-- first run already records itself.
select cron.schedule(
  'venue_geocode_reverse',
  '4-59/5 * * * *',
  public.admin_automation_effective_command(
    'venue_geocode_reverse',
    (select action ->> 'command' from public.admin_automations where slug = 'venue_geocode_reverse')))
where not exists (select 1 from cron.job where jobname = 'venue_geocode_reverse');

do $verify$
declare
  v_bad int;
  v_cmd text;
begin
  -- P1: the work list is non-empty — an empty list would read as "done".
  select count(*) into v_bad from public.venues_due_for_reverse_city(5);
  if v_bad = 0 then
    raise exception 'P1 failed: venues_due_for_reverse_city returned nothing';
  end if;

  -- P2: the cron exists, is active, and is the tracked form.
  select command into v_cmd from cron.job where jobname = 'venue_geocode_reverse' and active;
  if v_cmd is null then
    raise exception 'P2 failed: venue_geocode_reverse cron missing or inactive';
  end if;
  if position('admin_automation_run_begin' in v_cmd) = 0 or position('net.http_post' in v_cmd) > 0 then
    raise exception 'P2 failed: venue_geocode_reverse cron is not the tracked command';
  end if;

  -- P3: neither function is reachable by anon or authenticated.
  if has_function_privilege('anon', 'public.venue_apply_reverse_city(uuid,text,uuid,text)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.venue_apply_reverse_city(uuid,text,uuid,text)', 'EXECUTE')
     or has_function_privilege('anon', 'public.venues_due_for_reverse_city(int)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.venues_due_for_reverse_city(int)', 'EXECUTE') then
    raise exception 'P3 failed: reverse-city functions are exposed beyond service_role';
  end if;
end
$verify$;
