-- P3 revive: batch visibility scoring + worst-scored leaderboard.
-- compute_visibility_score() is a real per-entity scorer but was only ever
-- called on demand, so search_visibility_scores stayed empty. This adds an
-- incremental batch driver (nightly cron) + a leaderboard RPC so the Ingestion
-- Quality tab becomes proactive ("which entities are least findable?").

-- Incremental batch: scores up to p_limit not-yet-scored entities across the
-- core searchable types. ~72k entities total, so full coverage takes several
-- nightly runs; re-scoring of stale rows is a future follow-up.
create or replace function public.run_visibility_score_batch(p_limit int default 5000)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_automation_id uuid;
  v_run_id bigint;
  v_started timestamptz := now();
  v_scored int := 0;
  r record;
  v_res jsonb;
begin
  select id into v_automation_id from public.admin_automations where slug = 'visibility_score_batch';
  insert into public.admin_automation_runs
    (automation_id, automation_slug, started_at, status, items_examined, items_changed)
  values (v_automation_id, 'visibility_score_batch', v_started, 'success', 0, 0)
  returning id into v_run_id;

  for r in
    with unscored as (
      select 'venue'::text et, v.id eid from public.venues v
        where not exists (select 1 from public.search_visibility_scores s
                          where s.entity_type = 'venue' and s.entity_id = v.id)
      union all
      select 'event', e.id from public.events e
        where not exists (select 1 from public.search_visibility_scores s
                          where s.entity_type = 'event' and s.entity_id = e.id)
      union all
      select 'news_article', n.id from public.news_articles n
        where not exists (select 1 from public.search_visibility_scores s
                          where s.entity_type = 'news_article' and s.entity_id = n.id)
      union all
      select 'marketplace_listing', m.id from public.marketplace_listings m
        where not exists (select 1 from public.search_visibility_scores s
                          where s.entity_type = 'marketplace_listing' and s.entity_id = m.id)
      union all
      select 'personality', p.id from public.personalities p
        where not exists (select 1 from public.search_visibility_scores s
                          where s.entity_type = 'personality' and s.entity_id = p.id)
    )
    select et, eid from unscored limit greatest(p_limit, 1)
  loop
    v_res := public.compute_visibility_score(r.et, r.eid);
    insert into public.search_visibility_scores
      (entity_type, entity_id, score, breakdown, suggestions, computed_at)
    values (
      r.et, r.eid,
      (v_res->>'score')::numeric,
      v_res->'breakdown',
      coalesce((select array_agg(x) from jsonb_array_elements_text(v_res->'suggestions') x), array[]::text[]),
      now()
    )
    on conflict (entity_type, entity_id) do update
      set score = excluded.score,
          breakdown = excluded.breakdown,
          suggestions = excluded.suggestions,
          computed_at = excluded.computed_at;
    v_scored := v_scored + 1;
  end loop;

  update public.admin_automation_runs
    set finished_at = now(), items_examined = v_scored, items_changed = v_scored,
        summary = jsonb_build_object('scored', v_scored, 'limit', p_limit)
    where id = v_run_id;
  update public.admin_automations
    set last_run_at = v_started, last_run_status = 'success'
    where id = v_automation_id;
  return jsonb_build_object('scored', v_scored);
exception when others then
  update public.admin_automation_runs set finished_at = now(), status = 'error', error = SQLERRM where id = v_run_id;
  update public.admin_automations set last_run_at = v_started, last_run_status = 'error' where id = v_automation_id;
  raise;
end $$;

-- Worst-scored leaderboard, with a resolved title per entity type.
create or replace function public.search_visibility_worst(
  p_entity_type text default null,
  p_limit int default 50
)
returns table (
  entity_type text,
  entity_id uuid,
  title text,
  score numeric,
  computed_at timestamptz,
  suggestions text[]
)
language sql
stable
security definer
set search_path = public
as $$
  select
    s.entity_type,
    s.entity_id,
    coalesce(v.name, e.title, n.title, m.title, p.name, '(untitled)') as title,
    s.score,
    s.computed_at,
    s.suggestions
  from public.search_visibility_scores s
  left join public.venues v on s.entity_type = 'venue' and v.id = s.entity_id
  left join public.events e on s.entity_type = 'event' and e.id = s.entity_id
  left join public.news_articles n on s.entity_type = 'news_article' and n.id = s.entity_id
  left join public.marketplace_listings m on s.entity_type = 'marketplace_listing' and m.id = s.entity_id
  left join public.personalities p on s.entity_type = 'personality' and p.id = s.entity_id
  where (p_entity_type is null or s.entity_type = p_entity_type)
  order by s.score asc, s.computed_at desc
  limit greatest(p_limit, 1);
$$;

grant execute on function public.run_visibility_score_batch(int) to service_role, authenticated;
grant execute on function public.search_visibility_worst(text, int) to service_role, authenticated;

-- Register the nightly automation (04:20 UTC) + cron.
insert into public.admin_automations (slug, name, description, managed_by, enabled, trigger, conditions, action, schedule)
values (
  'visibility_score_batch',
  'Batch search-visibility scoring',
  'Incrementally scores not-yet-scored entities into search_visibility_scores for the Ingestion Quality leaderboard.',
  'system',
  true,
  '{"type":"schedule"}'::jsonb,
  '[]'::jsonb,
  '{"type":"run_function","function":"run_visibility_score_batch"}'::jsonb,
  '20 4 * * *'
)
on conflict (slug) do update
set description = excluded.description,
    enabled = excluded.enabled,
    trigger = excluded.trigger,
    conditions = excluded.conditions,
    action = excluded.action,
    schedule = excluded.schedule;

select cron.unschedule('visibility_score_batch') where exists (
  select 1 from cron.job where jobname = 'visibility_score_batch'
);
select cron.schedule(
  'visibility_score_batch',
  '20 4 * * *',
  $cron$ select public.run_visibility_score_batch(); $cron$
);
