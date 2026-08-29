-- The fifteen positions from the Lovehoney "queer sex positions" list.
--
-- SEPARATE MIGRATION BECAUSE THE PROVENANCE IS DIFFERENT AND WEAKER.
-- These are one retailer's own coinages, not community vocabulary, and the
-- live article is now only a hub of image cards: every per-position page it
-- links to is dead (404, or a 301 onto a generic hub). The mechanics below
-- were recovered from Internet Archive captures of those dead pages
-- (2019–2023; fourteen from lovehoney.com, "Netflix and Chill" from the .com.au
-- mirror). Descriptions are original prose describing body mechanics only.
--
-- If these ever need to be retired, they are exactly this migration's rows —
-- keeping them out of 20261016100100 is what makes that a one-line predicate.
--
-- COLLISION NOTE: eleven of the fifteen are ordinary English phrases
-- (Freeway, Domino, Standoff, Aphrodite, Over the Rainbow, Rubdown ...) and a
-- tag NAME is an unconditional auto-tagging rule in
-- run_tag_assignment_reconcile. All fifteen were checked against the live
-- free-text tag corpus of venues / news_articles / community_groups and
-- against every active tag name and slug: zero collisions, measured, so they
-- are safe to add under their own names. Re-measure before adding more.

select set_config('app.actor', 'migration:sex-positions-lovehoney', false);

do $$
declare
  v_cat  uuid;
  v_name text;
begin
  select id, name into v_cat, v_name from tag_categories where slug = 'sex-positions';
  if v_cat is null then
    raise exception 'Positions stop is missing — 20261016100000 must run first';
  end if;

  insert into unified_tags (name, slug, description, category_id, category,
                            entity_kind, status, wikidata_id)
  select v.name, v.slug, v.descr, v_cat, v_name, 'concept', 'active', null
  from (values
    ('up-against-it','Up Against It','One partner is lifted and carried with their legs around the other''s waist and their back braced against a wall. A standing position that needs strength rather than furniture.'),
    ('rubdown','Rubdown','Both partners lie on their backs alongside each other and reach across for mutual genital stimulation.'),
    ('shibari-spoon','Shibari Spoon','Spooning with the front partner in rope — wrists bound, one ankle tied to the opposite thigh and that thigh to the upper arm — while the partner behind penetrates.'),
    ('netflix-and-chill','Netflix and Chill','One partner perches on the back of a sofa with their legs apart while the other sits on the cushion below and tips their head back to give oral.'),
    ('heart-to-heart','Heart to Heart','The receiver on their back with the legs apart and the giver lying full length on top, face to face and chest to chest. A pillow under the hips changes the angle.'),
    ('aphrodite','Aphrodite','One partner reclines with the legs slightly parted while the other kneels alongside, watching, both touching themselves and each other.'),
    ('lets-talk-about','Let''s Talk About...','Both partners sit at opposite ends of a sofa facing each other and masturbate while holding eye contact, without touching.'),
    ('domino','Domino','A three-person position: one lies on their back, the second straddles them on their knees giving oral with the hips raised, and the third kneels behind the second to penetrate.'),
    ('stand-and-deliver','Stand and Deliver','The receiver lies back on a waist-high surface with the legs raised or on the giver''s shoulders while the giver stands and holds their hips.'),
    ('sidle-up','Sidle Up','The receiver sits back with the legs parted while the giver lies on their side with their head across the receiver''s thigh to give oral.'),
    ('freeway','Freeway','Both partners kneel facing the same direction: the one in front takes a suction-cup toy mounted ahead of them while the one behind penetrates.'),
    ('pleasure-bound','Pleasure Bound','The receiver on their back with the knees bent and the feet drawn in, cuffed at the ankles and thighs with the wrists clipped to the ankle straps, while the partner gives oral.'),
    ('the-magic-number','The Magic Number','Two partners in a 69 while a third kneels behind and penetrates the upper one.'),
    ('standoff','Standoff','The receiver stands with their hands braced on waist-high furniture while the partner stands close behind, holding their waist and entering from the rear.'),
    ('over-the-rainbow','Over the Rainbow','The receiver on their back with the knees bent toward the chest while the giver holds a push-up stance above on the arms and knees and thrusts downward.')
  ) as v(slug, name, descr)
  where not exists (select 1 from unified_tags u where u.slug = v.slug);

  -- Same as the main import: no trigger files a tag on INSERT, so without
  -- this the fifteen stay is_adult=false and seo_indexable=true.
  insert into tag_category_assignments (tag_id, category_id, is_primary)
  select t.id, v_cat, true
  from unified_tags t
  where t.category_id = v_cat
  on conflict (tag_id, category_id) do nothing;
end $$;

-- Ontology edges. Only 'broader' and 'related' satisfy both relation_type
-- CHECKs; direction is source = specific, target = general.
insert into tag_relations (source_tag_id, target_tag_id, relation_type, confidence, review_status)
select s.id, t.id, 'broader', 1.0, 'approved'
from (values
  ('up-against-it','anal-sex'),
  ('shibari-spoon','spoons'),
  ('heart-to-heart','missionary'),
  ('over-the-rainbow','missionary'),
  ('stand-and-deliver','anal-sex'),
  ('standoff','anal-sex'),
  ('freeway','anal-sex'),
  ('netflix-and-chill','oral-sex'),
  ('sidle-up','oral-sex'),
  ('pleasure-bound','oral-sex'),
  ('rubdown','mutual-masturbation'),
  ('aphrodite','mutual-masturbation'),
  ('lets-talk-about','mutual-masturbation'),
  ('domino','group-sex'),
  ('the-magic-number','group-sex'),
  ('the-magic-number','69')
) as e(src, tgt)
join unified_tags s on s.slug = e.src
join unified_tags t on t.slug = e.tgt
where s.id <> t.id
on conflict (source_tag_id, target_tag_id, relation_type) do nothing;

-- ── verify ─────────────────────────────────────────────────────────────────
do $$
declare v_n int; v_bad int;
begin
  select count(*) into v_n from unified_tags
  where slug in ('up-against-it','rubdown','shibari-spoon','netflix-and-chill',
                 'heart-to-heart','aphrodite','lets-talk-about','domino',
                 'stand-and-deliver','sidle-up','freeway','pleasure-bound',
                 'the-magic-number','standoff','over-the-rainbow');
  if v_n <> 15 then
    raise exception 'expected 15 Lovehoney positions, found %', v_n;
  end if;

  -- gated, filed, and the text mirror agrees
  select count(*) into v_bad
  from unified_tags t
  left join tag_categories c on c.id = t.category_id
  where t.slug in ('up-against-it','rubdown','shibari-spoon','netflix-and-chill',
                   'heart-to-heart','aphrodite','lets-talk-about','domino',
                   'stand-and-deliver','sidle-up','freeway','pleasure-bound',
                   'the-magic-number','standoff','over-the-rainbow')
    and (t.is_adult is not true
         or t.seo_indexable is not false
         or c.slug is distinct from 'sex-positions'
         or t.category is distinct from c.name
         or (select count(*) from tag_category_assignments a
              where a.tag_id = t.id and a.is_primary) <> 1);
  if v_bad > 0 then
    raise exception '% Lovehoney positions are ungated or misfiled', v_bad;
  end if;

  -- adding these must not create a twin name
  select count(*) into v_bad from (
    select lower(name) from unified_tags
    where status = 'active' and merged_into_id is null
    group by lower(name) having count(*) > 1
  ) d;
  if v_bad > 14 then
    raise exception 'duplicate active tag names rose to % (was 14)', v_bad;
  end if;
end $$;
