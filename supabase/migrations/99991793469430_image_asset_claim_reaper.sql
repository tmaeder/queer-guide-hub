-- Release image_assets claims that were abandoned in 'processing'.
--
-- optimize-images-batch claims work through two functions that set
-- optimization_status = 'processing' before the edge function fetches the
-- image: marketplace_claim_image_assets() (stamps
-- metadata.processing_started_at) and venue_claim_image_assets_for_metadata()
-- (stamps metadata.venue_metadata_started_at). The edge function moves a row
-- on to optimized / cdn_optimized / failed when it finishes. If the
-- invocation dies first (wall-clock limit, 120 s pg_net timeout, crash), the
-- row stays 'processing' and nothing ever moves it again: the marketplace
-- claim only selects 'pending'. No writer in the repo or the database
-- releases a claim.
--
-- Measured on prod 2026-10-31: 866 rows in 'processing', 863 of them
-- untouched for more than 7 days.
--   marketplace_listing  120   claimed 2026-09-24 .. 2026-09-26
--   no link              411   claimed 2026-09-24 .. 2026-09-25
--   news_article         335   no claim timestamp (an older writer)
-- The 120 marketplace assets have not been retried for five weeks.
--
-- run_image_asset_claim_reaper() puts a claim older than p_stale_after
-- (default 1 hour) back to 'pending'. A batch claims at most 50 rows and each
-- fetch times out after 8 s, and the HTTP call that drives it times out at
-- 120 s, so a claim older than an hour cannot belong to a live invocation.
-- Claim age is the newest of the two claim stamps, falling back to
-- updated_at for rows that carry neither.
--
-- It cannot loop: each release increments metadata.claim_reap_count, and the
-- third release marks the row 'failed' with last_failure_reason =
-- 'claim_abandoned' and terminal = true, the same failure shape
-- optimize-images-batch writes, instead of returning it to the queue.
--
-- Batched (default 200, max 500) because the UPDATE fires
-- marketplace_refresh_overview_from_asset_trg and
-- trg_venue_quality_enqueue_image_asset per row. Hourly; the current
-- backlog drains in about five runs.

create or replace function public.run_image_asset_claim_reaper(
  p_stale_after interval default interval '1 hour',
  p_batch integer default 200
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_released integer := 0;
  v_abandoned integer := 0;
begin
  if p_stale_after is null or p_stale_after < interval '15 minutes' then
    raise exception 'p_stale_after must be at least 15 minutes, got %', p_stale_after
      using errcode = '22023';
  end if;

  with stale as (
    select ia.id,
           coalesce((ia.metadata ->> 'claim_reap_count')::integer, 0) as reaps,
           coalesce(
             greatest(
               (ia.metadata ->> 'processing_started_at')::timestamptz,
               (ia.metadata ->> 'venue_metadata_started_at')::timestamptz
             ),
             ia.updated_at
           ) as claimed_at
    from public.image_assets ia
    where ia.optimization_status = 'processing'
      and coalesce(
            greatest(
              (ia.metadata ->> 'processing_started_at')::timestamptz,
              (ia.metadata ->> 'venue_metadata_started_at')::timestamptz
            ),
            ia.updated_at
          ) < now() - p_stale_after
    order by ia.updated_at, ia.id
    limit greatest(1, least(coalesce(p_batch, 200), 500))
    for update of ia skip locked
  ),
  released as (
    update public.image_assets ia
    set optimization_status = case when s.reaps + 1 >= 3 then 'failed' else 'pending' end,
        metadata = coalesce(ia.metadata, '{}'::jsonb)
          || jsonb_build_object(
               'claim_reap_count', s.reaps + 1,
               'claim_reaped_at', now(),
               'claim_reaped_claimed_at', s.claimed_at
             )
          || case when s.reaps + 1 >= 3 then jsonb_build_object(
               'last_failure_reason', 'claim_abandoned',
               'failure_class', 'claim',
               'terminal', true,
               'last_failed_at', now()
             ) else '{}'::jsonb end
    from stale s
    where ia.id = s.id
    returning ia.optimization_status
  )
  select count(*) filter (where optimization_status = 'pending'),
         count(*) filter (where optimization_status = 'failed')
    into v_released, v_abandoned
  from released;

  return jsonb_build_object(
    'released', v_released,
    'abandoned', v_abandoned,
    'stale_after', p_stale_after::text
  );
end;
$function$;

revoke all on function public.run_image_asset_claim_reaper(interval, integer) from public, anon, authenticated;
grant execute on function public.run_image_asset_claim_reaper(interval, integer) to service_role;

insert into public.admin_automations (slug, name, description, managed_by, enabled, "trigger", schedule, action)
values (
  'image_asset_claim_reaper',
  'image_asset_claim_reaper',
  'Returns image_assets rows stuck in optimization_status=processing for over an hour (an optimize-images-batch invocation died after claiming them) to pending. The third release of the same row marks it failed (claim_abandoned) instead.',
  'system',
  true,
  jsonb_build_object('type', 'schedule'),
  '23 * * * *',
  jsonb_build_object(
    'type', 'cron',
    'jobname', 'image_asset_claim_reaper',
    'command', 'select public.run_image_asset_claim_reaper();'
  )
)
on conflict (slug) do nothing;

select cron.schedule(
  'image_asset_claim_reaper',
  '23 * * * *',
  public.admin_automation_effective_command(
    'image_asset_claim_reaper',
    (select action ->> 'command' from public.admin_automations where slug = 'image_asset_claim_reaper')))
where not exists (select 1 from cron.job where jobname = 'image_asset_claim_reaper');

do $verify$
begin
  -- P1: scheduled and registered.
  if not exists (select 1 from cron.job where jobname = 'image_asset_claim_reaper' and active) then
    raise exception 'P1 failed: cron job image_asset_claim_reaper is not scheduled';
  end if;
  if not exists (select 1 from public.admin_automations where slug = 'image_asset_claim_reaper' and enabled) then
    raise exception 'P1 failed: admin_automations row image_asset_claim_reaper missing or disabled';
  end if;

  -- P2: not reachable by anon or authenticated.
  if has_function_privilege('anon', 'public.run_image_asset_claim_reaper(interval, integer)', 'execute')
     or has_function_privilege('authenticated', 'public.run_image_asset_claim_reaper(interval, integer)', 'execute') then
    raise exception 'P2 failed: run_image_asset_claim_reaper is executable by anon or authenticated';
  end if;

  -- P3: the guard rejects a stale window short enough to steal live claims.
  begin
    perform public.run_image_asset_claim_reaper(interval '1 minute');
    raise exception 'P3 failed: a 1 minute stale window was accepted';
  exception when sqlstate '22023' then
    null;
  end;
end;
$verify$;
