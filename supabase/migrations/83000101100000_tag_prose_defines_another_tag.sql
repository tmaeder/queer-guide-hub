-- Glossary prose: the row publishes the definition of a DIFFERENT live tag
--
-- A fourteenth ordering of the disowned-prose work, and the first one that needs
-- no judgement at all to COMPUTE: extract the grammatical subject of each active
-- row's prose (the leading noun phrase before "is/are/refers to/means/was") and
-- join it against the names of other active tags. A row whose own prose opens by
-- defining a different tag that this corpus already holds separately is stating
-- that concept twice and saying nothing about its own.
--
-- The class is not new -- CLAUDE.md already records /tags/aids opening with the
-- definition of HIV, power-bottom publishing the definition of bottom, rough-sex
-- publishing the definition of BDSM, sti-testing publishing the definition of
-- STI. What is new is that it is now a QUERY rather than four separate hand
-- finds, so the cohort can be driven down rather than sampled.
--
-- THE AXIS RETURNED 21 ROWS AND MOST OF THEM ARE NOT THIS DEFECT. That split is
-- the most useful thing here and it is why only nine rows are repaired:
--
--   * 12 rows are MORPHOLOGICAL TWINS -- dancing/dance, married/marriage,
--     divorced/divorce, masturbating/masturbation, pansexual/pansexuality,
--     cross-dresser/cross-dressing, questioning-sexuality-and-gender/questioning,
--     small-penis-humiliation/small-penis-humiliation-sph, apparel/clothing,
--     hijra-south-asia/hijra, sexual-orientation-and-gender-identity/
--     sexual-orientation, core-bdsm/bdsm. Their prose is CORRECT; they define the
--     twin because they ARE the twin. That is a duplicate-TAG problem for a merge
--     pass, and rewriting one side to make the two differ would paper over it --
--     round twelve's rule (60000101100000's sibling) verbatim, one axis later.
--     Every one of the twelve was read individually; none is repaired here.
--
--   * 9 rows are the real defect: the row's own evidence establishes one sense
--     and the published prose defines a different live tag.
--
-- The regex narrows what a human reads; it does not decide. Both halves of that
-- sentence did work here.
--
-- THE SENTINEL CANNOT SEE ANY OF THIS, and the reason was read off the function
-- rather than assumed. tag_disowned_prose_signals() keys on
-- tag_wikidata_repair_audit where disposition = 'cleared', joined to the
-- change-log state at repair time -- and ZERO of the nine rows has an audit row
-- under ANY disposition, because none was ever dispositioned by the 2026-08-29
-- wrong-entity repair. So this migration moves sd_surviving and ld_surviving by
-- exactly nothing. This is a NEW seam beside the counted backlog, not a re-slice
-- of it: 80000101100000 recorded an overlap of 4 of 5, and here it is 0 of 9.
--
-- DO NOT VERIFY THIS MIGRATION BY DIFFING THAT COUNTER, and the reason is
-- first-hand. Two dry runs fifteen minutes apart reported ld_surviving 147 and
-- then 146, which looks exactly like this file having an effect. It does not: the
-- live value outside any transaction was already 146, with 15 tag_change_log rows
-- written in the preceding half hour by a concurrent session. A shared counter
-- that other sessions move is not evidence about a specific change -- verify the
-- ROWS this file names, which is what the postconditions below do.
--
-- CORROBORATION THAT THESE ARE ONE SWEEP'S OUTPUT, not nine coincidences:
-- love's own short_description is BYTE-IDENTICAL to affection's ("Strong,
-- positive emotion based on affection" -- which also defines the term with the
-- term, the defect this backlog keeps finding). One run wrote both fields from
-- one entity. That is the queerness/queer-theory proof shape.
--
-- Three labelled groups, because the licence differs and a later reader must not
-- take the loosest group's licence and apply it to the rest.
--
--   A -- the description is a FULL PARAGRAPH that states the sense, so a body can
--        be derived from the row's own evidence (3 rows).
--   B -- the description is a SINGLE LINE: state only what it supports and NULL
--        the body (5 rows). One line is enough to say what the tag is and not
--        enough to write a body from, so minting one would be the guess this
--        whole class came from. Group B chooses no sense.
--   C -- description IS NULL (1 row), so the sense rests on the category plus the
--        fact that the other reading is held by a separate live row.
--
-- NULLING A BODY LOSES NOTHING HERE, and that was measured rather than assumed:
-- every concept being removed is already defined on its own live row --
-- slavery (2 uses), bullying (66), sadomasochism, gender-studies (8), bondage (6),
-- fetish (1,590). The corpus stated each of them twice; after this it states each
-- once, on the row that is about it. Nulling is safe against the thin-page gate
-- because enforce_tag_thin_page_gate reads tag_has_prose(description,
-- short_description) only, and every one of the nine keeps a usable summary --
-- asserted below by CALLING the real function rather than restating it
-- (75000101100000's rule: a hand-rolled "both present" form fails on the
-- description-IS-NULL rows and reads as a defect in the repair).
--
-- long_description is absent from trg_search_documents_tag's column list, so a
-- body-only change causes zero search churn; short_description IS in it, so the
-- summaries written here do reindex. Both read off the live catalog.
--
-- FETISHISM IS THE SHARPEST ROW. Its own description reads "The fixation on a
-- non-sexual object or body part for sexual arousal" -- the sexual sense,
-- unambiguous, on a Fetishes row that is is_adult and seo_indexable -- while both
-- prose fields published the RELIGIOUS sense: talismans, amulets, "supernatural
-- powers", "spiritual or religious context". The stored tag_sources.claim_summary
-- is BYTE-IDENTICAL to Q182116's live entity description, so the prose provably
-- came from the entity rather than merely resembling it.
--
-- THE PRODUCER SEAL CATCHES THREE OF THE FIVE AND STRUCTURALLY CANNOT CATCH THE
-- OTHER TWO, which is worth stating precisely rather than as "the guards missed
-- it". tag-wiki-guard.ts requires the resolved title to agree with the tag name,
-- so today it would refuse affection<-Love, asian<-Asia and
-- bondage-and-discipline<-Bondage (BDSM). It cannot refuse fetishism<-Fetishism or
-- slave<-Slave: there the title agrees EXACTLY, and "a concept" and "a person" are
-- entirely plausible classes for those words to denote, so the plausibility arm
-- has nothing to object to either. Same shape as darkroom and futch/crumbs. The
-- seal stops this being written again in the cases it can see; it does nothing for
-- prose already written, in any of the five.
--

-- DEFERRED, each with the reason it cannot be reached rather than "we did not get
-- to it":
--
--   * humor (48 uses, indexable) -- THREE SIGNALS DISAGREE, which is the queen
--     rule. Its description is about kink-scene levity, its category is
--     Events & Parties, and 48 of 48 assignments are NEWS. Its published prose is
--     comedy's genre definition and is wrong under every one of those readings,
--     but repairing it means choosing between them, and guessing a sense is how
--     this entire class arose. Left standing deliberately, and asserted below so
--     a later sweep cannot take it without noticing.
--   * core-bdsm -- its description is itself an unverifiable promotional claim
--     ("founded by Master Aden and is managed by a collation"), so deriving prose
--     from it would republish that claim. The evidence is contaminated, the same
--     disposition titica got. Deindexed and 0 uses, so nothing is served.
--   * the 12-row duplicate-tag cohort above -- a merge decision, not a prose one.
--
-- Actor declaration is LOAD-BEARING: 8 of the 9 rows are human_reviewed (asian is
-- the exception). Verified live rather than assumed, with a REAL value change --
-- the undeclared UPDATE returns "human_reviewed tag 422e43cd-... cannot be
-- modified by system:trigger". 80000101100000 recorded the trap that makes this
-- worth re-verifying each time: a probe written as long_description ||  '' writes
-- an IDENTICAL value, the guard keys on NEW being distinct from OLD, so nothing
-- fires and it reads as "the declaration is not needed".
--
-- Every UPDATE is content-guarded on the defect's own text, so a concurrent repair
-- by another session makes this a graceful no-op rather than a conflict, and the
-- postconditions are keyed on the WRONG text being gone rather than on this file's
-- own wording -- so a better fix written by someone else satisfies them too. Five
-- concurrent collisions have already happened on this table; a postcondition
-- narrowed to its own writes is what turns the sixth into a db push abort on main
-- that blocks every migration queued behind it.

-- RENUMBERED ONCE, 82000101100000 -> 83000101100000, and the reason is the point:
-- a concurrent session applied `tag_prose_body_side_seam` at that exact version
-- while this file was being written -- a SIXTH session working this same backlog.
-- The two do not overlap: all nine rows here were re-read live immediately before
-- committing and every one still carried its defect, so nothing had to be cut
-- down. That check is `git diff --name-only origin/main -- supabase/migrations/`
-- plus a read of the actual rows, and it is the one that finds a collision; the
-- version clash itself was found by re-reading max(version) from
-- schema_migrations immediately before committing, because the number chosen at
-- authoring time is stale by then.

select set_config('app.actor', 'admin:tag-prose-defines-another-tag', true);

-- ---------------------------------------------------------------------------
-- GROUP A -- the description is a full paragraph; derive a body from it
-- ---------------------------------------------------------------------------

-- affection: published the definition of `love` (133 uses, its own live row).
-- Its summary was ALSO love's, byte-identical to the one love still carries.
update public.unified_tags
   set short_description = 'Tender physical and verbal expressions of care between partners.',
       long_description  = 'Affection is care made visible: holding hands, a hand at the back of the neck, gentle touch, verbal endearments. It is not the same thing as love, which names the feeling. Affection is how that feeling gets expressed between people within an intimate dynamic, moment to moment.'
 where slug = 'affection' and status = 'active'
   and long_description like 'Love is an emotion involving strong attraction%';

-- bondage-and-discipline: published the definition of `bondage` (6 uses, its own
-- live row), dropping the discipline half entirely -- the hard-limits shape, where
-- what is missing is the only thing that distinguishes the term. The removed body
-- also carried the banned advice register; that is incidental here, not the reason.
update public.unified_tags
   set short_description = 'Restraint paired with agreed rules and consequences -- the B and D of BDSM.',
       long_description  = 'Bondage and discipline is the B and the D of BDSM, and it is two things rather than one. Bondage is the physical half: tying, binding or restraining a partner. Discipline is the behavioural half: rules agreed in advance, and the consequences a dominant applies when a submissive breaks one. Prose that describes only the restraint has dropped the half that separates B&D from bondage on its own, which is a separate entry here.'
 where slug = 'bondage-and-discipline' and status = 'active'
   and long_description like 'Bondage refers to the practice of consensually binding or restraining someone%';

-- gender-theory: published the definition of `gender-studies` (8 uses, its own live
-- row) -- women's-studies origin, sub-fields, post-1990 Western universities. The
-- summary was that field's too, so both fields are replaced.
update public.unified_tags
   set short_description = 'The theoretical account of gender as socially constructed rather than given.',
       long_description  = 'Gender theory is the body of thought that treats gender as socially and culturally constructed rather than simply given, asking how identity and expression are shaped by norms and expectations. It challenges the idea that gender is binary and takes fluidity as a starting point rather than an exception. It is not the same thing as gender studies, the academic field that houses it and which has its own entry here.'
 where slug = 'gender-theory' and status = 'active'
   and long_description like 'Gender studies is an interdisciplinary academic field%';

-- ---------------------------------------------------------------------------
-- GROUP B -- one-line description: state only what it supports, NULL the body
-- ---------------------------------------------------------------------------

-- slave: description "Owned person", Dynamics & Roles, is_adult -- and the prose
-- published chattel slavery, "economic history", "compulsory work". The thrall
-- shape exactly. The consent qualifier is not decoration: a body about historical
-- enslavement is being removed from a kink role page, and `slavery` (2 uses) keeps
-- that subject on its own row.
update public.unified_tags
   set short_description = 'A submissive who has consented to be owned within a power-exchange dynamic.',
       long_description  = null
 where slug = 'slave' and status = 'active'
   and long_description like 'Slavery refers to the ownership of a person as property%';

-- bully: description "Aggressive dominant role" -- and the body was an
-- anti-bullying message ("Everyone deserves to be treated with respect and
-- kindness") on a consensual kink role. That content is not lost: `bullying`
-- (66 uses, indexable) carries it, better written, on the row it belongs to.
update public.unified_tags
   set short_description = 'An aggressive dominant role, played by agreement.',
       long_description  = null
 where slug = 'bully' and status = 'active'
   and long_description like 'Bullying is behavior that is intended to harm or intimidate others%';

-- sadomasochist: description "Person who enjoys both pain roles" -- the person --
-- against prose defining sadomasochism the practice, which `sadomasochism` holds.
update public.unified_tags
   set short_description = 'A person who takes both sides of pain play, giving and receiving.',
       long_description  = null
 where slug = 'sadomasochist' and status = 'active'
   and long_description like 'Sadomasochism is a type of BDSM practice%';

-- fetishist: description "Person with specific fetishes" -- the person -- against
-- prose defining the practice. Identifier KEPT (Q207791 is the right concept).
update public.unified_tags
   set short_description = 'A person who has one or more specific fetishes.',
       long_description  = null
 where slug = 'fetishist' and status = 'active'
   and long_description like 'Fetishism refers to the sexual arousal a person receives from%';

-- fetishism: wrong ENTITY, not merely wrong prose. Both fields published Q182116,
-- religious fetishism, against a description that states the sexual sense.
update public.unified_tags
   set short_description = 'Fixation on a non-sexual object or body part as a source of sexual arousal.',
       long_description  = null
 where slug = 'fetishism' and status = 'active'
   and long_description like 'Fetishism refers to the attribution of non-material value or powers to an object%';

-- ---------------------------------------------------------------------------
-- GROUP C -- description IS NULL; the other reading has its own live row
-- ---------------------------------------------------------------------------

-- asian: Slang & Language, indexable, and it published the CONTINENT -- "30% of
-- Earth's land area", "4.7 billion people". The continent is already held by
-- `asia`, which is deindexed and carries no prose at all, so nulling this body
-- removes a claim no reader needs and loses nothing the corpus holds elsewhere.
-- The replacement summary deliberately chooses NOTHING between the readings a
-- Slang & Language tag named "Asian" can carry on this site (its 9 assignments are
-- 6 news and 3 venues); it states only the root both share, and removes the one
-- reading that is false under all of them.
update public.unified_tags
   set short_description = 'Relating to Asia or to people of Asian heritage.',
       long_description  = null
 where slug = 'asian' and status = 'active'
   and long_description like 'Asia is the largest continent%';

-- ---------------------------------------------------------------------------
-- Retire the wrong identifiers, their provenance, and the aliases that are
-- provably the other entity's.
--
-- FIVE of the nine rows carry another live tag's Wikidata identity, and in each
-- case wikipedia_url names the other tag's article outright -- affection ->
-- /wiki/Love, asian -> /wiki/Asia, slave -> /wiki/Slavery,
-- bondage-and-discipline -> /wiki/Bondage, fetishism -> /wiki/Fetishism. That is
-- the proof CLAUDE.md already records for this class: wikipedia_url is literally
-- the article the sweep read. All four unknown ids were resolved LIVE:
--
--   Q316        "love"    / "strong, positive emotion based on affection" / Love
--   Q48         "Asia"    / "terrestrial continent..."                    / Asia
--   Q12773225   "slave"   / "person in a state of slavery"                / Slave
--   Q273972     "bondage" / "sexual binding or restraining"               / Bondage (BDSM)
--
-- Two of those entity descriptions are BYTE-IDENTICAL to what the tag published:
-- Q316's is affection's whole summary (and love's, which is how one sweep writing
-- both is provable rather than inferred), and Q12773225's is slave's. The prose
-- did not wander; it followed the identifier.
--
-- Q273972 is the one judgement call and it is stated rather than folded in: the
-- entity is BONDAGE and the tag is BONDAGE AND DISCIPLINE, so this is not a
-- namesake but a component standing in for the compound -- which is exactly what
-- produced a body describing only the restraint. A legitimately BROADER concept
-- QID is deliberately not auto-cleared anywhere in this repo (the 2026-08-29
-- repair measured that at ~70% correct), so this is cleared BY HAND with its own
-- reason, which is the sanctioned path for that class.
--
-- Identifiers are NULLED, never repointed: tag_medical_codes_sync and
-- tag_wikidata_hierarchy rebuild from them weekly, so a plausible-but-wrong QID
-- regenerates wrong data forever while a null one regenerates nothing. Checked
-- first -- none of the five carries a medical code, so nothing clinical is lost.
--
-- FETISHIST IS THE MIRROR AND ITS IDENTIFIER IS KEPT. Q207791 resolves live to
-- "fetish" / "sexual arousal a person receives from an object or situation" /
-- sitelink "Sexual fetishism" -- the RIGHT concept. What is wrong there is only
-- the GRAIN: the row is the person and the prose defined the practice. Correct
-- entity, wrong prose: fix the prose, keep the identifier and its two medical
-- codes. That is the crotch-rope/breast-bondage rule, and both directions are
-- asserted so a later pass cannot null Q207791 by reflex.
--
-- NOTHING is written to tag_wikidata_repair_audit, deliberately: that table is the
-- INPUT to tag_disowned_prose_signals(), so a row there would perturb a live
-- metric in order to record what this file already records. Prior values survive
-- in tag_change_log.before_data, which is why content writes go through an
-- attributed actor.
--
-- gender-theory has NO wikidata_id and still carries two provenance rows citing
-- Q1662673 / Gender_studies -- the other tag's entity with no identifier column to
-- show for it. Those go too: an identifier is not the only place a wrong entity
-- hides.
-- ---------------------------------------------------------------------------

update public.unified_tags
   set wikidata_id = null, wikipedia_url = null
 where status = 'active'
   and (   (slug = 'affection'              and wikidata_id = 'Q316')
        or (slug = 'asian'                  and wikidata_id = 'Q48')
        or (slug = 'slave'                  and wikidata_id = 'Q12773225')
        or (slug = 'bondage-and-discipline' and wikidata_id = 'Q273972')
        or (slug = 'fetishism'              and wikidata_id = 'Q182116'));

delete from public.tag_sources s
 using public.unified_tags t
 where s.tag_id = t.id
   and (   (t.slug = 'affection'              and (s.source_id = 'Q316'      or s.source_url = 'https://en.wikipedia.org/wiki/Love'))
        or (t.slug = 'asian'                  and (s.source_id = 'Q48'       or s.source_url = 'https://en.wikipedia.org/wiki/Asia'))
        or (t.slug = 'slave'                  and (s.source_id = 'Q12773225' or s.source_url = 'https://en.wikipedia.org/wiki/Slavery'))
        or (t.slug = 'bondage-and-discipline' and (s.source_id = 'Q273972'   or s.source_url = 'https://en.wikipedia.org/wiki/Bondage'))
        or (t.slug = 'fetishism'              and (s.source_id = 'Q182116'   or s.source_url = 'https://en.wikipedia.org/wiki/Fetishism'))
        or (t.slug = 'gender-theory'          and (s.source_id = 'Q1662673'  or s.source_url = 'https://en.wikipedia.org/wiki/Gender_studies')));

-- ALIASES: delete ONLY where the alias names the other entity unambiguously, and
-- keep every one that a reader of this vocabulary could legitimately mean.
-- All of them are auto + multilingual and therefore INERT already (since
-- 20261012090000 display, auto-tagging and the search bridge are approved-only),
-- so this is about what the row would route if anyone ever approved them.
--
--   DELETED (17): affection's seven are translations of LOVE (amar, amor, amores,
--   amour, lieben, jemanden lieben, jmd. lieben) -- none of them means affection;
--   asian's eight name the CONTINENT, four of them saying "continent" outright;
--   fetishism's two are "religioeser Fetischismus" (religious fetishism) and
--   "feticheur" (a fetish-priest).
--
--   KEPT: slave's four (esclava, esclave, esclavo, Sklave) -- German, French and
--   Spanish kink use exactly those words for the role, so they are ambiguous
--   between the two senses rather than wrong; bondage-and-discipline's four, which
--   are in-domain bondage vocabulary; and fetishism's remaining seven, which are
--   the ordinary translations of "fetishism" and read either way. Deleting an
--   ambiguous alias would take a legitimate routing term with it, and
--   under-reaching is the correct error.
delete from public.tag_aliases al
 using public.unified_tags t
 where al.canonical_tag_id = t.id
   and al.review_status = 'auto'
   and (   (t.slug = 'affection' and al.alias_name in ('amar','amor','amores','amour',
                                                       'lieben','jemanden lieben','jmd. lieben'))
        or (t.slug = 'asian'     and al.alias_name in ('Asia continental','asiatischer Kontinent','Asie',
                                                       'Asie continentale','Asien','continent asiatique',
                                                       'continente asiático','continente de Asia'))
        or (t.slug = 'fetishism' and al.alias_name in ('religiöser Fetischismus','féticheur')));

-- ---------------------------------------------------------------------------
-- Postconditions. Soft on preconditions, hard on postconditions: every check
-- below tests for the DEFECT being gone or the REACHED state being present, never
-- for this file's own wording, so a better fix by a concurrent session satisfies
-- them too.
-- ---------------------------------------------------------------------------

do $verify$
declare
  v_bad int;
  v_trigdef text;
begin
  -- 1. every one of the nine defect signatures is gone
  select count(*) into v_bad
    from public.unified_tags
   where status = 'active'
     and (
          (slug = 'affection'              and long_description like 'Love is an emotion involving strong attraction%')
       or (slug = 'bondage-and-discipline' and long_description like 'Bondage refers to the practice of consensually binding or restraining someone%')
       or (slug = 'gender-theory'          and long_description like 'Gender studies is an interdisciplinary academic field%')
       or (slug = 'slave'                  and long_description like 'Slavery refers to the ownership of a person as property%')
       or (slug = 'bully'                  and long_description like 'Bullying is behavior that is intended to harm or intimidate others%')
       or (slug = 'sadomasochist'          and long_description like 'Sadomasochism is a type of BDSM practice%')
       or (slug = 'fetishist'              and long_description like 'Fetishism refers to the sexual arousal a person receives from%')
       or (slug = 'fetishism'              and long_description like 'Fetishism refers to the attribution of non-material value or powers to an object%')
       or (slug = 'asian'                  and long_description like 'Asia is the largest continent%')
     );
  if v_bad <> 0 then
    raise exception 'tag_prose_defines_another_tag: % row(s) still publish the definition of a different tag', v_bad;
  end if;

  -- 2. positive: all nine carry a usable summary (counts the REACHED state, so a
  --    slug that has gone missing from the corpus fails here instead of passing
  --    vacuously the way a count of rows in a BAD state would)
  select count(*) into v_bad
    from public.unified_tags
   where status = 'active'
     and slug in ('affection','bondage-and-discipline','gender-theory','slave','bully',
                  'sadomasochist','fetishist','fetishism','asian')
     and coalesce(btrim(short_description), '') <> '';
  if v_bad <> 9 then
    raise exception 'tag_prose_defines_another_tag: expected 9 rows with a usable summary, found %', v_bad;
  end if;

  -- 3. the thin-page gate is satisfied -- CALL the real predicate, never restate it
  select count(*) into v_bad
    from public.unified_tags
   where status = 'active'
     and slug in ('affection','bondage-and-discipline','gender-theory','slave','bully',
                  'sadomasochist','fetishist','fetishism','asian')
     and not public.tag_has_prose(description, short_description);
  if v_bad <> 0 then
    raise exception 'tag_prose_defines_another_tag: % row(s) fail the thin-page gate', v_bad;
  end if;

  -- 4. group B + C bodies are null (6 rows)
  select count(*) into v_bad
    from public.unified_tags
   where status = 'active'
     and slug in ('slave','bully','sadomasochist','fetishist','fetishism','asian')
     and long_description is not null;
  if v_bad <> 0 then
    raise exception 'tag_prose_defines_another_tag: % group B/C row(s) still carry a body', v_bad;
  end if;

  -- 5. group A bodies are non-empty and free of the banned advice register
  select count(*) into v_bad
    from public.unified_tags
   where status = 'active'
     and slug in ('affection','bondage-and-discipline','gender-theory')
     and coalesce(btrim(long_description), '') <> ''
     and long_description not ilike '%essential to prioritize%';
  if v_bad <> 3 then
    raise exception 'tag_prose_defines_another_tag: expected 3 usable group A bodies, found %', v_bad;
  end if;

  -- 6. THE OTHER SIDE OF EACH PAIR IS UNTOUCHED. Nulling six bodies is exactly the
  --    shape that could quietly take a correct row with it, so the rows that hold
  --    each removed concept are asserted to still hold it.
  select count(*) into v_bad
    from public.unified_tags
   where status = 'active'
     and slug in ('love','comedy','bullying','slavery','sadomasochism','gender-studies','bdsm')
     and coalesce(btrim(long_description), '') <> '';
  if v_bad <> 7 then
    raise exception 'tag_prose_defines_another_tag: expected 7 intact counterpart bodies, found %', v_bad;
  end if;

  -- 7. THE DEFERRALS ARE ENFORCEABLE, not merely written down. humor and core-bdsm
  --    are deliberately left standing; a later pass reaching for the easy sweep
  --    breaks this file's own check instead of quietly taking them.
  select count(*) into v_bad
    from public.unified_tags
   where status = 'active'
     and (
          (slug = 'humor'     and long_description like 'Comedy is a genre of literary and dramatic works%')
       or (slug = 'core-bdsm' and long_description like 'BDSM refers to a range of consensual sexual practices%')
     );
  if v_bad <> 2 then
    raise exception 'tag_prose_defines_another_tag: the two deliberately deferred rows were modified (found % of 2)', v_bad;
  end if;

  -- 8. none of the five still carries the other tag's entity, in either column
  select count(*) into v_bad
    from public.unified_tags
   where status = 'active'
     and slug in ('affection','asian','slave','bondage-and-discipline','fetishism')
     and (wikidata_id is not null or wikipedia_url is not null);
  if v_bad <> 0 then
    raise exception 'tag_prose_defines_another_tag: % row(s) still carry a wrong-entity identifier', v_bad;
  end if;

  -- 8b. and nothing anywhere points at the religious-fetishism entity
  select count(*) into v_bad from public.unified_tags where wikidata_id = 'Q182116';
  if v_bad <> 0 then
    raise exception 'tag_prose_defines_another_tag: % tag(s) still point at Q182116', v_bad;
  end if;

  -- 9. fetishist KEEPS its correct identifier and its clinical codes -- the mirror
  --    assertion, so a later pass cannot null Q207791 by reflex
  select count(*) into v_bad
    from public.unified_tags t
   where t.slug = 'fetishist' and t.status = 'active'
     and t.wikidata_id = 'Q207791'
     and (select count(*) from public.tag_medical_codes m where m.tag_id = t.id) = 2;
  if v_bad <> 1 then
    raise exception 'tag_prose_defines_another_tag: fetishist lost its correct identifier or its medical codes';
  end if;

  -- 10. the two provable aliases are gone and the seven ambiguous ones survive
  select count(*) into v_bad
    from public.tag_aliases al
    join public.unified_tags t on t.id = al.canonical_tag_id
   where (t.slug = 'fetishism' and al.alias_name in ('religiöser Fetischismus','féticheur'))
      or (t.slug = 'affection' and al.alias_name in ('amar','amor','amores','amour',
                                                     'lieben','jemanden lieben','jmd. lieben'))
      or (t.slug = 'asian'     and al.alias_name in ('Asia continental','asiatischer Kontinent','Asie',
                                                     'Asie continentale','Asien','continent asiatique',
                                                     'continente asiático','continente de Asia'));
  if v_bad <> 0 then
    raise exception 'tag_prose_defines_another_tag: % wrong-entity alias(es) survive', v_bad;
  end if;

  -- 10b. THE AMBIGUOUS ALIASES SURVIVE. Deleting 17 is exactly the shape that could
  --      quietly take the in-domain ones too, so the keeps are asserted by name.
  select count(*) into v_bad
    from public.tag_aliases al
    join public.unified_tags t on t.id = al.canonical_tag_id
   where (t.slug = 'fetishism' and al.alias_name in ('fetichismo','fetichisme','fétichisme','Fetischismus',
                                                     'fetiche','fetichista','actividades fetichistas'))
      or (t.slug = 'slave'     and al.alias_name in ('esclava','esclave','esclavo','Sklave'))
      or (t.slug = 'bondage-and-discipline'
                               and al.alias_name in ('Fesselungsspiel','Hängebondage','Vincilagnia','vincilagnie'));
  if v_bad <> 15 then
    raise exception 'tag_prose_defines_another_tag: expected the 15 ambiguous aliases to survive, found % (they must NOT be swept)', v_bad;
  end if;

  -- 11. the wrong-entity provenance is gone
  select count(*) into v_bad
    from public.tag_sources s
    join public.unified_tags t on t.id = s.tag_id
   where (t.slug = 'affection'              and (s.source_id = 'Q316'      or s.source_url = 'https://en.wikipedia.org/wiki/Love'))
      or (t.slug = 'asian'                  and (s.source_id = 'Q48'       or s.source_url = 'https://en.wikipedia.org/wiki/Asia'))
      or (t.slug = 'slave'                  and (s.source_id = 'Q12773225' or s.source_url = 'https://en.wikipedia.org/wiki/Slavery'))
      or (t.slug = 'bondage-and-discipline' and (s.source_id = 'Q273972'   or s.source_url = 'https://en.wikipedia.org/wiki/Bondage'))
      or (t.slug = 'fetishism'              and (s.source_id = 'Q182116'   or s.source_url = 'https://en.wikipedia.org/wiki/Fetishism'))
      or (t.slug = 'gender-theory'          and (s.source_id = 'Q1662673'  or s.source_url = 'https://en.wikipedia.org/wiki/Gender_studies'));
  if v_bad <> 0 then
    raise exception 'tag_prose_defines_another_tag: % wrong-entity provenance row(s) survive', v_bad;
  end if;

  -- 11b. fetishist KEEPS its own provenance, because its entity is the right one
  select count(*) into v_bad
    from public.tag_sources s
    join public.unified_tags t on t.id = s.tag_id
   where t.slug = 'fetishist' and s.source_id = 'Q207791';
  if v_bad <> 1 then
    raise exception 'tag_prose_defines_another_tag: fetishist lost its correct provenance row';
  end if;

  -- 12. the "body-only repairs are free" premise, asserted against the LIVE trigger
  --     rather than claimed in prose, so it cannot quietly outlive its truth
  select pg_get_triggerdef(oid) into v_trigdef
    from pg_trigger
   where tgname = 'trg_search_documents_tag' and not tgisinternal;
  if v_trigdef is null then
    raise exception 'tag_prose_defines_another_tag: trg_search_documents_tag not found -- cannot verify search scope';
  end if;
  if position('long_description' in v_trigdef) > 0 then
    raise exception 'tag_prose_defines_another_tag: long_description is now in trg_search_documents_tag; the zero-search-churn premise no longer holds';
  end if;
end $verify$;
