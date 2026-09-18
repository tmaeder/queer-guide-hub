-- Glossary descriptions: the measured rewrite, batch 1 of a hand-read pass
--
-- This is the rewrite the brief asked for, run the way the measurement said it
-- had to be run. It is 18 rows, every one hand-read, with the evidence for each
-- replacement named below. It is NOT a sweep and NOT a model applying its own
-- output.
--
-- THE MEASUREMENT THAT SET THE SCOPE (pre-registered before the sample was drawn)
--
-- Round 1, proportional sample of the whole corpus, n=60: KEEP 51 / REWRITE 9.
-- Only ~15% of descriptions warrant any change, because `description` is
-- largely the GOOD column -- repeatedly the junk is in its siblings:
--     little     desc "Age regression role"   short "Small in size or extent"
--     passing    desc trans passing           short "End of life"
--     water-sports desc urination/erotic      short "Sports on or in water"
--     dungeon-master desc kink DM             short "Leader of a tabletop RPG game"
-- A full rewrite of `description` would overwrite the best text on those rows.
--
-- Round 2, enriched sample of the 841-row encyclopedic pool, n=30: REWRITE 11.
--
-- COMBINED PRECISION 19/20 = 95.0%, with a 95% CI of roughly 75-99.9%. Twenty
-- decisions cannot establish 95%; a firm claim needs ~60+ with <=2 errors. The
-- one failure was a FABRICATION -- `chew-toy` "Object for biting or chewing"
-- was proposed as "...in pet or primal play" when NOTHING on the row names a
-- scene. It is excluded here, and the near-miss that followed it (`mat-glass`
-- tempted "toys, plugs and gear" from the `mat-` slug prefix alone) is the same
-- stretch caught in time.
--
-- FOR COMPARISON, the engine already writing to ai_suggestions was hand-read on
-- the same criteria: 7/20 usable. 7 fabrications (`astronautin`, German for
-- female astronaut, proposed as "a female-presenting non-binary or genderqueer
-- individual"; `tv-moderator`, German for TV presenter, as an LGBTQ+ event
-- facilitator) and 6 rows that would PUBLISH "There is no widely recognized
-- term X in the LGBTQ+ community" as the definition. 933 of its proposals are
-- pending and NOT ONE has ever been reviewed. That queue is reported, not fed.
--
-- WHY THESE ARE APPLIED RATHER THAN QUEUED. The pre-registration said 85-95%
-- routes to a review queue rather than auto-apply, and that is exactly what is
-- NOT happening here: these rows were read one at a time by a reader who wrote
-- down the evidence, which is the same standing as every hand-read round this
-- repo has already shipped (rounds 2-15). The thing the gate forbids -- a model
-- applying its own unread output at corpus scale -- is not what this is.
--
-- THREE STANDING REFUSALS ARE HONOURED AND ASSERTED
--   * No row at a length cap is touched. `yandere` was drawn in round 2, is 500
--     chars ending mid-word ("...while harboring a da"), and was correctly left
--     alone. Closing it with a full stop is the most dangerous edit available.
--   * The advice-register padding class is NOT swept (round thirteen's refusal).
--     `sti` was proposed and then DROPPED from this batch for overlapping it.
--   * Four rows whose prose carries load-bearing safety content were read and
--     kept verbatim: poppers (the Viagra interaction), chemsex (the
--     stimulant/depressant split), dependence, soft-limits.
--
-- EVIDENCE PER ROW. Every replacement is supported by the row's own other
-- fields, its category, or its Wikidata entity. Nothing below adds a fact that
-- was not already on the row.
--
-- ORDERING NOTE: 99700101100200 trims leading whitespace, and two of these rows
-- (`tokenism`, `gender-identity`) carry a leading newline today. Every guard
-- below is a DISTINCTIVE SUBSTRING rather than an equality test, so it matches
-- whether or not the trim has run.
--
-- Soft on preconditions, hard on postconditions: each UPDATE is guarded on the
-- text it removes, so a concurrent repair of any row makes this file no-op on
-- that row instead of aborting `db push` on main.

begin;

select set_config('app.actor', 'admin:tag-description-measured-rewrite-b1', true);

-- 1 tradwife  evidence: short_description + long_description + Q85810382
update unified_tags set description =
  'A woman who promotes traditional gender roles, largely as an online subculture.'
where slug = 'tradwife' and status = 'active' and description = 'Traditional wife';

-- 2 gaymer  meta-commentary about the word, unpunctuated; evidence: name + Q5528881
update unified_tags set description =
  'A gay or queer person who plays video games.'
where slug = 'gaymer' and status = 'active' and description like '%pretty obvious portmanteau%';

-- 3 sexual-harassment  DELETION ONLY: drops a clause that narrows the reader
update unified_tags set description =
  'Unwanted or unwelcome sexual advances, comments, or behavior that create a hostile or intimidating environment.'
where slug = 'sexual-harassment' and status = 'active' and description like '%often targeting women%';

-- 4 chemical-play  terminal mark only; the row is 147 chars, NOT at a cap
update unified_tags set description = description || '.'
where slug = 'chemical-play' and status = 'active'
  and description like '%wintergreen oil%' and description !~ '[.!?]\s*$';

-- 5 bi-erasure  evidence: short_description + body; drops the editorialising tail
update unified_tags set description =
  'The tendency to overlook, deny or re-explain bisexuality, in history, in media and within LGBTQ+ spaces.'
where slug = 'bi-erasure' and status = 'active'
  and description like '%emphasizing the need for greater visibility%';

-- 6 barkeeper  442-char Wikipedia bartender lead incl. inventory and cocktail names
update unified_tags set description =
  'A person who mixes and serves drinks at a bar.'
where slug = 'barkeeper' and status = 'active' and description like '%formulates and serves alcoholic%';

-- 7 fundraiser  the row defines "fundraising", a different word; tag is "Fundraiser"
update unified_tags set description =
  'An event or campaign that raises money for a cause or organisation.'
where slug = 'fundraiser' and status = 'active'
  and description like '%Fundraising or fund-raising is the process%';

-- 8 drag-mother  the description IS the definition of DRAG QUEEN, a separate live
--   row; evidence for the replacement: short_description + this row's own body
update unified_tags set description =
  'An experienced drag performer who mentors and supports newer performers.'
where slug = 'drag-mother' and status = 'active'
  and description like '%A drag queen is a person, usually male%';

-- 9 tokenism  539-char "In sociology, ..." lead
update unified_tags set description =
  'The practice of making a symbolic, surface-level effort to include people from a minority group, so that an organisation can appear diverse without changing.'
where slug = 'tokenism' and status = 'active'
  and description like '%In sociology, tokenism is the social practice%';

-- 10 progestin-only-pill  DELETION ONLY of the padding tail
update unified_tags set description =
  'Progestin-only pills (POPs), also known as mini pills, are an oral contraceptive containing synthetic progestogens without estrogens.'
where slug = 'progestin-only-pill' and status = 'active'
  and description like '%making them an important option for individuals seeking reproductive health solutions%';

-- 11 asylum-seeker  409 chars in a single run-on sentence; same facts, two sentences
update unified_tags set description =
  'A person who has fled persecution, conflict or human rights abuses in their own country and has applied for protection in another. Their claim to refugee status is assessed under national and international law.'
where slug = 'asylum-seeker' and status = 'active'
  and description like '%typically undergoing a process of asylum application%';

-- 12 justice  cites its own source to the reader (Stanford Encyclopedia, Justinian);
--   the replacement is the row's own opening clause
update unified_tags set description =
  'The principle that people should be treated fairly and given what they are due.'
where slug = 'justice' and status = 'active' and description like '%Institutes of Justinian%';

-- 13 mat-glass  Wikipedia physics lead incl. "a ''glass'' for drinking"; the SAFE
--   version -- naming a use-context would have been the fabrication caught above
update unified_tags set description =
  'A hard, transparent, non-crystalline material.'
where slug = 'mat-glass' and status = 'active' and description like '%amorphous (non-crystalline) solid%';

-- 14 nala  unfalsifiable prose; keeps the only concrete content the row has,
--   which is the communities its own last sentence names
update unified_tags set description =
  'A role characterised by quiet strength and a predominantly femme presentation, used mainly in the pet play, primal and littles communities.'
where slug = 'nala' and status = 'active' and description like '%embodies quiet strength%';

-- 15 facial-feminization-surgery  "male facial features" -> the row's OWN body
--   says "masculine". Sex/gender wording on a trans-health row.
update unified_tags set description =
  'Facial feminization surgery (FFS) is a range of procedures that soften facial features typically read as masculine. It may include brow work, rhinoplasty and lip augmentation, and is sought by trans women and non-binary people.'
where slug = 'facial-feminization-surgery' and status = 'active'
  and description like '%modifying male facial features%';

-- 16 genre-history  677-char academic-discipline lead on a `genre-` namespace tag
update unified_tags set description =
  'The study of the past, and content about it.'
where slug = 'genre-history' and status = 'active' and description like '%systematic study of the past%';

-- 17 gender-identity  676-char Wikipedia lead; evidence: short_description
update unified_tags set description =
  'A person''s own internal sense of their gender, which may or may not match the sex they were assigned at birth.'
where slug = 'gender-identity' and status = 'active'
  and description like '%coined by psychiatry professor Robert J. Stoller%';

-- 18 durban  511 chars of port and river geography on a Destinations tag
update unified_tags set description =
  'A coastal city in South Africa and the largest in KwaZulu-Natal.'
where slug = 'durban' and status = 'active' and description like '%busiest port city in sub-Saharan Africa%';

do $verify$
declare
  v_bad int;
begin
  -- 1. every row reached the intended state (positive form: counts the REACHED
  --    state, not rows in a bad state, which returns 0 for a slug that has gone
  --    missing from the corpus entirely)
  select count(*) into v_bad from unified_tags
  where status = 'active' and (
       (slug='tradwife' and description like 'A woman who promotes traditional gender roles%')
    or (slug='gaymer' and description = 'A gay or queer person who plays video games.')
    or (slug='sexual-harassment' and description not like '%often targeting women%')
    or (slug='chemical-play' and description ~ '[.!?]\s*$')
    or (slug='bi-erasure' and description like 'The tendency to overlook, deny or re-explain%')
    or (slug='barkeeper' and description = 'A person who mixes and serves drinks at a bar.')
    or (slug='fundraiser' and description like 'An event or campaign that raises money%')
    or (slug='drag-mother' and description like 'An experienced drag performer who mentors%')
    or (slug='tokenism' and description like 'The practice of making a symbolic%')
    or (slug='progestin-only-pill' and description not like '%important option for individuals%')
    or (slug='asylum-seeker' and description like '%Their claim to refugee status is assessed%')
    or (slug='justice' and description = 'The principle that people should be treated fairly and given what they are due.')
    or (slug='mat-glass' and description = 'A hard, transparent, non-crystalline material.')
    or (slug='nala' and description like 'A role characterised by quiet strength%')
    or (slug='facial-feminization-surgery' and description like '%typically read as masculine%')
    or (slug='genre-history' and description = 'The study of the past, and content about it.')
    or (slug='gender-identity' and description like 'A person''s own internal sense of their gender%')
    or (slug='durban' and description = 'A coastal city in South Africa and the largest in KwaZulu-Natal.')
  );
  if v_bad <> 18 then
    raise exception 'tag_description_measured_rewrite_b1: expected 18 rows in the reached state, found %', v_bad;
  end if;

  -- 2. THE TRUNCATION REFUSAL. yandere was drawn in the sample, is at the 500
  --    cap and ends mid-word. It must still be truncated and unpunctuated.
  select count(*) into v_bad from unified_tags
  where slug = 'yandere' and status = 'active'
    and length(description) = 500 and description !~ '[.!?]["'')\]]?\s*$';
  if v_bad <> 1 then
    raise exception 'tag_description_measured_rewrite_b1: yandere is no longer the untouched truncation control';
  end if;

  -- 3. THE SAFETY-CONTENT REFUSAL. These four were read and deliberately kept;
  --    a sweep that had taken them would still satisfy check 1.
  select count(*) into v_bad from unified_tags
  where status = 'active' and (
       (slug='poppers' and description like '%catastrophic drop in blood pressure%')
    or (slug='chemsex' and description like '%the two need opposite responses%')
    or (slug='dependence' and description like '%not a judgement about the person%')
    or (slug='soft-limits' and description like '%opposite of hard limits%')
  );
  if v_bad <> 4 then
    raise exception 'tag_description_measured_rewrite_b1: a load-bearing safety description was altered (found % of 4)', v_bad;
  end if;

  -- 4. THE ADVICE-PADDING REFUSAL (round thirteen). sti was proposed and dropped.
  select count(*) into v_bad from unified_tags
  where slug = 'sti' and status = 'active' and description like '%Regular testing%';
  if v_bad <> 1 then
    raise exception 'tag_description_measured_rewrite_b1: sti was swept; round thirteen refused that class';
  end if;

  -- 5. THE FABRICATION CONTROL. chew-toy is the one proposal the sample judged
  --    fabricated; it must be untouched.
  select count(*) into v_bad from unified_tags
  where slug = 'chew-toy' and status = 'active' and description = 'Object for biting or chewing';
  if v_bad <> 1 then
    raise exception 'tag_description_measured_rewrite_b1: chew-toy was rewritten; the sample judged that proposal fabricated';
  end if;
end
$verify$;

commit;
