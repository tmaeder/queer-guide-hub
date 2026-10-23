
-- Excel review queue 2026-10-23, batch 6: the "hedged" merge rows, whose note said
-- "likely", "possibly" or "consider merging". Each pair was read on prod, both sides'
-- descriptions and, where usage made it matter, samples of the tagged content.
--
--   * 34 merges. Direction follows the note except where usage or the
--     concept says otherwise: drag-queen-drag-king and drag-queen-king go into drag,
--     and unsure goes to questioning-sexuality-and-gender, where batch 1 merges
--     questioning. Aliases and earlier merges are repointed to the new canonical.
--   * postbeamt ("Postal worker", filed under Venue Types) is renamed postal-worker
--     and moved to Work, School & Institutions.
--   * horse is NOT the spanking horse: its 59 uses are Cherrykitten horse-print merch.
--     Its description and category are corrected to a print motif, as batch 2 did for
--     goose, tiger and spider.
--   * club-ever and meantime are deprecated (unclear names, no usage).
--   * Kept separate, inbox rows closed: primal-huntress (a gendered role variant,
--     like its siblings), platoniromantic (a different identity from quoiromantic),
--     viagra (brand rows are kept beside the generic, as cialis and levitra are).
--
-- Left for a person: village (39 uses, mixed: Manchester Gay Village news, venues and
-- an unrelated meditation group) and updates (one news post, no clear meaning).

select set_config('app.actor', 'migration:99991792791785_tag_review_batch6_hedged_merges', true);

select setval('public.tag_slug_redirects_id_seq',
              greatest((select coalesce(max(id), 1) from public.tag_slug_redirects),
                       (select last_value from public.tag_slug_redirects_id_seq)));

create temp table _b6_pairs on commit drop as
select r.src, r.tgt, s.id as src_id, t.id as tgt_id
from (values ('puppy','pup'), ('flint','flinta'), ('young-butch','butch'), ('unsure','questioning-sexuality-and-gender'), ('pregnant','pregnancy-fetish'), ('masterslave-dynamics','m-s-master-slave'), ('drag-queen-drag-king','drag'), ('drag-queen-king','drag'), ('coping-mechanisms','coping-strategies'), ('csd-related','csd'), ('lgbtq-refugees','lgbtqia-refugee-rights'), ('queer-advocacy','lgbtq-advocacy'), ('kolkata-cuisine','indian-cuisine'), ('suspension-bondage','suspension'), ('apetizers','dining-and-drinking'), ('summer-lunch','dining-and-drinking'), ('asphyxiaphilia-play','breath-play'), ('baths','bathhouse'), ('berlin-taste','berlin-themed'), ('bottom-drop','sub-drop'), ('breeding-play','breeding'), ('chest-reconstruction-surgery','top-surgery'), ('cultural-misappropriation','cultural-appropriation'), ('fuck-blow-sandwich','spit-roast'), ('gender-dysphoria-treatment','gender-affirming-care'), ('mummifier','mummification-top'), ('nudist-parenting','nudist-family'), ('nudist-travel-guide','nudist-travel'), ('nylonlegs-and-feet','nylon-fetish'), ('regimes-of-truth-power','regimes-of-truth'), ('sauna-bathhouse','sauna'), ('tattooed','tattoos'), ('third-gender-identity','third-gender'), ('vers','versatile')) r(src, tgt)
join public.unified_tags s on s.slug = r.src and s.status = 'active'
join public.unified_tags t on t.slug = r.tgt and t.status = 'active'
where not exists (select 1 from public.tag_relationship_exclusions e
                  where e.tag1_id = least(s.id, t.id) and e.tag2_id = greatest(s.id, t.id));

create temp table _b6_done (src_id uuid, tgt_id uuid, src text, audit_id uuid) on commit drop;

do $merge$
declare r record; v_audit uuid;
begin
  for r in select * from _b6_pairs order by src loop
    begin
      update public.tag_category_assignments set is_primary = false where tag_id = r.src_id and is_primary;
      v_audit := public.merge_tag_concept(r.tgt_id, r.src_id, 'migration:99991792791785', 'excel-review-batch6-2026-10-23');
      execute 'delete from public.tag_aliases a using public.unified_tags c
       where a.canonical_tag_id = $1 and c.id = $2
         and lower(btrim(a.alias_name)) = lower(btrim(c.name))' using r.src_id, r.tgt_id;
      update public.tag_aliases set canonical_tag_id = r.tgt_id where canonical_tag_id = r.src_id;
      update public.unified_tags set merged_into_id = r.tgt_id
       where merged_into_id = r.src_id and status = 'merged' and id <> r.tgt_id;
      insert into _b6_done values (r.src_id, r.tgt_id, r.src, v_audit);
    exception when others then
      raise notice 'batch6 merge skipped % -> %: %', r.src, r.tgt, sqlerrm;
    end;
  end loop;
end
$merge$;

create temp table _b6_ren (old_slug text primary key, new_slug text not null) on commit drop;
insert into _b6_ren values
('postbeamt','postal-worker');

create temp table _b6_ren_ok on commit drop as
select t.id, r.old_slug, r.new_slug
from _b6_ren r join public.unified_tags t on t.slug = r.old_slug and t.status = 'active'
where not exists (select 1 from public.unified_tags x where x.slug = r.new_slug)
  and not exists (select 1 from public.tag_aliases a where a.alias_slug = r.new_slug)
  and not exists (select 1 from public.tag_slug_redirects d where d.old_slug = r.new_slug);

update public.unified_tags t set slug = o.new_slug from _b6_ren_ok o where t.id = o.id;

create temp table _b6_fix (slug text primary key, sd text, d text, new_cat text) on commit drop;
insert into _b6_fix values
('horse', 'Horse motif or print', 'Horse and pony imagery on clothing, accessories and pride merchandise.', 'Expression & Style'),
('postal-worker', 'Postal worker', 'People who work for a postal service.', 'Work, School & Institutions');

create temp table _b6_fix_old on commit drop as
select t.id, f.slug, t.category_id as old_cat, nc.id as new_cat_id
from _b6_fix f join public.unified_tags t on t.slug = f.slug and t.status = 'active'
left join public.tag_categories nc on nc.name = f.new_cat;

update public.unified_tags t set short_description = f.sd, description = f.d, long_description = null
  from _b6_fix f where t.slug = f.slug and t.status = 'active';

update public.unified_tags t set category_id = o.new_cat_id
  from _b6_fix_old o where t.id = o.id and o.new_cat_id is not null and t.category_id is distinct from o.new_cat_id;

delete from public.tag_category_assignments j
 using _b6_fix_old o
 where j.tag_id = o.id and o.new_cat_id is not null
   and j.category_id = o.old_cat and o.old_cat is distinct from o.new_cat_id
   and not j.is_primary;

create temp table _b6_dep (slug text primary key) on commit drop;
insert into _b6_dep values
('club-ever'),
('meantime');

create temp table _b6_dep_ok on commit drop as
select t.id, t.slug from _b6_dep d join public.unified_tags t on t.slug = d.slug
where t.status = 'active' and t.usage_count = 0 and not t.human_reviewed;

update public.unified_tags t
   set status = 'deprecated', deprecated_at = now(), seo_indexable = false,
       deprecation_reason = 'Review queue 2026-10-23: out of scope (menu item, name-only stub or run-together heading), no usage'
  from _b6_dep_ok o where t.id = o.id;

create temp table _b6_close (id uuid primary key, resolution text) on commit drop;
insert into _b6_close
select d.src_id, 'merged into ' || (select slug from public.unified_tags where id = d.tgt_id) from _b6_done d
union select id, 'slug renamed from ' || old_slug || ' to ' || new_slug from _b6_ren_ok
union select id, 'deprecated: out of scope, no usage' from _b6_dep_ok
union select id, 'description and category corrected against tagged content' from _b6_fix_old
 where id not in (select id from _b6_ren_ok)
union select t.id, 'kept separate: a distinct concept, not a duplicate' from public.unified_tags t
 where t.status = 'active' and t.slug = any (array['primal-huntress','platoniromantic','viagra']);

update public.tag_suggestions g
   set status = 'rejected', reviewed_at = now(),
       metadata = coalesce(g.metadata, '{}'::jsonb) || jsonb_build_object(
         'resolution', c.resolution, 'resolved_by', 'migration:99991792791785')
  from _b6_close c
 where g.entity_id = c.id and g.entity_type = 'tag'
   and g.source = 'excel_review_2026_10_23' and g.status = 'pending';

-- Collapse merge chains (a merged tag whose target is itself merged).
-- merge_tag_concept does not repoint earlier merges onto the new canonical, so
-- 99991792781503 left 12 such chains, which tag_merge_graph_signals() counts as
-- target_merged (a zero-invariant). Repoint each to its terminal canonical.
do $collapse$
declare n int;
begin
  loop
    update public.unified_tags m set merged_into_id = t.merged_into_id
      from public.unified_tags t
     where t.id = m.merged_into_id and m.status = 'merged' and t.status = 'merged'
       and t.merged_into_id is not null and t.merged_into_id <> m.id;
    get diagnostics n = row_count;
    exit when n = 0;
  end loop;
end
$collapse$;

do $verify$
declare v_n int; v_bad int;
begin
  select count(*) into v_n from _b6_done;
  if v_n < 28 then raise exception 'batch6: only % of 34 merges landed; the corpus has drifted', v_n; end if;
  select count(*) into v_bad from _b6_pairs p join public.unified_tags s on s.id = p.src_id
   where s.status <> 'merged' or s.merged_into_id is distinct from p.tgt_id;
  if v_bad <> 0 then raise exception 'batch6: % merges did not land', v_bad; end if;
  select count(*) into v_bad from _b6_done d join public.tag_aliases a on a.canonical_tag_id = d.src_id;
  if v_bad <> 0 then raise exception 'batch6: % aliases still point at a merged source', v_bad; end if;
  select count(*) into v_bad from _b6_done d join public.unified_tags m on m.merged_into_id = d.src_id;
  if v_bad <> 0 then raise exception 'batch6: % older merges still point at a merged source', v_bad; end if;
  select count(*) into v_bad from public.unified_tags m join public.unified_tags t on t.id = m.merged_into_id
   where m.status = 'merged' and t.status = 'merged';
  if v_bad <> 0 then raise exception 'batch6: % merged tags still point at a merged tag', v_bad; end if;

  select count(*) into v_n from _b6_ren_ok;
  if v_n < 1 then raise exception 'batch6: only % of 1 renames were possible; the corpus has drifted', v_n; end if;
  select count(*) into v_bad from _b6_ren_ok o join public.unified_tags t on t.id = o.id where t.slug <> o.new_slug;
  if v_bad <> 0 then raise exception 'batch6: % renames did not land', v_bad; end if;
  select count(*) into v_bad from _b6_ren_ok o
   where not exists (select 1 from public.tag_slug_redirects r where r.old_slug = o.old_slug and r.tag_id = o.id);
  if v_bad <> 0 then raise exception 'batch6: % renames minted no redirect', v_bad; end if;

  select count(*) into v_bad from _b6_fix f join public.unified_tags t on t.slug = f.slug and t.status = 'active'
   join public.tag_categories c on c.name = f.new_cat
   where t.short_description is distinct from f.sd or t.category_id is distinct from c.id or t.category is distinct from f.new_cat
      or not exists (select 1 from public.tag_category_assignments j where j.tag_id = t.id and j.category_id = c.id and j.is_primary);
  if v_bad <> 0 then raise exception 'batch6: % description/category fixes are incomplete', v_bad; end if;
  select count(*) into v_bad from _b6_dep_ok o join public.unified_tags t on t.id = o.id where t.status <> 'deprecated';
  if v_bad <> 0 then raise exception 'batch6: % rows were not deprecated', v_bad; end if;

  select count(*) into v_bad from _b6_close c join public.tag_suggestions g
      on g.entity_id = c.id and g.source = 'excel_review_2026_10_23'
   where g.status = 'pending';
  if v_bad <> 0 then raise exception 'batch6: % inbox rows are still pending', v_bad; end if;
end
$verify$;
