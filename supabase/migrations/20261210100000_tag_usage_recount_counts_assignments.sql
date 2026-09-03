-- usage_count is the ASSIGNMENT count. Two of the three recount functions
-- compute something else entirely, and both are wired into merge paths.
--
-- `unified_tags.usage_count` is maintained as
-- `count(*) from unified_tag_assignments where tag_id = t.id` — that is what the
-- nightly `recount_all_tag_usage` (cron `recount_tag_usage`, 04:20) writes, and
-- measured 2026-09-02 stored == assignment count for every one of the 4,391
-- active tags.
--
-- The other two recompute it by counting slug strings in exactly three arrays —
-- `venues.tags`, `news_articles.tags`, `personalities.tags`. They read neither
-- `unified_tag_assignments` nor `events`, so they do not compute usage_count at
-- all; they compute a strictly lossier number and overwrite the column with it:
--
--   recount_unified_tag_usage_for(uuid[])  <- merge_tag_concept, unmerge_tag_concept
--   recount_unified_tag_usage()            <- merge_unified_tag   (UNBOUNDED: every tag)
--
-- This is inherited, not invented: `20260724205000_fix_merge_targeted_recount`
-- created the `_for` variant to bound a full-table UPDATE that was storming the
-- search-sync trigger, and its header says it "mirrors
-- recount_unified_tag_usage()'s slug-source logic". It faithfully preserved the
-- semantics while fixing the blast radius. The three-array rule simply predates
-- `unified_tag_assignments` becoming the source of truth; `recount_all_tag_usage`
-- is the one that was updated.
--
-- ## Blast radius, measured on prod 2026-09-02
--
-- Simulating what the three-array logic would write against what is correct now,
-- across all 4,391 active tags:
--
--   1,165 tags (26.5%) would get a wrong value
--     329 would be driven to 0 despite having real usage
--   worst single undercount 8,725; 155,738 total usage erased
--
-- Concretely: lgbtq 3,699 -> 4, party 3,568 -> 31, queer 7,442 -> 2,864.
--
-- ## Why this is worse than a transient wrong number
--
-- `tag_usage_summary` is a materialized view whose `usage_count` column is
-- `ut.usage_count` read straight from `unified_tags`, refreshed hourly
-- (`tag_usage_summary_refresh`, `25 * * * *`). And `deprecate_unused_tags`
-- selects `status = 'active' AND NOT human_reviewed AND
-- tag_usage_summary.usage_count = 0`. So a merge can make a well-used tag
-- deprecation-eligible: corrupt -> propagate to the MV -> qualify as "unused".
--
-- The repair does not close this. `recount_tag_usage` runs at 04:20 and the
-- nightly merge cron `tag_plural_merge` runs at 04:25 — the repair fires five
-- minutes BEFORE the corruptor, so merge damage survives ~24h to the next 04:20,
-- not 5 minutes. (`merge:auto` in tag_change_log: 94 usage_count rewrites, 62
-- decreases, 52 driven to zero, last at 2026-08-31 04:25:00 — the cron's minute.)
--
-- No tag is currently mis-deprecated by this path and no tag currently holds a
-- wrong usage_count (0 wrong at any status), so this is prevention of a live,
-- quantified mechanism rather than repair of standing damage. The precedent for
-- taking it seriously is the orphan sweep that culled real glossary vocabulary.
--
-- ## The fix
--
-- Correct both functions in place rather than patching call sites. Both callers
-- want "recount usage for these tags", there are no callers outside SQL (checked
-- src/, scripts/, supabase/functions/, workers/), and fixing the shared function
-- also fixes any future caller. Signatures are unchanged, so no merge core has to
-- be restated — which matters, because restating a function is a silent
-- merge-collision surface between concurrent branches.
--
-- Both now count `unified_tag_assignments`, matching `recount_all_tag_usage`, and
-- both skip rows whose value would not change. That `is distinct from` guard is
-- what keeps the unbounded variant affordable: after the column is correct it
-- writes nothing, so it no longer storms `log_unified_tag_change` and
-- `trg_search_documents_*` across the whole table — the exact problem
-- 20260724205000 was created to solve, now solved without forking the semantics.
--
-- `run_event_tag_link` is deliberately left alone: PR #3303 already replaced its
-- call with an equivalent inline assignment recount. Rewriting it again to call
-- this now-correct helper would be churn on freshly shipped code for no
-- behavioural gain.

create or replace function public.recount_unified_tag_usage_for(p_ids uuid[])
returns void
language plpgsql
security definer
set search_path to 'public'
as $fn$
begin
  update public.unified_tags t
     set usage_count = coalesce(
           (select count(*)::int from public.unified_tag_assignments a where a.tag_id = t.id), 0),
         updated_at = now()
   where t.id = any(p_ids)
     and t.usage_count is distinct from coalesce(
           (select count(*)::int from public.unified_tag_assignments a where a.tag_id = t.id), 0);
end;
$fn$;

comment on function public.recount_unified_tag_usage_for(uuid[]) is
  'Recomputes unified_tags.usage_count for the given ids as the count of unified_tag_assignments — the same quantity recount_all_tag_usage maintains nightly. Until 2026-09 it counted slug strings in venues/news_articles/personalities.tags instead, which ignores assignments and events entirely and would have driven 329 of 4,391 active tags to 0. Only writes rows whose value actually changes, so the audit and search triggers on unified_tags stay quiet.';

create or replace function public.recount_unified_tag_usage()
returns void
language plpgsql
security definer
set search_path to 'public'
as $fn$
begin
  -- Unbounded by signature (merge_unified_tag calls it with no ids), but the
  -- IS DISTINCT FROM guard means it only writes genuine deltas — so in the
  -- steady state this touches zero rows and fires zero triggers.
  update public.unified_tags t
     set usage_count = coalesce(
           (select count(*)::int from public.unified_tag_assignments a where a.tag_id = t.id), 0),
         updated_at = now()
   where t.usage_count is distinct from coalesce(
           (select count(*)::int from public.unified_tag_assignments a where a.tag_id = t.id), 0);
end;
$fn$;

comment on function public.recount_unified_tag_usage() is
  'Full-table variant of recount_unified_tag_usage_for, kept because merge_unified_tag calls it with no ids. Counts unified_tag_assignments and writes only genuine deltas, so it is a no-op once the column is correct.';

-- Grants unchanged (service_role only); restated so a CREATE OR REPLACE that
-- ever runs against a fresh role set cannot silently widen exposure.
revoke all on function public.recount_unified_tag_usage_for(uuid[]) from public, anon, authenticated;
revoke all on function public.recount_unified_tag_usage() from public, anon, authenticated;
grant execute on function public.recount_unified_tag_usage_for(uuid[]) to service_role;
grant execute on function public.recount_unified_tag_usage() to service_role;

-- Prove the correction is inert right now (the column is already correct), so
-- this migration cannot itself move a baselined tag-hygiene metric.
do $$
declare v_wrong int;
begin
  select count(*) into v_wrong
    from public.unified_tags t
   where t.usage_count is distinct from coalesce(
           (select count(*)::int from public.unified_tag_assignments a where a.tag_id = t.id), 0);
  raise notice 'usage_count rows disagreeing with assignment count after fix: %', v_wrong;
end $$;
