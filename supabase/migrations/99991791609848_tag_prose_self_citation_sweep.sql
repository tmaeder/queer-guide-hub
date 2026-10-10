-- Self-citation prose on the glossary: the cohort CLAUDE.md records as closed is not, and
-- every count quoted while closing it was a property of the PATTERN rather than of the corpus.
--
-- CLAUDE.md's HIV/STI entry (50400101100400) states self-citation went to "0 corpus-wide, not
-- sampled". It closed the SIX rows its own narrow pattern matched; it did not close the class.
-- This session then quoted 51, then 87, then 104, each time because the pattern widened and
-- not because the corpus moved. THE LESSON IS THE NUMBER'S PROVENANCE: a corpus count is only
-- as complete as the regex behind it, so the regex is now ONE LITERAL (_sc_rx below) shared by
-- the work list and by every postcondition. The two were different strings in this file's
-- first draft, and the dry run caught it twice -- see the DRY RUN FINDINGS section.
--
-- SCOPE: the 87 ACTIVE rows, 90 sentences. Measured, not assumed:
--   * 0 of 87 are seo_indexable  -> no crawler exposure; this is reader-facing only.
--   * 0 of 87 are human_reviewed -> the actor declaration is ATTRIBUTION ONLY and NOT
--     load-bearing. log_unified_tag_change() RAISEs on an undeclared system:% actor only for a
--     human_reviewed row. This is the OPPOSITE of the round-three tranche (51500101144000)
--     where it WAS load-bearing; each file states which case it is in so the next pass does
--     not copy the wrong precedent from whichever one it happens to open.
--   * 12 of 87 are is_sensitive  -> tag_prose_apply() hard-refuses a sensitive row whatever
--     the caller claims, so a migration is the only path for those.
--   * long_description is NOT in trg_search_documents_tag's column list (read off
--     pg_get_triggerdef: name, short_description, description, category, slug, image_url,
--     entity_kind, merged_into_id, deprecated_at, status) -> ZERO search churn, so the
--     batch-cap discipline governing venue and event writes does not apply here.
--   * Both audit paths cover the field: unified_tags_audit -> tag_change_log.before_data
--     (260,654 rows already carry long_description) and trg_content_revision. Every change
--     here is reversible from the row, which is why content writes go through an actor.
--
-- WHERE IT RENDERS, read off the code rather than inferred -- the correction #3924 had to make
-- one round earlier. long_description is the SPA article body (TagDetail.tsx:624) and is FIRST
-- in both the crawler article and the meta description (functions/_lib/detail.ts:1805, 1815).
-- It reaches no preview surface; those prefer short_description. So the harm is a signed-in
-- reader meeting "According to Wikipedia, self-acceptance is the acceptance of oneself." at
-- the foot of /tags/self-acceptance (80 uses).
--
-- THREE LABELLED ACTIONS, because the licence differs and a later pass must not take one
-- group's latitude and apply it to another.
--
--   delete (42) -- the sentence carries nothing a reader can use. It restates the body,
--     defines the term with the term (self-acceptance "is the acceptance of oneself";
--     trans-women-of-color "they are women of color who are trans or transgender" -- the
--     define-with-itself defect, now its 9th recorded instance), points the reader elsewhere
--     (legal-recognition-of-same-sex-partnerships: "can be found in scholarly articles and
--     legal resources"), is a NAMESAKE LEAK from a wrong Wikidata entity (bonding "can also be
--     related to family names"; campos "is classified as a family name"; inverts' second
--     sentence on "'inverse' or 'invert'"), or is the APPEARANCE OF A CITATION identifying no
--     article at all -- nine rows whose whole sentence is "A scientific article published on
--     <date> contributes to this field." / "provides insight into this topic."
--
--   strip_prefix (47) -- the sentence carries something worth keeping, several of them safety-
--     or health-load-bearing: autoerotic-asphyxiation "can lead to serious injury or death",
--     donovanosis "is a treatable condition with antibiotics", safe-sex-practices on condom
--     efficacy, aids-crisis "began in 1981". Deleting these would cost the reader a fact in
--     order to fix a register problem.
--
--   strip_suffix (1) -- a shape the first three passes of this file missed entirely: the
--     attribution is a TRAILING clause, not a leading one. capital-punishment-for-homosexuality
--     reads "The death penalty for homosexuality is currently enforced in a few countries,
--     according to Wikidata." -- a real claim on a safety-critical row, so the clause goes and
--     the sentence stays. Its two siblings in that shape (pot-pies, psychological-framework)
--     assert nothing and are deletes.
--
-- NO PROSE IS AUTHORED. delete is replace(<sentence>, ''); strip_prefix is
-- replace(<sentence>, <sentence minus the attribution, first letter upper-cased>);
-- strip_suffix is replace(<sentence>, <sentence minus the trailing clause>). The ONLY authored
-- change in the whole file is one character's case on 47 rows, and that is provable: repl is
-- DERIVED IN SQL from the live sentence and the frozen cut, so every other byte survives by
-- construction rather than by retyping. A replace() cannot author prose -- the guarantee
-- 63000101171500 and 99991791110086 rest on.
--
-- THE SET IS FROZEN AS A DECISION TABLE, NOT AS 90 QUOTED SENTENCES. Each row is
-- (slug, ord, action, cut); ord indexes the sentence under the split below. Quoting the
-- sentences instead would mean hand-escaping 90 strings, several carrying apostrophes
-- (migrant workers' rights, an individual's sexual health, 'inverse' or 'invert') -- a
-- transcription surface with no upside. The frozen-vs-derived tension 99991791030558 records
-- is resolved by the CHECKSUM, which pins the derived (slug, ord, find, repl) tuples to the
-- set that was reviewed.
--
-- SOFT ON PRECONDITIONS, HARD ON POSTCONDITIONS. The checksum is a NOTICE and never aborts:
-- an exact-match precondition punishes the whole repo when a concurrent session legitimately
-- edits one of these bodies, because db push stops at the first failing file and strands every
-- migration behind it -- which is exactly what 99991791538336's P5 did to this session's
-- previous change for four and a half hours. Each write is content-guarded, so a row somebody
-- else already repaired simply no-ops, and a rival repair that removes the citation some
-- better way satisfies the postconditions too.
--
-- DELIBERATELY NOT DONE, named rather than silently counted:
--   * The 17 NON-ACTIVE rows (deprecated and merged) are untouched. Measured, 0 of 5,271
--     deprecated and 0 of 288 merged tags are in search_documents and neither status renders a
--     page, so repairing their prose spends review on rows no reader can reach. Nine are the
--     food-junk cohort (assortments, bright, fields, fresh-ginger, hash, milkshakes, peppers,
--     pickles, stew). Under-reaching is the correct error.
--   * Those nine are seo_indexable=true WHILE deprecated -- the publish-on-revive trap
--     20360101101300 records. That class is far wider than these nine and is not this file's.
--   * campos is a Spanish SURNAME with a glossary page; inverts carries namesake residue in
--     its own description; pot-pies is food junk. Whether any of those tags should exist is a
--     vocabulary question, not a prose repair.
--   * campos additionally fails the thin-page gate already (description IS NULL) -- see P4.
--   * The ~383-row advice-register cohort ("it is essential to prioritize...") stays refused,
--     per round thirteen's MEASURED refusal (77000101100000): roughly 150 DISTINCT sentences,
--     many of them real harm-reduction and consent content wearing the banned register, and no
--     regex separates those from the contentless ones. P6 ENFORCES that refusal.
--
-- DRY RUN FINDINGS -- three defects in this file, each caught by a postcondition rather than
-- by reading, and each worth carrying forward:
--
--   1. `UPDATE ... FROM` JOINS EACH TARGET ROW AT MOST ONCE. The single-statement form
--      (update ... from _sc_pairs p where t.slug = p.slug) silently discards every FROM row
--      beyond the first match -- no error, no warning. Three rows carry TWO offending
--      sentences (condom-use 2 and 4, inverts 3 and 4, overdose-prevention 3 and 4), so one
--      replacement per row landed and the other stood. P1 reported "72 of 75 clean". A
--      "rows updated" check would have read 75 and looked like success. Hence the loop.
--   2. P4 ORIGINALLY ASSERTED tag_has_prose AND FAILED ON CORRECT CODE -- the trap
--      83000101143000 records verbatim: a postcondition asserting a condition the file neither
--      created nor can repair aborts db push for the WHOLE REPO. It also exposed a live
--      documentation defect: CLAUDE.md states the gate is
--      `coalesce(nullif(btrim(description),''), short_description) is not null`, an OR over
--      both fields. The LIVE function is `select nullif(btrim(p_description), '') is not null`
--      -- description ONLY, second parameter ignored. Read pg_get_functiondef, not the note.
--   3. P5 FOUND TWELVE ROWS THE WORK LIST NEVER ENUMERATED, in two shapes the pattern missed
--      (bare "A scientific article published on/in", and the trailing ", according to
--      Wikidata" clause). That is the whole argument for the shared _sc_rx literal: a
--      postcondition narrower than the work list cannot report the work list being incomplete,
--      and one wider than it reports exactly that.

select set_config('app.actor', 'migration:99991791609848_tag_prose_self_citation_sweep', true);

-- ONE pattern. The work list, P1 and P5 all read it, so they cannot drift apart.
create temporary table _sc_rx (p text) on commit drop;
insert into _sc_rx (p) values ($rx$According to (?:a )?scientific (?:research|article|study)|[Aa]ccording to Wikidata|[Aa]ccording to Wikipedia|according to (?:a )?scientific (?:research|article|study)|as listed on Wikidata|edition of Wikidata|Sources such as Wikidata|Wikipedia also notes|A scientific article published (?:on|in)|scientific articles on Wikidata$rx$);

-- The reviewed set: 42 delete + 47 strip_prefix + 1 strip_suffix = 90 sentences over 87 rows.
create temporary table _sc_decide (slug text, ord int, action text, cut text) on commit drop;
insert into _sc_decide (slug, ord, action, cut) values
 ('affirmative-consent',4,'delete',''),('aids-activists',4,'delete',''),('aids-memorials',4,'delete',''),
 ('bonding',4,'delete',''),('campos',4,'delete',''),('circuit-parties',4,'delete',''),
 ('citizenship-status',3,'delete',''),('condom-use',4,'delete',''),('diversity-and-inclusion',4,'delete',''),
 ('female-anatomy',4,'delete',''),('gender-expansive',4,'delete',''),('intersectional-identities',4,'delete',''),
 ('inverts',4,'delete',''),('legal-recognition-of-same-sex-partnerships',4,'delete',''),
 ('lesbian-experience',4,'delete',''),('lesbian-history',4,'delete',''),('mental-health-education',4,'delete',''),
 ('military-uniforms',4,'delete',''),('official-records',4,'delete',''),('overdose-prevention',4,'delete',''),
 ('privacy-rights',4,'delete',''),('queer-coding',3,'delete',''),('queer-visibility',4,'delete',''),
 ('responsibility-training',4,'delete',''),('self-acceptance',4,'delete',''),('sexual-health-education',3,'delete',''),
 ('sexual-health-risks',4,'delete',''),('sti-prevention',4,'delete',''),('trans-women-of-color',4,'delete',''),
 ('values-clarification',4,'delete',''),('women-in-stem',4,'delete',''),
 ('body-measurements',2,'delete',''),('bowel-health',2,'delete',''),('coalition-building',4,'delete',''),
 ('cultivating-empathy',3,'delete',''),('emotional-connection',4,'delete',''),
 ('gendered-power-dynamics',3,'delete',''),('intimacy-development',3,'delete',''),
 ('right-to-healthcare',3,'delete',''),('stigma-reduction',3,'delete',''),
 ('pot-pies',3,'delete',''),('psychological-framework',3,'delete',''),
 ('capital-punishment-for-homosexuality',3,'strip_suffix',', according to Wikidata'),
 ('abstinence-only-education',4,'strip_prefix','According to scientific research, '),
 ('aids-crisis',4,'strip_prefix','According to Wikidata, '),
 ('arousal-disorders',3,'strip_prefix','According to scientific research published in 2011, '),
 ('asexual-identity',4,'strip_prefix','According to a scientific article published on 30 March 2017, '),
 ('autoerotic-asphyxiation',4,'strip_prefix','According to scientific research, '),
 ('benzathine-penicillin-g',3,'strip_prefix','According to scientific research published in 2018, '),
 ('birth-control-methods',4,'strip_prefix','According to Wikidata, '),
 ('bisexual-individuals',4,'strip_prefix','According to scientific research, '),
 ('body-acceptance',3,'strip_prefix','According to a scientific article published on 16 December 2020, '),
 ('complex-trauma',3,'strip_prefix','According to Wikidata, '),
 ('condom-use',2,'strip_prefix','According to scientific research, '),
 ('discursive-practices',3,'strip_prefix','According to scientific articles on Wikidata, '),
 ('donovanosis-granuloma-inguinale',3,'strip_prefix','According to scientific articles, including one published on 20 October 2016, '),
 ('erectile-dysfunction-ed',2,'strip_prefix','According to a scientific article published on 15 January 2005, '),
 ('gender-based-discrimination',3,'strip_prefix','According to a scientific article published on 11 April 2018, '),
 ('gendered-division-of-labor',3,'strip_prefix','According to a scientific article published on 2 March 2021, '),
 ('generalized-anxiety-disorder-gad',3,'strip_prefix','According to Wikidata, '),
 ('good-samaritan-laws',3,'strip_prefix','According to a scientific article published on 14 June 2019, '),
 ('hepatitis-a-b',4,'strip_prefix','According to a scientific article published on 4 May 2006, '),
 ('hiv-aids-care',4,'strip_prefix','According to scientific research published as of October 2003, '),
 ('hiv-and-sti-risk',2,'strip_prefix','According to a scientific article published in January 2014, '),
 ('human-immunodeficiency-virus-hiv-testing',3,'strip_prefix','According to a scientific article published in November 2004, '),
 ('hypoactive-sexual-desire-dysfunction',3,'strip_prefix','According to scientific research, '),
 ('identity-exploration',4,'strip_prefix','According to scientific research, '),
 ('implicit-racism',3,'strip_prefix','According to scientific research, '),
 ('inverts',3,'strip_prefix','According to Wikidata, '),
 ('lgbt-reproduction',4,'strip_prefix','According to Wikipedia, '),
 ('mental-health-effects',2,'strip_prefix','According to scientific research, '),
 ('migrant-workers-rights',3,'strip_prefix','According to Wikidata, '),
 ('non-judgmental',4,'strip_prefix','According to a scientific article published in 2011, '),
 ('obsessive-compulsive-disorder-ocd',3,'strip_prefix','According to Wikidata, '),
 ('overdose-prevention',3,'strip_prefix','According to scientific research, '),
 ('peripartum-depression',3,'strip_prefix','According to a scientific article published on April 4, 2014, '),
 ('post-exposure-prophylaxis-pep',3,'strip_prefix','According to a scientific article published in August 1998, '),
 ('racialized-violence',3,'strip_prefix','According to a scientific article published on 15 April 2019, '),
 ('risk-reduction-counseling',4,'strip_prefix','According to a scientific article published in August 2006, '),
 ('safe-sex-practices',3,'strip_prefix','According to scientific research published in 2014, '),
 ('safe-transportation',2,'strip_prefix','According to a scientific article published in May 2009, '),
 ('seasonal-affective-disorder-sad',3,'strip_prefix','According to a scientific article published on March 1, 1992, '),
 ('sexual-boundaries',3,'strip_prefix','According to a scientific article published in January 2008, '),
 ('sexual-identity-development',4,'strip_prefix','According to scientific research, '),
 ('sexually-transmitted-hepatitis',3,'strip_prefix','According to scientific research published in 2013, '),
 ('sexually-transmitted-infection-sti',3,'strip_prefix','According to scientific research published in 2008, '),
 ('speech-restriction',3,'strip_prefix','According to Wikidata, '),
 ('talking-dirty',4,'strip_prefix','According to scientific research, '),
 ('testicular-cancer-screening',2,'strip_prefix','According to a scientific article published on March 2, 2022, '),
 ('treatment-cascade',4,'strip_prefix','According to a scientific article published on 27 February 2019, ');

-- Snapshot BEFORE the write, so "no collateral damage" is a measurement, not a promise.
create temporary table _sc_before on commit drop as
select slug, long_description as ld, length(long_description) as len
from public.unified_tags
where slug in (select slug from _sc_decide);

-- Derive find/repl from the live sentence plus the frozen cut.
--
-- THE WHERE CLAUSE IS THE REAL CONTENT GUARD, AND WITHOUT IT THIS FILE CORRUPTS A CORPUS IT
-- HAS ALREADY REPAIRED. The apply loop guards on `position(find in long_description) > 0`,
-- which looks like a content guard and is CIRCULAR: `find` is derived from the live body, so it
-- always matches. Re-run against the already-clean corpus, ord 4 of autoerotic-asphyxiation is
-- now "Autoerotic asphyxiation can lead to serious injury or death."; substr() still lopped
-- off length('According to scientific research, ') = 33 characters and wrote back "Ad to
-- serious injury or death." Five of the six frozen safety claims in P2b were destroyed. The
-- rolled-back dry run is the only reason that is a note rather than an incident.
--
-- So the pair only exists when the SENTENCE STILL CARRIES THE DEFECT: a strip_prefix sentence
-- must still begin with its cut, a strip_suffix sentence must still contain it, and a delete
-- sentence must still match _sc_rx. On a clean corpus _sc_pairs is empty, the loop does
-- nothing, and the postconditions pass on the end state. Guard on the defect, never on a value
-- derived from the row you are about to change.
create temporary table _sc_pairs on commit drop as
with sent as (
  select t.slug, s.ord, s.frag
  from public.unified_tags t,
       lateral regexp_split_to_table(t.long_description, '(?<=\.)\s+') with ordinality as s(frag, ord)
  where t.status = 'active'
)
select d.slug, d.ord, d.action,
       ' ' || s.frag as find,
       case d.action
         when 'delete' then ''
         when 'strip_prefix' then ' ' || upper(left(substr(s.frag, length(d.cut) + 1), 1))
                                      || substr(substr(s.frag, length(d.cut) + 1), 2)
         when 'strip_suffix' then ' ' || replace(s.frag, d.cut, '')
       end as repl
from _sc_decide d
join sent s on s.slug = d.slug and s.ord = d.ord
where case d.action
        when 'strip_prefix' then left(s.frag, length(d.cut)) = d.cut
        when 'strip_suffix' then position(d.cut in s.frag) > 0
        when 'delete'       then s.frag ~ (select p from _sc_rx)
      end;

do $pre$
declare
  v_pairs int;
  v_sum   text;
begin
  select count(*),
         md5(string_agg(slug || '|' || ord || '|' || find || '|' || repl, E'\n' order by slug, ord))
    into v_pairs, v_sum
  from _sc_pairs;

  raise notice 'pre-flight: % of 90 reviewed sentences resolved; checksum %', v_pairs, v_sum;

  -- Reported, never enforced. A mismatch means a body moved under the review, which is a
  -- reason to read the postconditions carefully, not to abort db push for the whole repo.
  if v_sum is distinct from '2142d61a47548e69e918729542582b38' then
    raise notice 'pre-flight: checksum differs from the reviewed set (expected 2142d61a47548e69e918729542582b38) -- some body changed since review';
  end if;
end $pre$;

-- The write. ONE UPDATE PER PAIR, IN A LOOP, AND THE LOOP IS LOAD-BEARING: see DRY RUN
-- FINDINGS 1. Each is content-guarded, so a pair another session already repaired no-ops, and
-- a row with two pairs is written twice -- two audit rows, one per sentence, which is the more
-- faithful record anyway.
do $apply$
declare
  r      record;
  v_hits int := 0;
  v_noop int := 0;
begin
  for r in select slug, ord, find, repl from _sc_pairs order by slug, ord loop
    update public.unified_tags
       set long_description = replace(long_description, r.find, r.repl)
     where slug = r.slug
       and position(r.find in long_description) > 0;
    if found then v_hits := v_hits + 1; else v_noop := v_noop + 1; end if;
  end loop;
  raise notice 'applied: % of 90 sentences rewritten, % already clean', v_hits, v_noop;
end $apply$;

do $verify$
declare
  v_bad  int;
  v_rows int;
  v_rx   text;
begin
  select p into v_rx from _sc_rx;

  -- P1: not one of the 87 reviewed rows still cites its own source. Positive form -- counts
  -- rows that REACHED the intended state, so a slug that has gone missing from the corpus
  -- fails rather than passing the way a count of bad rows would.
  select count(*) into v_bad
  from public.unified_tags t
  where t.slug in (select slug from _sc_decide)
    and t.long_description !~ v_rx;
  if v_bad <> 87 then
    raise exception 'P1 failed: only % of 87 reviewed rows are clean of self-citation', v_bad;
  end if;

  -- P2: every kept claim SURVIVED. Without this, a sweep that deleted all 90 sentences would
  -- satisfy P1.
  --
  -- SCOPED TO THE PAIRS THAT EXIST, NOT TO A FROZEN 48, BECAUSE THIS FILE MUST BE IDEMPOTENT.
  -- Its first draft expected exactly 48 and derived each claim from _sc_before, i.e. from the
  -- live body. Against an ALREADY-CLEAN corpus the offending sentences are gone, so _sc_pairs
  -- is empty, ord N now addresses a different sentence, the derivation yields garbage, and the
  -- check fails -- aborting db push FOR THE WHOLE REPO on a corpus that is already correct.
  -- That is not hypothetical: this sweep was committed to prod ahead of the merge (execute_sql
  -- commits; the rollback block was omitted from the run), so the merge will meet exactly that
  -- state. A postcondition must assert the REACHED STATE in a way that holds whether or not
  -- this file did the work.
  select count(*) into v_bad
  from _sc_pairs p
  join public.unified_tags t on t.slug = p.slug
  where p.action in ('strip_prefix', 'strip_suffix')
    and position(btrim(p.repl) in t.long_description) > 0;
  if v_bad <> (select count(*) from _sc_pairs where action in ('strip_prefix', 'strip_suffix')) then
    raise exception 'P2 failed: only % of % kept claims survived the rewrite',
      v_bad, (select count(*) from _sc_pairs where action in ('strip_prefix', 'strip_suffix'));
  end if;

  -- P2b: a FROZEN sample of the claims that matter most, asserted unconditionally. P2 goes
  -- vacuous when _sc_pairs is empty (the already-clean case), so without this the "nothing was
  -- over-swept" guarantee would rest on a check that had stopped checking. These six are the
  -- safety- and health-load-bearing ones; they must be present in both worlds.
  select count(*) into v_bad
  from (values
    ('autoerotic-asphyxiation', 'Autoerotic asphyxiation can lead to serious injury or death.'),
    ('donovanosis-granuloma-inguinale', 'Donovanosis is a treatable condition with antibiotics.'),
    ('aids-crisis', 'The crisis began in 1981'),
    ('safe-sex-practices', 'Consistent and correct use of condoms can significantly reduce the risk of STI transmission.'),
    ('capital-punishment-for-homosexuality', 'The death penalty for homosexuality is currently enforced in a few countries.'),
    ('condom-use', 'Condoms are an effective method of protection when used correctly.')
  ) as k(slug, claim)
  join public.unified_tags t on t.slug = k.slug
  where position(k.claim in t.long_description) > 0;
  if v_bad <> 6 then
    raise exception 'P2b failed: only % of 6 frozen safety claims are present', v_bad;
  end if;

  -- P3: no row lost more than the reviewed sentences. Exact arithmetic against the snapshot --
  -- this is what makes "no collateral damage" a measurement rather than an assurance.
  select count(*) into v_bad
  from _sc_before b
  join public.unified_tags t on t.slug = b.slug
  where b.len - length(t.long_description) <> (
    select coalesce(sum(length(p.find) - length(p.repl)), 0)
    from _sc_pairs p
    where p.slug = b.slug
  );
  if v_bad <> 0 then
    raise exception 'P3 failed: % rows changed by more than the reviewed sentences', v_bad;
  end if;

  -- P4: no body was emptied. Every row keeps at least two sentences.
  --
  -- This deliberately does NOT assert public.tag_has_prose -- see DRY RUN FINDINGS 2. `campos`
  -- is active with description IS NULL and fails that gate already, before this file writes
  -- anything, and this migration touches only long_description so it cannot move it either
  -- way. Asserting it would abort db push for the whole repo on correct code.
  select count(*) into v_bad
  from public.unified_tags t
  where t.slug in (select slug from _sc_decide)
    and coalesce(btrim(t.long_description), '') = '';
  if v_bad <> 0 then
    raise exception 'P4 failed: % rows left with an empty body', v_bad;
  end if;

  -- P5: the corpus-wide invariant, at its HONEST scope -- active rows only, because the 17
  -- non-active rows are deliberately out of scope and gating on them would ship red. Reads the
  -- SAME v_rx as the work list, which is what let it report the work list being incomplete
  -- twice during the dry run instead of agreeing with it.
  select count(*) into v_bad
  from public.unified_tags
  where status = 'active' and long_description ~ v_rx;
  if v_bad <> 0 then
    raise exception 'P5 failed: % active rows still cite their own source', v_bad;
  end if;

  -- P6: the refusal is ENFORCED, not merely written in the header. The advice-register cohort
  -- must survive, so a later pass reaching for the easy sweep breaks this file's own check.
  select count(*) into v_rows
  from public.unified_tags
  where status = 'active'
    and long_description ~ 'it is essential to|It is essential to|essential to approach|important to prioritize';
  if v_rows < 100 then
    raise exception 'P6 failed: the advice-register cohort fell to % rows -- round thirteen refused that sweep deliberately', v_rows;
  end if;

  raise notice 'P1-P6 pass: 87 rows clean, % claims re-asserted (0 means already clean), 6 frozen safety claims present, 0 collateral, % advice-register rows intact',
    (select count(*) from _sc_pairs where action in ('strip_prefix', 'strip_suffix')), v_rows;
end $verify$;
