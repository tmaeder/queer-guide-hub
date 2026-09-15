-- Round fourteen of the disowned-prose backlog: the GENDERING class.
--
-- Rounds two to thirteen worked this backlog on four selection axes (usage,
-- what the prose is about, description/summary lexical overlap, and a query for
-- the half-repaired shape). Round ten named a class it deliberately did NOT
-- work and sent to a pass with its siblings: `bimbo`, deferred because "the
-- defect there is GENDERING, not subject" -- the femme / man / drag-show /
-- masc / crotch-rope class, where the concept is right and the prose writes
-- most of the audience out of their own glossary entry.
--
-- SELECTED MECHANICALLY, not by eye, which is round ten's own lesson: the
-- summary names a gender (woman/man/female/male/girl/boy) while the row's own
-- `description` does NOT, over the role and identity categories. That returned
-- 35 rows; hand-reading them gives the 22 here. The regex narrows what a human
-- reads; it does not decide.
--
-- WHAT THE REGEX FOUND AND A HUMAN REFUSED, because the gender is the term's
-- own content rather than an imposition on it: `cuckoldress`, `satyress`,
-- `nun`, `brother`, `big-sister`, `little-sister` (the -ess / -maid / sibling
-- words carry gender in the name); `cottaging` (the row's own description also
-- says gay men); `final-girl` and `nymphic-domme` (gendered in the field the
-- term comes from -- under-reaching is the correct error); `genderqueer`,
-- `transfeminism`, `gender-gap` (correct as written); `transmasc` (its
-- description is the GENERIC trans definition and establishes nothing about
-- this tag, the generic-sense shape).
--
-- The rule is unchanged and is what bounds this file: repair ONLY where the
-- row's own `description` establishes a sense the summary contradicts or fails
-- to state, derive the new summary FROM that description, and NEVER write
-- `description` -- it is the evidence that justifies the repair.
--
-- BODY DISCIPLINE, stated once so no later reader has to infer it. The summary
-- is always replaced. The body is touched in exactly two ways and no others:
--   (a) NULLED where it is the wrong subject or adds nothing beyond the
--       gendered claim the summary made (16 rows), which is safe because
--       `enforce_tag_thin_page_gate` reads `tag_has_prose(description,
--       short_description)` only and every one of these keeps a description;
--   (b) an exact-phrase `replace()` for an anatomical mis-gendering (2 rows).
--       A `replace()` cannot author prose, so every other sentence survives
--       byte-identical by construction rather than by retyping.
-- No body is authored. `bimbo`, `yoni-massage` and `gender-variance` keep
-- bodies this file does not touch, and the verify block asserts they survive --
-- nulling a good body is the exact mirror of leaving a wrong one.
--
-- THE REFUSAL OF ROUND THIRTEEN IS RE-ASSERTED HERE, deliberately. Sixteen body
-- nulls are exactly the shape that could quietly take a protected row with
-- them, so this file re-checks that the eight named content-bearing rows still
-- carry their banned-register sentences. One check, two authors.
--
-- Actor declaration IS load-bearing on this tranche: 21 of the 22 rows are
-- `human_reviewed = true`, and `log_unified_tag_change()` RAISEs
-- "human_reviewed tag <uuid> cannot be modified by system:trigger" for an
-- undeclared actor. `daddy` is the one exception. Verified live, not assumed.

select set_config('app.actor', 'admin:tag-prose-gendering-and-narrowing', true);

-- ---------------------------------------------------------------------------
-- GROUP A -- GENDERING (11 rows).
-- The row's own description is neutral or explicitly hedged and the summary
-- asserts a gender. `brat-queen` is the sharpest: its description says "their"
-- and "They" twice over, and the summary answered "woman".
-- ---------------------------------------------------------------------------

update public.unified_tags
   set short_description = 'A role built on exaggerated feminine presentation, taken up by people of any gender.'
 where slug = 'bimbo'
   and short_description = 'Slang term for a stereotypical attractive, sexualized woman';

update public.unified_tags
   set short_description = 'A brat who drives the dynamic rather than reacting to it, setting the tone through provocation and mischief.',
       long_description  = null
 where slug = 'brat-queen'
   and short_description = 'A term for a dominant, youthful woman';

update public.unified_tags
   set short_description = 'A role fusing sexual openness with wanting to be pampered and adored, most often taken by feminine-identifying people.',
       long_description  = null
 where slug = 'slutty-princess'
   and short_description = 'A playful, empowering term for women who embrace their sexuality';

update public.unified_tags
   set short_description = 'Someone who takes the title Mommy while holding a primarily submissive mindset, balancing care with submission.',
       long_description  = null
 where slug = 'submissive-mommy'
   and short_description = 'A term for a submissive woman, often in a BDSM context.';

update public.unified_tags
   set short_description = 'A sibling role played submissively, open to people of any gender.',
       long_description  = null
 where slug = 'submissive-sister'
   and short_description = 'A term for a submissive woman in BDSM community';

-- `switchtress` carries TWO defects and the second is the worse one: a
-- switchtress switches, and the summary called her "a female dominant". That is
-- the wrong PRACTICE on a glossary where top, bottom and switch are separate
-- live entries -- the `foot-bottom` shape.
update public.unified_tags
   set short_description = 'A switch with a confident, Top-leaning presence, most often used by femme-identified people.',
       long_description  = null
 where slug = 'switchtress'
   and short_description = 'A term for a female dominant in BDSM';

update public.unified_tags
   set short_description = 'A role built on being imperilled and rescued.',
       long_description  = null
 where slug = 'damsel-in-distress'
   and short_description = 'Classic trope of a woman in need of rescue';

-- The description says feminine-PRESENTING; the summary said "a woman". Those
-- are not the same claim, and on this platform the difference is the point.
update public.unified_tags
   set short_description = 'A role built on the fantasy of being a feminine-presenting robot or android, programmed to serve, please or perform.',
       long_description  = null
 where slug = 'fembot'
   and short_description = 'Robot resembling a woman';

update public.unified_tags
   set short_description = 'An instinctual father-figure role, driven by primal rather than formal dominance.',
       long_description  = null
 where slug = 'primal-daddy'
   and short_description = 'A term for a masculine, older gay man';

-- `diva` was deferred by round ten on the ground that any summary derivable
-- from "Prima donna role" plus the tag's own name would define the term with
-- the term. Under the gendering lens it is reachable: a prima donna is a
-- leading performer, which is statable without using the word diva.
update public.unified_tags
   set short_description = 'A performer role built on star presence and exacting standards.'
 where slug = 'diva'
   and short_description = 'Celebrated woman of outstanding talent';

update public.unified_tags
   set short_description = 'A title of respect for a dominant, used regardless of the holder''s gender.',
       long_description  = null
 where slug = 'sir'
   and short_description = 'Term of respect for men';

-- ---------------------------------------------------------------------------
-- GROUP B -- ANATOMY PUBLISHED AS GENDER (4 rows).
-- The crotch-rope / breast-bondage / masc class: the row's own description is
-- anatomical and the summary restates it as a gender. On a platform whose
-- readers include trans people, "male genitals" and "the penis and testicles"
-- are not interchangeable, and the description already chose the right one.
-- ---------------------------------------------------------------------------

-- The description says "a person of ANY GENDER EXPRESSION" in as many words;
-- the summary published "Biological development of male characteristics",
-- which is precisely the claim that description exists to refuse. The `masc`
-- shape exactly.
update public.unified_tags
   set short_description = 'Play in which someone of any gender expression takes on a more masculine aesthetic.',
       long_description  = null
 where slug = 'masculinization'
   and short_description = 'Biological development of male characteristics';

update public.unified_tags
   set short_description = 'BDSM play applying pain or constriction to the penis and testicles.',
       long_description  = replace(long_description, 'the male genitals', 'the penis and testicles')
 where slug = 'cock-and-ball-torture'
   and short_description = 'Form of sexual play involving pain or constriction to male genitals';

-- Body KEPT and asserted below: it is careful, correct prose about the right
-- subject. Only the summary mis-stated the anatomy as a gender.
update public.unified_tags
   set short_description = 'Slow, non-goal-oriented massage of the vulva and vagina, drawn from tantric practice.'
 where slug = 'yoni-massage'
   and short_description = 'Tantric massage focusing on female erogenous zones';

update public.unified_tags
   set short_description = 'Someone who eroticises penises, worshipping them as the focus of play.',
       long_description  = replace(long_description, 'male genitalia', 'penises')
 where slug = 'cock-worshipper'
   and short_description = 'Individual who admires or fetishizes male genitalia';

-- ---------------------------------------------------------------------------
-- GROUP C -- THE LITERAL SENSE ON A ROLE PAGE (6 rows).
-- The original rule at its plainest: the description types the row as a role
-- and the summary published the dictionary entry for the word.
-- ---------------------------------------------------------------------------

update public.unified_tags
   set short_description = 'A dominant role built on paternal care and authority.',
       long_description  = null
 where slug = 'daddy'
   and short_description = 'Male parent of a child';

update public.unified_tags
   set short_description = 'A role built on a cute, childlike persona.',
       long_description  = null
 where slug = 'babydoll'
   and short_description = 'Type of nightwear for women';

update public.unified_tags
   set short_description = 'A submissive role centred on running the home and supporting a partner, in exchange for structure or protection.',
       long_description  = null
 where slug = 'housewife'
   and short_description = 'Woman managing her family''s home';

update public.unified_tags
   set short_description = 'A persona built on a confident, warm and mischievous aunty figure -- sensual charm with indulgent care and firm standards.',
       long_description  = null
 where slug = 'hot-aunty'
   and short_description = 'Term for a respected older LGBTQ+ woman';

update public.unified_tags
   set short_description = 'A divine-child role, adored and indulged.',
       long_description  = null
 where slug = 'little-goddess'
   and short_description = 'Term of endearment for a young trans woman';

-- `unicorn` was deferred by 60000301100100 as naming TWO senses at once
-- ("Mythical creature or third person"). It is reachable now for a reason that
-- did not exist when it was deferred: rounds nine and ten established that a
-- description typing the row as a ROLE contradicts a summary asserting the tag
-- names an ANIMAL. This row is filed Dynamics & Roles and its own description
-- names the third-person sense; the summary answered with the horned beast.
-- A deferral is a claim about the data and decays like any other.
update public.unified_tags
   set short_description = 'A third person who joins an established couple.',
       long_description  = null
 where slug = 'unicorn'
   and short_description = 'Mythical creature with a single horn';

-- ---------------------------------------------------------------------------
-- GROUP D -- PATHOLOGISING (1 row).
-- Not a gendering defect and labelled separately so no later reader takes one
-- group's licence and applies it to another. `gender-variance` is indexable and
-- its own description says "the diversity and range of gender identities and
-- expressions"; the summary called it a "Condition". The body carries the same
-- framing in its first sentence and is NOT touched here -- repairing it means
-- authoring prose, which is the line this series does not cross. Named in the
-- header as remaining rather than left for someone to rediscover.
-- ---------------------------------------------------------------------------

update public.unified_tags
   set short_description = 'The range of gender identities and expressions that exist beyond the binary.'
 where slug = 'gender-variance'
   and short_description = 'Condition where identity doesn''t conform to male/female norms';

do $verify$
declare
  v_bad int;
begin
  -- 1. No row in this pass still publishes the summary it was repaired for.
  --    Tests for the WRONG text, so a better fix written by a concurrent
  --    session also satisfies it rather than aborting db push for the repo.
  select count(*) into v_bad
    from public.unified_tags
   where slug in ('bimbo','brat-queen','slutty-princess','submissive-mommy','submissive-sister',
                  'switchtress','damsel-in-distress','fembot','primal-daddy','diva','sir',
                  'masculinization','cock-and-ball-torture','yoni-massage','cock-worshipper',
                  'daddy','babydoll','housewife','hot-aunty','little-goddess','unicorn',
                  'gender-variance')
     and short_description in (
       'Slang term for a stereotypical attractive, sexualized woman',
       'A term for a dominant, youthful woman',
       'A playful, empowering term for women who embrace their sexuality',
       'A term for a submissive woman, often in a BDSM context.',
       'A term for a submissive woman in BDSM community',
       'A term for a female dominant in BDSM',
       'Classic trope of a woman in need of rescue',
       'Robot resembling a woman',
       'A term for a masculine, older gay man',
       'Celebrated woman of outstanding talent',
       'Term of respect for men',
       'Biological development of male characteristics',
       'Form of sexual play involving pain or constriction to male genitals',
       'Tantric massage focusing on female erogenous zones',
       'Individual who admires or fetishizes male genitalia',
       'Male parent of a child',
       'Type of nightwear for women',
       'Woman managing her family''s home',
       'Term for a respected older LGBTQ+ woman',
       'Term of endearment for a young trans woman',
       'Mythical creature with a single horn',
       'Condition where identity doesn''t conform to male/female norms');
  if v_bad <> 0 then
    raise exception 'round fourteen: % row(s) still publish a gendered or literal-sense summary', v_bad;
  end if;

  -- 2. Positive form: all 22 reached a usable state, counted by the state
  --    REACHED rather than by rows in a bad state -- the latter returns a
  --    reassuring zero for a slug that has gone missing from the corpus.
  --    Calls the real predicate instead of restating it: the thin-page gate is
  --    an OR, and a hand-rolled "both present" form fails on rows whose
  --    description is legitimately null.
  select count(*) into v_bad
    from public.unified_tags
   where slug in ('bimbo','brat-queen','slutty-princess','submissive-mommy','submissive-sister',
                  'switchtress','damsel-in-distress','fembot','primal-daddy','diva','sir',
                  'masculinization','cock-and-ball-torture','yoni-massage','cock-worshipper',
                  'daddy','babydoll','housewife','hot-aunty','little-goddess','unicorn',
                  'gender-variance')
     and status = 'active'
     and public.tag_has_prose(description, short_description);
  if v_bad <> 22 then
    raise exception 'round fourteen: expected 22 rows publishable and carrying a summary, found %', v_bad;
  end if;

  -- 3. Every summary in the pass is distinct -- states the file's purpose
  --    directly, since a shared string is the defect one round earlier.
  select count(distinct short_description) into v_bad
    from public.unified_tags
   where slug in ('bimbo','brat-queen','slutty-princess','submissive-mommy','submissive-sister',
                  'switchtress','damsel-in-distress','fembot','primal-daddy','diva','sir',
                  'masculinization','cock-and-ball-torture','yoni-massage','cock-worshipper',
                  'daddy','babydoll','housewife','hot-aunty','little-goddess','unicorn',
                  'gender-variance');
  if v_bad <> 22 then
    raise exception 'round fourteen: expected 22 distinct summaries, found %', v_bad;
  end if;

  -- 4. The 16 bodies this file removes are gone.
  select count(*) into v_bad
    from public.unified_tags
   where slug in ('brat-queen','slutty-princess','submissive-mommy','submissive-sister','switchtress',
                  'damsel-in-distress','fembot','primal-daddy','sir','masculinization','daddy',
                  'babydoll','housewife','hot-aunty','little-goddess','unicorn')
     and long_description is not null;
  if v_bad <> 0 then
    raise exception 'round fourteen: % body/bodies that should be null survive', v_bad;
  end if;

  -- 5. MIRROR CONTROL. "The sixteen are gone" is equally satisfied by a sweep
  --    that took everything, so assert the bodies that must SURVIVE -- three
  --    inside the pass and two outside it on the same backlog.
  select count(*) into v_bad
    from public.unified_tags
   where slug in ('bimbo','yoni-massage','gender-variance','cock-and-ball-torture','cock-worshipper',
                  'aftercare','chosen-family')
     and coalesce(btrim(long_description), '') <> '';
  if v_bad <> 7 then
    raise exception 'round fourteen: expected 7 surviving bodies (5 in-pass, 2 controls), found %', v_bad;
  end if;

  -- 6. The two anatomical phrase replacements landed, and landed as
  --    replacements rather than rewrites.
  select count(*) into v_bad
    from public.unified_tags
   where (slug = 'cock-and-ball-torture' and long_description like '%male genitals%')
      or (slug = 'cock-worshipper'       and long_description like '%male genitalia%');
  if v_bad <> 0 then
    raise exception 'round fourteen: % body/bodies still state anatomy as a gender', v_bad;
  end if;

  -- 7. ROUND THIRTEEN'S REFUSAL, re-asserted. Sixteen body nulls are exactly
  --    the shape that could take a protected row with them.
  select count(*) into v_bad
    from public.unified_tags
   where slug in ('rape-play','piss-drinker','hiv-transmission','water-bondage',
                  'electrostimulation','morosexual','latino','alloromantic')
     and status = 'active'
     and long_description ~* 'it(''s| is) (essential|important) to (prioritize|remember|note|understand)';
  if v_bad <> 8 then
    raise exception 'round fourteen: expected all 8 refused content-bearing rows to keep their sentence, found %', v_bad;
  end if;

  -- 8. The DEFERRED rows are untouched, so a later pass can tell a deliberate
  --    refusal from a row nobody reached. `milkmaid` and `satyress` carry
  --    gender in their own names; `titica`'s description is contaminated;
  --    `zaddy`'s is truncated mid-sentence; `wolf` and `knight` have a
  --    description that IS the generic sense.
  select count(*) into v_bad
    from public.unified_tags
   where (slug = 'milkmaid' and short_description = 'Woman employed to milk cows and prepare dairy products')
      or (slug = 'satyress' and short_description = 'Mythical female creature, counterpart to satyrs')
      or (slug = 'titica'   and short_description = 'Angolan kuduro musician and dancer')
      or (slug = 'zaddy'    and short_description = 'Term for an attractive older man')
      or (slug = 'wolf'     and short_description = 'Largest wild canine species')
      or (slug = 'knight'   and short_description = 'Honorary title granted for service');
  if v_bad <> 6 then
    raise exception 'round fourteen: expected 6 deferred rows untouched, found %', v_bad;
  end if;
end $verify$;
