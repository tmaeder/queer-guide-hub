
-- Excel review queue 2026-10-23, batch 7: the remaining "Merge / remove" rows that
-- name no clear target ("other"). Every target was read on prod; a row is acted on
-- only where an active English row already carries the concept.
--
--   * 39 German slugs renamed to the English slug of their (already English)
--     name, e.g. selbsthilfe -> self-help, medien -> media, espana -> spain. Renames run
--     first, so spanish-location can then merge into spain. Each mints a redirect.
--   * 39 merges into an existing canonical row (daddi -> daddy, transphobic ->
--     transphobia, flti -> flinta, kleinkunst -> cabaret, ...). Aliases and earlier
--     merges are repointed, and the chain collapse runs at the end.
--   * 47 rows deprecated: menu items, drink brands, name-only stubs and
--     "x-y-etc" catch-all headings, all with no usage and not human-reviewed.
--   * freedom-of-speech and cedar-springs are kept: both pairs carry a recorded
--     do-not-merge exclusion from the 2026-09-20 review.
--   * Inbox rows closed with nothing to change, because the duplicate is already merged
--     into them: tv, actor, lgbt-center, lgbtq-cinema, warmer-bruder, nudist-gardening.
--
-- Left for a person: location composites in use (thai-bar, uk-bar, *-nightlife, ...),
-- cuisine/venue-type tags in use, prenzlauer (needs a rename to prenzlauer-berg),
-- greysexual (an e2e-asserted canonical, against gray-asexuality), kinderfur, masseuses,
-- and the scope questions (news-pride, art, mental-health, dinner, lunch, beer, ...).

select set_config('app.actor', 'migration:99991792821333_tag_review_batch7_other_rows', true);

select setval('public.tag_slug_redirects_id_seq',
              greatest((select coalesce(max(id), 1) from public.tag_slug_redirects),
                       (select last_value from public.tag_slug_redirects_id_seq)));

create temp table _b7_ren (old_slug text primary key, new_slug text not null) on commit drop;
insert into _b7_ren values
('selbsthilfe','self-help'),
('gruppen','groups'),
('medien','media'),
('sichtbarkeit','visibility'),
('auszeichnungen','awards'),
('gruppe','group'),
('espana','spain'),
('offenes','open-event'),
('geburtstag','birthday'),
('papst','pope'),
('zirkus','circus'),
('vernetzung','community-networking'),
('kerle','guys'),
('richter','judge'),
('strafverfolgung','prosecution'),
('darsteller','performer'),
('garten','garden'),
('venezia','venice'),
('buchhalter','accountant'),
('anglikanischer-priester','anglican-priest'),
('architekt','architect'),
('arzt-arztin','medical-doctor'),
('ballett-mitbegrunder','ballet-co-founder'),
('burgermeister-von-houston','mayor-of-houston'),
('dekan-von-st-albans','dean-of-st-albans'),
('entfesselungskunstler','escapologist'),
('farber','dyer'),
('fdny-kaplan','fdny-chaplain'),
('friseur','hairdresser'),
('geheimagent','secret-agent'),
('kritiker','critic'),
('mordopfer','murder-victim'),
('ordensgeistliche','religious-order-clergy'),
('sprecher','speaker'),
('straenbahnschaffner','tram-conductor'),
('theoretiker','theorist'),
('zauberkuenstler','magician'),
('zeichner','illustrator'),
('andere-eltern','other-parents');

create temp table _b7_ren_ok on commit drop as
select t.id, r.old_slug, r.new_slug
from _b7_ren r join public.unified_tags t on t.slug = r.old_slug and t.status = 'active'
where not exists (select 1 from public.unified_tags x where x.slug = r.new_slug)
  and not exists (select 1 from public.tag_aliases a where a.alias_slug = r.new_slug)
  and not exists (select 1 from public.tag_slug_redirects d where d.old_slug = r.new_slug);

update public.unified_tags t set slug = o.new_slug from _b7_ren_ok o where t.id = o.id;

-- transphobic carries an auto "broader" edge onto transmisogyny, which is backwards
-- (transmisogyny is the narrower concept and already sits under transphobia); merging
-- transphobic into transphobia would close a cycle, so the edge is dropped first.
delete from public.tag_relations r
 using public.unified_tags a, public.unified_tags b
 where a.id = r.source_tag_id and b.id = r.target_tag_id
   and a.slug = 'transphobic' and b.slug = 'transmisogyny'
   and r.relation_type = 'broader' and r.review_status = 'auto';
create temp table _b7_pairs on commit drop as
select r.src, r.tgt, s.id as src_id, t.id as tgt_id
from (values ('daddi','daddy'), ('brown-shower','scat-play'), ('bukkake-porn','bukkake'), ('electrocution','electroplay'), ('emtricitabine-tenofovir-alafenamide','descovy'), ('post-exposure-prophylaxis','pep'), ('queer-theater','lgbt-theatre'), ('transphobic','transphobia'), ('queer-activism','lgbtq-activism'), ('butch-identity','butch'), ('twonks','twunk'), ('underground-ballroom','ballroom-culture'), ('khusra','hijra'), ('substance-abuse','substance-use-disorder'), ('inclusivity','inclusion'), ('flti','flinta'), ('lesbian-identity','lesbian'), ('lesbian-identity-liberation-etc','lesbian'), ('lgbtq-celebration','lgbtq-event'), ('pride-related','pride-events'), ('oakland-spot','oakland'), ('mexico-based','mexico'), ('mexico-establishment','mexico'), ('swiss','switzerland'), ('south-african','south-africa'), ('spanish-location','spain'), ('reverse-soaring-eagle','soaring-eagle'), ('molly-molly','mdma'), ('opportunistic-stis','opportunistic-infections'), ('depo-provera-medroxyprogesterone','contraceptive-injection'), ('male-hormones','testosterone'), ('nudist-spiritual-retreat','nudist-meditation-retreat'), ('tucking-gaffs','gaff'), ('transpersonen','trans'), ('saenger','singer'), ('drag-thing','drag'), ('leather-subculture','leather'), ('kleinkunst','cabaret'), ('verlag','publisher')) r(src, tgt)
join public.unified_tags s on s.slug = r.src and s.status = 'active'
join public.unified_tags t on t.slug = r.tgt and t.status = 'active'
where not exists (select 1 from public.tag_relationship_exclusions e
                  where e.tag1_id = least(s.id, t.id) and e.tag2_id = greatest(s.id, t.id));

create temp table _b7_done (src_id uuid, tgt_id uuid, src text, audit_id uuid) on commit drop;

do $merge$
declare r record; v_audit uuid;
begin
  for r in select * from _b7_pairs order by src loop
    begin
      update public.tag_category_assignments set is_primary = false where tag_id = r.src_id and is_primary;
      v_audit := public.merge_tag_concept(r.tgt_id, r.src_id, 'migration:99991792821333', 'excel-review-batch7-2026-10-23');
      execute 'delete from public.tag_aliases a using public.unified_tags c
       where a.canonical_tag_id = $1 and c.id = $2
         and lower(btrim(a.alias_name)) = lower(btrim(c.name))' using r.src_id, r.tgt_id;
      update public.tag_aliases set canonical_tag_id = r.tgt_id where canonical_tag_id = r.src_id;
      update public.unified_tags set merged_into_id = r.tgt_id
       where merged_into_id = r.src_id and status = 'merged' and id <> r.tgt_id;
      insert into _b7_done values (r.src_id, r.tgt_id, r.src, v_audit);
    exception when others then
      raise notice 'batch7 merge skipped % -> %: %', r.src, r.tgt, sqlerrm;
    end;
  end loop;
end
$merge$;

create temp table _b7_dep (slug text primary key) on commit drop;
insert into _b7_dep values
('absolut-peppar'),
('affogatos'),
('all-you-can-eat'),
('amaretto'),
('black-sesame-ice-cream'),
('cerdanya-trinxat'),
('cheese-bread'),
('chicken-livers'),
('chocolate-cake'),
('coppa'),
('delicious-calamari'),
('double-cheezborger'),
('grilled-corn'),
('lots-of-fruit'),
('mushroom-sandwich'),
('nachos'),
('pommes'),
('fresh-made'),
('food-courts'),
('locally-sourced-food'),
('diner-food'),
('leather-sofas'),
('birthplace'),
('mac-et'),
('fatate'),
('canard'),
('ambroise'),
('aperativo'),
('financial-compensation'),
('compromise'),
('affiliation'),
('generosity'),
('chaser-drinks-non-alcoholic'),
('carbonated-spring'),
('health-risk-concepts'),
('general-queer-health-concepts'),
('lgbt-history-linguistics-etc'),
('lgbtq-anglicans-buddhists-etc'),
('lgbtq-archives-art-etc'),
('lgbtq-awards-blogs-etc'),
('lgbtq-book-censorship-clubs'),
('lgbtq-chosen-families-cinema'),
('lesbian-porn-relationships-etc'),
('list-of-lgbt-rights-activists'),
('list-of-lgbt-related-organizations-and-conferences'),
('policy-culture-and-advocacy'),
('the-revealing-of-truth');

create temp table _b7_dep_ok on commit drop as
select t.id, t.slug from _b7_dep d join public.unified_tags t on t.slug = d.slug
where t.status = 'active' and t.usage_count = 0 and not t.human_reviewed;

update public.unified_tags t
   set status = 'deprecated', deprecated_at = now(), seo_indexable = false,
       deprecation_reason = 'Review queue 2026-10-23: out of scope (menu item, brand, name-only stub or catch-all heading), no usage'
  from _b7_dep_ok o where t.id = o.id;

create temp table _b7_close (id uuid primary key, resolution text) on commit drop;
insert into _b7_close
select d.src_id, 'merged into ' || (select slug from public.unified_tags where id = d.tgt_id) from _b7_done d
union select id, 'slug renamed from ' || old_slug || ' to ' || new_slug from _b7_ren_ok
union select id, 'deprecated: out of scope, no usage' from _b7_dep_ok
union select t.id, 'kept separate: reviewed as distinct (do-not-merge exclusion)' from public.unified_tags t
 where t.status = 'active' and t.slug = any (array['freedom-of-speech','cedar-springs'])
union select t.id, 'kept as canonical: its duplicate is already merged into it' from public.unified_tags t
 where t.status = 'active' and t.slug = any (array['tv','actor','lgbt-center','lgbtq-cinema','warmer-bruder','nudist-gardening']);

update public.tag_suggestions g
   set status = 'rejected', reviewed_at = now(),
       metadata = coalesce(g.metadata, '{}'::jsonb) || jsonb_build_object(
         'resolution', c.resolution, 'resolved_by', 'migration:99991792821333')
  from _b7_close c
 where g.entity_id = c.id and g.entity_type = 'tag'
   and g.source = 'excel_review_2026_10_23' and g.status = 'pending';

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
  select count(*) into v_n from _b7_done;
  if v_n < 34 then raise exception 'batch7: only % of 39 merges landed; the corpus has drifted', v_n; end if;
  select count(*) into v_bad from _b7_pairs p join public.unified_tags s on s.id = p.src_id
   where s.status <> 'merged' or s.merged_into_id is distinct from p.tgt_id;
  if v_bad <> 0 then raise exception 'batch7: % merges did not land', v_bad; end if;
  select count(*) into v_bad from _b7_done d join public.tag_aliases a on a.canonical_tag_id = d.src_id;
  if v_bad <> 0 then raise exception 'batch7: % aliases still point at a merged source', v_bad; end if;
  select count(*) into v_bad from _b7_done d join public.unified_tags m on m.merged_into_id = d.src_id;
  if v_bad <> 0 then raise exception 'batch7: % older merges still point at a merged source', v_bad; end if;
  select count(*) into v_bad from public.unified_tags m join public.unified_tags t on t.id = m.merged_into_id
   where m.status = 'merged' and t.status = 'merged';
  if v_bad <> 0 then raise exception 'batch7: % merged tags still point at a merged tag', v_bad; end if;

  select count(*) into v_n from _b7_ren_ok;
  if v_n < 34 then raise exception 'batch7: only % of 39 renames were possible; the corpus has drifted', v_n; end if;
  select count(*) into v_bad from _b7_ren_ok o join public.unified_tags t on t.id = o.id where t.slug <> o.new_slug;
  if v_bad <> 0 then raise exception 'batch7: % renames did not land', v_bad; end if;
  select count(*) into v_bad from _b7_ren_ok o
   where not exists (select 1 from public.tag_slug_redirects r where r.old_slug = o.old_slug and r.tag_id = o.id);
  if v_bad <> 0 then raise exception 'batch7: % renames minted no redirect', v_bad; end if;

  select count(*) into v_bad from _b7_dep_ok o join public.unified_tags t on t.id = o.id where t.status <> 'deprecated';
  if v_bad <> 0 then raise exception 'batch7: % rows were not deprecated', v_bad; end if;

  select count(*) into v_bad from _b7_close c join public.tag_suggestions g
      on g.entity_id = c.id and g.source = 'excel_review_2026_10_23'
   where g.status = 'pending';
  if v_bad <> 0 then raise exception 'batch7: % inbox rows are still pending', v_bad; end if;
end
$verify$;
