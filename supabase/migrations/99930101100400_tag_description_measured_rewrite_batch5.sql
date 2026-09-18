-- Tag description standard, measured rewrite batch 5.
--
-- Continues the high-usage ordering batch 4 established, which yielded 15 of 22
-- hand-read (68%) against 25-36% for the seeded order. This tranche read the next
-- 30 rows by usage and takes FIVE. The low yield is the result, not a shortfall:
-- the high-usage head is largely correct, and padding a batch with
-- generic-but-not-wrong rows is the bulk rewrite this repo already ran and
-- retired when the tag prose judge retracted 16 of its first 18 rows with 13 of
-- them WRONG.
--
-- FOUR of the five are the original rule: the row's own evidence establishes a
-- sense the published description contradicts. `music` is the sharpest case in
-- the series so far, because its evidence sits on the row TWICE --
-- short_description is "Art using sound" and long_description is the art form,
-- while `description` alone published a kink/sensory-play definition. That is
-- the half-repaired class of 60000301100100 seen from a third side: someone
-- fixed the summary and the body and left the lead paragraph standing.
--
-- TWO rows turn on what they are ATTACHED to -- the `gruppen` lesson of batch 4,
-- where a tag's assignments settled a sense its prose got wrong. Measured on
-- unified_tag_assignments:
--
--   party         7,854 uses -- 6,793 event / 797 marketplace / 212 hotel
--   bipoc         4,257 uses -- 4,022 event / 235 news
--   mat-spandex   4,092 uses -- 4,085 marketplace_listing
--   accessibility 1,768 uses -- 1,766 NEWS / 2 venues
--   music           929 uses --   692 news / 206 venues / 31 events
--
-- `party` published "Hotels close to nightlife or with on-site bars and clubs."
-- -- a hotel-amenity definition, on a tag filed `Vibe & Crowd` that is 87%
-- events. `mat-spandex` published DuPont polymer chemistry (Joseph Shivers,
-- 1958) on a `mat-` material-namespace row carrying 4,085 marketplace listings;
-- that is the `mat-metal` class batch 4 repaired, and the namespace corroborates
-- it -- 8 of the 12 `mat-` siblings carry NO description at all, and the only
-- other two non-null ones (`mat-metal`, `mat-lace`) were the same encyclopedic
-- import.
--
-- `bipoc` is a different defect and the most visible: its description read
-- "BIPOC stands for ." -- the expansion is LITERALLY MISSING, on an indexable
-- row with 4,257 assignments. Its second sentence is repaired too rather than
-- left, because "an umbrella term ... to encompass racial and ethnic minorities"
-- is the definition of POC and drops the Black and Indigenous specificity that
-- is the entire reason the acronym exists.
--
-- `accessibility` is a CLAUSE DELETION ONLY and is labelled separately so a
-- later reader cannot take the rewrite group's licence and apply it here. Its
-- prose is generic-but-not-wrong -- and note it is a NEWS TOPIC tag, 1,766 of
-- 1,768 assignments, not the venue facet its category suggests -- except for a
-- trailing "people with disabilities, including LGBTQIA+ individuals", which
-- asserts that LGBTQIA+ people are a SUBSET of people with disabilities. On this
-- platform that reads as pathologising. Everything else in the sentence stays
-- byte-identical, and postcondition 2 asserts that: "the clause is gone" is
-- equally satisfied by a pass that replaced the whole description.
--
-- THE ACTOR DECLARATION IS LOAD-BEARING HERE, and this file says so because
-- batch 4's tranche was the opposite case and the next pass should not copy the
-- wrong precedent from whichever file it opens. `mat-spandex` and `music` are
-- human_reviewed = true; verified live rather than assumed, the undeclared
-- UPDATE returns:
--   human_reviewed tag 43ab65b5-1a09-404f-aa68-47e884ba1c34
--   cannot be modified by system:trigger
-- The FIRST probe of this was VACUOUS and nearly shipped as evidence: it ran
-- `set description = description`, which changes no column, so
-- log_unified_tag_change() never fired and the probe returned ALLOWED. A
-- self-assignment cannot test a trigger that gates on a change.
--
-- DEFERRED, each with the reason it cannot be reached rather than "we did not
-- get to them":
--   youth (2,390) -- "The period of life between childhood and adulthood..." is
--     a correct definition of the word, merely generic on an `Audiences` row.
--     Under-reaching is the correct error; this is the ice-cream/tapas
--     disposition, not the rooftop one.
--   lesbian, gay -- an identity definition is an editorial decision, not a
--     defect. Guessing a sense is how this whole class arose.
--   naturist (572 chars) -- encyclopedic but accurate and useful, and its
--     "lifestyle" is the protected community-vocabulary sense that
--     styleguide term precision deliberately does not match.
--   writer -- "Author or scribe" is THIN, not wrong.
--
-- Soft on preconditions, hard on postconditions.

begin;

select set_config('app.actor', 'admin:tag-description-measured-rewrite-b5', true);

-- ---- sense settled by the row's assignments (the `gruppen` rule) ------------
update unified_tags set description =
  'A party atmosphere: dancing, loud music and a crowd that stays late.'
where slug = 'party' and status = 'active'
  and description like '%Hotels close to nightlife%';

update unified_tags set description =
  'A synthetic fiber that stretches and returns to its shape, also sold as Lycra or elastane. Blended into garments that need to fit close to the body.'
where slug = 'mat-spandex' and status = 'active'
  and description like '%Joseph Shivers at DuPont%';

-- ---- the expansion was literally missing ------------------------------------
update unified_tags set description =
  'BIPOC stands for Black, Indigenous, and People of Color. Used mainly in the United States, it names Black and Indigenous communities specifically rather than folding them into one category.'
where slug = 'bipoc' and status = 'active'
  and description like '%BIPOC stands for .%';

-- ---- the lead paragraph contradicted this row's OWN summary and body --------
update unified_tags set description =
  'Sound arranged into rhythm, melody and harmony. Applied to artists, releases and venues, and to news coverage of music in queer culture.'
where slug = 'music' and status = 'active'
  and description like '%enhance sexual or sensory experiences%';

-- ---- CLAUSE DELETION ONLY: nothing else in the sentence moves ---------------
update unified_tags
   set description = replace(description, ' with disabilities, including LGBTQIA+ individuals.', ' with disabilities.')
where slug = 'accessibility' and status = 'active'
  and description like '%with disabilities, including LGBTQIA+ individuals.%';

do $verify$
declare
  v_bad int;
begin
  -- 1. THE REACHED STATE, COUNTED POSITIVELY. Counting rows in a BAD state
  --    returns zero for a slug that has gone missing from the corpus entirely.
  select count(*) into v_bad from unified_tags
  where status = 'active' and (
       (slug='party'         and description = 'A party atmosphere: dancing, loud music and a crowd that stays late.')
    or (slug='mat-spandex'   and description like 'A synthetic fiber that stretches and returns to its shape%')
    or (slug='bipoc'         and description like 'BIPOC stands for Black, Indigenous, and People of Color.%')
    or (slug='music'         and description like 'Sound arranged into rhythm, melody and harmony.%')
    or (slug='accessibility' and description like '%can be accessed and used by people with disabilities.')
  );
  if v_bad <> 5 then
    raise exception 'tag_description_measured_rewrite_b5: expected 5 rows in the reached state, found %', v_bad;
  end if;

  -- 2. THE CLAUSE DELETION IS MINIMAL. The row keeps the rest of the sentence it
  --    had; "the clause is gone" is equally satisfied by a full rewrite.
  select count(*) into v_bad from unified_tags
  where slug = 'accessibility' and status = 'active'
    and description like 'The design and implementation of environments, products, and services that are inclusive%';
  if v_bad <> 1 then
    raise exception 'tag_description_measured_rewrite_b5: the clause deletion became a rewrite';
  end if;

  -- 3. NO REPAIRED ROW STILL PUBLISHES ITS OLD SUBJECT.
  select count(*) into v_bad from unified_tags
  where status = 'active' and (
       (slug='party'         and description like '%Hotels close to nightlife%')
    or (slug='mat-spandex'   and description like '%DuPont%')
    or (slug='bipoc'         and description like '%BIPOC stands for .%')
    or (slug='music'         and description like '%sensory play and scene-setting%')
    or (slug='accessibility' and description like '%including LGBTQIA+ individuals%')
  );
  if v_bad <> 0 then
    raise exception 'tag_description_measured_rewrite_b5: % row(s) still publish the old subject', v_bad;
  end if;

  -- 4. THE OTHER TWO PROSE FIELDS ARE NOT TOUCHED. This series never writes
  --    `description` on evidence, and here `music` proves the point in reverse:
  --    its summary and body were ALREADY correct and are what justified the
  --    repair, so a pass that "tidied" them would have destroyed its own
  --    evidence.
  select count(*) into v_bad from unified_tags
  where status = 'active' and (
       (slug='music' and short_description = 'Art using sound'
                     and long_description like 'Music is the arrangement of sound%')
    or (slug='bipoc' and short_description like 'People of color, including Black and Indigenous%'
                     and long_description like 'The term ''people of color'' refers to%')
    or (slug='accessibility' and long_description like 'Accessibility refers to the design of products%')
  );
  if v_bad <> 3 then
    raise exception 'tag_description_measured_rewrite_b5: a summary or body was altered (found % of 3)', v_bad;
  end if;

  -- 5. THE DEFERRED ROWS ARE STILL DEFERRED. A later pass that quietly sweeps
  --    them in has to break this file's own check first.
  select count(*) into v_bad from unified_tags
  where status = 'active' and (
       (slug='youth'   and description like 'The period of life between childhood and adulthood%')
    or (slug='writer'  and description like '%Author or scribe%')
  );
  if v_bad <> 2 then
    raise exception 'tag_description_measured_rewrite_b5: a deferred row was rewritten (found % of 2)', v_bad;
  end if;

  -- 6. NO VOICE VIOLATION SHIPS. The `s?` is load-bearing: \m...\M anchors both
  --    ends, so \morganisation\M does not match "organisations".
  select count(*) into v_bad from unified_tags
  where status = 'active'
    and slug in ('party','mat-spandex','bipoc','music','accessibility')
    and (description ~* '\m(organisation|characterised|recognised|behaviour|licence|counselling|colour)s?\M'
      or description ~* '\mnon-binary\M'
      or description ~* '\m(you|your)\M'
      or description ~ '!');
  if v_bad <> 0 then
    raise exception 'tag_description_measured_rewrite_b5: % row(s) carry a voice violation', v_bad;
  end if;

  -- 7. EVERY REPAIRED ROW STAYS PUBLISHABLE. Call the real predicate rather than
  --    restating its OR -- a hand-rolled "both fields present" form would fail on
  --    the two rows whose short_description is legitimately null.
  select count(*) into v_bad from unified_tags
  where status = 'active'
    and slug in ('party','mat-spandex','bipoc','music','accessibility')
    and not tag_has_prose(description, short_description);
  if v_bad <> 0 then
    raise exception 'tag_description_measured_rewrite_b5: % row(s) would fail the thin-page gate', v_bad;
  end if;
end $verify$;

commit;
