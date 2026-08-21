-- Register run_event_completeness_recompute as a recurring cron.
--
-- run_event_completeness_recompute() (migration 20260607160000) computes
-- events.quality_score from live columns (title/description/geo/links/images/
-- contacts/end_date) but was only ever invoked once, inline in that migration,
-- on 2026-06-07. Unlike its siblings (city/country/village/content
-- completeness recompute), it was never registered in admin_automations or
-- pg_cron -- so every backfill since (geo linking, image harvest, ...) landed
-- on columns the score never re-read. Measured on prod: 36,603 of 39,910
-- non-duplicate events (91.7%) carry quality_score=0, and recomputing live
-- for the two largest zero-scored sources shows the real completeness is far
-- higher (gaycities 36,408 rows: stored avg 0.0, live avg 88.9; ticketmaster
-- 153 rows: stored avg 0.0, live avg 78.4). quality_score correlates 0.875
-- with trust_score and carries a 10% weight in search_hybrid/discovery
-- ranking, so this stale field is suppressing both for the majority of the
-- table -- not because the data is incomplete, but because it was never
-- rescored.
--
-- Extracted into a helper (event_completeness_score) so the scoring
-- expression is written once, matching the precedent set by
-- marketplace_completeness_score rather than inlining the CASE ladder twice
-- (once to write, once to count what's still pending).

create or replace function public.event_completeness_score(
  p_title text,
  p_description text,
  p_latitude numeric,
  p_longitude numeric,
  p_city text,
  p_country text,
  p_ticket_url text,
  p_website text,
  p_images text[],
  p_organizer_contact text,
  p_end_date timestamptz
) returns smallint
language sql
immutable
as $$
  select least(100,
      (case when length(coalesce(trim(p_title),'')) > 0  then 10 else 0 end)
    + (case when length(coalesce(trim(p_title),'')) > 10 then 10 else 0 end)
    + (case when length(coalesce(trim(p_description),'')) > 0  then 10 else 0 end)
    + (case when length(coalesce(trim(p_description),'')) > 50 then 10 else 0 end)
    + (case when p_latitude is not null and p_longitude is not null then 10 else 0 end)
    + (case when coalesce(trim(p_city),'') <> '' or coalesce(trim(p_country),'') <> '' then 10 else 0 end)
    + (case when p_ticket_url is not null or p_website is not null then 10 else 0 end)
    + (case when p_images is not null and array_length(p_images,1) >= 1 then 10 else 0 end)
    + (case when p_website is not null then 5 else 0 end)
    + (case when coalesce(trim(p_organizer_contact),'') <> '' then 5 else 0 end)
    + (case when p_end_date is not null then 10 else 0 end)
  )::smallint
$$;

revoke all on function public.event_completeness_score(
  text, text, numeric, numeric, text, text, text, text, text[], text, timestamptz
) from public, anon, authenticated;
grant execute on function public.event_completeness_score(
  text, text, numeric, numeric, text, text, text, text, text[], text, timestamptz
) to service_role;

drop function if exists public.run_event_completeness_recompute();

create function public.run_event_completeness_recompute(p_batch integer default 6000)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_automation_id uuid;
  v_run_id        bigint;
  v_enabled       boolean;
  v_started_at    timestamptz := now();
  v_changed       int := 0;
  v_pending       int := 0;
begin
  select id, enabled into v_automation_id, v_enabled
    from public.admin_automations where slug = 'event_completeness_recompute';

  insert into public.admin_automation_runs
    (automation_id, automation_slug, started_at, status, items_examined, items_changed)
  values (v_automation_id, 'event_completeness_recompute', v_started_at, 'success', 0, 0)
  returning id into v_run_id;

  if v_enabled is distinct from true then
    update public.admin_automation_runs
       set finished_at = now(), summary = jsonb_build_object('skipped', true, 'reason', 'paused')
     where id = v_run_id;
    update public.admin_automations
       set last_run_at = v_started_at, last_run_status = 'paused' where id = v_automation_id;
    return jsonb_build_object('skipped', true, 'reason', 'paused');
  end if;

  with scored as (
    select e.id,
           public.event_completeness_score(
             e.title, e.description, e.latitude, e.longitude, e.city, e.country,
             e.ticket_url, e.website, e.images, e.organizer_contact, e.end_date) as new_score,
           e.quality_score as old_score
      from public.events e
     where e.duplicate_of_id is null
  ),
  pick as (
    select id, new_score from scored
     where old_score is distinct from new_score
     limit greatest(p_batch, 0)
  )
  update public.events e
     set quality_score = p.new_score
    from pick p
   where e.id = p.id;
  get diagnostics v_changed = row_count;

  select count(*) into v_pending
    from public.events e
   where e.duplicate_of_id is null
     and e.quality_score is distinct from public.event_completeness_score(
           e.title, e.description, e.latitude, e.longitude, e.city, e.country,
           e.ticket_url, e.website, e.images, e.organizer_contact, e.end_date);

  update public.admin_automation_runs
     set finished_at = now(), items_examined = v_changed + v_pending, items_changed = v_changed,
         summary = jsonb_build_object('rescored', v_changed, 'pending', v_pending, 'batch', p_batch)
   where id = v_run_id;
  update public.admin_automations
     set last_run_at = v_started_at, last_run_status = 'success' where id = v_automation_id;

  return jsonb_build_object('rescored', v_changed, 'pending', v_pending);
exception when others then
  update public.admin_automation_runs
     set finished_at = now(), status = 'error', error = sqlerrm where id = v_run_id;
  update public.admin_automations
     set last_run_at = v_started_at, last_run_status = 'error' where id = v_automation_id;
  return jsonb_build_object('error', sqlerrm);
end;
$$;

revoke all on function public.run_event_completeness_recompute(integer) from public, anon, authenticated;
grant execute on function public.run_event_completeness_recompute(integer) to service_role;

-- Slot: distinct from event_trust_recompute (:10), content_completeness_recompute
-- (:50), cron_failure_sweep (:20) and geo_address_drain (every 5 min) -- all of
-- which also touch events or the shared admin_automation_runs bookkeeping table.
select cron.unschedule('event_completeness_recompute')
where exists (select 1 from cron.job where jobname = 'event_completeness_recompute');

select cron.schedule('event_completeness_recompute', '35 * * * *',
  $cmd$SET statement_timeout = '240s'; SELECT public.run_event_completeness_recompute(6000);$cmd$
);

insert into public.admin_automations
  (slug, name, description, managed_by, enabled, trigger, conditions, action, schedule)
select
  'event_completeness_recompute',
  'Recompute event completeness scores',
  'Hourly, batched recompute of events.quality_score from live columns (title/description/geo/'
    || 'links/images/contacts/end_date). Registered 2026-08-20 after finding the scorer had run '
    || 'exactly once (2026-06-07) and never since, leaving 91.7% of non-duplicate events frozen '
    || 'at a stale quality_score of 0 despite months of backfills landing on the columns it reads.',
  'system',
  true,
  '{"type": "schedule"}'::jsonb,
  '[]'::jsonb,
  jsonb_build_object('fn', 'run_event_completeness_recompute', 'type', 'rpc',
                      'jobname', 'event_completeness_recompute'),
  '35 * * * *'
where not exists (
  select 1 from public.admin_automations a
  where a.slug = 'event_completeness_recompute'
);
