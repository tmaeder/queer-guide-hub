-- The deprecated `semen` row publishes an Indonesian district, and its revive
-- flag is armed. The reader-facing half of this is NOT fixed here, deliberately.
--
-- Found by auditing the 34-glossary working set for rows the prose passes never
-- reached. `semen` is a core term in the brief's sources (Planned Parenthood,
-- playsafe NSW, WebMD all define it) and the row carries three defects:
--
--   long_description  "Semen is a district in Kediri Regency, East Java
--                     Province, Indonesia." -- the namesake chimera, one entity
--                     class over from `futch`/`crumbs`/`HUNK`. A different
--                     SUBJECT entirely, not a narrow or generic sense.
--   description       "a vital bodily fluid in male and hermaphroditic animals"
--                     -- the essentialist register `styleguide_terms` rates
--                     `never`, and the class 99991789823744 repaired on `sperm`,
--                     `vagina`, `perineum` and `foreskin`. This is the sibling
--                     that pass missed, because it is deprecated and every
--                     earlier sweep selected on active rows.
--   seo_indexable     TRUE on a DEPRECATED row -- the publish-on-revive trap
--                     20360101101300 recorded: clearing `status` without
--                     clearing this flag publishes an unreviewed machine body
--                     to crawlers the moment the row goes active.
--
-- REVIVING IT WAS THE FIRST PLAN AND THE DATABASE REFUSED IT, CORRECTLY.
-- `tag_reject_alias_shadow()` raises: the slug `semen` is held as an alias of
-- `jizz`. That is the `pinkwashing` / `berdache` / `deadname` case -- the term
-- was never missing, it routes to a canonical row -- and the guard caught a
-- duplicate this file would otherwise have minted. Recorded here so the next
-- audit does not re-propose it.
--
-- WHAT IS NOT FIXED HERE, AND WHY IT IS A DECISION RATHER THAN AN OVERSIGHT.
-- Measured on prod: `/tags/semen` 404s and `/tags/jizz` returns 200, and
-- `jizz`'s own description reads "Slang for semen". So the glossary publishes
-- the SLANG as the indexable canonical while the clinical term has no page --
-- backwards for a corpus audited against Planned Parenthood and WebMD. Two
-- candidate fixes, both refused here:
--
--   (a) APPROVE the alias so site search resolves semen -> jizz. Since
--       20261012090000 an `auto` alias routes NOTHING -- display, auto-tagging
--       and the search bridge are all approved-only -- so the alias currently
--       reaches no reader. But approval is also an AUTO-TAGGING RULE, and
--       "semen" is a clinical noun that appears throughout sexual-health copy:
--       approving it tags every such article with a slang fetish tag. That is
--       the `lezbo`/`lezzie` refusal one register over -- the routing gain is
--       real, the failure mode is tagging health content as kink.
--   (b) FLIP the canonical so `semen` is the live row. That renames a live
--       indexable page, and 83000101143000 records that a name change
--       re-derives the slug and title-cases the result -- the `hiv-aids` trap.
--
-- Both want a human. This file therefore fixes only what is unambiguous.
--
-- THE ARMED FLAG IS A CORPUS-WIDE CONDITION AND IS DELIBERATELY NOT SWEPT.
-- Measured: 4,080 deprecated rows carry seo_indexable = true. That is the
-- default state of the column, not a defect this pass introduced, and clearing
-- it corpus-wide is its own decision with its own blast radius. It is cleared
-- on THIS row because this row is the one holding prose about Indonesia.
--
-- BODY NULLED, NOT REWRITTEN. The district is the wrong subject, and `semen`'s
-- corrected description is a single line -- enough to state what the tag is,
-- not enough to write a body from. Minting one is the guess this class came
-- from (the `doe`/`fae`/`flock` treatment of 60000301100100).
--
-- Guarded by src/lib/__tests__/glossarySemenNamesake.test.ts.

begin;

select set_config('app.actor', 'migration:99991789893281_glossary_semen_namesake', true);

-- 1. the wrong SUBJECT goes. Content-guarded, so a human who has already
--    rewritten this keeps their work.
update unified_tags
   set long_description = null
 where slug = 'semen'
   and long_description ilike '%Kediri Regency%';

-- 2. the essentialist description goes. Same guard, same reason. The row stays
--    deprecated -- this is the text a revive would publish, corrected in place.
update unified_tags
   set description = 'The fluid ejaculated from the penis, carrying sperm. Volume and consistency change with hydration, frequency and age, and anti-androgens or oestrogen reduce or stop sperm production without necessarily stopping ejaculation.',
       short_description = 'The fluid ejaculated from the penis, carrying sperm.'
 where slug = 'semen'
   and description ilike '%hermaphroditic animals%';

-- 3. disarm the revive trap on this row only.
update unified_tags
   set seo_indexable = false
 where slug = 'semen'
   and status = 'deprecated'
   and seo_indexable;

-- 4. `semen` is not a TRANSLATION of `jizz`; it is the clinical term the slang
--    stands in for. Retyping is a correctness fix with no behavioural change --
--    the row stays `auto`, so it still routes nothing, and making it route is
--    decision (a) above.
update tag_aliases
   set alias_type = 'synonym'
 where alias_slug = 'semen'
   and alias_type = 'multilingual';

-- ============================ postconditions ============================
do $verify$
declare v_bad int; v_row record; v_alias record;
begin
  select slug, status, seo_indexable, description, short_description, long_description
    into v_row from unified_tags where slug = 'semen';
  if v_row.slug is null then
    raise exception 'semen row is missing entirely';
  end if;

  -- 1. the Indonesian district must be gone from EVERY prose field, not only
  --    the one it was found in.
  if coalesce(v_row.description,'')       ilike '%Kediri%'
  or coalesce(v_row.short_description,'') ilike '%Kediri%'
  or coalesce(v_row.long_description,'')  ilike '%Kediri%' then
    raise exception 'semen still publishes the Indonesian district';
  end if;

  -- 2. the essentialist claim must be gone.
  if coalesce(v_row.description,'') ilike '%hermaphroditic%' then
    raise exception 'semen still carries the essentialist description';
  end if;

  -- 3. reached state, asserted positively: still deprecated, no longer armed,
  --    and still publishable if a human does revive it.
  if v_row.status is distinct from 'deprecated' then
    raise exception 'semen is %, expected to stay deprecated -- reviving it is blocked by tag_reject_alias_shadow', v_row.status;
  end if;
  if v_row.seo_indexable then
    raise exception 'semen is still armed to publish on revive';
  end if;
  if not tag_has_prose(v_row.description, v_row.short_description) then
    raise exception 'semen would be unpublishable if revived';
  end if;

  -- 4. the alias still exists and still routes nothing. Asserting it is typed
  --    `synonym` is not enough -- a mutation that also approved it would pass
  --    that check while creating the auto-tagging rule this file refuses.
  select alias_type, review_status into v_alias
    from tag_aliases where alias_slug = 'semen';
  if v_alias.alias_type is null then
    raise exception 'the semen alias was deleted -- that unblocks revival and is not this file''s decision';
  end if;
  if v_alias.alias_type <> 'synonym' then
    raise exception 'semen alias is typed %, expected synonym', v_alias.alias_type;
  end if;
  if v_alias.review_status <> 'auto' then
    raise exception 'semen alias is now %, but approving it creates an auto-tagging rule that tags health copy as kink', v_alias.review_status;
  end if;

  -- 5. CONTROLS. The live siblings this pass must not disturb: `sperm` keeps
  --    the trans-aware prose 99991789823744 gave it, `jizz` stays the live
  --    canonical, and `ejaculation` stays deprecated AND deindexed -- a sweep
  --    that revived either would satisfy every check above just as happily.
  select count(*) into v_bad from unified_tags
   where (slug = 'sperm'       and (status <> 'active' or description not ilike '%anti-androgen%'))
      or (slug = 'jizz'        and (status <> 'active' or not seo_indexable))
      or (slug = 'ejaculation' and (status <> 'deprecated' or seo_indexable));
  if v_bad <> 0 then
    raise exception '% sibling rows were disturbed', v_bad;
  end if;
end
$verify$;

commit;
