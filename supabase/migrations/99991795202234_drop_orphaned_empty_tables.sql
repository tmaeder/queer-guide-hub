-- Drop six orphaned, empty tables (tech-debt cleanup, 2026-11-20).
--
-- Each table below was measured on prod before this file was written and met
-- ALL of the following:
--   * 0 rows (exact count(*), not reltuples);
--   * no reference in src/, functions/, workers/, scripts/, scraper/,
--     supabase/functions/, extension/, mobile/ or e2e/ (only the generated
--     src/integrations/supabase/types.ts and prose in docs/);
--   * no reference in any public-schema function body, in any cron.job
--     command, and no dependent view;
--   * no inbound foreign key, no user trigger, no publication membership.
--
--   scraper_normalize_rejections  -- scraper entity tables were deprecated
--                                    (scraper/docs/deprecation-scraper-entity-tables.md)
--   audio_files                   -- never written; no media path reads it
--   rag_conversations             -- never written; no RAG chat surface exists
--   cms_content_relationships     -- dead side table of cms_content
--   cms_content_revisions         -- superseded by content_revisions (trigger-written)
--   cms_duplicate_candidates      -- superseded by dedup_review_queue
--
-- Deliberately NOT dropped: personality_review_queue_legacy (0 rows, but named
-- by scripts/rollback/20260801130000-140000_entity_review_queue_rollback.sql),
-- and every 0-row table that is referenced by a function, cron, view or FK
-- (queues such as content_changes / venue_quality_recompute_queue are empty
-- because they are drained, not because they are dead).
--
-- Soft on preconditions, hard on postconditions: a table that has gained rows
-- or a dependency since measurement is SKIPPED with a notice rather than
-- aborting db push for the whole repo; every skip is reported by name.

do $drop$
declare
  t text;
  n bigint;
  deps int;
begin
  foreach t in array array[
    'scraper_normalize_rejections',
    'audio_files',
    'rag_conversations',
    'cms_content_relationships',
    'cms_content_revisions',
    'cms_duplicate_candidates'
  ] loop
    if to_regclass('public.' || t) is null then
      raise notice 'skip %: already absent', t;
      continue;
    end if;

    execute format('select count(*) from public.%I', t) into n;
    if n > 0 then
      raise notice 'skip %: now holds % rows', t, n;
      continue;
    end if;

    select count(*) into deps
    from (
      select 1 from pg_constraint k
       where k.confrelid = ('public.' || t)::regclass
      union all
      select 1 from pg_depend d
        join pg_rewrite r on r.oid = d.objid
       where d.refobjid = ('public.' || t)::regclass
         and r.ev_class <> ('public.' || t)::regclass
    ) x;
    if deps > 0 then
      raise notice 'skip %: % inbound dependencies', t, deps;
      continue;
    end if;

    -- RESTRICT (the default): never cascade into an object this check missed.
    execute format('drop table public.%I', t);
    raise notice 'dropped %', t;
  end loop;
end
$drop$;
