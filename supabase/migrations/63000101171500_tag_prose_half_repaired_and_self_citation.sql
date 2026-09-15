-- Round eight of the disowned-prose backlog, continuing 62000101163000.
--
-- Same rule as every round: repair only where the row's own evidence establishes a
-- sense the published prose contradicts, derive the new summary FROM that evidence,
-- and never write `description` — it is the evidence, not the output.
--
-- WHAT IS NEW HERE IS THE QUERY THAT FOUND GROUP A, and it is worth keeping.
-- Round six found half-repaired rows by hand, one signature at a time. The shape is
-- exactly expressible against the sentinel's own CTE: the SUMMARY still matches what
-- the disowned entity produced while the BODY no longer does, i.e. somebody repaired
-- the body and left the lead line. Five rows, and in every one the row's own
-- long_description is correct authored prose that establishes the sense, so there is
-- no inference at all — the evidence is on the row twice, in the body and in the
-- description. face-fucking is the sharpest: an indexable page whose body is careful
-- negotiated-play prose under a lead line reading "Adult film production company".
-- pretzel published "Baked pastry made from dough" over a description that reads
-- "A flexible bottom who enjoys being folded into demanding positions".
--
-- THREE GROUPS, kept labelled so a later reader cannot take the loosest group's
-- licence and apply it to the rest.
--
-- A. HALF-REPAIRED (5). Summary only. The body is correct and is NEVER touched.
-- B. THIN OR META SUMMARY (7). The summary is a meta-label ("Masturbation discussion"
--    is a category label, not a definition), the term itself ("Vetted"), an invented
--    framework, or a DIFFERENT concept: power-bottom published the definition of
--    `bottom`, which is a separate live tag, so the corpus defined bottom twice and
--    the power-bottom page never said what the word adds. Where the description is
--    too thin to author a body from, the body is NULLED, never invented — the
--    steer/lion rule of 51500101152700 and the doe/fae/flock group of 60000301100100.
-- C. CITES ITS OWN SOURCE (6). The register defect 60000301100000 repaired on
--    pride-events/gay-men/workplace-equality. Exactly six rows carry it corpus-wide,
--    so this drives a countable cohort to zero rather than sampling it.
--
--    The removal is a `replace()` of one exact sentence, NOT a new literal body. That
--    is deliberate and is the stronger guarantee: a replace() cannot author prose, so
--    every other sentence survives byte-identical by construction rather than by my
--    having retyped it correctly, and a concurrent edit elsewhere in the body is
--    preserved instead of clobbered.
--
--    ONE JUDGEMENT CALL, STATED RATHER THAN BURIED: hormone-blockers and anal-warts
--    lose a substantive-sounding claim along with the citation ("shown to be a safe
--    and effective way to support transgender and non-binary youth"). This is
--    deliberate. "According to a scientific article published on 09 October 2020"
--    identifies no article, so it is the APPEARANCE of a citation, and an
--    unverifiable medical claim on a trans-health page is worse than no claim. The
--    remaining sentences still say what blockers do, that they are prescribed, and
--    that they are reversible. A real citation belongs in `tag_sources`, which has an
--    `is_public` gate and a CHECK that makes an incomplete row unpublishable — a
--    separate change, not a side effect of a prose repair.
--
-- MEASURED AND DELIBERATELY NOT DONE: the advice-register padding ("it is essential
-- to ...") sits on 385 active rows. Repairing the two that happen to fall in this
-- tranche would be a 2-row sample of a whole-corpus register decision, which is the
-- bulk-rewrite experiment this repo already ran and retired. Left standing and named.
--
-- Nulling a body is safe and is ASSERTED, not assumed: enforce_tag_thin_page_gate
-- reads tag_has_prose(description, short_description) only, and every row here keeps
-- its description. long_description is not in trg_search_documents_tag's column list,
-- so the body writes cause zero search churn.
--
-- 14 of these 18 rows are human_reviewed, so the actor declaration is load-bearing:
-- log_unified_tag_change() RAISEs when a `system:%` actor modifies such a row.
--
-- CONCURRENT SESSION ON THIS SAME SEAM — READ THIS BEFORE EDITING.
-- `62000201100000_tag_prose_summary_seam.sql`, on branch
-- claude/glossary-tag-quality-761286, is another session working the identical
-- backlog and also calling itself round eight. It found its rows by a third
-- ordering (lexical overlap between a row's description and its own summary)
-- and it OVERLAPS THIS FILE ON EXACTLY TWO ROWS: `masturbating` and `vetted`.
--
-- The two files compose, and the reason is the discipline both were written
-- under rather than luck: each side content-guards on the SAME defect text
-- ('Masturbation discussion', 'Vetted'), so whichever applies second matches
-- nothing and writes nothing; and each side's postcondition asserts THE WRONG
-- TEXT IS GONE rather than asserting its own wording, so both pass whichever
-- order they land in. That file also asserts `masturbating` keeps its body,
-- which is the same invariant as postcondition 5 here.
--
-- The two rows are deliberately KEPT rather than dropped. 60000301100000
-- dropped its overlapping statements, but there the other migration had
-- already APPLIED, so keeping them would have rewritten correct prose. Here
-- neither branch has merged, so dropping a row on the assumption that the
-- other session lands it is how BOTH sessions drop it and nobody fixes it.
-- A guarded no-op costs nothing; a shared blind spot costs the row.

select set_config('app.actor', 'migration:63000101171500', true);

-- ---------------------------------------------------------------------------
-- A. HALF-REPAIRED — summary only. The body already carries the right sense.
-- ---------------------------------------------------------------------------

update unified_tags
   set short_description = 'Rough oral sex in which the penetrating partner does the thrusting.'
 where slug = 'face-fucking' and status = 'active'
   and short_description = 'Adult film production company';

update unified_tags
   set short_description = 'Erotic play around insemination and impregnation, usually as fantasy.'
 where slug = 'breeding' and status = 'active'
   and short_description = 'Biological process of producing offspring';

update unified_tags
   set short_description = 'Sex using the mouth on a partner''s genitals.'
 where slug = 'oral' and status = 'active'
   and short_description = 'Related to the mouth';

update unified_tags
   set short_description = 'Stimulating one''s own genitals for pleasure, alone or in company.'
 where slug = 'masturbating' and status = 'active'
   and short_description = 'Masturbation discussion';

update unified_tags
   set short_description = 'A flexible bottom who enjoys being folded into demanding positions.'
 where slug = 'pretzel' and status = 'active'
   and short_description = 'Baked pastry made from dough';

-- ---------------------------------------------------------------------------
-- B. THIN OR META SUMMARY — derived from the row's own description.
--    Bodies already null: impact-model, vetted, ducky.
-- ---------------------------------------------------------------------------

update unified_tags
   set short_description = 'A person who models in an impact-play demonstration.'
 where slug = 'impact-model' and status = 'active'
   and short_description = 'Model for understanding LGBTQ+ community impact';

update unified_tags
   set short_description = 'Approved by an organiser or community to attend events.'
 where slug = 'vetted' and status = 'active'
   and short_description = 'Vetted';

update unified_tags
   set short_description = 'A duck persona.'
 where slug = 'ducky' and status = 'active'
   and short_description = 'Nickname or fictional character name';

-- feeder is the exact sibling of feedee, repaired in 62000101163000: the description
-- names a PERSON and the prose defined the COMMUNITY. Body nulled — "Person who feeds
-- others" is enough to fix the summary and not enough to author a body from.
update unified_tags
   set short_description = 'The person who does the feeding.',
       long_description  = null
 where slug = 'feeder' and status = 'active'
   and short_description = 'Community related to feeding and weight gain';

-- power-bottom published the definition of `bottom`, a separate live tag. Its body
-- does not distinguish the two either, so the body goes rather than being kept as a
-- second statement of the wrong thing.
update unified_tags
   set short_description = 'A receptive partner who drives the pace.',
       long_description  = null
 where slug = 'power-bottom' and status = 'active'
   and short_description = 'A person who takes a receptive role in sex';

update unified_tags
   set short_description = 'A person who pursues pleasure.',
       long_description  = null
 where slug = 'hedonist' and status = 'active'
   and short_description = 'Philosophy prioritizing pleasure';

-- Summary only: the body is generic but not wrong, which is not this file's business.
update unified_tags
   set short_description = 'The health of the muscles and tissues that support the pelvic organs.'
 where slug = 'pelvic-floor-health' and status = 'active'
   and short_description = 'Pelvic floor health information';

-- ---------------------------------------------------------------------------
-- C. CITES ITS OWN SOURCE — remove that one sentence, nothing else.
--    Four sit mid-body (trailing space removed); two are final (leading space).
-- ---------------------------------------------------------------------------

update unified_tags
   set long_description = replace(long_description,
         'According to a scientific article published in 1971, anal warts can be treated and managed with various medical options. ', '')
 where slug = 'anal-warts' and status = 'active'
   and long_description like '%According to a scientific article published in 1971%';

update unified_tags
   set long_description = replace(long_description,
         'According to a scientific article published in April 2006, condomless sex can increase the risk of sexually transmitted infections. ', '')
 where slug = 'condomless' and status = 'active'
   and long_description like '%According to a scientific article published in April 2006%';

update unified_tags
   set long_description = replace(long_description,
         'According to a scientific article published in April 2008, this therapy can be an effective treatment for individuals struggling with addiction. ', '')
 where slug = 'drug-substitution-therapy' and status = 'active'
   and long_description like '%According to a scientific article published in April 2008%';

update unified_tags
   set long_description = replace(long_description,
         'According to a scientific article published on 09 October 2020, hormone blockers have been shown to be a safe and effective way to support transgender and non-binary youth. ', '')
 where slug = 'hormone-blockers' and status = 'active'
   and long_description like '%According to a scientific article published on 09 October 2020%';

update unified_tags
   set long_description = replace(long_description,
         ' According to a scientific article published in December 2012, early detection and treatment of STIs can significantly improve health outcomes.', '')
 where slug = 'sexual-health-screening' and status = 'active'
   and long_description like '%According to a scientific article published in December 2012%';

update unified_tags
   set long_description = replace(long_description,
         ' According to a scientific article published on June 1, 2015, social transition is an important aspect of the transition process for many individuals.', '')
 where slug = 'social-transition' and status = 'active'
   and long_description like '%According to a scientific article published on June 1, 2015%';

-- ---------------------------------------------------------------------------
-- Postconditions. These test for the WRONG text, never for this file's own
-- wording, so a better fix written by a concurrent session also satisfies them.
-- 20360401100100 recorded what the other shape costs: an exact-match assertion
-- RAISEs on somebody else's correct repair and aborts `db push` on main, which
-- strands every migration queued behind it.
-- ---------------------------------------------------------------------------

do $verify$
declare
  v_slugs text[] := array[
    'face-fucking','breeding','oral','masturbating','pretzel',
    'impact-model','vetted','ducky','feeder','power-bottom','hedonist','pelvic-floor-health',
    'anal-warts','condomless','drug-substitution-therapy','hormone-blockers',
    'sexual-health-screening','social-transition'];
  v_bad int;
begin
  -- 1. No disowned-entity summary still publishes.
  select count(*) into v_bad from unified_tags
   where status = 'active'
     and short_description in (
       'Adult film production company',
       'Biological process of producing offspring',
       'Related to the mouth',
       'Masturbation discussion',
       'Baked pastry made from dough',
       'Model for understanding LGBTQ+ community impact',
       'Vetted',
       'Nickname or fictional character name',
       'Community related to feeding and weight gain',
       'A person who takes a receptive role in sex',
       'Philosophy prioritizing pleasure',
       'Pelvic floor health information');
  if v_bad <> 0 then
    raise exception '% wrong-subject summary/summaries still publish', v_bad;
  end if;

  -- 2. The self-citation cohort is driven to ZERO corpus-wide, not merely on the
  --    six rows named above — so a seventh row acquiring it fails here too.
  select count(*) into v_bad from unified_tags
   where status = 'active' and long_description ~* 'according to a scientific article';
  if v_bad <> 0 then
    raise exception '% active row(s) still cite their own source to the reader', v_bad;
  end if;

  -- 3. Nothing this file touched fell below the thin-page gate. Nulling a body is
  --    asserted safe rather than assumed safe.
  select count(*) into v_bad from unified_tags
   where status = 'active' and slug = any(v_slugs)
     and not tag_has_prose(description, short_description);
  if v_bad <> 0 then
    raise exception '% row(s) fell below the thin-page gate', v_bad;
  end if;

  -- 4. The description this file reasoned from is still present on every row.
  --    This file never writes description; if one is gone, something else did it.
  select count(*) into v_bad from unified_tags
   where status = 'active' and slug = any(v_slugs) and description is null;
  if v_bad <> 0 then
    raise exception '% row(s) lost the description this file reasoned from', v_bad;
  end if;

  -- 5. Group A bodies are untouched and still carry real prose. A summary-only
  --    repair that silently emptied the good body would pass every check above.
  select count(*) into v_bad from unified_tags
   where status = 'active'
     and slug in ('face-fucking','breeding','oral','masturbating','pretzel')
     and coalesce(long_description, '') = '';
  if v_bad <> 0 then
    raise exception '% half-repaired row(s) lost the body that established the sense', v_bad;
  end if;

  -- 6. Group C bodies survive as prose — replace() removed a sentence, not the body.
  select count(*) into v_bad from unified_tags
   where status = 'active'
     and slug in ('anal-warts','condomless','drug-substitution-therapy','hormone-blockers',
                  'sexual-health-screening','social-transition')
     and length(coalesce(long_description, '')) < 200;
  if v_bad <> 0 then
    raise exception '% self-citation row(s) lost more than the citation sentence', v_bad;
  end if;
end
$verify$;

-- ---------------------------------------------------------------------------
-- Deliberate deferrals, REPORTED rather than silently skipped, so the next pass
-- can tell "deferred" from "fixed". Each has its own reason; they are not one
-- cohort and must not be collapsed into one.
-- ---------------------------------------------------------------------------

do $defer$
declare
  n int;
begin
  -- The advice-register padding. A whole-corpus decision, not a 2-row sample.
  select count(*) into n from unified_tags
   where status = 'active' and long_description ~* '(it is|it''s) essential to';
  raise notice 'deferred: % active row(s) carry the advice-register padding — a corpus-wide register decision, not a prose repair', n;

  -- Generic but NOT WRONG. The ice-cream/tapas rule: what an ice cream shop sells
  -- IS ice cream, so a generic gloss is thin, not a wrong subject.
  select count(*) into n from unified_tags
   where status = 'active'
     and slug in ('triad','restraints','sexual-positions','algophilia','scat-play','solidarity');
  raise notice 'deferred: % row(s) whose summary is generic but not wrong', n;

  -- The description AGREES with the body, so the original rule cannot reach them.
  -- Fifth pass running for the zoology/mythology/title-on-a-role cohort.
  select count(*) into n from unified_tags
   where status = 'active'
     and slug in ('tea','titica','balloon','freak','hypnosis','bootblack','bimbo','badge-bunny',
                  'doll','diva','switch','teacher','priest','acolyte','angel','villain','devotee',
                  'reynard','pet','poppet');
  raise notice 'deferred: % row(s) whose own description agrees with the published body (filing or generic-sense questions, not prose defects)', n;

  -- TWO disagreeing readings. Guessing a sense is how this whole class arose:
  -- the queen rule of 51500101144000.
  select count(*) into n from unified_tags
   where status = 'active'
     and slug in ('partners-in-mischief','heterotypical','accipiosexual','bicon','ebony','queen');
  raise notice 'deferred: % row(s) with no single establishable sense — the queen rule', n;

  -- The DESCRIPTION is the broken field ("Information about X"), and this file
  -- never writes description, so these are unrepairable under the rule rather
  -- than overlooked.
  select count(*) into n from unified_tags
   where status = 'active'
     and slug in ('sexual-orientation-disclosure','human-rights-monitoring')
     and description ilike 'Information about %';
  raise notice 'deferred: % row(s) whose description is itself the artifact', n;
end
$defer$;
