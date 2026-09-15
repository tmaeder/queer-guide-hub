-- Disowned prose, round ELEVEN: the summary that says nothing, and two
-- abbreviations that collided with a word (2026-09-15)
--
-- Rounds two to ten worked this backlog by usage, then by subject, then by
-- lexical overlap, then by the word `role`. This pass takes the class those
-- orderings kept surfacing and never finished: THE SUMMARY THAT STATES NOTHING
-- A READER CAN USE, selected corpus-wide over the surviving set rather than
-- from whatever the previous ordering happened to reach.
--
-- THE RULE IS UNCHANGED: repair only where the row's own `description`
-- establishes a sense the summary contradicts or fails to state, derive the new
-- summary FROM that description, and NEVER write `description` -- it is the
-- evidence that justifies the repair.
--
-- ---------------------------------------------------------------------------
-- GROUP A -- an ABBREVIATION collided with an ordinary word, and the sweep took
-- the word. Two rows, and they are the sharpest defects found in this backlog
-- since `queerness`.
--
--   `pov`    summary "Lack of financial resources for basic needs", body a
--            full paragraph about POVERTY -- on a Fetishes row, indexable.
--   `uncut`  summary "Uncut refers to unedited content" -- the film-editing
--            sense, on a Fetishes row where the word means uncircumcised.
--
-- BOTH HAVE `description IS NULL`, so the original rule cannot reach them and
-- this file runs on the widening `51500101152700` introduced: the sense may be
-- established by a CATEGORY that admits exactly one reading of the tag's own
-- name. `Fetishes` + "POV" is point of view; `Fetishes` + "uncut" is foreskin.
-- Neither has a second reading on this platform.
--
-- `uncut` additionally defines the term with the term ("Uncut refers to..."),
-- the `hardpoint` / `impaired-driving` / `hiv-aids` / `chauffeur` defect, now
-- its SIXTH recorded instance.
--
-- A third candidate of the same shape was REFUSED and the reason generalises.
-- `solo` (Fetishes, summary "Traveling alone", body about solo travel) looks
-- identical -- but this is a TRAVEL platform, so "solo" has a live, ordinary
-- non-kink reading here and the category is not decisive the way it is for the
-- other two. The widened rule requires a category that admits EXACTLY ONE
-- reading; where a second reading is live on this site, it does not apply.
-- `black` and `peaches` are refused on the same ground, joining `ebony`.
--
-- ---------------------------------------------------------------------------
-- GROUP B -- the description is a real definition and the summary states less
-- than the term's defining feature, or nothing at all. Each replacement
-- RESTATES THE ROW'S OWN DESCRIPTION and chooses no sense, so this group is
-- strictly weaker than group A and carries no licence to pick a reading. The
-- groups stay labelled for that reason.
--
-- `breeder`'s summary is the single word "Breeder". `warrior-princess` and
-- `alpha-pet` and `freak` open "Term for...", which says only that the term
-- exists. `drag` -- 3,897 assignments, the largest row in this backlog --
-- publishes "Refers to drag culture or performance" over a description that is
-- a full definition.
--
-- `hard-limits` is the one to read twice, because its sibling proves the
-- defect rather than merely suggesting it: `soft-limits` correctly publishes
-- "Boundaries that are flexible or negotiable", while `hard-limits` publishes
-- "Boundaries in BDSM practices" -- dropping NON-NEGOTIABLE, which is the only
-- thing distinguishing the two terms. On a consent page that is not thinness,
-- it is the whole content.
--
-- Three rows in this group also contradict outright, and are kept here rather
-- than promoted because restating the description is still all that is done:
-- `freak` publishes "unusual physical CONDITION" (the sideshow sense) over a
-- description reading "Unusual or kinky person"; `heterotypical` publishes
-- "Conforming to traditional gender roles" over "Typical heterosexual
-- ORIENTATION" -- gender expression against orientation, two different things
-- on an Orientation row; and `switch` publishes "switches between roles or
-- IDENTITIES", which a switch does not do.
--
-- ---------------------------------------------------------------------------
-- GROUP C -- the summary is NULL and the disowned BODY is all a reader meets.
-- Filling a null from the row's own description destroys nothing and is not the
-- LLM rewrite both auto-apply paths were retired for. `lgbtq` is the reason
-- this group exists at all: **5,340 assignments, indexable, and no summary**,
-- so the highest-usage row in the entire backlog has no lead line and no search
-- facet text.
--
-- ---------------------------------------------------------------------------
-- BODIES: only TWO are nulled, and the restraint is the point. `pov` published
-- poverty and `poppet` published a children's-toy encyclopedia ("A doll is a
-- model of a human or humanoid character... used as a toy for children") on a
-- Dynamics & Roles row. Every other body in this tranche was read and KEPT,
-- including several that are merely generic rather than wrong (`mademoiselle`'s
-- body is the French dictionary sense while `monsieur`'s is already the D/s
-- one -- an asymmetry inside one pair, left standing because under-reaching is
-- the correct error). This is the `casting` rule: repair only the wrong FIELDS.
--
-- THE THIN-PAGE GATE IS AN `OR`, NOT AN `AND`, and that is what makes group A
-- legal. `tag_has_prose(p_description, p_short_description)` is
-- `coalesce(nullif(btrim(p_description),''), p_short_description) is not null`
-- -- read off the live catalog, not assumed -- so a row with no description
-- stays publishable precisely because the summary is written. The postcondition
-- below therefore calls the real function instead of re-implementing it as a
-- stricter "both must be present" test, which would have failed on `pov` and
-- `uncut` and looked like a defect in the repair.
--
-- The actor declaration IS load-bearing on this tranche: 17 of the 21 rows are
-- `human_reviewed`, and an undeclared UPDATE returns `human_reviewed tag <uuid>
-- cannot be modified by system:trigger` from log_unified_tag_change(). The four
-- that are not -- `anal-warts`, `drag`, `lgbtq` and `feminist-solidarity` --
-- would write without it; the declaration is attribution for those and a hard
-- requirement for the other seventeen.
--
-- DEFERRED, each with the reason it cannot be reached:
--   * `solo`, `black`, `peaches`, `ebony` -- a second reading is live on this
--     platform, so the category does not settle the sense (see group A).
--   * `titica` -- an Angolan musician, on a Fetishes row, where the sweep
--     overwrote the DESCRIPTION as well. With the evidence itself contaminated
--     there is nothing on the row to derive from; this needs an identity
--     decision, not a prose repair.
--   * `zaddy` -- its description is the truncated fragment "Zaddy can be
--     defined in two ways:" with nothing after the colon. The summary is
--     serviceable and the description is unusable as evidence; repairing it
--     would mean writing `description`, which this series never does.
--   * `stepdad`, `parent`, `locker-room`, `interracial`, `hairy`, `young`,
--     `potato-salad` -- generic but not wrong. Under-reaching is the correct
--     error.
--   * `priest` / `priestess` share one summary verbatim, as do `algolagnia`,
--     `algophilia` and `masochist` ("Deriving pleasure from pain or
--     humiliation"). A summary pasted onto several rows is worth its own pass;
--     it is a different finding from this one and is recorded rather than
--     folded in.
--
-- Postconditions test for the WRONG text and count the reached state
-- POSITIVELY, so a concurrent session's better repair also satisfies them --
-- the shape that let 18 of 34 rows be cut from 60000301100000/100100 and two
-- more from 64000101100000 without any of those files raising on `main`, where
-- a `db push` abort takes every migration queued behind it.

select set_config('app.actor', 'admin:tag-prose-says-nothing', true);

-- ---------------------------------------------------------------------------
-- GROUP A -- an abbreviation collided with an ordinary word.
-- ---------------------------------------------------------------------------

update public.unified_tags
   set short_description = 'Point-of-view material, shot or framed as though seen through a participant''s eyes.',
       long_description  = null
 where slug = 'pov' and short_description = 'Lack of financial resources for basic needs';

update public.unified_tags
   set short_description = 'Having a foreskin; uncircumcised.'
 where slug = 'uncut' and short_description = 'Uncut refers to unedited content';

-- ---------------------------------------------------------------------------
-- GROUP B -- the summary states less than the term's defining feature, or
-- nothing at all. Each replacement restates the row's own description.
-- ---------------------------------------------------------------------------

update public.unified_tags
   set short_description = 'Warts caused by HPV around or inside the anus, common after receptive anal sex.'
 where slug = 'anal-warts' and short_description = 'Anal warts are a type of STI';

update public.unified_tags
   set short_description = 'A BDSM role centred on impregnation, fertility and the idea of breeding.'
 where slug = 'breeder' and short_description = 'Breeder';

update public.unified_tags
   set short_description = 'Oral play in which one partner draws the other''s tongue into their mouth and applies suction.'
 where slug = 'tongue-sucking' and short_description = 'A form of intimate oral activity';

update public.unified_tags
   set short_description = 'A strong, self-possessed feminine person who chooses submission within a D/s dynamic.'
 where slug = 'warrior-princess' and short_description = 'Term for strong female figures';

update public.unified_tags
   set short_description = 'The dominant pet in a pet-play hierarchy.'
 where slug = 'alpha-pet' and short_description = 'Term for a dominant pet';

update public.unified_tags
   set short_description = 'A performance art form in which people adopt exaggerated gendered personas to entertain.'
 where slug = 'drag' and short_description = 'Refers to drag culture or performance';

update public.unified_tags
   set short_description = 'Titles and forms of address used in kink and power exchange to mark respect, authority or submission.'
 where slug = 'honorifics' and short_description = 'Titles and pronouns used as signs of respect';

update public.unified_tags
   set short_description = 'A French honorific used in D/s, most often for a feminine Dominant.'
 where slug = 'mademoiselle' and short_description = 'French honorific for women';

update public.unified_tags
   set short_description = 'A French honorific for a male-identified Dominant, in the register of Sir but more formal.'
 where slug = 'monsieur' and short_description = 'French title of respect for a man';

update public.unified_tags
   set short_description = 'Non-negotiable boundaries set by a BDSM practitioner.'
 where slug = 'hard-limits' and short_description = 'Boundaries in BDSM practices';

update public.unified_tags
   set short_description = 'An unusual or kinky person.'
 where slug = 'freak' and short_description = 'Term for unusual physical condition or enthusiast';

update public.unified_tags
   set short_description = 'A typical heterosexual orientation.'
 where slug = 'heterotypical' and short_description = 'Conforming to traditional gender roles';

update public.unified_tags
   set short_description = 'Someone who both dominates and submits.'
 where slug = 'switch' and short_description = 'A person who switches between roles or identities';

update public.unified_tags
   set short_description = 'A relationship between three people.'
 where slug = 'triad' and short_description = 'A group of three';

-- ---------------------------------------------------------------------------
-- GROUP C -- the summary is NULL and the disowned body is all a reader meets.
-- Filling a null destroys nothing; each UPDATE is guarded on the summary still
-- being empty, so a session that fills one first keeps its work.
-- ---------------------------------------------------------------------------

update public.unified_tags
   set short_description = 'The LGBTQ+ community and topics concerning it.'
 where slug = 'lgbtq' and coalesce(short_description, '') = '';

update public.unified_tags
   set short_description = 'A fictional porn trope in which a character is drawn with both female and male sex characteristics.'
 where slug = 'futanari' and coalesce(short_description, '') = '';

update public.unified_tags
   set short_description = 'Support and unity among people and groups advocating for women''s rights and gender equality.'
 where slug = 'feminist-solidarity' and coalesce(short_description, '') = '';

update public.unified_tags
   set short_description = 'Slang used within the kink scene.'
 where slug = 'slang-words' and coalesce(short_description, '') = '';

update public.unified_tags
   set short_description = 'A role built on a small doll or pet persona.',
       long_description  = null
 where slug = 'poppet' and coalesce(short_description, '') = ''
   and long_description like 'A doll is a model of a human or humanoid character%';

-- ---------------------------------------------------------------------------
-- Postconditions.
-- ---------------------------------------------------------------------------

do $verify$
declare
  v_bad int;
begin
  -- 1. None of the sixteen wrong summaries survives anywhere in the corpus.
  select count(*) into v_bad
    from public.unified_tags
   where short_description in (
           'Lack of financial resources for basic needs',
           'Uncut refers to unedited content',
           'Anal warts are a type of STI',
           'Breeder',
           'A form of intimate oral activity',
           'Term for strong female figures',
           'Term for a dominant pet',
           'Refers to drag culture or performance',
           'Titles and pronouns used as signs of respect',
           'French honorific for women',
           'French title of respect for a man',
           'Boundaries in BDSM practices',
           'Term for unusual physical condition or enthusiast',
           'Conforming to traditional gender roles',
           'A person who switches between roles or identities',
           'A group of three'
         );
  if v_bad <> 0 then
    raise exception 'says-nothing seam: % row(s) still publish the disowned summary', v_bad;
  end if;

  -- 2. The reached state, counted POSITIVELY. Counting rows in a BAD state
  --    returns a reassuring zero for a slug that has gone missing from the
  --    corpus entirely, which is exactly what the soft guards above allow.
  select count(*) into v_bad
    from public.unified_tags
   where slug in ('pov','uncut','anal-warts','breeder','tongue-sucking','warrior-princess',
                  'alpha-pet','drag','honorifics','mademoiselle','monsieur','hard-limits',
                  'freak','heterotypical','switch','triad','lgbtq','futanari',
                  'feminist-solidarity','slang-words','poppet')
     and coalesce(btrim(short_description), '') <> '';
  if v_bad <> 21 then
    raise exception 'says-nothing seam: expected 21 rows carrying a summary, found %', v_bad;
  end if;

  -- 3. The thin-page gate, called as the REAL function rather than
  --    re-implemented. It is an OR: `pov` and `uncut` carry no description at
  --    all, and a hand-written "both must be present" test would report the
  --    repair as a defect.
  select count(*) into v_bad
    from public.unified_tags
   where slug in ('pov','uncut','anal-warts','breeder','tongue-sucking','warrior-princess',
                  'alpha-pet','drag','honorifics','mademoiselle','monsieur','hard-limits',
                  'freak','heterotypical','switch','triad','lgbtq','futanari',
                  'feminist-solidarity','slang-words','poppet')
     and not public.tag_has_prose(description, short_description);
  if v_bad <> 0 then
    raise exception 'says-nothing seam: % row(s) would fail the thin-page gate', v_bad;
  end if;

  -- 4. Exactly the two wrong bodies are gone.
  select count(*) into v_bad
    from public.unified_tags
   where slug in ('pov','poppet') and long_description is not null;
  if v_bad <> 0 then
    raise exception 'says-nothing seam: % literal-referent body/bodies survive', v_bad;
  end if;

  -- 5. The mirror assertion, and it matters more here than anywhere in this
  --    series: this tranche KEEPS nineteen bodies it could have swept. Six of
  --    them are named, including two inside one pair where only one body is
  --    already in the right register.
  select count(*) into v_bad
    from public.unified_tags
   where slug in ('triad','drag','lgbtq','monsieur','mademoiselle','hard-limits')
     and coalesce(long_description, '') = '';
  if v_bad <> 0 then
    raise exception 'says-nothing seam: % control row(s) lost a body this pass had no licence to touch', v_bad;
  end if;
end $verify$;
