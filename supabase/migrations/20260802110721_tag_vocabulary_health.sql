-- Surface for the vocabulary-hygiene layer.
--
-- tag_ontology_health() and tag_coverage_radar() already existed and were
-- recomputed nightly into tag_ontology_health_log -- with no UI anywhere, so
-- nobody had ever seen either. The plural-merge cron added alongside this is
-- exactly the shape of job that this repo has repeatedly discovered was
-- "registered and never once succeeded", so it reports its own last run here.
create or replace function public.tag_vocabulary_health()
returns jsonb
language sql stable security definer
set search_path = public, cron
as $fn$
  select jsonb_build_object(
    -- Should sit at 0. Anything else means the nightly merge is not draining.
    'plural_pairs_open',   (select count(*) from public.tag_plural_pairs(500)),
    'plural_merges_total', (select count(*) from public.tag_merge_audit
                             where source = 'auto:plural' and not is_reversed),
    'plural_merges_7d',    (select count(*) from public.tag_merge_audit
                             where source = 'auto:plural' and not is_reversed
                               and created_at > now() - interval '7 days'),
    'plural_exclusions',   (select count(*) from public.tag_plural_exclusions),
    'slug_corrupt',        (select count(*) from public.unified_tags
                             where status <> 'merged'
                               and slug <> public.normalize_tag_slug(name)),
    -- Informational, not a defect count: most non-ASCII active names are
    -- proper nouns or English loanwords. Reviewed by
    -- scripts/data-quality/englishify-tags.mjs.
    'non_ascii_active',    (select count(*) from public.unified_tags
                             where status = 'active' and name ~ '[^\x00-\x7F]'),
    'uncategorized_active',(select count(*) from public.unified_tags t
                             where t.status = 'active'
                               and not exists (select 1 from public.tag_category_assignments a
                                                where a.tag_id = t.id)),
    'legacy_category_values', (select count(distinct category) from public.unified_tags
                                where category is not null
                                  and category not in (select name from public.tag_categories)),
    'plural_cron_last_success', (select max(d.start_time) from cron.job j
                                   join cron.job_run_details d on d.jobid = j.jobid
                                  where j.jobname = 'tag_plural_merge' and d.status = 'succeeded')
  );
$fn$;

revoke all on function public.tag_vocabulary_health() from public;
grant execute on function public.tag_vocabulary_health() to authenticated, service_role;
