-- Glossary descriptions: four Tone of Voice violations in the batch that shipped
--
-- 99700101100300 rewrote 18 descriptions, each hand-read against the row's own
-- evidence. The pre-registered verdict categories for that measurement covered
-- SUBJECT, SENSE, SPECIFICITY and FABRICATION -- and did not cover conformance
-- to the published Tone of Voice. Running the 18 texts against the live
-- `styleguide_rules` afterwards found four that the standard rejects. That is a
-- gap in the measurement design, not in any single row: a precision number is
-- only as complete as the criteria it was scored against, and 19/20 was scored
-- against a criteria set missing the standard the copy has to meet.
--
-- WHAT THE STANDARD SAYS, and it is checkable rather than a matter of taste:
--
--   `spelling-and-units` (should, all): "Follow the source material's spelling;
--   otherwise American."
--     fundraiser  "cause or organisation."        -> organization
--     tokenism    "an organisation can appear"    -> organization
--     nala        "A role characterised by"       -> characterized
--   The corpus agrees with the rule rather than with the copy that shipped:
--   active descriptions run organization 25 : organisation 4 and
--   characterized 29 : characterised 5. The source material for fundraiser and
--   tokenism was itself American, so this failed both halves of the rule.
--
--   `trans-language` (must, all) and styleguide_terms.preferred both write
--   "nonbinary person", unhyphenated.
--     facial-feminization-surgery  "trans women and non-binary people"
--                                  -> "trans women and nonbinary people"
--
-- THE nonbinary CASE IS A REAL DISAGREEMENT AND IS DELIBERATELY RESOLVED TOWARD
-- THE STANDARD, NOT THE CORPUS. Measured on active descriptions, the corpus runs
-- 34 HYPHENATED to 9 unhyphenated -- so the majority of existing rows use the
-- other spelling, and anyone re-deriving house style from the corpus would
-- "correct" this straight back. The standard is the human-approved authority
-- (published, versioned, editable at /admin/styleguide) and the corpus is the
-- legacy machine prose being repaired: the same reason `vibrant` at 374 hits is
-- drift rather than evidence. THE 34 ARE NOT SWEPT HERE. Changing them is a
-- corpus-wide decision with its own blast radius, and the house answer to drift
-- is a counter, not a rewrite.
--
-- WHAT WAS CLEAN, so the residue is bounded rather than implied: across all 18
-- texts there were ZERO active avoid-term hits, ZERO second-person uses
-- (`no-second-person-in-reference` is tag-scoped and binding), ZERO exclamation
-- marks, and every text is one or two sentences per `length-discipline`.
--
-- THESE FOUR ROWS WERE ALREADY CORRECTED DIRECTLY ON PROD when the violation was
-- found, so on the live database this migration is a NO-OP that asserts the end
-- state. On a rebuild from zero it meets 99700101100300's output and corrects it.
-- Both paths converge, which is what the guards below are shaped for.
--
-- 99700101100300 IS NOT EDITED. It is applied; its recorded body is what ran,
-- and rewriting an applied migration is the divergence class the drift monitor
-- exists to catch. A follow-up migration is the repair path this repo uses.
--
-- Soft on preconditions, hard on postconditions: each UPDATE is guarded on the
-- exact violating substring, so it no-ops wherever the correction already landed
-- rather than aborting `db push` on main.

begin;

select set_config('app.actor', 'admin:tag-description-voice-corrections', true);

update unified_tags
set description = replace(description, 'cause or organisation.', 'cause or organization.')
where slug = 'fundraiser' and status = 'active'
  and description like '%cause or organisation.%';

update unified_tags
set description = replace(description, 'an organisation can appear', 'an organization can appear')
where slug = 'tokenism' and status = 'active'
  and description like '%an organisation can appear%';

update unified_tags
set description = replace(description, 'A role characterised by', 'A role characterized by')
where slug = 'nala' and status = 'active'
  and description like 'A role characterised by%';

update unified_tags
set description = replace(description, 'trans women and non-binary people', 'trans women and nonbinary people')
where slug = 'facial-feminization-surgery' and status = 'active'
  and description like '%trans women and non-binary people%';

do $verify$
declare
  v_bad int;
begin
  -- 1. the four rows are in the corrected state (counted positively: a count of
  --    rows in a BAD state also returns 0 for a slug that has gone missing)
  select count(*) into v_bad from unified_tags
  where status = 'active' and (
       (slug = 'fundraiser' and description like '%cause or organization.%')
    or (slug = 'tokenism' and description like '%an organization can appear%')
    or (slug = 'nala' and description like 'A role characterized by%')
    or (slug = 'facial-feminization-surgery' and description like '%trans women and nonbinary people%')
  );
  if v_bad <> 4 then
    raise exception 'tag_description_voice_corrections: expected 4 rows corrected, found %', v_bad;
  end if;

  -- 2. and no violating form survives on any of them
  select count(*) into v_bad from unified_tags
  where status = 'active'
    and slug in ('fundraiser','tokenism','nala','facial-feminization-surgery')
    and description ~* '\m(organisation|characterised)s?\M|\mnon-binary\M';
  if v_bad <> 0 then
    raise exception 'tag_description_voice_corrections: % row(s) still carry a violating form', v_bad;
  end if;

  -- 3. MIRROR ASSERTION: the correction is a substitution, not a rewrite. Each
  --    row keeps the rest of the sentence it shipped with -- "the violation is
  --    gone" is equally satisfied by a pass that replaced the whole text.
  select count(*) into v_bad from unified_tags
  where status = 'active' and (
       (slug = 'fundraiser' and description like 'An event or campaign that raises money for a %')
    or (slug = 'tokenism' and description like 'The practice of making a symbolic, surface-level effort%')
    or (slug = 'nala' and description like '%pet play, primal and littles communities.')
    or (slug = 'facial-feminization-surgery' and description like '%typically read as masculine%')
  );
  if v_bad <> 4 then
    raise exception 'tag_description_voice_corrections: a row was rewritten rather than corrected (found % of 4)', v_bad;
  end if;

  -- 4. THE CORPUS IS NOT SWEPT. The 34 hyphenated rows elsewhere are a separate
  --    decision; this migration must never have grown into that.
  select count(*) into v_bad from unified_tags
  where status = 'active' and description ~* '\mnon-binary\M';
  if v_bad < 20 then
    raise exception 'tag_description_voice_corrections: the corpus-wide non-binary cohort was swept (only % left)', v_bad;
  end if;
end
$verify$;

commit;
