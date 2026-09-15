-- Round eight of the disowned-prose backlog: 15 rows whose BODY is already gone
-- or already correct, and whose SUMMARY is still the disowned entity's.
--
-- Same rule as 51500101143000 / 51700101143000 / 61000101174500 / 62000101163000,
-- unchanged: repair ONLY where the row's own `description` establishes the
-- sense, derive the new summary FROM that description, and NEVER write
-- `description` itself -- it is the evidence that justifies the repair, and
-- overwriting it destroys what made the change defensible.
--
-- HOW THIS TRANCHE WAS FOUND. Round seven sorted the surviving set by what the
-- prose is ABOUT, after round four's usage ordering was shown not to transfer.
-- This pass used a third ordering that needs no judgement to compute: the
-- LEXICAL OVERLAP between a row's own `description` and its published
-- short/long description, lowest first. A row whose description shares no
-- content word with its own summary is either about a different subject or
-- says nothing; both are defects, and neither correlates with usage. The
-- ordering narrows what a human reads. It does not decide: `chubby-chaser`
-- and `intimate-partner-abuse` both score zero shared words and are CORRECT,
-- and are left alone.
--
-- WHAT THE ORDERING SURFACED IS ONE SEAM, and it is the half-repaired class of
-- 60000301100100 seen from the other side. Fourteen of these fifteen rows have
-- `long_description` ALREADY NULL -- an earlier pass, or the nulling group of
-- the tail round, removed the junk body and left the junk SUMMARY standing.
-- `short_description` is the LEAD LINE on /tags/:slug and is in
-- `trg_search_documents_tag`'s column list, so it is also what the search
-- facet shows. A reader met "Scottish dog breed" on a kink role, and a
-- reviewer spot-checking the body would have found nothing wrong.
--
-- TWO GROUPS, kept labelled because a later reader must not take the second
-- group's licence and apply it to the first.
--
-- A. THE SUMMARY NAMES A DIFFERENT THING (8 rows). The row's own description
--    establishes the sense and the summary contradicts it outright:
--      golden-retriever    "Scottish dog breed" over a description that opens
--                          "a kink and relationship role".
--      hussy               "Derogatory term for a sex worker" over a
--                          description whose second sentence says the word is
--                          RECLAIMED and "worn proudly" rather than an insult.
--                          The summary asserts exactly what the description
--                          refuses -- the `masc` shape.
--      paraboy             "Term for a male-identified person" over "a partial
--                          or near connection to being a boy or man, but NOT
--                          entirely ... may experience masculinity without
--                          wholly identifying as male". Again the refusal.
--      androx              "a term related to male hormones" -- the ANDROGEN
--                          namesake -- on a non-binary gender identity.
--      under-consideration "Term introduced in 1968" on a BDSM trial stage:
--                          encyclopedic residue about some other subject
--                          entirely, which does not even name a subject.
--      hand-feeding        "Feeding animals by hand" over "a Dominant feeds a
--                          submissive directly ... a form of power exchange".
--      sword-play          "Fencing and sword fighting" -- the sport -- over a
--                          description establishing edgeplay.
--      mama-bear           "LGBTQ+ term for a protective mother figure" is a
--                          real and different sense; this row's description
--                          establishes a nurturing DOMINANT in a D/s dynamic,
--                          and it is filed Kink Community & Scenes. The
--                          `darkroom` shape: both senses exist, the row states
--                          which one it is.
--
-- B. THE SUMMARY STATES NOTHING A READER CAN USE (7 rows). Not a wrong
--    subject -- a tautology or a placeholder, which is the disowned entity's
--    residue in its emptiest form: `medical-play` "medical play" and `vetted`
--    "Vetted" define the term with the term (the `hardpoint` / `impaired-driving`
--    / `hiv-aids` defect, now the fourth recorded instance); `slutface` "A term
--    with complex connotations", `fluffing` "Fluffing refers to various
--    practices", `shallowing` "Shallowing refers to a sexual practice",
--    `foot-play` "Refers to foot-related activities" and `masturbating`
--    "Masturbation discussion" say only that the term exists.
--    **This group chooses no sense.** Each new summary is a restatement of the
--    row's own `description` and nothing else, so it is strictly weaker than
--    group A: there is no reading to get wrong. That is why the two groups are
--    separated rather than merged into a count of fifteen.
--
-- NO BODY IS WRITTEN OR REMOVED BY THIS FILE. Fourteen of the fifteen already
-- have `long_description IS NULL` and stay that way; `masturbating` is the one
-- with a body, it is correct ("self-stimulation ... used deliberately in
-- edging, orgasm control and mutual scenes"), and it is untouched. Minting a
-- body from a one-line description is the guess this whole class came from.
--
-- THE ACTOR DECLARATION IS LOAD-BEARING HERE, and that was verified live on
-- this corpus rather than assumed: all 15 rows are `human_reviewed`, and the
-- undeclared UPDATE returns
--   human_reviewed tag <uuid> cannot be modified by system:trigger
-- Round four's tranche was the opposite case (all rows `human_reviewed=false`,
-- where `set_config` is attribution only). Each file states which case it is in
-- so the next pass does not copy the wrong precedent from whichever it opens.
--
-- DEFERRED, each with the reason it cannot be reached under this rule:
--   warrior-princess  summary "Term for strong female figures" is THIN, not
--                     wrong -- it captures half of a description about a
--                     strong person who submits in D/s. Under-reaching is the
--                     correct error.
--   feeder            "Community related to feeding and weight gain" on a row
--                     filed Dynamics & Roles describes the community rather
--                     than the role. A filing-shaped mismatch, not a false
--                     claim.
--   chubby-chaser     the summary is BETTER than the row's own description
--                     ("a man who seeks obese males"), so the description is
--                     not evidence for a repair here.
--   intimate-partner-abuse, dogging, monogamish, solo-poly
--                     surviving but CORRECT. "Surviving" means only that the
--                     prose is unchanged since the identifier was taken away.
--   sacred-play, anal-creampie
--                     bodies that cite their own source to the reader ("a 2007
--                     publication") or carry the consent padding
--                     TAG_STYLE_SYSTEM bans. That is the REGISTER class of
--                     60000301100000's group C, a body repair, and it belongs
--                     in its own pass rather than muddying a summary seam.
--   the generic-sense cohort for the fifth pass running (`teacher`, `tiger`,
--                     `goat`, `wolf`, `butler`, `king`, ...), where each row's
--                     description AGREES with its prose and the original rule
--                     structurally cannot reach it.

select set_config('app.actor', 'admin:tag-prose-summary-seam', true);

-- ---------------------------------------------------------------- group A --
-- Every UPDATE is guarded on the defect still being present, so a human who
-- repairs a row first keeps their work and this file no-ops instead of
-- overwriting them: soft on preconditions, hard on postconditions.

update public.unified_tags
   set short_description = 'A kink and relationship role built on eager, affectionate, people-pleasing energy.'
 where slug = 'golden-retriever' and short_description = 'Scottish dog breed';

update public.unified_tags
   set short_description = 'A reclaimed term for bold sexual expression and playful promiscuity, worn with pride rather than shame.'
 where slug = 'hussy' and short_description = 'Derogatory term for a sex worker';

update public.unified_tags
   set short_description = 'A partial or near connection to being a boy or man, without identifying wholly as male.'
 where slug = 'paraboy' and short_description = 'Term for a male-identified person';

update public.unified_tags
   set short_description = 'A non-binary gender identity between male and androgyne, the masculine counterpart to gynx.'
 where slug = 'androx' and short_description = 'Androx refers to a term related to male hormones';

update public.unified_tags
   set short_description = 'A trial stage in which two people test a potential dynamic before either commits to it.'
 where slug = 'under-consideration' and short_description = 'Term introduced in 1968';

update public.unified_tags
   set short_description = 'A Dominant feeding a submissive directly, combining control and care.'
 where slug = 'hand-feeding' and short_description = 'Feeding animals by hand';

update public.unified_tags
   set short_description = 'Edgeplay using a sword as a symbol of power, a threat, or part of a scene.'
 where slug = 'sword-play' and short_description = 'Fencing and sword fighting';

update public.unified_tags
   set short_description = 'A nurturing dominant who combines warmth and protection with firm guidance.'
 where slug = 'mama-bear' and short_description = 'LGBTQ+ term for a protective mother figure';

-- ---------------------------------------------------------------- group B --
-- Each of these restates the row's own `description`. No sense is chosen.

update public.unified_tags
   set short_description = 'Roleplay using clinical tools or procedures.'
 where slug = 'medical-play' and short_description = 'medical play';

update public.unified_tags
   set short_description = 'Approved by an organization to attend its events.'
 where slug = 'vetted' and short_description = 'Vetted';

update public.unified_tags
   set short_description = 'A visibly sexual look: heavy makeup, a dazed or messy appearance, or both.'
 where slug = 'slutface' and short_description = 'A term with complex connotations';

update public.unified_tags
   set short_description = 'Manually stimulating someone''s genitals to keep them aroused before or between sex.'
 where slug = 'fluffing' and short_description = 'Fluffing refers to various practices';

update public.unified_tags
   set short_description = 'Penetrating only the opening of the vagina, where the nerve endings concentrate.'
 where slug = 'shallowing' and short_description = 'Shallowing refers to a sexual practice';

update public.unified_tags
   set short_description = 'Play involving the feet, from kink and worship to service or plain fun.'
 where slug = 'foot-play' and short_description = 'Refers to foot-related activities';

update public.unified_tags
   set short_description = 'Stimulating your own genitals for pleasure, alone or with company.'
 where slug = 'masturbating' and short_description = 'Masturbation discussion';

do $verify$
declare
  v_bad int;
  v_seam text[] := array['golden-retriever','hussy','paraboy','androx','under-consideration',
                         'hand-feeding','sword-play','mama-bear','medical-play','vetted',
                         'slutface','fluffing','shallowing','foot-play','masturbating'];
begin
  -- HARD: every defect this file exists to remove is gone. Tests for the WRONG
  -- text rather than for this file's own wording, so a better fix written by
  -- someone else also satisfies it -- which is what let 18 of 34 rows be cut
  -- from 60000301100000/100100 without either file failing on main.
  select count(*) into v_bad from public.unified_tags
   where status = 'active'
     and short_description in ('Scottish dog breed','Derogatory term for a sex worker',
                               'Term for a male-identified person',
                               'Androx refers to a term related to male hormones',
                               'Term introduced in 1968','Feeding animals by hand',
                               'Fencing and sword fighting',
                               'LGBTQ+ term for a protective mother figure',
                               'medical play','Vetted','A term with complex connotations',
                               'Fluffing refers to various practices',
                               'Shallowing refers to a sexual practice',
                               'Refers to foot-related activities','Masturbation discussion');
  if v_bad > 0 then
    raise exception 'summary seam: % row(s) still publish the disowned summary', v_bad;
  end if;

  -- HARD: the reached state, counted positively. A check that only counts rows
  -- in a BAD state returns zero for a slug that has gone missing from the
  -- corpus entirely, which the soft preconditions above deliberately allow.
  select count(*) into v_bad from public.unified_tags
   where status = 'active' and slug = any(v_seam)
     and coalesce(short_description,'') <> ''
     and lower(short_description) <> lower(name);
  if v_bad <> 15 then
    raise exception 'summary seam: % of 15 rows carry a usable summary', v_bad;
  end if;

  -- HARD: no row was left below the thin-page gate, which reads
  -- tag_has_prose(description, short_description) and nothing else.
  select count(*) into v_bad from public.unified_tags
   where status = 'active' and slug = any(v_seam)
     and not tag_has_prose(description, short_description);
  if v_bad > 0 then
    raise exception 'summary seam: % row(s) fell below the thin-page gate', v_bad;
  end if;

  -- HARD: `masturbating` is the one row here with a body, it was already
  -- correct, and this file must not have touched it.
  select count(*) into v_bad from public.unified_tags
   where slug = 'masturbating' and coalesce(long_description,'') = '';
  if v_bad > 0 then
    raise exception 'summary seam: masturbating lost its body';
  end if;

  raise notice 'summary seam: 15 rows, 8 wrong-subject summaries and 7 empty ones';
end
$verify$;
