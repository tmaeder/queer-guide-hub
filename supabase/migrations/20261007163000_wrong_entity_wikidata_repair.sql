-- Repair six tags whose stored wikidata_id still points at the WRONG ENTITY,
-- and the alias + medical-code layers those identifiers kept generating.
--
-- WHAT WAS MEASURED, ON PROD, BEFORE WRITING THIS
--
-- The 2026-08-28 health/drug fact-check (docs/audits/2026-08-28-health-drug-tag-facts.md)
-- found seven tags whose long_description was about a different subject, and it
-- rewrote that prose. It did not touch `wikidata_id`. Re-reading the column
-- against Wikidata on 2026-08-29 — resolving each stored QID rather than
-- trusting the corrected prose above it — shows six are still wrong:
--
--   tag              stored QID   what that item actually is
--   ---------------  -----------  --------------------------------------------
--   prep             Q2114906     prepositional case (a grammatical case)
--   pep              Q43306119    "Pep", a male given name
--   trauma           Q193078      injury — "physiological wound caused by an
--                                 external source"
--   fertility        Q15724525    Fertility and Sterility (scientific journal)
--   vascular-health  Q7916443     Vascular Health and Risk Management (journal)
--   aids-education   Q15734526    AIDS Education and Prevention (journal)
--
-- `pcp` was checked with them and is CORRECT — Q407324 is phencyclidine, the
-- drug the tag describes. Only its three Portuguese-Communist-Party aliases are
-- residue from an earlier identifier. It is repaired here for its aliases, not
-- its QID.
--
-- WHY A WRONG IDENTIFIER IS NOT COSMETIC ONCE THE PROSE IS FIXED
--
-- `wikidata_id` is an INPUT to two weekly jobs and one public rail:
--   * tag_medical_codes_sync  (cron `tag_medical_codes_sync`, Mondays 05:30)
--   * tag_wikidata_hierarchy  (cron `tag_wikidata_hierarchy`, Mondays 05:00)
--   * the "Elsewhere" card on /tags/:slug, which links the item directly.
-- So a corrected paragraph sitting above an uncorrected identifier does not
-- settle: the derived layers keep regenerating from the wrong entity. This is
-- the same class as the 86 safety_notes that described another country's law —
-- a derived field outliving the input it was derived from.
--
-- The measured damage is on `trauma`. Its own description reads "A distressing
-- event or experience that overwhelms a person's ability to cope and may have
-- lasting emotional and psychological effects" — and the page publishes a
-- Diagnostic codes band of SEVEN clinical codes for physical wounds, pulled
-- from Q193078:
--     ICD-10    T79      early complications of trauma
--     ICD-10-CM S00.T98  the injury/poisoning chapter range
--     ICD-9     957      injury to other and unspecified nerves
--     ICD-9     900      injury to blood vessels of head and neck
--     ICD-11    NF2Z     injury, unspecified
--     ICPC-2    A80      trauma/injury NOS
--     DiseasesDB 28858
-- `last_seen_at` on all seven is 2026-08-24, i.e. the sync is still refreshing
-- them. The tag has 50 uses, and on this platform `trauma` is overwhelmingly
-- the psychological sense.
--
-- Measured and found CLEAN, so not touched here: tag_relations carries no edge
-- derived from any of these six wrong identifiers (the only edges on them are
-- `hiv related prep`, `pcp broader dissociatives` and `self-harm broader
-- trauma`), and no tag other than `trauma` carries a wikidata-sourced medical
-- code.
--
-- THE REPLACEMENT IDENTIFIERS, AND WHERE A NULL IS CHOSEN INSTEAD
--
--   prep       -> Q7239230  pre-exposure prophylaxis against HIV   (32 sitelinks)
--   pep        -> Q1361206  post-exposure prophylaxis              (16 sitelinks)
--   trauma     -> Q654426   psychological trauma                   (56 sitelinks)
--   fertility  -> Q964401   fertility, natural capability to produce offspring
--   vascular-health  -> NULL
--   aids-education   -> NULL
--
-- `pep` deliberately takes the GENERAL item, not the HIV-specific Q52596622.
-- That item was measured too: 5 sitelinks, no P31, no code properties — a stub
-- that would contribute nothing to the hierarchy job and is a merge candidate
-- upstream. Q1361206 is unambiguously correct for a tag named "PEP" and the
-- HIV scope is carried by our own prose. `prep` takes the HIV-specific item
-- because that one IS well populated (P31 present, 32 sitelinks).
--
-- The last two get NULL rather than a guess. Wikidata has no item for "vascular
-- health" or "AIDS education" as concepts — searching returns the journals that
-- are already stored. A null is recoverable and shows no "Elsewhere" link; a
-- plausible-but-wrong QID regenerates wrong codes every Monday. Same rule the
-- city classifier follows: block rather than guess.
--
-- After this runs, the Monday sync re-derives trauma's codes from Q654426,
-- which carries ICPC-2 P82 (post-traumatic stress disorder). That is a sourced
-- code for the concept the tag actually describes. The seven injury codes are
-- deleted here rather than left to the sync's own retraction branch, because
-- they are live on a public health page now and the cron is up to seven days
-- away.

set local statement_timeout = '600s';

-- log_unified_tag_change() raises when a system actor modifies a human_reviewed
-- row outside the derived-column allowlist, and prep/pep/pcp are human_reviewed.
select set_config('app.actor', 'migration:wrong_entity_wikidata_repair', true);

do $mig$
declare
  r record;
  v_alias_deleted int := 0;
  v_qid_fixed     int := 0;
  v_codes_deleted int := 0;
begin
  -- ---------------------------------------------------------------- 1. QIDs
  -- One statement per row: a set-based UPDATE that touches a unified_tags tuple
  -- more than once raises 27000 through the category sync trigger pair, and
  -- per-row keeps the counters honest.
  create temp table _qid (slug text primary key, new_qid text, old_qid text) on commit drop;
  insert into _qid (slug, new_qid, old_qid) values
    ('prep',            'Q7239230',  'Q2114906'),
    ('pep',             'Q1361206',  'Q43306119'),
    ('trauma',          'Q654426',   'Q193078'),
    ('fertility',       'Q964401',   'Q15724525'),
    ('vascular-health',  null,       'Q7916443'),
    ('aids-education',   null,       'Q15734526');

  for r in select * from _qid loop
    -- Guarded on the OLD value. If the identifier has already been corrected by
    -- someone else, this is a no-op rather than a silent overwrite of their work.
    update public.unified_tags
       set wikidata_id = r.new_qid,
           updated_at  = now()
     where slug = r.slug
       and wikidata_id is not distinct from r.old_qid;
    if found then
      v_qid_fixed := v_qid_fixed + 1;
    else
      raise notice 'wikidata_id on % was not %, left alone', r.slug, r.old_qid;
    end if;
  end loop;

  -- ------------------------------------------------------- 2. residue aliases
  -- Deleted by EXACT alias_slug, listed rather than pattern-matched. A pattern
  -- over a multilingual alias set is how a correct alias gets caught in a
  -- cleanup: `prépositif` and `PrEP (Pre-Exposure Prophylaxis)` differ by
  -- meaning, not by shape.
  --
  -- These are all review_status='auto', so they are NOT live for auto-tagging
  -- (run_tag_assignment_reconcile trusts only 'approved' since 20260910151200)
  -- and have NOT reached search_synonyms (verified: zero matching rows). They
  -- are latent, not active — but they are one bulk-approve away from being live,
  -- and they are visible in the admin alias editor as if they were meaningful.
  create temp table _bad_alias (tag_slug text, alias_slug text) on commit drop;
  insert into _bad_alias (tag_slug, alias_slug) values
    -- prep: the prepositional case, in four languages
    ('prep', 'analytische-flexion'),
    ('prep', 'analytischer-kasus'),
    ('prep', 'caso-analitico'),
    ('prep', 'caso-analtico'),
    ('prep', 'caso-postposicional'),
    ('prep', 'caso-preposicional'),
    ('prep', 'preposicional'),
    ('prep', 'prepositionnel'),
    ('prep', 'prpositif'),
    ('prep', 'prpositionalkasus'),
    ('prep', 'prpositionnel'),
    ('prep', 'prpositiv'),
    -- trauma: physical injury
    ('trauma', 'barytrauma'),
    ('trauma', 'blessure'),
    ('trauma', 'gewebezerstrung'),
    ('trauma', 'monotrauma'),
    ('trauma', 'shock-traumtico'),
    ('trauma', 'trauma-fsico'),
    ('trauma', 'traumatisme'),
    ('trauma', 'traumatismo'),
    ('trauma', 'verwundeter'),
    ('trauma', 'verwundung'),
    ('trauma', 'vorstzliche-krperverletzung'),
    -- pcp: the Portuguese Communist Party
    ('pcp', 'parti-communiste-portugais'),
    ('pcp', 'partido-comunista-portugues'),
    ('pcp', 'partido-comunista-portugus'),
    -- journal titles
    ('fertility',       'fertility-and-sterility'),
    ('vascular-health', 'vascular-health-and-risk-management'),
    ('aids-education',  'aids-education-and-prevention');

  for r in select b.tag_slug, b.alias_slug from _bad_alias b loop
    delete from public.tag_aliases a
     using public.unified_tags u
     where a.canonical_tag_id = u.id
       and u.slug = r.tag_slug
       and a.alias_slug = r.alias_slug;
    if found then v_alias_deleted := v_alias_deleted + 1; end if;
  end loop;

  -- --------------------------------------------- 3. codes for the wrong body
  -- Scoped to source='wikidata' so an editorial row (source='editorial', which
  -- the sync never deletes) could not be removed by this.
  delete from public.tag_medical_codes m
   using public.unified_tags u
   where m.tag_id = u.id
     and u.slug = 'trauma'
     and m.source = 'wikidata';
  get diagnostics v_codes_deleted = row_count;

  raise notice 'wikidata_id corrected: %, aliases deleted: %, medical codes deleted: %',
    v_qid_fixed, v_alias_deleted, v_codes_deleted;
end $mig$;

-- Asserts ONLY what this migration changed. A guard that covers rows a LATER
-- migration repairs reports the migration ORDER as a defect (20260828, ketamine).
do $verify$
declare
  v_bad int;
  v_qid text;
begin
  -- Every corrected identifier is what we set it to.
  select count(*) into v_bad
  from public.unified_tags
  where (slug = 'prep'      and wikidata_id is distinct from 'Q7239230')
     or (slug = 'pep'       and wikidata_id is distinct from 'Q1361206')
     or (slug = 'trauma'    and wikidata_id is distinct from 'Q654426')
     or (slug = 'fertility' and wikidata_id is distinct from 'Q964401')
     or (slug in ('vascular-health','aids-education') and wikidata_id is not null);
  if v_bad > 0 then
    raise exception 'wrong-entity repair: % tag(s) did not take the corrected wikidata_id', v_bad;
  end if;

  -- None of the six carries a wrong-entity QID any more. Stated as the OLD
  -- values explicitly, so a future re-resolution that happens to land back on
  -- one of them fails loudly.
  select count(*) into v_bad
  from public.unified_tags
  where wikidata_id in ('Q2114906','Q43306119','Q193078','Q15724525','Q7916443','Q15734526');
  if v_bad > 0 then
    raise exception 'wrong-entity repair: % tag(s) still point at a known-wrong QID', v_bad;
  end if;

  -- The residue aliases are gone, and the correct ones survived. Both halves
  -- matter: a cleanup that also removed `PrEP (Pre-Exposure Prophylaxis)` or
  -- `Phencyclidine` would pass a "no grammar aliases" check while doing damage.
  select count(*) into v_bad
  from public.tag_aliases a join public.unified_tags u on u.id = a.canonical_tag_id
  where a.alias_slug in (
    'caso-preposicional','prpositiv','analytische-flexion','prpositionalkasus',
    'traumatisme','verwundung','barytrauma','monotrauma',
    'parti-communiste-portugais','partido-comunista-portugus',
    'fertility-and-sterility','vascular-health-and-risk-management','aids-education-and-prevention'
  );
  if v_bad > 0 then
    raise exception 'wrong-entity repair: % residue alias(es) survived', v_bad;
  end if;

  if not exists (
    select 1 from public.tag_aliases a join public.unified_tags u on u.id = a.canonical_tag_id
    where u.slug = 'pcp' and a.alias_slug = 'phencyclidine'
  ) then
    raise exception 'wrong-entity repair: deleted pcp''s correct alias `phencyclidine`';
  end if;
  if not exists (
    select 1 from public.tag_aliases a join public.unified_tags u on u.id = a.canonical_tag_id
    where u.slug = 'prep' and a.alias_slug = 'prep-pre-exposure-prophylaxis'
  ) then
    raise exception 'wrong-entity repair: deleted prep''s correct expansion alias';
  end if;

  -- No injury codes remain on the psychological-trauma page.
  select count(*) into v_bad
  from public.tag_medical_codes m join public.unified_tags u on u.id = m.tag_id
  where u.slug = 'trauma';
  if v_bad > 0 then
    raise exception 'wrong-entity repair: % medical code(s) still on trauma', v_bad;
  end if;

  -- The prose the 2026-08-28 audit wrote is still in place. Matching the tag's
  -- CURRENT meaning, not the old claim: a correction that quotes what it denies
  -- would trip a bare pattern on the old wording.
  select description into v_qid from public.unified_tags where slug = 'trauma';
  if v_qid is null or v_qid !~* 'psychological' then
    raise exception 'wrong-entity repair: trauma no longer describes the psychological sense';
  end if;
end $verify$;

comment on column public.unified_tags.wikidata_id is
  'Wikidata QID. INPUT to tag_medical_codes_sync and tag_wikidata_hierarchy (both weekly) '
  'and to the public "Elsewhere" rail — a wrong value regenerates wrong derived data every '
  'week, so correct it whenever the prose above it is corrected. Prefer NULL to a guess. '
  'See 20261007163000_wrong_entity_wikidata_repair.sql.';
