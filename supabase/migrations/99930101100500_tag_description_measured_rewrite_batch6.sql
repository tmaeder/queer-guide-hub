-- Tag description standard, measured rewrite batch 6.
--
-- A THIRD ORDERING, and it is the point of this batch. Batches 1-3 walked the
-- encyclopedic pool in a seeded order (35% / 36% / 25%); batches 4-5 took the
-- same pool ordered by assignment count (68%, then 17% as the head was worked
-- out). Neither ordering is a property of the backlog -- the disowned-prose
-- rounds established that twice and this series has now confirmed it -- so
-- rather than take another slice of a worked-out ordering, this batch selects on
-- the MECHANICAL SIGNATURE of the import that caused the class:
--
--   description ~* ('^' || name || '\s+(is|was|are|were|refers to)\y')
--
-- the Wikipedia lead shape, where the prose opens by restating the tag's own
-- name. 405 of the 2,465 sentence-register descriptions match (16.4%). 22 read
-- in usage order, 6 taken.
--
-- THE FIRST RUN OF THAT PROBE RETURNED ZERO AND THE ZERO WAS A LIE. It used
-- \b for the word boundary. POSTGRES ARE HAS NO \b -- the word-boundary escapes
-- are \y, \m and \M, and \b is BACKSPACE -- so the pattern could not match
-- anything, and "0 of 2,465" reads exactly like a clean corpus. Caught only by
-- running a positive control ('Music is a form of art' against ^Music\s+...)
-- which also returned false. An emergent zero is indistinguishable from a blind
-- probe; control every new matcher before believing its answer.
--
-- The six, each with the evidence that settles it:
--
--   meetup      179 uses, ALL events -- published the definition of the COMPANY
--               Meetup.com ("an American social media platform ... The service
--               has 60 million users. The company has both free tiers and paid
--               tiers") on a Community Life & Support tag that means a community
--               meet-up. Wrong subject, and the sharpest row in the batch.
--   mat-lace    1,210 uses, ALL marketplace_listing -- textile manufacturing
--               technique on a `mat-` material row. Third instance of the
--               mat-metal (batch 4) / mat-spandex (batch 5) class.
--   color-black 96 marketplace_listing -- optics and mediaeval symbolism
--               ("commonly worn by judges and magistrates") on a `color-`
--               marketplace facet. The vibe-colorful class of batch 4.
--   genre-fiction 38 news -- literary theory on a `genre-` media facet.
--   hate-speech 168 news, indexable -- CITES ITS SOURCES TO THE READER, twice
--               ("It is defined by the Cambridge Dictionary as ...", "The
--               Encyclopedia of the American Constitution states that ..."), the
--               register impaired-driving and sti-testing were repaired for.
--               The replacement KEEPS the load-bearing fact that legal
--               definitions vary by country -- on a platform with a
--               criminalization layer that is not decoration -- and names
--               sexual orientation and gender identity, which the original
--               reached only inside a quotation.
--   cabaret     181 events + 28 venues, indexable -- 724 characters that reach
--               drag only in the final clause.
--
-- REFUSED, and `tin` is the one worth stating. It is filed `Gear`, carries 58
-- event assignments, and publishes "Tin is a chemical element; it has the symbol
-- Sn and atomic number 50". The chemistry is plainly wrong for the row, but
-- neither the category, the assignments nor the name establish what the tag is
-- FOR, and guessing a sense is how this entire class arose -- the steer/warlord
-- disposition. It is named here rather than quietly skipped so the next pass
-- does not re-propose it as an oversight.
--
-- ALSO REFUSED, all measured rather than waved past: `cruising` (771,
-- human_reviewed, indexable), `sexual-orientation`, `asexuality`,
-- `homosexuality`, `allyship` and `sexual-minority` all match the lead-shape
-- probe and are ACCURATE, concise and queer-specific. The signature narrows what
-- a human reads; it does not decide. The geography cohort (`california`,
-- `canada`, `chicago`, `dallas`, `mitte`, `friedrichshain`, `schoneberg`) is
-- encyclopedic but not wrong, and `schoneberg` in particular -- a major queer
-- district of Berlin whose description says nothing about that -- needs SOURCED
-- enrichment rather than a shorter paraphrase of the same facts.
--
-- THE ACTOR DECLARATION IS LOAD-BEARING: `mat-lace` is human_reviewed = true.
-- Verified live, the undeclared UPDATE returns
--   human_reviewed tag d8e5bb14-eaf8-48e0-8c45-7177d46990f4
--   cannot be modified by system:trigger
--
-- Soft on preconditions, hard on postconditions.

begin;

select set_config('app.actor', 'admin:tag-description-measured-rewrite-b6', true);

-- ---- wrong subject: the company, not the gathering --------------------------
update unified_tags set description =
  'An informal community gathering, usually recurring and open to newcomers.'
where slug = 'meetup' and status = 'active'
  and description like '%an American social media platform%';

-- ---- namespace rows publishing the wrong subject (the mat-metal class) ------
update unified_tags set description =
  'A decorative openwork fabric, patterned and partly see-through.'
where slug = 'mat-lace' and status = 'active'
  and description like '%made without the use of pre-existing fabric%';

update unified_tags set description = 'Black, as a garment or product color.'
where slug = 'color-black' and status = 'active'
  and description like '%absence or complete absorption of visible light%';

update unified_tags set description =
  'Imaginative writing: novels, short stories and other invented narratives.'
where slug = 'genre-fiction' and status = 'active'
  and description like '%inconsistent with fact, history, or plausibility%';

-- ---- cites its own sources to the reader ------------------------------------
update unified_tags set description =
  'Speech that attacks or demeans a person or group for who they are, including sexual orientation and gender identity. What counts as hate speech in law varies widely between countries.'
where slug = 'hate-speech' and status = 'active'
  and description like '%defined by the Cambridge Dictionary%';

-- ---- encyclopedic lead that reaches the subject last ------------------------
update unified_tags set description =
  'Live performance for a seated audience at tables — music, drag, burlesque or spoken word, usually with a host between acts.'
where slug = 'cabaret' and status = 'active'
  and description like '%master of ceremonies%';

do $verify$
declare
  v_bad int;
begin
  -- 1. THE REACHED STATE, COUNTED POSITIVELY. Counting rows in a BAD state
  --    returns zero for a slug that has gone missing from the corpus entirely.
  select count(*) into v_bad from unified_tags
  where status = 'active' and (
       (slug='meetup'        and description = 'An informal community gathering, usually recurring and open to newcomers.')
    or (slug='mat-lace'      and description = 'A decorative openwork fabric, patterned and partly see-through.')
    or (slug='color-black'   and description = 'Black, as a garment or product color.')
    or (slug='genre-fiction' and description like 'Imaginative writing:%')
    or (slug='hate-speech'   and description like 'Speech that attacks or demeans a person or group%')
    or (slug='cabaret'       and description like 'Live performance for a seated audience at tables%')
  );
  if v_bad <> 6 then
    raise exception 'tag_description_measured_rewrite_b6: expected 6 rows in the reached state, found %', v_bad;
  end if;

  -- 2. NO REPAIRED ROW STILL PUBLISHES ITS OLD SUBJECT.
  select count(*) into v_bad from unified_tags
  where status = 'active' and (
       (slug='meetup'        and description like '%social networking service%')
    or (slug='mat-lace'      and description like '%pre-existing fabric%')
    or (slug='color-black'   and description like '%judges and magistrates%')
    or (slug='genre-fiction' and description like '%role-playing games%')
    or (slug='hate-speech'   and description like '%Encyclopedia of the American Constitution%')
    or (slug='cabaret'       and description like '%master of ceremonies%')
  );
  if v_bad <> 0 then
    raise exception 'tag_description_measured_rewrite_b6: % row(s) still publish the old subject', v_bad;
  end if;

  -- 3. hate-speech KEEPS THE FACT THAT LEGAL DEFINITIONS VARY. On a platform
  --    carrying a criminalization layer that is not decoration, dropping it to
  --    shorten the sentence would be a content loss wearing a register fix's
  --    clothes -- and it names sexual orientation and gender identity, which
  --    the original reached only inside a quotation.
  select count(*) into v_bad from unified_tags
  where slug = 'hate-speech' and status = 'active'
    and description like '%varies widely between countries%'
    and description like '%sexual orientation and gender identity%';
  if v_bad <> 1 then
    raise exception 'tag_description_measured_rewrite_b6: hate-speech lost its legal-variance or identity content';
  end if;

  -- 4. cabaret NAMES DRAG. The original reached it only in its final clause;
  --    a replacement that drops it is shorter and worse on this platform.
  select count(*) into v_bad from unified_tags
  where slug = 'cabaret' and status = 'active' and description ilike '%drag%';
  if v_bad <> 1 then
    raise exception 'tag_description_measured_rewrite_b6: cabaret no longer names drag';
  end if;

  -- 5. THE ACCURATE LEAD-SHAPE ROWS ARE NOT TOUCHED. The probe narrows what a
  --    human reads; it does not decide. A later pass that sweeps the signature
  --    has to break this check first.
  select count(*) into v_bad from unified_tags
  where status = 'active' and (
       (slug='cruising'           and description like '%socializing and meeting others%')
    or (slug='sexual-orientation' and description like '%emotional, romantic, or sexual attraction%')
    or (slug='asexuality'         and description like '%lack of sexual attraction to others%')
    or (slug='homosexuality'      and description like '%enduring romantic and sexual attraction%')
    or (slug='sexual-minority'    and description like '%falls outside the societal norm%')
    or (slug='tin'                and description like '%atomic number 50%')
  );
  if v_bad <> 6 then
    raise exception 'tag_description_measured_rewrite_b6: a refused row was rewritten (found % of 6)', v_bad;
  end if;

  -- 6. NO VOICE VIOLATION SHIPS. The `s?` is load-bearing: \m...\M anchors both
  --    ends, so \morganisation\M does not match "organisations".
  select count(*) into v_bad from unified_tags
  where status = 'active'
    and slug in ('meetup','mat-lace','color-black','genre-fiction','hate-speech','cabaret')
    and (description ~* '\m(organisation|characterised|recognised|behaviour|licence|counselling|colour)s?\M'
      or description ~* '\mnon-binary\M'
      or description ~* '\m(you|your)\M'
      or description ~ '!');
  if v_bad <> 0 then
    raise exception 'tag_description_measured_rewrite_b6: % row(s) carry a voice violation', v_bad;
  end if;

  -- 7. EVERY REPAIRED ROW STAYS PUBLISHABLE. Call the real predicate rather than
  --    restating its OR -- five of these six have a null short_description, so a
  --    hand-rolled "both fields present" form would fail on all five.
  select count(*) into v_bad from unified_tags
  where status = 'active'
    and slug in ('meetup','mat-lace','color-black','genre-fiction','hate-speech','cabaret')
    and not tag_has_prose(description, short_description);
  if v_bad <> 0 then
    raise exception 'tag_description_measured_rewrite_b6: % row(s) would fail the thin-page gate', v_bad;
  end if;
end $verify$;

commit;
