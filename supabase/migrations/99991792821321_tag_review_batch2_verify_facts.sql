-- Review-queue batch 2 (2026-10-23): "Verify facts / meaning" rows from the Review
-- Queue sheet of queerguide-unified_tags-2026-10-23_cleaned.xlsx, decided against
-- what each tag is actually attached to (unified_tag_assignments), not against the
-- sheet's guess. The sheet's corrected text already landed in 99991792755932; for
-- these rows that text was an INFERENCE ("meaning inferred", "confirm"), and for a
-- tag with real usage the tagged content is the evidence.
--
-- A. Thirteen descriptions corrected because the tagged content contradicts them:
--    set           23 products sold as sets/kits; text said psychedelic "mindset"
--    teacher       7 news items about teachers (incl. a harassment campaign against
--                  a trans teacher), filed under Fetishes as a role-play persona,
--                  which put that news behind the 18+ gate
--    c-ring        5 vibrating cock rings; text said a C-shaped couples' vibrator
--    cage          42 chastity cages; text said "chastity or confinement"
--    goose, tiger, spider, monster, strawberry
--                  merchandise prints ("silly goose" pride items, tiger-stripe,
--                  spider-web Halloween underwear, monster-face briefs) and
--                  flavoured condoms; text invented pet-play / rope personas
--    esc           1 opera event; text guessed "escort" -- retracted, not replaced
--    brazilian-venue  every tagged venue is IN Brazil
--    chocolate     65 of 93 uses are the colour name on products
-- B. Twelve junk rows deprecated (0 uses, no aliases or relations, not
--    human-reviewed): four numeric-ID titles, four bare dates, four run-together
--    list headings ("LGBTQ+ Chatrooms/Chefs").
-- C. Inbox rows closed for A, B and for 24 tags whose inferred text the tagged
--    content confirms (vibe-bold, us-based, coach, priest, ...).
--
-- Category moves write category_id (the triggers re-derive the text and the
-- primary junction row) and then delete the OLD membership, which the AFTER
-- trigger only demotes: left in place, an adult category keeps is_adult true.

set local statement_timeout = '10min';
select set_config('app.actor', 'migration:99991792821321_tag_review_batch2_verify_facts', true);

create temp table _b2 (slug text primary key, sd text, d text, new_cat text) on commit drop;
insert into _b2 values
('set', 'Product sold as a set or kit', 'Marks products sold together as a set or kit, such as anal trainer sets, strap-on kits or matching clothing sets.', 'Gear'),
('teacher', 'Teachers and school staff', 'Teachers and other school staff, including news about LGBTQ+ teachers and the harassment campaigns aimed at them.', 'Work, School & Institutions'),
('c-ring', 'Cock ring, often vibrating', 'Short for cock ring: a ring worn around the base of the penis, or the penis and testicles, often with a built-in vibrator.', null),
('cage', 'Chastity cage', 'A chastity cage: a device that encloses the penis to prevent erection, often locked and worn in orgasm-denial or power-exchange play.', null),
('goose', 'Goose motif or meme', 'Goose imagery, especially the ''silly goose'' meme and ''honk'' jokes, on pride merchandise and in news.', 'Expression & Style'),
('tiger', 'Tiger-stripe print', 'Tiger and tiger-stripe prints on clothing and accessories.', 'Expression & Style'),
('spider', 'Spider or web motif', 'Spider and spider-web prints, often Halloween-themed, on underwear and clothing.', 'Expression & Style'),
('monster', 'Monster motif', 'Monster faces and creature imagery on clothing, and monster-themed events.', 'Expression & Style'),
('strawberry', 'Strawberry flavour or print', 'Strawberry flavour or print, such as flavoured condoms and strawberry-patterned clothing.', 'Expression & Style'),
('esc', null, null, null),
('brazilian-venue', 'Venue in Brazil', 'A venue located in Brazil.', null),
('chocolate', 'Chocolate, as food or colour', 'Chocolate as food, such as chocolatiers, chocolate cafés and desserts, and as the colour name for products in a deep-brown shade.', null);

create temp table _b2_old on commit drop as
select t.id, b.slug, t.category_id as old_cat, nc.id as new_cat_id
from _b2 b join public.unified_tags t on t.slug = b.slug and t.status = 'active'
left join public.tag_categories nc on nc.name = b.new_cat;

update public.unified_tags t
   set short_description = b.sd, description = b.d, long_description = null
  from _b2 b where t.slug = b.slug and t.status = 'active';

update public.unified_tags t
   set category_id = o.new_cat_id
  from _b2_old o
 where t.id = o.id and o.new_cat_id is not null and t.category_id is distinct from o.new_cat_id;

delete from public.tag_category_assignments j
 using _b2_old o
 where j.tag_id = o.id and o.new_cat_id is not null
   and j.category_id = o.old_cat and o.old_cat is distinct from o.new_cat_id
   and not j.is_primary;

-- B. junk rows
create temp table _b2_junk (slug text primary key) on commit drop;
insert into _b2_junk values
('id-1'),('id-1441'),('id-2892'),('id-868'),
('december-21-1992'),('december-29-1973'),('january-27-1986'),('november-1-1989'),
('lgbtq-biographies-birth-parents'),('lgbtq-blood-donors-bookshops'),
('lgbtq-chatrooms-chefs'),('lgbtq-children-choruses');

update public.unified_tags t
   set status = 'deprecated', deprecated_at = now(), seo_indexable = false,
       deprecation_reason = 'Review queue 2026-10-23: placeholder or run-together title with no usage'
  from _b2_junk j
 where t.slug = j.slug and t.status = 'active' and t.usage_count = 0 and not t.human_reviewed;

-- C. close the inbox rows
create temp table _b2_close (slug text primary key, resolution text) on commit drop;
insert into _b2_close
select slug, 'description corrected against tagged content' from _b2
union all select slug, 'deprecated: placeholder or run-together title' from _b2_junk
union all select s, 'inferred text confirmed against tagged content' from unnest(array[
  'vibe-bold','us-based','gb-based','relaxation','french','spanish','memory','coach',
  'acolyte','priest','aggression','bestiality','perception','video-lounge','hotel-based',
  'legacy','training','business','relaxed','contemporary','public','strategy',
  'german-establishment','tea']) s;

update public.tag_suggestions g
   set status = 'rejected', reviewed_at = now(),
       metadata = coalesce(g.metadata, '{}'::jsonb) || jsonb_build_object(
         'resolution', c.resolution, 'resolved_by', 'migration:99991792821321')
  from _b2_close c join public.unified_tags t on t.slug = c.slug
 where g.entity_id = t.id and g.entity_type = 'tag'
   and g.source = 'excel_review_2026_10_23' and g.status = 'pending';

do $verify$
declare v_bad int;
begin
  select count(*) into v_bad from _b2 b join public.unified_tags t on t.slug = b.slug and t.status = 'active'
   where t.short_description is distinct from b.sd or t.description is distinct from b.d
      or t.long_description is not null;
  if v_bad <> 0 then raise exception 'batch2: % corrected descriptions did not land', v_bad; end if;

  select count(*) into v_bad from _b2 b join public.unified_tags t on t.slug = b.slug and t.status = 'active'
   join public.tag_categories c on c.name = b.new_cat
   where b.new_cat is not null and (t.category_id is distinct from c.id or t.category is distinct from b.new_cat
     or not exists (select 1 from public.tag_category_assignments j where j.tag_id = t.id and j.category_id = c.id and j.is_primary));
  if v_bad <> 0 then raise exception 'batch2: % category moves are incomplete', v_bad; end if;

  -- The point of moving teacher and the five merch-print tags: none may stay 18+.
  select count(*) into v_bad from public.unified_tags
   where slug in ('teacher','goose','tiger','spider','monster','strawberry') and status = 'active' and is_adult;
  if v_bad <> 0 then raise exception 'batch2: % moved tags are still is_adult', v_bad; end if;

  select count(*) into v_bad from _b2_junk j join public.unified_tags t on t.slug = j.slug
   where t.status = 'active' and t.usage_count = 0 and not t.human_reviewed;
  if v_bad <> 0 then raise exception 'batch2: % junk rows were not deprecated', v_bad; end if;

  select count(*) into v_bad from _b2_close c join public.unified_tags t on t.slug = c.slug
   join public.tag_suggestions g on g.entity_id = t.id and g.source = 'excel_review_2026_10_23'
   where g.status = 'pending';
  if v_bad <> 0 then raise exception 'batch2: % inbox rows are still pending', v_bad; end if;
end
$verify$;
