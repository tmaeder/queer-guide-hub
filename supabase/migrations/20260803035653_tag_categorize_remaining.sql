-- Categorise the tags that had no category assignment at all.
--
-- 68 active tags sat outside the governed tree entirely, so get_similar_tags'
-- category path no-oped for them and they were invisible to every
-- category-driven surface. Hand-classified; the tree has no Food or Sport node,
-- so restaurant-menu scrape residue and stray objects are DEPRECATED rather
-- than forced into a queer-content category they do not belong in --
-- restore_deprecated_tag() reverses that.
--
-- Note straenbahnschaffner / grohandelskaufmann: German occupation words
-- (Straßenbahnschaffner, Großhandelskaufmann) whose 'ß' was DELETED by the old
-- diacritic-dropping slugifier fixed in 20260802104650. They are non-English
-- and meaningless as slugs, so they go with the deprecations.
--
-- Same per-row discipline as 20260803... : the AFTER trigger
-- unified_tags_recompute_is_adult writes unified_tags for each assignment, so
-- multi-row statements raise 27000.

create temp table _cat(slug text primary key, cat text) on commit drop;
insert into _cat(slug, cat) values
  -- rights and activism
  ('social-justice','political-activism'), ('sex-positive-movement','political-activism'),
  ('sex-positive-feminism','political-activism'), ('sexecology','political-activism'),
  ('sexual-and-reproductive-health-and-rights','legal-rights'),
  -- identity and orientation
  ('sexual-identity','questioning-labels'), ('sexual-minority','questioning-labels'),
  ('klein-sexual-orientation-grid','sexual-orientation'),
  ('demographics-of-sexual-orientation','sexual-orientation'),
  ('environment-and-sexual-orientation','sexual-orientation'),
  ('prenatal-hormones-and-sexual-orientation','sexual-orientation'),
  ('handkerchief-code','symbols-flags'), ('leather-pride-flag','symbols-flags'),
  -- sexual health and practice
  ('chemsex','substances-harm-reduction'), ('casual-sex','practices-play'),
  ('sex-life','practices-play'), ('conventional-sex','practices-play'),
  ('sexual-abstinence','practices-play'), ('anonymous-sex','practices-play'),
  ('sexual-partner','relationship-structures'), ('safe-word','consent-negotiation'),
  ('forced-orgasm','practices-play'), ('erotic-hypnosis','practices-play'),
  ('electroplay','practices-play'), ('algolagnia','practices-play'),
  ('sexual-pain-penetration-disorder','physical-reproductive'),
  -- kink roles, gear and dynamics
  ('d-s','bdsm-power-exchange'), ('female-dominance','bdsm-power-exchange'),
  ('male-dominance','bdsm-power-exchange'), ('female-submission','bdsm-power-exchange'),
  ('dominatrix','bdsm-power-exchange'), ('fetishism','fetishes-interests'),
  ('breast-fetishism','fetishes-interests'), ('rubber-fetish','fetishes-interests'),
  ('cock-cage','gear-aesthetics'), ('ring-gag','gear-aesthetics'),
  ('ball-gag','gear-aesthetics'), ('penis-sleeve','gear-aesthetics'),
  ('bondage-porn','fetishes-interests'),
  -- sex work and adult industry
  ('gay-for-pay','sexual-roles'), ('porn-star','professions-allies'),
  ('adult-performer','professions-allies'),
  -- venues, media, professions
  ('event-space','venues-nightlife'), ('open-kitchen','venues-nightlife'),
  ('galleries','art-literature-zines'), ('novels','art-literature-zines'),
  ('songwriter','media-film-music'), ('hardrock','media-film-music'),
  ('tv-moderator','professions-allies'), ('pastor','professions-allies'),
  ('manager','professions-allies'), ('training','workplace-education-policy'),
  -- sport
  ('judo','events-scene'), ('ski','events-scene'), ('skateboard','events-scene'),
  ('olympia','events-scene');

create temp table _dep(slug text primary key, why text) on commit drop;
insert into _dep(slug, why) values
  ('onions','venue menu scrape residue'), ('honey','venue menu scrape residue'),
  ('liver','venue menu scrape residue'), ('cobb-salad','venue menu scrape residue'),
  ('scallions','venue menu scrape residue'), ('tartar-sauce','venue menu scrape residue'),
  ('sunny-afternoon','venue scrape residue'), ('douche','not a taxonomy concept'),
  ('brazilian','ambiguous scrape token (nationality vs waxing), no usable meaning'),
  ('child','not a queer-content concept'),
  ('straenbahnschaffner','German occupation, slug mangled by the old slugifier'),
  ('grohandelskaufmann','German occupation, slug mangled by the old slugifier'),
  ('bischof','German occupation (Bischof), not English');

do $do$
declare r record; v_cat int := 0; v_dep int := 0;
begin
  perform set_config('app.actor', 'admin:tag-categorize-20260803', true);

  for r in
    select t.id tag_id, c.id cat_id from _cat f
      join public.unified_tags t on t.slug = f.slug and t.status = 'active'
      join public.tag_categories c on c.slug = f.cat
     where not exists (select 1 from public.tag_category_assignments a where a.tag_id = t.id)
  loop
    insert into public.tag_category_assignments (tag_id, category_id, is_primary)
    values (r.tag_id, r.cat_id, true)
    on conflict (tag_id, category_id) do update set is_primary = true;
    v_cat := v_cat + 1;
  end loop;

  for r in
    select t.id, d.why from _dep d
      join public.unified_tags t on t.slug = d.slug and t.status = 'active'
  loop
    update public.unified_tags
       set status = 'deprecated', deprecated_at = now(),
           deprecation_reason = 'categorisation sweep: ' || r.why
     where id = r.id;
    v_dep := v_dep + 1;
  end loop;

  raise notice 'categorised %, deprecated %', v_cat, v_dep;
end $do$;;
