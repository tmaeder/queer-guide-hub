-- Make the visibility batch self-maintaining and fault-tolerant:
--  1. Once unscored entities are exhausted, re-score the stalest rows
--     (computed_at older than 30 days) so scores stay fresh long-term.
--  2. Wrap each entity in its own block so one bad row can't abort the whole
--     nightly run (logs a skip count instead of raising).
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
  v_skipped int := 0;
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
        where not exists (select 1 from public.search_visibility_scores s where s.entity_type = 'venue' and s.entity_id = v.id)
      union all
      select 'event', e.id from public.events e
        where not exists (select 1 from public.search_visibility_scores s where s.entity_type = 'event' and s.entity_id = e.id)
      union all
      select 'news_article', n.id from public.news_articles n
        where not exists (select 1 from public.search_visibility_scores s where s.entity_type = 'news_article' and s.entity_id = n.id)
      union all
      select 'marketplace_listing', m.id from public.marketplace_listings m
        where not exists (select 1 from public.search_visibility_scores s where s.entity_type = 'marketplace_listing' and s.entity_id = m.id)
      union all
      select 'personality', p.id from public.personalities p
        where not exists (select 1 from public.search_visibility_scores s where s.entity_type = 'personality' and s.entity_id = p.id)
    ),
    stale as (
      select entity_type et, entity_id eid
      from public.search_visibility_scores
      where computed_at < now() - interval '30 days'
    ),
    candidates as (
      select et, eid, 0 as pri from unscored
      union all
      select et, eid, 1 as pri from stale
    )
    select et, eid from candidates order by pri limit greatest(p_limit, 1)
  loop
    begin
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
    exception when others then
      v_skipped := v_skipped + 1;  -- one bad entity must not abort the run
    end;
  end loop;

  update public.admin_automation_runs
    set finished_at = now(), items_examined = v_scored + v_skipped, items_changed = v_scored,
        summary = jsonb_build_object('scored', v_scored, 'skipped', v_skipped, 'limit', p_limit)
    where id = v_run_id;
  update public.admin_automations
    set last_run_at = v_started, last_run_status = 'success'
    where id = v_automation_id;
  return jsonb_build_object('scored', v_scored, 'skipped', v_skipped);
exception when others then
  update public.admin_automation_runs set finished_at = now(), status = 'error', error = SQLERRM where id = v_run_id;
  update public.admin_automations set last_run_at = v_started, last_run_status = 'error' where id = v_automation_id;
  raise;
end $$;
