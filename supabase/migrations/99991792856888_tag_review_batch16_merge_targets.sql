-- Excel review queue 2026-10-23, batch 16: the 7 rows earlier batches skipped because other
-- tags are merged into them. Decided by a person on 2026-10-24 under the same rules as
-- batches 13-15.
--
--   * Deprecated (all unused, no assignments):
--       anthropologist, clown, conductor  - kink personas whose meaning was inferred;
--       attila-horbiger, jan-mikolasek    - person tags with no LGBTQ+ link found;
--       charite, mavie-horbiger           - out of scope for the glossary.
--   * The tags merged into them stay merged. Each is a lossy-slug twin (attila-h-rbiger,
--     charit, jan-mikol-ek, mavie-h-rbiger) or a translation/plural (anthropologe, clowns,
--     dirigent), all unused. Withdrawing those merges would leave the lossy slugs active or
--     deprecated-but-unmerged and break the slug_diacritic_lossy zero-invariant
--     (51500101145000). The cost is a warn-only rise in
--     tag_merge_graph_signals().target_deprecated.

select set_config('app.actor', 'migration:99991792856888_tag_review_batch16_merge_targets', true);

create temp table _b16_dep on commit drop as
select t.id, t.slug,
       case when t.slug in ('anthropologist','clown','conductor')
              then 'unused, and its meaning was inferred rather than sourced'
            when t.slug in ('attila-horbiger','jan-mikolasek')
              then 'unused person tag with no identified LGBTQ+ link'
            else 'unused and out of scope for the glossary' end as why
from public.unified_tags t
where t.slug in ('anthropologist','clown','conductor','attila-horbiger','jan-mikolasek','charite','mavie-horbiger')
  and t.status = 'active'
  and coalesce(t.usage_count, 0) = 0
  and not exists (select 1 from public.unified_tag_assignments a where a.tag_id = t.id);

update public.unified_tags t
   set status = 'deprecated', deprecated_at = now(), seo_indexable = false,
       deprecation_reason = 'Review queue 2026-10-23: ' || d.why
  from _b16_dep d where t.id = d.id;

update public.tag_suggestions g
   set status = 'rejected', reviewed_at = now(),
       metadata = coalesce(g.metadata, '{}'::jsonb) || jsonb_build_object(
         'resolution', 'deprecated: ' || d.why, 'resolved_by', 'migration:99991792856888')
  from _b16_dep d
 where g.entity_id = d.id and g.entity_type = 'tag'
   and g.source = 'excel_review_2026_10_23' and g.status = 'pending';

do $verify$
declare v_bad int;
begin
  select count(*) into v_bad from _b16_dep d join public.unified_tags t on t.id = d.id
   where t.status <> 'deprecated' or t.seo_indexable;
  if v_bad <> 0 then raise exception 'batch16: % tags not cleanly deprecated', v_bad; end if;

  select count(*) into v_bad from _b16_dep d join public.tag_suggestions g on g.entity_id = d.id
   where g.source = 'excel_review_2026_10_23' and g.status = 'pending';
  if v_bad <> 0 then raise exception 'batch16: % rows still pending', v_bad; end if;

  -- the merged-in twins must still be merged, or the lossy slugs resurface
  select count(*) into v_bad from public.unified_tags c join _b16_dep d on d.id = c.merged_into_id
   where c.status <> 'merged';
  if v_bad <> 0 then raise exception 'batch16: % merged twins were unmerged', v_bad; end if;
end
$verify$;
