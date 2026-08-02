-- slug_corrupt was defined as `slug <> normalize_tag_slug(name)` and reported
-- 82. Every one of them is fine:
--   mat-silver / vibe-gothic / occ-pride / intimate-edging  -- deliberate
--     marketplace + kink slug NAMESPACES; the slug is intentionally not derived
--     from the name.
--   amphetamines  <- "Amphetamines (E.G., Adderall)"        -- deliberately
--     shortened, readable slug.
-- The defect this metric exists to catch is transliteration LOSS: a name with
-- non-ASCII characters whose slug does not match what the current slugifier
-- would produce. Narrowed accordingly, so the number means something and a
-- non-zero value is actionable.
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
