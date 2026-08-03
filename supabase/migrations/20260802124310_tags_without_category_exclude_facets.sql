-- "87 uncategorized tags" counted 16 that are uncategorized ON PURPOSE.
--
-- 20260802105740 removed the marketplace facet tags (mat-/vibe-/occ-/dept-...)
-- from the editorial tree, because filing Cotton and Silicone under
-- 'Sexuality & Kink' was what made them is_adult. They have their own
-- namespaced vocabulary and belong in no queer-content category. Counting them
-- as a coverage gap re-creates the exact "measured the wrong axis" error this
-- work has already hit twice, and would tempt the next person to "fix" it by
-- putting them back. 87 -> 68 after the exclusion.
--
-- Also folds three new counters into tag_vocabulary_health so the guards added
-- alongside are observable rather than assumed.
create or replace function public.tags_without_category(p_limit int default 200)
returns table (id uuid, slug text, name text, usage_count int)
language sql stable
set search_path = public
as $fn$
  select t.id, t.slug, t.name, t.usage_count
  from public.unified_tags t
  where t.status = 'active'
    and t.slug !~ '^(mat|vibe|occ|dept|attr|own|rating)-'
    and not exists (select 1 from public.tag_category_assignments a where a.tag_id = t.id)
  order by coalesce(t.usage_count, 0) desc
  limit greatest(p_limit, 0);
$fn$;

create or replace function public.tag_vocabulary_health()
returns jsonb
language sql stable security definer
set search_path = public, cron
as $fn$
  select jsonb_build_object(
    'plural_pairs_open',   (select count(*) from public.tag_plural_pairs(500)),
    'plural_merges_total', (select count(*) from public.tag_merge_audit
                             where source = 'auto:plural' and not is_reversed),
    'plural_merges_7d',    (select count(*) from public.tag_merge_audit
                             where source = 'auto:plural' and not is_reversed
                               and created_at > now() - interval '7 days'),
    'plural_exclusions',   (select count(*) from public.tag_plural_exclusions),
    'slug_corrupt',        (select count(*) from public.unified_tags
                             where status <> 'merged'
                               and name ~ '[^\x00-\x7F]'
                               and slug <> public.normalize_tag_slug(name)),
    'non_ascii_active',    (select count(*) from public.unified_tags
                             where status = 'active' and name ~ '[^\x00-\x7F]'),
    'uncategorized_active',(select count(*) from public.tags_without_category(100000)),
    'legacy_category_values', (select count(distinct category) from public.unified_tags
                                where category is not null
                                  and category not in (select name from public.tag_categories)),
    -- Aliases that shadow a different live tag. Guarded by
    -- trg_tag_alias_reject_shadow, so a non-zero value means the guard was
    -- bypassed or dropped.
    'shadowing_aliases',   (select count(*) from public.tag_aliases a
                             join public.unified_tags t on t.id = a.canonical_tag_id
                             join public.unified_tags u
                               on lower(u.slug) = lower(a.alias_slug) and u.status = 'active'
                            where u.id <> t.id),
    -- Pending merge proposals whose stored lexical_variant flag no longer
    -- matches the current predicate. run_tag_auto_merge re-checks at merge
    -- time, so this is an observability signal rather than a live hazard.
    'stale_lexical_flags', (select count(*) from public.tag_merge_review r
                             join public.unified_tags c on c.id = r.canonical_id
                             join public.unified_tags d on d.id = r.duplicate_id
                            where r.status = 'pending' and r.lexical_variant
                              and not public.tag_slugs_are_variants(c.slug, d.slug)),
    'merge_review_pending', (select count(*) from public.tag_merge_review where status = 'pending'),
    'plural_cron_last_success', (select max(d.start_time) from cron.job j
                                   join cron.job_run_details d on d.jobid = j.jobid
                                  where j.jobname = 'tag_plural_merge' and d.status = 'succeeded')
  );
$fn$;

revoke all on function public.tag_vocabulary_health() from public;
grant execute on function public.tag_vocabulary_health() to authenticated, service_role;
grant execute on function public.tags_without_category(int) to service_role, authenticated;
