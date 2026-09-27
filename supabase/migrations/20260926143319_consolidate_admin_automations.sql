-- RECOVERED FROM PROD BY scripts/recover-migration-drift.mjs.
--
-- Applied to prod as version 20260926143319 with no repo file — the signature of
-- MCP `apply_migration`, which stamps a version and commits nothing. An applied
-- version with no file fails migration-versions on every PR in the repo and
-- makes `db push` refuse to run.
--
-- Reconstructed from `schema_migrations.statements`, which holds the PARSED
-- statements: trailing semicolons are stripped (re-added here) and any original
-- comment header is NOT recorded, so the reasoning that accompanied this
-- migration is lost. Verified by md5 against a server-computed digest.
--
-- Never re-run: `db push` matches on version and skips an applied one. The file
-- exists so history is complete and a rebuild from zero works.
-- Consolidate scheduler ownership and repair registry/cron drift discovered in
-- the 2026-09-26 production audit. Disabled rows remain as audit history.

create or replace function public.run_milestone_quality_maintenance()
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_result jsonb := '{}'::jsonb;
begin
  begin
    v_result := v_result || jsonb_build_object('geography',
      jsonb_build_object('ok', true, 'result', public.run_milestone_geography_resolution(500)));
  exception when others then
    v_result := v_result || jsonb_build_object('geography',
      jsonb_build_object('ok', false, 'error', sqlerrm));
  end;
  begin
    v_result := v_result || jsonb_build_object('categories',
      jsonb_build_object('ok', true, 'result', public.run_milestone_category_proposals(500, false)));
  exception when others then
    v_result := v_result || jsonb_build_object('categories',
      jsonb_build_object('ok', false, 'error', sqlerrm));
  end;
  begin
    v_result := v_result || jsonb_build_object('editorial',
      jsonb_build_object('ok', true, 'result', public.run_milestone_editorial_review(500, false)));
  exception when others then
    v_result := v_result || jsonb_build_object('editorial',
      jsonb_build_object('ok', false, 'error', sqlerrm));
  end;
  begin
    v_result := v_result || jsonb_build_object('topics',
      jsonb_build_object('ok', true, 'result', public.backfill_milestone_topic_tags(500, false, null)));
  exception when others then
    v_result := v_result || jsonb_build_object('topics',
      jsonb_build_object('ok', false, 'error', sqlerrm));
  end;
  begin
    v_result := v_result || jsonb_build_object('duplicates',
      jsonb_build_object('ok', true, 'result', public.run_milestone_duplicate_detection(500)));
  exception when others then
    v_result := v_result || jsonb_build_object('duplicates',
      jsonb_build_object('ok', false, 'error', sqlerrm));
  end;
  return v_result;
end;
$function$;

revoke all on function public.run_milestone_quality_maintenance() from public, anon, authenticated;
grant execute on function public.run_milestone_quality_maintenance() to service_role;
comment on function public.run_milestone_quality_maintenance() is
  'Weekly failure-isolated supervisor for milestone geography, category, editorial, topic and duplicate quality stages.';

-- Repair refresh jobs that were still pointing at public facade views rather
-- than their api_cache materialized views.
update public.admin_automations
set enabled = true,
    consecutive_failures = 0,
    last_run_status = null,
    description = 'Nightly refresh of the cached People profession facets used by the public facade view.',
    action = jsonb_build_object(
      'type','cron','jobname','profession_facets_refresh',
      'command','REFRESH MATERIALIZED VIEW CONCURRENTLY api_cache.personality_profession_facets;'),
    updated_at = now()
where slug = 'profession_facets_refresh';

update public.admin_automations
set enabled = true,
    consecutive_failures = 0,
    last_run_status = null,
    description = 'Hourly refresh of the cached tag usage summary used by the public facade view.',
    action = jsonb_build_object(
      'type','cron','jobname','tag_usage_summary_refresh',
      'command','REFRESH MATERIALIZED VIEW CONCURRENTLY api_cache.tag_usage_summary;'),
    updated_at = now()
where slug = 'tag_usage_summary_refresh';

-- The function is healthy again. Daily cadence is sufficient for advisor
-- inventory and avoids rescanning the Management API every hour.
update public.admin_automations
set enabled = true, schedule = '17 3 * * *', consecutive_failures = 0,
    last_run_status = null,
    name = 'Sync Supabase advisors',
    description = 'Daily security and performance advisor inventory from the Supabase Management API.',
    updated_at = now()
where slug = 'sync_supabase_advisors_hourly';

-- Five milestone registry rows never had matching cron jobs. Preserve their
-- history but replace them with one observable, failure-isolated supervisor.
update public.admin_automations
set enabled = false,
    description = case when description ~ '^\[CONSOLIDATED\b' then description
      else '[CONSOLIDATED 2026-09-26: milestone_quality_maintenance] ' || coalesce(description,'') end,
    updated_at = now()
where slug in ('milestone_geography_resolution','milestone_category_proposals',
  'milestone_editorial_review','milestone_topic_backfill','milestone_duplicate_detection');

insert into public.admin_automations
  (slug,name,description,managed_by,enabled,"trigger",conditions,action,schedule)
values (
  'milestone_quality_maintenance','Maintain milestone quality',
  'Runs five bounded milestone quality stages weekly with per-stage failure isolation and outcomes.',
  'system',true,'{"type":"schedule"}'::jsonb,'[]'::jsonb,
  jsonb_build_object('type','cron','jobname','milestone_quality_maintenance',
    'command','SELECT public.run_milestone_quality_maintenance();'),
  '35 3 * * 2')
on conflict (slug) do update set
  name=excluded.name,description=excluded.description,enabled=true,
  action=excluded.action,schedule=excluded.schedule,updated_at=now();

-- Register two live, previously orphaned jobs and associate the event-image
-- row with its real pg_cron job name and command.
insert into public.admin_automations
  (slug,name,description,managed_by,enabled,"trigger",conditions,action,schedule)
values
  ('event_quality_cluster_refresh','Refresh event quality clusters',
   'Daily refresh of event duplicate and quality clusters.','system',true,
   '{"type":"schedule"}'::jsonb,'[]'::jsonb,
   jsonb_build_object('type','cron','jobname','event_quality_cluster_refresh',
     'command','SET statement_timeout=''240s''; SELECT public.run_event_quality_cluster_refresh();'),
   '25 2 * * *'),
  ('milestone_source_health','Check milestone source health',
   'Daily bounded citation-health workflow; rate limits remain indeterminate and only 404/410 are dead.','system',true,
   '{"type":"schedule"}'::jsonb,'[]'::jsonb,
   jsonb_build_object('type','cron','jobname','wf-milestone-source-health',
     'command','SELECT public.enqueue_workflow(''milestone-source-health'',''{"limit":75}''::jsonb);'),
   '15 2 * * *')
on conflict (slug) do update set
  name=excluded.name,description=excluded.description,enabled=true,
  action=excluded.action,schedule=excluded.schedule,updated_at=now();

update public.admin_automations
set action = jsonb_build_object('type','cron','jobname','event_image_quality_audit','command',$command$
select net.http_post(
  url := 'https://xqeacpakadqfxjxjcewc.supabase.co/functions/v1/event-image-quality',
  headers := jsonb_build_object(
    'Content-Type','application/json',
    'X-Webhook-Secret',(select decrypted_secret from vault.decrypted_secrets where name='event_quality_webhook_secret')),
  body := '{"batch_size":25,"dry_run":false}'::jsonb,
  timeout_milliseconds := 120000
) as request_id;
$command$), updated_at = now()
where slug = 'event_image_quality';

-- Combine the two latency-sensitive push polls into one invocation. The Edge
-- Function keeps the DM and next-item stages failure-isolated.
update public.admin_automations
set enabled=false,
    description=case when description ~ '^\[CONSOLIDATED\b' then description
      else '[CONSOLIDATED 2026-09-26: push_realtime] ' || coalesce(description,'') end,
    updated_at=now()
where slug in ('push_dm','push_next_item');

insert into public.admin_automations
  (slug,name,description,managed_by,enabled,"trigger",conditions,action,schedule)
values ('push_realtime','Dispatch realtime push notifications',
  'Dispatches DM and upcoming-itinerary notifications in one failure-isolated invocation.',
  'system',true,'{"type":"schedule"}'::jsonb,'[]'::jsonb,
  jsonb_build_object('type','cron','jobname','push-realtime','command',$command$
select net.http_post(
  url := 'https://xqeacpakadqfxjxjcewc.supabase.co/functions/v1/push-dispatcher',
  headers := jsonb_build_object(
    'Content-Type','application/json',
    'x-internal-secret',(select decrypted_secret from vault.decrypted_secrets where name='internal_invoke_secret')),
  body := '{"kind":"realtime"}'::jsonb,
  timeout_milliseconds := 60000
) as request_id;
$command$),'1-59/5 * * * *')
on conflict (slug) do update set
  name=excluded.name,description=excluded.description,enabled=true,
  action=excluded.action,schedule=excluded.schedule,updated_at=now();

-- Completed one-shot work stays visible for audit but never consumes cron.
update public.admin_automations
set enabled=false,
    description=case when description ~ '^\[(RETIRED|COMPLETED)\b' then description
      else '[COMPLETED 2026-09-26: verified no eligible work remains] ' || coalesce(description,'') end,
    updated_at=now()
where slug in ('marketplace_affiliate_backfill','marketplace_gallery_asset_backfill',
  'news_story_backfill','news_verdict_geo_backfill','venue_geocode_repair',
  'ev_fill_eventbrite','event_dedup_sweep','expand_event_recurrences',
  'hotel_reenrich_stale','marketplace_catalog_prune','tag_image_provenance_sync',
  'city_cost_of_living_backfill');

-- Replace exactly the affected cron jobs. Commands are derived from the
-- registry so future reconciliation sees one source of truth.
do $do$
declare v_job text;
begin
  foreach v_job in array array[
    'profession_facets_refresh','tag_usage_summary_refresh','sync-supabase-advisors-hourly',
    'milestone_quality_maintenance','event_quality_cluster_refresh','wf-milestone-source-health',
    'event_image_quality_audit','push-realtime','push-dm','push-next-item',
    'city_cost_of_living_backfill','marketplace_affiliate_backfill',
    'marketplace_gallery_asset_backfill','news_story_backfill','news_verdict_geo_backfill',
    'venue_geocode_repair','ev_fill_eventbrite','event_dedup_sweep','expand_event_recurrences',
    'hotel_reenrich_stale','marketplace_catalog_prune','tag_image_provenance_sync'
  ] loop
    perform cron.unschedule(v_job) where exists(select 1 from cron.job where jobname=v_job);
  end loop;
end;
$do$;

select cron.schedule(a.action->>'jobname', a.schedule,
  public.admin_automation_effective_command(a.slug,a.action->>'command'))
from public.admin_automations a
where a.slug in ('profession_facets_refresh','tag_usage_summary_refresh',
  'sync_supabase_advisors_hourly','milestone_quality_maintenance',
  'event_quality_cluster_refresh','milestone_source_health','event_image_quality','push_realtime')
  and a.enabled;
;
