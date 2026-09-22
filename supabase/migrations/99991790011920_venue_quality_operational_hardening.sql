-- Production rollout hardening for venue media, accessibility and event links.

-- "unknown" is not a usable licence and must never satisfy guide-ready media.
do $license$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.image_assets'::regclass
      and conname = 'image_assets_usable_license_check'
  ) then
    alter table public.image_assets
      add constraint image_assets_usable_license_check
      check (license is null or lower(btrim(license)) not in ('unknown', 'unverified', 'none', 'n/a'))
      not valid;
  end if;
end;
$license$;

create or replace function public.venue_image_assets_due_phash(p_limit integer default 20)
returns table(id uuid, url text, optimized_url text)
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $images$
  select ia.id, ia.url, ia.optimized_url
  from public.image_assets ia
  where ia.status = 'active' and ia.phash is null and ia.phash_checked_at is null
    and exists (
      select 1 from public.image_asset_links l
      where l.asset_id = ia.id and l.entity_type = 'venue'
    )
  order by ia.created_at, ia.id
  limit greatest(1, least(coalesce(p_limit, 20), 20))
$images$;

revoke all on function public.venue_image_assets_due_phash(integer) from public, anon, authenticated;
grant execute on function public.venue_image_assets_due_phash(integer) to service_role;

insert into public.admin_automations
  (slug, name, description, managed_by, enabled, trigger, conditions, action, schedule)
values (
  'image_phash_backfill',
  'Perceptual hash backfill',
  'Venue-linked managed assets first, then the global image queue. Every attempt is stamped so dead images cannot stall progress.',
  'system', true, '{"type":"schedule"}'::jsonb, '[]'::jsonb,
  jsonb_build_object(
    'type', 'cron',
    'jobname', 'image_phash_backfill',
    'command', $command$
      select net.http_post(
        url := 'https://xqeacpakadqfxjxjcewc.supabase.co/functions/v1/image-phash-backfill',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhxZWFjcGFrYWRxZnhqeGpjZXdjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI0Mzk1MDQsImV4cCI6MjA2ODAxNTUwNH0.o38QZPRBDyi52MWrMHT2qMvByx1z_u_Ox_r5rmRBxK8',
          'x-internal-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'internal_invoke_secret')
        ),
        body := '{"limit":20}'::jsonb,
        timeout_milliseconds := 55000
      );
    $command$
  ),
  '* * * * *'
)
on conflict (slug) do update set
  description = excluded.description,
  enabled = true,
  action = excluded.action,
  schedule = excluded.schedule,
  updated_at = now();

do $phash$
declare v_command text;
begin
  select action->>'command' into v_command
  from public.admin_automations where slug = 'image_phash_backfill';
  if exists (select 1 from cron.job where jobname = 'image_phash_backfill') then
    perform cron.unschedule('image_phash_backfill');
  end if;
  perform cron.schedule('image_phash_backfill', '* * * * *', v_command);
end;
$phash$;

-- The deployed OSM worker now persists matched element identity, uses bounded
-- 120-second runs, and distinguishes upstream saturation from job failure.
-- Re-enable it at the same request rate as the retired 25/20-minute schedule,
-- but with smaller calls that stay comfortably inside the gateway timeout.
update public.admin_automations
set enabled = true,
    schedule = '*/10 * * * *',
    action = jsonb_build_object(
      'type', 'cron',
      'jobname', 'venue_accessibility_osm',
      'command', $command$
        select net.http_post(
          url := 'https://xqeacpakadqfxjxjcewc.supabase.co/functions/v1/venue-accessibility-osm',
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'X-Webhook-Secret', (select decrypted_secret from vault.decrypted_secrets where name = 'amenity_quality_webhook_secret')
          ),
          body := '{"batch_limit":10}'::jsonb,
          timeout_milliseconds := 140000
        );
      $command$
    ),
    description = 'Repaired bounded OSM enrichment. Persists matched OSM identity and fills structured accessibility, hours, phone, website and category without overwriting existing facts.',
    updated_at = now()
where slug = 'venue_accessibility_osm';

do $osm$
declare v_command text;
begin
  select action->>'command' into v_command
  from public.admin_automations where slug = 'venue_accessibility_osm';
  if v_command is null then
    raise exception 'venue_accessibility_osm registry row or command is missing';
  end if;
  if exists (select 1 from cron.job where jobname = 'venue_accessibility_osm') then
    perform cron.unschedule('venue_accessibility_osm');
  end if;
  perform cron.schedule('venue_accessibility_osm', '*/10 * * * *', v_command);
end;
$osm$;

-- Every upcoming public event carrying a venue name must be either linked or
-- explicitly reviewable. The precision linker already queues collisions; this
-- captures the no-candidate remainder without inventing a match.
insert into public.review_queue (entity_type, entity_id, review_type, status, details)
select 'event', e.id, 'venue_link_candidate', 'pending',
  jsonb_build_object(
    'event_venue_name', e.venue_name,
    'candidates', '[]'::jsonb,
    'source', 'venue_quality_v2',
    'resolution', 'no_precision_match',
    'ambiguous', true
  )
from public.events e
where e.is_public and e.duplicate_of_id is null
  and e.start_date >= now()
  and e.venue_id is null
  and nullif(btrim(e.venue_name), '') is not null
  and not exists (
    select 1 from public.review_queue q
    where q.entity_type = 'event' and q.entity_id = e.id
      and q.review_type = 'venue_link_candidate' and q.status = 'pending'
  );
