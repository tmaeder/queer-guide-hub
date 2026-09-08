-- A category for theory and scholarship, because the taxonomy had nowhere to put it.
--
-- WHAT WAS WRONG. The glossary carries the vocabulary of queer theory and the
-- fields around it, and none of the 53 existing categories is about scholarship.
-- So the terms were scattered into whatever was nearest, measured on prod:
--
--   queer-theory                   -> Orientation            (it is not an orientation)
--   gender-performativity          -> Orientation
--   homonormativity                -> Events & Parties
--   homonationalism                -> Laws & Legal Rights
--   cisnormativity                 -> Dynamics & Roles       (the BDSM line)
--   heteronormativity              -> Relationship Structures
--   disidentification              -> Umbrella Terms & Labels
--   performativity, queer-ecology, queer-pedagogy,
--   social-construction-of-gender  -> uncategorised
--
-- `cisnormativity` filed under "Dynamics & Roles" is the sharpest of these: that
-- line holds BDSM dynamics, so the page presents a structural analysis of gender
-- as a kink role.
--
-- THIS MIGRATION CREATES THE CATEGORY AND NOTHING ELSE. Filing happens in
-- 20360401100100, which is the one place that writes tag rows, so there is a
-- single owner of the three filing surfaces rather than two migrations racing to
-- set them.
--
-- IT IS DELIBERATELY NOT A SENSE CATEGORY. `SENSE_CATEGORY_KEYS` in
-- supabase/functions/_shared/tag-style.ts lists categories where the generic
-- English sense of a term is evidence of the WRONG subject — "Vacuum Pump" under
-- Fetishes is not industrial vacuum physics. For theory the scholarly sense IS
-- the subject, so adding this slug there would make the generic-sense gate refuse
-- correct grounding. src/lib/__tests__/queerTheoryGlossary.test.ts asserts the
-- slug stays out of that set.
--
-- Reversible: one row, no data migrated. Deleting it would orphan
-- `unified_tags.category_id` values, so the down-path is to refile first.

set local statement_timeout = '120s';

select set_config('app.actor', 'migration:theory-scholarship-category', true);

do $mig$
declare
  v_parent uuid;
  v_id     uuid;
  v_n      int;
begin
  -- Level 1 under History & Rights, which already holds Movements & Milestones,
  -- Politics & Activism, Laws & Legal Rights, Religion & Belief, People & Icons
  -- and Work/School/Institutions at sort_order 1..6.
  select id into strict v_parent from public.tag_categories where slug = 'history-rights';

  insert into public.tag_categories (name, slug, description, parent_id, level, sort_order)
  values (
    'Theory & Scholarship',
    'theory-scholarship',
    'Academic frameworks that analyse gender, sexuality and power — queer theory and the '
      || 'fields that grew from, alongside and against it.',
    v_parent, 1, 7)
  on conflict (slug) do update
     set name        = excluded.name,
         description = excluded.description,
         parent_id   = excluded.parent_id,
         level       = excluded.level,
         sort_order  = excluded.sort_order,
         updated_at  = now();

  select id into strict v_id from public.tag_categories where slug = 'theory-scholarship';

  -- Assert the shape rather than trusting the insert: `dangling_category_id` is a
  -- zero-invariant in scripts/check-tag-hygiene.mjs, and a level/parent mismatch
  -- would put the line at the wrong depth in the admin tree.
  select count(*) into v_n from public.tag_categories
   where id = v_id and level = 1 and parent_id = v_parent;
  if v_n <> 1 then
    raise exception 'theory-scholarship: category is not a level-1 child of history-rights';
  end if;
end
$mig$;
