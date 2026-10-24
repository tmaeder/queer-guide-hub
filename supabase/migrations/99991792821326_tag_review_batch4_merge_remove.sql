-- Review-queue batch 4 (2026-10-23): "Merge / remove" rows from the Review Queue
-- sheet of queerguide-unified_tags-2026-10-23_cleaned.xlsx whose fix is mechanical.
--
-- A. 26 German slugs renamed to English. The sheet asked to "merge into the
--    English tag", but the tag NAME is already English (alter = "Age", sexuell =
--    "Sexual", anti-gewalt = "Anti-Violence") and no English tag exists, so the
--    slug is what is wrong. An explicit slug write mints the redirect from the
--    German slug. Skipped: koch (the slug 'chef' is taken by an alias of
--    facilitator), bergmann (may be the surname, not "miner").
-- B. Four merges into an existing tag: leichtathletik -> track-and-field,
--    frauen -> woman (the note's 'women' is itself merged into woman),
--    pussy-licking -> eating-pussy (where cunnilingus already points),
--    gender-bender -> gender-bending.
-- C. Out-of-scope rows deprecated (51 listed, 48 qualify today): menu items (beef-ribs,
--    trio-of-creme-brulee, jalapeno-poppers, ...), dates, a hashtag and an import
--    artefact. Only rows with 0 uses and no human review, so nothing that tags
--    content or that a person curated is touched.
-- D. The inbox rows for A-C are closed.
--
-- Left for a person: every removal with usage (test, plum, buns, london-venue,
-- ...), pederasty (an editorial call), naturalist (the sheet only says "likely"
-- naturist), brasilian (its target 'brazilian' is a deprecated row holding the
-- slug), and the overlap-only notes.

set local statement_timeout = '15min';
select set_config('app.actor', 'migration:99991792821326_tag_review_batch4_merge_remove', true);

select setval('public.tag_slug_redirects_id_seq',
              greatest((select coalesce(max(id), 1) from public.tag_slug_redirects),
                       (select last_value from public.tag_slug_redirects_id_seq)));

-- A. renames
create temp table _b4_ren (old_slug text primary key, new_slug text not null) on commit drop;
insert into _b4_ren values
('alter','age'),('sexuell','sexual'),('anti-gewalt','anti-violence'),('erotik','erotica'),
('verbuendete','allies'),('gesellschaft','society'),('horbuch','audiobook'),
('filmemacher','filmmaker'),('dramatiker','playwright'),('geistliche-r','clergy'),
('rudern','rowing'),('bischof','bishop'),('wissenschaftler','scientist'),
('choreograf','choreographer'),('bogenschiessen','archery'),('astrolog','astrologer'),
('barkeeper','bartender'),('hofling','courtier'),('tagebuchautor','diarist'),
('synchron','dubbing'),('fussballspieler','football-player'),('topferin','potter'),
('rabbiner','rabbi'),('theologe','theologian'),('leichtathlet','track-and-field-athlete'),
('weberin','weaver');

create temp table _b4_ren_ok on commit drop as
select t.id, r.old_slug, r.new_slug
from _b4_ren r join public.unified_tags t on t.slug = r.old_slug and t.status = 'active'
where not exists (select 1 from public.unified_tags x where x.slug = r.new_slug)
  and not exists (select 1 from public.tag_aliases a where a.alias_slug = r.new_slug);

update public.unified_tags t set slug = o.new_slug from _b4_ren_ok o where t.id = o.id;

-- B. merges
create temp table _b4_pairs on commit drop as
select r.src, r.tgt, s.id as src_id, t.id as tgt_id
from (values ('leichtathletik','track-and-field'), ('frauen','woman'),
             ('pussy-licking','eating-pussy'), ('gender-bender','gender-bending')) r(src, tgt)
join public.unified_tags s on s.slug = r.src and s.status = 'active'
join public.unified_tags t on t.slug = r.tgt and t.status = 'active'
where not exists (select 1 from public.tag_relationship_exclusions e
                  where e.tag1_id = least(s.id, t.id) and e.tag2_id = greatest(s.id, t.id));

create temp table _b4_done (src_id uuid, tgt_id uuid, src text, audit_id uuid) on commit drop;

do $merge$
declare r record; v_audit uuid;
begin
  for r in select * from _b4_pairs order by src loop
    begin
      update public.tag_category_assignments set is_primary = false where tag_id = r.src_id and is_primary;
      v_audit := public.merge_tag_concept(r.tgt_id, r.src_id, 'migration:99991792821326', 'excel-review-batch4-2026-10-23');
      delete from public.tag_aliases a using public.unified_tags c
       where a.canonical_tag_id = r.src_id and c.id = r.tgt_id
         and lower(btrim(a.alias_name)) = lower(btrim(c.name));
      update public.tag_aliases set canonical_tag_id = r.tgt_id where canonical_tag_id = r.src_id;
      update public.unified_tags set merged_into_id = r.tgt_id
       where merged_into_id = r.src_id and status = 'merged' and id <> r.tgt_id;
      insert into _b4_done values (r.src_id, r.tgt_id, r.src, v_audit);
    exception when others then
      raise notice 'batch4 merge skipped % -> %: %', r.src, r.tgt, sqlerrm;
    end;
  end loop;
end
$merge$;

-- C. out-of-scope rows
create temp table _b4_dep (slug text primary key) on commit drop;
insert into _b4_dep values
('apple-juice'),('apricot-wheat'),('beef-ribs'),('brownie-with-ice-cream'),('catalan-cream'),
('chardonnay'),('chocolate-orange'),('chutneys'),('crispy-salad'),('croques'),('curds'),
('fennel-salad'),('hot-mustard'),('hot-pretzels'),('jalapeno-poppers'),('maguro-tataki'),
('mexican-rolls'),('pecorino'),('porcini-mushrooms'),('pork-soup'),('poulet'),('raclette'),
('raspado-drinks'),('rice-bowls'),('rioja'),('rosemary'),('salmon'),('sausage-stores'),
('schnitzel'),('snap-peas'),('spicy-beef'),('spicy-mango'),('stuffed-mushrooms'),
('tea-lattes'),('tomato-salad'),('trio-of-creme-brulee'),('turkey-legs'),
('chocolate-fondant'),('healthy-salads'),('kale-caesar'),('lemon-tea'),
('likeusonfacebook'),('wikipedia-tags'),('january-10-2023'),('september-25-2052'),
('golden-handcuffs'),('whole-shebang'),('banks'),('claritin'),
('work-life-balance-training'),('wisdom-teeth');

create temp table _b4_dep_ok on commit drop as
select t.id, t.slug from _b4_dep d join public.unified_tags t on t.slug = d.slug
where t.status = 'active' and t.usage_count = 0 and not t.human_reviewed;

update public.unified_tags t
   set status = 'deprecated', deprecated_at = now(), seo_indexable = false,
       deprecation_reason = 'Review queue 2026-10-23: out of scope (menu item, date or import artefact), no usage'
  from _b4_dep_ok o where t.id = o.id;

-- D. close the inbox rows
create temp table _b4_close (id uuid primary key, resolution text) on commit drop;
insert into _b4_close
select id, 'slug renamed from ' || old_slug || ' to ' || new_slug from _b4_ren_ok
union select d.src_id, 'merged into ' || (select slug from public.unified_tags where id = d.tgt_id) from _b4_done d
union select id, 'deprecated: out of scope, no usage' from _b4_dep_ok;

update public.tag_suggestions g
   set status = 'rejected', reviewed_at = now(),
       metadata = coalesce(g.metadata, '{}'::jsonb) || jsonb_build_object(
         'resolution', c.resolution, 'resolved_by', 'migration:99991792821326')
  from _b4_close c
 where g.entity_id = c.id and g.entity_type = 'tag'
   and g.source = 'excel_review_2026_10_23' and g.status = 'pending';

do $verify$
declare v_n int; v_bad int;
begin
  select count(*) into v_n from _b4_ren_ok;
  select count(*) into v_bad from _b4_ren_ok o join public.unified_tags t on t.id = o.id where t.slug <> o.new_slug;
  if v_bad <> 0 then raise exception 'batch4: % renames did not land', v_bad; end if;
  select count(*) into v_bad from _b4_ren_ok o
   where not exists (select 1 from public.tag_slug_redirects r where r.old_slug = o.old_slug and r.tag_id = o.id);
  if v_bad <> 0 then raise exception 'batch4: % renames minted no redirect', v_bad; end if;
  if v_n < 20 then raise exception 'batch4: only % of 26 renames were possible; the corpus has drifted', v_n; end if;

  select count(*) into v_bad from _b4_pairs p join public.unified_tags s on s.id = p.src_id
   where s.status <> 'merged' or s.merged_into_id is distinct from p.tgt_id;
  if v_bad <> 0 then raise exception 'batch4: % merges did not land', v_bad; end if;
  select count(*) into v_bad from _b4_done d join public.tag_aliases a on a.canonical_tag_id = d.src_id;
  if v_bad <> 0 then raise exception 'batch4: % aliases still point at a merged source', v_bad; end if;

  select count(*) into v_bad from _b4_dep_ok o join public.unified_tags t on t.id = o.id where t.status <> 'deprecated';
  if v_bad <> 0 then raise exception 'batch4: % rows were not deprecated', v_bad; end if;

  select count(*) into v_bad from _b4_close c join public.tag_suggestions g
      on g.entity_id = c.id and g.source = 'excel_review_2026_10_23'
   where g.status = 'pending';
  if v_bad <> 0 then raise exception 'batch4: % inbox rows are still pending', v_bad; end if;
end
$verify$;
