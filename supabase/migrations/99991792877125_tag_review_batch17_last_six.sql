-- Excel review queue 2026-10-23, batch 17: the last six pending rows. Batches 12 and 15 left
-- them because each is either a merge target or needed a fact checked first.
--
--   * Deprecated, assignments deleted:
--       us-venue, spanish-venue - place-only tags (batch 15's rule: a venue's own location
--                                 data already says where it is). Skipped there because
--                                 us-venues / spanish-establishment are merged into them.
--       international           - too generic to describe anything; its 33 uses are word
--                                 matches on news and venues.
--   * Deprecated, unused: ulrike-roseberg - person tag with no LGBTQ+ link found.
--   * The merged-in twins (us-venues, spanish-establishment, ulrike-r-seberg) stay merged,
--     as in batch 16: ulrike-r-seberg is a lossy-slug twin (slug_diacritic_lossy
--     zero-invariant) and the other two are unused plurals/variants. Cost: a warn-only rise
--     in tag_merge_graph_signals().target_deprecated.
--   * Facts checked and corrected (Wikipedia, checked 2026-10-24):
--       international-fetish-day - began in the UK as National Fetish Day in 2008, first
--                                  international edition 2009, held in mid-January.
--       ro-ann-mohammed          - grew up in Trinidad (birthplace not sourced), co-founded
--                                  B-GLAD in 2012.

select set_config('app.actor', 'migration:99991792877125_tag_review_batch17_last_six', true);

create temp table _b17_dep on commit drop as
select t.id, t.slug,
       case when t.slug in ('us-venue','spanish-venue')
              then 'place-only tag; the venue''s location data already says where it is'
            when t.slug = 'international'
              then 'too generic to describe anything; its uses were word matches'
            else 'unused person tag with no identified LGBTQ+ link' end as why
from public.unified_tags t
where t.slug in ('us-venue','spanish-venue','international','ulrike-roseberg')
  and t.status = 'active';

delete from public.unified_tag_assignments a using _b17_dep d where a.tag_id = d.id;

update public.unified_tags t
   set status = 'deprecated', deprecated_at = now(), seo_indexable = false, usage_count = 0,
       deprecation_reason = 'Review queue 2026-10-23: ' || d.why
  from _b17_dep d where t.id = d.id;

update public.unified_tags
   set description = 'An annual day of visibility and support for fetish and BDSM communities, held in mid-January. It began in the UK as National Fetish Day in 2008 and was first held internationally in 2009.'
 where slug = 'international-fetish-day' and status = 'active'
   and description = 'An annual day of visibility and support for fetish and BDSM communities, held in January.';

update public.unified_tags
   set description = 'Human rights activist who grew up in Trinidad and in 2012 co-founded B-GLAD (Barbados – Gays, Lesbians and All-Sexuals against Discrimination).'
 where slug = 'ro-ann-mohammed' and status = 'active'
   and description = 'Trinidad-born human rights activist based in Barbados, co-founder of the LGBTQ+ advocacy group B-GLAD.';

update public.tag_suggestions g
   set status = 'rejected', reviewed_at = now(),
       metadata = coalesce(g.metadata, '{}'::jsonb) || jsonb_build_object(
         'resolution', coalesce('deprecated: ' || d.why, 'checked: facts verified and corrected'),
         'resolved_by', 'migration:99991792877125')
  from public.unified_tags t
  left join _b17_dep d on d.id = t.id
 where g.entity_id = t.id and g.entity_type = 'tag'
   and g.source = 'excel_review_2026_10_23' and g.status = 'pending'
   and t.slug in ('us-venue','spanish-venue','international','ulrike-roseberg',
                  'international-fetish-day','ro-ann-mohammed');

do $verify$
declare v_bad int;
begin
  select count(*) into v_bad from public.unified_tags
   where slug in ('us-venue','spanish-venue','international','ulrike-roseberg')
     and (status <> 'deprecated' or seo_indexable);
  if v_bad <> 0 then raise exception 'batch17: % tags not cleanly deprecated', v_bad; end if;

  select count(*) into v_bad from public.unified_tag_assignments a join _b17_dep d on d.id = a.tag_id;
  if v_bad <> 0 then raise exception 'batch17: % assignments left on deprecated tags', v_bad; end if;

  select count(*) into v_bad from public.unified_tags c join _b17_dep d on d.id = c.merged_into_id
   where c.status <> 'merged';
  if v_bad <> 0 then raise exception 'batch17: % merged twins were unmerged', v_bad; end if;

  select count(*) into v_bad from public.unified_tags
   where (slug = 'ro-ann-mohammed' and description like 'Trinidad-born%')
      or (slug = 'international-fetish-day' and description not like '%2008%');
  if v_bad <> 0 then raise exception 'batch17: % fact corrections did not land', v_bad; end if;

  select count(*) into v_bad from public.tag_suggestions g join public.unified_tags t on t.id = g.entity_id
   where g.source = 'excel_review_2026_10_23' and g.status = 'pending'
     and t.slug in ('us-venue','spanish-venue','international','ulrike-roseberg',
                    'international-fetish-day','ro-ann-mohammed');
  if v_bad <> 0 then raise exception 'batch17: % review rows still pending', v_bad; end if;
end
$verify$;
