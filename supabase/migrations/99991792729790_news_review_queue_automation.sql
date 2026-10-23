-- News review queue: resolve machine work without a human.
--
-- Measured 2026-10-22: 1,189 of 1,239 open review items were news staging rows,
-- and most were pipeline states, not decisions:
--   * 156 carried an all-zero "empty extraction" verdict — a completion that
--     parsed to defaults (mostly the Cloudflare llama-8b fallback, whose share
--     jumped on 2026-10-16). Absence of evidence, sent to a human, never retried.
--   * ~207 held a publishable verdict blocked only by `image_unusable` and/or
--     `entity_links_pending_review`. The image block held whole articles over a
--     podcast logo; the entity-link block was circular, because commit is what
--     writes pending links into entity_link_review.
--   * ~480 had no verdict yet: the hourly quality call posted batch_size 5.
--
-- Code half (same PR): pipeline-quality-enhance retries empty/failed verdicts
-- (3 attempts) and passes `stagingRelaxations`; pipeline-review-gate publishes
-- a passed verdict with nothing blocking and sweeps round-robin.
--
-- This file: (1) commit drops a suppressed image, (2) the quality call drains
-- faster, (3) the existing backlog is brought in line with the new gate.
-- Soft on preconditions, hard on postconditions.

-- (1) Commit honours enriched_data.image_suppressed. Patched in place from the
-- live definition (never restated); each anchor must occur exactly once.
do $patch$
declare
  v_fn regprocedure;
  v_src text;
  v_code text;
  v_anchor constant text := 'v_image_hash := nullif(v_enr->>''image_hash'', '''');';
  v_add constant text := v_anchor || E'\n  IF coalesce((v_enr->>''image_suppressed'')::boolean, false) THEN\n    v_image := NULL; v_image_attribution := NULL; v_image_hash := NULL;\n  END IF;';
begin
  foreach v_fn in array array[
    'public.commit_news_staging_item(uuid,text)'::regprocedure,
    'public.news_commit_staging_batch(uuid,uuid,integer)'::regprocedure]
  loop
    v_src := pg_get_functiondef(v_fn);  -- raw: the text that is re-executed
    v_code := regexp_replace(pg_get_functiondef(v_fn), '--[^' || chr(10) || ']*', '', 'g');
    if position('image_suppressed' in v_code) > 0 then
      continue; -- already patched
    end if;
    if (length(v_src) - length(replace(v_src, v_anchor, ''))) / length(v_anchor) <> 1 then
      raise exception 'image_suppressed patch: anchor not found exactly once in %', v_fn;
    end if;
    execute replace(v_src, v_anchor, v_add);
  end loop;
end
$patch$;

-- (1b) The curated-podcast verdict stamps quality_status='passed' but never
-- auto_publish, and the review gate's candidate selector
-- (pipeline_review_gate_candidates) only picks pending news rows whose
-- auto_publish is true. Those episodes were never re-gated at all.
do $patch$
declare
  v_src text;
  v_code text;
  v_anchor constant text := '''quality_status'', ''passed'',';
begin
  v_src := pg_get_functiondef('public.run_podcast_deterministic_verdict(integer)'::regprocedure);  -- raw, re-executed
  v_code := regexp_replace(pg_get_functiondef('public.run_podcast_deterministic_verdict(integer)'::regprocedure), '--[^' || chr(10) || ']*', '', 'g');
  if position('''auto_publish''' in v_code) > 0 then
    return; -- already patched
  end if;
  if (length(v_src) - length(replace(v_src, v_anchor, ''))) / length(v_anchor) <> 1 then
    raise exception 'podcast auto_publish patch: anchor not found exactly once';
  end if;
  execute replace(v_src, v_anchor, v_anchor || ' ''auto_publish'', true,');
end
$patch$;

-- (2) The hourly quality call: 5 items -> 24 items, 4 concurrent, inside the
-- 150s edge wall clock. Only the pipeline-quality-enhance body moves; the
-- enrich-news body in the same command is untouched. Registry is canonical;
-- the nightly automation_cron_sync applies it to pg_cron.
update public.admin_automations
   set action = jsonb_set(action, '{command}', to_jsonb(regexp_replace(
         action->>'command',
         '(pipeline-quality-enhance''.*?)\{"batch_size":5,"concurrency":1\}''::jsonb, timeout_milliseconds := 60000',
         '\1{"batch_size":24,"concurrency":4}''::jsonb, timeout_milliseconds := 150000')))
 where slug = 'news_orphan_reclaim'
   and action->>'command' like '%pipeline-quality-enhance%"batch_size":5,"concurrency":1%';

-- (3a) Empty-extraction verdicts become "not yet judged", attempt 1 of 3.
update public.ingestion_staging s
   set enriched_data = (s.enriched_data
         - 'quality_status' - 'quality_decision' - 'auto_publish'
         - 'auto_publish_blocked_reasons' - 'quality_run_at' - 'quality_pipeline_version')
         || jsonb_build_object(
              'quality_attempts', 1,
              'quality_last_error', 'empty_extraction',
              'quality_reset_by', 'migration:99991792729790')
 where s.target_table = 'news_articles'
   and s.review_status = 'pending_review'
   and s.disposition = 'pending'
   and coalesce(s.enriched_data->'auto_publish_blocked_reasons', '[]'::jsonb) ? 'empty_extraction';

-- (3b) A review verdict whose only blocks are the two relaxed ones passes, as
-- evaluatePublishGate({stagingRelaxations:true}) now returns for the same input.
update public.ingestion_staging s
   set enriched_data = s.enriched_data || jsonb_build_object(
         'quality_status', 'passed',
         'auto_publish', true,
         'auto_publish_blocked_reasons', '[]'::jsonb,
         'image_suppressed',
           (s.enriched_data->'auto_publish_blocked_reasons') ? 'image_unusable'
           and not (s.enriched_data ? 'quality_image_replaced'),
         'quality_relaxed_from', s.enriched_data->'auto_publish_blocked_reasons',
         'quality_relaxed_by', 'migration:99991792729790')
 where s.target_table = 'news_articles'
   and s.review_status = 'pending_review'
   and s.disposition = 'pending'
   and s.enriched_data->>'quality_status' = 'review'
   and jsonb_typeof(s.enriched_data->'auto_publish_blocked_reasons') = 'array'
   and jsonb_array_length(s.enriched_data->'auto_publish_blocked_reasons') > 0
   and (s.enriched_data->'auto_publish_blocked_reasons')
       <@ '["image_unusable","entity_links_pending_review"]'::jsonb;

-- (3c) Existing passed verdicts with nothing blocking get the missing stamp.
update public.ingestion_staging s
   set enriched_data = s.enriched_data || jsonb_build_object('auto_publish', true)
 where s.target_table = 'news_articles'
   and s.review_status = 'pending_review'
   and s.disposition = 'pending'
   and s.enriched_data->>'quality_status' = 'passed'
   and coalesce(s.enriched_data->>'auto_publish', '') <> 'true'
   and coalesce(jsonb_array_length(case when jsonb_typeof(s.enriched_data->'auto_publish_blocked_reasons') = 'array'
                                        then s.enriched_data->'auto_publish_blocked_reasons' end), 0) = 0;

do $verify$
declare v_bad int;
begin
  select count(*) into v_bad from pg_proc
   where oid in ('public.commit_news_staging_item(uuid,text)'::regprocedure,
                 'public.news_commit_staging_batch(uuid,uuid,integer)'::regprocedure)
     and position('image_suppressed' in regexp_replace(pg_get_functiondef(oid), '--[^' || chr(10) || ']*', '', 'g')) = 0;
  if v_bad <> 0 then raise exception 'P1 failed: % commit functions ignore image_suppressed', v_bad; end if;

  select count(*) into v_bad from public.admin_automations
   where slug = 'news_orphan_reclaim'
     and action->>'command' like '%pipeline-quality-enhance%"batch_size":5,"concurrency":1%';
  if v_bad <> 0 then raise exception 'P2 failed: quality call still posts batch_size 5'; end if;

  select count(*) into v_bad from public.ingestion_staging
   where target_table = 'news_articles' and review_status = 'pending_review' and disposition = 'pending'
     and coalesce(enriched_data->'auto_publish_blocked_reasons', '[]'::jsonb) ? 'empty_extraction'
     and coalesce((enriched_data->>'quality_attempts')::int, 0) < 3;
  if v_bad <> 0 then raise exception 'P3 failed: % empty verdicts still held for a human', v_bad; end if;

  select count(*) into v_bad from public.ingestion_staging
   where target_table = 'news_articles' and review_status = 'pending_review' and disposition = 'pending'
     and enriched_data->>'quality_status' = 'review'
     and jsonb_typeof(enriched_data->'auto_publish_blocked_reasons') = 'array'
     and jsonb_array_length(enriched_data->'auto_publish_blocked_reasons') > 0
     and (enriched_data->'auto_publish_blocked_reasons') <@ '["image_unusable","entity_links_pending_review"]'::jsonb;
  if v_bad <> 0 then raise exception 'P4 failed: % rows held only by relaxed blocks', v_bad; end if;

  select count(*) into v_bad from public.ingestion_staging
   where target_table = 'news_articles' and review_status = 'pending_review' and disposition = 'pending'
     and enriched_data->>'quality_status' = 'passed'
     and coalesce(enriched_data->>'auto_publish', '') <> 'true'
     and coalesce(jsonb_array_length(case when jsonb_typeof(enriched_data->'auto_publish_blocked_reasons') = 'array'
                                          then enriched_data->'auto_publish_blocked_reasons' end), 0) = 0;
  if v_bad <> 0 then raise exception 'P5 failed: % passed verdicts invisible to the gate selector', v_bad; end if;

  select count(*) into v_bad from pg_proc
   where oid = 'public.run_podcast_deterministic_verdict(integer)'::regprocedure
     and position('''auto_publish''' in regexp_replace(pg_get_functiondef(oid), '--[^' || chr(10) || ']*', '', 'g')) = 0;
  if v_bad <> 0 then raise exception 'P6 failed: podcast verdict does not stamp auto_publish'; end if;
end
$verify$;

-- Sentinel for scripts/check-pipeline-health.mjs. Standalone (restating
-- news_quality_signals is a merge-collision surface); service_role only.
-- The two *_held counts are zero right after this file and must stay zero:
-- a non-zero value means the staging relaxations or the retry were reverted.
create or replace function public.news_staging_review_signals()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $fn$
  with held as (
    select enriched_data e, created_at
      from public.ingestion_staging
     where target_table = 'news_articles'
       and review_status = 'pending_review'
       and disposition = 'pending'
  )
  select jsonb_build_object(
    'probe_ok', true,
    'held_total', (select count(*) from held),
    'no_verdict', (select count(*) from held where e->>'quality_status' is null),
    'no_verdict_older_7d', (select count(*) from held
                             where e->>'quality_status' is null and created_at < now() - interval '7 days'),
    'empty_held_under_cap', (select count(*) from held
       where coalesce(e->'auto_publish_blocked_reasons', '[]'::jsonb) ? 'empty_extraction'
         and coalesce((e->>'quality_attempts')::int, 0) < 3),
    'relaxable_held', (select count(*) from held
       where e->>'quality_status' = 'review'
         and jsonb_typeof(e->'auto_publish_blocked_reasons') = 'array'
         and jsonb_array_length(e->'auto_publish_blocked_reasons') > 0
         and (e->'auto_publish_blocked_reasons') <@ '["image_unusable","entity_links_pending_review"]'::jsonb),
    'judged_awaiting_human', (select count(*) from held where e->>'quality_status' = 'review')
  )
$fn$;
revoke all on function public.news_staging_review_signals() from public, anon, authenticated;
grant execute on function public.news_staging_review_signals() to service_role;
