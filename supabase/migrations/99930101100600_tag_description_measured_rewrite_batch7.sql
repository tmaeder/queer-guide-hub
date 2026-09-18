-- Tag description standard, measured rewrite batch 7.
--
-- Continues the lead-shape axis batch 6 introduced (the description opens by
-- restating the tag's own name, the signature of the Wikipedia import). Next 24
-- rows by usage, 6 taken -- 25%, against batch 6's 27% on the same axis. The
-- axis is holding where the usage ordering had collapsed to 17%.
--
-- THE POSITIVE CONTROL WAS RE-RUN AND PINNED THIS TIME. Batch 6 recorded that
-- the first version of this probe used \b, which POSTGRES ARE DOES NOT HAVE
-- (the word-boundary escapes are \y, \m, \M; \b is BACKSPACE), so it matched
-- nothing and "0 of 2,465" read exactly like a clean corpus. The control
-- ('Music is a form of art' against ^Music\s+(is|...)\y) returns TRUE here.
-- On the first attempt this tranche the control was UNION'd into the result set
-- and then sorted out of it by the ORDER BY -- a control you cannot see in the
-- output is not a control.
--
-- THE SHARPEST ROW IS A FACTUAL ERROR ABOUT AN IDENTITY, and it is the original
-- rule rather than the widened one: the row's own summary contradicts its
-- description. `acespec` (25 news assignments, Orientation, indexable) read
-- "a term ... to refer to individuals who identify as both asexual and
-- aromantic. The term is a portmanteau of 'asexual' and 'aromantic'". Both
-- halves are wrong. ACESPEC IS SHORT FOR ACE-SPECTRUM -- someone on the
-- asexual spectrum, which is what its own short_description ("Lack of sexual
-- attraction or interest") is pointing at -- and the term for someone who is
-- both asexual and aromantic is AROACE, a different word for a different
-- identity. So the page defined the wrong concept AND stated a false etymology,
-- on an indexable identity entry.
--
-- The other five are shapes this series has already established:
--
--   abstinence   28 news, indexable -- THE EXPANSION IS LITERALLY MISSING:
--                "Most commonly, it refers to , which means not having sex at
--                all." The `bipoc` defect of batch 5, verbatim in shape.
--   bisexual-    25 news, indexable -- A DANGLING COLON promising a list that
--   visibility   is not there: "It's important because bisexual individuals
--                often face unique challenges:". This is the `belly-play`
--                defect of batch 2, and it takes that row's treatment: a PURE
--                DELETION, trimmed rather than rewritten. The surviving
--                sentence is asserted byte-for-byte, because "the dangling
--                colon is gone" is equally satisfied by a full rewrite.
--   color-red    24 marketplace_listing -- wavelengths in nanometres, RGB and
--                CMYK on a marketplace colour facet. The `color-black` class.
--   genre-poetry 28 news + 1 event -- 909 characters of prosody (assonance,
--                consonance, syllable weight, phoneme groups) on a media
--                facet. The `genre-fiction` class.
--   retail       25 VENUES + 2 news -- supply-chain economics ("in contrast to
--                wholesaling ... the final link in the supply chain") on a tag
--                whose assignments are shops. Settled by what it is attached
--                to, the `gruppen`/`party` rule.
--
-- THE ACTOR DECLARATION IS NOT LOAD-BEARING ON THIS TRANCHE and this file says
-- so, because batch 6's was and the next pass should not copy the wrong
-- precedent from whichever file it happens to open: all six rows are
-- human_reviewed = false, so log_unified_tag_change() would not RAISE and
-- set_config is attribution only.
--
-- DEFERRED, each with the reason it cannot be reached:
--   queer-inclusive (17 venues) -- 554 characters about "a concept or approach"
--     in "social, cultural, and political" contexts, where the row is really a
--     venue attribute and its summary already says so ("Welcoming to LGBTQ+
--     individuals"). Wordy and abstract, but not a different subject, and
--     under-reaching is the correct error.
--   human-trafficking, freedom-of-speech -- correct prose filed under
--     `Slang & Language` and `Dynamics & Roles`. A FILING question, the
--     `warlord`/`diversity` disposition, not a prose repair.
--   brunch, breakfast, animation, qigong, hiv-testing, queer-theory,
--     puberty-blockers, indigenous-rights -- accurate and useful as written.
--   the geography cohort (kreuzberg, tempelhof, japan, steglitz, toronto,
--     wales) -- encyclopedic but not wrong, exactly as batch 6 left it.
--   drag (3,921 assignments, the largest row on this axis) -- correct, and
--     already minimally repaired by batch 4.
--
-- Soft on preconditions, hard on postconditions.

begin;

select set_config('app.actor', 'admin:tag-description-measured-rewrite-b7', true);

-- ---- factual error: wrong concept AND false etymology -----------------------
update unified_tags set description =
  'Someone on the asexual spectrum: experiencing sexual attraction rarely, conditionally or not at all. Short for ace-spectrum, it covers identities such as demisexual and greysexual — not to be confused with aroace, which means both asexual and aromantic.'
where slug = 'acespec' and status = 'active'
  and description like '%portmanteau of%aromantic%';

-- ---- the expansion was literally missing ------------------------------------
update unified_tags set description =
  'Choosing not to have sex. What that covers varies by person — some avoid all sexual contact, others only certain kinds.'
where slug = 'abstinence' and status = 'active'
  and description like '%it refers to , which means%';

-- ---- PURE DELETION: a dangling colon promising a list that is not there -----
update unified_tags
   set description = replace(description, ' It’s important because bisexual individuals often face unique challenges:', '')
where slug = 'bisexual-visibility' and status = 'active'
  and description like '%often face unique challenges:%';

-- ---- namespace rows publishing the wrong subject ----------------------------
update unified_tags set description = 'Red, as a garment or product color.'
where slug = 'color-red' and status = 'active'
  and description like '%dominant wavelength of approximately%';

update unified_tags set description =
  'Poetry: verse, spoken word and other writing organised by rhythm, sound and line.'
where slug = 'genre-poetry' and status = 'active'
  and description like '%assonance, alliteration, consonance%';

-- ---- sense settled by the row's assignments (the `gruppen` rule) ------------
update unified_tags set description =
  'Shops and stores — places that sell goods directly to customers.'
where slug = 'retail' and status = 'active'
  and description like '%final link in the supply chain%';

do $verify$
declare
  v_bad int;
begin
  -- 1. THE REACHED STATE, COUNTED POSITIVELY. Counting rows in a BAD state
  --    returns zero for a slug that has gone missing from the corpus entirely.
  select count(*) into v_bad from unified_tags
  where status = 'active' and (
       (slug='acespec'             and description like 'Someone on the asexual spectrum:%')
    or (slug='abstinence'          and description like 'Choosing not to have sex.%')
    or (slug='bisexual-visibility' and description = 'Bisexual visibility is all about increasing awareness and understanding of bisexual people and their experiences.')
    or (slug='color-red'           and description = 'Red, as a garment or product color.')
    or (slug='genre-poetry'        and description like 'Poetry: verse, spoken word%')
    or (slug='retail'              and description like 'Shops and stores%')
  );
  if v_bad <> 6 then
    raise exception 'tag_description_measured_rewrite_b7: expected 6 rows in the reached state, found %', v_bad;
  end if;

  -- 2. NO REPAIRED ROW STILL PUBLISHES ITS OLD SUBJECT.
  select count(*) into v_bad from unified_tags
  where status = 'active' and (
       (slug='acespec'             and description like '%portmanteau%')
    or (slug='abstinence'          and description like '%it refers to , which means%')
    or (slug='bisexual-visibility' and description like '%unique challenges:%')
    or (slug='color-red'           and description like '%nanometers%')
    or (slug='genre-poetry'        and description like '%onomatopoeia%')
    or (slug='retail'              and description like '%wholesaling%')
  );
  if v_bad <> 0 then
    raise exception 'tag_description_measured_rewrite_b7: % row(s) still publish the old subject', v_bad;
  end if;

  -- 3. acespec STATES THE RIGHT CONCEPT AND THE RIGHT ETYMOLOGY. The old text
  --    was wrong twice over, so a replacement that fixes only one half would
  --    still leave an indexable identity page asserting a falsehood.
  select count(*) into v_bad from unified_tags
  where slug = 'acespec' and status = 'active'
    and description like '%ace-spectrum%'
    and description like '%aroace%';
  if v_bad <> 1 then
    raise exception 'tag_description_measured_rewrite_b7: acespec lost its spectrum reading or its aroace distinction';
  end if;

  -- 4. THE bisexual-visibility EDIT IS A DELETION, NOT A REWRITE. The row keeps
  --    the sentence it had; "the dangling colon is gone" is equally satisfied
  --    by a pass that replaced the whole description.
  select count(*) into v_bad from unified_tags
  where slug = 'bisexual-visibility' and status = 'active'
    and description like 'Bisexual visibility is all about increasing awareness and understanding%';
  if v_bad <> 1 then
    raise exception 'tag_description_measured_rewrite_b7: the bisexual-visibility deletion became a rewrite';
  end if;

  -- 5. THE DEFERRED ROWS ARE STILL DEFERRED. A later pass that sweeps the
  --    lead-shape signature has to break this check first.
  select count(*) into v_bad from unified_tags
  where status = 'active' and (
       (slug='queer-inclusive'   and description like 'Queer-inclusive refers to a concept or approach%')
    or (slug='brunch'            and description like 'Brunch is a meal eaten in the late morning%')
    or (slug='breakfast'         and description like 'Breakfast is the first meal of the day%')
    or (slug='hiv-testing'       and description like 'HIV testing is a crucial health service%')
    or (slug='queer-theory'      and description like 'Queer theory is a field of post-structuralist%')
    or (slug='drag'              and description like 'Drag is a performance art form%')
  );
  if v_bad <> 6 then
    raise exception 'tag_description_measured_rewrite_b7: a deferred row was rewritten (found % of 6)', v_bad;
  end if;

  -- 6. NO VOICE VIOLATION SHIPS. The `s?` is load-bearing: \m...\M anchors both
  --    ends, so \morganisation\M does not match "organisations".
  select count(*) into v_bad from unified_tags
  where status = 'active'
    and slug in ('acespec','abstinence','bisexual-visibility','color-red','genre-poetry','retail')
    and (description ~* '\m(organisation|characterised|recognised|behaviour|licence|counselling|colour)s?\M'
      or description ~* '\mnon-binary\M'
      or description ~* '\m(you|your)\M'
      or description ~ '!');
  if v_bad <> 0 then
    raise exception 'tag_description_measured_rewrite_b7: % row(s) carry a voice violation', v_bad;
  end if;

  -- 7. EVERY REPAIRED ROW STAYS PUBLISHABLE. Call the real predicate rather than
  --    restating its OR -- three of these six have a null short_description, so
  --    a hand-rolled "both fields present" form would fail on all three.
  select count(*) into v_bad from unified_tags
  where status = 'active'
    and slug in ('acespec','abstinence','bisexual-visibility','color-red','genre-poetry','retail')
    and not tag_has_prose(description, short_description);
  if v_bad <> 0 then
    raise exception 'tag_description_measured_rewrite_b7: % row(s) would fail the thin-page gate', v_bad;
  end if;
end $verify$;

commit;
