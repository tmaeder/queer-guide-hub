-- Glossary descriptions: the measured rewrite, batch 2 (10 rows)
--
-- Continues 99700101100300 on the same encyclopedic pool (841 rows), rows 31-58
-- of the seeded ordering. 28 read, 10 rewritten, 18 kept.
--
-- THE CRITERIA NOW INCLUDE THE TONE OF VOICE, which is the whole correction
-- carried over from batch 1. That batch pre-registered SUBJECT, SENSE,
-- SPECIFICITY and FABRICATION and omitted conformance to `styleguide_rules`, so
-- four of its eighteen shipped unpublishable (99800101100000). Every proposal
-- below was run against the live standard BEFORE being scored: zero active
-- avoid-term hits, zero British spellings, zero hyphenated "non-binary", zero
-- second person, zero exclamation marks, and every replacement is ONE sentence.
--
-- ONE WORD CHOICE WAS REFUSED RATHER THAN GUESSED. `civil-society` wanted
-- "nongovernmental organizations"; the corpus is 1:1 on nongovernmental vs
-- non-governmental, so there is no house form to follow. Picking one arbitrarily
-- is the stretch that produced batch 1's single fabrication, so the sentence is
-- phrased to avoid the word.
--
-- THE CLEAREST DEFECT IN THE BATCH is `intergender`, whose description is the
-- generic definition of NON-BINARY/genderqueer while the row's own
-- short_description and body both say the term means a gender experience
-- connected to being intersex. That is the defines-a-different-concept class,
-- and the replacement is taken from the row's own two other fields.
--
-- WHAT WAS KEPT AND WHY, since the KEEP decisions are most of the work:
--   anal-sex      carries the per-act HIV risk and the receptive/insertive
--                 difference — load-bearing safety content, kept verbatim
--   prick, spotter, soft-dom-me, service-daddy, pain-bringer, tongue-sucking,
--   pleasure-switch, lone-wolf, feminizing-hormone-therapy, girlflux,
--   pubic-lice, polysaturation, poop-desperation, lgbtq-history-month
--                 already house voice and correct
--   safe-sane-and-consensual-ssc  has an encyclopedic tail, and is exactly the
--                 row CLAUDE.md records the retired judge nulling by mistake.
--                 Under-reaching on it is deliberate.
--   hiv-aids-awareness  its tail is advice-register padding, which round
--                 thirteen refused to sweep. Left alone for that reason.
--
-- NOT TOUCHED, with the reason rather than silence:
--   social-security  the description defines WELFARE SPENDING, the tag is
--                 "Social Security", and the category is "Events & Parties".
--                 Nothing on the row establishes which sense is intended, so
--                 this is a filing decision for a human — the warlord /
--                 universalism disposition.
--
-- belly-play is a pure DELETION: its description ends "Activities of interest
-- include:" with nothing after the colon. The dangling clause is removed and no
-- text is written, because the promised list was never there to restore.
--
-- Soft on preconditions, hard on postconditions: every UPDATE is guarded on the
-- text it removes, so a concurrent repair no-ops instead of aborting db push.

begin;

select set_config('app.actor', 'admin:tag-description-measured-rewrite-b2', true);

-- 1 cetrorelix  897ch of prescribing detail incl. a missing full stop mid-text
--   and a non-breaking space that defeated the obvious guard (see below)
update unified_tags set description =
  'An injectable GnRH antagonist sold as Cetrotide, used in fertility treatment to suppress premature luteinizing hormone surges.'
where slug = 'cetrorelix' and status = 'active'
  -- GUARD IS NOT THE DOSING TEXT: this row carries a NON-BREAKING SPACE (ASCII
  -- 160) between "0.25" and "mg", so a LIKE on that phrase silently matches
  -- nothing while rendering identically everywhere. The no-op would then fail
  -- the postcondition and abort db push on main. Found by dry-running, not by
  -- reading. `synthetic decapeptide` is verified to match.
  and description like '%synthetic decapeptide%';

-- 2 pastor  denominational ordination detail on an Identity tag
update unified_tags set description =
  'The leader of a Christian congregation, who also gives advice and counsel to its members.'
where slug = 'pastor' and status = 'active' and description like '%In Methodism, pastors may be either%';

-- 3 switzerland  629ch of physical geography on a Destinations tag
update unified_tags set description =
  'A landlocked country in central Europe, bordered by Germany, France, Austria, Liechtenstein and Italy.'
where slug = 'switzerland' and status = 'active' and description like '%Swiss Plateau, and the Jura Mountains%';

-- 4 uk  927ch incl. square mileage and the seas around it
update unified_tags set description =
  'A country in northwestern Europe made up of England, Scotland, Wales and Northern Ireland.'
where slug = 'uk' and status = 'active' and description like '%94,354 square miles%';

-- 5 civil-society  an embedded numbered list with hard newlines
update unified_tags set description =
  'The part of society that is independent of government and business, made up of the organizations and associations people form themselves.'
where slug = 'civil-society' and status = 'active' and description like '%the "third sector" of society%';

-- 6 epsom  576ch of town history back to the mid-Bronze Age
update unified_tags set description =
  'A town in Surrey, England, about 14 miles south of central London.'
where slug = 'epsom' and status = 'active' and description like '%clock tower, which was erected%';

-- 7 genre-essays  504ch on the essay form, on a `genre-` namespace tag
update unified_tags set description =
  'Writing that sets out the author''s own argument.'
where slug = 'genre-essays' and status = 'active' and description like '%formal essays are characterized by%';

-- 8 belly-play  DELETION ONLY: a dangling colon promising a list that is absent
update unified_tags set description = btrim(replace(description, 'Activities of interest include:', ''))
where slug = 'belly-play' and status = 'active' and description like '%Activities of interest include:';

-- 9 intergender  the description is the generic NON-BINARY definition; the row's
--   own short_description and body both say intersex. Replacement from those.
update unified_tags set description =
  'A gender identity connected to being intersex.'
where slug = 'intergender' and status = 'active'
  and description like '%Non-binary or genderqueer gender identities are those%';

-- 10 rule-of-law  quotes Encyclopaedia Britannica to the reader
update unified_tags set description =
  'The principle that everyone, including those who govern, is subject to the same laws — often stated as "no one is above the law".'
where slug = 'rule-of-law' and status = 'active' and description like '%Encyclop%dia Britannica%';

do $verify$
declare
  v_bad int;
begin
  -- 1. the reached state, counted positively
  select count(*) into v_bad from unified_tags
  where status = 'active' and (
       (slug='cetrorelix' and description like 'An injectable GnRH antagonist sold as Cetrotide%')
    or (slug='pastor' and description = 'The leader of a Christian congregation, who also gives advice and counsel to its members.')
    or (slug='switzerland' and description like 'A landlocked country in central Europe%')
    or (slug='uk' and description like 'A country in northwestern Europe made up of England%')
    or (slug='civil-society' and description like 'The part of society that is independent of government%')
    or (slug='epsom' and description = 'A town in Surrey, England, about 14 miles south of central London.')
    or (slug='genre-essays' and description = 'Writing that sets out the author''s own argument.')
    or (slug='belly-play' and description like '%situations like this.')
    or (slug='intergender' and description = 'A gender identity connected to being intersex.')
    or (slug='rule-of-law' and description like 'The principle that everyone, including those who govern%')
  );
  if v_bad <> 10 then
    raise exception 'tag_description_measured_rewrite_b2: expected 10 rows in the reached state, found %', v_bad;
  end if;

  -- 2. belly-play was TRIMMED, not rewritten: the three sentences before the
  --    dangling colon must survive verbatim.
  select count(*) into v_bad from unified_tags
  where slug = 'belly-play' and status = 'active'
    and description like 'Belly play usually refers to pleasurable play%'
    and description like '%"Belly sluts" are typically found%'
    and description not like '%Activities of interest include%';
  if v_bad <> 1 then
    raise exception 'tag_description_measured_rewrite_b2: belly-play was rewritten rather than trimmed';
  end if;

  -- 3. THE SAFETY-CONTENT REFUSAL, carried forward from batch 1 and extended.
  select count(*) into v_bad from unified_tags
  where status = 'active' and (
       (slug='anal-sex' and description like '%highest per-act HIV risk%')
    or (slug='poppers' and description like '%catastrophic drop in blood pressure%')
    or (slug='chemsex' and description like '%the two need opposite responses%')
    or (slug='soft-limits' and description like '%opposite of hard limits%')
  );
  if v_bad <> 4 then
    raise exception 'tag_description_measured_rewrite_b2: a load-bearing safety description was altered (found % of 4)', v_bad;
  end if;

  -- 4. THE ADVICE-PADDING REFUSAL (round thirteen). Both rows carrying it in
  --    this batch were proposed and dropped.
  select count(*) into v_bad from unified_tags
  where status = 'active' and (
       (slug='hiv-aids-awareness' and description like '%It is crucial for fostering%')
    or (slug='safe-sane-and-consensual-ssc' and description like '%responsible and ethical manner%')
  );
  if v_bad <> 2 then
    raise exception 'tag_description_measured_rewrite_b2: the advice-padding class was swept (found % of 2)', v_bad;
  end if;

  -- 5. NO VOICE VIOLATION SHIPS. This is the check batch 1 did not have.
  --    THE `s?` IS LOAD-BEARING: \m...\M anchors both ends of the word, so
  --    `\morganisation\M` does NOT match "organisations". Mutation testing
  --    caught this -- a British plural slipped through the first version of
  --    both this check and its guard test.
  select count(*) into v_bad from unified_tags
  where status = 'active'
    and slug in ('cetrorelix','pastor','switzerland','uk','civil-society','epsom',
                 'genre-essays','belly-play','intergender','rule-of-law')
    and (description ~* '\m(organisation|characterised|recognised|behaviour|licence)s?\M'
      or description ~* '\mnon-binary\M'
      or description ~* '\m(you|your)\M'
      or description ~ '!');
  if v_bad <> 0 then
    raise exception 'tag_description_measured_rewrite_b2: % row(s) carry a Tone of Voice violation', v_bad;
  end if;
end
$verify$;

commit;
