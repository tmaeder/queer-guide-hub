-- Four already-active rows filed under a category that contradicts their own
-- description — the half of the glossary brief the prose passes never audited.
--
-- #3807 set the category on all 55 rows it CREATED and repaired 14 on the rows
-- it REVIVED, but it only touched the 152 already-active matches where a prose
-- defect happened to surface (`androgyny` off Orientation, `lubricant` off
-- Substances & Recovery). Filing was never swept on its own. Grouping the
-- working set by category and reading the outliers gives four.
--
--   cervix                 "The lower part of the uterus, connecting it to the
--                          vagina" — filed under DYNAMICS & ROLES and flagged
--                          is_adult, while INDEXABLE. Anatomy filed as a power
--                          dynamic; the same shape as `ovaries` under Dynamics
--                          & Roles, which 99991789812140 already moved.
--   outing                 "the act of disclosing an LGBTQ person's sexual
--                          orientation or gender identity without their
--                          consent" — filed under ORIENTATION, indexable, 12
--                          assignments. Outing is a HARM DONE TO someone, not
--                          an identity label, and filing it beside `bisexual`
--                          and `lesbian` reads as though it were one. This is
--                          the sharpest of the four on a platform whose whole
--                          safety layer exists because outing is dangerous.
--   gender-non-conforming  "Expressing gender in ways that differ from societal
--                          expectations" — its own description says EXPRESSING,
--                          and it sat under Orientation.
--   fingering              "all the fun ways you can use your hands to
--                          stimulate the genitals" — an act, filed as a fetish.
--
-- READ BEFORE MOVING, AND ONE OF THE CANDIDATES SURVIVED THAT READING.
-- `pubic-hair` is also under Fetishes and looked like the same anatomy-as-kink
-- error, but its description is "A PREFERENCE for natural or styled pubic hair
-- on a partner" — that is a preference, which is exactly what the category
-- means. It is asserted as a control below.
--
-- ALSO LEFT: `blood-play`, `temperature-play` and `rough-sex` under Fetishes.
-- Fetishes vs Practices & Play for a play STYLE is a real judgement call and
-- this corpus uses both conventions; under-reaching is the correct error. Same
-- for `cosplay` under Media & Entertainment.
--
-- Moved by writing `category_id` ALONE and letting both triggers reconcile —
-- the BEFORE trigger derives the `category` text and the AFTER trigger moves
-- the primary junction row, which is what /tags/:slug renders (precedent
-- 20261006110000). Note this is the UPDATE path, where those triggers DO fire;
-- the INSERT path does not, which is why 99991789812141 had to wire all three
-- representations by hand.
--
-- `cervix` also loses is_adult: it was almost certainly set by its Dynamics &
-- Roles filing, and the cervix is not adult content.
--
-- Guarded by src/lib/__tests__/glossaryCategoryRefile.test.ts.

begin;

select set_config('app.actor', 'migration:99991789846890_glossary_category_refile', true);

update unified_tags t set category_id = c.id
from tag_categories c, (values
  ('cervix',                'physical-reproductive'),
  ('outing',                'violence-hate'),
  ('gender-non-conforming', 'expression-presentation'),
  ('fingering',             'practices-play')
) as v(slug, cat)
where t.slug = v.slug
  and c.slug = v.cat
  and t.category_id is distinct from c.id;

update unified_tags set is_adult = false
where slug = 'cervix' and is_adult;

-- ============================ postconditions ============================
do $verify$
declare v_bad int; v_n int;
begin
  -- 1. ALL THREE category representations agree on every moved row. Asserting
  --    category_id alone is the vacuous form — it is the lever, not the result.
  select count(*) into v_n from (values
    ('cervix','physical-reproductive'), ('outing','violence-hate'),
    ('gender-non-conforming','expression-presentation'), ('fingering','practices-play')
  ) as v(slug, cat)
  join unified_tags t on t.slug = v.slug
  join tag_categories c on c.slug = v.cat
  where t.category_id = c.id
    and t.category = c.name
    and exists (select 1 from tag_category_assignments a
                where a.tag_id = t.id and a.category_id = c.id and a.is_primary);
  if v_n <> 4 then
    raise exception 'expected 4 rows agreeing across category_id / text / junction, found %', v_n;
  end if;

  -- 2. none of them is still in the category it was moved out of
  select count(*) into v_bad from unified_tags
  where (slug in ('cervix') and category = 'Dynamics & Roles')
     or (slug in ('outing','gender-non-conforming') and category = 'Orientation')
     or (slug in ('fingering') and category = 'Fetishes');
  if v_bad <> 0 then raise exception '% rows did not move', v_bad; end if;

  -- 3. cervix is anatomy, not adult content
  select count(*) into v_bad from unified_tags where slug = 'cervix' and is_adult;
  if v_bad <> 0 then raise exception 'cervix is still flagged adult'; end if;

  -- 4. CONTROLS. pubic-hair reads like the same error and is NOT one — its
  --    description is a preference, which is what Fetishes means. A sweep that
  --    took it would satisfy check 2 just as happily. The three play-style rows
  --    are deliberate judgement calls and must also survive.
  select count(*) into v_bad from unified_tags
  where slug in ('pubic-hair','blood-play','temperature-play','rough-sex')
    and category is distinct from 'Fetishes';
  if v_bad <> 0 then raise exception '% deliberately-left rows were refiled', v_bad; end if;

  -- 5. nothing here touched prose
  select count(*) into v_bad from unified_tags
  where slug in ('cervix','outing','gender-non-conforming','fingering')
    and not tag_has_prose(description, short_description);
  if v_bad <> 0 then raise exception '% moved rows lost their prose', v_bad; end if;
end
$verify$;

commit;
