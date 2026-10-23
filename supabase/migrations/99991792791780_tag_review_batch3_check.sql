-- Review-queue batch 3 (2026-10-23): "Check" rows from the Review Queue sheet of
-- queerguide-unified_tags-2026-10-23_cleaned.xlsx. Each asked whether the sense
-- the sheet chose is the one the tag is used for; where the tag has usage, the
-- tagged content (unified_tag_assignments) decides.
--
-- A. Six descriptions corrected against tagged content:
--    middle        all 3 uses are Gayhane, a Middle Eastern club night; it was an
--                  age-play persona under Fetishes, which put those events at 18+
--    niece         both uses are news about a politician's niece; it was a
--                  role-play term filed adult under Dynamics & Roles
--    burnout       general burnout (activism, drag, transition), not post-party
--                  exhaustion; moved to Mental Health
--    fit-adaptive  all 17 uses are photochromic eyewear, not adaptive clothing
--    design        fashion and costume design news, filed under Stays
--    massage       293 of 302 uses are massage products; text covered venues only
-- B. Three merges into an existing canonical: heirophilia -> hierophilia (spelling),
--    cunnlingus -> eating-pussy (where the already-merged cunnilingus points),
--    probably-seafood -> seafood (an import marker).
-- C. Two misspelt slugs renamed (an explicit slug write mints the redirect):
--    acrotomophillia -> acrotomophilia, s-anti-lgbt-movement-in-the-united-states
--    -> anti-lgbt-movement-in-the-united-states.
-- D. Three run-together headings deprecated (0 uses, not human-reviewed).
-- E. Inbox rows closed for A-D and for 21 tags whose chosen sense the tagged
--    content confirms.
--
-- Left for a person, deliberately: stud (96 of 98 uses are stud EARRINGS on the
-- Black-lesbian identity term -- fixing it means retagging products), positive
-- (31 positive-message stickers carry the HIV-positive tag), bts (K-pop jerseys),
-- every row asking to verify biographical dates or legal status, and the age-play
-- and other content-policy rows.

set local statement_timeout = '15min';
select set_config('app.actor', 'migration:99991792791780_tag_review_batch3_check', true);

select setval('public.tag_slug_redirects_id_seq',
              greatest((select coalesce(max(id), 1) from public.tag_slug_redirects),
                       (select last_value from public.tag_slug_redirects_id_seq)));

-- A. descriptions
create temp table _b3 (slug text primary key, sd text, d text, new_cat text, clear_long boolean) on commit drop;
insert into _b3 values
('middle', 'Middle Eastern', 'Middle Eastern music, culture and nights, such as club nights playing Arabic, Turkish and Persian music.', 'Culture & Community', true),
('niece', 'Niece', 'A daughter of a person''s sibling; used for news involving someone''s niece.', 'Relationships & Family', true),
('burnout', 'Burnout', 'Physical and emotional exhaustion from long-term stress, including the strain of activism, performing, caregiving or transition.', 'Mental Health', true),
('fit-adaptive', 'Light-adaptive lenses', 'Eyewear with photochromic lenses that darken in sunlight and clear indoors.', null, true),
('design', 'Design', 'Design work, including fashion, costume, interior and architectural design, and the people who do it.', 'Arts & Literature', true),
('massage', 'Massage, as a service or product', 'Massage as a service at spas, saunas and massage venues, and products for it, such as massage oils, candles and massage wands.', null, false);

create temp table _b3_old on commit drop as
select t.id, b.slug, t.category_id as old_cat, nc.id as new_cat_id
from _b3 b join public.unified_tags t on t.slug = b.slug and t.status = 'active'
left join public.tag_categories nc on nc.name = b.new_cat;

update public.unified_tags t
   set short_description = b.sd, description = b.d,
       long_description = case when b.clear_long then null else t.long_description end
  from _b3 b where t.slug = b.slug and t.status = 'active';

update public.unified_tags t set category_id = o.new_cat_id
  from _b3_old o
 where t.id = o.id and o.new_cat_id is not null and t.category_id is distinct from o.new_cat_id;

delete from public.tag_category_assignments j
 using _b3_old o
 where j.tag_id = o.id and o.new_cat_id is not null
   and j.category_id = o.old_cat and o.old_cat is distinct from o.new_cat_id
   and not j.is_primary;

-- B. merges
create temp table _b3_pairs on commit drop as
select r.src, r.tgt, s.id as src_id, t.id as tgt_id
from (values ('heirophilia','hierophilia'), ('cunnlingus','eating-pussy'),
             ('probably-seafood','seafood')) r(src, tgt)
join public.unified_tags s on s.slug = r.src and s.status = 'active'
join public.unified_tags t on t.slug = r.tgt and t.status = 'active'
where not exists (select 1 from public.tag_relationship_exclusions e
                  where e.tag1_id = least(s.id, t.id) and e.tag2_id = greatest(s.id, t.id));

create temp table _b3_done (src_id uuid, tgt_id uuid, src text, audit_id uuid) on commit drop;

do $merge$
declare r record; v_audit uuid;
begin
  for r in select * from _b3_pairs order by src loop
    begin
      update public.tag_category_assignments set is_primary = false where tag_id = r.src_id and is_primary;
      v_audit := public.merge_tag_concept(r.tgt_id, r.src_id, 'migration:99991792791780', 'excel-review-batch3-2026-10-23');
      delete from public.tag_aliases a using public.unified_tags c
       where a.canonical_tag_id = r.src_id and c.id = r.tgt_id
         and lower(btrim(a.alias_name)) = lower(btrim(c.name));
      update public.tag_aliases set canonical_tag_id = r.tgt_id where canonical_tag_id = r.src_id;
      update public.unified_tags set merged_into_id = r.tgt_id
       where merged_into_id = r.src_id and status = 'merged' and id <> r.tgt_id;
      insert into _b3_done values (r.src_id, r.tgt_id, r.src, v_audit);
    exception when others then
      raise notice 'batch3 merge skipped % -> %: %', r.src, r.tgt, sqlerrm;
    end;
  end loop;
end
$merge$;

-- C. slug renames (only when the corrected slug is free)
update public.unified_tags t set slug = r.new_slug
  from (values ('acrotomophillia','acrotomophilia'),
               ('s-anti-lgbt-movement-in-the-united-states','anti-lgbt-movement-in-the-united-states')) r(old_slug, new_slug)
 where t.slug = r.old_slug and t.status = 'active'
   and not exists (select 1 from public.unified_tags x where x.slug = r.new_slug)
   and not exists (select 1 from public.tag_aliases a where a.alias_slug = r.new_slug);

-- D. run-together headings
update public.unified_tags t
   set status = 'deprecated', deprecated_at = now(), seo_indexable = false,
       deprecation_reason = 'Review queue 2026-10-23: run-together heading with no usage'
 where t.slug in ('lgbtq-centers-characters','lgbtq-cruises-cultural-heritage','lesbian-movement-parents-etc')
   and t.status = 'active' and t.usage_count = 0 and not t.human_reviewed;

-- E. close the inbox rows (by tag id, so a renamed or merged tag still matches)
create temp table _b3_close (id uuid primary key, resolution text) on commit drop;
insert into _b3_close
select o.id, 'description corrected against tagged content' from _b3_old o
union select d.src_id, 'merged into ' || (select slug from public.unified_tags where id = d.tgt_id) from _b3_done d
union select t.id, 'slug corrected' from public.unified_tags t
 where t.slug in ('acrotomophilia','anti-lgbt-movement-in-the-united-states')
union select t.id, 'deprecated: run-together heading' from public.unified_tags t
 where t.slug in ('lgbtq-centers-characters','lgbtq-cruises-cultural-heritage','lesbian-movement-parents-etc')
union select t.id, 'chosen sense confirmed against tagged content' from public.unified_tags t
 where t.status = 'active' and t.slug = any (array[
  'genre-romance','food','club','meeting','lgbtq-club','photography','chastity','tour',
  'cruise','wrestling','resistance','punk','euphoria','infidelity','cultural-event',
  'mexican-bar','makeup','greek','breastfeeding','slavery','amazons','genealogy']);

update public.tag_suggestions g
   set status = 'rejected', reviewed_at = now(),
       metadata = coalesce(g.metadata, '{}'::jsonb) || jsonb_build_object(
         'resolution', c.resolution, 'resolved_by', 'migration:99991792791780')
  from _b3_close c
 where g.entity_id = c.id and g.entity_type = 'tag'
   and g.source = 'excel_review_2026_10_23' and g.status = 'pending';

do $verify$
declare v_bad int;
begin
  select count(*) into v_bad from _b3 b join public.unified_tags t on t.slug = b.slug and t.status = 'active'
   where t.short_description is distinct from b.sd or t.description is distinct from b.d
      or (b.clear_long and t.long_description is not null);
  if v_bad <> 0 then raise exception 'batch3: % corrected descriptions did not land', v_bad; end if;

  select count(*) into v_bad from _b3 b join public.unified_tags t on t.slug = b.slug and t.status = 'active'
   join public.tag_categories c on c.name = b.new_cat
   where t.category_id is distinct from c.id or t.category is distinct from b.new_cat
      or not exists (select 1 from public.tag_category_assignments j where j.tag_id = t.id and j.category_id = c.id and j.is_primary);
  if v_bad <> 0 then raise exception 'batch3: % category moves are incomplete', v_bad; end if;

  select count(*) into v_bad from public.unified_tags
   where slug in ('middle','niece') and status = 'active' and is_adult;
  if v_bad <> 0 then raise exception 'batch3: middle/niece still is_adult'; end if;

  select count(*) into v_bad from _b3_pairs p join public.unified_tags s on s.id = p.src_id
   where s.status <> 'merged' or s.merged_into_id is distinct from p.tgt_id;
  if v_bad <> 0 then raise exception 'batch3: % merges did not land', v_bad; end if;

  select count(*) into v_bad from public.unified_tags
   where slug in ('acrotomophillia','s-anti-lgbt-movement-in-the-united-states') and status = 'active';
  if v_bad <> 0 then raise exception 'batch3: % misspelt slugs are still live', v_bad; end if;

  select count(*) into v_bad from _b3_close c join public.tag_suggestions g
      on g.entity_id = c.id and g.source = 'excel_review_2026_10_23'
   where g.status = 'pending';
  if v_bad <> 0 then raise exception 'batch3: % inbox rows are still pending', v_bad; end if;
end
$verify$;
