-- Personality auto-promote (self-healing recall, 2026-06-18).
--
-- Closes the Truth Engine loop: as the refresh/enrichment crons fill bios/images
-- and the trust recompute rescores, newly-eligible rows should reach the public
-- catalog without manual intervention. run_personality_auto_promote() applies the
-- Moderate gate (via personalities_promotable + promote_personality) nightly.
--
-- Safety: promote_personality re-checks the full gate server-side (non-adult,
-- relevance>=0.7, bio+image+real wikidata, not a non-person) and flags every
-- promotion needs_attention=true for admin review. release_gate_checks() remains
-- the backstop. Capped per run.

begin;

create or replace function public.run_personality_auto_promote(p_limit int default 300)
returns jsonb
language plpgsql
security definer set search_path to 'public', 'pg_temp'
as $$
declare
  v_automation_id uuid;
  v_run_id bigint;
  v_promoted int := 0;
begin
  select id into v_automation_id from public.admin_automations where slug='personality_auto_promote';
  insert into public.admin_automation_runs (automation_id, automation_slug, started_at, status)
    values (v_automation_id, 'personality_auto_promote', now(), 'success') returning id into v_run_id;

  select count(*) into v_promoted
  from (select id from public.personalities_promotable(greatest(1, least(p_limit, 1000)))) s
  where (public.promote_personality(s.id, 'moderate-auto-cron'))->>'promoted' = 'true';

  update public.admin_automation_runs
     set finished_at=now(), items_examined=v_promoted, items_changed=v_promoted,
         summary=jsonb_build_object('promoted', v_promoted)
   where id=v_run_id;
  update public.admin_automations set last_run_at=now(), last_run_status='success' where id=v_automation_id;

  return jsonb_build_object('promoted', v_promoted);
end;
$$;

revoke all on function public.run_personality_auto_promote(int) from public;
grant execute on function public.run_personality_auto_promote(int) to service_role;

insert into public.admin_automations (slug, name, description, managed_by, enabled, trigger, conditions, action, schedule)
values
  ('personality_auto_promote','Auto-publish eligible personalities',
   'Nightly Moderate-gate promotion (capped 300/run): non-adult, relevance>=0.7, bio+image+real wikidata, not a non-person. Each promotion is flagged needs_attention for review. Reversible via unpromote_personality.',
   'system', true, '{"type":"schedule"}'::jsonb, '[]'::jsonb,
   '{"type":"rpc","fn":"run_personality_auto_promote"}'::jsonb, '50 3 * * *')
on conflict (slug) do update
  set description=excluded.description, action=excluded.action, schedule=excluded.schedule, enabled=excluded.enabled;

do $$ begin
  if exists (select 1 from cron.job where jobname='personality_auto_promote') then perform cron.unschedule('personality_auto_promote'); end if;
end $$;
select cron.schedule('personality_auto_promote', '50 3 * * *', $cron$select public.run_personality_auto_promote()$cron$);

-- Wire the admin Run now / Dry run dispatchers (append the new slug).
create or replace function public.admin_automation_run(p_slug text)
returns jsonb language plpgsql security definer set search_path to 'public'
as $function$
declare v_result jsonb;
begin
  if not has_any_role_jwt(array['admin'::app_role]) then raise exception 'unauthorized' using errcode='42501'; end if;
  if p_slug = 'event_auto_archive' then v_result := public.run_event_auto_archive();
  elsif p_slug = 'staging_auto_reject_stale' then v_result := public.run_staging_auto_reject_stale();
  elsif p_slug = 'workflow_runs_purge' then v_result := public.run_workflow_runs_purge();
  elsif p_slug = 'enrichment_log_purge' then v_result := public.run_enrichment_log_purge();
  elsif p_slug = 'event_trust_recompute' then v_result := public.run_event_trust_recompute();
  elsif p_slug = 'event_coverage_radar' then v_result := public.run_event_coverage_radar();
  elsif p_slug = 'venue_coord_snap' then v_result := public.run_venue_coord_snap();
  elsif p_slug = 'city_trust_recompute' then v_result := public.run_city_trust_recompute();
  elsif p_slug = 'city_coverage_radar' then v_result := public.run_city_coverage_radar();
  elsif p_slug = 'city_safety_backfill' then v_result := public.run_city_safety_backfill();
  elsif p_slug = 'hotel_safety_backfill' then v_result := public.run_hotel_safety_backfill();
  elsif p_slug = 'amenity_coverage_summary' then v_result := public.run_amenity_coverage_summary();
  elsif p_slug = 'personality_trust_recompute' then v_result := public.run_personality_trust_recompute();
  elsif p_slug = 'personality_coverage_radar' then v_result := public.run_personality_coverage_radar();
  elsif p_slug = 'personality_auto_promote' then v_result := public.run_personality_auto_promote();
  else raise exception 'unknown automation slug: %', p_slug using errcode='22023'; end if;
  return v_result;
end; $function$;

create or replace function public.admin_automation_dry_run(p_slug text)
returns jsonb language plpgsql security definer set search_path to 'public'
as $function$
declare v_automation_id uuid; v_examined int := 0; v_started_at timestamptz := now();
begin
  if not has_any_role_jwt(array['admin'::app_role,'moderator'::app_role]) then
    raise exception 'unauthorized' using errcode='42501'; end if;
  select id into v_automation_id from public.admin_automations where slug = p_slug;
  if v_automation_id is null then raise exception 'unknown automation slug: %', p_slug using errcode='22023'; end if;

  if p_slug = 'event_auto_archive' then
    select count(*) into v_examined from public.events
    where status='active' and end_date is not null and end_date < now() - interval '7 days';
  elsif p_slug = 'staging_auto_reject_stale' then
    select count(*) into v_examined from public.ingestion_staging
    where review_status='pending_review' and disposition='pending' and created_at < now() - interval '60 days';
  elsif p_slug = 'workflow_runs_purge' then
    select count(*) into v_examined from public.workflow_runs
    where status='completed' and started_at < now() - interval '30 days';
  elsif p_slug = 'enrichment_log_purge' then
    select count(*) into v_examined from public.enrichment_log
    where status in ('skipped','done') and created_at < now() - interval '30 days';
  elsif p_slug = 'event_trust_recompute' then
    select count(*) into v_examined from public.events
    where duplicate_of_id is null
      and (start_date > now() - interval '7 days' or last_verified_at is null or updated_at > now() - interval '2 days');
  elsif p_slug = 'event_coverage_radar' then
    select count(*) into v_examined from public.cities where is_major_city = true;
  elsif p_slug = 'venue_coord_snap' then
    select count(*) into v_examined from public.venues_misplaced(null) where is_geocodable = false;
  elsif p_slug = 'city_trust_recompute' then
    select count(*) into v_examined from public.cities c
    where c.duplicate_of_id is null
      and (c.last_verified_at is null or c.updated_at > c.last_verified_at or c.last_verified_at < now() - interval '30 days');
  elsif p_slug = 'city_coverage_radar' then
    select count(*) into v_examined from public.cities where duplicate_of_id is null;
  elsif p_slug = 'city_safety_backfill' then
    select count(*) into v_examined from public.cities c
    where c.duplicate_of_id is null
      and (c.safety_notes is null or length(trim(c.safety_notes))=0)
      and coalesce(c.field_provenance->'safety_notes'->>'source','') <> 'llm+human'
      and not exists (select 1 from public.city_review_queue q
                      where q.city_id=c.id and q.field='safety_notes' and q.status='open');
  elsif p_slug = 'hotel_safety_backfill' then
    select count(*) into v_examined from public.hotels h
    where h.queer_safety_notes is null
       or h.queer_safety_notes ilike 'LGBTQ+-host accommodation listed on misterb&b%'
       or h.queer_safety_notes ilike '%equality score%';
  elsif p_slug = 'personality_trust_recompute' then
    select count(*) into v_examined from public.personalities p
    where p.duplicate_of_id is null and coalesce(p.review_status,'')<>'archived'
      and (p.last_verified_at is null or p.updated_at > p.last_verified_at or p.last_verified_at < now() - interval '30 days');
  elsif p_slug = 'personality_coverage_radar' then
    select count(*) into v_examined from public.personalities
    where duplicate_of_id is null and coalesce(review_status,'')<>'archived';
  elsif p_slug = 'personality_auto_promote' then
    select count(*) into v_examined from public.personalities_promotable(1000);
  else raise exception 'unknown automation slug: %', p_slug using errcode='22023'; end if;

  insert into public.admin_automation_runs
    (automation_id, automation_slug, started_at, finished_at, status, items_examined, items_changed, summary)
  values (v_automation_id, p_slug, v_started_at, now(), 'dry_run', v_examined, 0,
          jsonb_build_object('mode','dry_run','would_change',v_examined));
  return jsonb_build_object('would_change', v_examined);
end; $function$;

commit;
