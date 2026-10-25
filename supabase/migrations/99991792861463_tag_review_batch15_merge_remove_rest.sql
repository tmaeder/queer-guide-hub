-- Excel review queue 2026-10-23, batch 15: the 92 "Merge / remove" rows batch 11 left for a person.
-- Calls made under the rules the person set for batches 11-14 (2026-10-24).
--
--   * 8 merges into an existing tag that already carries the concept:
--     test -> hiv-testing (its 86 events are "Tests auf HIV/STIs"), village -> gay-village,
--     gay-rights -> lgbtqia-rights, switchboard -> lgbtq-helpline, embassy-suites -> hotel,
--     playstation -> gaming, body-autonomy -> bodily-integrity,
--     lesbians-lesbians-of-color -> lesbians-of-color.
--   * 43 place-only tags in use (us-venue, london-based, zurich-venue ...) are deprecated
--     and their assignments deleted: a venue's own location data already says where it is,
--     the same rule batch 11 applied to place+type tags.
--   * 24 generic tags whose uses are word matches on unrelated items (plum = a product
--     colour, notre-dame = college football news, buns = menus, sauna-club = a heterosexual FKK
--     club ...) are deprecated and their assignments deleted. Deprecation also stops the
--     nightly reconcile re-adding them, because it only resolves active tags.
--   * prenzlauer is renamed "Prenzlauer Berg" (the slug does not move). prejudice keeps its
--     "Racial Prejudice" title: another tag already holds the name "Prejudice".
--   * Kept and closed: news-pride, begine, sonntags-club, italian, mexican, irish, peruvian,
--     thai, academic-institution, united-kingdom, sint-maarten, social-security, sage.
--   * Left pending: charite and mavie-horbiger, which other tags are merged into.
--   * Tags that are a merge target are never deprecated here.

select set_config('app.actor', 'migration:99991792861463_tag_review_batch15_merge_remove_rest', true);

create temp table _b15_pairs on commit drop as
select s.id as src_id, t.id as tgt_id, r.src, r.tgt
from (values
('test','hiv-testing'),
('village','gay-village'),
('gay-rights','lgbtqia-rights'),
('switchboard','lgbtq-helpline'),
('embassy-suites','hotel'),
('playstation','gaming'),
('body-autonomy','bodily-integrity'),
('lesbians-lesbians-of-color','lesbians-of-color')
) r(src, tgt)
join public.unified_tags s on s.slug = r.src and s.status = 'active'
join public.unified_tags t on t.slug = r.tgt and t.status = 'active'
where not exists (select 1 from public.tag_relationship_exclusions e
                  where e.tag1_id = least(s.id, t.id) and e.tag2_id = greatest(s.id, t.id));

do $merge$
declare r record;
begin
  for r in select * from _b15_pairs loop
    begin
      update public.tag_category_assignments set is_primary = false where tag_id = r.src_id and is_primary;
      perform public.merge_tag_concept(r.tgt_id, r.src_id, 'migration:99991792861463', 'excel-review-batch15-2026-10-23');
      delete from public.tag_aliases a using public.unified_tags c
       where a.canonical_tag_id = r.src_id and c.id = r.tgt_id
         and lower(btrim(a.alias_name)) = lower(btrim(c.name));
      update public.tag_aliases set canonical_tag_id = r.tgt_id where canonical_tag_id = r.src_id;
      update public.unified_tags set merged_into_id = r.tgt_id
       where merged_into_id = r.src_id and status = 'merged' and id <> r.tgt_id;
    exception when others then
      raise notice 'batch15 merge skipped % -> %: %', r.src, r.tgt, sqlerrm;
    end;
  end loop;
end
$merge$;

create temp table _b15_dep on commit drop as
select t.id, t.slug,
       case when t.slug = any (array['amsterdam-based', 'aptos-address', 'australian-business', 'baja-california-spot', 'bandung-establishment', 'brisbane-venue', 'budapest-venue', 'caledonia-venue', 'california-venue', 'cambridge-venue', 'charleston-spot', 'emporia-establishment', 'fortaleza-location', 'german-based', 'highbury-location', 'indianapolis-scene', 'istanbul-venue', 'italian-venue', 'japanese-venue', 'london-based', 'london-venue', 'maspalomas-venue', 'moda-istanbul', 'moers-based', 'netherlands-based', 'norfolk-based', 'norway-based', 'osaka-establishment', 'polish-venue', 'russia-venue', 'scottish-venue', 'shibuya-venue', 'shinjuku-location', 'spanish-venue', 'sydney-venue', 'texas-venue', 'tirol-based', 'tokyo-spot', 'uk-based', 'uk-venue', 'us-venue', 'watsonville-location', 'zurich-venue'])
            then 'place-only tag; the venue location data already says where it is'
            else 'generic tag whose uses were word matches on unrelated items' end as why
from public.unified_tags t
where t.slug = any (array['amsterdam-based', 'aptos-address', 'australian-business', 'baja-california-spot', 'bandung-establishment', 'brisbane-venue', 'budapest-venue', 'caledonia-venue', 'california-venue', 'cambridge-venue', 'charleston-spot', 'emporia-establishment', 'fortaleza-location', 'german-based', 'highbury-location', 'indianapolis-scene', 'istanbul-venue', 'italian-venue', 'japanese-venue', 'london-based', 'london-venue', 'maspalomas-venue', 'moda-istanbul', 'moers-based', 'netherlands-based', 'norfolk-based', 'norway-based', 'osaka-establishment', 'polish-venue', 'russia-venue', 'scottish-venue', 'shibuya-venue', 'shinjuku-location', 'spanish-venue', 'sydney-venue', 'texas-venue', 'tirol-based', 'tokyo-spot', 'uk-based', 'uk-venue', 'us-venue', 'watsonville-location', 'zurich-venue', 'brasilian', 'koch', 'plum', 'buns', 'investment', 'electronics', 'notre-dame', 'cactus', 'bullring', 'universalism', 'updates', 'hauptbahnhof', 'platinum-mall', 'outdoor-terrazas', 'muscle', 'altruism', 'global-action', 'banking', 'homophonic', 'not-applicable', 'patience', 'post-office', 'repair-service', 'sauna-club'])
  and t.status = 'active'
  and not exists (select 1 from public.unified_tags m where m.merged_into_id = t.id);

delete from public.unified_tag_assignments a using _b15_dep d where a.tag_id = d.id;

update public.unified_tags t
   set status = 'deprecated', deprecated_at = now(), seo_indexable = false, usage_count = 0,
       deprecation_reason = 'Review queue 2026-10-23: ' || d.why
  from _b15_dep d where t.id = d.id;

update public.unified_tags set name = 'Prenzlauer Berg'
 where slug = 'prenzlauer' and status = 'active'
   and not exists (select 1 from public.unified_tags x where lower(x.name) = 'prenzlauer berg' and x.slug <> 'prenzlauer');

update public.tag_suggestions g
   set status = 'rejected', reviewed_at = now(),
       metadata = coalesce(g.metadata, '{}'::jsonb) || jsonb_build_object(
         'resolution',
           case when d.id is not null then 'deprecated: ' || d.why
                when t.status = 'merged' then 'merged into ' || (select slug from public.unified_tags m where m.id = t.merged_into_id)
                else 'checked: kept' end,
         'resolved_by', 'migration:99991792861463')
  from public.unified_tags t
  left join _b15_dep d on d.id = t.id
 where g.entity_id = t.id and g.entity_type = 'tag'
   and g.source = 'excel_review_2026_10_23' and g.status = 'pending'
   and g.metadata->>'review_type' = 'Merge / remove'
   and (d.id is not null
        or (t.status = 'merged' and t.slug = any (array['test', 'village', 'gay-rights', 'switchboard', 'embassy-suites', 'playstation', 'body-autonomy', 'lesbians-lesbians-of-color']))
        or t.slug = any (array['news-pride', 'begine', 'sonntags-club', 'italian', 'mexican', 'irish', 'peruvian', 'thai', 'academic-institution', 'united-kingdom', 'sint-maarten', 'social-security', 'sage', 'prenzlauer', 'prejudice']));

do $verify$
declare v_bad int;
begin
  if (select count(*) from _b15_dep) < 50 then
    raise exception 'batch15: only % tags qualified for deprecation', (select count(*) from _b15_dep);
  end if;
  select count(*) into v_bad from _b15_dep d join public.unified_tags t on t.id = d.id
   where t.status <> 'deprecated' or t.seo_indexable;
  if v_bad <> 0 then raise exception 'batch15: % tags not cleanly deprecated', v_bad; end if;
  select count(*) into v_bad from public.unified_tag_assignments a join _b15_dep d on d.id = a.tag_id;
  if v_bad <> 0 then raise exception 'batch15: % assignments left on deprecated tags', v_bad; end if;
  select count(*) into v_bad from public.unified_tags s join public.unified_tags t on t.id = s.merged_into_id
   where s.slug = any (array['test', 'village', 'gay-rights', 'switchboard', 'embassy-suites', 'playstation', 'body-autonomy', 'lesbians-lesbians-of-color']) and t.status <> 'active';
  if v_bad <> 0 then raise exception 'batch15: % merges point at a non-active tag', v_bad; end if;
  select count(*) into v_bad from public.unified_tags a join public.unified_tags b on b.id = a.merged_into_id
   where a.status = 'merged' and b.status = 'merged';
  if v_bad <> 0 then raise exception 'batch15: % merged-to-merged chains', v_bad; end if;
end
$verify$;
