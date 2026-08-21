-- Milestones data-quality audit — baseline snapshot (2026, milestones-data-quality
-- remediation). Read-only. Run before/after each remediation phase and diff the
-- output to verify each phase changed exactly what it claimed to and nothing else.
--
-- Scope: all live (non-duplicate) milestones, i.e. duplicate_of_id is null.

-- 1. Top-line completeness counts.
select
  count(*) as total,
  count(*) filter (where description is null or description = '') as no_description,
  count(*) filter (where category is null) as no_category,
  count(*) filter (where category = 'other') as category_other,
  count(*) filter (where image_url is null) as no_image,
  count(*) filter (where city_id is null) as no_city_id,
  count(*) filter (where country_id is null) as no_country_id,
  count(*) filter (where city_name is not null and city_id is null) as city_name_unlinked,
  count(*) filter (where country_name is not null and country_name <> '' and country_id is null) as country_name_unlinked,
  count(*) filter (where jsonb_array_length(sources) = 0) as no_sources,
  count(*) filter (where cardinality(tags) = 0) as no_tags,
  count(*) filter (where quality_score is null) as no_quality_score,
  count(*) filter (where review_status = 'pending') as pending_review,
  count(*) filter (where status <> 'published') as not_published,
  count(*) filter (where seo_indexable = false) as not_indexable,
  count(*) filter (where date > current_date) as future_dated,
  count(*) filter (where date_end is not null and date_end < date) as end_before_start,
  count(*) filter (where field_provenance = '{}'::jsonb) as no_provenance
from public.milestones
where duplicate_of_id is null;

-- 2. Category / impact / significance / date-precision / status distributions.
select 'category' as dim, coalesce(category, '∅') as val, count(*) as n
  from public.milestones where duplicate_of_id is null group by category
union all
select 'impact', coalesce(impact, '∅'), count(*)
  from public.milestones where duplicate_of_id is null group by impact
union all
select 'significance', significance::text, count(*)
  from public.milestones where duplicate_of_id is null group by significance
union all
select 'date_precision', date_precision, count(*)
  from public.milestones where duplicate_of_id is null group by date_precision
union all
select 'status', status, count(*)
  from public.milestones where duplicate_of_id is null group by status
union all
select 'review_status', review_status, count(*)
  from public.milestones where duplicate_of_id is null group by review_status
order by dim, n desc;

-- 3. seo_indexable × status × review_status cross-tab (the inversion check).
select status, review_status, seo_indexable, count(*)
from public.milestones
where duplicate_of_id is null
group by 1, 2, 3
order by 4 desc;

-- 4. Entity-linking coverage.
select
  (select count(*) from public.milestones where duplicate_of_id is null) as total_milestones,
  (select count(distinct milestone_id) from public.milestone_links) as milestones_with_links,
  (select count(*) from public.milestone_links) as total_links,
  (select count(*) from public.milestone_link_proposals) as total_proposals,
  (select count(*) from public.milestone_link_proposals where status = 'pending') as pending_proposals;

-- 5. Duplicate-merge state.
select
  (select count(*) from public.milestones) as total_all_rows,
  (select count(*) from public.milestones where duplicate_of_id is not null) as marked_dup,
  (select count(*) from public.milestones m
     where m.duplicate_of_id is not null
       and not exists (select 1 from public.milestones k where k.id = m.duplicate_of_id)) as orphan_dup_ref,
  (select count(*) from public.dedup_review_queue where entity_type = 'milestone' and status = 'open') as open_dedup_review_rows;
