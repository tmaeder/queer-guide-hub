-- News rows created outside the hourly DAG (news_fill_rss at :30) carry no
-- pipeline_run_id, so the DAG's enrich node never selects them. Their only
-- enrichment path is news_orphan_reclaim, which posted batch_size 5 once an
-- hour = 120/day. Measured 2026-10-27: ~400/day arrive that way, 899 news rows
-- sat at enrichment_status='pending' (726 with no run id, oldest 2026-10-21),
-- and every one of them was already validated + deduped.
--
-- Per-row enrichment is p50 1.3s / p95 3.3s, so 20 rows at concurrency 4 take
-- ~20s, well inside the 60s request timeout. 20/hour = 480/day standalone plus
-- the DAG's own ~150-300/day would exceed the 600/day llm_budget cap, so the
-- cap moves to 900 in the same change; adopters fail open when it is reached.
--
-- The registry row is canonical; sync_automations_to_cron()'s drift branch
-- re-wraps and applies it (nightly automation_cron_sync). No cron.schedule here.

update public.admin_automations
   set action = jsonb_set(action, '{command}', to_jsonb(replace(action->>'command',
         '"batch_size":5,"concurrency":1', '"batch_size":20,"concurrency":4')))
 where slug = 'news_orphan_reclaim'
   and action->>'command' like '%"batch_size":5,"concurrency":1%';

update public.llm_budget
   set daily_cap = 900
 where caller_key = 'pipeline-enrich-news' and daily_cap < 900;

do $verify$
begin
  if not exists (select 1 from public.admin_automations
                  where slug = 'news_orphan_reclaim'
                    and action->>'command' like '%pipeline-enrich-news%"batch_size":20,"concurrency":4%') then
    raise exception 'news_orphan_reclaim does not post enrich-news batch_size 20';
  end if;
  if exists (select 1 from public.llm_budget where caller_key = 'pipeline-enrich-news' and daily_cap < 900) then
    raise exception 'pipeline-enrich-news budget cap below 900';
  end if;
end
$verify$;
