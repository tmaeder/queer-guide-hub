-- Disowned prose, round TWELVE: one summary stamped across a family, and two
-- tags that published a FRUIT-FLY PROTEIN (2026-09-15)
--
-- Round eleven ended by naming a defect shape it had found and deliberately
-- did not work: A SUMMARY PASTED ONTO SEVERAL ROWS. `priest` and `priestess`
-- share one verbatim; `algolagnia`, `algophilia` and `masochist` share another.
-- This file works that shape, found mechanically rather than by eye:
--
--     select short_description from unified_tags where status = 'active'
--      group by short_description having count(*) > 1
--
-- THE RESULT SPLITS IN TWO, and the split is the finding. Most shared summaries
-- are NOT a prose defect at all: `marriage`/`married`, `apparel`/`clothing`,
-- `educator`/`teacher`, `anal-master`/`ass-master` share a summary because they
-- are the same concept twice. That is a DUPLICATE-TAG problem for a merge pass,
-- and rewriting one side to make them differ would paper over it -- the mistake
-- `20360101101300` recorded when it refused to mint a second row for a concept
-- the glossary already held. Those are recorded here and left alone.
--
-- What IS a defect is a single string stamped across rows that are DIFFERENT
-- THINGS, where the shared summary erases the very distinction the family
-- exists to draw. Five gender identities -- `boyflux`, `girlflux`,
-- `glitchgender`, `pupgender`, `versandrogyne` -- all publish **"A non-binary
-- gender identity"**, which is true of every one of them and distinguishes
-- none. Four sadist rows publish one line whose qualifiers (dominant, sensual,
-- sexual) are the entire reason the four rows exist.
--
-- THE RULE IS UNCHANGED and is what bounds this: repair only where the row's
-- own `description` supplies what the shared summary erased, derive the new
-- summary FROM that description, and NEVER write `description`.
--
-- ---------------------------------------------------------------------------
-- GROUP A -- TWO TAGS PUBLISHED A DROSOPHILA PROTEIN, and unlike everything
-- else in this series these are WRONG-ENTITY rows that the 2026-08-29 repair
-- never dispositioned: both still carry the protein's QID.
--
--   `futch`  (Gender)          "Protein found in Drosophila melanogaster"
--   `crumbs` (Slang & Language) "Protein found in Drosophila melanogaster"
--
-- `futch` is femme + butch, a core queer presentation term. Its description
-- says so in full. Its published summary and body are a fruit-fly gene.
--
-- BOTH IDENTIFIERS WERE RESOLVED LIVE AGAINST WIKIDATA BEFORE THIS FILE WAS
-- WRITTEN, not assumed from the number:
--   Q29813072 = "Futsch Dmel_CG34387", P31 Q8054 (protein)
--   Q29809512 = "Crumbs Dmel_CG6383",  P31 Q8054 (protein)
-- Note the label: the sweep matched the tag `futch` to a gene named **FUTSCH**,
-- one letter apart. That is the namesake mechanism at its sharpest -- close
-- enough that a name check passes, and `tag-wiki-guard.ts`'s plausibility arm
-- has nothing to object to either, because a protein is a perfectly plausible
-- entity for a word to denote.
--
-- The identifiers are NULLED, never repointed -- the standing rule, because
-- `tag_medical_codes_sync` and `tag_wikidata_hierarchy` rebuild from this
-- column weekly, so a plausible-but-wrong QID regenerates wrong data forever
-- while a null one regenerates nothing. Measured first: neither row has a
-- `wikipedia_url`, a `tag_medical_codes` row or a `tag_relations` edge, so
-- nothing else is carrying the protein forward. Both are already deindexed.
--
-- NO ROW IS WRITTEN TO `tag_wikidata_repair_audit`, and that is deliberate
-- rather than an omission. That table is the INPUT to
-- `tag_disowned_prose_signals()`: a row there makes the tag "repaired" and its
-- prose-at-repair-time the baseline the sentinel compares against, so inserting
-- one in the same transaction that rewrites the prose would perturb a live
-- metric to record something the file itself already records. The prior values
-- survive in `tag_change_log.before_data`, which is why content writes go
-- through an attributed actor. **Check what consumes a table before writing to
-- it.**
--
-- ---------------------------------------------------------------------------
-- GROUP B -- one shared summary named a DIFFERENT PRACTICE. `foot-bottom`
-- ("Receiver in foot play") and `sensation-bottom` ("Receiver of sensation
-- play") both published **"A term for the receptive partner in anal sex"**, and
-- both bodies followed it there. On a glossary where `bottom`, `top` and
-- `switch` are separate live entries, publishing the anal-sex definition on the
-- foot-play row is not thinness, it is the wrong act.
--
-- `foot-bottom`'s body additionally opens *"The term 'foot bottom' is not a
-- widely recognized or standard term in the LGBTQ+ community"* -- prose denying
-- the subject of the row it sits on, the `catgirl` shape.
--
-- ---------------------------------------------------------------------------
-- GROUP C -- the shared summary is true of every member and distinguishes none.
-- Each replacement restates THAT ROW'S OWN description and nothing else, so
-- this group chooses no sense.
--
-- `sadist` is deliberately NOT repaired and is asserted as a control: its
-- summary, "Individual who derives pleasure from inflicting pain", is correct
-- for the unqualified term. Repairing the three qualified rows is what ends the
-- collision; rewriting the one row that was right would be churn.
--
-- `pupgender`'s description contains mojibake where its quotation marks should
-- be. The replacement is written in clean text rather than copied through, and
-- the mojibake in `description` is LEFT ALONE -- this series never writes that
-- column, and repairing it is a separate change with its own evidence.
--
-- ---------------------------------------------------------------------------
-- SCOPE NOTE, so the sentinel movement is not misread: only THREE of these 20
-- rows (`algolagnia`, `algophilia`, `masochist`) sit inside
-- `tag_disowned_prose_signals()`'s set, because that function keys on
-- `tag_wikidata_repair_audit` and the other 17 were never dispositioned by the
-- 2026-08-29 repair. So `sd_surviving` will fall by 3, not by 20. The defect is
-- the same producer and the same rule; the METRIC is narrower than the defect,
-- and quoting a 20-row drop against it would be wrong.
--
-- Four bodies are nulled (`futch`, `crumbs`, `foot-bottom`, `sensation-bottom`)
-- and SIXTEEN are kept, including `algolagnia`'s, which conflates algolagnia
-- with sadomasochism generally -- generic rather than wrong, so under-reaching
-- is the correct error. Nulling is safe by `tag_has_prose`, which is an OR and
-- is CALLED rather than restated in the postcondition.
--
-- The actor declaration is load-bearing: all 20 rows are `human_reviewed`.
--
-- DEFERRED with reasons: `priest` / `priestess` (the shared line is correct for
-- `priest` and merely under-reaches for `priestess`); `latex-princess` ("Latex
-- fashion enthusiast" is what its description says); the medication families
-- (`avanafil`/`cialis`/`levitra`/`sildenafil`/`tadalafil`/`vardenafil` all are
-- medications for erectile dysfunction -- accurate for every member, and the
-- brand/generic distinction is carried by their bodies); and every
-- same-concept pair, which needs `merge_tag_concept`, not prose.
--
-- Postconditions test for the WRONG text and count the reached state
-- POSITIVELY -- here as `count(distinct short_description) = 20`, which is the
-- most direct possible statement of what this file exists to achieve.

select set_config('app.actor', 'admin:tag-prose-one-summary-many-rows', true);

-- ---------------------------------------------------------------------------
-- GROUP A -- the Drosophila pair. Identifier nulled, prose replaced, body
-- removed.
-- ---------------------------------------------------------------------------

update public.unified_tags
   set short_description = 'An androgynous presentation combining femme and butch, first used by lesbians.',
       long_description  = null,
       wikidata_id       = null
 where slug = 'futch' and short_description = 'Protein found in Drosophila melanogaster';

update public.unified_tags
   set short_description = 'A comment left to mark a trail for others to follow.',
       long_description  = null,
       wikidata_id       = null
 where slug = 'crumbs' and short_description = 'Protein found in Drosophila melanogaster';

-- ---------------------------------------------------------------------------
-- GROUP B -- the shared summary named a different practice.
-- ---------------------------------------------------------------------------

update public.unified_tags
   set short_description = 'The receiving partner in foot play.',
       long_description  = null
 where slug = 'foot-bottom' and short_description = 'A term for the receptive partner in anal sex';

update public.unified_tags
   set short_description = 'The receiving partner in sensation play.',
       long_description  = null
 where slug = 'sensation-bottom' and short_description = 'A term for the receptive partner in anal sex';

-- ---------------------------------------------------------------------------
-- GROUP C -- one string across a family. Each replacement restates that row's
-- own description and nothing else.
-- ---------------------------------------------------------------------------

update public.unified_tags
   set short_description = 'Someone who enjoys receiving pain.'
 where slug = 'masochist' and short_description = 'Deriving pleasure from pain or humiliation';

update public.unified_tags
   set short_description = 'Sexual pleasure from pain applied to an erogenous zone.'
 where slug = 'algolagnia' and short_description = 'Deriving pleasure from pain or humiliation';

update public.unified_tags
   set short_description = 'Sexual pleasure from pain itself, whether received or inflicted.'
 where slug = 'algophilia' and short_description = 'Deriving pleasure from pain or humiliation';

update public.unified_tags
   set short_description = 'Someone dominant in a BDSM dynamic who also enjoys giving consensual pain.'
 where slug = 'dominant-sadist' and short_description = 'Individual who derives pleasure from inflicting pain';

update public.unified_tags
   set short_description = 'Someone who gives mild pain or strong sensation that the bottom finds pleasurable.'
 where slug = 'sensual-sadist' and short_description = 'Individual who derives pleasure from inflicting pain';

update public.unified_tags
   set short_description = 'Someone who takes sexual pleasure in inflicting pain.'
 where slug = 'sexual-sadist' and short_description = 'Individual who derives pleasure from inflicting pain';

update public.unified_tags
   set short_description = 'A kitten role played in latex.'
 where slug = 'latex-kitten' and short_description = 'Latex fashion enthusiast';

update public.unified_tags
   set short_description = 'Someone into raw, uninhibited sex.'
 where slug = 'pig' and short_description = 'A term in some LGBTQ+ communities';

update public.unified_tags
   set short_description = 'A pup-play role in its masculine form.'
 where slug = 'puppyboy' and short_description = 'A term in some LGBTQ+ communities';

update public.unified_tags
   set short_description = 'A magical mother figure in kink.'
 where slug = 'fairy-kink-mother' and short_description = 'A term of endearment in some LGBTQ+ communities';

update public.unified_tags
   set short_description = 'A mother figure in leather.'
 where slug = 'leather-mommy' and short_description = 'A term of endearment in some LGBTQ+ communities';

update public.unified_tags
   set short_description = 'A genderflux identity whose male-aligned intensity fluctuates.'
 where slug = 'boyflux' and short_description = 'A non-binary gender identity';

update public.unified_tags
   set short_description = 'A genderflux identity whose female-aligned intensity fluctuates.'
 where slug = 'girlflux' and short_description = 'A non-binary gender identity';

update public.unified_tags
   set short_description = 'A xenogender shaped by fragmentation, error or digital distortion.'
 where slug = 'glitchgender' and short_description = 'A non-binary gender identity';

update public.unified_tags
   set short_description = 'A xenogender related to canine or puppy characteristics.'
 where slug = 'pupgender' and short_description = 'A non-binary gender identity';

update public.unified_tags
   set short_description = 'A gender identity holding masculine and feminine at once, the balance shifting over time.'
 where slug = 'versandrogyne' and short_description = 'A non-binary gender identity';

-- ---------------------------------------------------------------------------
-- Postconditions.
-- ---------------------------------------------------------------------------

do $verify$
declare
  v_bad int;
begin
  -- 1. None of the twenty repaired rows still carries a shared summary. The
  --    strings themselves may legitimately survive ELSEWHERE -- `sadist` keeps
  --    one on purpose -- so this is scoped to the rows this file writes.
  select count(*) into v_bad
    from public.unified_tags
   where slug in ('futch','crumbs','foot-bottom','sensation-bottom','masochist','algolagnia',
                  'algophilia','dominant-sadist','sensual-sadist','sexual-sadist','latex-kitten',
                  'pig','puppyboy','fairy-kink-mother','leather-mommy','boyflux','girlflux',
                  'glitchgender','pupgender','versandrogyne')
     and short_description in (
           'Protein found in Drosophila melanogaster',
           'A term for the receptive partner in anal sex',
           'Deriving pleasure from pain or humiliation',
           'Individual who derives pleasure from inflicting pain',
           'Latex fashion enthusiast',
           'A term in some LGBTQ+ communities',
           'A term of endearment in some LGBTQ+ communities',
           'A non-binary gender identity'
         );
  if v_bad <> 0 then
    raise exception 'one-summary seam: % row(s) still carry the shared summary', v_bad;
  end if;

  -- 2. The reached state, counted POSITIVELY and as the thing the file is FOR:
  --    twenty rows, twenty DISTINCT summaries, none empty. Counting rows in a
  --    bad state instead would return a reassuring zero for a slug that has
  --    gone missing from the corpus, which the soft guards above allow.
  select count(distinct short_description) into v_bad
    from public.unified_tags
   where slug in ('futch','crumbs','foot-bottom','sensation-bottom','masochist','algolagnia',
                  'algophilia','dominant-sadist','sensual-sadist','sexual-sadist','latex-kitten',
                  'pig','puppyboy','fairy-kink-mother','leather-mommy','boyflux','girlflux',
                  'glitchgender','pupgender','versandrogyne')
     and coalesce(btrim(short_description), '') <> '';
  if v_bad <> 20 then
    raise exception 'one-summary seam: expected 20 distinct non-empty summaries, found %', v_bad;
  end if;

  -- 3. The thin-page gate, CALLED rather than restated. It is an OR.
  select count(*) into v_bad
    from public.unified_tags
   where slug in ('futch','crumbs','foot-bottom','sensation-bottom','masochist','algolagnia',
                  'algophilia','dominant-sadist','sensual-sadist','sexual-sadist','latex-kitten',
                  'pig','puppyboy','fairy-kink-mother','leather-mommy','boyflux','girlflux',
                  'glitchgender','pupgender','versandrogyne')
     and not public.tag_has_prose(description, short_description);
  if v_bad <> 0 then
    raise exception 'one-summary seam: % row(s) would fail the thin-page gate', v_bad;
  end if;

  -- 4. The four wrong bodies are gone, and the protein identifiers with them.
  select count(*) into v_bad
    from public.unified_tags
   where slug in ('futch','crumbs','foot-bottom','sensation-bottom')
     and long_description is not null;
  if v_bad <> 0 then
    raise exception 'one-summary seam: % wrong body/bodies survive', v_bad;
  end if;

  select count(*) into v_bad
    from public.unified_tags
   where slug in ('futch','crumbs') and wikidata_id is not null;
  if v_bad <> 0 then
    raise exception 'one-summary seam: % row(s) still carry the Drosophila identifier', v_bad;
  end if;

  -- 5. The controls. `sadist` is the member of its family whose summary was
  --    RIGHT, and rewriting it would be churn; `priest`, `priestess` and
  --    `latex-princess` are deferred. All four must still carry summary and
  --    body, or this pass has over-reached into rows it argued it should not
  --    touch.
  select count(*) into v_bad
    from public.unified_tags
   where slug in ('sadist','priest','priestess','latex-princess')
     and (coalesce(btrim(short_description), '') = '' or coalesce(long_description, '') = '');
  if v_bad <> 0 then
    raise exception 'one-summary seam: % control row(s) were touched by a pass with no licence for them', v_bad;
  end if;

  select count(*) into v_bad
    from public.unified_tags
   where slug = 'sadist' and short_description <> 'Individual who derives pleasure from inflicting pain';
  if v_bad <> 0 then
    raise exception 'one-summary seam: the correct member of the sadist family was rewritten';
  end if;
end $verify$;
