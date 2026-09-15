-- Round fifteen of the disowned-prose backlog: THE BODY-SIDE SEAM.
--
-- Rounds two to fourteen were all SUMMARY-FIRST. They ordered the backlog by
-- usage, by what the prose is about, by description/summary lexical overlap, by
-- a signature regex, by the half-repaired shape, by role-typing, by "the
-- summary says nothing", by one summary shared across a family, and by
-- gendering -- and every one of them SELECTED on `short_description`. The body
-- was only ever touched as a CONSEQUENCE: nulled when the summary above it was
-- wrong. Nothing has ever selected on the body itself.
--
-- That is the new axis, and it is new in the only sense that matters: it finds
-- rows no previous ordering could reach. Five body-side signatures were
-- measured over the 2,811 active rows carrying a body --
--   anatomy-as-gender in the body            13
--   the prose denies its own subject           3
--   the body cites Wikidata/Wikipedia to you  12
--   the body is a disambiguation list          6
--   the body names an album/game/genus/family  5
-- -- giving 39 distinct rows. Hand-reading all 39 gives the 15 here.
--
-- WHAT THE SIGNATURES FOUND AND A HUMAN REFUSED is again the more useful half,
-- and most of it is the signature matching CORRECT prose: `intersex-rights`,
-- `intersexuality`, `intersex-male` and `vulva` all say "male or female
-- bodies", which is the correct intersex phrasing and not a defect;
-- `bathroom-bills`, `lgbtq-history`, `club-culture`, `tradwife`, `no-homo`,
-- `transage`, `lover`, `water-bondage` and `satyromaniac` are correct as
-- written. The regex narrows what a human reads; it does not decide.
--
-- Refused for a STATED reason, each different, so a later pass does not
-- re-propose them:
--   * `pussy-worship`, `lingam-massage`, `ampallang`, `futanari` -- the
--     anatomy-as-gender rule of round fourteen requires the row's own
--     DESCRIPTION to have chosen the better word, and on all four the
--     description carries the same phrasing as the summary. There is no
--     contradiction to repair. Note the asymmetry this leaves inside one pair:
--     `yoni-massage` was repaired in round fourteen because its description
--     said "vulva and vagina", while `lingam-massage`'s says "male genitalia",
--     so the two halves of a pair are treated differently. That is the rule
--     working, not an oversight -- the same shape as round eleven's
--     `mademoiselle` / `monsieur`.
--   * `shemale` -- its body is reportage about how the pornography industry
--     uses a slur, on a deindexed row that already carries the "considered
--     offensive" caveat. Under-reaching is the correct error here.
--   * `mermaid`, `succubus`, `wolf` -- the description IS the generic sense
--     ("Mythical sea creature", "Female sexual demon", "Pack animal"), so
--     there is nothing on the row to derive from. `wolf` is refused for the
--     third round running, which is the deferral holding rather than nobody
--     reaching it.
--   * `turkish`, `brown-shower` -- description null or a bare pointer
--     ("see scat"); no evidence on the row establishes a sense.
--
-- The rule is unchanged and is what bounds this file: repair ONLY where the
-- row's own `description` establishes a sense the published prose contradicts
-- or fails to state, derive the replacement FROM that evidence, and NEVER
-- write `description` -- it is the evidence that justifies the repair.
--
-- BODY DISCIPLINE, same two moves as round fourteen and no others: a body is
-- NULLED (13 rows) or altered by an exact-phrase `replace()` (1 row). A
-- `replace()` cannot author prose, so every other sentence survives
-- byte-identical by construction. No body is authored. `manties` and
-- `jockstrap` keep bodies this file does not remove, and the verify block
-- asserts they survive -- nulling a good body is the exact mirror of leaving a
-- wrong one. Nulling is safe because `enforce_tag_thin_page_gate` reads
-- `tag_has_prose(description, short_description)`, which is an OR: the three
-- rows here whose description is null (`hunk`, `jockstrap`, `dance-floor`) all
-- keep a non-null summary.
--
-- SEVEN IDENTIFIERS ARE NULLED AND TWO ARE DELIBERATELY KEPT, which is the
-- distinction this round exists to draw. All eleven were resolved live against
-- wbgetentities rather than inferred from the prose:
--   nulled, because the entity is a namesake and the `wikipedia_url` is the
--   proof -- Q47788 "Wendy Testaburger, South Park character" (girlboss,
--   /wiki/Wendy_Testaburger), Q18912752 "disputed", a Wikidata QUALIFIER value
--   (unsure, /wiki/Controversy), Q3378002 "phallus cult" (cock-worship),
--   Q3409032 "unisex given name" (androgynous, /wiki/Unisex_name), Q18039772
--   "HUNK, protein-coding gene in the species Homo sapiens" (hunk -- the third
--   and fourth gene namesakes on this glossary after `futch` and `crumbs`),
--   Q7937924 "Vivisector, Marvel character", Q74107953 "Dance Floor, vocal
--   track by Zapp; 1982 studio recording".
--   KEPT, because the identifier is RIGHT and only the prose derived from it is
--   wrong -- Q1243210 really is the sex position and Q10940 really is the
--   garment. This is the `methadone` rule: a correct Wikidata identifier does
--   not make the prose derived from it correct, and the fix is the prose, not
--   the identifier. Both entities' own English DESCRIPTIONS are the defect
--   verbatim ("penetrated both vaginally and anally by two men"; "undergarment
--   originally designed for supporting the male genitalia"), which is exactly
--   how that prose got written.
-- Identifiers are NULLED, never repointed, because `tag_medical_codes_sync` and
-- `tag_wikidata_hierarchy` rebuild from them weekly: a plausible-but-wrong QID
-- regenerates wrong data forever while a null one regenerates nothing. Measured
-- first: none of the seven carries a medical code or a tag relation.
--
-- NOTHING IS WRITTEN TO `tag_wikidata_repair_audit`, deliberately. That table is
-- the INPUT to `tag_disowned_prose_signals()`, so a row there would make these
-- tags "repaired" and their prose-at-repair-time the baseline the sentinel
-- compares against -- perturbing a live metric to record what this file already
-- records. The prior values survive in `tag_change_log.before_data`. Round
-- twelve established this; check what consumes a table before writing to it.
--
-- THE METRIC MOVES BY ONE, NOT FIFTEEN, and the honest number is stated rather
-- than the flattering one. Replaying the sentinel's own CTE over these 15 slugs
-- returns exactly two rows, and only `nantaimori` currently counts as
-- surviving. Its summary is untouched here and its body is nulled, so
-- `ld_surviving` 151 -> 150, `sd_surviving` stays at 167, and
-- `indexable_surviving` stays at 159 (`nantaimori` is not indexable). The other
-- 14 were never dispositioned by the 2026-08-29 repair and the sentinel is
-- structurally blind to them.
--
-- The 22 `tag_sources` rows citing the seven disowned entities are left in
-- place and named as residue rather than swept: all 22 are `is_public = false`,
-- measured, so none of them renders anywhere.
--
-- Actor declaration IS load-bearing: 13 of the 15 rows are
-- `human_reviewed = true`, and `log_unified_tag_change()` RAISEs
-- "human_reviewed tag <uuid> cannot be modified by system:trigger" for an
-- undeclared actor. `androgynous` and `dance-floor` are the two exceptions.

select set_config('app.actor', 'admin:tag-prose-body-side-seam', true);

-- ---------------------------------------------------------------------------
-- GROUP A -- WRONG SUBJECT IN BOTH FIELDS (6 rows).
-- The original rule at its plainest: the row's own description establishes the
-- sense and both the summary and the body publish a different one.
-- `foot-top` is the sharpest, because its SIBLING settles it -- `foot-bottom`
-- already reads "The receiving partner in foot play." with no body, repaired in
-- an earlier round, while `foot-top` still published foot hygiene advice and a
-- sentence denying the term exists.
-- ---------------------------------------------------------------------------

update public.unified_tags
   set short_description = 'A woman who takes the confident, assertive lead in a relationship, often in role reversal and often said tongue-in-cheek.',
       long_description  = null,
       wikidata_id       = null,
       wikipedia_url     = null
 where slug = 'girlboss'
   and short_description = 'Fictional character in South Park';

update public.unified_tags
   set short_description = 'The dominant partner in foot play.',
       long_description  = null
 where slug = 'foot-top'
   and short_description = 'Foot care and wellness';

update public.unified_tags
   set short_description = 'Slang for vigorous, deep, rough penetrative sex -- hyperbole, not an injury.',
       long_description  = null
 where slug = 'rearrange-guts'
   and short_description = 'Colloquial term for gastrointestinal rearrangement surgery';

update public.unified_tags
   set short_description = 'Someone uncertain about, or still exploring, their gender identity.',
       long_description  = null,
       wikidata_id       = null,
       wikipedia_url     = null
 where slug = 'unsure'
   and short_description = 'Disputed or debated information';

update public.unified_tags
   set short_description = 'Reverential attention to the penis -- oral service, kissing, licking, verbal adoration -- as an expression of submission.',
       long_description  = null,
       wikidata_id       = null,
       wikipedia_url     = null
 where slug = 'cock-worship'
   and short_description = 'Spiritual belief in phallus'' divine properties';

update public.unified_tags
   set short_description = 'Combining masculine and feminine characteristics, in presentation or in body.',
       long_description  = null,
       wikidata_id       = null,
       wikipedia_url     = null
 where slug = 'androgynous'
   and short_description = 'Given name used regardless of sex';

-- ---------------------------------------------------------------------------
-- GROUP A2 -- WRONG SUBJECT, SENSE ESTABLISHED BY THE CATEGORY (1 row).
-- `hunk` has `description IS NULL`, so the original rule cannot reach it and it
-- is repaired under the widening of 51500101152700: the sense may be
-- established by a CATEGORY that admits exactly one reading of the tag's own
-- name. The REFUSAL half of that rule is what keeps it honest, and it was
-- applied here: `solo` was refused in round eleven because a TRAVEL platform
-- has a live ordinary reading of that word. "Hunk" filed under Fetishes and
-- flagged `is_adult` has no second reading on this site, so the widening holds.
-- Kept in its own group so no later reader takes group A's licence for it.
-- ---------------------------------------------------------------------------

update public.unified_tags
   set short_description = 'An admiring term for a conventionally muscular, good-looking man.',
       long_description  = null,
       wikidata_id       = null,
       wikipedia_url     = null
 where slug = 'hunk'
   and short_description = 'Protein-coding gene in humans';

-- ---------------------------------------------------------------------------
-- GROUP B -- THE SUMMARY IS ALREADY CORRECT AND ONLY THE BODY IS WRONG
-- (5 rows). This is the class that exists ONLY on this axis: a summary-ordered
-- sweep reads the lead line, finds it correct, and moves on. It is round
-- eight's half-repaired class seen from the other side -- there the body had
-- been fixed and the summary left; here the summary is right and the body was
-- never touched.
--   `vivisector`  -- a careful authored summary over a body that is a
--                    disambiguation list: vivisection, a Marvel superhero, a
--                    Patrick White novel, and a first-person shooter.
--   `female`      -- summary fine; the body is gamete essentialism ("an
--                    organism that produces the ovum"), the exact register
--                    `styleguide_terms` rates `never` and the class round six
--                    repaired on `woman`, `man`, `masc`, `girl` and `boy`.
--                    `female` was the sibling that pass missed.
--   `dance-floor` -- summary serviceable; the body is a flooring-products
--                    disambiguation dump (sprung floors, sport surfaces, "a
--                    specific song") that ends by announcing the term "has
--                    multiple meanings across different contexts".
--   `cake-and-cunnilingus-day` -- the body asserts "its origins are unclear"
--                    where the row's OWN description states the origin exactly
--                    (a response to Steak and Blowjob Day, one month after it).
--   `nantaimori`  -- the body opens "Nantaimori, also known as Nyotaimori",
--                    conflating the two terms the row exists to distinguish,
--                    and then distinguishes them in its next sentence.
-- No summary is written in this group. The description carries the meaning on
-- every one of them, and rewriting a correct summary is the LLM rewrite both
-- auto-apply paths were retired for.
-- ---------------------------------------------------------------------------

update public.unified_tags
   set long_description = null,
       wikidata_id      = null,
       wikipedia_url    = null
 where slug = 'vivisector'
   and long_description like '%Marvel comic book superhero%';

update public.unified_tags
   set long_description = null
 where slug = 'female'
   and long_description like '%organism that produces the ovum%';

update public.unified_tags
   set long_description = null,
       wikidata_id      = null,
       wikipedia_url    = null
 where slug = 'dance-floor'
   and long_description like '%sprung floor%';

update public.unified_tags
   set long_description = null
 where slug = 'cake-and-cunnilingus-day'
   and long_description like '%its origins are unclear%';

update public.unified_tags
   set long_description = null
 where slug = 'nantaimori'
   and long_description like '%also known as Nyotaimori%';

-- ---------------------------------------------------------------------------
-- GROUP C -- CORRECT IDENTIFIER, WRONG PROSE DERIVED FROM IT (2 rows).
-- The `methadone` rule. Both QIDs resolve to exactly the right thing, so
-- nothing is nulled here; what is wrong is that the sweep wrote our prose from
-- the ENTITY'S OWN English description, and on both of these that description
-- states anatomy as a gender and narrows the concept.
--   `double-penetration` -- our description says "Two people penetrating the
--     same partner at the same time", carrying no anatomy and no gender. Q1243210's
--     description is "penetrated both vaginally and anally by two men", and that
--     is what both our summary and our body published. The body additionally
--     cites Wikidata to the reader and closes on the banned advisory register.
--   `jockstrap` -- the row's own body already names the anatomy correctly one
--     sentence later ("protecting the scrotum and penis"), so the evidence sits
--     on the row twice. The body is fixed by an exact-phrase `replace()`.
-- ---------------------------------------------------------------------------

update public.unified_tags
   set short_description = 'A position in which two people penetrate the same partner at once.',
       long_description  = null
 where slug = 'double-penetration'
   and short_description = 'Sex position with simultaneous vaginal and anal penetration';

update public.unified_tags
   set short_description = 'Undergarment that supports and protects the penis and testicles.',
       long_description  = replace(long_description, 'supporting the male genitalia', 'supporting the penis and testicles')
 where slug = 'jockstrap'
   and short_description = 'Undergarment for supporting male genitalia';

-- ---------------------------------------------------------------------------
-- GROUP D -- A NULL SUMMARY FILLED FROM THE ROW'S OWN DESCRIPTION (1 row).
-- `manties` is `seo_indexable` with a real, hand-written body and NO summary at
-- all, so the lead line and the search-facet text were both empty. Filling a
-- null destroys nothing and chooses no sense: the replacement restates the
-- row's own description and adds nothing to it. The body is deliberately left
-- exactly as it stands.
-- ---------------------------------------------------------------------------

update public.unified_tags
   set short_description = 'Feminine-cut underwear worn by men, as a lingerie fetish or simply as preference.'
 where slug = 'manties'
   and short_description is null;

-- ---------------------------------------------------------------------------
-- POSTCONDITIONS.
-- Every check tests for the WRONG state or counts the REACHED state, never
-- "this file changed N rows": a concurrent session's better repair must satisfy
-- them too, because a RAISE here aborts `db push` on main and takes every
-- migration queued behind it.
-- ---------------------------------------------------------------------------

do $verify$
declare
  v_bad integer;
begin
  -- 1. No row in the pass still publishes the defect summary.
  select count(*) into v_bad
    from public.unified_tags
   where slug in ('girlboss','foot-top','rearrange-guts','unsure','cock-worship','androgynous',
                  'hunk','double-penetration','jockstrap')
     and short_description in (
       'Fictional character in South Park',
       'Foot care and wellness',
       'Colloquial term for gastrointestinal rearrangement surgery',
       'Disputed or debated information',
       'Spiritual belief in phallus'' divine properties',
       'Given name used regardless of sex',
       'Protein-coding gene in humans',
       'Sex position with simultaneous vaginal and anal penetration',
       'Undergarment for supporting male genitalia');
  if v_bad <> 0 then
    raise exception 'round fifteen: % row(s) still publish a wrong-subject summary', v_bad;
  end if;

  -- 2. Positive form: all 15 reached a usable state, counted by the state
  --    REACHED. Calls the real predicate instead of restating it -- the
  --    thin-page gate is an OR, and three rows here have a null description.
  select count(*) into v_bad
    from public.unified_tags
   where slug in ('girlboss','foot-top','rearrange-guts','unsure','cock-worship','androgynous',
                  'hunk','vivisector','female','dance-floor','cake-and-cunnilingus-day',
                  'nantaimori','double-penetration','jockstrap','manties')
     and status = 'active'
     and public.tag_has_prose(description, short_description)
     and coalesce(btrim(short_description), '') <> '';
  if v_bad <> 15 then
    raise exception 'round fifteen: expected 15 rows publishable and carrying a summary, found %', v_bad;
  end if;

  -- 3. Every summary in the pass is distinct.
  select count(distinct short_description) into v_bad
    from public.unified_tags
   where slug in ('girlboss','foot-top','rearrange-guts','unsure','cock-worship','androgynous',
                  'hunk','vivisector','female','dance-floor','cake-and-cunnilingus-day',
                  'nantaimori','double-penetration','jockstrap','manties');
  if v_bad <> 15 then
    raise exception 'round fifteen: expected 15 distinct summaries, found %', v_bad;
  end if;

  -- 4. The 13 bodies this file removes are gone.
  select count(*) into v_bad
    from public.unified_tags
   where slug in ('girlboss','foot-top','rearrange-guts','unsure','cock-worship','androgynous',
                  'hunk','vivisector','female','dance-floor','cake-and-cunnilingus-day',
                  'nantaimori','double-penetration')
     and long_description is not null;
  if v_bad <> 0 then
    raise exception 'round fifteen: % body/bodies that should be null survive', v_bad;
  end if;

  -- 5. MIRROR CONTROL. "The thirteen are gone" is equally satisfied by a sweep
  --    that took everything, so assert the bodies that must SURVIVE -- two
  --    inside the pass, two kept by round fourteen, and two outside both passes
  --    on the same backlog.
  select count(*) into v_bad
    from public.unified_tags
   where slug in ('manties','jockstrap','bimbo','yoni-massage','aftercare','chosen-family')
     and coalesce(btrim(long_description), '') <> '';
  if v_bad <> 6 then
    raise exception 'round fifteen: expected 6 surviving bodies (2 in-pass, 4 controls), found %', v_bad;
  end if;

  -- 6. The `jockstrap` body was REPLACED, not rewritten: the wrong phrase is
  --    gone and the sentence the row already had is still there.
  select count(*) into v_bad
    from public.unified_tags
   where slug = 'jockstrap'
     and long_description not like '%male genitalia%'
     and long_description like '%protecting the scrotum and penis%'
     and long_description like '%suspensorium%';
  if v_bad <> 1 then
    raise exception 'round fifteen: the jockstrap body was not a phrase replacement';
  end if;

  -- 7. The seven namesake identifiers are gone AND the two correct ones SURVIVE.
  --    Both halves together are the distinction this round exists to draw; the
  --    first half alone is satisfied by a sweep that cleared all nine.
  select count(*) into v_bad
    from public.unified_tags
   where slug in ('girlboss','unsure','cock-worship','androgynous','hunk','vivisector','dance-floor')
     and (wikidata_id is not null or wikipedia_url is not null);
  if v_bad <> 0 then
    raise exception 'round fifteen: % namesake identifier(s) survive', v_bad;
  end if;

  select count(*) into v_bad
    from public.unified_tags
   where (slug = 'double-penetration' and wikidata_id = 'Q1243210')
      or (slug = 'jockstrap'          and wikidata_id = 'Q10940');
  if v_bad <> 2 then
    raise exception 'round fifteen: expected both CORRECT identifiers to survive, found %', v_bad;
  end if;

  -- 8. THE ROWS THIS PASS REFUSED are untouched, so a later pass can tell a
  --    stated refusal from a row nobody reached. `pussy-worship`,
  --    `lingam-massage` and `ampallang` carry the anatomy phrase in their own
  --    descriptions; `shemale` is reportage on a slur; `mermaid`, `succubus`
  --    and `wolf` have a description that IS the generic sense.
  select count(*) into v_bad
    from public.unified_tags
   where (slug = 'pussy-worship'  and short_description = 'A fetish or kink involving worship of female genitalia')
      or (slug = 'lingam-massage' and short_description = 'A type of erotic massage focusing on male genital area')
      or (slug = 'ampallang'      and short_description = 'Male genital piercing through glans')
      or (slug = 'shemale'        and short_description = 'Term for trans women with male genitalia and female characteristics')
      or (slug = 'mermaid'        and short_description = 'Mythical creature with human upper body and fish tail')
      or (slug = 'succubus'       and short_description = 'Female demon in European folklore')
      or (slug = 'wolf'           and short_description = 'Largest wild canine species');
  if v_bad <> 7 then
    raise exception 'round fifteen: expected 7 refused rows untouched, found %', v_bad;
  end if;

  -- 9. THE SIBLING PAIR now matches, which is what settled `foot-top`.
  select count(*) into v_bad
    from public.unified_tags
   where (slug = 'foot-bottom' and short_description = 'The receiving partner in foot play.')
      or (slug = 'foot-top'    and short_description = 'The dominant partner in foot play.');
  if v_bad <> 2 then
    raise exception 'round fifteen: expected the foot-play pair to match, found %', v_bad;
  end if;

  -- 10. ROUND THIRTEEN'S REFUSAL, re-asserted for the second round running.
  --     Thirteen body nulls are exactly the shape that could take a protected
  --     row with them. One check, three authors.
  select count(*) into v_bad
    from public.unified_tags
   where slug in ('rape-play','piss-drinker','hiv-transmission','water-bondage',
                  'electrostimulation','morosexual','latino','alloromantic')
     and status = 'active'
     and long_description ~* 'it(''s| is) (essential|important) to (prioritize|remember|note|understand)';
  if v_bad <> 8 then
    raise exception 'round fifteen: expected all 8 refused content-bearing rows to keep their sentence, found %', v_bad;
  end if;
end $verify$;
