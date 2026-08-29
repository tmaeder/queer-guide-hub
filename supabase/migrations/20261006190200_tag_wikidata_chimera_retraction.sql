-- Retract the chimera BODY on 44 tags, and the wrong QID that produced it.
--
-- THE DEFECT
--
-- `unified_tags.wikidata_id` is the source the prose was derived from, so a
-- wrong QID does not merely mislabel a row — it yields a confident, well-formed
-- encyclopaedia paragraph about something else, published and indexed:
--
--   passing   Q4        -> "Death is the irreversible cessation of biological
--                          functions"             (the tag is the TRANS sense)
--   seafood   Q84263196 -> "COVID-19 is a contagious disease ..."
--   flogger   MiG-23    -> "The Mikoyan-Gurevich MiG-23 is a single-engined
--                          ... fighter aircraft"
--   s-a-m     Q30       -> "The United States of America is a federal republic"
--   sounding  Q2288055  -> "An advisory board is a body that provides
--                          non-binding advice ..."   (the tag is a kink)
--   size-xxs  XSS       -> "Cross-site scripting is a type of security
--                          vulnerability ..."
--   public    PubMed    -> "PubMed is a freely accessible database ..."
--   dp        Q19652    -> "The public domain consists of creative works ..."
--   piggy     Q384593   -> "A police officer is a warranted law employee ..."
--   snuggling Q1054     -> "Sex, or sexual intercourse, is an intimate ..."
--   kinderfur Q1129857  -> "Child protection involves safeguarding children"
--
-- WHICH FIELD IS ACTUALLY WRONG — THE MEASUREMENT THAT REDIRECTED THIS FIX
--
-- A first draft nulled `description` too. Reading all 35 non-empty descriptions
-- showed that would have been badly wrong: THE SHORT DESCRIPTION IS USUALLY
-- CORRECT and it is the long body that was derived from the bad QID.
--
--   passing    "Passing refers to the ability of a person, particularly within
--               the transgender and non-binary ..."          <- correct
--   sounding   "The practice of inserting smooth, sterile rods into the urethra
--               for sexual stimulation."                     <- correct
--   dp         "An acronym for double penetration ..."       <- correct
--   snuggling  "Close physical cuddling and body contact ..." <- correct
--   s-a-m      "In Gay male subculture this stands for 'Stand and Model' ..."
--   branding   "A form of body modification where a heated implement ..."
--
-- 30 of the 35 are right. Nulling them would have deleted the only correct text
-- on the row and pushed sensitive_without_description from 28 to 58 — replacing
-- a wrong long body with NO body on exactly the adult tags that most need one.
--
-- So `description` is cleared ONLY on the four rows where it too describes the
-- wrong subject (ralf, size-xxs, synchron, treffen), and `long_description` is
-- cleared on all 44.
--
-- HOW THE 44 WERE CHOSEN
--
-- find-tag-wikidata-chimeras.mjs asks Wikidata what each QID actually is and
-- flags a row when the entity LABEL does not match the tag name AND the body
-- never names the tag. Across all 2,021 distinct QIDs (0 unjudged) that yields
-- 114 candidates — and 114 IS NOT THE ANSWER. Reading every one, only about a
-- third are real; the rest are legitimate synonym or translation QIDs with
-- correct prose (`blowjob` -> "fellatio", `espana` -> "Spanien", `venezia` ->
-- "Venice", `queer-rights` -> "LGBTQ rights"). Retracting those would delete 70
-- correct definitions to fix 44. Each of the 44 below was read and judged on
-- one question: does the published BODY describe a different subject?
--
-- Rows where only the identifier is wrong while the prose is right (`divorced`
-- carries a Romanian politician's QID but a correct paragraph about divorce;
-- also `daddie`, `car-play`, `medical-play`) are deliberately NOT retracted —
-- their pages are correct. Their QID is a provenance defect to fix separately.
--
-- WHY THE QID IS CLEARED
--
-- Clearing prose alone leaves the wrong source, and the next enrichment pass
-- re-derives the same wrong body. That is exactly what happened to the health
-- tags: 20261002100100 fixed the text and SIX WRONG wikidata_id VALUES OUTLIVED
-- IT. Removing both is what makes this stick.
--
-- INDEXABILITY IS DERIVED
--
-- Only rows left with no description at all are deindexed — computed from what
-- remains, not listed. The rest keep their correct short definition and stay
-- published. run_tag_thin_page_reindex restores any of them once a body exists.
--
-- Retracted text is preserved in tag_change_log via unified_tags_audit, with
-- the actor below naming this migration.

set local statement_timeout = '600s';

select set_config('app.actor', 'migration:tag-wikidata-chimera-retraction', true);

do $mig$
declare
  r        record;
  v_bad    int;
  v_body   int := 0;
  v_desc   int := 0;
  v_deidx  int := 0;
begin
  create temp table _chimera (slug text primary key) on commit drop;
  insert into _chimera (slug) values
    ('amateur'),        -- Indianapolis
    ('archangel'),      -- Arkhangelsk, a Russian city
    ('ballbuster'),     -- a Finnish film distributor
    ('bearded'),        -- hirsutism, a medical condition
    ('big'),            -- London
    ('bingo'),          -- Bingo, a character in Bluey
    ('branding'),       -- corporate logos
    ('buck'),           -- the US dollar
    ('buns'),           -- bread
    ('cane'),           -- Canes Venatici, a constellation
    ('crew'),           -- rowing as a sport
    ('ddlg'),           -- Diccionario da literatura galega
    ('dp'),             -- the public domain
    ('drone'),          -- unmanned aerial vehicles
    ('flogger'),        -- the Mikoyan-Gurevich MiG-23
    ('gimp'),           -- the GNU Image Manipulation Program
    ('gin'),            -- Guinea, the country
    ('hindu'),          -- India, the country
    ('human-doll'),     -- PENICILLIN, a Japanese band
    ('kinderfur'),      -- child protection
    ('madame'),         -- an Italian singer-songwriter
    ('marionette'),     -- Pinocchio
    ('men-only'),       -- a British magazine
    ('passing'),        -- death
    ('piggy'),          -- police officers
    ('pixie'),          -- the Pixies, a rock band
    ('public'),         -- PubMed
    ('ralf'),           -- the given name Ralph
    ('representation'), -- identifiers in computing
    ('s-a-m'),          -- the United States
    ('seafood'),        -- COVID-19
    ('siren'),          -- SIRENE, a French company register
    ('sitter'),         -- fashion models
    ('size-xxs'),       -- cross-site scripting
    ('snuggling'),      -- sexual intercourse
    ('sounding'),       -- advisory boards
    ('spankee'),        -- Spankee Rodgers, an American actor
    ('spill'),          -- video games
    ('synchron'),       -- Beckman Coulter, a diagnostics company
    ('tease'),          -- a family name
    ('trash'),          -- thrash metal
    ('treffen'),        -- Treffen am Ossiacher See, an Austrian town
    ('white-knight'),   -- Cellmates, a 2011 film
    ('witch');          -- W.I.T.C.H., an Italian comics series

  -- The four whose SHORT description is also about the wrong subject. Read by
  -- hand; every other row's description was verified correct and is kept.
  create temp table _bad_desc (slug text primary key) on commit drop;
  insert into _bad_desc (slug) values
    ('ralf'),      -- "Ralph is a male name of English origin ..."
    ('size-xxs'),  -- "Cross-site scripting (XSS) is a type of security ..."
    ('synchron'),  -- "Beckman Coulter, Inc. is an American company ..."
    ('treffen');   -- "Treffen am Ossiacher See is a market town ..."

  for r in select c.slug, t.id from _chimera c
             join public.unified_tags t on t.slug = c.slug loop
    update public.unified_tags
       set long_description = null,
           wikidata_id      = null,
           updated_at       = now()
     where id = r.id;
    v_body := v_body + 1;
  end loop;

  for r in select b.slug, t.id from _bad_desc b
             join public.unified_tags t on t.slug = b.slug loop
    update public.unified_tags
       set description       = null,
           short_description = null,
           updated_at        = now()
     where id = r.id;
    v_desc := v_desc + 1;
  end loop;

  -- Deindex only what is now genuinely empty. Derived, not listed.
  for r in select c.slug, t.id from _chimera c
             join public.unified_tags t on t.slug = c.slug
            where t.seo_indexable
              and coalesce(nullif(btrim(t.description), ''), t.short_description) is null loop
    update public.unified_tags
       set seo_indexable = false, updated_at = now()
     where id = r.id;
    v_deidx := v_deidx + 1;
  end loop;

  ------------------------------------------------------------------ assertions
  select count(*) into v_bad from _chimera c
   where not exists (select 1 from public.unified_tags t where t.slug = c.slug);
  if v_bad > 0 then
    raise exception 'chimera retraction: % listed slug(s) do not exist', v_bad;
  end if;

  select count(*) into v_bad from _chimera c
    join public.unified_tags t on t.slug = c.slug
   where t.long_description is not null or t.wikidata_id is not null;
  if v_bad > 0 then
    raise exception 'chimera retraction: % row(s) still carry a long body or a QID', v_bad;
  end if;

  -- The named bodies must be gone corpus-wide, matched on what they are made of.
  select count(*) into v_bad from public.unified_tags
   where status = 'active'
     and (coalesce(long_description, '') ~* 'Mikoyan-Gurevich MiG-23'
       or coalesce(long_description, '') ~* 'COVID-19 is a contagious disease'
       or coalesce(long_description, '') ~* 'Death is the irreversible cessation'
       or coalesce(long_description, '') ~* 'PubMed is a freely accessible database');
  if v_bad > 0 then
    raise exception 'chimera retraction: % row(s) still publish a named chimera body', v_bad;
  end if;

  -- CI zero-invariant, corpus-wide.
  select count(*) into v_bad from public.unified_tags
   where status = 'active' and seo_indexable
     and coalesce(nullif(btrim(description), ''), short_description) is null;
  if v_bad > 0 then
    raise exception 'chimera retraction: % indexable row(s) have no description', v_bad;
  end if;

  raise notice 'chimera retraction: % bodies cleared, % descriptions cleared, % deindexed',
    v_body, v_desc, v_deidx;
end
$mig$;
