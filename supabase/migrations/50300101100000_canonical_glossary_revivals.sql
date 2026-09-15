-- Revive 48 glossary terms that two blind sweeps culled, corroborated against
-- eight canonical LGBTQ+ terminology references.
--
-- Sources compared: The Safe Zone Project, Wikipedia's LGBTQ slang article,
-- Stonewall's list of LGBTQ+ terms, UH Hilo's queer terminology page, the
-- UConn Rainbow Center LGBTQIA+ Dictionary, Florence Ashley's "Queering Our
-- Vocabulary", the Studio Inclusie queer glossary, and SLCC's terminology
-- sheet. (A ninth, UCSF's glossary, is Cloudflare-blocked from this network by
-- every route tried — browser included — so it was NEVER READ and nothing here
-- is attributed to it. Same discipline as the CombiChecker: an unreachable
-- source contributes nothing, and must not be listed as though it did.)
--
-- 458 headwords were extracted, giving 454 distinct slugs. Joined mechanically
-- against the corpus, they land:
--
--    151  already active
--     78  DEPRECATED with a real body
--     18  deprecated and empty
--     11  held only as another tag's alias
--    185  no match
--
-- Those are the numbers to re-derive and re-quote; they come from a slugify and
-- a join, and nothing about them is a judgement. The 185 is NOT 185 gaps —
-- most of it is extraction residue (`a-queer-glossary`, `facebook`, `you`,
-- `or`, `including`) and compound headwords the sources join with a slash
-- (`fag-faggot`, `ftm-f2m`, `latine-latinx`, `shemale-or-she-male`), which is
-- why the triage below is by hand.
--
-- 48 OF THE 78 ARE REVIVED HERE. The other 30 were read and left alone, and
-- they fall into three kinds, none of which is a gap:
--
--   3   alias-shadowed (berdache / deadname / genderfluid, below)
--  ~12  a compound or abbreviated SPELLING of a concept that is already live —
--       `fag-faggot`, `faggot-fag`, `ftm-f2m`, `ftm-mtf`, `mtf-m2f`,
--       `same-gender-loving-sgl`, `sex-reassignment-surgery-srs`, `binders`,
--       `aro`, `binary`, `fluid`, `transition`. These are alias candidates, not
--       terms, and minting a second row for one is what the shadow guard exists
--       to stop.
--   ~15 a generic word or scrape residue: `sex` and `fruit` are both filed
--       under Fetishes, `clock` is ALREADY retracted for being the wrong sense,
--       and `attraction` / `stereotype` / `essentialism` / `feminism` / `baths`
--       / `beard` / `artiste` / `clone` / `brownie-queen` / `polyamorous` /
--       `gender-inclusive` / `ze-hir` each need their own editorial decision
--       about scope and filing, which this pass does not make for them.
--
-- The 78 is the point. Every one of the 51 was culled by one of the
-- same two passes this repo has now hit four times — `auto: zero usage` and the
-- 2026-06-05 orphan audit ("no entity assignments, relations, synonyms, or
-- aliases") — and **both premises are false for a glossary term**: a glossary
-- term has no entity assignments by nature, and a definition nobody has tagged
-- a venue with is still a definition. 20261211100000 recorded this when it
-- revived `femdom` and `voyeur`; 20360101101600 revived fifteen more;
-- 50100101100100 revived `intimate-partner-violence` and `domestic-violence`.
-- This pass is the same finding with much stronger corroboration behind it,
-- because these are not one reference's idiosyncratic list — they are eight
-- independent institutional glossaries, and what they carry in common is the
-- field's core vocabulary.
--
-- What was lost is not marginal. `gender-binary`, `sexual-attraction`,
-- `romantic-orientation`, `romantic-attraction`, `microaggression`,
-- `cissexism`, `monosexism`, `assigned-sex`, `intersexuality`, `pansexuality`
-- and `kinsey-scale` are foundational terms. Corroboration across the 48 is
-- 33 in one reference, 10 in two and 5 in three (`gender-binary`,
-- `hermaphrodite`, `romantic-attraction`, `skoliosexual`, `transvestite`),
-- counted on EXACT headword — so a concept the sources spell differently is
-- undercounted and a low count is not evidence a term is marginal. Do not
-- restate this as "five of the foundational terms above appear in three or
-- more"; only two of them do, and an earlier draft of this header said
-- otherwise.
--
-- THREE CANDIDATES ARE NOT REVIVED, and the reason is the same guard that
-- stopped 20360101101600 — `tag_reject_alias_shadow()`. Each is already live
-- under another name, so none was ever a gap:
--
--     berdache     is an alias of `two-spirit`   (auto)
--     deadname     is an alias of `deadnaming`   (auto)
--     genderfluid  is an alias of `gender-fluid` (approved)
--
-- Recorded here so the next comparison against a terminology list does not
-- "find" them again and re-propose them.
--
-- EVERYTHING COMES BACK UNPUBLISHED — seo_indexable=false, human_reviewed=false,
-- verification_status='unverified'. The bodies were written by an earlier
-- Wikidata/LLM pass and no human has read them, and **41 of the 48 are
-- seo_indexable=true on their deprecated rows**, so a revive that did not clear
-- that flag would put unreviewed machine prose straight in front of crawlers —
-- the trap 20360101101300 hit on `impaired-driving`. Rewriting the bodies here
-- instead would be the LLM prose rewrite this repo banned after the tag prose
-- judge retracted 16 of its first 18 rows with 13 of them wrong.
--
-- The cost, stated once: unpublished plus zero usage means
-- `deprecate_unused_tags` can sweep them again. Accepted for the same reason as
-- every prior revival — a swept term can be revived again, a false
-- human_reviewed=true cannot be undone by inspection — and it is why the real
-- fix for this class is eventually the sweep's predicate, not a fifth revival.
--
-- SLURS ARE REVIVED ALONGSIDE THE REST, and that is the house convention rather
-- than an oversight: `faggot`, `shemale` and `breeder` are all ACTIVE today with
-- `is_sensitive=true`, `is_adult=true`, `seo_indexable=false`. A glossary
-- documents the words people are called, and every reference compared here does
-- the same. The existing flags on these rows are left exactly as they are —
-- `tranny` already carries is_sensitive=true and seo_indexable=false.
--
-- 23 CARRY NO CATEGORY AT ALL and would revive as uncategorised rows, which
-- `tag_hygiene_stats` counts and nothing would explain. They are assigned from
-- house precedent, not invented: `cissexism` and `monosexism` join
-- `heterosexism` and `transmisogyny` in Violence & Hate; `intersexuality` joins
-- `intersex`; `gender-pronouns` joins `pronouns`; `queerspawn` goes to Family &
-- Parenting; the reclaimed and derogatory nicknames join `friend-of-dorothy`,
-- `flamer` and `dykon` in Slang & Language.

set local statement_timeout = '600s';

select set_config('app.actor', 'migration:canonical-glossary-revivals', true);

-- `rec`, not `r`: PL/pgSQL resolves a qualified name to a DECLAREd variable
-- before a table alias, so a variable named `r` makes `r.slug` in a guard that
-- aliases `_revive r` read the unassigned record and die with
-- "record \"r\" is not assigned yet" (20360101101600).
do $mig$
declare
  rec   record;
  v_bad int;
  v_n   int := 0;
begin
  create temp table _revive (slug text primary key, cat text) on commit drop;

  -- cat is NULL where the row already carries a correct category.
  insert into _revive (slug, cat) values
    ('alloromantic',               null),
    ('androgynous',                null),
    ('androgyny',                  null),
    ('assigned-sex',               'gender-identity'),
    ('batty-boy',                  'slang-terminology'),
    ('bi-curious',                 null),
    ('bicon',                      'slang-terminology'),
    ('bull-dyke',                  'slang-terminology'),
    ('bulldagger',                 'slang-terminology'),
    ('cissexism',                  'violence-hate'),
    ('copenhagen-capon',           'slang-terminology'),
    ('cross-dressing',             'expression-presentation'),
    ('dykon',                      null),
    ('fag-hag',                    null),
    ('flamer',                     null),
    ('friend-of-dorothy',          null),
    ('gaydar',                     null),
    ('gaymer',                     null),
    ('gender-binary',              null),
    ('gender-incongruence',        null),
    ('gender-pronouns',            'gender-identity'),
    ('gender-variant',             'gender-identity'),
    ('gray-asexual',               'sexual-orientation'),
    ('graysexual',                 null),
    ('hermaphrodite',              null),
    ('heterosexual-privilege',     'theory-scholarship'),
    ('horatian',                   'slang-terminology'),
    ('intergender',                null),
    ('intersexuality',             'intersex-bodies'),
    ('kinsey-scale',               'sexual-orientation'),
    ('lesbianism',                 'sexual-orientation'),
    ('microaggression',            null),
    ('monosexism',                 'violence-hate'),
    ('muff-diver',                 'slang-terminology'),
    ('pansexuality',               null),
    ('queerplatonic-relationship', null),
    ('queerspawn',                 'family-chosen-family'),
    ('romantic-attraction',        'sexual-orientation'),
    ('romantic-orientation',       null),
    ('same-gender-loving',         null),
    ('sexual-attraction',          null),
    ('sexual-preference',          'sexual-orientation'),
    ('skoliosexual',               null),
    ('soft-butch',                 null),
    ('stone-butch',                null),
    ('straight-acting',            'expression-presentation'),
    ('tranny',                     'slang-terminology'),
    ('transvestite',               null);

  ------------------------------------------------------------------ guards
  -- SOFT on preconditions, HARD on postconditions (20360401100100's rule).
  -- Every check below REPORTS and then EXCLUDES the row from the loop; none of
  -- them aborts. A concurrent session that revives or merges one of these 48
  -- between authoring and merge is not a reason to fail `db push` on main and
  -- block every migration queued behind it. What this file is not allowed to
  -- finish without is asserted in the verify block: exactly 48 of these slugs
  -- active, unpublished, categorised and still carrying a body.
  select count(*) into v_bad from _revive rv
   where exists (select 1 from public.unified_tags t
                  where t.slug = rv.slug and t.status = 'active');
  if v_bad > 0 then
    raise notice 'glossary revivals: % row(s) already active — skipped', v_bad;
  end if;

  -- A merged row is a redirect to another concept; reviving it produces two
  -- live rows for one thing, pointing at each other.
  select count(*) into v_bad from _revive rv
    join public.unified_tags t on t.slug = rv.slug
   where t.merged_into_id is not null;
  if v_bad > 0 then
    raise notice 'glossary revivals: % row(s) are merged, not merely deprecated — skipped', v_bad;
  end if;

  -- This migration revives; it does not write prose. If a body has gone missing
  -- since this was authored, skip rather than publish an empty term.
  select count(*) into v_bad from _revive rv
    join public.unified_tags t on t.slug = rv.slug
   where coalesce(t.long_description, '') = '';
  if v_bad > 0 then
    raise notice 'glossary revivals: % row(s) have no body — skipped', v_bad;
  end if;

  -- A slug held as an alias of another tag cannot be revived: two rows would
  -- answer to one name. tag_reject_alias_shadow() enforces this on the UPDATE
  -- and would abort mid-loop, so the set is excluded here instead; this is what
  -- keeps berdache / deadname / genderfluid out, per the header.
  select count(*) into v_bad from _revive rv
   where exists (select 1 from public.tag_aliases a where a.alias_slug = rv.slug);
  if v_bad > 0 then
    raise notice 'glossary revivals: % slug(s) are alias-shadowed — skipped, see header', v_bad;
  end if;

  -- A category that does not exist is a typo in THIS file, not corpus drift,
  -- and no later state can repair it: hard.
  select count(*) into v_bad from _revive rv
   where rv.cat is not null
     and not exists (select 1 from public.tag_categories c where c.slug = rv.cat);
  if v_bad > 0 then
    raise exception 'glossary revivals: % row(s) name a category that does not exist', v_bad;
  end if;

  ------------------------------------------------------------------ revive
  for rec in
    select rv.* from _revive rv
      join public.unified_tags t on t.slug = rv.slug
     where t.status = 'deprecated'
       and t.merged_into_id is null
       and coalesce(t.long_description, '') <> ''
       and not exists (select 1 from public.tag_aliases a where a.alias_slug = rv.slug)
     order by rv.slug
  loop
    update public.unified_tags t set
      status              = 'active',
      deprecated_at       = null,
      deprecation_reason  = null,
      seo_indexable       = false,
      human_reviewed      = false,
      verification_status = 'unverified',
      category_id         = coalesce(
                              (select c.id from public.tag_categories c where c.slug = rec.cat),
                              t.category_id)
    where t.slug = rec.slug;
    v_n := v_n + 1;

    insert into public.tag_sources (tag_id, source_type, claim_summary, is_public)
    select t.id, 'editorial:general-knowledge',
           'Revived unpublished. Culled by a sweep keyed on zero usage or on having no entity assignments, neither of which is evidence about a glossary term. Corroborated against eight canonical LGBTQ+ terminology references. Existing body kept unchanged and unreviewed; it predates this migration.',
           false
      from public.unified_tags t where t.slug = rec.slug;
  end loop;

  raise notice 'glossary revivals: revived % row(s)', v_n;
end $mig$;

-- Postconditions: re-assert the state this file exists to reach.
do $verify$
declare
  v_bad int;
begin
  select count(*) into v_bad from public.unified_tags
   where slug in ('alloromantic','androgynous','androgyny','assigned-sex','batty-boy','bi-curious',
     'bicon','bull-dyke','bulldagger','cissexism','copenhagen-capon','cross-dressing','dykon','fag-hag',
     'flamer','friend-of-dorothy','gaydar','gaymer','gender-binary','gender-incongruence','gender-pronouns',
     'gender-variant','gray-asexual','graysexual','hermaphrodite','heterosexual-privilege','horatian',
     'intergender','intersexuality','kinsey-scale','lesbianism','microaggression','monosexism','muff-diver',
     'pansexuality','queerplatonic-relationship','queerspawn','romantic-attraction','romantic-orientation',
     'same-gender-loving','sexual-attraction','sexual-preference','skoliosexual','soft-butch','stone-butch',
     'straight-acting','tranny','transvestite')
     and status = 'active'
     and deprecated_at is null
     and deprecation_reason is null
     and category_id is not null
     and not seo_indexable
     and not human_reviewed
     and coalesce(long_description, '') <> '';
  -- Counted POSITIVELY on purpose. The obvious form — count the rows in a bad
  -- state — passes vacuously for a slug that is missing from the corpus
  -- entirely, which is exactly what the softened guards above now let through.
  if v_bad <> 48 then
    raise exception 'verify: expected 48 revived rows active, unpublished, categorised and bodied; found %', v_bad;
  end if;

  -- The three the shadow guard excluded must still be deprecated: reviving one
  -- would mint a second live row for a concept that already has one.
  select count(*) into v_bad from public.unified_tags
   where slug in ('berdache','deadname','genderfluid') and status = 'active';
  if v_bad > 0 then
    raise exception 'verify: an alias-shadowed slug was revived after all';
  end if;

  -- Every revived row must still carry the body it was revived for.
  select count(*) into v_bad from public.unified_tags
   where slug in ('gender-binary','sexual-attraction','microaggression','cissexism','intersexuality')
     and coalesce(long_description, '') = '';
  if v_bad > 0 then
    raise exception 'verify: % revived row(s) lost their body', v_bad;
  end if;
end $verify$;
