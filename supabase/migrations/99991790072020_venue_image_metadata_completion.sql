-- Complete factual technical metadata for venue-linked managed images.
-- This deliberately does not infer copyright, attribution, alt text, or venue
-- relevance. Those remain evidence/review-gated inputs to guide readiness.

create or replace function public.venue_claim_image_assets_for_metadata(
  p_limit integer default 15
)
returns table(id uuid, url text, format text, metadata jsonb)
language sql
security definer
set search_path = public, pg_temp
as $claim$
  with due as materialized (
    select ia.id
    from public.image_assets ia
    where ia.status = 'active'
      and (ia.width is null or ia.height is null)
      and coalesce((ia.metadata->>'venue_metadata_attempts')::integer, 0) < 3
      and exists (
        select 1
        from public.image_asset_links l
        where l.asset_id = ia.id and l.entity_type = 'venue'
      )
    order by ia.created_at, ia.id
    limit greatest(1, least(coalesce(p_limit, 15), 25))
    for update skip locked
  )
  update public.image_assets ia
  set optimization_status = 'processing',
      metadata = coalesce(ia.metadata, '{}'::jsonb)
        || jsonb_build_object(
          'venue_metadata_started_at', now(),
          'venue_metadata_attempts',
            coalesce((ia.metadata->>'venue_metadata_attempts')::integer, 0) + 1
        )
  from due
  where ia.id = due.id
  returning ia.id, ia.url, ia.format, ia.metadata
$claim$;

revoke all on function public.venue_claim_image_assets_for_metadata(integer)
  from public, anon, authenticated;
grant execute on function public.venue_claim_image_assets_for_metadata(integer)
  to service_role;

insert into public.admin_automations
  (slug, name, description, managed_by, enabled, trigger, conditions, action,
   schedule, auto_pause_threshold)
values (
  'venue_image_metadata',
  'Venue image metadata completion',
  'Downloads managed venue images in bounded batches to record factual dimensions, bytes, and format. Rights, alt text, attribution, and relevance remain review-gated.',
  'system', true, '{"type":"schedule"}'::jsonb, '[]'::jsonb,
  jsonb_build_object(
    'type', 'cron',
    'jobname', 'venue-image-metadata',
    'command', $command$
      select net.http_post(
        url := 'https://xqeacpakadqfxjxjcewc.supabase.co/functions/v1/optimize-images-batch',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'X-Internal-Secret', (
            select decrypted_secret from vault.decrypted_secrets
            where name = 'internal_invoke_secret'
          )
        ),
        body := '{"batch_size":15,"entity_type":"venue"}'::jsonb,
        timeout_milliseconds := 120000
      );
    $command$
  ),
  '* * * * *',
  3
)
on conflict (slug) do update set
  name = excluded.name,
  description = excluded.description,
  enabled = true,
  action = excluded.action,
  schedule = excluded.schedule,
  auto_pause_threshold = excluded.auto_pause_threshold,
  updated_at = now();

select public.sync_automations_to_cron(true);

do $assert$
begin
  if not exists (
    select 1 from public.admin_automations
    where slug = 'venue_image_metadata' and enabled
  ) then
    raise exception 'venue image metadata automation was not enabled';
  end if;
end;
$assert$;
