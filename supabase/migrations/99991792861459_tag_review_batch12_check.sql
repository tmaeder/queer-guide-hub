-- Excel review queue 2026-10-23, batch 12: the "Check" rows.
-- Decisions taken by a person on 2026-10-24.
--
--   * 10 tags coded around minors or family roles are deprecated:
--     little-boy, little-girl, schoolgirl, schoolgirl-uniform, dark-age-play, family-roleplay, incest-play, nephew, chickenhawk, nudist-family. All unused and not indexed; deprecation is reversible.
--     nudist-parenting, merged into nudist-family, is deprecated with it.
--   * 10 overlap merges, the less-used tag into the more-used one:
--     refugee-services -> refugee-support, resource-center -> community-resource, recreational-area -> park, veranda -> outdoor-space, airport-lounge -> airline-lounge, austrian-lgbtq -> austria, pov-point-of-view -> pov, cuck-queen -> cuckquean, list-of-lgbt-periodicals -> lgbtq-media, nudist-sports-tournament -> nude-recreation.
--   * Every other row's current prose was read against its note. 15 bodies still carried a
--     sentence addressed to editors ("should be confirmed", "earlier text on this tag ...",
--     a stale "misfiled" remark); exactly that sentence is removed with replace(), so every
--     other sentence stays byte-identical. Those rows, and the rows whose prose already
--     matched their note, are closed as checked.
--
-- Left pending for a person: international-fetish-day, ro-ann-mohammed, ulrike-roseberg, international
-- (facts that need an outside source, a body that asks a reviewer why the person is
-- tagged, and a generic tag the review asks to remove or repurpose).

select set_config('app.actor', 'migration:99991792861459_tag_review_batch12_check', true);

create temp table _b12_pairs on commit drop as
select r.src, r.tgt, s.id as src_id, t.id as tgt_id
from (values
('refugee-services','refugee-support'),('resource-center','community-resource'),('recreational-area','park'),('veranda','outdoor-space'),('airport-lounge','airline-lounge'),('austrian-lgbtq','austria'),('pov-point-of-view','pov'),('cuck-queen','cuckquean'),('list-of-lgbt-periodicals','lgbtq-media'),('nudist-sports-tournament','nude-recreation')
) r(src, tgt)
join public.unified_tags s on s.slug = r.src and s.status = 'active'
join public.unified_tags t on t.slug = r.tgt and t.status = 'active'
where not exists (select 1 from public.tag_relationship_exclusions e
                  where e.tag1_id = least(s.id, t.id) and e.tag2_id = greatest(s.id, t.id));

create temp table _b12_done (src_id uuid, tgt_id uuid) on commit drop;

do $merge$
declare r record;
begin
  for r in select * from _b12_pairs loop
    begin
      update public.tag_category_assignments set is_primary = false where tag_id = r.src_id and is_primary;
      perform public.merge_tag_concept(r.tgt_id, r.src_id, 'migration:99991792861459', 'excel-review-batch12-2026-10-23');
      delete from public.tag_aliases a using public.unified_tags c
       where a.canonical_tag_id = r.src_id and c.id = r.tgt_id
         and lower(btrim(a.alias_name)) = lower(btrim(c.name));
      update public.tag_aliases set canonical_tag_id = r.tgt_id where canonical_tag_id = r.src_id;
      update public.unified_tags set merged_into_id = r.tgt_id
       where merged_into_id = r.src_id and status = 'merged' and id <> r.tgt_id;
      insert into _b12_done values (r.src_id, r.tgt_id);
    exception when others then
      raise notice 'batch12 merge skipped % -> %: %', r.src, r.tgt, sqlerrm;
    end;
  end loop;
end
$merge$;

-- nudist-parenting is merged into nudist-family. Deprecating a merge target would leave a
-- redirect to a retired page, so that merge is withdrawn and the merged-away row is
-- deprecated too (same concept, same reason).
update public.unified_tags m
   set status = 'deprecated', merged_into_id = null, deprecated_at = now(), seo_indexable = false,
       deprecation_reason = 'Review queue 2026-10-23: coded around minors or family roles'
  from public.unified_tags t
 where t.slug = 'nudist-family' and m.merged_into_id = t.id and m.status = 'merged';

create temp table _b12_dep_ok on commit drop as
select t.id, t.slug from public.unified_tags t
where t.slug = any (array['little-boy', 'little-girl', 'schoolgirl', 'schoolgirl-uniform', 'dark-age-play', 'family-roleplay', 'incest-play', 'nephew', 'chickenhawk', 'nudist-family'])
  and t.status = 'active'
  and not exists (select 1 from public.unified_tags m where m.merged_into_id = t.id);

update public.unified_tags t
   set status = 'deprecated', deprecated_at = now(), seo_indexable = false,
       deprecation_reason = 'Review queue 2026-10-23: coded around minors or family roles'
  from _b12_dep_ok o where t.id = o.id;

-- Remove exactly the editor-facing sentence; guarded so a rewritten body is left alone.
update public.unified_tags set long_description = replace(long_description, ' It does not refer to queer women, as some earlier text claimed.', '') where slug = 'binabae' and status = 'active' and position(' It does not refer to queer women, as some earlier text claimed.' in coalesce(long_description,'')) > 0;
update public.unified_tags set long_description = replace(long_description, ' The tag combines two different things and may be better split.', '') where slug = 'bisexual-slang-studies' and status = 'active' and position(' The tag combines two different things and may be better split.' in coalesce(long_description,'')) > 0;
update public.unified_tags set long_description = replace(long_description, ' The earlier text conflated bisexual women with women in same-sex relationships.', '') where slug = 'bisexual-women-couples' and status = 'active' and position(' The earlier text conflated bisexual women with women in same-sex relationships.' in coalesce(long_description,'')) > 0;
update public.unified_tags set long_description = replace(long_description, ' It may also have been intended for couples looking for bisexual women, which would need a separate tag.', '') where slug = 'bisexual-women-couples' and status = 'active' and position(' It may also have been intended for couples looking for bisexual women, which would need a separate tag.' in coalesce(long_description,'')) > 0;
update public.unified_tags set long_description = replace(long_description, ' The intended sense of this tag should be confirmed.', '') where slug = 'boy' and status = 'active' and position(' The intended sense of this tag should be confirmed.' in coalesce(long_description,'')) > 0;
update public.unified_tags set long_description = replace(long_description, ' The existing short label referred to a pet-play persona, a separate use that should not be mixed with this one.', '') where slug = 'butterfly' and status = 'active' and position(' The existing short label referred to a pet-play persona, a separate use that should not be mixed with this one.' in coalesce(long_description,'')) > 0;
update public.unified_tags set long_description = replace(long_description, ' It is not a sex position and has been misfiled in this category.', '') where slug = 'double-trouble' and status = 'active' and position(' It is not a sex position and has been misfiled in this category.' in coalesce(long_description,'')) > 0;
update public.unified_tags set long_description = replace(long_description, ', which the old short label referred to.', '.') where slug = 'female-pleasure' and status = 'active' and position(', which the old short label referred to.' in coalesce(long_description,'')) > 0;
update public.unified_tags set long_description = replace(long_description, ' The old texts described a pontoon and an unrelated sexual slang sense, neither of which fits the event category.', '') where slug = 'float' and status = 'active' and position(' The old texts described a pontoon and an unrelated sexual slang sense, neither of which fits the event category.' in coalesce(long_description,'')) > 0;
update public.unified_tags set long_description = replace(long_description, ', which earlier text on this tag wrongly suggested.', '.') where slug = 'gender-nullification' and status = 'active' and position(', which earlier text on this tag wrongly suggested.' in coalesce(long_description,'')) > 0;
update public.unified_tags set long_description = replace(long_description, ' The title combines migration with social movements, which may call for splitting or renaming the tag.', '') where slug = 'lgbt-migration-movements' and status = 'active' and position(' The title combines migration with social movements, which may call for splitting or renaming the tag.' in coalesce(long_description,'')) > 0;
update public.unified_tags set long_description = replace(long_description, ' The title copies a Wikipedia list page, and the tag may be better replaced by a simpler LGBTQ+ rights organisation tag.', '') where slug = 'list-of-lgbt-rights-organizations' and status = 'active' and position(' The title copies a Wikipedia list page, and the tag may be better replaced by a simpler LGBTQ+ rights organisation tag.' in coalesce(long_description,'')) > 0;
update public.unified_tags set long_description = replace(long_description, ' The tag is unrelated to fetishes and belongs under a community or politics category.', '') where slug = 'non-governmental-organizations' and status = 'active' and position(' The tag is unrelated to fetishes and belongs under a community or politics category.' in coalesce(long_description,'')) > 0;
update public.unified_tags set long_description = replace(long_description, ' The original text described a pond, a different sense, so check existing uses.', '') where slug = 'pool' and status = 'active' and position(' The original text described a pond, a different sense, so check existing uses.' in coalesce(long_description,'')) > 0;
update public.unified_tags set long_description = replace(long_description, ' As a venue tag, vegetarian may instead refer to food offerings, so the intended sense should be confirmed.', '') where slug = 'vegetarian' and status = 'active' and position(' As a venue tag, vegetarian may instead refer to food offerings, so the intended sense should be confirmed.' in coalesce(long_description,'')) > 0;

create temp table _b12_checked (slug text primary key) on commit drop;
insert into _b12_checked values
('acault'),
('agender-pride-flag'),
('allergy-test'),
('anal-august'),
('andreas-steinhofel'),
('apomorphine'),
('bald-girls'),
('bara'),
('beard'),
('bi-friendly'),
('binabae'),
('biology-based-categorization'),
('bisexual-slang-studies'),
('bisexual-women-couples'),
('bladder-bowel-control'),
('booty-bumping'),
('boy'),
('brat-king'),
('bruno-gmunder'),
('bts'),
('bunk'),
('butterfly'),
('cake-analogy'),
('carytown'),
('chinese-food'),
('chorionic-gonadotropin-hcg'),
('coke'),
('cool-drinks'),
('cruise-party'),
('cuauhtemoc'),
('cunt'),
('danforth-ave'),
('disciplinary-techniques'),
('donor-identity-disclosure'),
('double-trouble'),
('douching'),
('doxy-pep'),
('drag-competition'),
('drug-purification'),
('dungeon'),
('elevated-pirates-bounty'),
('erotic-target-location-error'),
('euregio'),
('exhibits'),
('eyeball-queen'),
('fairy'),
('female-pleasure'),
('female-promiscuity'),
('fijian-lgbtq'),
('final-girl'),
('float'),
('floret-flort'),
('follow-up-care'),
('french-food'),
('gagged'),
('gbl'),
('gender-identity-development'),
('gender-nullification'),
('ghb'),
('global-pride-events'),
('gudbergur-bergsson'),
('hardcore'),
('he-she'),
('heart-to-heart'),
('heinrich-hossli'),
('hermann-von-teschenberg'),
('hydration-reminders'),
('jack-and-jill-party'),
('jacques-d-adelsward-fersen'),
('jaime-salinas-bonmati'),
('jannik-schumann'),
('khawaja-sara'),
('khteuy'),
('kirsten-plotz'),
('leatherboi'),
('lgbt-migration-movements'),
('list-of-lgbt-rights-organizations'),
('list-of-same-sex-married-couples'),
('maria-rachid'),
('melbourne-pride'),
('melitta-sundstrom'),
('men-in-dresses-mid'),
('minromantic'),
('minsexual'),
('mirjam-muntefering'),
('morosexual'),
('mutual-penetration'),
('nerds-geeks'),
('new-york-themed'),
('ninsexual'),
('non-governmental-organizations'),
('nudist-equality'),
('nudist-pet-friendly-accommodation'),
('nudist-travel-photography'),
('pastry-shops'),
('performativity-of-desire'),
('piggy'),
('piggy-play'),
('placiosexual'),
('pool'),
('positive'),
('pov'),
('psychological-impact'),
('purple-hand'),
('queer-techies'),
('race-play'),
('rainbow-night'),
('richard-merlander'),
('ring-snatcher'),
('romantic'),
('rubber'),
('rumpy-rumpy'),
('sacred-feminine'),
('sacred-masculine'),
('sex-slave'),
('sexual-objectification'),
('sexual-slavery'),
('silicone-injection'),
('single-stall-bathrooms'),
('slacks'),
('smurf'),
('stendra'),
('stud'),
('symbiosexual'),
('techno-trips'),
('terf'),
('trans-safety-network'),
('transage'),
('uganda-anti-homosexuality-act'),
('uk-gay-liberation-front-festival-of-light-action'),
('ulrike-muller'),
('vegetarian'),
('wikipedia');

create temp table _b12_close (id uuid primary key, resolution text) on commit drop;
insert into _b12_close
select d.src_id, 'merged into ' || (select slug from public.unified_tags where id = d.tgt_id) from _b12_done d
on conflict do nothing;
insert into _b12_close
select id, 'deprecated: coded around minors or family roles' from _b12_dep_ok
on conflict do nothing;
insert into _b12_close
select t.id, 'checked: current prose matches the review note' from _b12_checked c
  join public.unified_tags t on t.slug = c.slug
on conflict do nothing;

update public.tag_suggestions g
   set status = 'rejected', reviewed_at = now(),
       metadata = coalesce(g.metadata, '{}'::jsonb) || jsonb_build_object(
         'resolution', c.resolution, 'resolved_by', 'migration:99991792861459')
  from _b12_close c
 where g.entity_id = c.id and g.entity_type = 'tag'
   and g.source = 'excel_review_2026_10_23' and g.status = 'pending'
   and g.metadata->>'review_type' = 'Check';

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
  select count(*) into v_bad from _b12_pairs p join public.unified_tags s on s.id = p.src_id
   where s.status <> 'merged' or s.merged_into_id is distinct from p.tgt_id;
  if v_bad <> 0 then raise exception 'batch12: % merges did not land', v_bad; end if;

  select count(*) into v_bad from public.unified_tags m join public.unified_tags t on t.id = m.merged_into_id
   where m.status = 'merged' and t.status = 'merged';
  if v_bad <> 0 then raise exception 'batch12: % merged tags still point at a merged tag', v_bad; end if;

  select count(*) into v_bad from public.unified_tags
   where slug = any (array['little-boy', 'little-girl', 'schoolgirl', 'schoolgirl-uniform', 'dark-age-play', 'family-roleplay', 'incest-play', 'nephew', 'chickenhawk', 'nudist-family']) and status = 'active';
  if v_bad <> 0 then raise exception 'batch12: % youth-coded tags are still active', v_bad; end if;

  -- No editor-facing sentence survives on the bodies this file edits.
  select count(*) into v_bad from public.unified_tags
   where slug = any (array['binabae', 'bisexual-slang-studies', 'bisexual-women-couples', 'boy', 'butterfly', 'double-trouble', 'female-pleasure', 'float', 'gender-nullification', 'lgbt-migration-movements', 'list-of-lgbt-rights-organizations', 'non-governmental-organizations', 'pool', 'vegetarian'])
     and status = 'active'
     and (long_description ~* '(earlier text|old short label|old texts|original text described|should be confirmed|misfiled in this category|may be better (split|replaced)|may call for splitting|unrelated to fetishes)');
  if v_bad <> 0 then raise exception 'batch12: % bodies still carry an editor-facing sentence', v_bad; end if;

  select count(*) into v_bad from public.unified_tags
   where slug = any (array['binabae', 'bisexual-slang-studies', 'bisexual-women-couples', 'boy', 'butterfly', 'double-trouble', 'female-pleasure', 'float', 'gender-nullification', 'lgbt-migration-movements', 'list-of-lgbt-rights-organizations', 'non-governmental-organizations', 'pool', 'vegetarian'])
     and status = 'active' and nullif(btrim(long_description), '') is null;
  if v_bad <> 0 then raise exception 'batch12: % edited bodies are now empty', v_bad; end if;

  select count(*) into v_bad from _b12_close c join public.tag_suggestions g
      on g.entity_id = c.id and g.source = 'excel_review_2026_10_23'
   where g.status = 'pending' and g.metadata->>'review_type' = 'Check';
  if v_bad <> 0 then raise exception 'batch12: % inbox rows are still pending', v_bad; end if;
end
$verify$;
