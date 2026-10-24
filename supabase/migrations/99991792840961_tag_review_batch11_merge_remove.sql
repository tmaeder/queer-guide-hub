-- Excel review queue 2026-10-23, batch 11: the "Merge / remove" rows.
-- Decisions taken by a person on 2026-10-24.
--
--   * 11 duplicate merges, the less-used tag into the more-used one:
--     soccer -> football, health-services -> health-care, marriage-equality ->
--     same-sex-marriage, brats -> brat, cock-cage -> chastity-cage,
--     personal-secretary -> personal-assistant, greysexual -> gray-asexuality,
--     female-reproductive-organs -> female-reproductive-system,
--     naturalist -> naturist, japanese-food -> japanese-cuisine,
--     french-bistros -> bistro.
--   * 49 place + venue-type tags (istanbul-nightlife, us-bar, ...) merge into the
--     type tag (bar, nightlife, restaurant, cafe, nightclub, events, hotel). The venue's
--     own location data already says where it is.
--   * Up to 52 unused out-of-scope tags are deprecated, including kinderfur
--     (child characters in a sexual context) and pederasty. Only rows still unused and
--     not the target of a merge are touched (charite and mavie-horbiger are merge targets,
--     so they stay pending); deprecation is reversible.
--   * Unused tags that are real terms, and food/drink/venue-feature tags in use, are
--     kept and their rows closed. Rows whose duplicate an earlier batch already merged
--     are closed as resolved.
--
-- Left pending for a person (90 rows): place-only tags that are in use
-- (us-venue, london-based, ...) and rows that need an editorial call:
-- news-pride, prenzlauer, us-venue, test, begine, village, gay-rights, sonntags-club, italian, uk-venue, prejudice, spanish-venue, academic-institution, uk-based, plum, mexican, buns, italian-venue, london-venue, investment, california-venue, london-based, irish, koch, japanese-venue, united-kingdom, istanbul-venue, netherlands-based, switchboard, notre-dame, electronics, social-security, sage, scottish-venue, thai, peruvian, sydney-venue, brasilian, osaka-establishment, norway-based, muscle, playstation, shinjuku-location, embassy-suites, altruism, amsterdam-based, aptos-address, australian-business, baja-california-spot, bandung-establishment, banking, body-autonomy, brisbane-venue, budapest-venue, bullring, cactus, caledonia-venue, cambridge-venue, charleston-spot, emporia-establishment, fortaleza-location, german-based, global-action, hauptbahnhof, highbury-location, homophonic, indianapolis-scene, maspalomas-venue, moda-istanbul, moers-based, norfolk-based, not-applicable, outdoor-terrazas, patience, platinum-mall, polish-venue, post-office, repair-service, russia-venue, sauna-club, shibuya-venue, sint-maarten, texas-venue, tirol-based, tokyo-spot, universalism, updates, watsonville-location, zurich-venue, lesbians-lesbians-of-color.

select set_config('app.actor', 'migration:99991792840961_tag_review_batch11_merge_remove', true);

-- cock-cage carries an auto "broader" edge onto chastity-belt, which is wrong: the two
-- devices are siblings (a recorded do-not-merge pair with chastity-cage). Merging
-- cock-cage into chastity-cage would close a cycle, so the edge is dropped first.
delete from public.tag_relations r
 using public.unified_tags a, public.unified_tags b
 where a.id = r.source_tag_id and b.id = r.target_tag_id
   and a.slug = 'cock-cage' and b.slug = 'chastity-belt'
   and r.relation_type = 'broader' and r.review_status = 'auto';

create temp table _b11_pairs on commit drop as
select r.src, r.tgt, s.id as src_id, t.id as tgt_id
from (values
('soccer','football'),
('health-services','health-care'),
('marriage-equality','same-sex-marriage'),
('brats','brat'),
('cock-cage','chastity-cage'),
('personal-secretary','personal-assistant'),
('greysexual','gray-asexuality'),
('female-reproductive-organs','female-reproductive-system'),
('naturalist','naturist'),
('japanese-food','japanese-cuisine'),
('french-bistros','bistro'),
('ankara-bar','bar'),
('california-eats','restaurant'),
('canadian-bar','bar'),
('canadian-event','events'),
('chicago-nightlife','nightlife'),
('corfu-nightlife','nightlife'),
('dublin-event','events'),
('gb-event','events'),
('german-event','events'),
('gothenburg-nightlife','nightlife'),
('harrah-dining','restaurant'),
('ibiza-club','nightclub'),
('ikoyi-dining','restaurant'),
('istanbul-eats','restaurant'),
('istanbul-nightlife','nightlife'),
('kadikoy-cafe','cafe'),
('lisbon-nightlife','nightlife'),
('los-angeles-bar','bar'),
('montreal-bar','bar'),
('moscow-club','nightclub'),
('mountain-mesa-eats','restaurant'),
('oklahoma-eats','restaurant'),
('osaka-bar','bar'),
('palm-springs-eats','restaurant'),
('parisian-nightlife','nightlife'),
('pendik-dining','restaurant'),
('perugia-nightlife','nightlife'),
('plano-bar','bar'),
('porto-bars','bar'),
('portugal-bars','bar'),
('portugal-nightlife','nightlife'),
('quebec-nightlife','nightlife'),
('saarbrucken-nightlife','nightlife'),
('santa-cruz-bar','bar'),
('seoul-nightlife','nightlife'),
('shinjuku-bar','bar'),
('south-american-club','nightclub'),
('swedish-bar','bar'),
('tbilisi-nightlife','nightlife'),
('thai-bar','bar'),
('thai-resort','hotel'),
('torremolinos-nightlife','nightlife'),
('tottenham-restaurant','restaurant'),
('turkish-bar','bar'),
('turkish-cafe','cafe'),
('uk-bar','bar'),
('us-bar','bar'),
('us-cafes','cafe'),
('us-restaurant','restaurant')
) r(src, tgt)
join public.unified_tags s on s.slug = r.src and s.status = 'active'
join public.unified_tags t on t.slug = r.tgt and t.status = 'active'
where not exists (select 1 from public.tag_relationship_exclusions e
                  where e.tag1_id = least(s.id, t.id) and e.tag2_id = greatest(s.id, t.id));

create temp table _b11_done (src_id uuid, tgt_id uuid) on commit drop;

do $merge$
declare r record;
begin
  for r in select * from _b11_pairs loop
    begin
      update public.tag_category_assignments set is_primary = false where tag_id = r.src_id and is_primary;
      perform public.merge_tag_concept(r.tgt_id, r.src_id, 'migration:99991792840961', 'excel-review-batch11-2026-10-23');
      delete from public.tag_aliases a using public.unified_tags c
       where a.canonical_tag_id = r.src_id and c.id = r.tgt_id
         and lower(btrim(a.alias_name)) = lower(btrim(c.name));
      update public.tag_aliases set canonical_tag_id = r.tgt_id where canonical_tag_id = r.src_id;
      update public.unified_tags set merged_into_id = r.tgt_id
       where merged_into_id = r.src_id and status = 'merged' and id <> r.tgt_id;
      insert into _b11_done values (r.src_id, r.tgt_id);
    exception when others then
      raise notice 'batch11 merge skipped % -> %: %', r.src, r.tgt, sqlerrm;
    end;
  end loop;
end
$merge$;

create temp table _b11_dep (slug text primary key) on commit drop;
insert into _b11_dep values
('braves'),
('trappist'),
('ginger-cookies'),
('generous-servings'),
('terrific-service'),
('generosity-training'),
('quimbara'),
('trucks'),
('rest-and-leisure'),
('ruben'),
('alliteration'),
('gender-reveal-party'),
('tyrant'),
('bottrop'),
('fonteinen'),
('big-boobs'),
('floyd'),
('fiori'),
('bergmann'),
('dakini'),
('crema'),
('bavarian'),
('mentalist'),
('mavie-horbiger'),
('neo-kuss'),
('mantra'),
('nikki'),
('taser'),
('charite'),
('nudist-sustainable-living'),
('kingfisher'),
('chardonnay'),
('kinderfur'),
('champs-elysees'),
('zirkuskuenstler'),
('kaiser'),
('party-spot'),
('paula-wessely'),
('pederasty'),
('busch'),
('investor'),
('burro-favorito'),
('hydration-electrolyte-balance'),
('baron'),
('banks'),
('hot-pretzels'),
('hippie'),
('architectural-styles'),
('squirrel'),
('animal-human-relationships'),
('educative'),
('spots-in-la');

create temp table _b11_dep_ok on commit drop as
select t.id, t.slug from _b11_dep d join public.unified_tags t on t.slug = d.slug
where t.status = 'active'
  and not exists (select 1 from public.unified_tags m where m.merged_into_id = t.id)
  -- kinderfur goes whatever its usage: it names child characters in a sexual context.
  and (t.usage_count = 0 or t.slug = 'kinderfur');

update public.unified_tags t
   set status = 'deprecated', deprecated_at = now(), seo_indexable = false,
       deprecation_reason = 'Review queue 2026-10-23: out of scope, no usage'
  from _b11_dep_ok o where t.id = o.id;

create temp table _b11_kept (slug text primary key, resolution text) on commit drop;
insert into _b11_kept values
('archaeologist','kept separate: real term, not a duplicate'),
('naval-officer','kept separate: real term, not a duplicate'),
('ethnic-cleansing','kept separate: real term, not a duplicate'),
('child-labor','kept separate: real term, not a duplicate'),
('right-to-food','kept separate: real term, not a duplicate'),
('language-rights','kept separate: real term, not a duplicate'),
('developmental-origins-hypothesis','kept separate: real term, not a duplicate'),
('education-and-the-lgbt-community','kept separate: real term, not a duplicate'),
('drag-brunch-queens','kept separate: real term, not a duplicate'),
('milf-hunter','kept separate: real term, not a duplicate'),
('masseuses','kept separate: real term, not a duplicate'),
('merman','kept separate: real term, not a duplicate'),
('nymph','kept separate: real term, not a duplicate'),
('whirlpool','kept separate: real term, not a duplicate'),
('nuvaring','kept separate: real term, not a duplicate'),
('pre-post-or-non-operative-or-op','kept separate: real term, not a duplicate'),
('health-well-being','kept separate: real term, not a duplicate'),
('beverage','kept separate: a venue feature or topic tag that is in use'),
('dinner','kept separate: a venue feature or topic tag that is in use'),
('lunch','kept separate: a venue feature or topic tag that is in use'),
('beer','kept separate: a venue feature or topic tag that is in use'),
('tapas','kept separate: a venue feature or topic tag that is in use'),
('ice-cream','kept separate: a venue feature or topic tag that is in use'),
('appetizers','kept separate: a venue feature or topic tag that is in use'),
('wine','kept separate: a venue feature or topic tag that is in use'),
('vodka','kept separate: a venue feature or topic tag that is in use'),
('gin','kept separate: a venue feature or topic tag that is in use'),
('beef','kept separate: a venue feature or topic tag that is in use'),
('italian-food','kept separate: a venue feature or topic tag that is in use'),
('seafood','kept separate: a venue feature or topic tag that is in use'),
('popcorn','kept separate: a venue feature or topic tag that is in use'),
('mayonnaise','kept separate: a venue feature or topic tag that is in use'),
('tex-mex','kept separate: a venue feature or topic tag that is in use'),
('potato-salad','kept separate: a venue feature or topic tag that is in use'),
('sushi','kept separate: a venue feature or topic tag that is in use'),
('swiss-cuisine','kept separate: a venue feature or topic tag that is in use'),
('korean-food','kept separate: a venue feature or topic tag that is in use'),
('thai-cuisine','kept separate: a venue feature or topic tag that is in use'),
('fresh-fruit-juice','kept separate: a venue feature or topic tag that is in use'),
('bagels','kept separate: a venue feature or topic tag that is in use'),
('sub-sandwiches','kept separate: a venue feature or topic tag that is in use'),
('global-cuisine','kept separate: a venue feature or topic tag that is in use'),
('taiwanese-cuisine','kept separate: a venue feature or topic tag that is in use'),
('food-service','kept separate: a venue feature or topic tag that is in use'),
('art','kept separate: a venue feature or topic tag that is in use'),
('social-spot','kept separate: a venue feature or topic tag that is in use'),
('doppelkopf','kept separate: a venue feature or topic tag that is in use'),
('gifts','kept separate: a venue feature or topic tag that is in use'),
('artisan','kept separate: a venue feature or topic tag that is in use'),
('office','kept separate: a venue feature or topic tag that is in use'),
('zoo','kept separate: a venue feature or topic tag that is in use'),
('lgbtq-friendly','kept separate: queer-friendly, lgbtq-friendly and gay-friendly are distinct claims used by ingest and the map filter'),
('cedar-springs-road','kept separate: recorded do-not-merge pair with cedar-springs'),
('mental-health','overlap resolved: the duplicate is already merged into this tag'),
('coping-strategies','overlap resolved: the duplicate is already merged into this tag'),
('pep','overlap resolved: the duplicate is already merged into this tag'),
('bio-power','overlap resolved: the duplicate is already merged into this tag'),
('triple-penetration','overlap resolved: the duplicate is already merged into this tag');

create temp table _b11_close (id uuid primary key, resolution text) on commit drop;
insert into _b11_close
select d.src_id, 'merged into ' || (select slug from public.unified_tags where id = d.tgt_id) from _b11_done d
on conflict do nothing;
insert into _b11_close
select d.tgt_id, 'overlap resolved: the duplicate is merged into this tag' from _b11_done d
on conflict do nothing;
insert into _b11_close
select id, 'deprecated: out of scope, no usage' from _b11_dep_ok
on conflict do nothing;
insert into _b11_close
select t.id, k.resolution from _b11_kept k join public.unified_tags t on t.slug = k.slug
on conflict do nothing;

update public.tag_suggestions g
   set status = 'rejected', reviewed_at = now(),
       metadata = coalesce(g.metadata, '{}'::jsonb) || jsonb_build_object(
         'resolution', c.resolution, 'resolved_by', 'migration:99991792840961')
  from _b11_close c
 where g.entity_id = c.id and g.entity_type = 'tag'
   and g.source = 'excel_review_2026_10_23' and g.status = 'pending'
   and g.metadata->>'review_type' = 'Merge / remove';

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
declare v_bad int;
begin
  select count(*) into v_bad from _b11_pairs p join public.unified_tags s on s.id = p.src_id
   where s.status <> 'merged' or s.merged_into_id is distinct from p.tgt_id;
  if v_bad <> 0 then raise exception 'batch11: % merges did not land', v_bad; end if;

  select count(*) into v_bad from public.unified_tags m join public.unified_tags t on t.id = m.merged_into_id
   where m.status = 'merged' and t.status = 'merged';
  if v_bad <> 0 then raise exception 'batch11: % merged tags still point at a merged tag', v_bad; end if;

  select count(*) into v_bad from _b11_dep_ok o join public.unified_tags t on t.id = o.id where t.status <> 'deprecated';
  if v_bad <> 0 then raise exception 'batch11: % rows were not deprecated', v_bad; end if;

  -- kinderfur must not stay published, whatever else happened.
  select count(*) into v_bad from public.unified_tags where slug = 'kinderfur' and status = 'active';
  if v_bad <> 0 then raise exception 'batch11: kinderfur is still active'; end if;

  select count(*) into v_bad from _b11_close c join public.tag_suggestions g
      on g.entity_id = c.id and g.source = 'excel_review_2026_10_23'
   where g.status = 'pending' and g.metadata->>'review_type' = 'Merge / remove';
  if v_bad <> 0 then raise exception 'batch11: % inbox rows are still pending', v_bad; end if;
end
$verify$;
