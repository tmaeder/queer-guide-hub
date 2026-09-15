-- The disowned-prose backlog read from the BODY side: 5 rows.
--
-- Same rule as 51500101143000 / 61000101174500 / 64000101100000 /
-- 65000101100000, unchanged: repair ONLY where the row's own evidence
-- establishes a sense the published prose contradicts, derive the replacement
-- FROM that evidence, and NEVER write `description` -- it is the evidence that
-- justifies the repair.
--
-- THE ORDERING IS THE NEW PART, AND IT IS THE MIRROR OF 63000101171500's.
-- Round eight made the half-repaired class a query: the SUMMARY still matches
-- what the disowned entity produced while the BODY no longer does, i.e. someone
-- repaired the body and left the lead line. Ordering the surviving set the
-- other way round -- ld_survives AND NOT sd_survives, the summary repaired and
-- the body left standing -- is 21 rows that every earlier pass sorted past,
-- because each one's lead line reads correctly and a reviewer who spot-checks
-- the field that was already fixed finds nothing wrong.
--
-- A second axis found the fifth row and is worth recording because a single
-- shared sentence is what exposed it: `electro-top` and `stone-top` publish the
-- SAME generated body template ("<X> is someone who prefers to be the insertive
-- partner during anal sex"). Probing that template corpus-wide returns exactly
-- three rows, and the third -- `bedroom-submissive` -- is CORRECT, which is why
-- it is asserted as a control below rather than repaired. A shared template is
-- a place to look, not a defect.
--
-- TWO GROUPS, kept labelled so a later reader cannot take the second group's
-- licence and apply it to the first.
--
-- A. THE DESCRIPTION IS RICH ENOUGH TO DERIVE A BODY FROM (2 rows). Each
--    description is a full paragraph that states the sense and names its own
--    examples, so the replacement restates the row's own evidence and adds no
--    scene detail:
--      honorifics    description establishes titles used "within kink, BDSM, or
--                    power-exchange contexts" and names Daddy, Sir, Ma'am,
--                    Master, Mistress, good girl, pet. The body published the
--                    GENERIC linguistic sense -- honorifics across cultures and
--                    languages, then pronoun etiquette -- which is a different
--                    subject, not a broader one.
--      mademoiselle  description sets out the D/s use explicitly (for a
--                    Dominant it works like Mistress, Lady or Domina; for a
--                    submissive it suggests poise and youthfulness). The body
--                    published the French dictionary entry, down to "largely
--                    replaced by 'madame' in modern French".
--
-- B. THE DESCRIPTION IS A SINGLE LINE: STATE WHAT IT SUPPORTS, NULL THE BODY
--    (3 rows). One line is enough to say what the tag IS and not enough to
--    write a body from, so minting one would be the guess this whole class came
--    from -- the doe/fae/flock treatment of 60000301100100 and the bunny/doll/
--    meerkat treatment of 65000101100000. This group is strictly weaker than
--    group A: it chooses no sense and authors no prose.
--      sensory-play  Fetishes, is_adult, indexable. The body cited "an episode
--                    of the children's television show Hi-5, season 13, episode
--                    29" and went on to playdough, finger painting and nature
--                    walks -- child sensory play, a different subject sharing a
--                    name, published on an adult kink page. Exactly one active
--                    row corpus-wide cites a children's television show, so
--                    that cohort goes to ZERO with a corpus-wide postcondition
--                    rather than being sampled.
--      stone-top     description "Top who doesn't receive". The body narrowed
--                    it to "the insertive partner during anal sex" "in the
--                    context of gay and queer relationships" -- the femme /
--                    drag-show / crotch-rope NARROWING class, which writes the
--                    butch and lesbian communities the term comes from out of
--                    their own entry.
--      electro-top   the sharpest of the five and the ONLY one whose summary is
--                    also wrong. Its description establishes ELECTRICAL play;
--                    summary and body both described anal sex. The summary is
--                    rewritten to exactly what the description supports.
--
-- THE METRIC IS NARROWER THAN THE DEFECT AND THIS FILE SAYS SO. Only 4 of the
-- 5 rows sit inside `tag_disowned_prose_signals()`'s set, so `ld_surviving`
-- falls 151 -> 147 and not by 5: `electro-top` was found by the shared-template
-- axis rather than by the surviving set, and carries no
-- `tag_wikidata_repair_audit` row, so the sentinel never counted it. Measured
-- in a rolled-back dry run on prod, not predicted. `sd_surviving` stays at 167
-- because the one summary this file writes was likewise never a surviving
-- disowned summary -- which is the point: a sentinel that does not move is not
-- evidence a repair did nothing.
--
-- SUMMARIES ARE OTHERWISE UNTOUCHED. Four of the five already carry a correct
-- lead line -- that is what made this seam invisible -- so only `electro-top`
-- has its summary written. `long_description` is absent from
-- `trg_search_documents_tag`'s column list (name, short_description,
-- description, category, slug, image_url, entity_kind, merged_into_id,
-- deprecated_at, status), read off pg_get_triggerdef rather than inferred, so a
-- body-only repair causes ZERO search churn; and `enforce_tag_thin_page_gate`
-- reads tag_has_prose(description, short_description) only, which is what makes
-- nulling three bodies safe. Both facts are ASSERTED below rather than assumed.
--
-- THE ACTOR DECLARATION IS LOAD-BEARING HERE, verified live on this corpus
-- rather than assumed: all 5 rows are `human_reviewed`, and the undeclared
-- UPDATE returns
--   human_reviewed tag <uuid> cannot be modified by system:trigger
-- The probe that establishes this has its own trap worth recording: a first
-- attempt wrote `long_description = long_description || ''`, which produces an
-- IDENTICAL value, and the guard keys on
-- `(to_jsonb(NEW) - derived) IS DISTINCT FROM (to_jsonb(OLD) - derived)` -- so
-- nothing changed, nothing fired, and the probe read as "the declaration is not
-- needed". Verify a probe actually CHANGED something before believing what it
-- reports, the same check this file's own history records for mutations.
--
-- DEFERRED, each with the reason it cannot be reached rather than a label:
--   slang-words   description says "kink scene" and the body describes LGBTQ+
--                 community slang. That is a SCOPE mismatch, not a different
--                 subject, and under-reaching is the correct error.
--   algolagnia    the body opens "also known as sadomasochism or S&M", which is
--                 a wrong EQUATION (the description says specifically pain to
--                 an erogenous zone) on prose that is otherwise accurate.
--                 Rewriting mostly-right prose is the retired experiment.
--   bastinado     filed under `Sexual Health`, and its body is about torture
--                 rather than the kink practice. The CATEGORY has to be settled
--                 before the prose can be, because the widened rule reads the
--                 category as evidence and here the category is itself the
--                 defect -- a filing question, the warlord / potato-salad /
--                 diversity disposition.
--   peaches       Culture & Community, 12 uses, indexable, summary "Peaches are
--                 deciduous trees with edible fruits". Botany is wrong under
--                 any reading, but `description` IS NULL, so the summary cannot
--                 be nulled without failing the thin-page gate and cannot be
--                 rewritten without choosing between the emoji sense and the
--                 musician. Unrepairable under the rule, not overlooked.
--   young, hairy  same shape as peaches -- Fetishes, description NULL, a
--                 generic dictionary summary, and no way to state the kink
--                 sense without minting it.
--   the generic-sense cohort for the sixth pass running (wolf "Pack animal",
--   knight "Chivalrous warrior", familiar, reynard, satyress, god, king, lord,
--   mermaid, jarl, squire, priestess, teacher, devotee, bootblack): each row's
--   `description` IS the generic sense, so there is no contradiction on the row
--   and nothing to derive from. 65000101100000 split this cohort correctly and
--   these are the half it correctly left.

select set_config('app.actor', 'admin:tag-prose-body-seam', true);

-- ---------------------------------------------------------------- group A --
-- Every UPDATE is guarded on the defect still being present, so a human or a
-- concurrent session that repairs a row first keeps their work and this file
-- no-ops instead of overwriting them: soft on preconditions, hard on
-- postconditions.

update public.unified_tags
   set long_description = 'In kink, BDSM and power-exchange relationships an honorific is a form of address that marks a role rather than a name. Daddy, Sir, Ma''am, Master and Mistress are commonly used for a dominant partner; good girl, boy and pet for a submissive one. Whether an honorific is used only during play or throughout daily life, and who is entitled to use it, belongs to the people in the dynamic rather than to the word.'
 where slug = 'honorifics' and status = 'active'
   and long_description like 'Honorifics are titles, pronouns, or phrases used to show respect%';

update public.unified_tags
   set long_description = 'Mademoiselle is the French honorific for Miss or young lady. Used for a Dominant it functions much as Mistress, Lady or Domina do, setting a tone of polished authority and graceful command. Used for a submissive it suggests poise, femininity and youthfulness. Which of the two is meant is set by the dynamic rather than by the word.'
 where slug = 'mademoiselle' and status = 'active'
   and long_description like 'Mademoiselle is a French honorific title used to address a young or unmarried woman%';

-- ---------------------------------------------------------------- group B --
-- One-line descriptions. No body is minted; `electro-top` additionally has the
-- only wrong summary of the five, restated to exactly what its description
-- supports.

update public.unified_tags
   set long_description = null
 where slug = 'sensory-play' and status = 'active'
   and long_description like '%Hi-5%';

update public.unified_tags
   set long_description = null
 where slug = 'stone-top' and status = 'active'
   and long_description like '%insertive partner during anal sex%';

update public.unified_tags
   set short_description = 'Someone who takes the active role in electrical play.',
       long_description  = null
 where slug = 'electro-top' and status = 'active'
   and long_description like '%insertive partner during anal sex%';

do $verify$
declare
  v_bad int;
  v_seam text[] := array['honorifics','mademoiselle','sensory-play','stone-top','electro-top'];
  v_trigdef text;
begin
  -- HARD: every defect this file exists to remove is gone. Tests for the WRONG
  -- text rather than for this file's own wording, so a better fix written by
  -- someone else also satisfies it -- the shape that let 18 of 34 rows be cut
  -- from 60000301100000/100100, and two more from 64000101100000, without any
  -- of those files failing on main.
  select count(*) into v_bad from public.unified_tags
   where status = 'active'
     and (long_description like 'Honorifics are titles, pronouns, or phrases used to show respect%'
       or long_description like 'Mademoiselle is a French honorific title used to address a young or unmarried woman%'
       or long_description like '%insertive partner during anal sex%'
       or short_description = 'A person who takes the insertive role in anal sex');
  if v_bad <> 0 then
    raise exception 'body seam: % row(s) still publish the disowned body', v_bad;
  end if;

  -- HARD and CORPUS-WIDE, not scoped to this file's slugs: a children's
  -- television citation is a whole cohort that measured at exactly one, so it
  -- goes to zero and a second one fails here rather than waiting for a pass to
  -- notice it by hand.
  select count(*) into v_bad from public.unified_tags
   where status = 'active'
     and (long_description ilike '%Hi-5%' or long_description ilike '%children''s television show%');
  if v_bad <> 0 then
    raise exception 'body seam: % active row(s) still cite a children television show', v_bad;
  end if;

  -- HARD: the reached state, counted POSITIVELY. A check that only counts rows
  -- in a BAD state returns zero for a slug that has gone missing from the
  -- corpus entirely, which the soft preconditions above deliberately allow.
  select count(*) into v_bad from public.unified_tags
   where status = 'active' and slug = any(v_seam)
     and coalesce(short_description,'') <> ''
     and lower(short_description) <> lower(name);
  if v_bad <> 5 then
    raise exception 'body seam: % of 5 rows carry a usable summary', v_bad;
  end if;

  -- HARD: no row was left below the thin-page gate, which reads
  -- tag_has_prose(description, short_description) and nothing else. This is
  -- what makes nulling three bodies safe.
  select count(*) into v_bad from public.unified_tags
   where status = 'active' and slug = any(v_seam)
     and not tag_has_prose(description, short_description);
  if v_bad > 0 then
    raise exception 'body seam: % row(s) fell below the thin-page gate', v_bad;
  end if;

  -- HARD: the three one-line-description rows mint nothing.
  select count(*) into v_bad from public.unified_tags
   where status = 'active'
     and slug in ('sensory-play','stone-top','electro-top')
     and coalesce(long_description,'') <> '';
  if v_bad <> 0 then
    raise exception 'body seam: % group-B row(s) had a body minted for them', v_bad;
  end if;

  -- HARD: the two group-A rows KEEP a body, and it does not carry the
  -- advice-register padding TAG_STYLE_SYSTEM bans. Nulling a derivable body is
  -- the mirror error of leaving a wrong one, so both directions are checked.
  select count(*) into v_bad from public.unified_tags
   where status = 'active' and slug in ('honorifics','mademoiselle')
     and coalesce(long_description,'') <> ''
     and long_description not ilike '%essential to prioritize%'
     and long_description not ilike '%it is recommended to consult%';
  if v_bad <> 2 then
    raise exception 'body seam: % of 2 group-A rows carry usable prose', v_bad;
  end if;

  -- HARD: the CONTROL. `bedroom-submissive` matched the same generated body
  -- template as electro-top and stone-top and is CORRECT for its own
  -- description, so it must survive untouched. A template is a place to look,
  -- never on its own a defect.
  select count(*) into v_bad from public.unified_tags
   where status = 'active' and slug = 'bedroom-submissive'
     and coalesce(long_description,'') <> '';
  if v_bad <> 1 then
    raise exception 'body seam: the bedroom-submissive control lost its body';
  end if;

  -- HARD: the premise this file's "zero search churn" claim rests on. If a
  -- later migration adds long_description to the tag search trigger, a
  -- body-only repair stops being free and this assertion says so rather than
  -- letting the header quietly outlive its truth.
  select pg_get_triggerdef(oid) into v_trigdef
    from pg_trigger where tgname = 'trg_search_documents_tag' and not tgisinternal;
  if v_trigdef is null then
    raise exception 'body seam: trg_search_documents_tag not found -- cannot verify search scope';
  end if;
  if position('long_description' in v_trigdef) > 0 then
    raise exception 'body seam: long_description is now in the tag search trigger; the no-churn premise is void';
  end if;

  raise notice 'body seam: 5 rows (2 bodies replaced, 3 nulled, 1 summary); children TV citations now 0';
end
$verify$;
