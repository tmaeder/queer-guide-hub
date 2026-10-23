-- Excel review queue 2026-10-23, batch 5: rows whose note named a merge target in
-- prose that did not match a slug. Each target was resolved by hand on prod.
--
--   * 35 merges into the existing canonical row (both sides read). Aliases follow
--     the merge; older merges that pointed at a source are repointed to the new
--     canonical, because merge_tag_concept does not do that and would leave a chain.
--   * 31 German or misspelt slugs renamed to English. Each write mints a
--     tag_slug_redirects row, so the old URL keeps resolving.
--   * Out-of-scope menu items, name-only stubs and run-together "-etc" headings are
--     deprecated, only where usage_count = 0 and the row is not human_reviewed.
--   * 5 queued rows are already the canonical of their duplicates; closed.
--
-- Left for a person: location composites with usage (us-venue, uk-venue, *-nightlife,
-- *-eats), cuisine tags with usage (beef, mexican, sushi, wine), gay-rights (narrower
-- than lgbtqia-rights), tokyo-spot (no tokyo tag), playstation, paula-wessely,
-- archaeologist, rest-and-leisure, and the two human_reviewed food rows
-- (generous-servings, ginger-cookies).

select set_config('app.actor', 'migration:99991792791783_tag_review_batch5_unresolved_targets', true);

select setval('public.tag_slug_redirects_id_seq',
              greatest((select coalesce(max(id), 1) from public.tag_slug_redirects),
                       (select last_value from public.tag_slug_redirects_id_seq)));

create temp table _b5_pairs on commit drop as
select r.src, r.tgt, s.id as src_id, t.id as tgt_id
from (values ('pride-celebration','pride-events'), ('lgbtq-pride-events','pride-events'), ('queer-pride','lgbt-pride'), ('safe-sex-practices','safer-sex'), ('gray-asexual','gray-asexuality'), ('harness-strap-on','strap-on'), ('herpes-hsv-1-2','herpes'), ('jerking-off','masturbation'), ('disciplinary-power-knowledge','knowledge-power-nexus'), ('lgbt-affirmative-therapy','affirmative-therapy'), ('lgbtq-affirmative-therapy','affirmative-therapy'), ('queer-club-bar','lgbtq-bar'), ('queer-clubs-and-bars','lgbtq-bar'), ('sadism-and-masochism','sadomasochism'), ('slang-words','slang'), ('testes-singular-testis','testicle'), ('testes-testis','testicle'), ('testes','testicle'), ('transgender-flag','trans-flag'), ('transgender-pride-flag','trans-flag'), ('variations-of-sex-development-dsd','variations-of-sex-development-vsd'), ('gender-reaffirmation','gender-affirmation'), ('bdsm-dominance-submission','dominance-and-submission-d-s'), ('d-s','dominance-and-submission-d-s'), ('bisexual-identity-relationships-rights','bisexual'), ('ass-centric','ass-play'), ('assigned-female-male-x-at-birth','assigned-sex'), ('assigned-sex-at-birth','assigned-sex'), ('foot-feet','foot-fetish'), ('cuckhold','cuckolding'), ('lgbtqia-parenting-rights','parental-rights-for-lgbtq-families'), ('nudist-gardening-club','nudist-gardening'), ('pfarrer','pastor'), ('gelato','ice-cream'), ('snowboard','winter-sports')) r(src, tgt)
join public.unified_tags s on s.slug = r.src and s.status = 'active'
join public.unified_tags t on t.slug = r.tgt and t.status = 'active'
where not exists (select 1 from public.tag_relationship_exclusions e
                  where e.tag1_id = least(s.id, t.id) and e.tag2_id = greatest(s.id, t.id));

create temp table _b5_done (src_id uuid, tgt_id uuid, src text, audit_id uuid) on commit drop;

do $merge$
declare r record; v_audit uuid;
begin
  for r in select * from _b5_pairs order by src loop
    begin
      update public.tag_category_assignments set is_primary = false where tag_id = r.src_id and is_primary;
      v_audit := public.merge_tag_concept(r.tgt_id, r.src_id, 'migration:99991792791783', 'excel-review-batch5-2026-10-23');
      execute 'delete from public.tag_aliases a using public.unified_tags c
       where a.canonical_tag_id = $1 and c.id = $2
         and lower(btrim(a.alias_name)) = lower(btrim(c.name))' using r.src_id, r.tgt_id;
      update public.tag_aliases set canonical_tag_id = r.tgt_id where canonical_tag_id = r.src_id;
      update public.unified_tags set merged_into_id = r.tgt_id
       where merged_into_id = r.src_id and status = 'merged' and id <> r.tgt_id;
      insert into _b5_done values (r.src_id, r.tgt_id, r.src, v_audit);
    exception when others then
      raise notice 'batch5 merge skipped % -> %: %', r.src, r.tgt, sqlerrm;
    end;
  end loop;
end
$merge$;

create temp table _b5_ren (old_slug text primary key, new_slug text not null) on commit drop;
insert into _b5_ren values
('anonym','anonymous-testing'),
('kunstsammler','art-collector'),
('kunstlerduo','artist-duo'),
('preistrager','award-winner'),
('schonheitskonigin','beauty-queen'),
('busfahrer','bus-driver'),
('kabarettist','cabaret-performer'),
('beamte','civil-servants'),
('altphilologe','classical-philologist'),
('informatiker','computer-scientist'),
('kriminell','criminal'),
('gutsbesitzer','landowner'),
('kriegerin','female-warrior'),
('food-autor','food-writer'),
('innenarchitekt','interior-architect'),
('marineflieger','naval-aviator'),
('horspiel','radio-drama'),
('widerstandskaempfer','resistance-fighter'),
('sexualwissenschaftler','sexologist'),
('huttenarbeiter','steelworker'),
('gewaltverbrechen','violent-crime'),
('grohandelskaufmann','wholesaler'),
('jugendbund-grunder','youth-group-founder'),
('jugendleiter','youth-leader'),
('open-source-aktivist','open-source-activist'),
('lgbtq-personen','lgbtq-people'),
('lgbtq-aktivistin','lgbtq-activist'),
('sexualisierte','sexualized-violence'),
('maler','painter'),
('runder','round-table'),
('lgtbi-focused','lgbti-focused');

create temp table _b5_ren_ok on commit drop as
select t.id, r.old_slug, r.new_slug
from _b5_ren r join public.unified_tags t on t.slug = r.old_slug and t.status = 'active'
where not exists (select 1 from public.unified_tags x where x.slug = r.new_slug)
  and not exists (select 1 from public.tag_aliases a where a.alias_slug = r.new_slug)
  and not exists (select 1 from public.tag_slug_redirects d where d.old_slug = r.new_slug);

update public.unified_tags t set slug = o.new_slug from _b5_ren_ok o where t.id = o.id;

create temp table _b5_dep (slug text primary key) on commit drop;
insert into _b5_dep values
('aioli-sauce'),
('baked-potatoes'),
('bangers-and-mash'),
('barbacoa'),
('beef-carpaccio'),
('beef-filet'),
('butter-chicken'),
('cabernet'),
('cachapas'),
('chicken-lollipops'),
('chimichurri'),
('creamed-corn'),
('daiya-cheese'),
('donuts'),
('double-cheese'),
('dumplings'),
('durum'),
('ensaladilla-rusa'),
('fresh-herbs'),
('fresh-sandwiches'),
('fresh-squeezed-oj'),
('fried-bananas'),
('fruit-cocktails'),
('garlic-spinach'),
('gyu-carpaccio'),
('hendrick-s'),
('lamb-chops'),
('lemon-wedges'),
('lobster-mac-cheese'),
('mango-rolls'),
('mascarpone-cheese'),
('mini-burgers'),
('peach-tea'),
('pilsner-urquell'),
('polenta-fries'),
('pork-cracklings'),
('pot-pies'),
('prater-pils'),
('raita'),
('rib-tips'),
('salami'),
('salmon-salad'),
('shandy'),
('sweet-chili'),
('teishoku'),
('tiramisu'),
('txakoli'),
('varietals'),
('whiskey'),
('white-chocolate-cheesecake'),
('white-russians'),
('wood-fired-pizzas'),
('nice-rooms'),
('campos'),
('joseph'),
('michalak'),
('term'),
('outline-of-academic-disciplines'),
('lesbian-employment-families-etc'),
('lesbian-pride-rights-etc');

create temp table _b5_dep_ok on commit drop as
select t.id, t.slug from _b5_dep d join public.unified_tags t on t.slug = d.slug
where t.status = 'active' and t.usage_count = 0 and not t.human_reviewed;

update public.unified_tags t
   set status = 'deprecated', deprecated_at = now(), seo_indexable = false,
       deprecation_reason = 'Review queue 2026-10-23: out of scope (menu item, name-only stub or run-together heading), no usage'
  from _b5_dep_ok o where t.id = o.id;

create temp table _b5_close (id uuid primary key, resolution text) on commit drop;
insert into _b5_close
select d.src_id, 'merged into ' || (select slug from public.unified_tags where id = d.tgt_id) from _b5_done d
union select id, 'slug renamed from ' || old_slug || ' to ' || new_slug from _b5_ren_ok
union select id, 'deprecated: out of scope, no usage' from _b5_dep_ok
union select t.id, 'already the canonical: its duplicates are merged into it' from public.unified_tags t
 where t.status = 'active' and t.slug = any (array['pride-events','friends-with-benefits','primal-hunter','knowledge-power-nexus','parental-rights-for-lgbtq-families']);

update public.tag_suggestions g
   set status = 'rejected', reviewed_at = now(),
       metadata = coalesce(g.metadata, '{}'::jsonb) || jsonb_build_object(
         'resolution', c.resolution, 'resolved_by', 'migration:99991792791783')
  from _b5_close c
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
  select count(*) into v_n from _b5_done;
  if v_n < 25 then raise exception 'batch5: only % of 35 merges landed; the corpus has drifted', v_n; end if;
  select count(*) into v_bad from _b5_pairs p join public.unified_tags s on s.id = p.src_id
   where s.status <> 'merged' or s.merged_into_id is distinct from p.tgt_id;
  if v_bad <> 0 then raise exception 'batch5: % merges did not land', v_bad; end if;
  select count(*) into v_bad from _b5_done d join public.tag_aliases a on a.canonical_tag_id = d.src_id;
  if v_bad <> 0 then raise exception 'batch5: % aliases still point at a merged source', v_bad; end if;
  select count(*) into v_bad from _b5_done d join public.unified_tags m on m.merged_into_id = d.src_id;
  if v_bad <> 0 then raise exception 'batch5: % older merges still point at a merged source', v_bad; end if;
  select count(*) into v_bad from public.unified_tags m join public.unified_tags t on t.id = m.merged_into_id
   where m.status = 'merged' and t.status = 'merged';
  if v_bad <> 0 then raise exception 'batch5: % merged tags still point at a merged tag', v_bad; end if;

  select count(*) into v_n from _b5_ren_ok;
  if v_n < 25 then raise exception 'batch5: only % of 31 renames were possible; the corpus has drifted', v_n; end if;
  select count(*) into v_bad from _b5_ren_ok o join public.unified_tags t on t.id = o.id where t.slug <> o.new_slug;
  if v_bad <> 0 then raise exception 'batch5: % renames did not land', v_bad; end if;
  select count(*) into v_bad from _b5_ren_ok o
   where not exists (select 1 from public.tag_slug_redirects r where r.old_slug = o.old_slug and r.tag_id = o.id);
  if v_bad <> 0 then raise exception 'batch5: % renames minted no redirect', v_bad; end if;

  select count(*) into v_bad from _b5_dep_ok o join public.unified_tags t on t.id = o.id where t.status <> 'deprecated';
  if v_bad <> 0 then raise exception 'batch5: % rows were not deprecated', v_bad; end if;

  select count(*) into v_bad from _b5_close c join public.tag_suggestions g
      on g.entity_id = c.id and g.source = 'excel_review_2026_10_23'
   where g.status = 'pending';
  if v_bad <> 0 then raise exception 'batch5: % inbox rows are still pending', v_bad; end if;
end
$verify$;
